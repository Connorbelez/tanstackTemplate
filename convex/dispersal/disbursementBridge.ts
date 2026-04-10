/**
 * Disbursement Bridge — converts eligible dispersalEntries into outbound
 * transferRequests of type `lender_dispersal_payout`.
 *
 * Flow:
 *   1. `findEligibleEntriesInternal` — query pending entries past hold period
 *   2. `triggerDisbursementBridge` — internalAction orchestrator (batch)
 *      a. For each entry: `processSingleDisbursement` — validate + insert transfer
 *      b. Then: `initiateTransferInternal` — initiate via provider
 *   3. `resetFailedEntry` — reset a failed entry back to pending for retry
 *
 * Design decisions:
 *   - Pending -> Disbursed directly (skip "eligible" status); entry becomes
 *     "disbursed" when the transfer confirms (handled by transfer settlement).
 *   - One transfer per dispersal entry.
 *   - Phase 1: admin-triggered, mock_eft provider.
 *   - Idempotency key: `disbursement:{dispersalEntryId}`
 *   - ENG-219: amounts are used as-is, never recomputed.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import type { CommandSource } from "../engine/types";
import { orgIdFromMortgageId } from "../lib/orgScope";
import { assertDisbursementAllowed } from "../payments/cashLedger/disbursementGate";
import { areMockTransferProvidersEnabled } from "../payments/transfers/mockProviders";
import {
	InvalidDomainEntityIdError,
	toDomainEntityId,
} from "../payments/transfers/types";

// ═══════════════════════════════════════════════════════════════════════
// Constants & Types
// ═══════════════════════════════════════════════════════════════════════

/** System source for bridge-initiated transfers. */
const BRIDGE_SOURCE: CommandSource = {
	channel: "scheduler",
	actorType: "system",
};

/** Default batch size for disbursement processing. */
const DEFAULT_BATCH_SIZE = 50;

/** Default provider for Phase 1 disbursements. */
const DEFAULT_PROVIDER_CODE = "mock_eft" as const;

/**
 * Builds a deterministic idempotency key for a disbursement transfer.
 * Format: `disbursement:{dispersalEntryId}`
 */
export function buildDisbursementIdempotencyKey(
	dispersalEntryId: Id<"dispersalEntries">
): string {
	return `disbursement:${dispersalEntryId}`;
}

/** Outcome for a single entry processed by the bridge. */
export interface DisbursementEntryResult {
	dispersalEntryId: Id<"dispersalEntries">;
	error?: string;
	lenderId: Id<"lenders">;
	outcome: "created" | "skipped_idempotent" | "failed";
	transferId?: Id<"transferRequests">;
}

/** Summary returned by triggerDisbursementBridge. */
export interface DisbursementBridgeResult {
	batchSize: number;
	created: number;
	eligibleCount: number;
	failed: number;
	results: DisbursementEntryResult[];
	skippedIdempotent: number;
}

// ═══════════════════════════════════════════════════════════════════════
// T-002: findEligibleEntriesInternal
// ═══════════════════════════════════════════════════════════════════════

/**
 * Finds pending dispersal entries whose hold period has passed.
 *
 * Two buckets:
 *   1. Entries with `payoutEligibleAfter <= asOfDate` (hold period passed)
 *   2. Legacy entries with no `payoutEligibleAfter` (immediately eligible)
 *
 * Returns up to `limit` entries sorted by dispersalDate (oldest first).
 */
export const findEligibleEntriesInternal = internalQuery({
	args: {
		asOfDate: v.string(),
		lenderId: v.optional(v.id("lenders")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const effectiveLimit = args.limit ?? DEFAULT_BATCH_SIZE;

		// Bucket 1: pending entries whose hold date has passed
		const pendingPastHold = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_eligibility", (q) =>
				q.eq("status", "pending").lte("payoutEligibleAfter", args.asOfDate)
			)
			.collect();

		const eligibleWithHold = pendingPastHold.filter((entry) => {
			if (args.lenderId && entry.lenderId !== args.lenderId) {
				return false;
			}
			return (
				entry.payoutEligibleAfter !== undefined &&
				entry.payoutEligibleAfter !== ""
			);
		});

		// Bucket 2: legacy entries with no payoutEligibleAfter
		const pendingAll = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_eligibility", (q) => q.eq("status", "pending"))
			.collect();

		const eligibleLegacy = pendingAll.filter((entry) => {
			if (args.lenderId && entry.lenderId !== args.lenderId) {
				return false;
			}
			return !entry.payoutEligibleAfter;
		});

		// Combine and sort by dispersalDate (oldest first), then createdAt, then _id
		const eligible = [...eligibleWithHold, ...eligibleLegacy];
		eligible.sort((a, b) => {
			if (a.dispersalDate !== b.dispersalDate) {
				return a.dispersalDate.localeCompare(b.dispersalDate);
			}
			if (a.createdAt !== b.createdAt) {
				return a.createdAt - b.createdAt;
			}
			return (a._id as string).localeCompare(b._id as string);
		});

		return eligible.slice(0, effectiveLimit);
	},
});

