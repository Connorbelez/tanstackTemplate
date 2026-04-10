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

export const checkDuplicate = documentQuery
	.input({ fileHash: v.string() })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("documentBasePdfs")
			.withIndex("by_hash", (q) => q.eq("fileHash", args.fileHash))
			.first();
	})
	.public();

export const create = documentUploadMutation
	.input({
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
	})
	.handler(async (ctx, args) => {
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
	})
	.public();

export const list = documentQuery
	.input({})
	.handler(async (ctx) => {
		return await ctx.db.query("documentBasePdfs").order("desc").collect();
	})
	.public();

export const get = documentQuery
	.input({ id: v.id("documentBasePdfs") })
	.handler(async (ctx, args) => {
		return await ctx.db.get(args.id);
	})
	.public();

export const getUrl = documentQuery
	.input({ fileRef: v.id("_storage") })
	.handler(async (ctx, args) => {
		return await ctx.storage.getUrl(args.fileRef);
	})
	.public();

export const remove = documentUploadMutation
	.input({ id: v.id("documentBasePdfs") })
	.handler(async (ctx, args) => {
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
	})
	.public();

export const extractPdfMetadata = documentUploadAction
	.input({ fileRef: v.id("_storage") })
	.handler(
		async (
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
		}
	)
	.public();
