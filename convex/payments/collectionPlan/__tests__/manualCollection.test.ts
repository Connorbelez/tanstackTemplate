import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGovernedTestConvex,
	seedBorrowerProfile,
	seedMortgage,
	seedObligation,
} from "../../../../src/test/convex/payments/helpers";
import { internal } from "../../../_generated/api";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("manual collection plan entry creation", () => {
	it("reuses the same keyed plan entry instead of inserting a duplicate", async () => {
		const t = createGovernedTestConvex();
		const requestedAt = new Date("2026-04-13T12:00:00.000Z").getTime();
		vi.setSystemTime(requestedAt);

		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "due",
		});
		const executionIdempotencyKey = [
			"manual-collection",
			obligationId,
			300_000,
			requestedAt,
			"user_fairlend_admin",
		].join(":");

		const args = {
			amount: 300_000,
			executionIdempotencyKey,
			method: "manual",
			obligationIds: [obligationId],
			scheduledDate: requestedAt,
			source: "admin" as const,
			status: "planned" as const,
		};

		const firstPlanEntryId = await t.mutation(
			internal.payments.collectionPlan.mutations.createEntry,
			args
		);
		const secondPlanEntryId = await t.mutation(
			internal.payments.collectionPlan.mutations.createEntry,
			args
		);

		expect(secondPlanEntryId).toBe(firstPlanEntryId);

		const keyedEntries = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_execution_idempotency", (q) =>
					q.eq("executionIdempotencyKey", executionIdempotencyKey)
				)
				.collect()
		);
		expect(keyedEntries).toHaveLength(1);
		expect(keyedEntries[0]?._id).toBe(firstPlanEntryId);
		expect(keyedEntries[0]?.obligationIds).toEqual([obligationId]);
		expect(keyedEntries[0]?.source).toBe("admin");
		expect(keyedEntries[0]?.method).toBe("manual");
	});
});
