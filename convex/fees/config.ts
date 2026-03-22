import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { adminMutation } from "../fluent";
import {
	assertNoOverlappingMortgageFee,
	assertValidFeeDefinition,
	attachFeeTemplateToMortgageSnapshot,
	normalizeEffectiveFrom,
} from "./resolver";
import {
	feeCalculationParametersValidator,
	feeCalculationTypeValidator,
	feeCodeValidator,
	feeRevenueDestinationValidator,
	feeStatusValidator,
	feeSurfaceValidator,
} from "./validators";

const feeTemplateInputValidator = {
	name: v.string(),
	description: v.optional(v.string()),
	code: feeCodeValidator,
	surface: feeSurfaceValidator,
	revenueDestination: feeRevenueDestinationValidator,
	calculationType: feeCalculationTypeValidator,
	parameters: feeCalculationParametersValidator,
	status: feeStatusValidator,
};

function assertDateRange(effectiveFrom: string, effectiveTo?: string) {
	if (effectiveTo !== undefined && effectiveTo < effectiveFrom) {
		throw new ConvexError("effectiveTo must be on or after effectiveFrom");
	}
}

export const createFeeTemplate = adminMutation
	.input(feeTemplateInputValidator)
	.handler(async (ctx, args) => {
		assertValidFeeDefinition(args);
		const now = Date.now();
		return await ctx.db.insert("feeTemplates", {
			...args,
			createdAt: now,
			updatedAt: now,
		});
	})
	.public();

export const updateFeeTemplate = adminMutation
	.input({
		id: v.id("feeTemplates"),
		...feeTemplateInputValidator,
	})
	.handler(async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new ConvexError(`Fee template not found: ${args.id}`);
		}
		assertValidFeeDefinition(args);
		await ctx.db.patch(args.id, {
			name: args.name,
			description: args.description,
			code: args.code,
			surface: args.surface,
			revenueDestination: args.revenueDestination,
			calculationType: args.calculationType,
			parameters: args.parameters,
			status: args.status,
			updatedAt: Date.now(),
		});
		return args.id;
	})
	.public();

export const createFeeSetTemplate = adminMutation
	.input({
		name: v.string(),
		description: v.optional(v.string()),
		status: feeStatusValidator,
		items: v.array(
			v.object({
				feeTemplateId: v.id("feeTemplates"),
				sortOrder: v.number(),
			})
		),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		const feeSetTemplateId = await ctx.db.insert("feeSetTemplates", {
			name: args.name,
			description: args.description,
			status: args.status,
			createdAt: now,
			updatedAt: now,
		});
		for (const item of args.items) {
			await ctx.db.insert("feeSetTemplateItems", {
				feeSetTemplateId,
				feeTemplateId: item.feeTemplateId,
				sortOrder: item.sortOrder,
				createdAt: now,
			});
		}
		return feeSetTemplateId;
	})
	.public();

export const updateFeeSetTemplate = adminMutation
	.input({
		id: v.id("feeSetTemplates"),
		name: v.string(),
		description: v.optional(v.string()),
		status: feeStatusValidator,
		items: v.optional(
			v.array(
				v.object({
					feeTemplateId: v.id("feeTemplates"),
					sortOrder: v.number(),
				})
			)
		),
	})
	.handler(async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new ConvexError(`Fee set template not found: ${args.id}`);
		}
		await ctx.db.patch(args.id, {
			name: args.name,
			description: args.description,
			status: args.status,
			updatedAt: Date.now(),
		});
		if (args.items) {
			const existingItems = await ctx.db
				.query("feeSetTemplateItems")
				.withIndex("by_fee_set_template", (q) =>
					q.eq("feeSetTemplateId", args.id)
				)
				.collect();
			for (const item of existingItems) {
				await ctx.db.delete(item._id);
			}
			for (const item of args.items) {
				await ctx.db.insert("feeSetTemplateItems", {
					feeSetTemplateId: args.id,
					feeTemplateId: item.feeTemplateId,
					sortOrder: item.sortOrder,
					createdAt: Date.now(),
				});
			}
		}
		return args.id;
	})
	.public();

