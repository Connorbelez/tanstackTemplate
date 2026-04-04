import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

export const DEFAULT_COLLECTION_RULES = [
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
] as const;

export interface SeedCollectionRulesResult {
	created: number;
	ruleIdsByName: {
		late_fee_rule: Id<"collectionRules">;
		retry_rule: Id<"collectionRules">;
		schedule_rule: Id<"collectionRules">;
	};
	skipped: number;
}

export async function seedCollectionRulesImpl(
	ctx: Pick<MutationCtx, "db">
): Promise<SeedCollectionRulesResult> {
	let created = 0;
	let skipped = 0;
	const ruleIdsByName = {} as SeedCollectionRulesResult["ruleIdsByName"];

	for (const ruleDef of DEFAULT_COLLECTION_RULES) {
		const existing = await ctx.db
			.query("collectionRules")
			.filter((q) => q.eq(q.field("name"), ruleDef.name))
			.first();

		if (existing) {
			ruleIdsByName[ruleDef.name] = existing._id;
			skipped++;
			continue;
		}

		const now = Date.now();
		const ruleId = await ctx.db.insert("collectionRules", {
			...ruleDef,
			createdAt: now,
			updatedAt: now,
		});
		ruleIdsByName[ruleDef.name] = ruleId;
		created++;
	}

	return { created, skipped, ruleIdsByName };
}