// ═══════════════════════════════════════════════════════════════════════
// T-003: processSingleDisbursement
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validates a single dispersal entry and creates the corresponding
 * outbound transfer record. Runs inside a mutation for transactional
 * consistency.
 *
 * Steps:
 *   1. Idempotency check — if a transfer already exists, return its ID
 *   2. Re-read entry and verify it is still "pending"
 *   3. Validate amount is a positive integer (cents)
 *   4. Validate counterpartyId (lenderId) is a domain entity ID
 *   5. Assert disbursement allowed (balance gate)
 *   6. Check mock provider is enabled
 *   7. Insert transfer record with status "initiated"
 *
 * Returns the transfer ID and whether it was newly created or idempotent.
 */
export const processSingleDisbursement = internalMutation({
	args: {
		dispersalEntryId: v.id("dispersalEntries"),
		providerCode: v.optional(
			v.union(
				v.literal("manual"),
				v.literal("manual_review"),
				v.literal("mock_pad"),
				v.literal("mock_eft"),
				v.literal("pad_vopay"),
				v.literal("pad_rotessa"),
				v.literal("eft_vopay"),
				v.literal("e_transfer"),
				v.literal("wire"),
				v.literal("plaid_transfer")
			)
		),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		transferId: Id<"transferRequests">;
		created: boolean;
	}> => {
		const providerCode = args.providerCode ?? DEFAULT_PROVIDER_CODE;
		const idempotencyKey = buildDisbursementIdempotencyKey(
			args.dispersalEntryId
		);

		// 1. Idempotency check — ignore transfers in terminal failure states
		// so that resetFailedEntry → re-run bridge works correctly.
		const existing = await ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", idempotencyKey)
			)
			.first();

		if (
			existing &&
			existing.status !== "failed" &&
			existing.status !== "cancelled"
		) {
			return { transferId: existing._id, created: false };
		}

		// 2. Re-read entry and verify still pending
		const entry = await ctx.db.get(args.dispersalEntryId);
		if (!entry) {
			throw new ConvexError({
				code: "ENTRY_NOT_FOUND" as const,
				dispersalEntryId: args.dispersalEntryId,
				message: "Dispersal entry not found",
			});
		}

		if (entry.status !== "pending") {
			throw new ConvexError({
				code: "ENTRY_NOT_PENDING" as const,
				dispersalEntryId: args.dispersalEntryId,
				currentStatus: entry.status,
				message: `Dispersal entry is "${entry.status}", expected "pending"`,
			});
		}

		// 2b. Verify calculation details exist (ownership snapshot was recorded)
		if (
			!(
				entry.calculationDetails &&
				Number.isFinite(entry.calculationDetails.settledAmount)
			) ||
			entry.calculationDetails.settledAmount <= 0 ||
			!Number.isFinite(entry.calculationDetails.distributableAmount) ||
			entry.calculationDetails.distributableAmount < 0
		) {
			throw new ConvexError({
				code: "MISSING_CALCULATION_DETAILS" as const,
				dispersalEntryId: args.dispersalEntryId,
				message: "Dispersal entry is missing valid calculation details",
			});
		}

		// 2c. Verify amount does not exceed distributable amount
		if (entry.amount > entry.calculationDetails.distributableAmount) {
			throw new ConvexError({
				code: "AMOUNT_EXCEEDS_DISTRIBUTABLE" as const,
				dispersalEntryId: args.dispersalEntryId,
				amount: entry.amount,
				distributableAmount: entry.calculationDetails.distributableAmount,
				message:
					"Entry amount exceeds the distributable amount from its calculation",
			});
		}

		// 3. Validate amount is positive integer (safe-integer cents)
		if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
			throw new ConvexError({
				code: "INVALID_AMOUNT" as const,
				dispersalEntryId: args.dispersalEntryId,
				amount: entry.amount,
				message: "Amount must be a positive integer (cents)",
			});
		}

		// 4. Validate counterpartyId — lenderId must be a domain entity ID
		const counterpartyIdRaw = entry.lenderId as string;
		let counterpartyId: string;
		try {
			counterpartyId = toDomainEntityId(counterpartyIdRaw, "lenderId");
		} catch (error) {
			if (error instanceof InvalidDomainEntityIdError) {
				throw new ConvexError({
					code: "INVALID_COUNTERPARTY" as const,
					dispersalEntryId: args.dispersalEntryId,
					message: error.message,
				});
			}
			throw error;
		}

		// 5. Assert disbursement allowed (balance gate)
		await assertDisbursementAllowed(ctx, {
			lenderId: entry.lenderId,
			requestedAmount: entry.amount,
		});

		// 6. Check mock provider is enabled
		if (
			(providerCode === "mock_pad" || providerCode === "mock_eft") &&
			!areMockTransferProvidersEnabled()
		) {
			throw new ConvexError({
				code: "MOCK_PROVIDER_DISABLED" as const,
				providerCode,
				message: `Transfer provider "${providerCode}" is disabled by default. Set ENABLE_MOCK_PROVIDERS="true" to opt in.`,
			});
		}

		// 7. Insert transfer record
		// If a prior failed/cancelled transfer exists, use a versioned
		// idempotency key so the new transfer doesn't collide.
		const effectiveIdempotencyKey =
			existing &&
			(existing.status === "failed" || existing.status === "cancelled")
				? `${idempotencyKey}:retry:${Date.now()}`
				: idempotencyKey;

		const now = Date.now();
		const orgId =
			entry.orgId ?? (await orgIdFromMortgageId(ctx, entry.mortgageId));
		const transferId = await ctx.db.insert("transferRequests", {
			orgId,
			status: "initiated",
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: entry.amount,
			currency: "CAD",
			counterpartyType: "lender",
			counterpartyId,
			// References
			mortgageId: entry.mortgageId,
			dispersalEntryId: entry._id,
			lenderId: entry.lenderId,
			obligationId: entry.obligationId,
			// Provider & idempotency
			providerCode,
			idempotencyKey: effectiveIdempotencyKey,
			source: BRIDGE_SOURCE,
			// Timestamps
			createdAt: now,
			lastTransitionAt: now,
		});

		console.info(
			`[disbursementBridge] Created transfer ${transferId} for entry ${args.dispersalEntryId} (amount: ${entry.amount}, lender: ${entry.lenderId})`
		);

		return { transferId, created: true };
	},
});

