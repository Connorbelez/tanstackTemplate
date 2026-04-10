import { ConvexError, v } from "convex/values";
import { adminMutation, documentQuery } from "../fluent";
import { formatOptionsValidator, variableTypeValidator } from "./validators";

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export const create = adminMutation
	.input({
		key: v.string(),
		label: v.string(),
		type: variableTypeValidator,
		description: v.optional(v.string()),
		systemPath: v.optional(v.string()),
		formatOptions: formatOptionsValidator,
		createdBy: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		if (!SNAKE_CASE_RE.test(args.key)) {
			throw new ConvexError(
				"Variable key must be snake_case (e.g. loan_amount)"
			);
		}

		const existing = await ctx.db
			.query("systemVariables")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first();
		if (existing) {
			throw new ConvexError(`Variable key "${args.key}" already exists`);
		}

		return await ctx.db.insert("systemVariables", {
			...args,
			createdAt: Date.now(),
		});
	})
	.public();

export const update = adminMutation
	.input({
		id: v.id("systemVariables"),
		label: v.optional(v.string()),
		type: v.optional(variableTypeValidator),
		description: v.optional(v.string()),
		systemPath: v.optional(v.string()),
		formatOptions: v.optional(formatOptionsValidator),
	})
	.handler(async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new ConvexError("Variable not found");
		}

		const { id, ...updates } = args;
		const filtered: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(updates)) {
			if (val !== undefined) {
				filtered[k] = val;
			}
		}

		await ctx.db.patch(id, filtered);
	})
	.public();

export const remove = adminMutation
	.input({ id: v.id("systemVariables") })
	.handler(async (ctx, args) => {
		const variable = await ctx.db.get(args.id);
		if (!variable) {
			return;
		}

		// Check if any template field references this variable
		const templates = await ctx.db.query("documentTemplates").collect();
		for (const template of templates) {
			const referencingField = template.draft.fields.find(
				(f) => f.type === "interpolable" && f.variableKey === variable.key
			);
			if (referencingField) {
				throw new ConvexError(
					`Cannot delete: variable "${variable.key}" is used by template "${template.name}"`
				);
			}
		}

		await ctx.db.delete(args.id);
	})
	.public();

export const list = documentQuery
	.input({})
	.handler(async (ctx) => {
		return await ctx.db.query("systemVariables").collect();
	})
	.public();

export const getByKey = documentQuery
	.input({ key: v.string() })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("systemVariables")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first();
	})
	.public();
