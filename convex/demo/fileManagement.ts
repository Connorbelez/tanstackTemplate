import { v } from "convex/values";
import { components } from "../_generated/api";
import { authedMutation, authedQuery } from "../fluent";

// ── Files Control (upload URLs + access) ──────────────────

export const generateUploadUrl = authedMutation
	.handler(async (ctx) => {
		return await ctx.runMutation(
			components.convexFilesControl.upload.generateUploadUrl,
			{ provider: "convex" }
		);
	})
	.public();

export const trackUpload = authedMutation
	.input({
		fileName: v.string(),
		path: v.string(),
		storageId: v.id("_storage"),
	})
	.handler(async (ctx, args) => {
		await ctx.db.insert("demo_files_metadata", {
			fileName: args.fileName,
			path: args.path,
			storageId: args.storageId,
		});
	})
	.public();

export const listFiles = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_files_metadata").order("desc").take(20);
	})
	.public();

export const deleteFile = authedMutation
	.input({ id: v.id("demo_files_metadata") })
	.handler(async (ctx, args) => {
		const file = await ctx.db.get(args.id);
		if (!file) {
			return;
		}
		if (file.storageId) {
			await ctx.storage.delete(file.storageId);
		}
		await ctx.db.delete(args.id);
	})
	.public();
