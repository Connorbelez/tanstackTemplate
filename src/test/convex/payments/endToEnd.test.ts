import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import {
	buildEffectArgs,
	createGovernedTestConvex,
	drainScheduledWork,
	fireTransition,
	seedBorrowerProfile,
	seedCollectionAttempt,
	seedCollectionRules,
	seedDefaultGovernedActors,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
	type GovernedTestConvex,
} from "./helpers";

// ─── Effect References ─────────────────────────────────────────────────────
const emitPaymentReceived =
	internal.engine.effects.collectionAttempt.emitPaymentReceived;
const emitCollectionFailed =
	internal.engine.effects.collectionAttempt.emitCollectionFailed;
const recordProviderRef =
	internal.engine.effects.collectionAttempt.recordProviderRef;
const applyPayment = internal.engine.effects.obligationPayment.applyPayment;
const emitObligationSettled =
	internal.engine.effects.obligation.emitObligationSettled;

// ─── Shared Setup ─────────────────────────────────────────────────────

async function seedBaseEntities(t: GovernedTestConvex) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t, {
		status: "active",
		machineContext: { missedPayments: 0, lastPaymentAt: 0 },
	});
	const obligationId = await seedObligation(t, mortgageId, borrowerId, {
		status: "due",
	});

	return { mortgageId, obligationId, borrowerId };
}

// ══════════════════════════════════════════════════════════════════════════════
// AC4: ManualPaymentMethod Full Lifecycle
// seed → obligation due → plan entry → attempt initiated → FUNDS_SETTLED → confirmed → PAYMENT_APPLIED → obligation settled → PAYMENT_CONFIRMED → mortgage active
// ══════════════════════════════════════════════════════════════════════════════

describe("AC4: ManualPaymentMethod full lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("should complete full manual payment lifecycle: initiated → confirmed → settled → mortgage active", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedBaseEntities(t);

		// Read the obligation to get amount
		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		const amount = obligation!.amount; // 3_000_00 from seedObligation

		// Seed plan entry and attempt
		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount,
			method: "manual",
		});

		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount,
			machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
		});

		// Step 1: Fire FUNDS_SETTLED on attempt → confirmed (ManualPaymentMethod immediate path)
		const result = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"FUNDS_SETTLED",
			{ settledAt: Date.now() },
		);

		expect(result.success).toBe(true);
		expect(result.newState).toBe("confirmed");
		expect(result.effectsScheduled).toContain("emitPaymentReceived");

		// Step 2: Invoke emitPaymentReceived effect → fires PAYMENT_APPLIED to obligation
		await t.mutation(
			emitPaymentReceived,
			buildEffectArgs(
				attemptId,
				"collectionAttempt",
				"emitPaymentReceived",
			),
		);

		// Obligation should transition to "settled" (full amount: 300_000 >= 300_000)
		const oblAfterPayment = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterPayment?.status).toBe("settled");

		// Step 3: Invoke applyPayment effect → amountSettled = 300_000
		await t.mutation(
			applyPayment,
			buildEffectArgs(obligationId, "obligation", "applyPayment", {
				amount,
			}),
		);

		const oblAfterApply = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterApply?.amountSettled).toBe(amount);

		// Step 4: Invoke emitObligationSettled effect → fires PAYMENT_CONFIRMED to mortgage
		await t.mutation(
			emitObligationSettled,
			buildEffectArgs(obligationId, "obligation", "emitObligationSettled", {
				amount,
			}),
		);

		// Mortgage stays "active" (it was already active, not delinquent)
		const mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");
	});

	it("should produce audit journal entries for attempt and obligation transitions", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedBaseEntities(t);

		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		const amount = obligation!.amount;

		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount,
			method: "manual",
		});

		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount,
		});

		// Execute the full chain
		await fireTransition(t, "collectionAttempt", attemptId, "FUNDS_SETTLED", {
			settledAt: Date.now(),
		});

		await t.mutation(
			emitPaymentReceived,
			buildEffectArgs(
				attemptId,
				"collectionAttempt",
				"emitPaymentReceived",
			),
		);

		await t.mutation(
			applyPayment,
			buildEffectArgs(obligationId, "obligation", "applyPayment", { amount }),
		);

		await t.mutation(
			emitObligationSettled,
			buildEffectArgs(obligationId, "obligation", "emitObligationSettled", {
				amount,
			}),
		);

		// Verify attempt journal: initiated → confirmed
		const attemptJournal = await t.run(async (ctx) =>
			ctx.db
				.query("auditJournal")
				.withIndex("by_type_and_time", (q) =>
					q.eq("entityType", "collectionAttempt"),
				)
				.collect(),
		);
		const attemptTransitions = attemptJournal.filter(
			(e) => e.entityId === attemptId && e.outcome === "transitioned",
		);
		expect(attemptTransitions.length).toBeGreaterThanOrEqual(1);
		expect(attemptTransitions[0]?.previousState).toBe("initiated");
		expect(attemptTransitions[0]?.newState).toBe("confirmed");

		// Verify obligation journal: due → settled
		const oblJournal = await t.run(async (ctx) =>
			ctx.db
				.query("auditJournal")
				.withIndex("by_type_and_time", (q) =>
					q.eq("entityType", "obligation"),
				)
				.collect(),
		);
		const oblTransitions = oblJournal.filter(
			(e) => e.entityId === obligationId && e.outcome === "transitioned",
		);
		expect(oblTransitions.length).toBeGreaterThanOrEqual(1);
		expect(oblTransitions[0]?.previousState).toBe("due");
		expect(oblTransitions[0]?.newState).toBe("settled");
	});
});

