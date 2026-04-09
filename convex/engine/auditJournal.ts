import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { startHashChain } from "./hashChain";
import type { AuditJournalEntry } from "./types";

const AUDIT_JOURNAL_SEQUENCE_NAME = "auditJournal";

export type AuditJournalEntryInput = Omit<
	AuditJournalEntry,
	| "effectiveDate"
	| "eventCategory"
	| "eventId"
	| "legalEntityId"
	| "originSystem"
	| "sequenceNumber"
> &
	Partial<
		Pick<
			AuditJournalEntry,
			| "afterState"
			| "beforeState"
			| "correlationId"
			| "delta"
			| "effectiveDate"
			| "eventCategory"
			| "eventId"
			| "idempotencyKey"
			| "legalEntityId"
			| "linkedRecordIds"
			| "originSystem"
			| "requestId"
		>
	>;

function randomAuditEventId() {
	const randomUuid = globalThis.crypto?.randomUUID?.();
	if (randomUuid) {
		return randomUuid;
	}

	return `audit_${Math.random().toString(36).slice(2, 12)}`;
}

function unixMsToBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

async function getNextAuditJournalSequenceNumber(
	ctx: Pick<MutationCtx, "db">
): Promise<bigint> {
	const existingCounters = await ctx.db
		.query("auditJournalSequenceCounters")
		.withIndex("by_name", (q) => q.eq("name", AUDIT_JOURNAL_SEQUENCE_NAME))
		.collect();

	if (existingCounters.length > 1) {
		throw new Error(
			`Multiple audit journal sequence counters found for ${AUDIT_JOURNAL_SEQUENCE_NAME}`
		);
	}

	const existingCounter = existingCounters[0];

	if (existingCounter) {
		const nextSequenceNumber = existingCounter.nextSequenceNumber;
		await ctx.db.patch(existingCounter._id, {
			nextSequenceNumber: nextSequenceNumber + 1n,
			updatedAt: Date.now(),
		});
		return nextSequenceNumber;
	}

	await ctx.db.insert("auditJournalSequenceCounters", {
		name: AUDIT_JOURNAL_SEQUENCE_NAME,
		nextSequenceNumber: 2n,
		updatedAt: Date.now(),
	});

	const initializedCounters = await ctx.db
		.query("auditJournalSequenceCounters")
		.withIndex("by_name", (q) => q.eq("name", AUDIT_JOURNAL_SEQUENCE_NAME))
		.collect();

	if (initializedCounters.length !== 1) {
		throw new Error(
			`Failed to initialize a singleton audit journal sequence counter for ${AUDIT_JOURNAL_SEQUENCE_NAME}`
		);
	}

	return 1n;
}

function defaultStateSnapshot(state: string) {
	return { status: state };
}

function resolveScopedAuditId(
	entry: Pick<
		AuditJournalEntryInput,
		"entityId" | "entityType" | "linkedRecordIds"
	>,
	key: "lenderId" | "mortgageId" | "obligationId" | "transferRequestId",
	entityType: AuditJournalEntryInput["entityType"]
) {
	const linkedValue = entry.linkedRecordIds?.[key];
	if (linkedValue != null) {
		return `${linkedValue}`;
	}
	return entry.entityType === entityType ? entry.entityId : undefined;
}

function normalizeAuditJournalEntry(
	entry: AuditJournalEntryInput,
	sequenceNumber: bigint
): AuditJournalEntry {
	return {
		...entry,
		afterState:
			entry.afterState ??
			(entry.newState === "none"
				? undefined
				: defaultStateSnapshot(entry.newState)),
		beforeState:
			entry.beforeState ??
			(entry.previousState === "none"
				? undefined
				: defaultStateSnapshot(entry.previousState)),
		delta: entry.delta ?? entry.payload,
		effectiveDate: entry.effectiveDate ?? unixMsToBusinessDate(entry.timestamp),
		eventCategory: entry.eventCategory ?? "governed_transition",
		eventId: entry.eventId ?? randomAuditEventId(),
		legalEntityId: entry.legalEntityId ?? entry.organizationId,
		lenderId: resolveScopedAuditId(entry, "lenderId", "lender"),
		linkedRecordIds: entry.linkedRecordIds ?? { entityId: entry.entityId },
		mortgageId: resolveScopedAuditId(entry, "mortgageId", "mortgage"),
		obligationId: resolveScopedAuditId(entry, "obligationId", "obligation"),
		originSystem: entry.originSystem ?? "convex",
		requestId: entry.requestId ?? entry.sessionId,
		sequenceNumber,
		transferRequestId: resolveScopedAuditId(
			entry,
			"transferRequestId",
			"transfer"
		),
	};
}

/**
 * Persist a Layer 1 journal entry and then enqueue Layer 2 hashing using the
 * canonical Convex document ID.
 */
export async function appendAuditJournalEntry(
	ctx: MutationCtx,
	entry: AuditJournalEntryInput
): Promise<Id<"auditJournal">> {
	const sequenceNumber = await getNextAuditJournalSequenceNumber(ctx);
	const normalizedEntry = normalizeAuditJournalEntry(entry, sequenceNumber);
	const journalEntryId = await ctx.db.insert("auditJournal", normalizedEntry);
	await startHashChain(ctx, journalEntryId);
	return journalEntryId;
}
