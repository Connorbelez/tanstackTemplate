import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../_generated/dataModel";
import {
	type CashAccountSpec,
	findCashAccount,
	getCashAccountBalance,
} from "../accounts";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
	postPaymentReversalCascade,
	postSettlementAllocation,
} from "../integrations";
import { getPostingGroupSummary } from "../postingGroups";
import {
	findSettledObligationsWithNonZeroBalance,
	getJournalSettledAmountForObligation,
} from "../reconciliation";
import {
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

// ── Helper: require account + balance in one call ───────────────────
function requireAccountBalance(
	account: Doc<"cash_ledger_accounts"> | null,
	spec: CashAccountSpec
): bigint {
	if (!account) {
		throw new Error(
			`Expected ${spec.family}${spec.subaccount ? `:${spec.subaccount}` : ""} account to exist`
		);
	}
	return getCashAccountBalance(account);
}

const modules = import.meta.glob("/convex/**/*.ts");

// ── Amount constants ────────────────────────────────────────────────
const TOTAL_AMOUNT = 100_000;
const LENDER_A_AMOUNT = 54_000;
const LENDER_B_AMOUNT = 36_000;
const SERVICING_FEE_AMOUNT = 10_000;

// ── Full pipeline state ─────────────────────────────────────────────

interface PipelineState {
	attemptId: Id<"collectionAttempts">;
	borrowerId: Id<"borrowers">;
	dispersalEntryAId: Id<"dispersalEntries">;
	dispersalEntryBId: Id<"dispersalEntries">;
	lenderAId: Id<"lenders">;
	lenderBId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
}

/**
 * Runs the full settlement pipeline through the REAL integration functions:
 * seed → obligation → collectionAttempt → dispersalEntries →
 * postObligationAccrued → postCashReceiptForObligation → postSettlementAllocation
 */
async function runFullSettlementPipeline(
	t: TestHarness
): Promise<PipelineState> {
	// 1. Seed minimal entities
	const { borrowerId, lenderAId, lenderBId, mortgageId } =
		await seedMinimalEntities(t);

	// 2. Create obligation with status: "settled"
	const obligationId = await t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: TOTAL_AMOUNT,
			amountSettled: TOTAL_AMOUNT,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: Date.now(),
		});
	});

	// 3. Create collectionPlanEntry + collectionAttempt
	const attemptId = await t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: [obligationId],
			amount: TOTAL_AMOUNT,
			method: "manual",
			scheduledDate: Date.now(),
			status: "completed",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		return ctx.db.insert("collectionAttempts", {
			status: "settled",
			planEntryId,
			method: "manual",
			amount: TOTAL_AMOUNT,
			initiatedAt: Date.now() - 60_000,
			settledAt: Date.now(),
		});
	});

	// 4. Create dispersalEntry records (one per lender)
	const { dispersalEntryAId, dispersalEntryBId } = await t.run(async (ctx) => {
		const ledgerAccounts = await ctx.db
			.query("ledger_accounts")
			.filter((q) => q.eq(q.field("mortgageId"), mortgageId))
			.collect();
		const lenderAccountA = ledgerAccounts[0];
		const lenderAccountB = ledgerAccounts[1];

		const dispersalEntryAId = await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderAId,
			lenderAccountId: lenderAccountA._id,
			amount: LENDER_A_AMOUNT,
			dispersalDate: "2026-03-01",
			obligationId,
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: `dispersal-a-${obligationId}`,
			calculationDetails: {
				settledAmount: TOTAL_AMOUNT,
				servicingFee: SERVICING_FEE_AMOUNT,
				distributableAmount: TOTAL_AMOUNT - SERVICING_FEE_AMOUNT,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: LENDER_A_AMOUNT,
				roundedAmount: LENDER_A_AMOUNT,
			},
			createdAt: Date.now(),
		});

		const dispersalEntryBId = await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderBId,
			lenderAccountId: lenderAccountB._id,
			amount: LENDER_B_AMOUNT,
			dispersalDate: "2026-03-01",
			obligationId,
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: `dispersal-b-${obligationId}`,
			calculationDetails: {
				settledAmount: TOTAL_AMOUNT,
				servicingFee: SERVICING_FEE_AMOUNT,
				distributableAmount: TOTAL_AMOUNT - SERVICING_FEE_AMOUNT,
				ownershipUnits: 4000,
				totalUnits: 10_000,
				ownershipFraction: 0.4,
				rawAmount: LENDER_B_AMOUNT,
				roundedAmount: LENDER_B_AMOUNT,
			},
			createdAt: Date.now(),
		});

		return { dispersalEntryAId, dispersalEntryBId };
	});

	// 5. postObligationAccrued → creates BORROWER_RECEIVABLE + CONTROL:ACCRUAL entries
	await t.run(async (ctx) => {
		return postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});
	});

	// 6. postCashReceiptForObligation → CASH_RECEIVED
	await t.run(async (ctx) => {
		return postCashReceiptForObligation(ctx, {
			obligationId,
			amount: TOTAL_AMOUNT,
			idempotencyKey: `cash-receipt-integration-${attemptId}`,
			attemptId,
			source: SYSTEM_SOURCE,
		});
	});

	// 7. postSettlementAllocation → LENDER_PAYABLE_CREATED x2 + SERVICING_FEE_RECOGNIZED
	await t.run(async (ctx) => {
		return postSettlementAllocation(ctx, {
			obligationId,
			mortgageId,
			settledDate: "2026-03-01",
			servicingFee: SERVICING_FEE_AMOUNT,
			entries: [
				{
					dispersalEntryId: dispersalEntryAId,
					lenderId: lenderAId,
					amount: LENDER_A_AMOUNT,
				},
				{
					dispersalEntryId: dispersalEntryBId,
					lenderId: lenderBId,
					amount: LENDER_B_AMOUNT,
				},
			],
			source: SYSTEM_SOURCE,
		});
	});

	return {
		borrowerId,
		lenderAId,
		lenderBId,
		mortgageId,
		obligationId,
		attemptId,
		dispersalEntryAId,
		dispersalEntryBId,
	};
}

