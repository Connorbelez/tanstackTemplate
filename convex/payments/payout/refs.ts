import { internal } from "../../_generated/api";

/**
 * Shared function references for the payout module.
 *
 * Re-exports from the generated `internal` API so adminPayout.ts
 * and batchPayout.ts can import from a single place.
 */

export const getEligibleDispersalEntriesRef =
	internal.payments.payout.queries.getEligibleDispersalEntries;

export const getActiveLendersRef =
	internal.payments.payout.queries.getActiveLenders;

export const claimEntriesForPayoutRef =
	internal.payments.payout.mutations.claimEntriesForPayout;

export const revertClaimedEntriesRef =
	internal.payments.payout.mutations.revertClaimedEntries;

export const markEntriesDisbursedRef =
	internal.payments.payout.mutations.markEntriesDisbursed;

export const updateLenderPayoutDateRef =
	internal.payments.payout.mutations.updateLenderPayoutDate;

export const getLenderByIdRef = internal.payments.payout.queries.getLenderById;
