import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
	assertRecordAccessible,
	canAccessCrmOrgScopedRecord,
} from "../authz/crm";
import { crmMutation, crmQuery } from "../fluent";
import type { AuthorSummary } from "./recordNotes";
import { entityKindValidator } from "./validators";

const MAX_FILE_NAME_LENGTH = 255;

function assertFileName(rawName: string): string {
	const trimmed = rawName.trim();
	if (trimmed.length === 0) {
		throw new ConvexError("File name is required");
	}
	if (trimmed.length > MAX_FILE_NAME_LENGTH) {
		throw new ConvexError(
			`File name exceeds ${MAX_FILE_NAME_LENGTH} character limit`
		);
	}
	return trimmed;
}

export interface RecordAttachmentView {
	_id: Id<"recordAttachments">;
	canDelete: boolean;
	contentType: string | undefined;
	createdAt: number;
	fileName: string;
	sizeBytes: number | undefined;
	uploader: AuthorSummary;
	url: string | null;
}

/**
 * Issues a short-lived upload URL from Convex storage. We gate on record access
 * BEFORE handing back the URL so unauthorized callers cannot burn storage
 * budget or leak URLs that will later be rejected by `attachFile`.
 */
export const generateUploadUrl = crmMutation
	.input({
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
	})
	.handler(async (ctx, args) => {
		await assertRecordAccessible({
			ctx,
			objectDefId: args.objectDefId,
			recordId: args.recordId,
			recordKind: args.recordKind,
			viewer: ctx.viewer,
		});

		return { uploadUrl: await ctx.storage.generateUploadUrl() };
	})
	.public();

/**
 * Attaches a previously-uploaded storage blob to a record. We take the storage
 * id from the caller (the upload URL response carries it) and persist metadata
 * the admin shell needs to render a usable Files tab.
 */
export const attachFile = crmMutation
	.input({
		contentType: v.optional(v.string()),
		fileName: v.string(),
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
		sizeBytes: v.optional(v.number()),
		storageId: v.id("_storage"),
	})
	.handler(async (ctx, args) => {
		const { objectDef } = await assertRecordAccessible({
			ctx,
			objectDefId: args.objectDefId,
			recordId: args.recordId,
			recordKind: args.recordKind,
			viewer: ctx.viewer,
		});
		const orgId = objectDef.orgId;
		if (!orgId) {
			throw new ConvexError("Object org context required");
		}

		const fileName = assertFileName(args.fileName);

		return await ctx.db.insert("recordAttachments", {
			orgId,
			objectDefId: args.objectDefId,
			recordKind: args.recordKind,
			recordId: args.recordId,
			storageId: args.storageId,
			fileName,
			contentType: args.contentType,
			sizeBytes: args.sizeBytes,
			uploaderAuthId: ctx.viewer.authId,
			createdAt: Date.now(),
		});
	})
	.public();

export const listForRecord = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
	})
	.handler(async (ctx, args): Promise<RecordAttachmentView[]> => {
		const { objectDef } = await assertRecordAccessible({
			ctx,
			objectDefId: args.objectDefId,
			recordId: args.recordId,
			recordKind: args.recordKind,
			viewer: ctx.viewer,
		});
		const orgId = objectDef.orgId;
		if (!orgId) {
			throw new ConvexError("Object org context required");
		}

		const attachments = await ctx.db
			.query("recordAttachments")
			.withIndex("by_org_record", (q) =>
				q
					.eq("orgId", orgId)
					.eq("objectDefId", args.objectDefId)
					.eq("recordKind", args.recordKind)
					.eq("recordId", args.recordId)
			)
			.collect();

		const uploaderAuthIds = [
			...new Set(attachments.map((attachment) => attachment.uploaderAuthId)),
		];
		const uploaderMap = new Map<string, AuthorSummary>();
		for (const authId of uploaderAuthIds) {
			const user = await ctx.db
				.query("users")
				.withIndex("authId", (q) => q.eq("authId", authId))
				.unique();
			const displayName = user
				? [user.firstName, user.lastName]
						.filter((part) => part && part.length > 0)
						.join(" ")
						.trim() ||
					(user.email ?? authId)
				: authId;
			uploaderMap.set(authId, {
				authId,
				displayName: displayName || authId,
				email: user?.email,
			});
		}

		const withUrls = await Promise.all(
			attachments
				.sort((a, b) => b.createdAt - a.createdAt)
				.map(async (attachment): Promise<RecordAttachmentView> => {
					const uploader = uploaderMap.get(attachment.uploaderAuthId) ?? {
						authId: attachment.uploaderAuthId,
						displayName: attachment.uploaderAuthId,
						email: undefined,
					};
					return {
						_id: attachment._id,
						fileName: attachment.fileName,
						contentType: attachment.contentType,
						sizeBytes: attachment.sizeBytes,
						createdAt: attachment.createdAt,
						url: await ctx.storage.getUrl(attachment.storageId),
						uploader,
						canDelete: attachment.uploaderAuthId === ctx.viewer.authId,
					};
				})
		);

		return withUrls;
	})
	.public();

export const deleteAttachment = crmMutation
	.input({
		attachmentId: v.id("recordAttachments"),
	})
	.handler(async (ctx, args) => {
		const attachment = await ctx.db.get(args.attachmentId);
		if (!canAccessCrmOrgScopedRecord(ctx.viewer, attachment)) {
			throw new ConvexError("Attachment not found or access denied");
		}
		if (attachment.uploaderAuthId !== ctx.viewer.authId) {
			throw new ConvexError("You can only delete attachments you uploaded");
		}

		// Delete the storage blob first; if it's already gone (e.g. a prior partial
		// delete) swallow the error so the metadata row can still be cleaned up.
		try {
			await ctx.storage.delete(attachment.storageId);
		} catch (_error) {
			// Intentionally swallow — the metadata cleanup below is what matters.
		}
		await ctx.db.delete(args.attachmentId);
	})
	.public();
