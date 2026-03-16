import { v } from "convex/values";
import { authedMutation, authedQuery } from "./fluent";

export const list = authedQuery
	.handler(async (ctx) => {
		return await ctx.db
			.query("todos")
			.withIndex("by_creation_time")
			.order("desc")
			.collect();
	})
	.public();

export const add = authedMutation
	.input({ text: v.string() })
	.handler(async (ctx, args) => {
		return await ctx.db.insert("todos", {
			text: args.text,
			completed: false,
		});
	})
	.public();

export const toggle = authedMutation
	.input({ id: v.id("todos") })
	.handler(async (ctx, args) => {
		const todo = await ctx.db.get(args.id);
		if (!todo) {
			throw new Error("Todo not found");
		}
		return await ctx.db.patch(args.id, {
			completed: !todo.completed,
		});
	})
	.public();

export const remove = authedMutation
	.input({ id: v.id("todos") })
	.handler(async (ctx, args) => {
		return await ctx.db.delete(args.id);
	})
	.public();