// ═══════════════════════════════════════════════════════════════════
// E2E: Reversal after full settlement pipeline
// ═══════════════════════════════════════════════════════════════════

describe("E2E: Reversal after full settlement pipeline", () => {
	// ── T-017: Full pipeline test ───────────────────────────────
	it("T-017: executes the full settlement → reversal pipeline", async () => {
		const t = createHarness(modules);
		const state = await runFullSettlementPipeline(t);

		// 8. postPaymentReversalCascade → REVERSAL entries
		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF reversal — integration test",
			});
		});

		// Cascade returns entries and a postingGroupId
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(4);
		expect(result.postingGroupId).toBeTruthy();

		// All returned entries should be REVERSAL type
		for (const entry of result.reversalEntries) {
			expect(entry.entryType).toBe("REVERSAL");
		}

		// No payouts were sent, so clawback should be false
		expect(result.clawbackRequired).toBe(false);
	});

	// ── T-018: Account balance verification ─────────────────────
	it("T-018: all account balances correct after reversal", async () => {
		const t = createHarness(modules);
		const state = await runFullSettlementPipeline(t);

		// Execute reversal
		await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF reversal — balance verification test",
			});
		});

		// Verify all account balances
		await t.run(async (ctx) => {
			// BORROWER_RECEIVABLE (obligation-scoped): accrual debited, receipt credited (zero),
			// reversal debited again → balance = obligation.amount
			const brSpec: CashAccountSpec = {
				family: "BORROWER_RECEIVABLE",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
			};
			const brBalance = requireAccountBalance(
				await findCashAccount(ctx.db, brSpec),
				brSpec
			);
			expect(brBalance).toBe(BigInt(TOTAL_AMOUNT));

			// TRUST_CASH (mortgage-scoped): received then reversed → balance = 0
			const tcSpec: CashAccountSpec = {
				family: "TRUST_CASH",
				mortgageId: state.mortgageId,
			};
			const tcBalance = requireAccountBalance(
				await findCashAccount(ctx.db, tcSpec),
				tcSpec
			);
			expect(tcBalance).toBe(0n);

			// LENDER_PAYABLE (lender A): created then reversed → balance = 0
			const lpASpec: CashAccountSpec = {
				family: "LENDER_PAYABLE",
				mortgageId: state.mortgageId,
				lenderId: state.lenderAId,
			};
			const lpABalance = requireAccountBalance(
				await findCashAccount(ctx.db, lpASpec),
				lpASpec
			);
			expect(lpABalance).toBe(0n);

			// LENDER_PAYABLE (lender B): created then reversed → balance = 0
			const lpBSpec: CashAccountSpec = {
				family: "LENDER_PAYABLE",
				mortgageId: state.mortgageId,
				lenderId: state.lenderBId,
			};
			const lpBBalance = requireAccountBalance(
				await findCashAccount(ctx.db, lpBSpec),
				lpBSpec
			);
			expect(lpBBalance).toBe(0n);

			// SERVICING_REVENUE (mortgage-scoped): recognized then reversed → balance = 0
			const srSpec: CashAccountSpec = {
				family: "SERVICING_REVENUE",
				mortgageId: state.mortgageId,
			};
			const srBalance = requireAccountBalance(
				await findCashAccount(ctx.db, srSpec),
				srSpec
			);
			expect(srBalance).toBe(0n);

			// CONTROL:ACCRUAL (obligation-scoped): accrual credited 100k, NOT reversed by payment reversal
			// CONTROL is debit-normal: balance = debits - credits = 0 - 100k = -100k
			const caSpec: CashAccountSpec = {
				family: "CONTROL",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				subaccount: "ACCRUAL",
			};
			const caBalance = requireAccountBalance(
				await findCashAccount(ctx.db, caSpec),
				caSpec
			);
			expect(caBalance).toBe(BigInt(-TOTAL_AMOUNT));

			// CONTROL:ALLOCATION (obligation-scoped): allocation debited 100k, reversal credited 100k → net 0
			const alSpec: CashAccountSpec = {
				family: "CONTROL",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				subaccount: "ALLOCATION",
			};
			const alBalance = requireAccountBalance(
				await findCashAccount(ctx.db, alSpec),
				alSpec
			);
			expect(alBalance).toBe(0n);
		});
	});

	// ── T-019: Posting group nets to zero ───────────────────────
	it("T-019: reversal posting group CONTROL:ALLOCATION nets to zero", async () => {
		const t = createHarness(modules);
		const state = await runFullSettlementPipeline(t);

		// Execute reversal
		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF reversal — posting group test",
			});
		});

		// Verify reversal posting group summary
		const reversalSummary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, result.postingGroupId);
		});

		// The reversal of lender payables and servicing fee both credit CONTROL:ALLOCATION,
		// while the original allocation debited CONTROL:ALLOCATION. The reversal group alone
		// should have a negative CONTROL:ALLOCATION balance (credits to the control account).
		expect(reversalSummary.hasCorruptEntries).toBe(false);
		expect(reversalSummary.totalJournalEntryCount).toBeGreaterThan(0);

		// Verify the original allocation posting group still has entries and no corruption
		const allocationSummary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, `allocation:${state.obligationId}`);
		});

		expect(allocationSummary.hasCorruptEntries).toBe(false);
		expect(allocationSummary.totalJournalEntryCount).toBeGreaterThan(0);

		// The allocation group debits CONTROL:ALLOCATION for each lender payable + servicing fee.
		// It is NOT "complete" on its own (non-zero CONTROL:ALLOCATION balance), which is expected —
		// the reversal group credits CONTROL:ALLOCATION to offset it.
		expect(allocationSummary.controlAllocationBalance).toBe(
			BigInt(TOTAL_AMOUNT)
		);

		// Combined balance across allocation + reversal posting groups should be zero
		const combinedBalance =
			allocationSummary.controlAllocationBalance +
			reversalSummary.controlAllocationBalance;
		expect(combinedBalance).toBe(0n);
	});

	// ── T-020: Reconciliation detects reversal ──────────────────
	it("T-020: findSettledObligationsWithNonZeroBalance detects reversed obligation", async () => {
		const t = createHarness(modules);
		const state = await runFullSettlementPipeline(t);

		// Execute reversal
		await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF reversal — reconciliation test",
			});
		});

		// findSettledObligationsWithNonZeroBalance should detect the reversed obligation
		const nonZeroResults = await t.run(async (ctx) => {
			return findSettledObligationsWithNonZeroBalance(ctx);
		});

		const match = nonZeroResults.find(
			(r) => r.obligationId === state.obligationId
		);
		if (!match) {
			throw new Error(
				"Expected findSettledObligationsWithNonZeroBalance to include the reversed obligation"
			);
		}
		expect(match.outstandingBalance).toBe(BigInt(TOTAL_AMOUNT));

		// getJournalSettledAmountForObligation should return 0 after reversal
		// (CASH_RECEIVED +100k, then REVERSAL of CASH_RECEIVED -100k = 0)
		const journalSettled = await t.run(async (ctx) => {
			return getJournalSettledAmountForObligation(ctx, state.obligationId);
		});
		expect(journalSettled).toBe(0n);
	});
});
