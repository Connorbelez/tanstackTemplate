import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { adminMutation } from "../../fluent";

const COUNTER_NAME = "cash_ledger_global" as const;

export async function initializeCashSequenceCounterInternal(
	ctx: MutationCtx
): Promise<Id<"cash_ledger_sequence_counters">> {
	const existing = await ctx.db
		.query("cash_ledger_sequence_counters")
		.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
		.first();

	if (existing) {
		return existing._id;
	}

	return ctx.db.insert("cash_ledger_sequence_counters", {
		name: COUNTER_NAME,
		currentValue: 0n,
	});
}

export const initializeCashSequenceCounter = adminMutation
	.handler(async (ctx) => {
		return initializeCashSequenceCounterInternal(ctx);
	})
	.public();

export async function getNextCashSequenceNumber(ctx: MutationCtx) {
	const existing = await ctx.db
		.query("cash_ledger_sequence_counters")
		.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
		.first();

	if (!existing) {
		await initializeCashSequenceCounterInternal(ctx);
	}

	const counter = await ctx.db
		.query("cash_ledger_sequence_counters")
		.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
		.first();

	if (!counter) {
		throw new ConvexError("Failed to initialize cash ledger sequence counter");
	}

	const nextValue = counter.currentValue + 1n;
	await ctx.db.patch(counter._id, { currentValue: nextValue });
	return nextValue;
}