// ═══════════════════════════════════════════════════════════════════════
// T-004: triggerDisbursementBridge
// ═══════════════════════════════════════════════════════════════════════

/**
 * Orchestrates a batch disbursement run. This is the top-level entry
 * point triggered by an admin action.
 *
 * Flow for each eligible entry:
 *   1. `processSingleDisbursement` — validate + insert transfer record
 *   2. `initiateTransferInternal` — initiate via provider
 *
 * Failures on individual entries are caught and recorded; the batch
 * continues processing remaining entries.
 */
export const triggerDisbursementBridge = internalAction({
	args: {
		asOfDate: v.string(),
		lenderId: v.optional(v.id("lenders")),
		batchSize: v.optional(v.number()),
		providerCode: v.optional(
			v.union(
				v.literal("manual"),
				v.literal("manual_review"),
				v.literal("mock_pad"),
				v.literal("mock_eft"),
				v.literal("pad_vopay"),
				v.literal("pad_rotessa"),
				v.literal("eft_vopay"),
				v.literal("e_transfer"),
				v.literal("wire"),
				v.literal("plaid_transfer")
			)
		),
	},
	handler: async (ctx, args): Promise<DisbursementBridgeResult> => {
		const effectiveBatchSize = args.batchSize ?? DEFAULT_BATCH_SIZE;

		// 1. Find eligible entries
		const eligibleEntries: Doc<"dispersalEntries">[] = await ctx.runQuery(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{
				asOfDate: args.asOfDate,
				lenderId: args.lenderId,
				limit: effectiveBatchSize,
			}
		);

		console.info(
			`[disbursementBridge] Found ${eligibleEntries.length} eligible entries (batchSize: ${effectiveBatchSize}, asOfDate: ${args.asOfDate})`
		);

		if (eligibleEntries.length === 0) {
			return {
				eligibleCount: 0,
				batchSize: effectiveBatchSize,
				created: 0,
				skippedIdempotent: 0,
				failed: 0,
				results: [],
			};
		}

		// 2. Process each entry
		const results: DisbursementEntryResult[] = [];
		let created = 0;
		let skippedIdempotent = 0;
		let failed = 0;

		for (const entry of eligibleEntries) {
			try {
				// 2a. Validate + insert transfer record
				const { transferId, created: wasCreated } = await ctx.runMutation(
					internal.dispersal.disbursementBridge.processSingleDisbursement,
					{
						dispersalEntryId: entry._id,
						providerCode: args.providerCode,
					}
				);

				if (!wasCreated) {
					// Idempotent: transfer already existed
					skippedIdempotent += 1;
					results.push({
						dispersalEntryId: entry._id,
						lenderId: entry.lenderId,
						outcome: "skipped_idempotent",
						transferId,
					});
					console.info(
						`[disbursementBridge] Skipped entry ${entry._id} — transfer ${transferId} already exists`
					);
					continue;
				}

				// 2b. Initiate the transfer via provider
				await ctx.runAction(
					internal.payments.transfers.mutations.initiateTransferInternal,
					{ transferId }
				);

				created += 1;
				results.push({
					dispersalEntryId: entry._id,
					lenderId: entry.lenderId,
					outcome: "created",
					transferId,
				});

				console.info(
					`[disbursementBridge] Initiated transfer ${transferId} for entry ${entry._id}`
				);
			} catch (error) {
				failed += 1;
				let errorMessage: string;
				if (error instanceof ConvexError) {
					errorMessage = JSON.stringify(error.data);
				} else if (error instanceof Error) {
					errorMessage = error.message;
				} else {
					errorMessage = String(error);
				}

				results.push({
					dispersalEntryId: entry._id,
					lenderId: entry.lenderId,
					outcome: "failed",
					error: errorMessage,
				});

				console.error(
					`[disbursementBridge] Failed to process entry ${entry._id}: ${errorMessage}`
				);
			}
		}

		console.info(
			`[disbursementBridge] Batch complete: ${created} created, ${skippedIdempotent} skipped, ${failed} failed`
		);

		return {
			eligibleCount: eligibleEntries.length,
			batchSize: effectiveBatchSize,
			created,
			skippedIdempotent,
			failed,
			results,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════
// T-005: resetFailedEntry
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resets a failed dispersal entry back to "pending" so it can be
 * retried by the next bridge run.
 *
 * Only entries in "failed" status can be reset. Clears the payoutDate
 * so the entry is picked up again by findEligibleEntriesInternal.
 */
export const resetFailedEntry = internalMutation({
	args: {
		dispersalEntryId: v.id("dispersalEntries"),
	},
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.dispersalEntryId);
		if (!entry) {
			throw new ConvexError({
				code: "ENTRY_NOT_FOUND" as const,
				dispersalEntryId: args.dispersalEntryId,
				message: "Dispersal entry not found",
			});
		}

		if (entry.status !== "failed") {
			throw new ConvexError({
				code: "ENTRY_NOT_FAILED" as const,
				dispersalEntryId: args.dispersalEntryId,
				currentStatus: entry.status,
				message: `Cannot reset entry in "${entry.status}" status, expected "failed"`,
			});
		}

		await ctx.db.patch(args.dispersalEntryId, {
			status: "pending",
			payoutDate: undefined,
		});

		console.info(
			`[disbursementBridge] Reset entry ${args.dispersalEntryId} from "failed" to "pending"`
		);

		return { dispersalEntryId: args.dispersalEntryId, newStatus: "pending" };
	},
});

// ═══════════════════════════════════════════════════════════════════════
// Cron Alert — Daily Disbursement Due Check
// ═══════════════════════════════════════════════════════════════════════

/**
 * Daily cron handler that checks for pending dispersal entries past their
 * hold period and logs a summary for admin visibility.
 *
 * Does NOT auto-trigger disbursements — admin must manually call
 * triggerDisbursementBridge. Phase 2 may add auto-execution.
 */
export const checkDisbursementsDue = internalMutation({
	args: {},
	handler: async (ctx) => {
		const today = new Date().toISOString().slice(0, 10);

		// Bucket 1: pending entries with hold period passed
		const pendingPastHold = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_eligibility", (q) =>
				q.eq("status", "pending").lte("payoutEligibleAfter", today)
			)
			.collect();

		const eligibleWithHold = pendingPastHold.filter(
			(e) => e.payoutEligibleAfter !== undefined && e.payoutEligibleAfter !== ""
		);

		// Bucket 2: legacy entries with no hold period
		const pendingAll = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_eligibility", (q) => q.eq("status", "pending"))
			.collect();

		const eligibleLegacy = pendingAll.filter((e) => !e.payoutEligibleAfter);

		const eligible = [...eligibleWithHold, ...eligibleLegacy];

		if (eligible.length === 0) {
			return;
		}

		// Summarize by lender
		const byLender = new Map<string, { count: number; total: number }>();
		for (const e of eligible) {
			const existing = byLender.get(e.lenderId) ?? { count: 0, total: 0 };
			existing.count++;
			existing.total += e.amount;
			byLender.set(e.lenderId, existing);
		}

		console.warn(
			`[DISPERSAL_DUE] ${eligible.length} entries ready for disbursement ` +
				`across ${byLender.size} lenders as of ${today}`
		);
	},
});
