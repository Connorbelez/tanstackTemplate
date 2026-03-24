import { v } from "convex/values";
import { sourceValidator } from "../../engine/validators";

export const cashEntryTypeValidator = v.union(
	v.literal("OBLIGATION_ACCRUED"),
	v.literal("CASH_RECEIVED"),
	v.literal("CASH_APPLIED"),
	v.literal("LENDER_PAYABLE_CREATED"),
	v.literal("SERVICING_FEE_RECOGNIZED"),
	v.literal("LENDER_PAYOUT_SENT"),
	v.literal("OBLIGATION_WAIVED"),
	v.literal("OBLIGATION_WRITTEN_OFF"),
	v.literal("REVERSAL"),
	v.literal("CORRECTION"),
	v.literal("SUSPENSE_ESCALATED"),
	v.literal("SUSPENSE_ROUTED")
);

export const postCashCorrectionArgsValidator = {
	originalEntryId: v.id("cash_ledger_journal_entries"),
	reason: v.string(),
	source: sourceValidator,
	effectiveDate: v.string(),
	replacement: v.optional(
		v.object({
			amount: v.number(),
			debitAccountId: v.id("cash_ledger_accounts"),
			creditAccountId: v.id("cash_ledger_accounts"),
			entryType: cashEntryTypeValidator,
			metadata: v.optional(v.any()),
		})
	),
};

export const postCashEntryArgsValidator = {
	entryType: cashEntryTypeValidator,
	effectiveDate: v.string(),
	amount: v.number(),
	dealId: v.optional(v.id("deals")),
	debitAccountId: v.id("cash_ledger_accounts"),
	creditAccountId: v.id("cash_ledger_accounts"),
	idempotencyKey: v.string(),
	mortgageId: v.optional(v.id("mortgages")),
	obligationId: v.optional(v.id("obligations")),
	attemptId: v.optional(v.id("collectionAttempts")),
	dispersalEntryId: v.optional(v.id("dispersalEntries")),
	transferRequestId: v.optional(v.id("transferRequests")),
	lenderId: v.optional(v.id("lenders")),
	borrowerId: v.optional(v.id("borrowers")),
	postingGroupId: v.optional(v.string()),
	causedBy: v.optional(v.id("cash_ledger_journal_entries")),
	reason: v.optional(v.string()),
	source: sourceValidator,
	metadata: v.optional(v.any()),
};