export const attachFeeTemplateToMortgage = adminMutation
	.input({
		mortgageId: v.id("mortgages"),
		feeTemplateId: v.id("feeTemplates"),
		effectiveFrom: v.optional(v.string()),
		effectiveTo: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const feeTemplate = await ctx.db.get(args.feeTemplateId);
		if (!feeTemplate) {
			throw new ConvexError(`Fee template not found: ${args.feeTemplateId}`);
		}
		const effectiveFrom = normalizeEffectiveFrom(args.effectiveFrom);
		assertDateRange(effectiveFrom, args.effectiveTo);
		return await attachFeeTemplateToMortgageSnapshot(ctx.db, {
			mortgageId: args.mortgageId,
			feeTemplate,
			effectiveFrom,
			effectiveTo: args.effectiveTo,
		});
	})
	.public();

export const attachFeeSetTemplateToMortgage = adminMutation
	.input({
		mortgageId: v.id("mortgages"),
		feeSetTemplateId: v.id("feeSetTemplates"),
		effectiveFrom: v.optional(v.string()),
		effectiveTo: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const feeSet = await ctx.db.get(args.feeSetTemplateId);
		if (!feeSet) {
			throw new ConvexError(
				`Fee set template not found: ${args.feeSetTemplateId}`
			);
		}
		const items = await ctx.db
			.query("feeSetTemplateItems")
			.withIndex("by_fee_set_template", (q) =>
				q.eq("feeSetTemplateId", feeSet._id)
			)
			.collect();
		const effectiveFrom = normalizeEffectiveFrom(args.effectiveFrom);
		assertDateRange(effectiveFrom, args.effectiveTo);

		const createdIds: Id<"mortgageFees">[] = [];
		for (const item of items.sort(
			(left, right) => left.sortOrder - right.sortOrder
		)) {
			const feeTemplate = await ctx.db.get(item.feeTemplateId);
			if (!feeTemplate) {
				continue;
			}
			const id = await attachFeeTemplateToMortgageSnapshot(ctx.db, {
				mortgageId: args.mortgageId,
				feeTemplate,
				effectiveFrom,
				effectiveTo: args.effectiveTo,
				feeSetTemplateId: feeSet._id,
				feeSetTemplateItemId: item._id,
			});
			createdIds.push(id);
		}
		return createdIds;
	})
	.public();

export const updateMortgageFeeEffectiveWindow = adminMutation
	.input({
		id: v.id("mortgageFees"),
		effectiveFrom: v.string(),
		effectiveTo: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const fee = await ctx.db.get(args.id);
		if (!fee) {
			throw new ConvexError(`Mortgage fee not found: ${args.id}`);
		}
		assertDateRange(args.effectiveFrom, args.effectiveTo);
		await assertNoOverlappingMortgageFee(
			ctx.db,
			{
				mortgageId: fee.mortgageId,
				code: fee.code,
				surface: fee.surface,
				effectiveFrom: args.effectiveFrom,
				effectiveTo: args.effectiveTo,
			},
			args.id
		);
		await ctx.db.patch(args.id, {
			effectiveFrom: args.effectiveFrom,
			effectiveTo: args.effectiveTo,
		});
		return args.id;
	})
	.public();

export const deactivateMortgageFee = adminMutation
	.input({
		id: v.id("mortgageFees"),
	})
	.handler(async (ctx, args) => {
		const fee = await ctx.db.get(args.id);
		if (!fee) {
			throw new ConvexError(`Mortgage fee not found: ${args.id}`);
		}
		await ctx.db.patch(args.id, {
			status: "inactive",
			deactivatedAt: Date.now(),
		});
		return args.id;
	})
	.public();
