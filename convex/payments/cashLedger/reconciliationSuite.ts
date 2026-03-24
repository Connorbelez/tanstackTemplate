import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { getCashAccountBalance, safeBigintToNumber } from "./accounts";
import {
	findNonZeroPostingGroups,
	reconcileObligationSettlementProjectionInternal,
} from "./reconciliation";
import {
	checkOrphanedConfirmedTransfers,
	checkOrphanedReversedTransfers,
	checkStaleOutboundTransfers,
	checkTransferAmountMismatches,
} from "./transferReconciliation";

// ── Constants ─────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const STUCK_THRESHOLD_DAYS = 7;

/** Optional clock override for tests (e.g. simulate passage of time for aging checks). */
export interface ReconciliationSuiteOptions {
	nowMs?: number;
}

// ── Result Types ──────────────────────────────────────────────

export interface ReconciliationCheckResult<T> {
	checkedAt: number;
	checkName: string;
	count: number;
	isHealthy: boolean;
	items: T[];
	totalAmountCents: number;
}

export interface UnappliedCashItem {
	accountId: Id<"cash_ledger_accounts">;
	ageDays: number;
	balance: number; // cents
	mortgageId?: Id<"mortgages">;
}

export interface NegativePayableItem {
	accountId: Id<"cash_ledger_accounts">;
	balance: number; // negative cents
	lenderId?: Id<"lenders">;
	mortgageId?: Id<"mortgages">;
}

export interface ObligationDriftItem {
	driftCents: number;
	dueDate: number;
	journalDerivedAmount: number;
	obligationId: Id<"obligations">;
	recordedAmount: number;
}

export interface ControlNetZeroItem {
	controlAllocationBalance: number;
	entryCount: number;
	obligationId?: Id<"obligations">;
	postingGroupId: string;
}

export interface SuspenseItem {
	accountId: Id<"cash_ledger_accounts">;
	ageDays: number;
	balance: number;
	metadata?: Record<string, unknown>;
	mortgageId?: Id<"mortgages">;
}

export interface OrphanedObligationItem {
	amount: number;
	dueDate: number;
	obligationId: Id<"obligations">;
	status: ObligationStatus;
}

export interface StuckCollectionItem {
	ageDays: number;
	amount: number;
	attemptId: Id<"collectionAttempts">;
	initiatedAt: number;
	planEntryId: Id<"collectionPlanEntries">;
}

export interface OrphanedUnappliedItem {
	accountId: Id<"cash_ledger_accounts">;
	ageDays: number;
	balance: number;
	mortgageId?: Id<"mortgages">;
}

// ── Helper ────────────────────────────────────────────────────

function buildResult<T>(
	checkName: string,
	items: T[],
	totalAmountCents: number,
	checkedAt: number
): ReconciliationCheckResult<T> {
	return {
		checkName,
		isHealthy: items.length === 0,
		items,
		count: items.length,
		totalAmountCents,
		checkedAt,
	};
}

function ageDays(creationTime: number, now: number): number {
	return Math.floor((now - creationTime) / MS_PER_DAY);
}

// ── T-002: Unapplied Cash ─────────────────────────────────────

/**
 * Finds UNAPPLIED_CASH accounts with a positive balance.
 * UNAPPLIED_CASH is credit-normal, so positive = credits > debits.
 */