// ══════════════════════════════════════════════════════════════════════════════
// AC5: MockPADMethod Async Path
// Same lifecycle but with async `pending` state: initiated → pending → confirmed
// ══════════════════════════════════════════════════════════════════════════════

describe("AC5: MockPADMethod async path (initiated → pending → confirmed)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("should complete async PAD payment lifecycle: initiated → pending → confirmed → settled", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedBaseEntities(t);

		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		const amount = obligation!.amount;

		// Seed plan entry and attempt with mock_pad method
		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount,
			method: "mock_pad",
		});

		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "mock_pad",
			amount,
			machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
		});

		// Step 1: Fire DRAW_INITIATED → pending (async path, providerRef: "mock-pad-ref")
		const r1 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_INITIATED",
			{ providerRef: "mock-pad-ref" },
		);

		expect(r1.success).toBe(true);
		expect(r1.newState).toBe("pending");
		expect(r1.effectsScheduled).toContain("recordProviderRef");

		// Invoke recordProviderRef effect
		await t.mutation(
			recordProviderRef,
			buildEffectArgs(attemptId, "collectionAttempt", "recordProviderRef", {
				providerRef: "mock-pad-ref",
			}),
		);

		// Verify providerRef was recorded
		const attemptPending = await t.run(async (ctx) =>
			ctx.db.get(attemptId),
		);
		expect(attemptPending?.providerRef).toBe("mock-pad-ref");

		// Step 2: Fire FUNDS_SETTLED on attempt → confirmed
		const r2 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"FUNDS_SETTLED",
			{ settledAt: Date.now() },
		);

		expect(r2.success).toBe(true);
		expect(r2.newState).toBe("confirmed");
		expect(r2.effectsScheduled).toContain("emitPaymentReceived");

		// Step 3: Same effect chain as AC4 (emitPaymentReceived → PAYMENT_APPLIED → applyPayment → emitObligationSettled)
		await t.mutation(
			emitPaymentReceived,
			buildEffectArgs(
				attemptId,
				"collectionAttempt",
				"emitPaymentReceived",
			),
		);

		const oblAfterPayment = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterPayment?.status).toBe("settled");

		await t.mutation(
			applyPayment,
			buildEffectArgs(obligationId, "obligation", "applyPayment", {
				amount,
			}),
		);

		await t.mutation(
			emitObligationSettled,
			buildEffectArgs(obligationId, "obligation", "emitObligationSettled", {
				amount,
			}),
		);

		// Mortgage stays active
		const mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");
	});
});

