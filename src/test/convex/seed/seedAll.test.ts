import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { dealMachine } from "../../../../convex/engine/machines/deal.machine";
import {
	deserializeStatus,
	serializeStatus,
} from "../../../../convex/engine/serialization";
import { createTestConvex, ensureSeededIdentity } from "../../auth/helpers";
import { FAIRLEND_ADMIN } from "../../auth/identities";

async function latestTransitionStateForEntity(
	t: ReturnType<typeof createTestConvex>,
	args: {
		entityId: string;
		entityType: "deal" | "mortgage" | "obligation" | "onboardingRequest";
	}
) {
	return t.run(async (ctx) => {
		const entries = await ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", args.entityType).eq("entityId", args.entityId)
			)
			.collect();

		return (
			entries
				.filter((entry) => entry.outcome === "transitioned")
				.sort((left, right) => left.timestamp - right.timestamp)
				.at(-1)?.newState ?? null
		);
	});
}

describe("seedAll", () => {
	it("is idempotent and keeps governed entity status aligned with the audit journal", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

		const firstRun = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.seed.seedAll.seedAll,
			{}
		);
		expect(firstRun.summary.created).toMatchObject({
			brokers: 2,
			borrowers: 5,
			lenders: 3,
			properties: 5,
			mortgages: 5,
			deals: 3,
			obligations: 15,
			onboardingRequests: 3,
		});

		const countsAfterFirstRun = await t.run(async (ctx) => {
			const [
				brokers,
				borrowers,
				lenders,
				properties,
				mortgages,
				deals,
				obligations,
				onboardingRequests,
			] = await Promise.all([
				ctx.db.query("brokers").collect(),
				ctx.db.query("borrowers").collect(),
				ctx.db.query("lenders").collect(),
				ctx.db.query("properties").collect(),
				ctx.db.query("mortgages").collect(),
				ctx.db.query("deals").collect(),
				ctx.db.query("obligations").collect(),
				ctx.db.query("onboardingRequests").collect(),
			]);

			return {
				brokers,
				borrowers,
				lenders,
				properties,
				mortgages,
				deals,
				obligations,
				onboardingRequests,
			};
		});

		expect(countsAfterFirstRun.brokers).toHaveLength(2);
		expect(countsAfterFirstRun.borrowers).toHaveLength(5);
		expect(countsAfterFirstRun.lenders).toHaveLength(3);
		expect(countsAfterFirstRun.properties).toHaveLength(5);
		expect(countsAfterFirstRun.mortgages).toHaveLength(5);
		expect(countsAfterFirstRun.deals).toHaveLength(3);
		expect(countsAfterFirstRun.obligations).toHaveLength(15);
		expect(countsAfterFirstRun.onboardingRequests).toHaveLength(3);

		const secondRun = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.seed.seedAll.seedAll,
			{}
		);
		expect(secondRun.summary.created).toMatchObject({
			brokers: 0,
			borrowers: 0,
			lenders: 0,
			properties: 0,
			mortgages: 0,
			deals: 0,
			obligations: 0,
			onboardingRequests: 0,
		});

		const countsAfterSecondRun = await t.run(async (ctx) => {
			const [
				brokers,
				borrowers,
				lenders,
				properties,
				mortgages,
				deals,
				obligations,
				onboardingRequests,
			] = await Promise.all([
				ctx.db.query("brokers").collect(),
				ctx.db.query("borrowers").collect(),
				ctx.db.query("lenders").collect(),
				ctx.db.query("properties").collect(),
				ctx.db.query("mortgages").collect(),
				ctx.db.query("deals").collect(),
				ctx.db.query("obligations").collect(),
				ctx.db.query("onboardingRequests").collect(),
			]);

			return {
				brokers: brokers.length,
				borrowers: borrowers.length,
				lenders: lenders.length,
				properties: properties.length,
				mortgages: mortgages.length,
				deals: deals.length,
				obligations: obligations.length,
				onboardingRequests: onboardingRequests.length,
			};
		});

		expect(countsAfterSecondRun).toEqual({
			brokers: 2,
			borrowers: 5,
			lenders: 3,
			properties: 5,
			mortgages: 5,
			deals: 3,
			obligations: 15,
			onboardingRequests: 3,
		});

		const dealStatuses = new Set(
			countsAfterFirstRun.deals.map((deal) => deal.status)
		);
		expect(dealStatuses).toEqual(
			new Set(["initiated", "lawyerOnboarding.verified", "documentReview.signed"])
		);

		const mortgageIds = new Set(
			countsAfterFirstRun.mortgages.map((mortgage) => mortgage._id)
		);
		for (const deal of countsAfterFirstRun.deals) {
			expect(mortgageIds.has(deal.mortgageId)).toBe(true);
		}

		const lenderAuthIds = new Set(
			await t.run(async (ctx) => {
				const lenders = await ctx.db.query("lenders").collect();
				const users = await Promise.all(
					lenders.map((lender) => ctx.db.get(lender.userId))
				);
				return users.flatMap((user) => (user?.authId ? [user.authId] : []));
			})
		);
		for (const deal of countsAfterFirstRun.deals) {
			expect(lenderAuthIds.has(deal.buyerId)).toBe(true);
			expect(lenderAuthIds.has(deal.sellerId)).toBe(true);
			if (deal.status === "initiated") {
				expect(deal.machineContext?.reservationId).toBeUndefined();
			} else {
				expect(deal.machineContext?.reservationId).toBeDefined();
			}
			const hydrated = dealMachine.resolveState({
				value: deserializeStatus(deal.status) as Parameters<
					typeof dealMachine.resolveState
				>[0]["value"],
				context: (deal.machineContext ?? {}) as Parameters<
					typeof dealMachine.resolveState
				>[0]["context"],
			});
			const reserialized = serializeStatus(
				hydrated.value as string | Record<string, unknown>
			);
			expect(reserialized).toBe(deal.status);
		}

		const obligationStates = new Set(
			countsAfterFirstRun.obligations.map((obligation) => obligation.status)
		);
		expect(obligationStates).toEqual(
			new Set(["upcoming", "due", "overdue", "settled"])
		);

		const onboardingStates = new Set(
			countsAfterFirstRun.onboardingRequests.map((request) => request.status)
		);
		expect(onboardingStates).toEqual(
			new Set(["pending_review", "approved", "rejected"])
		);

		for (const mortgage of countsAfterFirstRun.mortgages) {
			expect(mortgage.status).toBe("active");
			const latestState = await latestTransitionStateForEntity(t, {
				entityType: "mortgage",
				entityId: mortgage._id,
			});
			expect(latestState).toBe(mortgage.status);
		}

		for (const deal of countsAfterFirstRun.deals) {
			const latestState = await latestTransitionStateForEntity(t, {
				entityType: "deal",
				entityId: deal._id,
			});
			expect(latestState).toBe(deal.status);
		}

		for (const obligation of countsAfterFirstRun.obligations) {
			const latestState = await latestTransitionStateForEntity(t, {
				entityType: "obligation",
				entityId: obligation._id,
			});
			expect(latestState).toBe(obligation.status);
		}

		for (const request of countsAfterFirstRun.onboardingRequests) {
			const latestState = await latestTransitionStateForEntity(t, {
				entityType: "onboardingRequest",
				entityId: request._id,
			});
			expect(latestState).toBe(request.status);
		}
	});

	it("requires a FairLend admin identity to run", async () => {
		const t = createTestConvex();

		await expect(t.action(api.seed.seedAll.seedAll, {})).rejects.toThrow(
			"Unauthorized: sign in required"
		);
	});
});
