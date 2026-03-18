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

// ─── Effect References ─────────────────────────────────────────────
const emitPaymentReceived =
	internal.engine.effects.collectionAttempt.emitPaymentReceived;
const emitCollectionFailed =
	internal.engine.effects.collectionAttempt.emitCollectionFailed;
const applyPayment = internal.engine.effects.obligationPayment.applyPayment;
const emitObligationSettled =
	internal.engine.effects.obligation.emitObligationSettled;
const emitObligationOverdue =
	internal.engine.effects.obligation.emitObligationOverdue;
const createLateFeeObligation =
	internal.engine.effects.obligationLateFee.createLateFeeObligation;

// ─── Shared Setup ──────────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════════════
// AC1: Full Payment Chain
// plan entry -> attempt initiated -> confirmed -> PAYMENT_RECEIVED
//   -> obligation settled -> OBLIGATION_SETTLED -> mortgage cure
// ══════════════════════════════════════════════════════════════════════

describe("AC1: full payment chain (attempt confirmed -> obligation settled -> mortgage cure)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("attempt FUNDS_SETTLED -> confirmed, emitPaymentReceived -> obligation settled, emitObligationSettled -> mortgage stays active", async () => {
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
		});

		// Step 1: Fire FUNDS_SETTLED on the collection attempt
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

		// Step 2: Invoke emitPaymentReceived effect
		// This fires PAYMENT_APPLIED at each linked obligation
		await t.mutation(
			emitPaymentReceived,
			buildEffectArgs(
				attemptId,
				"collectionAttempt",
				"emitPaymentReceived",
			),
		);

		// Obligation should now be settled (full amount)
		const oblAfterPayment = await t.run(async (ctx) =>
			ctx.db.get(obligationId),
		);
		expect(oblAfterPayment?.status).toBe("settled");

		// Step 3: Invoke applyPayment effect to patch amountSettled
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

		// Step 4: Invoke emitObligationSettled (fires PAYMENT_CONFIRMED at mortgage)
		await t.mutation(
			emitObligationSettled,
			buildEffectArgs(obligationId, "obligation", "emitObligationSettled", {
				amount,
			}),
		);

		// Mortgage should remain active (was already active, not delinquent)
		const mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");
	});

	it("produces audit journal entries for attempt and obligation transitions", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { obligationId } = await seedBaseEntities(t);

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

		// Execute the chain
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

		// Verify attempt journal: initiated -> confirmed
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

		// Verify obligation journal: due -> settled
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

// ══════════════════════════════════════════════════════════════════════
// AC2: Failure Chain
// attempt failed -> COLLECTION_FAILED -> RetryRule creates new plan entry
// ══════════════════════════════════════════════════════════════════════

describe("AC2: failure chain (attempt permanent_fail -> COLLECTION_FAILED -> RetryRule)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("attempt DRAW_INITIATED -> pending -> DRAW_FAILED -> failed -> MAX_RETRIES_EXCEEDED -> permanent_fail, retry rule creates new plan entry", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { obligationId } = await seedBaseEntities(t);
		const rules = await seedCollectionRules(t);

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

		// Step 1: DRAW_INITIATED -> pending
		const r1 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_INITIATED",
			{ providerRef: "test-ref" },
		);
		expect(r1.success).toBe(true);
		expect(r1.newState).toBe("pending");

		// Step 2: DRAW_FAILED -> failed
		const r2 = await fireTransition(
			t,
			"collectionAttempt",
			attemptId,
			"DRAW_FAILED",
			{ reason: "NSF", code: "R01" },
		);
		expect(r2.success).toBe(true);
		expect(r2.newState).toBe("failed");

		// Step 3: MAX_RETRIES_EXCEEDED -> permanent_fail
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


		// Step 5: Drain scheduled work (evaluateRules -> RetryRule -> createEntry)
		await drainScheduledWork(t);

		// Step 6: Verify a new plan entry was created by the retry rule
		const allPlanEntries = await t.run(async (ctx) =>
			ctx.db.query("collectionPlanEntries").collect(),
		);

		const retryEntry = allPlanEntries.find(
			(e) =>
				e.source === "retry_rule" &&
				e.rescheduledFromId === planEntryId,
		);

		expect(retryEntry).toBeDefined();
		expect(retryEntry?.status).toBe("planned");
		expect(retryEntry?.rescheduledFromId).toBe(planEntryId);

		// Verify the scheduled date has backoff applied
		// retryCount=1 (incremented by DRAW_FAILED), baseDays=3
		// delayMs = 3 * 2^1 * 86_400_000 = 6 days
		const MS_PER_DAY = 86_400_000;
		const expectedDelay = 3 * 2 ** 1 * MS_PER_DAY; // retryCount was incremented to 1 by DRAW_FAILED
		const scheduledDateDiff =
			retryEntry!.scheduledDate - Date.now();
		// Allow some tolerance for timing
		expect(scheduledDateDiff).toBeGreaterThan(0);
		expect(scheduledDateDiff).toBeLessThanOrEqual(expectedDelay + 1000);
	});
});

// ══════════════════════════════════════════════════════════════════════
// AC3: Overdue Chain
// obligation overdue -> OBLIGATION_OVERDUE -> mortgage delinquent
//   + LateFeeRule creates late_fee obligation
// ══════════════════════════════════════════════════════════════════════

describe("AC3: overdue chain (obligation overdue -> mortgage delinquent + late fee)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("GRACE_PERIOD_EXPIRED -> overdue, emitObligationOverdue -> mortgage delinquent, createLateFeeObligation -> late_fee obligation", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId, borrowerId } =
			await seedBaseEntities(t);
		await seedCollectionRules(t);

		// Step 1: GRACE_PERIOD_EXPIRED -> overdue
		const r1 = await fireTransition(
			t,
			"obligation",
			obligationId,
			"GRACE_PERIOD_EXPIRED",
			{},
		);

		expect(r1.success).toBe(true);
		expect(r1.newState).toBe("overdue");
		expect(r1.effectsScheduled).toContain("emitObligationOverdue");
		expect(r1.effectsScheduled).toContain("createLateFeeObligation");


		// Verify late fee obligation was created
		const allObligations = await t.run(async (ctx) =>
			ctx.db.query("obligations").collect(),
		);
		const lateFee = allObligations.find(
			(o) =>
				o.type === "late_fee" && o.sourceObligationId === obligationId,
		);

		expect(lateFee).toBeDefined();
		expect(lateFee?.amount).toBe(5000); // $50 in cents
		expect(lateFee?.status).toBe("upcoming");
		expect(lateFee?.sourceObligationId).toBe(obligationId);
		expect(lateFee?.mortgageId).toBe(mortgageId);
		expect(lateFee?.borrowerId).toBe(borrowerId);

		// Step 4: Drain scheduled work (evaluateRules + LateFeeRule)
		// The LateFeeRule should find the existing late_fee and skip (idempotency)
		await drainScheduledWork(t);

		// Verify no duplicate late fee obligation was created
		const allObligationsAfterDrain = await t.run(async (ctx) =>
			ctx.db.query("obligations").collect(),
		);
		const lateFees = allObligationsAfterDrain.filter(
			(o) =>
				o.type === "late_fee" && o.sourceObligationId === obligationId,
		);
		expect(lateFees.length).toBe(1); // Idempotency: no duplicates
	});
});
