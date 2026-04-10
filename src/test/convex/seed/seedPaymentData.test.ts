import { describe, expect, it } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { createTestConvex } from "../../auth/helpers";

const MS_PER_DAY = 86_400_000;

function addDays(date: Date, days: number): string {
	const copy = new Date(date);
	copy.setUTCDate(copy.getUTCDate() + days);
	return copy.toISOString().slice(0, 10);
}

async function seedMortgageWithBorrower(
	t: ReturnType<typeof createTestConvex>
): Promise<Id<"mortgages">> {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authId: "seed-payment-data-user",
			email: "seed-payment-data@example.com",
			firstName: "Seed",
			lastName: "Payment",
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Canonical Path",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: Date.now(),
		});

		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId,
			orgId: "org_test_seed_payment_data",
			createdAt: Date.now(),
		});

		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId,
			orgId: "org_test_seed_payment_data",
			createdAt: Date.now(),
		});

		const firstPaymentDate = addDays(new Date(), 3);
		const maturityDate = firstPaymentDate;
		const principal = 50_000_000;
		const interestRate = 0.08;
		const paymentAmount = Math.round((interestRate * principal) / 12);

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			orgId: "org_test_seed_payment_data",
			propertyId,
			principal,
			interestRate,
			rateType: "fixed",
			termMonths: 1,
			amortizationMonths: 1,
			paymentAmount,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: firstPaymentDate,
			termStartDate: firstPaymentDate,
			maturityDate,
			firstPaymentDate,
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
		});

		await ctx.db.insert("mortgageBorrowers", {
			mortgageId,
			borrowerId,
			role: "primary",
			addedAt: Date.now(),
		});

		return mortgageId;
	});
}

describe("seedPaymentDataInternal", () => {
	it("seeds default collection rules and creates initial entries with schedule-rule provenance", async () => {
		const t = createTestConvex();
		const mortgageId = await seedMortgageWithBorrower(t);

		const result = await t.mutation(
			internal.seed.seedPaymentData.seedPaymentDataInternal,
			{ mortgageId }
		);

		expect(result.generated.obligations).toBe(1);
		expect(result.generated.planEntries).toBe(1);

		const state = await t.run(async (ctx) => {
			const rules = await ctx.db.query("collectionRules").collect();
			const entries = await ctx.db.query("collectionPlanEntries").collect();
			return { rules, entries };
		});

		expect(state.rules.map((rule) => rule.code ?? rule.name).sort()).toEqual([
			"late_fee_rule",
			"retry_rule",
			"schedule_rule",
		]);
		expect(
			state.rules
				.map((rule) => ({
					code: rule.code,
					kind: rule.kind,
					status: rule.status,
				}))
				.sort((left, right) => (left.code ?? "").localeCompare(right.code ?? ""))
		).toEqual([
			{ code: "late_fee_rule", kind: "late_fee", status: "active" },
			{ code: "retry_rule", kind: "retry", status: "active" },
			{ code: "schedule_rule", kind: "schedule", status: "active" },
		]);
		expect(state.entries).toHaveLength(1);
		expect(state.entries[0]?.source).toBe("default_schedule");
		expect(state.entries[0]?.ruleId).toBeDefined();
	});

	it("is rerun-safe for canonical initial scheduling", async () => {
		const t = createTestConvex();
		const mortgageId = await seedMortgageWithBorrower(t);

		await t.mutation(internal.seed.seedPaymentData.seedPaymentDataInternal, {
			mortgageId,
		});
		const secondRun = await t.mutation(
			internal.seed.seedPaymentData.seedPaymentDataInternal,
			{ mortgageId }
		);

		expect(secondRun.generated.obligations).toBe(0);
		expect(secondRun.generated.planEntries).toBe(0);
		expect(secondRun.reused.obligations).toBe(1);
		expect(secondRun.reused.planEntries).toBe(1);

		const state = await t.run(async (ctx) => {
			const rules = await ctx.db.query("collectionRules").collect();
			const entries = await ctx.db.query("collectionPlanEntries").collect();
			return { ruleCount: rules.length, entryCount: entries.length };
		});

		expect(state.ruleCount).toBe(3);
		expect(state.entryCount).toBe(1);
	});

	it("uses the live schedule_rule delayDays parameter for bootstrap scheduling", async () => {
		const t = createTestConvex();
		const mortgageId = await seedMortgageWithBorrower(t);

		const customScheduleRuleId = await t.run(async (ctx) =>
			ctx.db.insert("collectionRules", {
				name: "schedule_rule",
				trigger: "schedule",
				action: "create_plan_entry",
				parameters: { delayDays: 9 },
				priority: 10,
				enabled: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);

		await t.mutation(internal.seed.seedPaymentData.seedPaymentDataInternal, {
			mortgageId,
		});

		const state = await t.run(async (ctx) => {
			const obligation = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.first();
			const scheduleRule = await ctx.db.get(customScheduleRuleId);
			const entry = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_status", (q) => q.eq("status", "planned"))
				.first();
			return { obligation, scheduleRule, entry };
		});

		expect(state.scheduleRule?.kind).toBe("schedule");
		expect(state.scheduleRule?.code).toBe("schedule_rule");
		expect(state.scheduleRule?.status).toBe("active");
		expect(state.scheduleRule?.config).toEqual({
			kind: "schedule",
			delayDays: 9,
		});
		expect(state.entry?.ruleId).toBe(customScheduleRuleId);
		expect(state.entry?.scheduledDate).toBe(
			(state.obligation?.dueDate ?? 0) - 9 * MS_PER_DAY
		);
	});
});
