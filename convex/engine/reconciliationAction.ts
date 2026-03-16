import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalAction, internalQuery } from "../_generated/server";
import { ENTITY_TABLE_MAP } from "./types";

const RECONCILIATION_PAGE_SIZE = 128;

interface LatestJournalEntry {
	_id: string;
	newState: string;
}

interface Discrepancy {
	entityId: string;
	entityStatus: string;
	entityType: string;
	journalEntryId: string;
	journalNewState: string;
}

type ReconciliationCtx = Pick<QueryCtx, "db">;

async function collectLatestEntries(
	ctx: ReconciliationCtx,
	entityType: string
) {
	const latestByEntity = new Map<string, LatestJournalEntry>();
	let cursor: string | null = null;
	let consecutiveEmptyPages = 0;

	while (true) {
		const { continueCursor, isDone, page } = await ctx.db
			.query("auditJournal")
			.withIndex("by_type_and_time", (q) => q.eq("entityType", entityType))
			.order("desc")
			.paginate({ cursor, numItems: RECONCILIATION_PAGE_SIZE });

		let foundNew = false;
		for (const entry of page) {
			if (
				entry.outcome === "transitioned" &&
				!latestByEntity.has(entry.entityId)
			) {
				latestByEntity.set(entry.entityId, {
					_id: entry._id,
					newState: entry.newState,
				});
				foundNew = true;
			}
		}

		if (isDone) {
			return latestByEntity;
		}
		consecutiveEmptyPages = foundNew ? 0 : consecutiveEmptyPages + 1;
		if (consecutiveEmptyPages >= 3) {
			return latestByEntity;
		}
		cursor = continueCursor;
	}
}

async function lookupStatus(
	ctx: ReconciliationCtx,
	entityType: string,
	entityId: string
): Promise<string | null | undefined> {
	if (entityType === "onboardingRequest") {
		const e = await ctx.db.get(entityId as Id<"onboardingRequests">);
		return e?.status ?? null;
	}
	if (entityType === "mortgage") {
		const e = await ctx.db.get(entityId as Id<"mortgages">);
		return e?.status ?? null;
	}
	if (entityType === "obligation") {
		const e = await ctx.db.get(entityId as Id<"obligations">);
		return e?.status ?? null;
	}
	return undefined;
}

function buildDiscrepancy(
	entityType: string,
	entityId: string,
	entityStatus: string | null,
	journal: LatestJournalEntry
): Discrepancy | null {
	if (entityStatus === null) {
		return {
			entityType,
			entityId,
			entityStatus: "ENTITY_NOT_FOUND",
			journalNewState: journal.newState,
			journalEntryId: journal._id,
		};
	}
	if (entityStatus !== journal.newState) {
		return {
			entityType,
			entityId,
			entityStatus,
			journalNewState: journal.newState,
			journalEntryId: journal._id,
		};
	}
	return null;
}

/**
 * Internal query for reconciliation — no auth required.
 * Mirrors the logic in reconciliation.ts but callable from scheduled actions.
 */
export const reconcileInternal = internalQuery({
	handler: async (ctx) => {
		const discrepancies: Discrepancy[] = [];
		const entityTypes = Object.keys(ENTITY_TABLE_MAP) as Array<
			keyof typeof ENTITY_TABLE_MAP
		>;

		for (const entityType of entityTypes) {
			const latestByEntity = await collectLatestEntries(ctx, entityType);
			if (latestByEntity.size === 0) {
				continue;
			}

			for (const [entityId, journal] of latestByEntity) {
				const status = await lookupStatus(ctx, entityType, entityId);
				if (status === undefined) {
					continue;
				}
				const d = buildDiscrepancy(entityType, entityId, status, journal);
				if (d) {
					discrepancies.push(d);
				}
			}
		}

		return {
			checkedAt: Date.now(),
			discrepancies,
			isHealthy: discrepancies.length === 0,
		};
	},
});

/**
 * Daily reconciliation cron action.
 * Runs Layer 1 (status vs journal) and logs discrepancies as P0 errors.
 */
export const dailyReconciliation = internalAction({
	handler: async (ctx) => {
		const { internal } = await import("../_generated/api");
		const result = await ctx.runQuery(
			// @ts-expect-error — resolves after `convex codegen` (new file not yet in generated API)
			internal.engine.reconciliationAction.reconcileInternal,
			{}
		);

		if (result.isHealthy) {
			console.info("[RECONCILIATION] Daily check passed — zero discrepancies.");
		} else {
			console.error(
				`[RECONCILIATION P0] ${result.discrepancies.length} discrepancies found:`,
				JSON.stringify(result.discrepancies, null, 2)
			);
		}

		return result;
	},
});
