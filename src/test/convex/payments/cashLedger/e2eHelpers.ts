import { expect } from "vitest";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getPostingGroupSummary } from "../../../../../convex/payments/cashLedger/postingGroups";
import { getJournalSettledAmountForObligation } from "../../../../../convex/payments/cashLedger/reconciliation";
import type { TestHarness } from "./testUtils";

// ── T-001: assertObligationConservation ──────────────────────
// Verifies that settled amount = SUM(dispersal amounts) + servicing fee.
// Uses BigInt only — no floating-point arithmetic.

export async function assertObligationConservation(
	t: TestHarness,
	args: {
		obligationId: Id<"obligations">;
		postingGroupId: string;
	}
): Promise<void> {
	await t.run(async (ctx) => {
		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation) {
			throw new Error(
				`Obligation not found: ${args.obligationId} — cannot verify conservation`
			);
		}

		const summary = await getPostingGroupSummary(ctx, args.postingGroupId);

		expect(
			summary.hasCorruptEntries,
			"Posting group has corrupt entries — conservation check unreliable"
		).toBe(false);

		let lenderPayableTotal = 0n;
		let servicingFeeTotal = 0n;

		for (const entry of summary.entries) {
			if (entry.entryType === "LENDER_PAYABLE_CREATED") {
				lenderPayableTotal += entry.amount;
			} else if (entry.entryType === "SERVICING_FEE_RECOGNIZED") {
				servicingFeeTotal += entry.amount;
			}
		}

		const obligationAmount = BigInt(obligation.amount);
		const dispersedTotal = lenderPayableTotal + servicingFeeTotal;

		expect(dispersedTotal).toBe(obligationAmount);
	});
}

// ── T-003: assertAccountIntegrity ────────────────────────────
// Verifies all cash_ledger_accounts for a mortgage have non-negative
// cumulativeDebits and cumulativeCredits.

export async function assertAccountIntegrity(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
	}
): Promise<void> {
	await t.run(async (ctx) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.filter((q) => q.eq(q.field("mortgageId"), args.mortgageId))
			.collect();

		expect(accounts.length).toBeGreaterThan(0);

		for (const account of accounts) {
			expect(
				account.cumulativeDebits >= 0n,
				`Account ${account._id} (family=${account.family}) has negative cumulativeDebits: ${account.cumulativeDebits}`
			).toBe(true);
			expect(
				account.cumulativeCredits >= 0n,
				`Account ${account._id} (family=${account.family}) has negative cumulativeCredits: ${account.cumulativeCredits}`
			).toBe(true);
		}
	});
}

// ── T-004: assertSettlementReconciles ────────────────────────
// Verifies journal-derived settled amount matches obligation.amountSettled.

export async function assertSettlementReconciles(
	t: TestHarness,
	args: {
		obligationId: Id<"obligations">;
	}
): Promise<void> {
	await t.run(async (ctx) => {
		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation) {
			throw new Error(
				`Obligation not found: ${args.obligationId} — cannot verify settlement reconciliation`
			);
		}

		const journalSettled = await getJournalSettledAmountForObligation(
			ctx,
			args.obligationId
		);

		const expectedSettled = BigInt(obligation.amountSettled);

		expect(journalSettled).toBe(expectedSettled);
	});
}
