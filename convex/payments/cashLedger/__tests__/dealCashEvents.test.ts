import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import { getOrCreateCashAccount } from "../accounts";
import {
	postCommitmentDepositReceived,
	postDealBuyerFundsReceived,
	postDealSellerPayout,
	postLockingFeeReceived,
} from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import { createHarness, SYSTEM_SOURCE, seedMinimalEntities } from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

const DEAL_NOT_FOUND_PATTERN = /Deal not found/;

// ── Helpers ──────────────────────────────────────────────────────────

async function seedDeal(
	t: ReturnType<typeof createHarness>,
	mortgageId: Id<"mortgages">
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("deals", {
			status: "fundsTransfer",
			mortgageId,
			buyerId: "buyer-workos-user-id",
			sellerId: "seller-workos-user-id",
			fractionalShare: 0.5,
			createdAt: Date.now(),
			createdBy: "test-admin",
		});
	});
}

async function prefundLenderPayable(
	t: ReturnType<typeof createHarness>,
	mortgageId: Id<"mortgages">,
	lenderId: Id<"lenders">,
	amount: number
) {
	return t.run(async (ctx) => {
		const controlAccount = await getOrCreateCashAccount(ctx, {
			family: "CONTROL",
			mortgageId,
			subaccount: "ALLOCATION",
		});
		const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
			family: "LENDER_PAYABLE",
			mortgageId,
			lenderId,
		});
		return postCashEntryInternal(ctx, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-22",
			amount,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayableAccount._id,
			idempotencyKey: `prefund-lender-payable:${lenderId}`,
			mortgageId,
			lenderId,
			source: SYSTEM_SOURCE,
		});
	});
}

// ── Deal Buyer Funds Received ────────────────────────────────────────

