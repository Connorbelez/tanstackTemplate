import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { createAccountCache } from "./accounts";

// ── Types ────────────────────────────────────────────────────

export interface ReplayScope {
	accountId?: Id<"cash_ledger_accounts">;
	mode: "full" | "incremental";
	mortgageId?: Id<"mortgages">;
}

export interface ReplayMismatch {
	accountId: Id<"cash_ledger_accounts">;
	expectedCredits: string;
	expectedDebits: string; // BigInt serialized
	family: string;
	firstDivergenceSequence: string;
	lastEntrySequence: string;
	storedCredits: string;
	storedDebits: string;
}

export interface ReplayResult {
	accountsChecked: number;
	durationMs: number;
	entriesReplayed: number;
	fromSequence: string;
	mismatches: ReplayMismatch[];
	missingSequences: string[];
	mode: "full" | "incremental";
	passed: boolean;
	toSequence: string;
}

// ── Internal accumulator state ───────────────────────────────

interface AccountAccumulator {
	credits: bigint;
	debits: bigint;
	firstSequence: bigint;
	lastSequence: bigint;
}

const REPLAY_CURSOR_NAME = "replay_integrity" as const;

// ── Cursor Helper ────────────────────────────────────────────

/**
 * Load the last processed sequence number from `cash_ledger_cursors`
 * for the replay integrity cursor. Returns `null` if no cursor exists.
 */
export async function getReplayCursor(ctx: QueryCtx): Promise<bigint | null> {
	const cursor = await ctx.db
		.query("cash_ledger_cursors")
		.withIndex("by_name", (q) => q.eq("name", REPLAY_CURSOR_NAME))
		.first();

	if (!cursor) {
		return null;
	}

	return cursor.lastProcessedSequence;
}

// ── Scope Filtering ──────────────────────────────────────────

/**
 * Filter journal entries by scope. Returns only entries that match the
 * given accountId or mortgageId constraints. If neither is specified,
 * all entries pass through.
 */
export function filterByScope(
	entries: Doc<"cash_ledger_journal_entries">[],
	scope: ReplayScope
): Doc<"cash_ledger_journal_entries">[] {
	if (!(scope.accountId || scope.mortgageId)) {
		return entries;
	}

	return entries.filter((entry) => {
		if (scope.accountId) {
			return (
				entry.debitAccountId === scope.accountId ||
				entry.creditAccountId === scope.accountId
			);
		}

		if (scope.mortgageId) {
			return entry.mortgageId === scope.mortgageId;
		}

		return true;
	});
}

// ── Missing Sequence Detection ───────────────────────────────

/**
 * Detect gaps in the sequence number chain. Only meaningful for full
 * mode replays where the starting sequence is 0 (loading all entries).
 *
 * Returns an array of missing sequence numbers as serialized strings.
 */
export function detectMissingSequences(
	entries: Doc<"cash_ledger_journal_entries">[]
): string[] {
	if (entries.length === 0) {
		return [];
	}

	const missing: string[] = [];
	let expectedNext = entries[0].sequenceNumber;

	for (const entry of entries) {
		while (expectedNext < entry.sequenceNumber) {
			missing.push(expectedNext.toString());
			expectedNext += 1n;
		}
		expectedNext = entry.sequenceNumber + 1n;
	}

	return missing;
}

// ── Accumulation ─────────────────────────────────────────────

function accumulateEntries(
	entries: Doc<"cash_ledger_journal_entries">[]
): Map<string, AccountAccumulator> {
	const accumulators = new Map<string, AccountAccumulator>();

	function getOrCreate(
		accountId: Id<"cash_ledger_accounts">,
		sequenceNumber: bigint
	): AccountAccumulator {
		const key = accountId as string;
		const existing = accumulators.get(key);
		if (existing) {
			return existing;
		}
		const acc: AccountAccumulator = {
			debits: 0n,
			credits: 0n,
			firstSequence: sequenceNumber,
			lastSequence: sequenceNumber,
		};
		accumulators.set(key, acc);
		return acc;
	}

	for (const entry of entries) {
		const debitAcc = getOrCreate(entry.debitAccountId, entry.sequenceNumber);
		debitAcc.debits += entry.amount;
		if (entry.sequenceNumber > debitAcc.lastSequence) {
			debitAcc.lastSequence = entry.sequenceNumber;
		}

		const creditAcc = getOrCreate(entry.creditAccountId, entry.sequenceNumber);
		creditAcc.credits += entry.amount;
		if (entry.sequenceNumber > creditAcc.lastSequence) {
			creditAcc.lastSequence = entry.sequenceNumber;
		}
	}

	return accumulators;
}