export async function checkUnappliedCash(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<UnappliedCashItem>> {
	const accounts = await ctx.db
		.query("cash_ledger_accounts")
		.withIndex("by_family", (q) => q.eq("family", "UNAPPLIED_CASH"))
		.collect();

	const now = options?.nowMs ?? Date.now();
	const items: UnappliedCashItem[] = [];
	let totalAmountCents = 0;

	for (const account of accounts) {
		const balance = getCashAccountBalance(account);
		if (balance > 0n) {
			const balanceCents = safeBigintToNumber(balance);
			items.push({
				accountId: account._id,
				mortgageId: account.mortgageId ?? undefined,
				balance: balanceCents,
				ageDays: ageDays(account._creationTime, now),
			});
			totalAmountCents += balanceCents;
		}
	}

	return buildResult("unappliedCash", items, totalAmountCents, now);
}

// ── T-003: Negative Payables ──────────────────────────────────

/**
 * Finds LENDER_PAYABLE accounts with a negative balance.
 * LENDER_PAYABLE is credit-normal, so negative = debits > credits.
 *
 * TODO: Add time-windowed or net-based reversal exclusion once reversal
 * state tracking is available. A blanket exclusion based on any historical
 * REVERSAL entry would permanently hide legitimate negative payables.
 */
export async function checkNegativePayables(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<NegativePayableItem>> {
	const checkedAt = options?.nowMs ?? Date.now();
	const accounts = await ctx.db
		.query("cash_ledger_accounts")
		.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
		.collect();

	const items: NegativePayableItem[] = [];
	let totalAmountCents = 0;

	for (const account of accounts) {
		const balance = getCashAccountBalance(account);
		if (balance >= 0n) {
			continue;
		}

		const balanceCents = safeBigintToNumber(balance);
		items.push({
			accountId: account._id,
			lenderId: account.lenderId ?? undefined,
			mortgageId: account.mortgageId ?? undefined,
			balance: balanceCents,
		});
		totalAmountCents += Math.abs(balanceCents);
	}

	return buildResult("negativePayables", items, totalAmountCents, checkedAt);
}

// ── T-004: Obligation Balance Drift ───────────────────────────

/**
 * For settled obligations, compares the journal-derived settled amount
 * against the recorded `amountSettled` field. Any mismatch is drift.
 */
export async function checkObligationBalanceDrift(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<ObligationDriftItem>> {
	const checkedAt = options?.nowMs ?? Date.now();
	const settledObligations = await ctx.db
		.query("obligations")
		.withIndex("by_status", (q) => q.eq("status", "settled"))
		.collect();

	const items: ObligationDriftItem[] = [];
	let totalAmountCents = 0;

	for (const obligation of settledObligations) {
		const result = await reconcileObligationSettlementProjectionInternal(
			ctx,
			obligation._id
		);

		if (result.hasDrift) {
			const driftCents = safeBigintToNumber(result.driftAmount);
			items.push({
				obligationId: obligation._id,
				dueDate: obligation.dueDate,
				journalDerivedAmount: safeBigintToNumber(result.journalSettledAmount),
				recordedAmount: safeBigintToNumber(result.projectedSettledAmount),
				driftCents,
			});
			totalAmountCents += Math.abs(driftCents);
		}
	}

	return buildResult(
		"obligationBalanceDrift",
		items,
		totalAmountCents,
		checkedAt
	);
}

// ── T-005: Control Net-Zero ───────────────────────────────────

/**
 * Wraps `findNonZeroPostingGroups` into the standard check result format.
 * CONTROL:ALLOCATION accounts should net to zero after all entries in a
 * posting group are applied. Non-zero balances indicate incomplete processing.
 */
export async function checkControlNetZero(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<ControlNetZeroItem>> {
	const checkedAt = options?.nowMs ?? Date.now();
	const { alerts, orphaned } = await findNonZeroPostingGroups(ctx);

	const items: ControlNetZeroItem[] = [];
	let totalAmountCents = 0;

	for (const alert of alerts) {
		const balanceCents = safeBigintToNumber(alert.controlAllocationBalance);
		items.push({
			postingGroupId: alert.postingGroupId,
			controlAllocationBalance: balanceCents,
			entryCount: alert.entryCount,
			obligationId: alert.obligationId,
		});
		totalAmountCents += Math.abs(balanceCents);
	}

	for (const o of orphaned) {
		const balanceCents = safeBigintToNumber(o.controlAllocationBalance);
		items.push({
			postingGroupId: `orphaned:${o.accountId}`,
			controlAllocationBalance: balanceCents,
			entryCount: 0,
		});
		totalAmountCents += Math.abs(balanceCents);
	}

	return buildResult("controlNetZero", items, totalAmountCents, checkedAt);
}

// ── T-006: Suspense Items ─────────────────────────────────────

/**
 * Finds SUSPENSE accounts with a positive balance.
 * SUSPENSE is debit-normal, so positive balance = debits > credits.
 */
export async function checkSuspenseItems(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<SuspenseItem>> {
	const accounts = await ctx.db
		.query("cash_ledger_accounts")
		.withIndex("by_family", (q) => q.eq("family", "SUSPENSE"))
		.collect();

	const now = options?.nowMs ?? Date.now();
	const items: SuspenseItem[] = [];
	let totalAmountCents = 0;

	for (const account of accounts) {
		const balance = getCashAccountBalance(account);
		if (balance > 0n) {
			const balanceCents = safeBigintToNumber(balance);
			items.push({
				accountId: account._id,
				mortgageId: account.mortgageId ?? undefined,
				balance: balanceCents,
				ageDays: ageDays(account._creationTime, now),
				metadata: account.metadata as Record<string, unknown> | undefined,
			});
			totalAmountCents += balanceCents;
		}
	}

	return buildResult("suspenseItems", items, totalAmountCents, now);
}

// ── T-007: Orphaned Obligations ───────────────────────────────

/**
 * Obligations that have moved past the `upcoming` state (i.e. they are
 * `due`, `overdue`, `partially_settled`, `settled`, or `waived`) but
 * have no OBLIGATION_ACCRUED journal entry. This indicates the accrual
 * side-effect failed or was skipped.
 *
 * We exclude `upcoming` because obligations in that state have not yet
 * been accrued.
 */
const OBLIGATION_STATUS_VALUES = [
	"due",
	"overdue",
	"partially_settled",
	"settled",
	"waived",
] as const;

/** Valid statuses that require an OBLIGATION_ACCRUED journal entry. */
export const STATES_REQUIRING_ACCRUAL = new Set(OBLIGATION_STATUS_VALUES);

export type ObligationStatus = (typeof OBLIGATION_STATUS_VALUES)[number];

export async function checkOrphanedObligations(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<OrphanedObligationItem>> {
	const checkedAt = options?.nowMs ?? Date.now();
	const items: OrphanedObligationItem[] = [];
	let totalAmountCents = 0;

	// Query each status that requires an accrual entry
	for (const status of STATES_REQUIRING_ACCRUAL) {
		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_status", (q) => q.eq("status", status))
			.collect();

		for (const obligation of obligations) {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligation._id)
				)
				.collect();

			const hasAccrual = entries.some(
				(e) => e.entryType === "OBLIGATION_ACCRUED"
			);
			if (!hasAccrual) {
				items.push({
					obligationId: obligation._id,
					status: obligation.status as ObligationStatus,
					amount: obligation.amount,
					dueDate: obligation.dueDate,
				});
				totalAmountCents += obligation.amount;
			}
		}
	}

	return buildResult("orphanedObligations", items, totalAmountCents, checkedAt);
}

// ── T-008: Stuck Collections ──────────────────────────────────

/**
 * Collection attempts stuck in `executing` state for more than 7 days.
 */
export async function checkStuckCollections(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<StuckCollectionItem>> {
	const attempts = await ctx.db
		.query("collectionAttempts")
		.withIndex("by_status", (q) => q.eq("status", "executing"))
		.collect();

	const now = options?.nowMs ?? Date.now();
	const stuckThreshold = now - STUCK_THRESHOLD_DAYS * MS_PER_DAY;
	const items: StuckCollectionItem[] = [];
	let totalAmountCents = 0;

	for (const attempt of attempts) {
		if (attempt.initiatedAt < stuckThreshold) {
			const age = ageDays(attempt.initiatedAt, now);
			items.push({
				attemptId: attempt._id,
				planEntryId: attempt.planEntryId,
				initiatedAt: attempt.initiatedAt,
				ageDays: age,
				amount: attempt.amount,
			});
			totalAmountCents += attempt.amount;
		}
	}

	return buildResult("stuckCollections", items, totalAmountCents, now);
}

// ── T-009: Orphaned Unapplied Cash ────────────────────────────

/**
 * UNAPPLIED_CASH accounts with a positive balance that are older than
 * 7 days. These represent payments that were received but never applied
 * to an obligation, suggesting a stuck or failed application flow.
 */
export async function checkOrphanedUnappliedCash(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<OrphanedUnappliedItem>> {
	const accounts = await ctx.db
		.query("cash_ledger_accounts")
		.withIndex("by_family", (q) => q.eq("family", "UNAPPLIED_CASH"))
		.collect();

	const now = options?.nowMs ?? Date.now();
	const items: OrphanedUnappliedItem[] = [];
	let totalAmountCents = 0;

	for (const account of accounts) {
		const balance = getCashAccountBalance(account);
		if (balance > 0n) {
			const age = ageDays(account._creationTime, now);
			if (age > STUCK_THRESHOLD_DAYS) {
				const balanceCents = safeBigintToNumber(balance);
				items.push({
					accountId: account._id,
					mortgageId: account.mortgageId ?? undefined,
					balance: balanceCents,
					ageDays: age,
				});
				totalAmountCents += balanceCents;
			}
		}
	}

	return buildResult("orphanedUnappliedCash", items, totalAmountCents, now);
}

// ── Conservation Types ────────────────────────────────────────

export interface ConservationViolation {
	differenceCents: number;
	dispersalTotal: number;
	dueDate: number;
	obligationAmount: number;
	obligationId: Id<"obligations">;
	servicingFeeTotal: number;
}

export interface MortgageMonthConservationViolation {
	differenceCents: number;
	dispersalTotal: number;
	feeTotal: number;
	month: string; // YYYY-MM
	mortgageId: Id<"mortgages">;
	settledTotal: number;
}

export interface FullReconciliationResult {
	checkedAt: number;
	checkResults: ReconciliationCheckResult<unknown>[];
	conservationResults: ReconciliationCheckResult<unknown>[];
	isHealthy: boolean;
	totalGapCount: number;
	transferResults: ReconciliationCheckResult<unknown>[];
	unhealthyCheckNames: string[];
}

// ── T-010: Obligation Conservation ───────────────────────────

/**
 * Per settled obligation, verifies that:
 *   SUM(dispersalEntries.amount) + SUM(servicingFeeEntries.amount) == obligation.amount
 *
 * Settled obligations with no dispersal entries are flagged as violations
 * (0 dispersal + 0 fees != obligation.amount).
 */
export async function checkObligationConservation(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<ConservationViolation>> {
	const checkedAt = options?.nowMs ?? Date.now();
	const settledObligations = await ctx.db
		.query("obligations")
		.withIndex("by_status", (q) => q.eq("status", "settled"))
		.collect();

	const items: ConservationViolation[] = [];
	let totalAmountCents = 0;

	for (const obligation of settledObligations) {
		const dispersals = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
			.collect();

		// Settled obligations with no dispersals are a conservation violation:
		// 0 dispersal + 0 fees != obligation.amount
		if (dispersals.length === 0) {
			const difference = -obligation.amount;
			items.push({
				obligationId: obligation._id,
				dueDate: obligation.dueDate,
				obligationAmount: obligation.amount,
				dispersalTotal: 0,
				servicingFeeTotal: 0,
				differenceCents: difference,
			});
			totalAmountCents += Math.abs(difference);
			continue;
		}

		const feeEntries = await ctx.db
			.query("servicingFeeEntries")
			.withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
			.collect();

		const dispersalTotal = dispersals.reduce((sum, d) => sum + d.amount, 0);
		const feeTotal = feeEntries.reduce((sum, f) => sum + f.amount, 0);
		const difference = dispersalTotal + feeTotal - obligation.amount;

		if (difference !== 0) {
			items.push({
				obligationId: obligation._id,
				dueDate: obligation.dueDate,
				obligationAmount: obligation.amount,
				dispersalTotal,
				servicingFeeTotal: feeTotal,
				differenceCents: difference,
			});
			totalAmountCents += Math.abs(difference);
		}
	}

	return buildResult(
		"obligationConservation",
		items,
		totalAmountCents,
		checkedAt
	);
}

// ── T-011: Mortgage Month Conservation ───────────────────────

/**
 * Per mortgage per month, verifies that:
 *   SUM(settled obligation amounts) == SUM(dispersal amounts) + SUM(servicing fees)
 *
 * Groups settled obligations by mortgageId + month (derived from dueDate),
 * then compares the obligation totals against dispersal + fee totals.
 */
export async function checkMortgageMonthConservation(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<MortgageMonthConservationViolation>> {
	const checkedAt = options?.nowMs ?? Date.now();
	const settledObligations = await ctx.db
		.query("obligations")
		.withIndex("by_status", (q) => q.eq("status", "settled"))
		.collect();

	// Group obligations by mortgageId + month
	const groups = new Map<
		string,
		{
			mortgageId: Id<"mortgages">;
			month: string;
			obligationIds: Id<"obligations">[];
			settledTotal: number;
		}
	>();

	for (const obligation of settledObligations) {
		const month = new Date(obligation.dueDate).toISOString().slice(0, 7);
		const key = `${obligation.mortgageId}:${month}`;

		const existing = groups.get(key);
		if (existing) {
			existing.obligationIds.push(obligation._id);
			existing.settledTotal += obligation.amount;
		} else {
			groups.set(key, {
				mortgageId: obligation.mortgageId,
				month,
				obligationIds: [obligation._id],
				settledTotal: obligation.amount,
			});
		}
	}

	// Prefetch all dispersal and fee entries for all relevant obligations
	// to avoid O(n) per-obligation DB queries in the loop below.
	const allObligationIds = new Set<string>();
	for (const group of groups.values()) {
		for (const obligationId of group.obligationIds) {
			allObligationIds.add(obligationId as string);
		}
	}

	const dispersalsByObligation = new Map<string, number>();
	const feesByObligation = new Map<string, number>();

	for (const obligationId of allObligationIds) {
		const [dispersals, feeEntries] = await Promise.all([
			ctx.db
				.query("dispersalEntries")
				.withIndex("by_obligation", (q) =>
					q.eq("obligationId", obligationId as Id<"obligations">)
				)
				.collect(),
			ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_obligation", (q) =>
					q.eq("obligationId", obligationId as Id<"obligations">)
				)
				.collect(),
		]);

		dispersalsByObligation.set(
			obligationId,
			dispersals.reduce((sum, d) => sum + d.amount, 0)
		);
		feesByObligation.set(
			obligationId,
			feeEntries.reduce((sum, f) => sum + f.amount, 0)
		);
	}

	const items: MortgageMonthConservationViolation[] = [];
	let totalAmountCents = 0;

	for (const group of groups.values()) {
		let dispersalTotal = 0;
		let feeTotal = 0;

		for (const obligationId of group.obligationIds) {
			dispersalTotal += dispersalsByObligation.get(obligationId as string) ?? 0;
			feeTotal += feesByObligation.get(obligationId as string) ?? 0;
		}

		const difference = group.settledTotal - (dispersalTotal + feeTotal);

		if (difference !== 0) {
			items.push({
				mortgageId: group.mortgageId,
				month: group.month,
				settledTotal: group.settledTotal,
				dispersalTotal,
				feeTotal,
				differenceCents: difference,
			});
			totalAmountCents += Math.abs(difference);
		}
	}

	return buildResult(
		"mortgageMonthConservation",
		items,
		totalAmountCents,
		checkedAt
	);
}

// ── T-012: Full Reconciliation Suite ─────────────────────────

/**
 * Runs all 8 check functions, 2 conservation checks, and 4 transfer checks
 * in parallel, returning an aggregated result with health status and gap counts.
 * All checks use the same `nowMs` timestamp for snapshot consistency.
 */
export async function runFullReconciliationSuite(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<FullReconciliationResult> {
	const checkedAt = options?.nowMs ?? Date.now();
	const opts: ReconciliationSuiteOptions = { ...options, nowMs: checkedAt };

	// Run all independent checks in parallel
	const [checkResults, conservationResults, transferResults] =
		await Promise.all([
			Promise.all([
				checkUnappliedCash(ctx, opts),
				checkNegativePayables(ctx, opts),
				checkObligationBalanceDrift(ctx, opts),
				checkControlNetZero(ctx, opts),
				checkSuspenseItems(ctx, opts),
				checkOrphanedObligations(ctx, opts),
				checkStuckCollections(ctx, opts),
				checkOrphanedUnappliedCash(ctx, opts),
			]),
			Promise.all([
				checkObligationConservation(ctx, opts),
				checkMortgageMonthConservation(ctx, opts),
			]),
			Promise.all([
				checkOrphanedConfirmedTransfers(ctx, opts),
				checkOrphanedReversedTransfers(ctx, opts),
				checkStaleOutboundTransfers(ctx, opts),
				checkTransferAmountMismatches(ctx, opts),
			]),
		]);

	const allResults = [
		...checkResults,
		...conservationResults,
		...transferResults,
	] as ReconciliationCheckResult<unknown>[];
	const unhealthyCheckNames = allResults
		.filter((r) => !r.isHealthy)
		.map((r) => r.checkName);

	return {
		isHealthy: unhealthyCheckNames.length === 0,
		checkedAt,
		checkResults: checkResults as ReconciliationCheckResult<unknown>[],
		conservationResults:
			conservationResults as ReconciliationCheckResult<unknown>[],
		transferResults: transferResults as ReconciliationCheckResult<unknown>[],
		unhealthyCheckNames,
		totalGapCount: allResults.reduce((sum, r) => sum + r.count, 0),
	};
}
