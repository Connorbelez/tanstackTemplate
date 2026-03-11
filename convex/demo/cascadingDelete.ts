import {
	CascadingDelete,
	defineCascadeRules,
	makeBatchDeleteHandler,
} from "@00akshatsinha00/convex-cascading-delete";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";

const cascadeRules = defineCascadeRules({
	demo_cascade_authors: [
		{ to: "demo_cascade_posts", via: "by_author", field: "authorId" },
	],
	demo_cascade_posts: [
		{ to: "demo_cascade_comments", via: "by_post", field: "postId" },
	],
});

const cd = new CascadingDelete(components.convexCascadingDelete, {
	rules: cascadeRules,
});

export const _cascadeBatchHandler = makeBatchDeleteHandler(
	internalMutation,
	components.convexCascadingDelete
);

export const seedData = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query("demo_cascade_authors").take(1);
		if (existing.length > 0) {
			return { seeded: false };
		}

		const authors = ["Alice", "Bob", "Charlie"];
		for (const name of authors) {
			const authorId = await ctx.db.insert("demo_cascade_authors", { name });
			for (let p = 1; p <= 2; p++) {
				const postId = await ctx.db.insert("demo_cascade_posts", {
					authorId,
					title: `${name}'s Post #${p}`,
				});
				for (let c = 1; c <= 3; c++) {
					await ctx.db.insert("demo_cascade_comments", {
						postId,
						text: `Comment ${c} on ${name}'s Post #${p}`,
					});
				}
			}
		}
		return { seeded: true };
	},
});

export const deleteAuthor = mutation({
	args: { id: v.id("demo_cascade_authors") },
	handler: async (ctx, args) => {
		return await cd.deleteWithCascade(ctx, "demo_cascade_authors", args.id);
	},
});

export const getTree = query({
	args: {},
	handler: async (ctx) => {
		const authors = await ctx.db.query("demo_cascade_authors").collect();
		const tree = await Promise.all(
			authors.map(async (author) => {
				const posts = await ctx.db
					.query("demo_cascade_posts")
					.withIndex("by_author", (q) => q.eq("authorId", author._id))
					.collect();
				const postsWithComments = await Promise.all(
					posts.map(async (post) => {
						const comments = await ctx.db
							.query("demo_cascade_comments")
							.withIndex("by_post", (q) => q.eq("postId", post._id))
							.collect();
						return { ...post, comments };
					})
				);
				return { ...author, posts: postsWithComments };
			})
		);
		return tree;
	},
});

export const getCounts = query({
	args: {},
	handler: async (ctx) => {
		const authors = await ctx.db.query("demo_cascade_authors").collect();
		const posts = await ctx.db.query("demo_cascade_posts").collect();
		const comments = await ctx.db.query("demo_cascade_comments").collect();
		return {
			authors: authors.length,
			posts: posts.length,
			comments: comments.length,
		};
	},
});
