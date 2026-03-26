import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * Shared function references for the payout module.
 *
 * Uses makeFunctionReference instead of `internal.*` because
 * convex codegen has a pre-existing issue that prevents
 * regenerating API types for this module. Both adminPayout.ts
 * and batchPayout.ts import from here to avoid duplication.
 */

export const getEligibleDispersalEntriesRef = makeFunctionReference<
	"query",
	{ lenderId: Id<"lenders">; today: string },
	Doc<"dispersalEntries">[]
>("payments/payout/queries:getEligibleDispersalEntries");

export const getLendersWithPayableBalanceRef = makeFunctionReference<
	"query",
	Record<string, never>,
	Doc<"lenders">[]
>("payments/payout/queries:getLendersWithPayableBalance");

export const markEntriesDisbursedRef = makeFunctionReference<
	"mutation",
	{ entryIds: Id<"dispersalEntries">[]; payoutDate: string },
	null
>("payments/payout/mutations:markEntriesDisbursed");

export const updateLenderPayoutDateRef = makeFunctionReference<
	"mutation",
	{ lenderId: Id<"lenders">; payoutDate: string },
	null
>("payments/payout/mutations:updateLenderPayoutDate");

export const getLenderByIdRef = makeFunctionReference<
	"query",
	{ lenderId: Id<"lenders"> },
	Doc<"lenders"> | null
>("payments/payout/queries:getLenderById");
