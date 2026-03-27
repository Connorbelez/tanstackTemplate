/**
 * Transfer domain queries — read operations for transfer requests.
 *
 * - getTransferRequest: any authenticated user can view a single transfer
 * - listTransfersByMortgage: any authenticated user can list by mortgage
 * - listTransfersByStatus: admin-only listing by status
 */

import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { adminQuery, authedQuery } from "../../fluent";
import { transferStatusValidator } from "./validators";

// ── getTransferInternal ───────────────────────────────────────────
/** Internal query for loading a transfer record from actions (no auth). */
export const getTransferInternal = internalQuery({
	args: { transferId: v.id("transferRequests") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.transferId);
	},
});

// ── getTransferRequest ─────────────────────────────────────────────
/** Returns a single transfer request by ID. */
export const getTransferRequest = authedQuery
	.input({ transferId: v.id("transferRequests") })
	.handler(async (ctx, args) => {
		return ctx.db.get(args.transferId);
	})
	.public();

// ── listTransfersByMortgage ────────────────────────────────────────
/** Lists transfer requests for a mortgage, optionally filtered by status. */
export const listTransfersByMortgage = authedQuery
	.input({
		mortgageId: v.id("mortgages"),
		status: v.optional(transferStatusValidator),
	})
	.handler(async (ctx, args) => {
		const { status } = args;
		if (status) {
			return ctx.db
				.query("transferRequests")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", args.mortgageId).eq("status", status)
				)
				.collect();
		}

		return ctx.db
			.query("transferRequests")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
	})
	.public();

// ── listTransfersByStatus ──────────────────────────────────────────
/** Admin-only query: lists transfer requests by status with optional limit. */
export const listTransfersByStatus = adminQuery
	.input({
		status: transferStatusValidator,
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		return ctx.db
			.query("transferRequests")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.take(args.limit ?? 50);
	})
	.public();
