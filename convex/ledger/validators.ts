import { v } from "convex/values";

export const entryTypeValidator = v.union(
	v.literal("MORTGAGE_MINTED"),
	v.literal("SHARES_ISSUED"),
	v.literal("SHARES_TRANSFERRED"),
	v.literal("SHARES_REDEEMED"),
	v.literal("MORTGAGE_BURNED"),
	v.literal("SHARES_RESERVED"),
	v.literal("SHARES_COMMITTED"),
	v.literal("SHARES_VOIDED"),
	v.literal("CORRECTION")
);

export const accountTypeValidator = v.union(
	v.literal("WORLD"),
	v.literal("TREASURY"),
	v.literal("POSITION")
);

export const eventSourceValidator = v.object({
	type: v.union(
		v.literal("user"),
		v.literal("system"),
		v.literal("webhook"),
		v.literal("cron")
	),
	actor: v.optional(v.string()),
	channel: v.optional(v.string()),
});

// ── Tier 1: Strict Primitives ──────────────────────────────────────

export const postEntryArgsValidator = {
	entryType: entryTypeValidator,
	mortgageId: v.string(),
	debitAccountId: v.id("ledger_accounts"),
	creditAccountId: v.id("ledger_accounts"),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	causedBy: v.optional(v.id("ledger_journal_entries")),
	reason: v.optional(v.string()),
	metadata: v.optional(v.any()),
};

export const mintMortgageArgsValidator = {
	mortgageId: v.string(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	metadata: v.optional(v.any()),
};

export const burnMortgageArgsValidator = {
	mortgageId: v.string(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	reason: v.string(),
	metadata: v.optional(v.any()),
};

// ── Tier 2: Convenience Mutations ──────────────────────────────────

export const issueSharesArgsValidator = {
	mortgageId: v.string(),
	lenderId: v.string(),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	metadata: v.optional(v.any()),
};

export const transferSharesArgsValidator = {
	mortgageId: v.string(),
	sellerLenderId: v.string(),
	buyerLenderId: v.string(),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	metadata: v.optional(v.any()),
};

export const redeemSharesArgsValidator = {
	mortgageId: v.string(),
	lenderId: v.string(),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	reason: v.optional(v.string()),
	metadata: v.optional(v.any()),
};
