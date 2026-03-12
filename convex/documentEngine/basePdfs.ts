import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "../_generated/server";

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		const uploadUrl = await ctx.storage.generateUploadUrl();
		return { uploadUrl };
	},
});

export const checkDuplicate = query({
	args: { fileHash: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("documentBasePdfs")
			.withIndex("by_hash", (q) => q.eq("fileHash", args.fileHash))
			.first();
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		fileRef: v.id("_storage"),
		fileHash: v.string(),
		fileSize: v.number(),
		pageCount: v.number(),
		pageDimensions: v.array(
			v.object({
				page: v.number(),
				width: v.number(),
				height: v.number(),
			})
		),
		uploadedBy: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("documentBasePdfs")
			.withIndex("by_hash", (q) => q.eq("fileHash", args.fileHash))
			.first();
		if (existing) {
			return { id: existing._id, duplicate: true };
		}

		const id = await ctx.db.insert("documentBasePdfs", {
			...args,
			uploadedAt: Date.now(),
		});
		return { id, duplicate: false };
	},
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("documentBasePdfs").order("desc").collect();
	},
});

export const get = query({
	args: { id: v.id("documentBasePdfs") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getUrl = query({
	args: { fileRef: v.id("_storage") },
	handler: async (ctx, args) => {
		return await ctx.storage.getUrl(args.fileRef);
	},
});

export const remove = mutation({
	args: { id: v.id("documentBasePdfs") },
	handler: async (ctx, args) => {
		const templatesUsing = await ctx.db
			.query("documentTemplates")
			.withIndex("by_base_pdf", (q) => q.eq("basePdfId", args.id))
			.first();
		if (templatesUsing) {
			throw new ConvexError(
				`Cannot delete: PDF is used by template "${templatesUsing.name}"`
			);
		}

		const pdf = await ctx.db.get(args.id);
		if (!pdf) {
			return;
		}

		await ctx.storage.delete(pdf.fileRef);
		await ctx.db.delete(args.id);
	},
});

export const extractPdfMetadata = action({
	args: { fileRef: v.id("_storage") },
	handler: async (
		ctx,
		args
	): Promise<{
		pageCount: number;
		pageDimensions: Array<{ page: number; width: number; height: number }>;
		fileHash: string;
		fileSize: number;
	}> => {
		const blob = await ctx.storage.get(args.fileRef);
		if (!blob) {
			throw new ConvexError("File not found in storage");
		}

		const arrayBuffer = await blob.arrayBuffer();
		const uint8 = new Uint8Array(arrayBuffer);

		// Dynamic import pdf-lib (works in Convex actions)
		const { PDFDocument } = await import("pdf-lib");
		const pdfDoc = await PDFDocument.load(uint8);

		const pageCount = pdfDoc.getPageCount();
		const pageDimensions: Array<{
			page: number;
			width: number;
			height: number;
		}> = [];
		for (let i = 0; i < pageCount; i++) {
			const page = pdfDoc.getPage(i);
			const { width, height } = page.getSize();
			pageDimensions.push({ page: i, width, height });
		}

		// SHA-256 hash via Web Crypto API (available in Convex actions runtime)
		const hashBuffer = await crypto.subtle.digest("SHA-256", uint8);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const fileHash = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		return {
			pageCount,
			pageDimensions,
			fileHash,
			fileSize: uint8.length,
		};
	},
});