// ══════════════════════════════════════════════════════════════════════════════
// AC6: Partial Payment Accumulation
// partial payment → partially_settled → second payment → settled
// ══════════════════════════════════════════════════════════════════════════════

describe("AC6: partial payment accumulation (partially_settled → settled)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("should accumulate partial payments until fully settled", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedBaseEntities(t);

		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		const totalAmount = obligation!.amount; // 300_000 cents

		// Seed plan entry and attempt (we'll use them for the eventual success path)
		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount: totalAmount,
			method: "manual",
		});

		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount: totalAmount,
		});

		// For partial payments, we DON'T confirm the attempt first.
		// Instead, we directly fire PAYMENT_APPLIED on the obligation
		// with partial amounts to test accumulation logic.

		// Step 1: First partial payment - fire PAYMENT_APPLIED with amount=150_000
		const r1 = await fireTransition(
			t,
			"obligation",
			obligationId,
			"PAYMENT_APPLIED",
			{
				amount: 150_000,
				attemptId: "attempt_partial_1",
				currentAmountSettled: 0, // currently 0
				totalAmount: 300_000,
			},
		);

		// Guard: isFullySettled → 0 + 150_000 < 300_000 → false → partially_settled
		expect(r1.success).toBe(true);
		expect(r1.newState).toBe("partially_settled");
	// Note: effectsScheduled may include effects from all array paths in the machine config
	// but the actual state transition is what matters - it went to partially_settled
	expect(r1.effectsScheduled).toContain("applyPayment");
		// Invoke applyPayment with amount=150_000
		await t.mutation(
			applyPayment,
			buildEffectArgs(obligationId, "obligation", "applyPayment", {
				amount: 150_000,
			}),
		);

		const oblAfterFirst = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterFirst?.amountSettled).toBe(150_000);

		// Step 2: Second payment - fire PAYMENT_APPLIED with amount=150_000
		const r2 = await fireTransition(
			t,
			"obligation",
			obligationId,
			"PAYMENT_APPLIED",
			{
				amount: 150_000,
				attemptId: "attempt_partial_2",
				currentAmountSettled: 150_000, // now 150_000 after first payment
				totalAmount: 300_000,
			},
		);

		// Guard: isFullySettled → 150_000 + 150_000 >= 300_000 → true → settled
		expect(r2.success).toBe(true);
		expect(r2.newState).toBe("settled");
		// effectsScheduled should include "applyPayment" AND "emitObligationSettled"
		expect(r2.effectsScheduled).toContain("applyPayment");
		expect(r2.effectsScheduled).toContain("emitObligationSettled");

		// Step 3: Invoke applyPayment with amount=150_000
		await t.mutation(
			applyPayment,
			buildEffectArgs(obligationId, "obligation", "applyPayment", {
				amount: 150_000,
			}),
		);

		const oblAfterSecond = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterSecond?.amountSettled).toBe(300_000);

		// Step 4: Invoke emitObligationSettled
		await t.mutation(
			emitObligationSettled,
			buildEffectArgs(obligationId, "obligation", "emitObligationSettled", {
				amount: 300_000,
			}),
		);

		// Mortgage receives PAYMENT_CONFIRMED
		const mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");
	});
});

// ══════════════════════════════════════════════════════════════════════════════
// AC7: Retry Chain to Eventual Success
// attempt fails → RetryRule → new attempt → succeeds → obligation settles
// ══════════════════════════════════════════════════════════════════════════════

