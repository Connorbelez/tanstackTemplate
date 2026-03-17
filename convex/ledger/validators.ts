import { type Validator, v } from "convex/values";
import {
	ACCOUNT_TYPES,
	ENTRY_TYPES,
	EVENT_SOURCE_TYPES,
	RESERVATION_STATUSES,
} from "./types";

// ── Helper: derive a v.union() validator from a readonly string array ─
// Single source of truth lives in types.ts; validators are derived here.
function literalUnion<T extends readonly string[]>(
	values: T
): Validator<T[number], "required", never> {
	const literals = values.map((val) => v.literal(val));
	return v.union(
		...(literals as [
			ReturnType<typeof v.literal>,
			ReturnType<typeof v.literal>,
			...ReturnType<typeof v.literal>[],
		])
	) as unknown as Validator<T[number], "required", never>;
}

export const entryTypeValidator = literalUnion(ENTRY_TYPES);

export const accountTypeValidator = literalUnion(ACCOUNT_TYPES);

export const eventSourceValidator = v.object({
	type: literalUnion(EVENT_SOURCE_TYPES),
	actor: v.optional(v.string()),
	channel: v.optional(v.string()),
});

export const reservationStatusValidator = literalUnion(RESERVATION_STATUSES);

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

export const postCorrectionArgsValidator = {
	mortgageId: v.string(),
	debitAccountId: v.id("ledger_accounts"),
	creditAccountId: v.id("ledger_accounts"),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	causedBy: v.id("ledger_journal_entries"),
	reason: v.string(),
	metadata: v.optional(v.any()),
};

// ── Tier 3: Two-Phase Reservation ───────────────────────────────────

export const reserveSharesArgsValidator = {
	mortgageId: v.string(),
	sellerLenderId: v.string(),
	buyerLenderId: v.string(),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
	dealId: v.optional(v.string()),
	metadata: v.optional(v.any()),
};

export const commitReservationArgsValidator = {
	reservationId: v.id("ledger_reservations"),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
};

export const voidReservationArgsValidator = {
	reservationId: v.id("ledger_reservations"),
	reason: v.string(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: eventSourceValidator,
};
