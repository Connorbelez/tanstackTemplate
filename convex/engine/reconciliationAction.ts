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
import type { ReplayResult } from "../payments/cashLedger/replayIntegrity";
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

// ── Replay Integrity Refs ────────────────────────────────────

const runReplayIntegrityCheckRef = makeInternalFunctionReference<
	"query",
	Record<string, never>,
	ReplayResult
>("payments/cashLedger/reconciliation:runReplayIntegrityCheck");

const advanceReplayCursorRef = makeInternalFunctionReference<
	"mutation",
	{ lastProcessedSequence: bigint },
	null
>("payments/cashLedger/replayIntegrity:advanceReplayCursor");

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
	// Table-driven lookup: entityType → typed getter.
	switch (entityType) {
		case "onboardingRequest":
			return (
				(await ctx.db.get(entityId as Id<"onboardingRequests">))?.status ?? null
			);
		case "mortgage":
			return (await ctx.db.get(entityId as Id<"mortgages">))?.status ?? null;
		case "obligation":
			return (await ctx.db.get(entityId as Id<"obligations">))?.status ?? null;
		case "collectionAttempt":
			return (
				(await ctx.db.get(entityId as Id<"collectionAttempts">))?.status ?? null
			);
		case "deal":
			return (await ctx.db.get(entityId as Id<"deals">))?.status ?? null;
		case "provisionalApplication":
			return (
				(await ctx.db.get(entityId as Id<"provisionalApplications">))?.status ??
				null
			);
		case "applicationPackage":
			return (
				(await ctx.db.get(entityId as Id<"applicationPackages">))?.status ??
				null
			);
		case "broker":
			return (await ctx.db.get(entityId as Id<"brokers">))?.status ?? null;
		case "borrower":
			return (await ctx.db.get(entityId as Id<"borrowers">))?.status ?? null;
		case "lender":
			return (await ctx.db.get(entityId as Id<"lenders">))?.status ?? null;
		case "lenderOnboarding":
			return (
				(await ctx.db.get(entityId as Id<"lenderOnboardings">))?.status ?? null
			);
		case "provisionalOffer":
			return (
				(await ctx.db.get(entityId as Id<"provisionalOffers">))?.status ?? null
			);
		case "offerCondition":
			return (
				(await ctx.db.get(entityId as Id<"offerConditions">))?.status ?? null
			);
		case "lenderRenewalIntent":
			return (
				(await ctx.db.get(entityId as Id<"lenderRenewalIntents">))?.status ??
				null
			);
		default: {
			// Log error for any entity type not yet covered — this prevents silent skipping
			console.error(
				`[RECONCILIATION] lookupStatus: unhandled entity type "${entityType}" for entity ${entityId}. This entity will NOT be reconciled.`
			);
			return undefined;
		}
	}
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
 * Layer 1 (StatusCheck): state-machine status must match latest audit journal entry.
 * Layer 2 (BalanceCheck): replayed journal entry totals must match stored account balances.
 * Each layer runs independently — a failure in one does not prevent the other from running.
 */
export const dailyReconciliation = internalAction({
	handler: async (ctx) => {
		// ── Layer 1: StatusCheck (status vs journal) ────────────────
		let layer1Result: {
			isHealthy: boolean;
			checkedAt: number;
			discrepancies: Discrepancy[];
		} | null = null;
		try {
			layer1Result = await ctx.runQuery(reconcileInternalRef, {});

			if (layer1Result.isHealthy) {
				console.info(
					"[RECONCILIATION] StatusCheck passed — zero discrepancies."
				);
			} else {
				console.error(
					`[RECONCILIATION P0] ${layer1Result.discrepancies.length} discrepancies found:`,
					JSON.stringify(layer1Result.discrepancies, null, 2)
				);

				await ctx.runMutation(logReconciliationDiscrepanciesRef, {
					discrepancyCount: layer1Result.discrepancies.length,
					discrepancies: layer1Result.discrepancies,
					checkedAt: layer1Result.checkedAt,
				});
			}
		} catch (error) {
			console.error(
				"[RECONCILIATION FATAL] StatusCheck failed entirely:",
				error instanceof Error ? error.message : String(error)
			);
			// Continue to Layer 2 so partial checks still run
		}

		// ── Layer 2: BalanceCheck (journal replay integrity) ───────
		try {
			const replayResult = await ctx.runQuery(runReplayIntegrityCheckRef, {});

			if (replayResult.passed) {
				console.info(
					`[REPLAY INTEGRITY] BalanceCheck passed — ${replayResult.entriesReplayed} entries replayed, ` +
						`${replayResult.accountsChecked} accounts checked in ${replayResult.durationMs}ms.`
				);

				// Advance cursor so next incremental run starts from here
				if (replayResult.toSequence !== "0") {
					await ctx.runMutation(advanceReplayCursorRef, {
						lastProcessedSequence: BigInt(replayResult.toSequence),
					});
				}
			} else {
				console.error(
					`[REPLAY INTEGRITY P0] ${replayResult.mismatches.length} mismatches, ` +
						`${replayResult.missingSequences.length} missing sequences found:`,
					JSON.stringify(replayResult, null, 2)
				);

				const discrepancies: Discrepancy[] = replayResult.mismatches.map(
					(m) => ({
						entityType: "cash_ledger_account",
						entityId: m.accountId,
						entityStatus: `debits=${m.storedDebits},credits=${m.storedCredits}`,
						journalNewState: `debits=${m.expectedDebits},credits=${m.expectedCredits}`,
						journalEntryId: `seq:${m.firstDivergenceSequence}-${m.lastEntrySequence}`,
					})
				);

				// Gap-only failures persist an empty discrepancy list with a non-zero count
				// without this entry — build a proper Discrepancy for missing sequences
				for (const seq of replayResult.missingSequences) {
					discrepancies.push({
						entityType: "cash_ledger_sequence_gap",
						entityId: "gap",
						entityStatus: "SEQUENCE_MISSING",
						journalNewState: seq.toString(),
						journalEntryId: "gap",
					});
				}

				await ctx.runMutation(logReconciliationDiscrepanciesRef, {
					discrepancyCount: discrepancies.length,
					discrepancies,
					checkedAt: Date.now(),
				});
			}
		} catch (error) {
			console.error(
				"[REPLAY INTEGRITY FATAL] BalanceCheck failed entirely:",
				error instanceof Error ? error.message : String(error)
			);
		}

		return layer1Result;
	},
});
