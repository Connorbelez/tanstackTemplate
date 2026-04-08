import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { balancePreCheckSignalSourceValidator } from "./balancePreCheckContract";

export type CollectionRuleKind =
	| "schedule"
	| "retry"
	| "late_fee"
	| "balance_pre_check"
	| "reschedule_policy"
	| "workout_policy";

export type CollectionRuleStatus = "draft" | "active" | "disabled" | "archived";

export type CollectionRuleScope =
	| { scopeType: "global" }
	| { scopeType: "mortgage"; mortgageId: Id<"mortgages"> };

export interface ScheduleRuleConfig {
	delayDays: number;
	kind: "schedule";
}

export interface RetryRuleConfig {
	backoffBaseDays: number;
	kind: "retry";
	maxRetries: number;
}

export interface LateFeeRuleConfig {
	feeCode: "late_fee";
	feeSurface: "borrower_charge";
	kind: "late_fee";
}

interface BalancePreCheckRuleConfigBase {
	failureCountThreshold: number;
	kind: "balance_pre_check";
	lookbackDays: number;
	signalSource: "recent_transfer_failures";
}

export interface DeferBalancePreCheckRuleConfig
	extends BalancePreCheckRuleConfigBase {
	blockingDecision: "defer";
	deferDays: number;
}

export interface SuppressBalancePreCheckRuleConfig
	extends BalancePreCheckRuleConfigBase {
	blockingDecision: "suppress";
}

export interface RequireOperatorReviewBalancePreCheckRuleConfig
	extends BalancePreCheckRuleConfigBase {
	blockingDecision: "require_operator_review";
}

export type BalancePreCheckRuleConfig =
	| DeferBalancePreCheckRuleConfig
	| SuppressBalancePreCheckRuleConfig
	| RequireOperatorReviewBalancePreCheckRuleConfig;

export interface LegacyBalancePreCheckRuleConfig {
	kind: "balance_pre_check";
	mode: "placeholder";
}

export interface ReschedulePolicyRuleConfig {
	kind: "reschedule_policy";
	mode: "placeholder";
}

export interface WorkoutPolicyRuleConfig {
	kind: "workout_policy";
	mode: "placeholder";
}

export type CollectionRuleConfig =
	| ScheduleRuleConfig
	| RetryRuleConfig
	| LateFeeRuleConfig
	| BalancePreCheckRuleConfig
	| LegacyBalancePreCheckRuleConfig
	| ReschedulePolicyRuleConfig
	| WorkoutPolicyRuleConfig;

export const collectionRuleKindValidator = v.union(
	v.literal("schedule"),
	v.literal("retry"),
	v.literal("late_fee"),
	v.literal("balance_pre_check"),
	v.literal("reschedule_policy"),
	v.literal("workout_policy")
);

export const collectionRuleStatusValidator = v.union(
	v.literal("draft"),
	v.literal("active"),
	v.literal("disabled"),
	v.literal("archived")
);

export const collectionRuleScopeValidator = v.union(
	v.object({
		scopeType: v.literal("global"),
	}),
	v.object({
		scopeType: v.literal("mortgage"),
		mortgageId: v.id("mortgages"),
	})
);

export const collectionRuleConfigValidator = v.union(
	v.object({
		kind: v.literal("schedule"),
		delayDays: v.number(),
	}),
	v.object({
		kind: v.literal("retry"),
		maxRetries: v.number(),
		backoffBaseDays: v.number(),
	}),
	v.object({
		kind: v.literal("late_fee"),
		feeCode: v.literal("late_fee"),
		feeSurface: v.literal("borrower_charge"),
	}),
	v.object({
		kind: v.literal("balance_pre_check"),
		signalSource: balancePreCheckSignalSourceValidator,
		lookbackDays: v.number(),
		failureCountThreshold: v.number(),
		blockingDecision: v.literal("defer"),
		deferDays: v.number(),
	}),
	v.object({
		kind: v.literal("balance_pre_check"),
		signalSource: balancePreCheckSignalSourceValidator,
		lookbackDays: v.number(),
		failureCountThreshold: v.number(),
		blockingDecision: v.literal("suppress"),
	}),
	v.object({
		kind: v.literal("balance_pre_check"),
		signalSource: balancePreCheckSignalSourceValidator,
		lookbackDays: v.number(),
		failureCountThreshold: v.number(),
		blockingDecision: v.literal("require_operator_review"),
	}),
	v.object({
		kind: v.literal("balance_pre_check"),
		mode: v.literal("placeholder"),
	}),
	v.object({
		kind: v.literal("reschedule_policy"),
		mode: v.literal("placeholder"),
	}),
	v.object({
		kind: v.literal("workout_policy"),
		mode: v.literal("placeholder"),
	})
);

export const DEFAULT_COLLECTION_RULE_SCOPE: CollectionRuleScope = {
	scopeType: "global",
};

export const DEFAULT_COLLECTION_RULE_STATUS: CollectionRuleStatus = "active";

