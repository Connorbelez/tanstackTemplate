import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import {
	type BalancePreCheckBlockingDecision,
	balancePreCheckSignalSourceValidator,
} from "./balancePreCheckContract";

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

const LEGACY_RULE_NAME_TO_KIND: Record<string, CollectionRuleKind> = {
	late_fee_rule: "late_fee",
	retry_rule: "retry",
	schedule_rule: "schedule",
};

const DEFAULT_RULE_DISPLAY_NAMES: Record<CollectionRuleKind, string> = {
	balance_pre_check: "Balance pre-check",
	late_fee: "Late fee assessment",
	reschedule_policy: "Borrower reschedule policy",
	retry: "Retry collection",
	schedule: "Initial scheduling",
	workout_policy: "Workout strategy",
};

const DEFAULT_LATE_FEE_CONFIG: LateFeeRuleConfig = {
	kind: "late_fee",
	feeCode: "late_fee",
	feeSurface: "borrower_charge",
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

function readLegacyNumberParameter(
	parameters: unknown,
	key: string
): number | undefined {
	if (
		parameters &&
		typeof parameters === "object" &&
		!Array.isArray(parameters)
	) {
		const value = (parameters as Record<string, unknown>)[key];
		if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
			return value;
		}
	}

	return undefined;
}

function readLegacyStringParameter(
	parameters: unknown,
	key: string
): string | undefined {
	if (
		parameters &&
		typeof parameters === "object" &&
		!Array.isArray(parameters) &&
		typeof (parameters as Record<string, unknown>)[key] === "string"
	) {
		return (parameters as Record<string, string>)[key];
	}

	return undefined;
}

function isBalancePreCheckBlockingDecision(
	value: unknown
): value is BalancePreCheckBlockingDecision {
	return (
		value === "defer" ||
		value === "suppress" ||
		value === "require_operator_review"
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

	if (rule.name) {
		return LEGACY_RULE_NAME_TO_KIND[rule.name] ?? null;
	}

	return null;
}

export function getCollectionRuleCode(rule: Doc<"collectionRules">): string {
	const kind = getCollectionRuleKind(rule);
	return rule.code ?? rule.name ?? (kind ? `${kind}_rule` : String(rule._id));
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
	if (rule.status) {
		return rule.status;
	}

	return rule.enabled === false ? "disabled" : "active";
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
	if (rule.config?.kind === "schedule") {
		return rule.config;
	}

	const kind = getCollectionRuleKind(rule);
	if (kind !== "schedule") {
		return null;
	}

	return {
		kind: "schedule",
		delayDays: readLegacyNumberParameter(rule.parameters, "delayDays") ?? 5,
	};
}

export function getRetryRuleConfig(
	rule: Doc<"collectionRules">
): RetryRuleConfig | null {
	if (rule.config?.kind === "retry") {
		return rule.config;
	}

	const kind = getCollectionRuleKind(rule);
	if (kind !== "retry") {
		return null;
	}

	return {
		kind: "retry",
		maxRetries: readLegacyNumberParameter(rule.parameters, "maxRetries") ?? 3,
		backoffBaseDays:
			readLegacyNumberParameter(rule.parameters, "backoffBaseDays") ?? 3,
	};
}

export function getLateFeeRuleConfig(
	rule: Doc<"collectionRules">
): LateFeeRuleConfig | null {
	if (rule.config?.kind === "late_fee") {
		return rule.config;
	}

	const kind = getCollectionRuleKind(rule);
	if (kind !== "late_fee") {
		return null;
	}

	return DEFAULT_LATE_FEE_CONFIG;
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

	const kind = getCollectionRuleKind(rule);
	if (kind !== "balance_pre_check") {
		return null;
	}

	const blockingDecision = readLegacyStringParameter(
		rule.parameters,
		"blockingDecision"
	);
	const resolvedBlockingDecision = isBalancePreCheckBlockingDecision(
		blockingDecision
	)
		? blockingDecision
		: DEFAULT_BALANCE_PRE_CHECK_CONFIG.blockingDecision;
	const lookbackDays =
		readLegacyNumberParameter(rule.parameters, "lookbackDays") ??
		DEFAULT_BALANCE_PRE_CHECK_CONFIG.lookbackDays;
	const failureCountThreshold =
		readLegacyNumberParameter(rule.parameters, "failureCountThreshold") ??
		DEFAULT_BALANCE_PRE_CHECK_CONFIG.failureCountThreshold;
	const deferDays =
		readLegacyNumberParameter(rule.parameters, "deferDays") ??
		DEFAULT_BALANCE_PRE_CHECK_CONFIG.deferDays;

	if (resolvedBlockingDecision === "defer") {
		return {
			kind: "balance_pre_check",
			signalSource: DEFAULT_BALANCE_PRE_CHECK_CONFIG.signalSource,
			lookbackDays,
			failureCountThreshold,
			blockingDecision: "defer",
			deferDays,
		};
	}

	return {
		kind: "balance_pre_check",
		signalSource: DEFAULT_BALANCE_PRE_CHECK_CONFIG.signalSource,
		lookbackDays,
		failureCountThreshold,
		blockingDecision: resolvedBlockingDecision,
	};
}
