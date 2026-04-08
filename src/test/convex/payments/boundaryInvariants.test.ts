import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { postObligationAccrued } from "../../../../convex/payments/cashLedger/integrations";
import { FAIRLEND_ADMIN } from "../../auth/identities";
import { getAuditJournalForEntity } from "../engine/helpers";
import {
	buildEffectArgs,
	createGovernedTestConvex,
	drainScheduledWork,
	ensureActivePositionForMortgage,
	fireTransition,
	seedBorrowerProfile,
	seedCollectionAttempt,
	seedCollectionRules,
	seedDefaultGovernedActors,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "./helpers";

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

process.env.DISABLE_GT_HASHCHAIN = "true";
process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";

if (!globalThis.crypto) {
	vi.stubGlobal("crypto", webcrypto);
}

/**
 * Backend boundary regressions for page 14.
 * Spec: https://www.notion.so/337fc1b440248188a5cbf191c15cb468
 *
 * Use Cases covered:
 * - UC-1: Obligation Overdue Drives Mortgage Delinquency
 * - UC-2: Strategy Changes Do Not Directly Mutate Mortgage State
 * - UC-3: Confirmed Money Posts Cash Meaning Without Strategy Awareness
 * - UC-4: Workout Strategy Preserves Lifecycle Boundaries
 *
 * Requirements covered:
 * - REQ-1: Mortgage lifecycle stays obligation-driven only.
 * - REQ-2: Collection Plan and Collection Attempt do not directly drive mortgage state.
 * - REQ-3: Ownership-ledger logic stays strategy-agnostic.
 * - REQ-4: Borrower cash posting stays in the cash-ledger integration layer.
 * - REQ-5: AMPS does not absorb transfer lifecycle ownership.
 * - REQ-6: Workout and reschedule do not introduce hidden lifecycle shortcuts.
 * - REQ-8: Boundary preservation is tested.
 */

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

async function seedMortgageFixture(t: GovernedTestConvex) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t, {
		status: "active",
		machineContext: { missedPayments: 0, lastPaymentAt: 0 },
	});
	const obligationId = await seedObligation(t, mortgageId, borrowerId, {
		status: "due",
	});
	const obligation = await t.run((ctx) => ctx.db.get(obligationId));
	if (!obligation) {
		throw new Error("Expected seeded obligation");
	}
	return { borrowerId, mortgageId, obligation, obligationId };
}

async function getMortgageTransitions(
	t: GovernedTestConvex,
	mortgageId: Id<"mortgages">
) {
	return getAuditJournalForEntity(t, "mortgage", `${mortgageId}`);
}

