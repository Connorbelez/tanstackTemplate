import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../../../_generated/server";
import schema from "../../../schema";
import { convexModules } from "../../../test/moduleMaps";
import { generateInitialMortgageObligations } from "../bootstrap";

const TEST_ORG_ID = "org_bootstrap_test";
const TEST_NOW = Date.parse("2026-03-01T12:00:00.000Z");

function createTestHarness() {
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	return convexTest(schema, convexModules);
}

async function seedMortgageWithBorrower(
	t: ReturnType<typeof createTestHarness>
) {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authId: "bootstrap-test-user",
			email: "bootstrap-test@example.com",
			firstName: "Bootstrap",
			lastName: "Tester",
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Weekly Lane",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: TEST_NOW,
		});

		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId,
			createdAt: TEST_NOW,
		});

		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId,
			createdAt: TEST_NOW,
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 50_000_000,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 3,
			amortizationMonths: 3,
			paymentAmount: 76_923,
			paymentFrequency: "weekly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-04-01",
			termStartDate: "2026-04-01",
			maturityDate: "2026-04-15",
			firstPaymentDate: "2026-04-01",
			brokerOfRecordId: brokerId,
			createdAt: TEST_NOW,
		});

		return { borrowerId, mortgageId };
	});
}

describe("generateInitialMortgageObligations", () => {
	it("creates weekly obligations on an explicit 7-day cadence", async () => {
		const t = createTestHarness();
		const { borrowerId, mortgageId } = await seedMortgageWithBorrower(t);

		const result = await t.run(async (ctx) =>
			generateInitialMortgageObligations(ctx as unknown as MutationCtx, {
				firstPaymentDate: "2026-04-01",
				maturityDate: "2026-04-15",
				mortgageId,
				now: TEST_NOW,
				orgId: TEST_ORG_ID,
				paymentAmount: 76_923,
				paymentFrequency: "weekly",
				primaryBorrowerId: borrowerId,
				principal: 0,
			})
		);

		expect(result.createdObligationIds).toHaveLength(3);

		const obligations = await t.run(async (ctx) =>
			ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (query) =>
					query.eq("mortgageId", mortgageId)
				)
				.collect()
		);

		expect(obligations).toHaveLength(3);
		expect(obligations.map((obligation) => obligation.paymentNumber)).toEqual([
			1, 2, 3,
		]);
		expect(obligations.map((obligation) => obligation.type)).toEqual([
			"regular_interest",
			"regular_interest",
			"regular_interest",
		]);
		expect(obligations.map((obligation) => obligation.dueDate)).toEqual([
			Date.parse("2026-04-01T12:00:00.000Z"),
			Date.parse("2026-04-08T12:00:00.000Z"),
			Date.parse("2026-04-15T12:00:00.000Z"),
		]);
	});
});