describe("AC7: retry chain to eventual success", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("should retry failed attempt and eventually succeed", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedBaseEntities(t);

		// Seed collection rules (retry_rule enabled, maxRetries=3, backoffBaseDays=3)
		const rules = await seedCollectionRules(t);

		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		const amount = obligation!.amount;

		// Seed plan entry + attempt (initiated)
		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount,
			method: "manual",
			ruleId: rules.retryRuleId,
		});

		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount,
			machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
		});

		// Step 1: Fire DRAW_INITIATED → pending
		const r1 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_INITIATED",
			{ providerRef: "test-ref" },
		);
		expect(r1.success).toBe(true);
		expect(r1.newState).toBe("pending");

		// Step 2: Fire DRAW_FAILED → failed (retryCount increments to 1 via assign action)
		const r2 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_FAILED",
			{ reason: "NSF", code: "R01" },
		);
		expect(r2.success).toBe(true);
		expect(r2.newState).toBe("failed");

		// Step 3: Fire MAX_RETRIES_EXCEEDED → permanent_fail
		const r3 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"MAX_RETRIES_EXCEEDED",
			{},
		);
		expect(r3.success).toBe(true);
		expect(r3.newState).toBe("permanent_fail");
		expect(r3.effectsScheduled).toContain("emitCollectionFailed");
		expect(r3.effectsScheduled).toContain("notifyAdmin");


		// Step 5: Drain scheduled work → RetryRule creates new plan entry
		await drainScheduledWork(t);

		// Verify: new plan entry with source="retry_rule", rescheduledFromId=originalPlanEntryId
		const allPlanEntries = await t.run(async (ctx) =>
			ctx.db.query("collectionPlanEntries").collect(),
		);

		const retryPlanEntry = allPlanEntries.find(
			(e) => e.source === "retry_rule" && e.rescheduledFromId === planEntryId,
		);

		expect(retryPlanEntry).toBeDefined();
		expect(retryPlanEntry?.status).toBe("planned");
		expect(retryPlanEntry?.rescheduledFromId).toBe(planEntryId);

		// Verify backoff date
		// retryCount=1 (from machineContext), backoffBaseDays=3
		// delay = 3 * 2^1 * MS_PER_DAY = 6 days
		const MS_PER_DAY = 86_400_000;
		const expectedDelay = 3 * 2 ** 1 * MS_PER_DAY; // retryCount was incremented to 1 by DRAW_FAILED
		const scheduledDateDiff = retryPlanEntry!.scheduledDate - Date.now();
		expect(scheduledDateDiff).toBeGreaterThanOrEqual(expectedDelay - 1000);
		expect(scheduledDateDiff).toBeLessThanOrEqual(expectedDelay + 1000);

		// Step 6: Seed NEW collection attempt for the retry plan entry
		const retryAttemptId = await seedCollectionAttempt(t, {
			planEntryId: retryPlanEntry!._id,
			method: "manual",
			amount,
		});

		// Step 7: Fire FUNDS_SETTLED on retry attempt → confirmed
		const r4 = await fireTransition(
			t,
			"collectionAttempt",
			retryAttemptId,
			"FUNDS_SETTLED",
			{ settledAt: Date.now() },
		);
		expect(r4.success).toBe(true);
		expect(r4.newState).toBe("confirmed");

		// Step 8-10: Complete the payment chain
		await t.mutation(
			emitPaymentReceived,
			buildEffectArgs(
				retryAttemptId,
				"collectionAttempt",
				"emitPaymentReceived",
			),
		);

		const oblAfterPayment = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterPayment?.status).toBe("settled");

		await t.mutation(
			applyPayment,
			buildEffectArgs(obligationId, "obligation", "applyPayment", {
				amount,
			}),
		);

		await t.mutation(
			emitObligationSettled,
			buildEffectArgs(obligationId, "obligation", "emitObligationSettled", {
				amount,
			}),
		);

		// Verify final states
		// First attempt: permanent_fail
		const firstAttempt = await t.run(async (ctx) =>
			ctx.db.get(attemptId),
		);
		expect(firstAttempt?.status).toBe("permanent_fail");

		// Retry attempt: confirmed
		const retryAttempt = await t.run(async (ctx) =>
			ctx.db.get(retryAttemptId),
		);
		expect(retryAttempt?.status).toBe("confirmed");

		// Obligation: settled
		const finalObligation = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(finalObligation?.status).toBe("settled");

		// Mortgage: active
		const mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");
	});
});
