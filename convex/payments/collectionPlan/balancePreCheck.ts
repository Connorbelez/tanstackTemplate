import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type {
	BalancePreCheckDecision,
	BalancePreCheckReasonCode,
	BalancePreCheckSignalSource,
} from "./balancePreCheckContract";
import {
	compareCollectionRules,
	getBalancePreCheckRuleConfig,
	getCollectionRuleKind,
	isCollectionRuleActive,
	isCollectionRuleEffectiveAt,
	matchesCollectionRuleScope,
} from "./ruleContract";

const MS_PER_DAY = 86_400_000;
const MIN_SIGNAL_QUERY_LIMIT = 25;
const INSUFFICIENT_FUNDS_MARKERS = [
	"insufficient funds",
	"insufficient_funds",
	"non sufficient funds",
	"non-sufficient funds",
	"nsf",
	"r01",
];

export type BalancePreCheckExecutionReasonCode =
	| "balance_pre_check_deferred"
	| "balance_pre_check_suppressed"
	| "balance_pre_check_operator_review_required";

export interface BalancePreCheckSnapshot {
	decision: BalancePreCheckDecision;
	evaluatedAt: number;
	nextEvaluationAt?: number;
	reasonCode: BalancePreCheckReasonCode;
	reasonDetail: string;
	ruleId: Id<"collectionRules">;
	signalSource: BalancePreCheckSignalSource;
}

interface EvaluateBalancePreCheckArgs {
	borrowerId: Id<"borrowers">;
	mortgageId: Id<"mortgages">;
	requestedAt: number;
}

interface BalancePreCheckPassResult {
	outcome: "proceed";
	snapshot: BalancePreCheckSnapshot;
}

interface BalancePreCheckBlockResult {
	executionReasonCode: BalancePreCheckExecutionReasonCode;
	executionReasonDetail: string;
	outcome: "block";
	snapshot: BalancePreCheckSnapshot;
}

export type BalancePreCheckEvaluation =
	| BalancePreCheckPassResult
	| BalancePreCheckBlockResult
	| null;

function normalizeSignalText(value: string | undefined) {
	return value?.trim().toLowerCase() ?? "";
}

function isInsufficientFundsSignal(transfer: {
	failureCode?: string;
	failureReason?: string;
}) {
	const haystack = [
		normalizeSignalText(transfer.failureCode),
		normalizeSignalText(transfer.failureReason),
	]
		.filter(Boolean)
		.join(" ");

	return INSUFFICIENT_FUNDS_MARKERS.some((marker) => haystack.includes(marker));
}

function mapDecisionToExecutionReasonCode(
	decision: Exclude<BalancePreCheckDecision, "proceed">
): BalancePreCheckExecutionReasonCode {
	switch (decision) {
		case "defer":
			return "balance_pre_check_deferred";
		case "suppress":
			return "balance_pre_check_suppressed";
		case "require_operator_review":
			return "balance_pre_check_operator_review_required";
		default:
			return "balance_pre_check_operator_review_required";
	}
}

function buildReasonDetail(args: {
	failureCount: number;
	latestFailure?: Pick<
		Doc<"transferRequests">,
		"failureCode" | "failureReason"
	>;
	lookbackDays: number;
}) {
	const latestSignal = [
		args.latestFailure?.failureCode,
		args.latestFailure?.failureReason,
	]
		.filter(Boolean)
		.join(" / ");

	const suffix =
		latestSignal.length > 0 ? ` Latest signal: ${latestSignal}.` : "";
	return `Found ${args.failureCount} qualifying failed inbound transfer(s) in the last ${args.lookbackDays} day(s).${suffix}`;
}

async function loadApplicableBalancePreCheckRule(
	ctx: Pick<MutationCtx, "db">,
	args: { asOfMs: number; mortgageId: Id<"mortgages"> }
) {
	const candidates = await ctx.db
		.query("collectionRules")
		.withIndex("by_trigger", (q) => q.eq("trigger", "event"))
		.collect();

	return (
		candidates
			.filter((rule) => getCollectionRuleKind(rule) === "balance_pre_check")
			.filter((rule) => isCollectionRuleActive(rule))
			.filter((rule) => isCollectionRuleEffectiveAt(rule, args.asOfMs))
			.filter((rule) => matchesCollectionRuleScope(rule, args.mortgageId))
			.sort(compareCollectionRules)[0] ?? null
	);
}

export function buildBalancePreCheckPatch(snapshot: BalancePreCheckSnapshot) {
	return {
		balancePreCheckDecision: snapshot.decision,
		balancePreCheckReasonCode: snapshot.reasonCode,
		balancePreCheckReasonDetail: snapshot.reasonDetail,
		balancePreCheckSignalSource: snapshot.signalSource,
		balancePreCheckRuleId: snapshot.ruleId,
		balancePreCheckEvaluatedAt: snapshot.evaluatedAt,
		balancePreCheckNextEvaluationAt: snapshot.nextEvaluationAt,
	};
}

export async function evaluateBalancePreCheckForPlanEntry(
	ctx: Pick<MutationCtx, "db">,
	args: EvaluateBalancePreCheckArgs
): Promise<BalancePreCheckEvaluation> {
	const rule = await loadApplicableBalancePreCheckRule(ctx, {
		asOfMs: args.requestedAt,
		mortgageId: args.mortgageId,
	});
	if (!rule) {
		return null;
	}

	const config = getBalancePreCheckRuleConfig(rule);
	if (!config) {
		return null;
	}

	const lookbackStart = args.requestedAt - config.lookbackDays * MS_PER_DAY;
	const failedTransfers = await ctx.db
		.query("transferRequests")
		.withIndex("by_counterparty_status", (q) =>
			q
				.eq("counterpartyType", "borrower")
				.eq("counterpartyId", `${args.borrowerId}`)
				.eq("status", "failed")
		)
		.order("desc")
		.take(
			Math.max(
				MIN_SIGNAL_QUERY_LIMIT,
				config.failureCountThreshold * MIN_SIGNAL_QUERY_LIMIT
			)
		);

	const qualifyingFailures = failedTransfers.filter(
		(transfer) =>
			transfer.direction === "inbound" &&
			transfer.createdAt >= lookbackStart &&
			isInsufficientFundsSignal(transfer)
	);

	if (qualifyingFailures.length < config.failureCountThreshold) {
		return {
			outcome: "proceed",
			snapshot: {
				decision: "proceed",
				evaluatedAt: args.requestedAt,
				reasonCode: "no_recent_failed_inbound_transfer",
				reasonDetail:
					"No recent qualifying failed inbound transfers matched the balance pre-check window.",
				ruleId: rule._id,
				signalSource: config.signalSource,
			},
		};
	}

	const nextEvaluationAt =
		config.blockingDecision === "defer"
			? args.requestedAt + config.deferDays * MS_PER_DAY
			: undefined;
	const snapshot: BalancePreCheckSnapshot = {
		decision: config.blockingDecision,
		evaluatedAt: args.requestedAt,
		nextEvaluationAt,
		reasonCode: "recent_failed_inbound_transfer",
		reasonDetail: buildReasonDetail({
			failureCount: qualifyingFailures.length,
			latestFailure: qualifyingFailures[0],
			lookbackDays: config.lookbackDays,
		}),
		ruleId: rule._id,
		signalSource: config.signalSource,
	};

	return {
		outcome: "block",
		executionReasonCode: mapDecisionToExecutionReasonCode(
			config.blockingDecision
		),
		executionReasonDetail: snapshot.reasonDetail,
		snapshot,
	};
}
