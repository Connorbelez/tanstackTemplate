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

import { ConvexError, v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import {
	canAccessCounterpartyResource,
	canAccessDeal,
	canAccessMortgage,
	canAccessTransferRequest,
} from "../../auth/resourceChecks";
import { paymentQuery } from "../../fluent";
import { computePipelineStatus } from "./pipeline.types";
import {
	counterpartyTypeValidator,
	transferStatusValidator,
} from "./validators";

interface TimelineRecord {
	recordId: string;
	source: string;
	timestamp: number;
}

async function assertTransferAccess(
	ctx: Parameters<typeof canAccessTransferRequest>[0] & {
		viewer: Parameters<typeof canAccessTransferRequest>[1];
	},
	transferId: Parameters<typeof canAccessTransferRequest>[2]
) {
	const allowed = await canAccessTransferRequest(ctx, ctx.viewer, transferId);
	if (!allowed) {
		throw new ConvexError(
			`Forbidden: no transfer access for ${String(transferId)}`
		);
	}
}

async function assertMortgageAccess(
	ctx: Parameters<typeof canAccessMortgage>[0] & {
		viewer: Parameters<typeof canAccessMortgage>[1];
	},
	mortgageId: Parameters<typeof canAccessMortgage>[2]
) {
	const allowed = await canAccessMortgage(ctx, ctx.viewer, mortgageId);
	if (!allowed) {
		throw new ConvexError(
			`Forbidden: no mortgage access for ${String(mortgageId)}`
		);
	}
}

async function assertDealAccess(
	ctx: Parameters<typeof canAccessDeal>[0] & {
		viewer: Parameters<typeof canAccessDeal>[1];
	},
	dealId: Parameters<typeof canAccessDeal>[2]
) {
	const allowed = await canAccessDeal(ctx, ctx.viewer, dealId);
	if (!allowed) {
		throw new ConvexError(`Forbidden: no deal access for ${String(dealId)}`);
	}
}

async function assertCounterpartyAccess(
	ctx: Parameters<typeof canAccessCounterpartyResource>[0] & {
		viewer: Parameters<typeof canAccessCounterpartyResource>[1];
	},
	args: {
		counterpartyId: string;
		counterpartyType: Parameters<typeof canAccessCounterpartyResource>[2];
	}
) {
	const allowed = await canAccessCounterpartyResource(
		ctx,
		ctx.viewer,
		args.counterpartyType,
		args.counterpartyId
	);
	if (!allowed) {
		throw new ConvexError(
			`Forbidden: no ${args.counterpartyType} access for ${args.counterpartyId}`
		);
	}
}

// ── getTransferInternal ───────────────────────────────────────────
/** Internal query for loading a transfer record from actions (no auth). */
export const getTransferInternal = internalQuery({
	args: { transferId: v.id("transferRequests") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.transferId);
	},
});

/** Internal query for idempotency pre-flight (e.g. admin deposit collection). */
export const getTransferByIdempotencyKeyInternal = internalQuery({
	args: { idempotencyKey: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();
	},
});

// ── getTransferRequest ─────────────────────────────────────────────
/** Returns a single transfer request by ID. */
export const getTransferRequest = paymentQuery
	.input({ transferId: v.id("transferRequests") })
	.handler(async (ctx, args) => {
		await assertTransferAccess(ctx, args.transferId);
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
		await assertMortgageAccess(ctx, args.mortgageId);
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
		await assertCounterpartyAccess(ctx, args);
		const limit = args.limit ?? 50;
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
				.order("desc")
				.take(limit);
		}

		return ctx.db
			.query("transferRequests")
			.withIndex("by_counterparty", (q) =>
				q
					.eq("counterpartyType", args.counterpartyType)
					.eq("counterpartyId", args.counterpartyId)
			)
			.order("desc")
			.take(limit);
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
		await assertDealAccess(ctx, args.dealId);
		const limit = args.limit ?? 50;
		const status = args.status;
		if (status !== undefined) {
			return ctx.db
				.query("transferRequests")
				.withIndex("by_deal_status", (q) =>
					q.eq("dealId", args.dealId).eq("status", status)
				)
				.order("desc")
				.take(limit);
		}

		return ctx.db
			.query("transferRequests")
			.withIndex("by_deal", (q) => q.eq("dealId", args.dealId))
			.order("desc")
			.take(limit);
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
		await assertTransferAccess(ctx, args.transferId);
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
		].sort(compareTimelineRecords);

		return {
			transfer,
			auditJournalEntries,
			cashLedgerEntries,
			timeline,
		};
	})
	.public();

// ── getPipelineStatus ────────────────────────────────────────────────
/**
 * Returns all pipeline legs and derived pipeline status for a deal.
 * Queries by dealId, filters for transfers with a pipelineId,
 * then computes the pipeline status from leg statuses.
 */
export const getPipelineStatus = paymentQuery
	.input({
		dealId: v.id("deals"),
	})
	.handler(async (ctx, args) => {
		await assertDealAccess(ctx, args.dealId);
		const transfers = await ctx.db
			.query("transferRequests")
			.withIndex("by_deal", (q) => q.eq("dealId", args.dealId))
			.collect();

		// Only consider well-formed pipeline legs for this deal.
		const pipelineLegs = transfers.filter(
			(t) => t.pipelineId != null && t.legNumber != null
		);

		if (pipelineLegs.length === 0) {
			return null;
		}

		// Choose a pipelineId and restrict legs to that pipelineId so
		// status and legs are consistent with the returned pipelineId.
		const pipelineId = pipelineLegs[0].pipelineId;
		const pipelineLegsForId = pipelineLegs.filter(
			(leg) => leg.pipelineId === pipelineId
		);
		const status = computePipelineStatus(pipelineLegsForId);

		return {
			pipelineId,
			status,
			legs: pipelineLegsForId.map((leg) => ({
				_id: leg._id,
				legNumber: leg.legNumber,
				status: leg.status,
				direction: leg.direction,
				transferType: leg.transferType,
				amount: leg.amount,
				settledAt: leg.settledAt,
				failedAt: leg.failedAt,
				failureReason: leg.failureReason,
			})),
		};
	})
	.public();

// ── getTransfersByPipeline ──────────────────────────────────────────
/**
 * Returns all transfer legs for a specific pipeline ID.
 * Uses the by_pipeline index for efficient lookup.
 */
export const getTransfersByPipeline = paymentQuery
	.input({
		pipelineId: v.string(),
	})
	.handler(async (ctx, args) => {
		const legs = await ctx.db
			.query("transferRequests")
			.withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
			.collect();

		// Return null for unknown/typoed pipelineIds instead of a misleading "pending"
		if (legs.length === 0) {
			return null;
		}

		return {
			pipelineId: args.pipelineId,
			status: computePipelineStatus(legs),
			legs,
		};
	})
	.public();

// ── getPipelineLegsInternal ─────────────────────────────────────────
/** Internal query for loading pipeline legs from effects (no auth). */
export const getPipelineLegsInternal = internalQuery({
	args: { pipelineId: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("transferRequests")
			.withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
			.collect();
	},
});

export function compareTimelineRecords(
	left: TimelineRecord,
	right: TimelineRecord
) {
	if (left.timestamp !== right.timestamp) {
		return left.timestamp - right.timestamp;
	}

	if (left.source !== right.source) {
		return left.source.localeCompare(right.source);
	}

	return left.recordId.localeCompare(right.recordId);
}
