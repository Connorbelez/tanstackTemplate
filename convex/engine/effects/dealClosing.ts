import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

/**
 * Effect: reserves shares in the ledger for a deal.
 * Fires when a deal transitions to lawyerOnboarding.pending → lawyerOnboarding.approved
 * (i.e., the shares reservation happens when the lawyer approves the deal).
 */
export const reserveShares = internalAction({
	args: effectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		// 1. Fetch the deal to get mortgageId and fractional share amount
		const deal = await ctx.runQuery(internal.deals.internal.getInternalDeal, {
			dealId,
		});

		if (!deal) {
			console.error(`[reserveShares] Deal not found: ${dealId}`);
			return; // Graceful failure - deal stays in pending
		}

		// 2. Look up any existing reservation for this deal
		const existingReservation = await ctx.db
			.query("ledger_reservations")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "pending"))
			.first();

		if (existingReservation) {
			console.info(
				`[reserveShares] Reservation already exists for deal ${dealId}: ${existingReservation._id}`
			);
			// Link the reservation to the deal if not already linked
			if (!deal.reservationId) {
				await ctx.runMutation(internal.deals.internal.setReservationId, {
					dealId,
					reservationId: existingReservation._id,
				});
			}
			return;
		}

		// 3. Look up the seller's position account to get the sellerLenderId
		const sellerAccount = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage_and_lender", (q) =>
				q.eq("mortgageId", deal.mortgageId).eq("type", "POSITION")
			)
			.filter((q) => q.eq(q.field("lenderId"), deal.sellerId))
			.first();

		// 4. Look up the buyer's position account to get the buyerLenderId
		const buyerAccount = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage_and_lender", (q) =>
				q.eq("mortgageId", deal.mortgageId).eq("type", "POSITION")
			)
			.filter((q) => q.eq(q.field("lenderId"), deal.buyerId))
			.first();

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
		const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

		try {
			const result = await ctx.runMutation(
				internal.ledger.mutations.reserveShares,
				{
					mortgageId: deal.mortgageId,
					sellerLenderId,
					buyerLenderId,
					amount,
					effectiveDate: today,
					idempotencyKey: `reserve-${dealId}-${Date.now()}`,
					source: { type: "system", channel: "effect" },
					dealId,
				}
			);

			// 7. Link the reservation to the deal
			await ctx.runMutation(internal.deals.internal.setReservationId, {
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
	args: effectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		// 1. Fetch the deal to get the reservationId
		const deal = await ctx.runQuery(internal.deals.internal.getInternalDeal, {
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
		const reservation = await ctx.db.get(deal.reservationId);

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
		const today = new Date().toISOString().split("T")[0];

		try {
			await ctx.runMutation(internal.ledger.mutations.voidReservation, {
				reservationId: deal.reservationId,
				reason: `Deal cancelled: ${dealId}`,
				effectiveDate: today,
				idempotencyKey: `void-${dealId}-${Date.now()}`,
				source: { type: "system", channel: "effect" },
			});

			// 5. Clear the reservationId from the deal
			await ctx.runMutation(internal.deals.internal.setReservationId, {
				dealId,
				reservationId: undefined,
			});

			// Actually, we need to set it to undefined or null. Let me check the schema.
			// The schema has: reservationId: v.optional(v.id("ledger_reservations"))
			// So we need to patch with undefined to clear it.

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
