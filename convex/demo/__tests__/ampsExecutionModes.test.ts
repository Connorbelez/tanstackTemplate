import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import {
	seedBorrowerProfile,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "../../../src/test/convex/payments/helpers";
import { api } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";

const ADMIN_IDENTITY = {
	subject: "test-amps-execution-modes-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([
		"payment:view",
		"payment:manage",
		"payment:retry",
		"payment:cancel",
	]),
	user_email: "amps-execution-modes-admin@fairlend.ca",
	user_first_name: "AMPS",
	user_last_name: "Execution Modes",
};

function createHarness() {
	const previousGtHashchain = process.env.DISABLE_GT_HASHCHAIN;
	const previousCashLedgerHashchain = process.env.DISABLE_CASH_LEDGER_HASHCHAIN;
	process.env.DISABLE_GT_HASHCHAIN = "true";
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, convexModules);
	auditLogTest.register(t, "auditLog");
	return {
		t,
		restoreEnv() {
			if (previousGtHashchain === undefined) {
				process.env.DISABLE_GT_HASHCHAIN = undefined;
			} else {
				process.env.DISABLE_GT_HASHCHAIN = previousGtHashchain;
			}

			if (previousCashLedgerHashchain === undefined) {
				process.env.DISABLE_CASH_LEDGER_HASHCHAIN = undefined;
			} else {
				process.env.DISABLE_CASH_LEDGER_HASHCHAIN = previousCashLedgerHashchain;
			}
		},
	};
}