describe("postDealBuyerFundsReceived", () => {
	it("creates CASH_RECEIVED entry with TRUST_CASH debit and CASH_CLEARING credit", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);
		const dealId = await seedDeal(t, mortgageId);

		const result = await t.run(async (ctx) => {
			return postDealBuyerFundsReceived(ctx, {
				dealId,
				amount: 500_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("CASH_RECEIVED");
		expect(result.entry.amount).toBe(500_000n);
		expect(result.entry.dealId).toBe(dealId);
		expect(result.entry.mortgageId).toBe(mortgageId);
		expect(result.entry.idempotencyKey).toBe(
			`cash-ledger:deal-buyer-funds:${dealId}`
		);

		// Verify account families
		await t.run(async (ctx) => {
			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.family).toBe("CASH_CLEARING");
		});
	});

	it("includes buyer and seller metadata", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);
		const dealId = await seedDeal(t, mortgageId);

		const result = await t.run(async (ctx) => {
			return postDealBuyerFundsReceived(ctx, {
				dealId,
				amount: 500_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.metadata).toEqual({
			buyerId: "buyer-workos-user-id",
			sellerId: "seller-workos-user-id",
		});
	});
});

// ── Deal Seller Payout ───────────────────────────────────────────────

describe("postDealSellerPayout", () => {
	it("creates LENDER_PAYOUT_SENT entry with LENDER_PAYABLE debit and TRUST_CASH credit", async () => {
		const t = createHarness(modules);
		const { mortgageId, lenderAId } = await seedMinimalEntities(t);
		const dealId = await seedDeal(t, mortgageId);

		// Pre-fund: buyer funds go into TRUST_CASH, then create lender payable
		await t.run(async (ctx) => {
			return postDealBuyerFundsReceived(ctx, {
				dealId,
				amount: 300_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});
		await prefundLenderPayable(t, mortgageId, lenderAId, 300_000);

		const result = await t.run(async (ctx) => {
			return postDealSellerPayout(ctx, {
				dealId,
				lenderId: lenderAId,
				amount: 300_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("LENDER_PAYOUT_SENT");
		expect(result.entry.amount).toBe(300_000n);
		expect(result.entry.dealId).toBe(dealId);
		expect(result.entry.lenderId).toBe(lenderAId);
		expect(result.entry.idempotencyKey).toBe(
			`cash-ledger:deal-seller-payout:${dealId}:${lenderAId}`
		);

		// Verify account families
		await t.run(async (ctx) => {
			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount?.family).toBe("LENDER_PAYABLE");
			expect(creditAccount?.family).toBe("TRUST_CASH");
		});
	});
});

// ── Locking Fee Received ─────────────────────────────────────────────

describe("postLockingFeeReceived", () => {
	it("creates CASH_RECEIVED entry with TRUST_CASH debit and UNAPPLIED_CASH credit", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => {
			return postLockingFeeReceived(ctx, {
				feeId: "fee-001",
				mortgageId,
				amount: 25_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("CASH_RECEIVED");
		expect(result.entry.amount).toBe(25_000n);
		expect(result.entry.idempotencyKey).toBe(
			`cash-ledger:locking-fee:${mortgageId}:fee-001`
		);

		// Verify account families
		await t.run(async (ctx) => {
			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.family).toBe("UNAPPLIED_CASH");
		});
	});

	it("stores feeType metadata", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => {
			return postLockingFeeReceived(ctx, {
				feeId: "fee-002",
				mortgageId,
				amount: 25_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.metadata).toEqual({
			feeType: "locking_fee",
			feeId: "fee-002",
		});
	});

	it("accepts optional dealId", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);
		const dealId = await seedDeal(t, mortgageId);

		const result = await t.run(async (ctx) => {
			return postLockingFeeReceived(ctx, {
				feeId: "fee-003",
				mortgageId,
				amount: 25_000,
				effectiveDate: "2026-03-22",
				dealId,
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.dealId).toBe(dealId);
	});
});

// ── Commitment Deposit Received ──────────────────────────────────────

describe("postCommitmentDepositReceived", () => {
	it("creates CASH_RECEIVED entry with TRUST_CASH debit and UNAPPLIED_CASH credit", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => {
			return postCommitmentDepositReceived(ctx, {
				depositId: "dep-001",
				mortgageId,
				amount: 50_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("CASH_RECEIVED");
		expect(result.entry.amount).toBe(50_000n);
		expect(result.entry.idempotencyKey).toBe(
			`cash-ledger:commitment-deposit:${mortgageId}:dep-001`
		);

		// Verify account families
		await t.run(async (ctx) => {
			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.family).toBe("UNAPPLIED_CASH");
		});
	});

	it("stores depositId metadata", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => {
			return postCommitmentDepositReceived(ctx, {
				depositId: "dep-002",
				mortgageId,
				amount: 50_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.metadata).toEqual({
			feeType: "commitment_deposit",
			depositId: "dep-002",
		});
	});
});

// ── Idempotency ──────────────────────────────────────────────────────

describe("idempotency", () => {
	it("deal buyer funds: second call returns existing entry", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);
		const dealId = await seedDeal(t, mortgageId);

		const first = await t.run(async (ctx) => {
			return postDealBuyerFundsReceived(ctx, {
				dealId,
				amount: 500_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		const second = await t.run(async (ctx) => {
			return postDealBuyerFundsReceived(ctx, {
				dealId,
				amount: 500_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(second.entry._id).toBe(first.entry._id);
	});

	it("deal seller payout: second call returns existing entry", async () => {
		const t = createHarness(modules);
		const { mortgageId, lenderAId } = await seedMinimalEntities(t);
		const dealId = await seedDeal(t, mortgageId);

		// Pre-fund TRUST_CASH and LENDER_PAYABLE
		await t.run(async (ctx) => {
			return postDealBuyerFundsReceived(ctx, {
				dealId,
				amount: 300_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});
		await prefundLenderPayable(t, mortgageId, lenderAId, 300_000);

		const first = await t.run(async (ctx) => {
			return postDealSellerPayout(ctx, {
				dealId,
				lenderId: lenderAId,
				amount: 300_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		const second = await t.run(async (ctx) => {
			return postDealSellerPayout(ctx, {
				dealId,
				lenderId: lenderAId,
				amount: 300_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(second.entry._id).toBe(first.entry._id);
	});

	it("locking fee: second call returns existing entry", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const first = await t.run(async (ctx) => {
			return postLockingFeeReceived(ctx, {
				feeId: "fee-idem",
				mortgageId,
				amount: 25_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		const second = await t.run(async (ctx) => {
			return postLockingFeeReceived(ctx, {
				feeId: "fee-idem",
				mortgageId,
				amount: 25_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(second.entry._id).toBe(first.entry._id);
	});

	it("commitment deposit: second call returns existing entry", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const first = await t.run(async (ctx) => {
			return postCommitmentDepositReceived(ctx, {
				depositId: "dep-idem",
				mortgageId,
				amount: 50_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		const second = await t.run(async (ctx) => {
			return postCommitmentDepositReceived(ctx, {
				depositId: "dep-idem",
				mortgageId,
				amount: 50_000,
				effectiveDate: "2026-03-22",
				source: SYSTEM_SOURCE,
			});
		});

		expect(second.entry._id).toBe(first.entry._id);
	});
});

// ── Error Handling ───────────────────────────────────────────────────

describe("error handling", () => {
	it("postDealBuyerFundsReceived throws for invalid dealId", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		await expect(
			t.run(async (ctx) => {
				return postDealBuyerFundsReceived(ctx, {
					dealId: "invalid-deal-id" as Id<"deals">,
					amount: 500_000,
					effectiveDate: "2026-03-22",
					source: SYSTEM_SOURCE,
				});
			})
		).rejects.toThrow(DEAL_NOT_FOUND_PATTERN);
	});

	it("postDealSellerPayout throws for invalid dealId", async () => {
		const t = createHarness(modules);
		const { lenderAId } = await seedMinimalEntities(t);

		await expect(
			t.run(async (ctx) => {
				return postDealSellerPayout(ctx, {
					dealId: "invalid-deal-id" as Id<"deals">,
					lenderId: lenderAId,
					amount: 300_000,
					effectiveDate: "2026-03-22",
					source: SYSTEM_SOURCE,
				});
			})
		).rejects.toThrow(DEAL_NOT_FOUND_PATTERN);
	});
});

// ── Family Map Expansion Validation ──────────────────────────────────

describe("CASH_RECEIVED family map expansion", () => {
	it("accepts CASH_CLEARING as credit family", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId,
			});
			const cashClearing = await getOrCreateCashAccount(ctx, {
				family: "CASH_CLEARING",
				mortgageId,
			});
			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-22",
				amount: 100_000,
				debitAccountId: trustCash._id,
				creditAccountId: cashClearing._id,
				idempotencyKey: "family-map-test-cash-clearing",
				mortgageId,
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("CASH_RECEIVED");
	});

	it("accepts UNAPPLIED_CASH as credit family", async () => {
		const t = createHarness(modules);
		const { mortgageId } = await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId,
			});
			const unappliedCash = await getOrCreateCashAccount(ctx, {
				family: "UNAPPLIED_CASH",
				mortgageId,
			});
			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-22",
				amount: 100_000,
				debitAccountId: trustCash._id,
				creditAccountId: unappliedCash._id,
				idempotencyKey: "family-map-test-unapplied-cash",
				mortgageId,
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("CASH_RECEIVED");
	});

	it("still accepts BORROWER_RECEIVABLE as credit family", async () => {
		const t = createHarness(modules);
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);

		const obligationId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("obligations", {
				mortgageId,
				borrowerId,
				type: "regular_interest",
				paymentNumber: 1,
				amount: 100_000,
				amountSettled: 0,
				dueDate: now,
				gracePeriodEnd: now + 15 * 24 * 60 * 60 * 1000,
				status: "pending",
				createdAt: now,
			});
		});

		const result = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId,
			});
			const receivable = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
				borrowerId,
			});
			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-22",
				amount: 100_000,
				debitAccountId: trustCash._id,
				creditAccountId: receivable._id,
				idempotencyKey: "family-map-test-borrower-receivable",
				mortgageId,
				obligationId,
				borrowerId,
				source: SYSTEM_SOURCE,
			});
		});

		expect(result.entry.entryType).toBe("CASH_RECEIVED");
	});
});
