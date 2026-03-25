import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { startHashChain } from "./hashChain";
import type { AuditJournalEntry } from "./types";

/**
 * Persist a Layer 1 journal entry and then enqueue Layer 2 hashing using the
 * canonical Convex document ID.
 */
export async function appendAuditJournalEntry(
	ctx: MutationCtx,
	entry: AuditJournalEntry
): Promise<Id<"auditJournal">> {
	const journalEntryId = await ctx.db.insert("auditJournal", entry);
	await startHashChain(ctx, journalEntryId);
	return journalEntryId;
}
