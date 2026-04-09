import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { unixMsToBusinessDate } from "../../lib/businessDates";
import { effectPayloadValidator } from "../validators";

const dealEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("deals"),
	entityType: v.literal("deal"),
};

/**
 * Effect: reserves shares in the ledger for a deal.
 * Fires when a deal transitions to lawyerOnboarding.pending → lawyerOnboarding.approved
 * (i.e., the shares reservation happens when the lawyer approves the deal).
 */
export const reserveShares = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		// 1. Fetch the deal to get mortgageId and fractional share amount
		const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
			dealId,
		});

		if (!deal) {
			console.error(`[reserveShares] Deal not found: ${dealId}`);
			return; // Graceful failure - deal stays in pending
		}

		// 2. Look up any existing reservation for this deal
		const existingReservation = await ctx.runQuery(
			internal.ledger.queries.getReservationByDealId,
			{ dealId }
		);

		if (existingReservation) {
			console.info(
				`[reserveShares] Reservation already exists for deal ${dealId}: ${existingReservation._id}`
			);
			// Link the reservation to the deal if not already linked
			if (!deal.reservationId) {
				await ctx.runMutation(internal.deals.queries.setReservationId, {
					dealId,
					reservationId: existingReservation._id,
				});
			}
			return;
		}

		// 3. Look up the seller's position account to get the sellerLenderId
		const sellerAccount = await ctx.runQuery(
			internal.ledger.queries.getAccountByMortgageAndLender,
			{
				mortgageId: deal.mortgageId,
				lenderId: deal.sellerId,
			}
		);

		// 4. Look up the buyer's position account to get the buyerLenderId
		const buyerAccount = await ctx.runQuery(
			internal.ledger.queries.getAccountByMortgageAndLender,
			{
				mortgageId: deal.mortgageId,
				lenderId: deal.buyerId,
			}
		);

		if (!(sellerAccount && buyerAccount)) {
			console.error(
				`[reserveShares] Could not find position accounts for deal ${dealId}: seller=${deal.sellerId}, buyer=${deal.buyerId}`
			);
			return; // Graceful failure - deal stays in pending
		}

		const sellerLenderId = sellerAccount.lenderId ?? deal.sellerId;
		const buyerLenderId = buyerAccount.lenderId ?? deal.buyerId;

		// 5. Calculate the amount (fractional share of mortgage value)
		// For now, use fractionalShare as the amount (in basis points, e.g., 5000 = 50%)
		const amount = deal.fractionalShare;

		// 6. Create the reservation
		const today = unixMsToBusinessDate(Date.now());

		try {
			const result = await ctx.runMutation(
				internal.ledger.mutations.reserveShares,
				{
					mortgageId: deal.mortgageId,
					sellerLenderId,
					buyerLenderId,
					amount,
					effectiveDate: today,
					idempotencyKey: `deal:${dealId}:reserve`,
					source: { type: "system", channel: "effect" },
					dealId,
				}
			);

			// 7. Link the reservation to the deal
			await ctx.runMutation(internal.deals.queries.setReservationId, {
				dealId,
				reservationId: result.reservationId,
			});

			console.info(
				`[reserveShares] Created reservation ${result.reservationId} for deal ${dealId}`
			);
		} catch (error) {
			console.error(
				`[reserveShares] Failed to create reservation for deal ${dealId}:`,
				error
			);
			// Graceful failure - deal stays in lawyerOnboarding.pending
		}
	},
});

/**
 * Effect: voids a previously reserved share allocation.
 * Fires when a deal is cancelled (any state → CANCELLED).
 */
export const voidReservation = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		// 1. Fetch the deal to get the reservationId
		const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
			dealId,
		});

		if (!deal) {
			console.error(`[voidReservation] Deal not found: ${dealId}`);
			return;
		}

		// 2. Exit early if no reservation exists (deal cancelled before lock)
		if (!deal.reservationId) {
			console.info(
				`[voidReservation] No reservation for deal ${dealId} - nothing to void`
			);
			return;
		}

		// 3. Check if reservation is in a voidable state
		const reservation = await ctx.runQuery(
			internal.ledger.queries.getReservationById,
			{ reservationId: deal.reservationId }
		);

		if (!reservation) {
			console.error(
				`[voidReservation] Reservation not found: ${deal.reservationId}`
			);
			return;
		}

		if (reservation.status === "voided") {
			console.info(
				`[voidReservation] Reservation already voided: ${deal.reservationId}`
			);
			return;
		}

		if (reservation.status === "committed") {
			console.warn(
				`[voidReservation] Cannot void committed reservation: ${deal.reservationId}`
			);
			return;
		}

		// 4. Void the reservation
		const today = unixMsToBusinessDate(Date.now());

		try {
			await ctx.runMutation(internal.ledger.mutations.voidReservation, {
				reservationId: deal.reservationId,
				reason: args.payload?.reason ?? `Deal cancelled: ${dealId}`,
				effectiveDate: today,
				idempotencyKey: `deal:${dealId}:void`,
				source: { type: "system", channel: "effect" },
			});

			// 5. Clear the reservationId from the deal
			await ctx.runMutation(internal.deals.queries.setReservationId, {
				dealId,
				reservationId: undefined,
			});

			console.info(
				`[voidReservation] Voided reservation ${deal.reservationId} for deal ${dealId}`
			);
		} catch (error) {
			console.error(
				`[voidReservation] Failed to void reservation for deal ${dealId}:`,
				error
			);
		}
	},
});

/**
 * Effect: commits a ledger reservation on deal confirmation.
 * Fires on fundsTransfer.onDone → confirmed transition.
 * Handles missing reservationId gracefully (logs error, exits).
 * Idempotent via ledger's by_idempotency index.
 */
export const commitReservation = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
			dealId,
		});

		if (!deal) {
			console.error(`[commitReservation] Deal not found: ${dealId}`);
			return;
		}

		// reservationId is a top-level field on the deal (not in machineContext)
		if (!deal.reservationId) {
			console.error(
				`[commitReservation] No reservationId for deal ${dealId} — cannot commit`
			);
			return;
		}

		const effectiveDate = deal.closingDate
			? unixMsToBusinessDate(deal.closingDate)
			: unixMsToBusinessDate(Date.now());

		try {
			await ctx.runMutation(internal.ledger.mutations.commitReservation, {
				reservationId: deal.reservationId,
				effectiveDate,
				idempotencyKey: `deal:${dealId}:commit`,
				source: { type: "system", channel: "effect" },
			});

			console.info(
				`[commitReservation] Committed reservation ${deal.reservationId} for deal ${dealId}`
			);
		} catch (error) {
			// RESERVATION_NOT_PENDING means already committed (idempotent retry)
			// RESERVATION_NOT_FOUND is unexpected but non-fatal
			console.error(
				`[commitReservation] Failed for deal ${dealId}: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	},
});