const DEFAULT_RULE_DISPLAY_NAMES: Record<CollectionRuleKind, string> = {
	balance_pre_check: "Balance pre-check",
	late_fee: "Late fee assessment",
	reschedule_policy: "Borrower reschedule policy",
	retry: "Retry collection",
	schedule: "Initial scheduling",
	workout_policy: "Workout strategy",
};

export const DEFAULT_BALANCE_PRE_CHECK_CONFIG: DeferBalancePreCheckRuleConfig =
	{
		kind: "balance_pre_check",
		signalSource: "recent_transfer_failures",
		lookbackDays: 14,
		failureCountThreshold: 1,
		blockingDecision: "defer",
		deferDays: 3,
	};

export const DEFAULT_SCHEDULE_RULE_CONFIG: ScheduleRuleConfig = {
	kind: "schedule",
	delayDays: 5,
};

function isCollectionRuleKind(value: unknown): value is CollectionRuleKind {
	return (
		value === "schedule" ||
		value === "retry" ||
		value === "late_fee" ||
		value === "balance_pre_check" ||
		value === "reschedule_policy" ||
		value === "workout_policy"
	);
}

export function getCollectionRuleKind(
	rule: Doc<"collectionRules">
): CollectionRuleKind | null {
	const configKind = rule.config?.kind;
	if (rule.kind && configKind && rule.kind !== configKind) {
		throw new Error(
			`Collection rule kind mismatch for ${rule._id}: rule.kind=${rule.kind} config.kind=${configKind}`
		);
	}

	if (rule.kind) {
		return rule.kind;
	}
	if (isCollectionRuleKind(configKind)) {
		return configKind;
	}

	return null;
}

export function getCollectionRuleCode(rule: Doc<"collectionRules">): string {
	const kind = getCollectionRuleKind(rule);
	return rule.code ?? (kind ? `${kind}_rule` : String(rule._id));
}

export function getCollectionRuleDisplayName(
	rule: Doc<"collectionRules">
): string {
	const kind = getCollectionRuleKind(rule);
	return rule.displayName ?? (kind ? DEFAULT_RULE_DISPLAY_NAMES[kind] : "Rule");
}

export function getCollectionRuleStatus(
	rule: Doc<"collectionRules">
): CollectionRuleStatus {
	return rule.status;
}

export function isCollectionRuleActive(rule: Doc<"collectionRules">): boolean {
	return getCollectionRuleStatus(rule) === "active";
}

export function getCollectionRuleScope(
	rule: Doc<"collectionRules">
): CollectionRuleScope {
	if (rule.scope?.scopeType === "mortgage") {
		return rule.scope;
	}

	return DEFAULT_COLLECTION_RULE_SCOPE;
}

export function matchesCollectionRuleScope(
	rule: Doc<"collectionRules">,
	mortgageId?: Id<"mortgages">
): boolean {
	const scope = getCollectionRuleScope(rule);
	if (scope.scopeType === "global") {
		return true;
	}

	return mortgageId !== undefined && scope.mortgageId === mortgageId;
}

export function isCollectionRuleEffectiveAt(
	rule: Doc<"collectionRules">,
	asOfMs: number
): boolean {
	if (rule.effectiveFrom !== undefined && asOfMs < rule.effectiveFrom) {
		return false;
	}

	if (rule.effectiveTo !== undefined && asOfMs > rule.effectiveTo) {
		return false;
	}

	return true;
}

export function compareCollectionRules(
	left: Doc<"collectionRules">,
	right: Doc<"collectionRules">
): number {
	if (left.priority !== right.priority) {
		return left.priority - right.priority;
	}

	const leftCode = getCollectionRuleCode(left);
	const rightCode = getCollectionRuleCode(right);
	if (leftCode !== rightCode) {
		return leftCode.localeCompare(rightCode);
	}

	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}

	return String(left._id).localeCompare(String(right._id));
}

export function getScheduleRuleConfig(
	rule: Doc<"collectionRules">
): ScheduleRuleConfig | null {
	return rule.config?.kind === "schedule" ? rule.config : null;
}

export function getRetryRuleConfig(
	rule: Doc<"collectionRules">
): RetryRuleConfig | null {
	return rule.config?.kind === "retry" ? rule.config : null;
}

export function getLateFeeRuleConfig(
	rule: Doc<"collectionRules">
): LateFeeRuleConfig | null {
	return rule.config?.kind === "late_fee" ? rule.config : null;
}

export function getBalancePreCheckRuleConfig(
	rule: Doc<"collectionRules">
): BalancePreCheckRuleConfig | null {
	if (
		rule.config?.kind === "balance_pre_check" &&
		"signalSource" in rule.config
	) {
		if (rule.config.blockingDecision === "defer") {
			return {
				kind: "balance_pre_check",
				signalSource: rule.config.signalSource,
				lookbackDays: rule.config.lookbackDays,
				failureCountThreshold: rule.config.failureCountThreshold,
				blockingDecision: "defer",
				deferDays: rule.config.deferDays,
			};
		}

		return {
			kind: "balance_pre_check",
			signalSource: rule.config.signalSource,
			lookbackDays: rule.config.lookbackDays,
			failureCountThreshold: rule.config.failureCountThreshold,
			blockingDecision: rule.config.blockingDecision,
		};
	}

	return null;
}
