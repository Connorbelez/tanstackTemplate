import { internalMutation } from "../../_generated/server";

const DEFAULT_RULES = [
	{
		name: "schedule_rule",
		trigger: "schedule" as const,
		action: "create_plan_entry",
		parameters: { delayDays: 5 },
		priority: 10,
		enabled: true,
	},
	{
		name: "retry_rule",
		trigger: "event" as const,
		action: "create_retry_entry",
		parameters: { maxRetries: 3, backoffBaseDays: 3 },
		priority: 20,
		enabled: true,
	},
	{
		name: "late_fee_rule",
		trigger: "event" as const,
		action: "create_late_fee",
		parameters: { feeAmountCents: 5000, dueDays: 30, graceDays: 45 },
		priority: 30,
		enabled: true,
	},
];

/**
 * Seeds the collectionRules table with default rules.
 * Idempotent: skips any rule whose `name` already exists.
 */
export const seedCollectionRules = internalMutation({
	args: {},
	handler: async (ctx) => {
		let created = 0;
		let skipped = 0;

		for (const ruleDef of DEFAULT_RULES) {
			const existing = await ctx.db
				.query("collectionRules")
				.filter((q) => q.eq(q.field("name"), ruleDef.name))
				.first();

			if (existing) {
				skipped++;
				continue;
			}

			const now = Date.now();
			await ctx.db.insert("collectionRules", {
				...ruleDef,
				createdAt: now,
				updatedAt: now,
			});
			created++;
		}

		return { created, skipped };
	},
});
