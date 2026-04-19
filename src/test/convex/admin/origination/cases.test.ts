import { describe, expect, it } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../../convex/constants";
import * as originationCasesModule from "../../../../../convex/admin/origination/cases";
import {
	createMockViewer,
	createTestConvex,
	ensureSeededIdentity,
} from "../../../auth/helpers";
import { FAIRLEND_ADMIN, MEMBER } from "../../../auth/identities";
import { lookupPermissions } from "../../../auth/permissions";

async function seedBrokerRecord(t: ReturnType<typeof createTestConvex>) {
	const brokerIdentity = createMockViewer({
		email: "broker.origination@test.fairlend.ca",
		firstName: "Case",
		lastName: "Broker",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["broker"],
		subject: "user_origination_cases_broker",
	});
	const userId = await ensureSeededIdentity(t, brokerIdentity);

	return t.run(async (ctx) => {
		const existingBroker = await ctx.db
			.query("brokers")
			.withIndex("by_user", (query) => query.eq("userId", userId))
			.unique();
		if (existingBroker) {
			return existingBroker._id;
		}

		const now = Date.now();
		return ctx.db.insert("brokers", {
			createdAt: now,
			lastTransitionAt: now,
			onboardedAt: now,
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId,
		});
	});
}

async function countCanonicalRows(t: ReturnType<typeof createTestConvex>) {
	return await t.run(async (ctx) => {
		const [borrowers, properties, mortgages, listings] = await Promise.all([
			ctx.db.query("borrowers").collect(),
			ctx.db.query("properties").collect(),
			ctx.db.query("mortgages").collect(),
			ctx.db.query("listings").collect(),
		]);

		return {
			borrowers: borrowers.length,
			properties: properties.length,
			mortgages: mortgages.length,
			listings: listings.length,
		};
	});
}

