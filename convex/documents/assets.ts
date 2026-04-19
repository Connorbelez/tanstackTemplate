import { ConvexError, v } from "convex/values";
import {
	documentQuery,
	documentUploadAction,
	documentUploadMutation,
} from "../fluent";

export const generateUploadUrl = documentUploadMutation
	.input({})
	.handler(async (ctx) => {
		const uploadUrl = await ctx.storage.generateUploadUrl();
		return { uploadUrl };
	})
	.public();

export const extractPdfMetadata = documentUploadAction
	.input({ fileRef: v.id("_storage") })
	.handler(
		async (
			ctx,
			args
		): Promise<{
			fileHash: string;
			fileSize: number;
			pageCount: number;
		}> => {
			const blob = await ctx.storage.get(args.fileRef);
			if (!blob) {
				throw new ConvexError("File not found in storage");
			}

			const arrayBuffer = await blob.arrayBuffer();
			const uint8 = new Uint8Array(arrayBuffer);
			const { PDFDocument } = await import("pdf-lib");
			const pdfDoc = await PDFDocument.load(uint8);
			const hashBuffer = await crypto.subtle.digest("SHA-256", uint8);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const fileHash = hashArray
				.map((value) => value.toString(16).padStart(2, "0"))
				.join("");

			return {
				fileHash,
				fileSize: uint8.length,
				pageCount: pdfDoc.getPageCount(),
			};
		}
	)
	.public();

export const create = documentUploadMutation
	.input({
		description: v.optional(v.string()),
		fileHash: v.string(),
		fileRef: v.id("_storage"),
		fileSize: v.number(),
		name: v.string(),
		originalFilename: v.string(),
		pageCount: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", ctx.viewer.authId))
			.unique();
		if (!user) {
			throw new ConvexError("User not found in database");
		}

		const existing = await ctx.db
			.query("documentAssets")
			.withIndex("by_hash", (query) => query.eq("fileHash", args.fileHash))
			.first();
		if (existing) {
			return { assetId: existing._id, duplicate: true };
		}

		const assetId = await ctx.db.insert("documentAssets", {
			description: args.description,
			fileHash: args.fileHash,
			fileRef: args.fileRef,
			fileSize: args.fileSize,
			mimeType: "application/pdf",
			name: args.name,
			originalFilename: args.originalFilename,
			pageCount: args.pageCount,
			source: "admin_upload",
			uploadedAt: Date.now(),
			uploadedByUserId: user._id,
		});

		return { assetId, duplicate: false };
	})
	.public();

export const get = documentQuery
	.input({
		assetId: v.id("documentAssets"),
	})
	.handler(async (ctx, args) => {
		return ctx.db.get(args.assetId);
	})
	.public();

export const getUrl = documentQuery
	.input({
		assetId: v.id("documentAssets"),
	})
	.handler(async (ctx, args) => {
		const asset = await ctx.db.get(args.assetId);
		if (!asset) {
			return null;
		}

		const url = await ctx.storage.getUrl(asset.fileRef);
		if (!url) {
			return null;
		}

		return {
			assetId: asset._id,
			fileRef: asset.fileRef,
			name: asset.name,
			url,
		};
	})
	.public();
