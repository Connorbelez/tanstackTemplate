import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";
import { adminQuery } from "../fluent";
import { ENTITY_TABLE_MAP } from "./types";

const auditTrail = new AuditTrail(components.auditTrail);
const RECONCILIATION_PAGE_SIZE = 128;

interface Discrepancy {
	entityId: string;
	entityStatus: string;
	entityType: string;
	journalEntryId: string;
	journalNewState: string;
}

type ReconciliationCtx = Pick<QueryCtx, "db" | "runQuery">;
interface LatestJournalEntry {
	_id: string;
	newState: string;
}

async function collectLatestJournalEntries(
	ctx: ReconciliationCtx,
	entityType: keyof typeof ENTITY_TABLE_MAP
) {
	const latestByEntity = new Map<string, LatestJournalEntry>();
	let cursor: string | null = null;

	let consecutiveEmptyPages = 0;

	while (true) {
		const { continueCursor, isDone, page } = await ctx.db
			.query("auditJournal")
			.withIndex("by_type_and_time", (q) => q.eq("entityType", entityType))
			.order("desc")
			.paginate({
				cursor,
				numItems: RECONCILIATION_PAGE_SIZE,
			});

		let foundNewEntity = false;
		for (const entry of page) {
			if (
				entry.outcome === "transitioned" &&
				!latestByEntity.has(entry.entityId)
			) {
				latestByEntity.set(entry.entityId, {
					_id: entry._id,
					newState: entry.newState,
				});
				foundNewEntity = true;
			}
		}

		if (isDone) {
			return latestByEntity;
		}

		// Early exit: entries arrive newest-first, so once we stop discovering
		// new entities for several consecutive pages, all remaining pages contain
		// only older entries for entities we already captured.
		consecutiveEmptyPages = foundNewEntity ? 0 : consecutiveEmptyPages + 1;
		if (consecutiveEmptyPages >= 3) {
			return latestByEntity;
		}

		cursor = continueCursor;
	}
}

async function getEntityStatus(
	ctx: ReconciliationCtx,
	entityType: keyof typeof ENTITY_TABLE_MAP,
	entityId: string
): Promise<string | null | undefined> {
	// biome-ignore lint/style/useDefaultSwitchClause: entityType is an exhaustive union here.
	switch (entityType) {
		case "onboardingRequest": {
			const entity = await ctx.db.get(entityId as Id<"onboardingRequests">);
			return entity?.status ?? null;
		}
		case "mortgage": {
			const entity = await ctx.db.get(entityId as Id<"mortgages">);
			return entity?.status ?? null;
		}
		case "obligation": {
			const entity = await ctx.db.get(entityId as Id<"obligations">);
			return entity?.status ?? null;
		}
		// Non-governed entity types: tables exist in schema but have no
		// machine definitions. Skip to avoid false discrepancies.
		case "deal":
		case "provisionalApplication":
		case "applicationPackage":
		case "broker":
		case "borrower":
		case "lenderOnboarding":
		case "provisionalOffer":
		case "offerCondition":
		case "lenderRenewalIntent":
			return undefined;
	}
}

/**
 * Layer 1 reconciliation: verifies each governed entity's current status
 * matches the newState of its most recent "transitioned" journal entry.
 *
 * Any discrepancy means something changed status outside the transition engine.
 */
export const reconcile = adminQuery
	.input({})
	.handler(async (ctx) => {
		const discrepancies: Discrepancy[] = [];
		const entityTypes = Object.keys(ENTITY_TABLE_MAP) as Array<
			keyof typeof ENTITY_TABLE_MAP
		>;

		for (const entityType of entityTypes) {
			const latestByEntity = await collectLatestJournalEntries(ctx, entityType);

			// Skip entity types with no journal entries (handles missing tables gracefully)
			if (latestByEntity.size === 0) {
				continue;
			}

			for (const [entityId, journal] of latestByEntity) {
				const entityStatus = await getEntityStatus(ctx, entityType, entityId);
				// undefined = entity type not yet supported by transition engine — skip
				if (entityStatus === undefined) {
					continue;
				}
				if (entityStatus === null) {
					discrepancies.push({
						entityType,
						entityId,
						entityStatus: "ENTITY_NOT_FOUND",
						journalNewState: journal.newState,
						journalEntryId: journal._id,
					});
					continue;
				}

				if (entityStatus !== journal.newState) {
					discrepancies.push({
						entityType,
						entityId,
						entityStatus,
						journalNewState: journal.newState,
						journalEntryId: journal._id,
					});
				}
			}
		}

		return {
			checkedAt: Date.now(),
			discrepancies,
			isHealthy: discrepancies.length === 0,
		};
	})
	.public();

interface ChainVerification {
	brokenAt?: number;
	entityId: string;
	error?: string;
	eventCount?: number;
	valid: boolean;
}

function buildMissingChainVerification(entityId: string): ChainVerification {
	return {
		entityId,
		valid: false,
		eventCount: 0,
		error: "No Layer 2 entries found for entity with journal records",
	};
}

function normalizeChainVerification(
	entityId: string,
	result: unknown
): ChainVerification {
	if (!result || typeof result !== "object") {
		return buildMissingChainVerification(entityId);
	}

	const rawResult = result as {
		brokenAt?: unknown;
		error?: unknown;
		eventCount?: unknown;
		valid?: unknown;
	};
	if (typeof rawResult.valid !== "boolean") {
		return buildMissingChainVerification(entityId);
	}

	const eventCount =
		typeof rawResult.eventCount === "number" ? rawResult.eventCount : undefined;
	if (eventCount === 0) {
		return buildMissingChainVerification(entityId);
	}

	return {
		entityId,
		valid: rawResult.valid,
		eventCount,
		error: typeof rawResult.error === "string" ? rawResult.error : undefined,
		brokenAt:
			typeof rawResult.brokenAt === "number" ? rawResult.brokenAt : undefined,
	};
}

async function collectEntityIdsWithJournalEntries(ctx: ReconciliationCtx) {
	const uniqueEntityIds = new Set<string>();
	let cursor: string | null = null;

	while (true) {
		const { continueCursor, isDone, page } = await ctx.db
			.query("auditJournal")
			.paginate({
				cursor,
				numItems: RECONCILIATION_PAGE_SIZE,
			});

		for (const entry of page) {
			uniqueEntityIds.add(entry.entityId);
		}

		if (isDone) {
			return uniqueEntityIds;
		}

		cursor = continueCursor;
	}
}

/**
 * Layer 2 reconciliation: verifies the SHA-256 hash chain integrity in the
 * auditTrail component for every entity that has journal entries.
 *
 * A broken chain means a Layer 2 entry was tampered with or is missing.
 */
export const reconcileLayer2 = adminQuery
	.input({})
	.handler(async (ctx) => {
		const verifications: ChainVerification[] = [];
		const uniqueEntityIds = await collectEntityIdsWithJournalEntries(ctx);

		for (const entityId of uniqueEntityIds) {
			const result = await auditTrail.verifyChain(ctx, { entityId });
			verifications.push(normalizeChainVerification(entityId, result));
		}

		const brokenChains = verifications.filter((v) => !v.valid);

		return {
			checkedAt: Date.now(),
			totalEntities: verifications.length,
			verifications,
			brokenChains,
			isHealthy: brokenChains.length === 0,
		};
	})
	.public();
