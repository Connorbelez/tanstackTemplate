import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type {
	CollectionRuleConfig,
	CollectionRuleKind,
	CollectionRuleStatus,
} from "./ruleContract";

type CollectionRuleScope =
	| { scopeType: "global" }
	| { mortgageId: Id<"mortgages">; scopeType: "mortgage" };

interface UpsertCollectionRuleByCodeArgs {
	actorId: string;
	code: string;
	config: CollectionRuleConfig;
	ctx: MutationCtx;
	description: string;
	displayName: string;
	effectiveFrom?: number;
	effectiveTo?: number;
	kind: CollectionRuleKind;
	priority: number;
	scope: CollectionRuleScope;
	status: CollectionRuleStatus;
}

function deriveRuleTrigger(kind: CollectionRuleKind): "event" | "schedule" {
	return kind === "schedule" ? "schedule" : "event";
}

function buildCollectionRulePatch(args: UpsertCollectionRuleByCodeArgs) {
	return {
		code: args.code,
		config: args.config,
		description: args.description,
		displayName: args.displayName,
		effectiveFrom: args.effectiveFrom,
		effectiveTo: args.effectiveTo,
		kind: args.kind,
		priority: args.priority,
		scope: args.scope,
		status: args.status,
		trigger: deriveRuleTrigger(args.kind),
		updatedAt: Date.now(),
		updatedByActorId: args.actorId,
		version: 1,
	};
}

export async function upsertCollectionRuleByCode(
	args: UpsertCollectionRuleByCodeArgs
): Promise<Id<"collectionRules">> {
	const existing = await args.ctx.db
		.query("collectionRules")
		.withIndex("by_code", (q) => q.eq("code", args.code))
		.first();

	const patch = buildCollectionRulePatch(args);
	if (existing) {
		await args.ctx.db.patch(existing._id, patch);
		return existing._id;
	}

	return args.ctx.db.insert("collectionRules", {
		...patch,
		createdAt: patch.updatedAt,
		createdByActorId: args.actorId,
	});
}
