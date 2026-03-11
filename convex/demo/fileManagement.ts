import { v } from "convex/values";
import { components } from "../_generated/api";
import { mutation, query } from "../_generated/server";

// ── Files Control (upload URLs + access) ──────────────────

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		return await ctx.runMutation(
			components.convexFilesControl.upload.generateUploadUrl,
			{ provider: "convex" }
		);
	},
});

export const trackUpload = mutation({
	args: {
		fileName: v.string(),
		path: v.string(),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("demo_files_metadata", {
			fileName: args.fileName,
			path: args.path,
			storageId: args.storageId,
		});
	},
});

export const listFiles = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("demo_files_metadata").order("desc").take(20);
	},
});

export const deleteFile = mutation({
	args: { id: v.id("demo_files_metadata") },
	handler: async (ctx, args) => {
		const file = await ctx.db.get(args.id);
		if (!file) {
			return;
		}
		if (file.storageId) {
			await ctx.storage.delete(file.storageId);
		}
		await ctx.db.delete(args.id);
	},
});
