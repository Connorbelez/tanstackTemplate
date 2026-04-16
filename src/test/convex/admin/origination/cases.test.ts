import { describe, expect, it } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import * as originationCasesModule from "../../../../../convex/admin/origination/cases";
import { createTestConvex, ensureSeededIdentity } from "../../../auth/helpers";
import { FAIRLEND_ADMIN, MEMBER } from "../../../auth/identities";

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
	it("does not expose a public phase-1 status mutation", () => {
		expect("updateCaseStatus" in originationCasesModule).toBe(false);
	});

	it("creates a draft case without touching canonical domain rows", async () => {
		const t = createTestConvex();
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
		expect(created?.validationSnapshot?.stepErrors?.participants).toContain(
			"Primary borrower full name is required."
		);
		expect(after).toEqual(before);
	});

	it("patches staged data additively and returns the recommended next step", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

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
		expect(result.validationSnapshot.stepErrors?.participants).toBeUndefined();
		expect(result.validationSnapshot.stepErrors?.property).toBeUndefined();
	});

	it("restores the saved step while also returning the recommended next step", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

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
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

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

	it("reuses the same draft when createCase receives the same bootstrap token", async () => {
		const t = createTestConvex();
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
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

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
		const t = createTestConvex();
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

	it("rejects callers without mortgage:originate", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, MEMBER);

		await expect(
			t.withIdentity(MEMBER).mutation(api.admin.origination.cases.createCase, {})
		).rejects.toThrow('Forbidden: permission "mortgage:originate" required');
	});
});