// ── Comparison ───────────────────────────────────────────────

async function compareAgainstStored(
	ctx: QueryCtx,
	accumulators: Map<string, AccountAccumulator>
): Promise<ReplayMismatch[]> {
	const mismatches: ReplayMismatch[] = [];
	const getCachedAccount = createAccountCache(ctx.db);

	for (const [accountIdStr, acc] of accumulators) {
		const accountId = accountIdStr as Id<"cash_ledger_accounts">;
		const account = await getCachedAccount(accountId);

		if (!account) {
			mismatches.push({
				accountId,
				family: "UNKNOWN",
				expectedDebits: acc.debits.toString(),
				expectedCredits: acc.credits.toString(),
				storedDebits: "0",
				storedCredits: "0",
				firstDivergenceSequence: acc.firstSequence.toString(),
				lastEntrySequence: acc.lastSequence.toString(),
			});
			continue;
		}

		const debitsMatch = acc.debits === account.cumulativeDebits;
		const creditsMatch = acc.credits === account.cumulativeCredits;

		if (!(debitsMatch && creditsMatch)) {
			mismatches.push({
				accountId,
				family: account.family,
				expectedDebits: acc.debits.toString(),
				expectedCredits: acc.credits.toString(),
				storedDebits: account.cumulativeDebits.toString(),
				storedCredits: account.cumulativeCredits.toString(),
				firstDivergenceSequence: acc.firstSequence.toString(),
				lastEntrySequence: acc.lastSequence.toString(),
			});
		}
	}

	return mismatches;
}

// ── Core Replay Function ─────────────────────────────────────

/**
 * Replay journal entries in canonical `sequenceNumber` order, derive
 * expected account balances, and compare against stored cumulative
 * debits/credits on `cash_ledger_accounts`.
 *
 * This is a **read-only** operation — it never modifies journal entries
 * or account balances.
 */
export async function replayJournalIntegrity(
	ctx: QueryCtx,
	scope: ReplayScope
): Promise<ReplayResult> {
	const startTime = Date.now();

	// 1. Determine starting sequence
	const fromSequence =
		scope.mode === "incremental" ? ((await getReplayCursor(ctx)) ?? 0n) : 0n;

	// 2. Load entries in sequence order using the by_sequence index
	const allEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_sequence", (q) => q.gt("sequenceNumber", fromSequence))
		.collect();

	// 3. Filter by scope (account or mortgage)
	const entries = filterByScope(allEntries, scope);

	// 4. Detect missing sequences (full mode only, before scope filtering)
	const missingSequences =
		scope.mode === "full" ? detectMissingSequences(allEntries) : [];

	// 5. Replay — accumulate per-account debits/credits
	const accumulators = accumulateEntries(entries);

	// 6. Compare against stored state (full mode only — incremental only has deltas)
	const mismatches =
		scope.mode === "full" ? await compareAgainstStored(ctx, accumulators) : [];

	// 7. Determine the actual sequence range
	const lastEntry = entries.at(-1);
	const toSequence = lastEntry ? lastEntry.sequenceNumber : fromSequence;

	return {
		passed: mismatches.length === 0 && missingSequences.length === 0,
		mode: scope.mode,
		entriesReplayed: entries.length,
		accountsChecked: accumulators.size,
		mismatches,
		missingSequences,
		fromSequence: fromSequence.toString(),
		toSequence: toSequence.toString(),
		durationMs: Date.now() - startTime,
	};
}

// ── Cursor Advancement Mutation ─────────────────────────────

/**
 * Advance the replay integrity cursor to the given sequence number.
 * Called from the daily reconciliation action after a successful replay.
 *
 * This is a separate mutation because `replayJournalIntegrity` runs as
 * a read-only query and cannot write to the database.
 */
export const advanceReplayCursor = internalMutation({
	args: {
		lastProcessedSequence: v.int64(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("cash_ledger_cursors")
			.withIndex("by_name", (q) => q.eq("name", REPLAY_CURSOR_NAME))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastProcessedSequence: args.lastProcessedSequence,
				lastProcessedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("cash_ledger_cursors", {
				name: REPLAY_CURSOR_NAME,
				lastProcessedSequence: args.lastProcessedSequence,
				lastProcessedAt: Date.now(),
			});
		}
	},
});
