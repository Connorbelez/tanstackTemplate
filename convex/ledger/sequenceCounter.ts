import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ledgerMutation } from "../fluent";

const COUNTER_NAME = "ledger_sequence" as const;

/**
 * Plain function: creates the singleton counter document with value 0.
 * Idempotent — safe to call multiple times.
 * Extracted so bootstrap.ts can call it without going through the middleware chain.
 */
export async function initializeSequenceCounterInternal(
	ctx: MutationCtx
): Promise<Id<"ledger_sequence_counters">> {
	const existing = await ctx.db
		.query("ledger_sequence_counters")
		.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
		.first();

	if (existing) {
		return existing._id;
	}

	return ctx.db.insert("ledger_sequence_counters", {
		name: COUNTER_NAME,
		value: 0n,
	});
}

/**
 * Bootstrap mutation: creates the singleton counter document with value 0.
 * Idempotent — safe to call multiple times.
 * Delegates to initializeSequenceCounterInternal.
 */
export const initializeSequenceCounter = ledgerMutation
	.handler(async (ctx) => {
		return initializeSequenceCounterInternal(ctx);
	})
	.public();

/**
 * Internal helper: reads singleton, increments, patches, returns new value.
 * Must be called within a mutation context (writes to the counter doc).
 * Throws ConvexError if the counter has not been initialized.
 */
export async function getNextSequenceNumber(ctx: MutationCtx): Promise<bigint> {
	const counter = await ctx.db
		.query("ledger_sequence_counters")
		.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
		.first();

	if (!counter) {
		throw new ConvexError({
			code: "SEQUENCE_COUNTER_NOT_INITIALIZED",
			message:
				"Ledger sequence counter not initialized. Run initializeSequenceCounter first.",
		});
	}

	const nextValue = counter.value + 1n;
	await ctx.db.patch(counter._id, { value: nextValue });
	return nextValue;
}
