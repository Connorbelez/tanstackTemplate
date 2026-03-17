import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { adminMutation, ledgerMutation, ledgerQuery } from "../fluent";

const DEFAULT_BATCH_SIZE = 100;

async function getCursorByConsumerId(
	ctx: QueryCtx | MutationCtx,
	consumerId: string
) {
	return ctx.db
		.query("ledger_cursors")
		.withIndex("by_consumer", (q) => q.eq("consumerId", consumerId))
		.first();
}

async function validateSequenceExists(
	ctx: QueryCtx | MutationCtx,
	sequenceNumber: bigint
) {
	if (sequenceNumber === 0n) {
		return;
	}

	const existingEntry = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_sequence", (q) => q.eq("sequenceNumber", sequenceNumber))
		.first();

	if (!existingEntry) {
		throw new ConvexError({
			code: "INVALID_SEQUENCE",
			message: `No journal entry with sequence number ${sequenceNumber}.`,
			sequenceNumber,
		});
	}
}

function resolveBatchSize(batchSize: number | undefined) {
	const resolved = batchSize ?? DEFAULT_BATCH_SIZE;
	if (!Number.isInteger(resolved) || resolved <= 0) {
		throw new ConvexError({
			code: "INVALID_BATCH_SIZE",
			message: "batchSize must be a positive integer.",
			batchSize: resolved,
		});
	}
	return resolved;
}

export const getCursor = ledgerQuery
	.input({ consumerId: v.string() })
	.handler(async (ctx, args) => {
		return getCursorByConsumerId(ctx, args.consumerId);
	})
	.public();

export const registerCursor = adminMutation
	.input({ consumerId: v.string() })
	.handler(async (ctx, args) => {
		const existing = await getCursorByConsumerId(ctx, args.consumerId);
		if (existing) {
			return existing._id;
		}

		return ctx.db.insert("ledger_cursors", {
			consumerId: args.consumerId,
			lastProcessedSequence: 0n,
			lastProcessedAt: Date.now(),
		});
	})
	.public();

export const getNewEntries = ledgerQuery
	.input({
		consumerId: v.string(),
		batchSize: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const cursor = await getCursorByConsumerId(ctx, args.consumerId);
		if (!cursor) {
			throw new ConvexError({
				code: "CURSOR_NOT_FOUND",
				message: `Consumer cursor '${args.consumerId}' not registered.`,
				consumerId: args.consumerId,
			});
		}

		const batchSize = resolveBatchSize(args.batchSize);
		// Over-fetch by one so `hasMore` is accurate when the remaining entries
		// count equals `batchSize`.
		const entries = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_sequence", (q) =>
				q.gt("sequenceNumber", cursor.lastProcessedSequence)
			)
			.order("asc")
			.take(batchSize + 1);

		const hasMore = entries.length > batchSize;
		return {
			entries: entries.slice(0, batchSize),
			cursorPosition: cursor.lastProcessedSequence,
			hasMore,
		};
	})
	.public();

export const advanceCursor = ledgerMutation
	.input({
		consumerId: v.string(),
		lastProcessedSequence: v.int64(),
	})
	.handler(async (ctx, args) => {
		const existing = await getCursorByConsumerId(ctx, args.consumerId);
		if (!existing) {
			throw new ConvexError({
				code: "CURSOR_NOT_FOUND",
				message: `Consumer cursor '${args.consumerId}' not registered.`,
				consumerId: args.consumerId,
			});
		}

		if (args.lastProcessedSequence < existing.lastProcessedSequence) {
			throw new ConvexError({
				code: "CURSOR_REWIND_NOT_ALLOWED",
				message:
					"advanceCursor cannot move backwards. Use resetCursor for explicit rewinds.",
				currentSequence: existing.lastProcessedSequence,
				attemptedSequence: args.lastProcessedSequence,
				consumerId: args.consumerId,
			});
		}

		await validateSequenceExists(ctx, args.lastProcessedSequence);
		await ctx.db.patch(existing._id, {
			lastProcessedSequence: args.lastProcessedSequence,
			lastProcessedAt: Date.now(),
		});
	})
	.public();

export const resetCursor = ledgerMutation
	.input({
		consumerId: v.string(),
		toSequence: v.optional(v.int64()),
	})
	.handler(async (ctx, args) => {
		const existing = await getCursorByConsumerId(ctx, args.consumerId);
		const targetSequence = args.toSequence ?? 0n;
		await validateSequenceExists(ctx, targetSequence);

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastProcessedSequence: targetSequence,
				lastProcessedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("ledger_cursors", {
				consumerId: args.consumerId,
				lastProcessedSequence: targetSequence,
				lastProcessedAt: Date.now(),
			});
		}
	})
	.public();
