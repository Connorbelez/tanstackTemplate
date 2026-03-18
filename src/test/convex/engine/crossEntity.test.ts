import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import {
	createGovernedTestConvex,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";

const overdueEffect = internal.engine.effects.obligation.emitObligationOverdue;
const settledEffect = internal.engine.effects.obligation.emitObligationSettled;

describe("cross-entity coordination: obligation → mortgage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	async function seedMortgageAndObligation(
		t: ReturnType<typeof createGovernedTestConvex>
	) {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				authId: "seed_cross_entity_user",
				email: "cross@test.ca",
				firstName: "Test",
				lastName: "User",
			})
		);

		const brokerId = await t.run(async (ctx) =>
			ctx.db.insert("brokers", {
				status: "active",
				userId,
				createdAt: Date.now(),
			})
		);

		const borrowerId = await t.run(async (ctx) =>
			ctx.db.insert("borrowers", {
				status: "active",
				userId,
				createdAt: Date.now(),
			})
		);

		const propertyId = await t.run(async (ctx) =>
			ctx.db.insert("properties", {
				streetAddress: "1 Cross Entity Dr",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V 0B1",
				propertyType: "residential",
				createdAt: Date.now(),
			})
		);

		const mortgageId = await t.run(async (ctx) =>
			ctx.db.insert("mortgages", {
				status: "active",
				machineContext: { missedPayments: 0, lastPaymentAt: 0 },
				propertyId,
				principal: 50_000_000,
				interestRate: 0.08,
				rateType: "fixed",
				termMonths: 12,
				amortizationMonths: 12,
				paymentAmount: 333_333,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-01-01",
				termStartDate: "2026-01-15",
				maturityDate: "2027-01-15",
				firstPaymentDate: "2026-02-15",
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
			})
		);

		const obligationId = await t.run(async (ctx) =>
			ctx.db.insert("obligations", {
				status: "due",
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 333_333,
				amountSettled: 0,
				dueDate: new Date("2026-02-15T12:00:00.000Z").getTime(),
				gracePeriodEnd: new Date("2026-03-02T12:00:00.000Z").getTime(),
				createdAt: Date.now(),
			})
		);

		return { mortgageId, obligationId, borrowerId, brokerId };
	}

	const effectArgs = (
		entityId: string,
		effectName: string,
		payload?: Record<string, unknown>
	) => ({
		entityId,
		entityType: "obligation" as const,
		eventType: "TEST",
		journalEntryId: `test-${effectName}`,
		effectName,
		payload,
		source: { actorType: "system" as const, channel: "scheduler" as const },
	});

	it("GRACE_PERIOD_EXPIRED schedules emitObligationOverdue effect", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { obligationId } = await seedMortgageAndObligation(t);

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "obligation",
				entityId: obligationId,
				eventType: "GRACE_PERIOD_EXPIRED",
				payload: {},
				source: { actorType: "system", channel: "scheduler" },
			}
		);

		expect(result.success).toBe(true);
		expect(result.newState).toBe("overdue");
		expect(result.effectsScheduled).toContain("emitObligationOverdue");
	});

	it("emitObligationOverdue transitions mortgage to delinquent", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedMortgageAndObligation(t);

		// Make obligation overdue first
		await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "obligation",
				entityId: obligationId,
				eventType: "GRACE_PERIOD_EXPIRED",
				payload: {},
				source: { actorType: "system", channel: "scheduler" },
			}
		);

		// Manually invoke the effect
		await t.mutation(overdueEffect, effectArgs(obligationId, "emitObligationOverdue"));

		const mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("delinquent");
		expect(
			(mortgage?.machineContext as { missedPayments: number })?.missedPayments
		).toBe(1);
	});

	it("full chain: obligation overdue → delinquent → settle → cure", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedMortgageAndObligation(t);

		// Obligation due → overdue
		await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "obligation",
				entityId: obligationId,
				eventType: "GRACE_PERIOD_EXPIRED",
				payload: {},
				source: { actorType: "system", channel: "scheduler" },
			}
		);

		// Effect: mortgage active → delinquent
		await t.mutation(overdueEffect, effectArgs(obligationId, "emitObligationOverdue"));

		let mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("delinquent");

		// Obligation overdue → settled
		await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "obligation",
				entityId: obligationId,
				eventType: "PAYMENT_APPLIED",
				payload: { amount: 333_333, paidAt: Date.now() },
				source: { actorType: "system", channel: "scheduler" },
			}
		);

		// Effect: mortgage delinquent → active (cure)
		await t.mutation(settledEffect, effectArgs(obligationId, "emitObligationSettled", { amount: 333_333, paidAt: Date.now() }));

		mortgage = await t.run(async (ctx) => ctx.db.get(mortgageId));
		expect(mortgage?.status).toBe("active");
		expect(
			(mortgage?.machineContext as { missedPayments: number })?.missedPayments
		).toBe(0);
	});

	it("produces journal entries across both entities with consistent chains", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const { mortgageId, obligationId } = await seedMortgageAndObligation(t);

		// Full chain
		await t.mutation(internal.engine.transitionMutation.transitionMutation, {
			entityType: "obligation",
			entityId: obligationId,
			eventType: "GRACE_PERIOD_EXPIRED",
			payload: {},
			source: { actorType: "system", channel: "scheduler" },
		});
		await t.mutation(overdueEffect, effectArgs(obligationId, "emitObligationOverdue"));
		await t.mutation(internal.engine.transitionMutation.transitionMutation, {
			entityType: "obligation",
			entityId: obligationId,
			eventType: "PAYMENT_APPLIED",
			payload: { amount: 333_333, paidAt: Date.now() },
			source: { actorType: "system", channel: "scheduler" },
		});
		await t.mutation(settledEffect, effectArgs(obligationId, "emitObligationSettled", { amount: 333_333, paidAt: Date.now() }));

		// Verify obligation journal
		const oblJournal = await t.run(async (ctx) =>
			ctx.db
				.query("auditJournal")
				.withIndex("by_type_and_time", (q) => q.eq("entityType", "obligation"))
				.collect()
		);
		const oblT = oblJournal.filter(
			(e) => e.entityId === obligationId && e.outcome === "transitioned"
		);
		expect(oblT.length).toBe(2);
		expect(oblT[0].previousState).toBe("due");
		expect(oblT[0].newState).toBe("overdue");
		expect(oblT[1].previousState).toBe("overdue");
		expect(oblT[1].newState).toBe("settled");

		// Verify mortgage journal
		const mtgJournal = await t.run(async (ctx) =>
			ctx.db
				.query("auditJournal")
				.withIndex("by_type_and_time", (q) => q.eq("entityType", "mortgage"))
				.collect()
		);
		const mtgT = mtgJournal.filter(
			(e) => e.entityId === mortgageId && e.outcome === "transitioned"
		);
		expect(mtgT.length).toBe(2);
		expect(mtgT[0].previousState).toBe("active");
		expect(mtgT[0].newState).toBe("delinquent");
		expect(mtgT[1].previousState).toBe("delinquent");
		expect(mtgT[1].newState).toBe("active");
	});
});
