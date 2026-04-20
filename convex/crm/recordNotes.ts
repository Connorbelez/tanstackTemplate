import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	assertRecordAccessible,
	canAccessCrmOrgScopedRecord,
} from "../authz/crm";
import { crmMutation, crmQuery } from "../fluent";
import { entityKindValidator } from "./validators";

type AnyCtx = QueryCtx | MutationCtx;

/**
 * Loads the currently signed-in user's profile row so handlers can embed the
 * authoring identity in denormalized returns (display name/email shown next to
 * each note).
 */
async function loadViewerUser(ctx: AnyCtx, authId: string) {
	return ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", authId))
		.unique();
}

async function buildAuthorSummaryMap(
	ctx: AnyCtx,
	authIds: readonly string[]
): Promise<Map<string, AuthorSummary>> {
	const unique = [...new Set(authIds)];
	const entries = await Promise.all(
		unique.map(async (authId) => {
			const user = await loadViewerUser(ctx, authId);
			const summary: AuthorSummary = user
				? {
						authId,
						displayName: [user.firstName, user.lastName]
							.filter((part) => part && part.length > 0)
							.join(" ")
							.trim(),
						email: user.email,
					}
				: { authId, displayName: authId, email: undefined };
			if (!summary.displayName) {
				summary.displayName = user?.email ?? authId;
			}
			return [authId, summary] as const;
		})
	);
	return new Map(entries);
}

export interface AuthorSummary {
	authId: string;
	displayName: string;
	email: string | undefined;
}

export interface RecordNoteView {
	_id: Id<"recordNotes">;
	author: AuthorSummary;
	body: string;
	canEdit: boolean;
	createdAt: number;
	updatedAt: number;
}

export const listForRecord = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
	})
	.handler(async (ctx, args): Promise<RecordNoteView[]> => {
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

		const notes = await ctx.db
			.query("recordNotes")
			.withIndex("by_org_record", (q) =>
				q
					.eq("orgId", orgId)
					.eq("objectDefId", args.objectDefId)
					.eq("recordKind", args.recordKind)
					.eq("recordId", args.recordId)
			)
			.collect();

		const authorMap = await buildAuthorSummaryMap(
			ctx,
			notes.map((note) => note.authorAuthId)
		);

		return notes
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((note): RecordNoteView => {
				const author = authorMap.get(note.authorAuthId) ?? {
					authId: note.authorAuthId,
					displayName: note.authorAuthId,
					email: undefined,
				};
				return {
					_id: note._id,
					body: note.body,
					createdAt: note.createdAt,
					updatedAt: note.updatedAt,
					author,
					canEdit: note.authorAuthId === ctx.viewer.authId,
				};
			});
	})
	.public();

const MAX_NOTE_BODY_BYTES = 50_000;

function assertNoteBody(body: string): string {
	const trimmed = body.trim();
	if (trimmed.length === 0) {
		throw new ConvexError("Note body is required");
	}
	if (trimmed.length > MAX_NOTE_BODY_BYTES) {
		throw new ConvexError(
			`Note body exceeds ${MAX_NOTE_BODY_BYTES} character limit`
		);
	}
	return trimmed;
}

export const createNote = crmMutation
	.input({
		body: v.string(),
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
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

		const body = assertNoteBody(args.body);
		const now = Date.now();

		return await ctx.db.insert("recordNotes", {
			orgId,
			objectDefId: args.objectDefId,
			recordKind: args.recordKind,
			recordId: args.recordId,
			body,
			authorAuthId: ctx.viewer.authId,
			createdAt: now,
			updatedAt: now,
		});
	})
	.public();

export const updateNote = crmMutation
	.input({
		body: v.string(),
		noteId: v.id("recordNotes"),
	})
	.handler(async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!canAccessCrmOrgScopedRecord(ctx.viewer, note)) {
			throw new ConvexError("Note not found or access denied");
		}
		if (note.authorAuthId !== ctx.viewer.authId) {
			throw new ConvexError("You can only edit notes you authored");
		}

		const body = assertNoteBody(args.body);
		await ctx.db.patch(args.noteId, { body, updatedAt: Date.now() });
	})
	.public();

export const deleteNote = crmMutation
	.input({
		noteId: v.id("recordNotes"),
	})
	.handler(async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!canAccessCrmOrgScopedRecord(ctx.viewer, note)) {
			throw new ConvexError("Note not found or access denied");
		}
		if (note.authorAuthId !== ctx.viewer.authId) {
			throw new ConvexError("You can only delete notes you authored");
		}

		await ctx.db.delete(args.noteId);
	})
	.public();
