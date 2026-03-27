/**
 * Transfer domain queries — read operations for transfer requests.
 *
 * - getTransferRequest: view a single transfer by ID
 * - listTransfersByMortgage: list by mortgage (optional status filter)
 * - listTransfersByCounterparty: list by borrower/lender/investor/trust
 * - listTransfersByDeal: list by deal
 * - listTransfersByStatus: list by transfer status
 * - getTransferTimeline: joined transfer + GT audit + cash-ledger timeline
 */

import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { paymentQuery } from "../../fluent";
import {
	counterpartyTypeValidator,
	transferStatusValidator,
} from "./validators";

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
export const getTransferRequest = paymentQuery
	.input({ transferId: v.id("transferRequests") })
	.handler(async (ctx, args) => {
		return ctx.db.get(args.transferId);
	})
	.public();

// ── listTransfersByMortgage ────────────────────────────────────────
/** Lists transfer requests for a mortgage, optionally filtered by status. */
export const listTransfersByMortgage = paymentQuery
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
/** Lists transfer requests by status with optional limit. */
export const listTransfersByStatus = paymentQuery
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

// ── listTransfersByCounterparty ─────────────────────────────────────
/** Lists transfers for a counterparty with optional status filter. */
export const listTransfersByCounterparty = paymentQuery
	.input({
		counterpartyType: counterpartyTypeValidator,
		counterpartyId: v.string(),
		status: v.optional(transferStatusValidator),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const transfers = await (async () => {
			const status = args.status;
			if (status !== undefined) {
				return ctx.db
					.query("transferRequests")
					.withIndex("by_counterparty_status", (q) =>
						q
							.eq("counterpartyType", args.counterpartyType)
							.eq("counterpartyId", args.counterpartyId)
							.eq("status", status)
					)
					.collect();
			}
			return ctx.db
				.query("transferRequests")
				.withIndex("by_counterparty", (q) =>
					q
						.eq("counterpartyType", args.counterpartyType)
						.eq("counterpartyId", args.counterpartyId)
				)
				.collect();
		})();

		return transfers
			.sort((left, right) => right.createdAt - left.createdAt)
			.slice(0, args.limit ?? 50);
	})
	.public();

// ── listTransfersByDeal ─────────────────────────────────────────────
/** Lists transfers for a deal with optional status filter. */
export const listTransfersByDeal = paymentQuery
	.input({
		dealId: v.id("deals"),
		status: v.optional(transferStatusValidator),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const transfers = await (async () => {
			const status = args.status;
			if (status !== undefined) {
				return ctx.db
					.query("transferRequests")
					.withIndex("by_deal_status", (q) =>
						q.eq("dealId", args.dealId).eq("status", status)
					)
					.collect();
			}
			return ctx.db
				.query("transferRequests")
				.withIndex("by_deal", (q) => q.eq("dealId", args.dealId))
				.collect();
		})();

		return transfers
			.sort((left, right) => right.createdAt - left.createdAt)
			.slice(0, args.limit ?? 50);
	})
	.public();

// ── getTransferTimeline ─────────────────────────────────────────────
/**
 * Returns the transfer plus timeline records from GT audit journal and
 * cash ledger journals.
 */
export const getTransferTimeline = paymentQuery
	.input({
		transferId: v.id("transferRequests"),
	})
	.handler(async (ctx, args) => {
		const transfer = await ctx.db.get(args.transferId);
		if (!transfer) {
			return null;
		}

		const transferEntityId = `${args.transferId}`;
		const auditJournalEntries = await ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "transfer").eq("entityId", transferEntityId)
			)
			.collect();

		const cashLedgerEntries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", args.transferId)
			)
			.collect();

		const timeline = [
			...auditJournalEntries.map((entry) => ({
				timestamp: entry.timestamp,
				source: "audit_journal" as const,
				recordId: entry._id,
				eventType: entry.eventType,
				state: entry.newState,
				outcome: entry.outcome,
			})),
			...cashLedgerEntries.map((entry) => ({
				timestamp: entry.timestamp,
				source: "cash_ledger" as const,
				recordId: entry._id,
				eventType: entry.entryType,
				state: "posted",
				outcome: "posted" as const,
			})),
		].sort((left, right) => left.timestamp - right.timestamp);

		return {
			transfer,
			auditJournalEntries,
			cashLedgerEntries,
			timeline,
		};
	})
	.public();
