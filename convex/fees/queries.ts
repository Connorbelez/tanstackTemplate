import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { adminQuery } from "../fluent";
import {
	listActiveMortgageFeesForSurface,
	resolveBorrowerChargeFeeConfig,
} from "./resolver";
import { feeCodeValidator, feeSurfaceValidator } from "./validators";

export const getActiveMortgageFee = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		code: feeCodeValidator,
		surface: feeSurfaceValidator,
		asOfDate: v.string(),
	},
	handler: async (ctx, args) => {
		if (args.surface === "waterfall_deduction") {
			const rows = await listActiveMortgageFeesForSurface(
				ctx.db,
				args.mortgageId,
				args.surface,
				args.asOfDate
			);
			return rows.find((row) => row.code === args.code) ?? null;
		}

		if (args.code === "servicing") {
			return null;
		}

		const resolved = await resolveBorrowerChargeFeeConfig(
			ctx.db,
			args.mortgageId,
			args.code,
			args.asOfDate
		);
		if (!resolved) {
			return null;
		}
		return await ctx.db.get(resolved.mortgageFeeId);
	},
});

export const listFeeTemplates = adminQuery
	.input({
		status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
	})
	.handler(async (ctx, args) => {
		const status = args.status;
		if (status !== undefined) {
			return await ctx.db
				.query("feeTemplates")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect();
		}
		return await ctx.db.query("feeTemplates").collect();
	})
	.public();

export const listFeeSetTemplates = adminQuery
	.input({
		status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
	})
	.handler(async (ctx, args) => {
		const status = args.status;
		const sets =
			status !== undefined
				? await ctx.db
						.query("feeSetTemplates")
						.withIndex("by_status", (q) => q.eq("status", status))
						.collect()
				: await ctx.db.query("feeSetTemplates").collect();

		return await Promise.all(
			sets.map(async (set) => ({
				...set,
				items: await ctx.db
					.query("feeSetTemplateItems")
					.withIndex("by_fee_set_template", (q) =>
						q.eq("feeSetTemplateId", set._id)
					)
					.collect(),
			}))
		);
	})
	.public();

export const listMortgageFees = adminQuery
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("mortgageFees")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
	})
	.public();
