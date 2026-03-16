import { components } from "../_generated/api";
import { query } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";
import { ENTITY_TABLE_MAP } from "./types";

const auditTrail = new AuditTrail(components.auditTrail);

interface Discrepancy {
	entityId: string;
	entityStatus: string;
	entityType: string;
	journalEntryId: string;
	journalNewState: string;
}

/**
 * Layer 1 reconciliation: verifies each governed entity's current status
 * matches the newState of its most recent "transitioned" journal entry.
 *
 * Any discrepancy means something changed status outside the transition engine.
 */
export const reconcile = query({
	args: {},
	handler: async (ctx) => {
		const discrepancies: Discrepancy[] = [];
		const entityTypes = Object.keys(ENTITY_TABLE_MAP) as Array<
			keyof typeof ENTITY_TABLE_MAP
		>;

		for (const entityType of entityTypes) {
			const journalEntries = await ctx.db
				.query("auditJournal")
				.withIndex("by_type_and_time", (q) => q.eq("entityType", entityType))
				.order("desc")
				.collect();

			// Skip entity types with no journal entries (handles missing tables gracefully)
			if (journalEntries.length === 0) {
				continue;
			}

			// Group by entityId, take latest "transitioned" entry per entity
			const latestByEntity = new Map<
				string,
				{ newState: string; _id: string }
			>();
			for (const entry of journalEntries) {
				if (
					entry.outcome === "transitioned" &&
					!latestByEntity.has(entry.entityId)
				) {
					latestByEntity.set(entry.entityId, {
						newState: entry.newState,
						_id: entry._id,
					});
				}
			}

			for (const [entityId, journal] of latestByEntity) {
				// ENTITY_TABLE_MAP includes future tables (mortgages, obligations) not yet
				// in schema. Runtime safety: no journal entries for those → skipped above.
				// TODO(ENG-18): Replace any cast when mortgages/obligations tables exist
				// biome-ignore lint/suspicious/noExplicitAny: Future table names not in schema yet
				const entity = await ctx.db.get(entityId as any);
				if (!entity) {
					discrepancies.push({
						entityType,
						entityId,
						entityStatus: "ENTITY_NOT_FOUND",
						journalNewState: journal.newState,
						journalEntryId: journal._id,
					});
					continue;
				}

				const entityStatus = (entity as { status: string }).status;
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
	},
});

interface ChainVerification {
	brokenAt?: number;
	entityId: string;
	error?: string;
	eventCount?: number;
	valid: boolean;
}

/**
 * Layer 2 reconciliation: verifies the SHA-256 hash chain integrity in the
 * auditTrail component for every entity that has journal entries.
 *
 * A broken chain means a Layer 2 entry was tampered with or is missing.
 */
export const reconcileLayer2 = query({
	args: {},
	handler: async (ctx) => {
		const verifications: ChainVerification[] = [];

		// Collect unique entityIds from the journal
		const allEntries = await ctx.db.query("auditJournal").collect();
		const uniqueEntityIds = new Set<string>();
		for (const entry of allEntries) {
			uniqueEntityIds.add(entry.entityId);
		}

		for (const entityId of uniqueEntityIds) {
			const result = await auditTrail.verifyChain(ctx, { entityId });

			if (result && typeof result === "object" && "valid" in result) {
				verifications.push({
					entityId,
					valid: result.valid as boolean,
					eventCount:
						"eventCount" in result ? (result.eventCount as number) : undefined,
					error: "error" in result ? (result.error as string) : undefined,
					brokenAt:
						"brokenAt" in result ? (result.brokenAt as number) : undefined,
				});
			} else {
				// No Layer 2 entries for this entity — chain is missing
				verifications.push({
					entityId,
					valid: false,
					eventCount: 0,
					error: "No Layer 2 entries found for entity with journal records",
				});
			}
		}

		const brokenChains = verifications.filter((v) => !v.valid);

		return {
			checkedAt: Date.now(),
			totalEntities: verifications.length,
			verifications,
			brokenChains,
			isHealthy: brokenChains.length === 0,
		};
	},
});
