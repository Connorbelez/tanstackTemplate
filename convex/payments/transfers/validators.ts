/**
 * Convex validators for the transfer domain.
 *
 * Each validator mirrors a corresponding type in ./types.ts so that
 * Convex function argument/return validation stays in sync with the
 * domain model.
 */
import { v } from "convex/values";

// ── Direction ────────────────────────────────────────────────────────
export const directionValidator = v.union(
	v.literal("inbound"),
	v.literal("outbound")
);

// ── Transfer Types ───────────────────────────────────────────────────
export const inboundTransferTypeValidator = v.union(
	v.literal("borrower_interest_collection"),
	v.literal("borrower_principal_collection"),
	v.literal("borrower_late_fee_collection"),
	v.literal("borrower_arrears_cure"),
	v.literal("locking_fee_collection"),
	v.literal("commitment_deposit_collection"),
	v.literal("deal_principal_transfer")
);

export const outboundTransferTypeValidator = v.union(
	v.literal("lender_dispersal_payout"),
	v.literal("lender_principal_return"),
	v.literal("deal_seller_payout")
);

export const transferTypeValidator = v.union(
	// Inbound
	v.literal("borrower_interest_collection"),
	v.literal("borrower_principal_collection"),
	v.literal("borrower_late_fee_collection"),
	v.literal("borrower_arrears_cure"),
	v.literal("locking_fee_collection"),
	v.literal("commitment_deposit_collection"),
	v.literal("deal_principal_transfer"),
	// Outbound
	v.literal("lender_dispersal_payout"),
	v.literal("lender_principal_return"),
	v.literal("deal_seller_payout")
);

// ── Counterparty ─────────────────────────────────────────────────────
export const counterpartyTypeValidator = v.union(
	v.literal("borrower"),
	v.literal("lender"),
	v.literal("investor"),
	v.literal("trust")
);

// ── Provider Codes ───────────────────────────────────────────────────
export const providerCodeValidator = v.union(
	v.literal("manual"),
	v.literal("manual_review"),
	v.literal("mock_pad"),
	v.literal("mock_eft"),
	v.literal("pad_vopay"),
	v.literal("pad_rotessa"),
	v.literal("eft_vopay"),
	v.literal("e_transfer"),
	v.literal("wire"),
	v.literal("plaid_transfer")
);

// ── Pipeline Leg Number ──────────────────────────────────────────────
export const legNumberValidator = v.union(v.literal(1), v.literal(2));

// ── Transfer Statuses ────────────────────────────────────────────────
export const transferStatusValidator = v.union(
	// Machine states
	v.literal("initiated"),
	v.literal("pending"),
	v.literal("processing"),
	v.literal("confirmed"),
	v.literal("failed"),
	v.literal("cancelled"),
	v.literal("reversed"),
	// TODO: Remove legacy statuses once all existing records are migrated
	v.literal("approved"), // LEGACY
	v.literal("completed") // LEGACY
);
