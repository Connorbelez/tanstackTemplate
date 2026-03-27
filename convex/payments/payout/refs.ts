import type { FunctionReference } from "convex/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * Shared function references for the payout module.
 *
 * Re-exports from the generated `internal` API so adminPayout.ts
 * and batchPayout.ts can import from a single place.
 *
 * NOTE: All exports require explicit FunctionReference annotations rather than
 * `typeof internal.*`. Because refs.ts is a non-function file in convex/, Convex
 * codegen includes it in api.d.ts, creating a circular type dependency:
 *   refs.ts → internal → api.d.ts → refs.ts
 * Explicit FunctionReference<...> types from convex/server break the cycle.
 */

export const getEligibleDispersalEntriesRef: FunctionReference<
	"query",
	"internal",
	{ lenderId: Id<"lenders">; today: string },
	Doc<"dispersalEntries">[]
> = internal.payments.payout.queries.getEligibleDispersalEntries;

export const getActiveLendersRef: FunctionReference<
	"query",
	"internal",
	Record<string, never>,
	Doc<"lenders">[]
> = internal.payments.payout.queries.getActiveLenders;

export const claimEntriesForPayoutRef: FunctionReference<
	"mutation",
	"internal",
	{ entryIds: Id<"dispersalEntries">[]; payoutDate: string },
	null
> = internal.payments.payout.mutations.claimEntriesForPayout;

export const revertClaimedEntriesRef: FunctionReference<
	"mutation",
	"internal",
	{ entryIds: Id<"dispersalEntries">[] },
	null
> = internal.payments.payout.mutations.revertClaimedEntries;

export const markEntriesDisbursedRef: FunctionReference<
	"mutation",
	"internal",
	{ entryIds: Id<"dispersalEntries">[]; payoutDate: string },
	null
> = internal.payments.payout.mutations.markEntriesDisbursed;

export const updateLenderPayoutDateRef: FunctionReference<
	"mutation",
	"internal",
	{ lenderId: Id<"lenders">; payoutDate: string },
	null
> = internal.payments.payout.mutations.updateLenderPayoutDate;

export const getLenderByIdRef: FunctionReference<
	"query",
	"internal",
	{ lenderId: Id<"lenders"> },
	Doc<"lenders"> | null
> = internal.payments.payout.queries.getLenderById;
