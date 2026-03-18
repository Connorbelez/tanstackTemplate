import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

const obligationLateFeeValidator = {
	...effectPayloadValidator,
	entityId: v.id("obligations"),
	entityType: v.literal("obligation"),
};

/** Late fee amount in cents ($50.00) */
const LATE_FEE_AMOUNT_CENTS = 5000;

/** 30 days in milliseconds */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** 45 days in milliseconds */
const FORTY_FIVE_DAYS_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * Creates a late-fee obligation linked to the source obligation.
 * Includes an idempotency check — if a late fee already exists for
 * the source obligation, the effect is a no-op.
 */
export const createLateFeeObligation = internalMutation({
	args: obligationLateFeeValidator,
	handler: async (ctx, args) => {
		const obligation = await ctx.db.get(args.entityId);
		if (!obligation) {
			throw new Error(
				`[createLateFeeObligation] Source obligation not found: ${args.entityId}`
			);
		}

		// IDEMPOTENCY CHECK: look for an existing late fee for this obligation.
		// Use the by_mortgage index to narrow results, then filter in-memory.
		const existingLateFee = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) =>
				q.eq("mortgageId", obligation.mortgageId)
			)
			.filter((q) =>
				q.and(
					q.eq(q.field("type"), "late_fee"),
					q.eq(q.field("sourceObligationId"), args.entityId)
				)
			)
			.first();

		if (existingLateFee) {
			console.info(
				`[createLateFeeObligation] Skipping — late fee already exists (id=${existingLateFee._id}) for obligation=${args.entityId}`
			);
			return;
		}

		const now = Date.now();

		await ctx.db.insert("obligations", {
			status: "upcoming",
			type: "late_fee",
			amount: LATE_FEE_AMOUNT_CENTS,
			amountSettled: 0,
			machineContext: { obligationId: "", paymentsApplied: 0 },
			mortgageId: obligation.mortgageId,
			borrowerId: obligation.borrowerId,
			paymentNumber: 0,
			dueDate: now + THIRTY_DAYS_MS,
			gracePeriodEnd: now + FORTY_FIVE_DAYS_MS,
			sourceObligationId: args.entityId,
			createdAt: now,
			lastTransitionAt: now,
		});

		console.info(
			`[createLateFeeObligation] Created late fee obligation for source=${args.entityId}, mortgage=${obligation.mortgageId}`
		);
	},
});
