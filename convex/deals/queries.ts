import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { adminQuery, authedQuery } from "../fluent";
import { assertDealAccess } from "./accessCheck";

// ── Phase mapping ──────────────────────────────────────────────────────

type DealPhase =
	| "initiated"
	| "lawyerOnboarding"
	| "documentReview"
	| "fundsTransfer"
	| "confirmed"
	| "failed";

function getDealPhase(status: string): DealPhase {
	if (status === "initiated") {
		return "initiated";
	}
	if (status.startsWith("lawyerOnboarding.")) {
		return "lawyerOnboarding";
	}
	if (status.startsWith("documentReview.")) {
		return "documentReview";
	}
	if (status.startsWith("fundsTransfer.")) {
		return "fundsTransfer";
	}
	if (status === "confirmed") {
		return "confirmed";
	}
	if (status === "failed") {
		return "failed";
	}
	// Default to initiated for unknown statuses
	// Log unknown statuses for observability (shouldn't happen in production)
	console.warn(
		`Unknown deal status encountered: ${status}, defaulting to initiated`
	);
	return "initiated";
}

export interface DealWithPhase {
	_id: Id<"deals">;
	buyerId: string;
	closingDate?: number;
	createdAt: number;
	createdBy: string;
	fractionalShare: number;
	lawyerId?: string;
	lawyerType?: "platform_lawyer" | "guest_lawyer";
	mortgageId: Id<"mortgages">;
	sellerId: string;
	status: string;
}

export interface DealsByPhase {
	confirmed: DealWithPhase[];
	documentReview: DealWithPhase[];
	failed: DealWithPhase[];
	fundsTransfer: DealWithPhase[];
	initiated: DealWithPhase[];
	lawyerOnboarding: DealWithPhase[];
}

// ── Internal: used by effects ──────────────────────────────────────

/**
 * Internal query to fetch a deal by ID.
 * Used by effects that need to read deal data without auth checks.
 */
export const getInternalDeal = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		return await ctx.db.get(dealId);
	},
});

/**
 * Internal mutation to set or clear the reservationId on a deal.
 * Called by the reserveShares effect after successfully creating a reservation.
 * Pass undefined for reservationId to clear it.
 */
export const setReservationId = internalMutation({
	args: {
		dealId: v.id("deals"),
		reservationId: v.optional(v.id("ledger_reservations")),
	},
	handler: async (ctx, { dealId, reservationId }) => {
		await ctx.db.patch(dealId, { reservationId });
	},
});

export const getActiveDealAccess = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		return await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();
	},
});

export const getActiveLawyerAccess = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		const allActive = await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();
		return allActive.filter(
			(r) => r.role === "platform_lawyer" || r.role === "guest_lawyer"
		);
	},
});

// ── Public: activeDealAccessRecords ──────────────────────────────────

/**
 * Returns all active dealAccess records for a deal.
 * Enforces two-layer authorization: admin bypass → dealAccess check.
 */
export const activeDealAccessRecords = authedQuery
	.input({ dealId: v.id("deals") })
	.handler(async (ctx, { dealId }) => {
		await assertDealAccess(ctx, ctx.viewer, dealId);

		return await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();
	})
	.public();

// ── Public: getDealsByPhase ───────────────────────────────────────────

/**
 * Returns deals grouped by phase for Kanban board display.
 * Groups deals into 6 columns: initiated, lawyerOnboarding, documentReview,
 * fundsTransfer, confirmed, failed
 */
export const getDealsByPhase = adminQuery
	.handler(async (ctx): Promise<DealsByPhase> => {
		const allDeals = await ctx.db.query("deals").collect();

		const result: DealsByPhase = {
			initiated: [],
			lawyerOnboarding: [],
			documentReview: [],
			fundsTransfer: [],
			confirmed: [],
			failed: [],
		};

		for (const deal of allDeals) {
			const phase = getDealPhase(deal.status);
			const dealWithPhase: DealWithPhase = {
				_id: deal._id,
				status: deal.status,
				mortgageId: deal.mortgageId,
				buyerId: deal.buyerId,
				sellerId: deal.sellerId,
				fractionalShare: deal.fractionalShare,
				closingDate: deal.closingDate,
				lawyerId: deal.lawyerId,
				lawyerType: deal.lawyerType,
				createdAt: deal.createdAt,
				createdBy: deal.createdBy,
			};
			result[phase].push(dealWithPhase);
		}

		return result;
	})
	.public();

// ── Public: closingTeamAssignments ──────────────────────────────────────

/**
 * Returns closing team assignments for deals.
 * Links to deals via mortgageId field.
 */
export const closingTeamAssignments = adminQuery
	.handler(async (ctx) => {
		return await ctx.db.query("closingTeamAssignments").collect();
	})
	.public();