describe("page 14 boundary invariants", () => {
	it("keeps mortgage delinquency and cure obligation-driven", async () => {
		const t = createBackendTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligation, obligationId } =
			await seedMortgageFixture(t);
		await ensureActivePositionForMortgage(t, { mortgageId });

		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: { actorType: "system", channel: "scheduler" },
			});
		});

		const overdue = await fireTransition(
			t,
			"obligation",
			obligationId,
			"GRACE_PERIOD_EXPIRED",
			{}
		);
		expect(overdue.success).toBe(true);
		await drainScheduledWork(t);

		let mortgage = await t.run((ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("delinquent");

		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount: obligation.amount,
			method: "manual",
			scheduledDate: Date.now() + 86_400_000,
			status: "planned",
			source: "default_schedule",
		});
		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount: obligation.amount,
		});

		const settled = await fireTransition(
			t,
			"obligation",
			obligationId,
			"PAYMENT_APPLIED",
			{
				amount: obligation.amount,
				attemptId,
				currentAmountSettled: 0,
				totalAmount: obligation.amount,
			}
		);
		expect(settled.success).toBe(true);
		await drainScheduledWork(t);

		mortgage = await t.run((ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");

		const mortgageTransitions = await getMortgageTransitions(t, mortgageId);
		expect(
			mortgageTransitions
				.filter((entry) => entry.outcome === "transitioned")
				.map((entry) => entry.eventType)
		).toEqual(["OBLIGATION_OVERDUE", "PAYMENT_CONFIRMED"]);
	});

	it("keeps reschedule and attempt failure strategy-only for mortgage lifecycle", async () => {
		const t = createBackendTestConvex();
		await seedDefaultGovernedActors(t);
		await seedCollectionRules(t);
		const asOf = new Date("2026-04-06T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { mortgageId, obligation, obligationId } =
			await seedMortgageFixture(t);

		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount: obligation.amount,
			method: "manual",
			scheduledDate: asOf + 5 * 86_400_000,
			status: "planned",
			source: "default_schedule",
		});

		const reschedule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId,
				newScheduledDate: asOf + 7 * 86_400_000,
				reason: "Boundary check reschedule",
			});
		expect(reschedule.outcome).toBe("rescheduled");

		const replacementPlanEntryId =
			reschedule.outcome === "rescheduled"
				? reschedule.replacementPlanEntryId
				: undefined;
		if (!replacementPlanEntryId) {
			throw new Error("Expected replacement plan entry");
		}

		const attemptId = await seedCollectionAttempt(t, {
			planEntryId: replacementPlanEntryId,
			method: "manual",
			amount: obligation.amount,
		});

		const initiated = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_INITIATED"
		);
		expect(initiated.success).toBe(true);

		const failed = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_FAILED",
			{ code: "NSF", reason: "insufficient_funds" }
		);
		expect(failed.success).toBe(true);

		const terminal = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"MAX_RETRIES_EXCEEDED",
			{}
		);
		expect(terminal.success).toBe(true);
		await drainScheduledWork(t);

		const mortgage = await t.run((ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");

		const mortgageTransitions = await getMortgageTransitions(t, mortgageId);
		expect(
			mortgageTransitions.filter((entry) => entry.outcome === "transitioned")
		).toHaveLength(0);
	});

	it("posts non-bridged inbound cash without requiring plan-entry or attempt metadata", async () => {
		const t = createBackendTestConvex();
		await seedDefaultGovernedActors(t);
		const { borrowerId, mortgageId, obligation, obligationId } =
			await seedMortgageFixture(t);

		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: { actorType: "system", channel: "scheduler" },
			});
		});

		const transferId = await t.run(async (ctx) =>
			ctx.db.insert("transferRequests", {
				status: "initiated",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: obligation.amount,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: `${borrowerId}`,
				providerCode: "manual",
				idempotencyKey: `page-14-transfer-${Date.now()}`,
				source: { actorType: "system", channel: "scheduler" },
				mortgageId,
				obligationId,
				borrowerId,
				createdAt: Date.now(),
				lastTransitionAt: Date.now(),
			})
		);

		await t.mutation(
			internal.engine.effects.transfer.publishTransferConfirmed,
			buildEffectArgs(
				transferId,
				"transfer",
				"publishTransferConfirmed",
				{ settledAt: Date.now() }
			)
		);

		const entries = await t.run(async (ctx) =>
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect()
		);

		expect(entries).toHaveLength(1);
		expect(entries[0]?.entryType).toBe("CASH_RECEIVED");
		expect(entries[0]?.transferRequestId).toBe(transferId);
		expect(entries[0]?.attemptId).toBeUndefined();
	});

	it("keeps workout activation as future scheduling only", async () => {
		const t = createBackendTestConvex();
		await seedDefaultGovernedActors(t);
		const asOf = new Date("2026-04-06T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationIds = await Promise.all([
			seedObligation(t, mortgageId, borrowerId, { status: "upcoming" }),
			seedObligation(t, mortgageId, borrowerId, { status: "upcoming" }),
		]);

		for (const obligationId of obligationIds) {
			await seedPlanEntry(t, {
				obligationIds: [obligationId],
				amount: 300_000,
				method: "manual",
				scheduledDate: asOf + 5 * 86_400_000,
				status: "planned",
				source: "default_schedule",
			});
		}

		const createResult = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.workout.createWorkoutPlan, {
				mortgageId,
				name: "Boundary-preserving workout",
				rationale: "Operator-managed hardship schedule",
				installments: obligationIds.map((obligationId, index) => ({
					obligationIds: [obligationId],
					scheduledDate: asOf + (index + 1) * 86_400_000,
					method: "manual",
				})),
			});
		expect(createResult.outcome).toBe("created");
		if (createResult.outcome !== "created") {
			throw new Error("Expected workout creation");
		}

		const activation = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		expect(activation.outcome).toBe("activated");

		const mortgage = await t.run((ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");

		for (const obligationId of obligationIds) {
			const obligation = await t.run((ctx) => ctx.db.get(obligationId));
			expect(obligation?.status).toBe("upcoming");
			expect(obligation?.amountSettled).toBe(0);
		}

		const mortgageTransitions = await getMortgageTransitions(t, mortgageId);
		expect(
			mortgageTransitions.filter((entry) => entry.outcome === "transitioned")
		).toHaveLength(0);
	});

	it("keeps workout exit strategy-only and restores default scheduling without posting cash or mutating lifecycle", async () => {
		const t = createBackendTestConvex();
		await seedDefaultGovernedActors(t);
		await seedCollectionRules(t);
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t, {
			status: "active",
			machineContext: { missedPayments: 0, lastPaymentAt: 0 },
		});
		const obligationIds = await Promise.all([
			seedObligation(t, mortgageId, borrowerId, { status: "due" }),
			seedObligation(t, mortgageId, borrowerId, { status: "upcoming" }),
		]);

		for (const obligationId of obligationIds) {
			await seedPlanEntry(t, {
				obligationIds: [obligationId],
				amount: 300_000,
				method: "manual",
				scheduledDate: asOf + 10 * 86_400_000,
				status: "planned",
				source: "default_schedule",
			});
		}

		const createResult = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.workout.createWorkoutPlan, {
				mortgageId,
				name: "Boundary exit workout",
				rationale: "Boundary coverage for governed workout exit",
				installments: obligationIds.map((obligationId, index) => ({
					obligationIds: [obligationId],
					scheduledDate: asOf + (index + 2) * 86_400_000,
					method: "manual",
				})),
			});
		if (createResult.outcome !== "created") {
			throw new Error("Expected workout creation");
		}

		const activation = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation");
		}

		const cashJournalBefore = await t.run(async (ctx) =>
			ctx.db.query("cash_ledger_journal_entries").collect()
		);

		const completion = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.workout.completeWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		expect(completion.outcome).toBe("completed");

		const mortgage = await t.run((ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");

		for (const obligationId of obligationIds) {
			const obligation = await t.run((ctx) => ctx.db.get(obligationId));
			expect(["due", "upcoming"]).toContain(obligation?.status);
			expect(obligation?.amountSettled).toBe(0);
		}

		const restoredEntries = await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_status", (q) => q.eq("status", "planned"))
				.collect();
			return entries.filter(
				(entry) =>
					entry.source === "default_schedule" &&
					entry.workoutPlanId === undefined &&
					entry.obligationIds.some((obligationId) =>
						obligationIds.includes(obligationId)
					)
			);
		});
		expect(restoredEntries).toHaveLength(2);

		const cashJournalAfter = await t.run(async (ctx) =>
			ctx.db.query("cash_ledger_journal_entries").collect()
		);
		expect(cashJournalAfter).toHaveLength(cashJournalBefore.length);

		const mortgageTransitions = await getMortgageTransitions(t, mortgageId);
		expect(
			mortgageTransitions.filter((entry) => entry.outcome === "transitioned")
		).toHaveLength(0);
	});
});
