import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	type CollectionRuleConfig,
	type CollectionRuleKind,
	type CollectionRuleScope,
	type CollectionRuleStatus,
	DEFAULT_BALANCE_PRE_CHECK_CONFIG,
	DEFAULT_COLLECTION_RULE_SCOPE,
	DEFAULT_COLLECTION_RULE_STATUS,
	DEFAULT_SCHEDULE_RULE_CONFIG,
} from "./ruleContract";

type DefaultRuleCode =
	| "balance_pre_check_rule"
	| "late_fee_rule"
	| "retry_rule"
	| "schedule_rule";

interface DefaultCollectionRuleDefinition {
	code: DefaultRuleCode;
	config: CollectionRuleConfig;
	description: string;
	displayName: string;
	kind: CollectionRuleKind;
	priority: number;
	scope: CollectionRuleScope;
	status: CollectionRuleStatus;
	trigger: "event" | "schedule";
	version: number;
}

const SYSTEM_RULE_ACTOR_ID = "system:collection-rule-seed";

export const DEFAULT_COLLECTION_RULES: readonly DefaultCollectionRuleDefinition[] =
	[
		{
			code: "schedule_rule",
			config: DEFAULT_SCHEDULE_RULE_CONFIG,
			description:
				"Creates initial collection plan entries for upcoming obligations inside the scheduling window.",
			displayName: "Initial scheduling",
			kind: "schedule",
			priority: 10,
			scope: DEFAULT_COLLECTION_RULE_SCOPE,
			status: DEFAULT_COLLECTION_RULE_STATUS,
			trigger: "schedule",
			version: 1,
		},
		{
			code: "balance_pre_check_rule",
			config: DEFAULT_BALANCE_PRE_CHECK_CONFIG,
			description:
				"Evaluates recent failed inbound transfer history before attempt creation and defers or blocks collection when the balance-risk signal is active.",
			displayName: "Balance pre-check",
			kind: "balance_pre_check",
			priority: 15,
			scope: DEFAULT_COLLECTION_RULE_SCOPE,
			status: DEFAULT_COLLECTION_RULE_STATUS,
			trigger: "event",
			version: 1,
		},
		{
			code: "retry_rule",
			config: { kind: "retry", maxRetries: 3, backoffBaseDays: 3 },
			description:
				"Schedules retry collection plan entries after failed collection attempts.",
			displayName: "Retry collection",
			kind: "retry",
			priority: 20,
			scope: DEFAULT_COLLECTION_RULE_SCOPE,
			status: DEFAULT_COLLECTION_RULE_STATUS,
			trigger: "event",
			version: 1,
		},
		{
			code: "late_fee_rule",
			config: {
				kind: "late_fee",
				feeCode: "late_fee",
				feeSurface: "borrower_charge",
			},
			description:
				"Creates late-fee obligations when an overdue obligation qualifies for mortgage-fee assessment.",
			displayName: "Late fee assessment",
			kind: "late_fee",
			priority: 30,
			scope: DEFAULT_COLLECTION_RULE_SCOPE,
			status: DEFAULT_COLLECTION_RULE_STATUS,
			trigger: "event",
			version: 1,
		},
	] as const;

export interface SeedCollectionRulesResult {
	created: number;
	ruleIdsByCode: {
		balance_pre_check_rule: Id<"collectionRules">;
		late_fee_rule: Id<"collectionRules">;
		retry_rule: Id<"collectionRules">;
		schedule_rule: Id<"collectionRules">;
	};
	skipped: number;
	updated: number;
}

function serialize(value: unknown) {
	return JSON.stringify(value);
}

function shouldPatchRule(
	rule: Doc<"collectionRules">,
	nextFields: {
		code: DefaultRuleCode;
		config: CollectionRuleConfig;
		description: string;
		displayName: string;
		kind: CollectionRuleKind;
		priority: number;
		scope: CollectionRuleScope;
		status: CollectionRuleStatus;
		trigger: "event" | "schedule";
		version: number;
	}
) {
	return (
		rule.kind !== nextFields.kind ||
		rule.code !== nextFields.code ||
		rule.displayName !== nextFields.displayName ||
		rule.description !== nextFields.description ||
		rule.trigger !== nextFields.trigger ||
		rule.priority !== nextFields.priority ||
		rule.status !== nextFields.status ||
		serialize(rule.scope) !== serialize(nextFields.scope) ||
		serialize(rule.config) !== serialize(nextFields.config) ||
		rule.version !== nextFields.version
	);
}

export async function seedCollectionRulesImpl(
	ctx: Pick<MutationCtx, "db">
): Promise<SeedCollectionRulesResult> {
	let created = 0;
	let skipped = 0;
	let updated = 0;
	const ruleIdsByCode = {} as SeedCollectionRulesResult["ruleIdsByCode"];

	const allRules = await ctx.db.query("collectionRules").collect();

	for (const ruleDef of DEFAULT_COLLECTION_RULES) {
		const existing =
			allRules.find((rule) => rule.code === ruleDef.code) ?? null;
		const resolvedConfig = existing?.config ?? ruleDef.config;
		const resolvedStatus = existing?.status ?? ruleDef.status;
		const resolvedScope = existing?.scope ?? ruleDef.scope;
		const resolvedKind = existing?.kind ?? ruleDef.kind;
		const resolvedDisplayName = existing?.displayName ?? ruleDef.displayName;
		const resolvedDescription = existing?.description ?? ruleDef.description;
		const resolvedVersion = existing?.version ?? ruleDef.version;
		const priority = existing?.priority ?? ruleDef.priority;

		const patch = {
			code: ruleDef.code,
			config: resolvedConfig,
			description: resolvedDescription,
			displayName: resolvedDisplayName,
			kind: resolvedKind,
			priority,
			scope: resolvedScope,
			status: resolvedStatus,
			trigger: existing?.trigger ?? ruleDef.trigger,
			version: resolvedVersion,
		};

		if (existing) {
			ruleIdsByCode[ruleDef.code] = existing._id;

			if (!shouldPatchRule(existing, patch)) {
				skipped++;
				continue;
			}

			await ctx.db.patch(existing._id, {
				...patch,
				updatedAt: Date.now(),
				createdByActorId: existing.createdByActorId ?? SYSTEM_RULE_ACTOR_ID,
				updatedByActorId: existing.updatedByActorId ?? SYSTEM_RULE_ACTOR_ID,
			});
			updated++;
			continue;
		}

		const now = Date.now();
		const ruleId = await ctx.db.insert("collectionRules", {
			...patch,
			createdAt: now,
			updatedAt: now,
			createdByActorId: SYSTEM_RULE_ACTOR_ID,
			updatedByActorId: SYSTEM_RULE_ACTOR_ID,
			priority: ruleDef.priority,
		});
		ruleIdsByCode[ruleDef.code] = ruleId;
		created++;
	}

	return { created, skipped, updated, ruleIdsByCode };
}
