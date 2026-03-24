import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { sourceValidator } from "../../engine/validators";
import { requireCashAccount } from "./accounts";
import { postCashCorrectionForEntry } from "./integrations";
import { postCashEntryInternal } from "./postEntry";
import { postCashCorrectionArgsValidator } from "./validators";

export const postLenderPayout = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
		lenderId: v.id("lenders"),
		amount: v.number(),
		effectiveDate: v.string(),
		idempotencyKey: v.string(),
		source: sourceValidator,
		reason: v.optional(v.string()),
		postingGroupId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError("Payout amount must be a positive safe integer");
		}

		const lenderPayableAccount = await requireCashAccount(
			ctx.db,
			{
				family: "LENDER_PAYABLE",
				mortgageId: args.mortgageId,
				lenderId: args.lenderId,
			},
			"postLenderPayout"
		);
		const trustCashAccount = await requireCashAccount(
			ctx.db,
			{
				family: "TRUST_CASH",
				mortgageId: args.mortgageId,
			},
			"postLenderPayout"
		);

		return postCashEntryInternal(ctx, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: args.effectiveDate,
			amount: args.amount,
			debitAccountId: lenderPayableAccount._id,
			creditAccountId: trustCashAccount._id,
			idempotencyKey: args.idempotencyKey,
			mortgageId: args.mortgageId,
			lenderId: args.lenderId,
			source: args.source,
			reason: args.reason,
			postingGroupId: args.postingGroupId,
		});
	},
});

export const postCashCorrection = internalMutation({
	args: postCashCorrectionArgsValidator,
	handler: async (ctx, args) => {
		return postCashCorrectionForEntry(ctx, {
			originalEntryId: args.originalEntryId,
			reason: args.reason,
			source: args.source,
			effectiveDate: args.effectiveDate,
			replacement: args.replacement,
		});
	},
});
