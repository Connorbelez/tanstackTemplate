import type { FunctionReference, FunctionType } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { auditLog } from "../auditLog";
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

interface ReconciliationResult {
	checkedAt: number;
	discrepancies: Discrepancy[];
	isHealthy: boolean;
}

type ReconciliationCtx = Pick<QueryCtx, "db">;

function makeInternalFunctionReference<
	Type extends FunctionType,
	Args extends Record<string, unknown>,
	ReturnType,
>(name: string) {
	return makeFunctionReference<Type, Args, ReturnType>(
		name
	) as unknown as FunctionReference<Type, "internal", Args, ReturnType>;
}

const reconcileInternalRef = makeInternalFunctionReference<
	"query",
	Record<string, never>,
	ReconciliationResult
>("engine/reconciliationAction:reconcileInternal");

const logReconciliationDiscrepanciesRef = makeInternalFunctionReference<
	"mutation",
	{
		checkedAt: number;
		discrepancies: Discrepancy[];
		discrepancyCount: number;
	},
	null
>("engine/reconciliationAction:logReconciliationDiscrepancies");

async function collectLatestEntries(
	ctx: ReconciliationCtx,
	entityType: keyof typeof ENTITY_TABLE_MAP
) {
	const latestByEntity = new Map<string, LatestJournalEntry>();
	let cursor: string | null = null;

	while (true) {
		const { continueCursor, isDone, page } = await ctx.db
			.query("auditJournal")
			.withIndex("by_type_and_time", (q) => q.eq("entityType", entityType))
			.order("desc")
			.paginate({ cursor, numItems: RECONCILIATION_PAGE_SIZE });

		for (const entry of page) {
			if (
				entry.outcome === "transitioned" &&
				!latestByEntity.has(entry.entityId)
			) {
				latestByEntity.set(entry.entityId, {
					_id: entry._id,
					newState: entry.newState,
				});
			}
		}

		if (isDone) {
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
	if (entityType === "collectionAttempt") {
		const e = await ctx.db.get(entityId as Id<"collectionAttempts">);
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
 * Internal mutation to persist reconciliation discrepancies through the audit pipeline.
 * Actions cannot call auditLog.log() directly (it requires MutationCtx),
 * so dailyReconciliation schedules this mutation via ctx.runMutation.
 */
export const logReconciliationDiscrepancies = internalMutation({
	args: {
		discrepancyCount: v.number(),
		discrepancies: v.array(
			v.object({
				entityId: v.string(),
				entityStatus: v.string(),
				entityType: v.string(),
				journalEntryId: v.string(),
				journalNewState: v.string(),
			})
		),
		checkedAt: v.number(),
	},
	handler: async (ctx, args) => {
		await auditLog.log(ctx, {
			action: "reconciliation.discrepancies_found",
			actorId: "system",
			resourceType: "reconciliation",
			resourceId: "daily-check",
			severity: "error",
			metadata: {
				checkedAt: args.checkedAt,
				discrepancyCount: args.discrepancyCount,
				discrepancies: args.discrepancies,
			},
		});
	},
});

/**
 * Daily reconciliation cron action.
 * Runs Layer 1 (status vs journal) and logs discrepancies as P0 errors.
 */
export const dailyReconciliation = internalAction({
	handler: async (ctx) => {
		const result = await ctx.runQuery(reconcileInternalRef, {});

		if (result.isHealthy) {
			console.info("[RECONCILIATION] Daily check passed — zero discrepancies.");
		} else {
			console.error(
				`[RECONCILIATION P0] ${result.discrepancies.length} discrepancies found:`,
				JSON.stringify(result.discrepancies, null, 2)
			);

			await ctx.runMutation(logReconciliationDiscrepanciesRef, {
				discrepancyCount: result.discrepancies.length,
				discrepancies: result.discrepancies,
				checkedAt: result.checkedAt,
			});
		}

		return result;
	},
});
