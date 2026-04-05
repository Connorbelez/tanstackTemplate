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
	getBalancePreCheckRuleConfig,
	getCollectionRuleCode,
	getCollectionRuleKind,
	getCollectionRuleScope,
	getCollectionRuleStatus,
	getLateFeeRuleConfig,
	getRetryRuleConfig,
	getScheduleRuleConfig,
} from "./ruleContract";

type DefaultRuleCode =
	| "balance_pre_check_rule"
	| "late_fee_rule"
	| "retry_rule"
	| "schedule_rule";

interface DefaultCollectionRuleDefinition {
	action: string;
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
			action: "create_plan_entry",
			code: "schedule_rule",
			config: { kind: "schedule", delayDays: 5 },
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
			action: "balance_pre_check",
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
			action: "create_retry_entry",
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
			action: "create_late_fee",
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

function buildLegacyParameters(
	config: CollectionRuleConfig
): Record<string, unknown> {
	switch (config.kind) {
		case "schedule":
			return { delayDays: config.delayDays };
		case "retry":
			return {
				backoffBaseDays: config.backoffBaseDays,
				maxRetries: config.maxRetries,
			};
		case "balance_pre_check":
			if ("mode" in config) {
				return {};
			}
			return {
				blockingDecision: config.blockingDecision,
				lookbackDays: config.lookbackDays,
				failureCountThreshold: config.failureCountThreshold,
				...(config.blockingDecision === "defer"
					? { deferDays: config.deferDays }
					: {}),
			};
		case "late_fee":
		case "reschedule_policy":
		case "workout_policy":
			return {};
		default:
			return {};
	}
}

function resolveConfigForExistingRule(
	rule: Doc<"collectionRules">,
	ruleDef: DefaultCollectionRuleDefinition
): CollectionRuleConfig {
	const scheduleConfig = getScheduleRuleConfig(rule);
	if (scheduleConfig) {
		return scheduleConfig;
	}

	const retryConfig = getRetryRuleConfig(rule);
	if (retryConfig) {
		return retryConfig;
	}

	const balancePreCheckConfig = getBalancePreCheckRuleConfig(rule);
	if (balancePreCheckConfig) {
		return balancePreCheckConfig;
	}

	const lateFeeConfig = getLateFeeRuleConfig(rule);
	if (lateFeeConfig) {
		return lateFeeConfig;
	}

	return ruleDef.config;
}

function serialize(value: unknown) {
	return JSON.stringify(value);
}

function shouldPatchRule(
	rule: Doc<"collectionRules">,
	nextFields: {
		action: string;
		code: DefaultRuleCode;
		config: CollectionRuleConfig;
		description: string;
		displayName: string;
		enabled: boolean;
		kind: CollectionRuleKind;
		name: DefaultRuleCode;
		priority: number;
		parameters: Record<string, unknown>;
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
		getCollectionRuleStatus(rule) !== nextFields.status ||
		serialize(getCollectionRuleScope(rule)) !== serialize(nextFields.scope) ||
		serialize(
			resolveConfigForExistingRule(rule, {
				...nextFields,
				priority: rule.priority,
			})
		) !== serialize(nextFields.config) ||
		rule.version !== nextFields.version ||
		rule.name !== nextFields.name ||
		rule.action !== nextFields.action ||
		serialize(rule.parameters ?? {}) !== serialize(nextFields.parameters) ||
		rule.enabled !== nextFields.enabled
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
			allRules.find(
				(rule) =>
					getCollectionRuleCode(rule) === ruleDef.code ||
					rule.name === ruleDef.code
			) ?? null;

		const resolvedConfig =
			existing !== null
				? resolveConfigForExistingRule(existing, ruleDef)
				: ruleDef.config;
		const resolvedStatus =
			existing !== null ? getCollectionRuleStatus(existing) : ruleDef.status;
		const resolvedScope =
			existing !== null ? getCollectionRuleScope(existing) : ruleDef.scope;
		const resolvedKind =
			existing !== null
				? (getCollectionRuleKind(existing) ?? ruleDef.kind)
				: ruleDef.kind;
		const resolvedDisplayName = existing?.displayName ?? ruleDef.displayName;
		const resolvedDescription = existing?.description ?? ruleDef.description;
		const resolvedVersion = existing?.version ?? ruleDef.version;
		const enabled = resolvedStatus === "active";
		const parameters =
			existing?.parameters &&
			typeof existing.parameters === "object" &&
			!Array.isArray(existing.parameters) &&
			Object.keys(existing.parameters).length > 0
				? (existing.parameters as Record<string, unknown>)
				: buildLegacyParameters(resolvedConfig);
		const priority = existing?.priority ?? ruleDef.priority;

		const patch = {
			action: existing?.action ?? ruleDef.action,
			code: ruleDef.code,
			config: resolvedConfig,
			description: resolvedDescription,
			displayName: resolvedDisplayName,
			enabled,
			kind: resolvedKind,
			name: ruleDef.code,
			priority,
			parameters,
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