describe("admin origination cases", () => {
	const adminWithoutOrg = createMockViewer({
		roles: ["admin"],
		permissions: lookupPermissions(["admin"]),
		subject: "user_admin_without_org_test",
		email: "admin-without-org@test.fairlend.ca",
		firstName: "Orgless",
		lastName: "Admin",
	});

	it("does not expose a public phase-1 status mutation", () => {
		expect("updateCaseStatus" in originationCasesModule).toBe(false);
	});

	it("creates a draft case without touching canonical domain rows", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const before = await countCanonicalRows(t);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		const created = await t.run(async (ctx) => ctx.db.get(caseId));
		const after = await countCanonicalRows(t);

		expect(created?.status).toBe("draft");
		expect(created?.currentStep).toBe("participants");
		expect(created?.lastCommitError).toBeUndefined();
		expect(created?.failedAt).toBeUndefined();
		expect(created?.validationSnapshot?.stepErrors?.participants).toContain(
			"Primary borrower full name is required."
		);
		expect(after).toEqual(before);
	});

	it("patches staged data additively and returns the recommended next step", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.patchCase,
			{
				caseId,
				patch: {
					currentStep: "review",
					participantsDraft: {
						brokerOfRecordId,
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
				},
			}
		);

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.patchCase,
			{
				caseId,
				patch: {
					currentStep: "review",
					propertyDraft: {
						create: {
							city: "Toronto",
							postalCode: "M5H 1J9",
							propertyType: "residential",
							province: "ON",
							streetAddress: "123 King St W",
						},
					},
					valuationDraft: {
						valueAsIs: 425_000,
					},
				},
			}
		);

		expect(result.participantsDraft?.primaryBorrower?.email).toBe(
			"ada@example.com"
		);
		expect(result.recommendedStep).toBe("mortgageTerms");
		expect(result.status).toBe("draft");
		expect(result.validationSnapshot.stepErrors?.participants).toBeUndefined();
		expect(result.validationSnapshot.stepErrors?.property).toBeUndefined();
	});

	it("moves a complete draft into ready_to_commit and clears failed commit metadata on edit", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.run(async (ctx) => {
			await ctx.db.patch(caseId, {
				failedAt: Date.now(),
				lastCommitError: "Previous commit attempt failed.",
				status: "failed",
			});
		});

		const updated = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.patchCase,
			{
				caseId,
				patch: {
					currentStep: "review",
					participantsDraft: {
						brokerOfRecordId,
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
					propertyDraft: {
						create: {
							city: "Toronto",
							postalCode: "M5H 1J9",
							propertyType: "residential",
							province: "ON",
							streetAddress: "123 King St W",
						},
					},
					valuationDraft: {
						valueAsIs: 425_000,
					},
					mortgageDraft: {
						amortizationMonths: 300,
						firstPaymentDate: "2026-06-01",
						interestAdjustmentDate: "2026-05-01",
						interestRate: 9.5,
						lienPosition: 1,
						loanType: "conventional",
						maturityDate: "2027-04-30",
						paymentAmount: 2_450,
						paymentFrequency: "monthly",
						principal: 250_000,
						rateType: "fixed",
						termMonths: 12,
						termStartDate: "2026-05-01",
					},
				},
			}
		);

		expect(updated.status).toBe("ready_to_commit");
		expect(updated.failedAt).toBeUndefined();
		expect(updated.lastCommitError).toBeUndefined();
	});

	it("restores the saved step while also returning the recommended next step", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.patchCase,
			{
				caseId,
				patch: {
					currentStep: "review",
					participantsDraft: {
						brokerOfRecordId,
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
				},
			}
		);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.admin.origination.cases.getCase, { caseId });

		expect(result).toMatchObject({
			_id: caseId,
			currentStep: "review",
			label: "Ada Lovelace",
			recommendedStep: "property",
			status: "draft",
		});
	});

	it("lists case summaries with the exact last saved step", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.patchCase,
			{
				caseId,
				patch: {
					currentStep: "review",
					participantsDraft: {
						brokerOfRecordId,
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
				},
			}
		);

		const summaries = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.admin.origination.cases.listCases, {});
		const summary = summaries.find((entry) => entry.caseId === caseId);

		expect(summary).toMatchObject({
			caseId,
			label: "Ada Lovelace",
			currentStep: "review",
			hasValidationErrors: true,
			primaryBorrowerName: "Ada Lovelace",
			status: "draft",
		});
	});

	it("rejects non-staff callers without org context from origination case access", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		await ensureSeededIdentity(t, adminWithoutOrg);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await expect(
			t.withIdentity(adminWithoutOrg).query(
				api.admin.origination.cases.listCases,
				{}
			)
		).rejects.toThrow("Forbidden: origination case access requires org context");

		await expect(
			t.withIdentity(adminWithoutOrg).query(api.admin.origination.cases.getCase, {
				caseId,
			})
		).rejects.toThrow("Forbidden: origination case access requires org context");

		await expect(
			t.withIdentity(adminWithoutOrg).mutation(
				api.admin.origination.cases.patchCase,
				{
					caseId,
					patch: {
						currentStep: "participants",
					},
				}
			)
		).rejects.toThrow("Forbidden: origination case access requires org context");

		await expect(
			t.withIdentity(adminWithoutOrg).mutation(
				api.admin.origination.cases.createCase,
				{}
			)
		).rejects.toThrow("Forbidden: origination case access requires org context");
	});

	it("reuses the same draft when createCase receives the same bootstrap token", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

		const [firstCaseId, secondCaseId] = await Promise.all([
			t
				.withIdentity(FAIRLEND_ADMIN)
				.mutation(api.admin.origination.cases.createCase, {
					bootstrapToken: "bootstrap-origination-1",
				}),
			t
				.withIdentity(FAIRLEND_ADMIN)
				.mutation(api.admin.origination.cases.createCase, {
					bootstrapToken: "bootstrap-origination-1",
				}),
		]);

		const storedCases = await t.run(async (ctx) =>
			ctx.db.query("adminOriginationCases").collect()
		);

		expect(secondCaseId).toBe(firstCaseId);
		expect(
			storedCases.filter(
				(entry) => entry.bootstrapToken === "bootstrap-origination-1"
			)
		).toHaveLength(1);
	});

	it("preserves later-phase validation metadata when phase-1 autosave recomputes the snapshot", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.run(async (ctx) => {
			await ctx.db.patch(caseId, {
				validationSnapshot: {
					reviewWarnings: [
						"Upload title review package before enabling downstream commit checks.",
					],
					stepErrors: {
						documents: ["Title review package is required."],
						participants: ["Stale participant validation that should be replaced."],
					},
				},
			});
		});

		const updated = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.patchCase,
			{
				caseId,
				patch: {
					participantsDraft: {
						brokerOfRecordId,
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
				},
			}
		);

		expect(updated.validationSnapshot.stepErrors?.participants).toBeUndefined();
		expect(updated.validationSnapshot.stepErrors?.documents).toEqual([
			"Title review package is required.",
		]);
		expect(updated.validationSnapshot.reviewWarnings).toContain(
			"Upload title review package before enabling downstream commit checks."
		);
	});

	it("deletes draft cases and their document placeholders", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.run(async (ctx) => {
			await ctx.db.insert("originationCaseDocumentDrafts", {
				caseId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.deleteCase,
			{ caseId }
		);

		const deleted = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const documentDrafts = await ctx.db
				.query("originationCaseDocumentDrafts")
				.withIndex("by_case", (query) => query.eq("caseId", caseId))
				.collect();
			return { caseRecord, documentDrafts };
		});

		expect(deleted.caseRecord).toBeNull();
		expect(deleted.documentDrafts).toHaveLength(0);
	});

	it("rejects patch and delete once a case is committed", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.run(async (ctx) => {
			await ctx.db.patch(caseId, {
				status: "committed",
			});
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(
				api.admin.origination.cases.patchCase,
				{
					caseId,
					patch: {
						currentStep: "review",
					},
				}
			)
		).rejects.toThrow("immutable");

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(
				api.admin.origination.cases.deleteCase,
				{ caseId }
			)
		).rejects.toThrow("immutable");
	});

	it("rejects callers without mortgage:originate", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, MEMBER);

		await expect(
			t.withIdentity(MEMBER).mutation(api.admin.origination.cases.createCase, {})
		).rejects.toThrow('Forbidden: permission "mortgage:originate" required');
	});
});