describe("demo.ampsExecutionModes", () => {
	it("advances an app-owned manual-review mortgage and lets the admin confirm the receipt", async () => {
		vi.useFakeTimers();
		const { restoreEnv, t } = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);

		try {
			await admin.action(
				api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace,
				{
					executionMode: "app_owned",
					paymentRail: "manual_review",
				}
			);

			let workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(workspace?.workspace.executionMode).toBe("app_owned");
			expect(workspace?.workspace.paymentRail).toBe("manual_review");
			expect(workspace?.schedule).toBeNull();
			expect(workspace?.installments).toHaveLength(12);
			expect(workspace?.installments[0]?.planEntry?.status).toBe("planned");

			await admin.action(
				api.demo.ampsExecutionModes.advanceCollectionExecutionMonth,
				{}
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(workspace?.workspace.currentMonthIndex).toBe(1);
			expect(workspace?.pendingManualTransfer).not.toBeNull();
			expect(workspace?.installments[0]?.attempt?.status).toBe("pending");
			expect(workspace?.installments[0]?.attempt?.transfer?.providerCode).toBe(
				"manual_review"
			);
			expect(workspace?.installments[0]?.attempt?.transfer?.status).toBe(
				"pending"
			);

			await admin.action(
				api.demo.ampsExecutionModes.confirmPendingManualReviewTransfer,
				{}
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(workspace?.pendingManualTransfer).toBeNull();
			expect(workspace?.installments[0]?.obligation?.status).toBe("settled");
			expect(workspace?.installments[0]?.attempt?.status).toBe("confirmed");
			expect(workspace?.installments[0]?.attempt?.transfer?.status).toBe(
				"confirmed"
			);
		} finally {
			vi.useRealTimers();
			restoreEnv();
		}
	});

	it("mirrors a provider-managed decline through the demo poller fallback path", async () => {
		vi.useFakeTimers();
		const { restoreEnv, t } = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);

		try {
			await admin.action(
				api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace,
				{
					executionMode: "provider_managed",
					paymentRail: "pad_rotessa",
				}
			);

			let workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(workspace?.workspace.executionMode).toBe("provider_managed");
			expect(workspace?.schedule).not.toBeNull();
			expect(workspace?.installments).toHaveLength(12);
			expect(workspace?.installments[0]?.providerOccurrence?.status).toBe(
				"Future"
			);

			await admin.action(
				api.demo.ampsExecutionModes.advanceCollectionExecutionMonth,
				{
					outcome: "Declined",
					providerChannel: "poller",
				}
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(workspace?.workspace.currentMonthIndex).toBe(1);
			expect(workspace?.installments[0]?.providerOccurrence?.status).toBe(
				"Declined"
			);
			expect(
				workspace?.installments[0]?.providerOccurrence?.lastDeliveredVia
			).toBe("poller");
			expect(workspace?.installments[0]?.providerOccurrence?.statusReason).toBe(
				"NSF"
			);
			expect(workspace?.schedule?.lastProviderScheduleStatus).toBe("Declined");

			const firstPlanEntryId =
				workspace?.installments[0]?.planEntry?.planEntryId;
			expect(firstPlanEntryId).toBeTruthy();

			const attempt = await t.run(async (ctx) => {
				const attempts = await ctx.db.query("collectionAttempts").collect();
				return attempts.find(
					(entry) => entry.planEntryId === firstPlanEntryId
				) as Doc<"collectionAttempts"> | undefined;
			});

			expect(attempt?.triggerSource).toBe("provider_poller");
			expect(attempt?.providerLifecycleStatus).toBe("Declined");
			expect(attempt?.providerLifecycleReason).toBe("NSF");
			expect(attempt?.status).toBe("retry_scheduled");
		} finally {
			vi.useRealTimers();
			restoreEnv();
		}
	});

	it("does not advance the workspace month when provider-managed processing fails", async () => {
		vi.useFakeTimers();
		const { restoreEnv, t } = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);

		try {
			await admin.action(
				api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace,
				{
					executionMode: "provider_managed",
					paymentRail: "pad_rotessa",
				}
			);

			const workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			const scheduleId = workspace?.schedule?.scheduleId;
			expect(scheduleId).toBeTruthy();

			await t.run(async (ctx) => {
				if (!scheduleId) {
					throw new Error("expected provider-managed demo schedule");
				}
				await ctx.db.patch(scheduleId, {
					externalScheduleRef: undefined,
				});
			});

			await expect(
				admin.action(
					api.demo.ampsExecutionModes.advanceCollectionExecutionMonth,
					{}
				)
			).rejects.toThrow("missing externalScheduleRef");

			const unchangedWorkspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(unchangedWorkspace?.workspace.currentMonthIndex).toBe(0);
		} finally {
			vi.useRealTimers();
			restoreEnv();
		}
	});

	it("decommissions the prior provider-managed schedule before reseeding the workspace", async () => {
		vi.useFakeTimers();
		const { restoreEnv, t } = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);

		try {
			await admin.action(
				api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace,
				{
					executionMode: "provider_managed",
					paymentRail: "pad_rotessa",
				}
			);

			const originalWorkspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			const originalScheduleId =
				originalWorkspace?.schedule?.scheduleId ?? null;
			const originalMortgageId = originalWorkspace?.mortgage.mortgageId ?? null;
			expect(originalScheduleId).not.toBeNull();
			expect(originalMortgageId).not.toBeNull();

			await admin.action(
				api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace,
				{
					executionMode: "app_owned",
					paymentRail: "manual",
				}
			);

			const nextWorkspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			expect(nextWorkspace?.workspace.executionMode).toBe("app_owned");
			expect(nextWorkspace?.schedule).toBeNull();

			const [priorSchedule, priorMortgagePlanEntries, priorMortgage] =
				await Promise.all([
					t.run((ctx) =>
						originalScheduleId
							? ctx.db.get(originalScheduleId)
							: Promise.resolve(null)
					),
					t.run(async (ctx) => {
						if (!originalMortgageId) {
							return [];
						}

						const entries = await ctx.db
							.query("collectionPlanEntries")
							.collect();
						return entries.filter(
							(entry) => entry.mortgageId === originalMortgageId
						);
					}),
					t.run((ctx) =>
						originalMortgageId
							? ctx.db.get(originalMortgageId)
							: Promise.resolve(null)
					),
				]);

			expect(priorSchedule?.status).toBe("cancelled");
			expect(priorSchedule?.nextPollAt).toBeUndefined();
			expect(priorMortgagePlanEntries).toHaveLength(12);
			expect(
				priorMortgagePlanEntries.every((entry) => entry.status === "cancelled")
			).toBe(true);
			expect(priorMortgage?.activeExternalCollectionScheduleId).toBeUndefined();
		} finally {
			vi.useRealTimers();
			restoreEnv();
		}
	});

	it("advances only the workspace mortgage when using the app-owned runner path", async () => {
		vi.useFakeTimers();
		const { restoreEnv, t } = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);

		try {
			await admin.action(
				api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace,
				{
					executionMode: "app_owned",
					paymentRail: "manual",
				}
			);

			const workspace = await admin.query(
				api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
				{}
			);
			const dueDate =
				workspace?.installments[0]?.scheduledDate ?? Date.now() + 60_000;
			const borrowerId = await seedBorrowerProfile(t);
			const mortgageId = await seedMortgage(t);
			const obligationId = await seedObligation(t, mortgageId, borrowerId, {
				status: "due",
			});
			const unrelatedPlanEntryId = await seedPlanEntry(t, {
				obligationIds: [obligationId],
				amount: 300_000,
				executionMode: "app_owned",
				method: "manual",
				scheduledDate: dueDate - 60_000,
				status: "planned",
			});

			await admin.action(
				api.demo.ampsExecutionModes.advanceCollectionExecutionMonth,
				{}
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const unrelatedPlanEntry = await t.run((ctx) =>
				ctx.db.get(unrelatedPlanEntryId)
			);
			expect(unrelatedPlanEntry?.status).toBe("planned");
		} finally {
			vi.useRealTimers();
			restoreEnv();
		}
	});
});
