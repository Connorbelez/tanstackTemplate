import { v } from "convex/values";

export const balancePreCheckSignalSourceValues = [
	"recent_transfer_failures",
] as const;

export type BalancePreCheckSignalSource =
	(typeof balancePreCheckSignalSourceValues)[number];

export const balancePreCheckBlockingDecisionValues = [
	"defer",
	"suppress",
	"require_operator_review",
] as const;

export type BalancePreCheckBlockingDecision =
	(typeof balancePreCheckBlockingDecisionValues)[number];

export type BalancePreCheckDecision =
	| "proceed"
	| BalancePreCheckBlockingDecision;

export type BalancePreCheckReasonCode =
	| "no_recent_failed_inbound_transfer"
	| "recent_failed_inbound_transfer";

export const balancePreCheckSignalSourceValidator = v.union(
	v.literal("recent_transfer_failures")
);

export const balancePreCheckBlockingDecisionValidator = v.union(
	v.literal("defer"),
	v.literal("suppress"),
	v.literal("require_operator_review")
);

export const balancePreCheckDecisionValidator = v.union(
	v.literal("proceed"),
	v.literal("defer"),
	v.literal("suppress"),
	v.literal("require_operator_review")
);

export const balancePreCheckReasonCodeValidator = v.union(
	v.literal("no_recent_failed_inbound_transfer"),
	v.literal("recent_failed_inbound_transfer")
);
