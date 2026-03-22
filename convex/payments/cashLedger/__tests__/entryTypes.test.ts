import { describe, expect, it } from "vitest";
import { getOrCreateCashAccount } from "../accounts";
import { postCashEntryInternal } from "../postEntry";
import { ADMIN_SOURCE, createHarness, SYSTEM_SOURCE } from "./testUtils";

// ── Top-level regex patterns for rejection tests ─────────────────────
const ACCRUED_WRONG_DEBIT = /OBLIGATION_ACCRUED cannot debit family TRUST_CASH/;
const ACCRUED_WRONG_CREDIT =
	/OBLIGATION_ACCRUED cannot credit family TRUST_CASH/;
const RECEIVED_WRONG_CREDIT = /CASH_RECEIVED cannot credit family CONTROL/;
const RECEIVED_WRONG_DEBIT = /CASH_RECEIVED cannot debit family LENDER_PAYABLE/;
const PAYOUT_WRONG_DEBIT = /LENDER_PAYOUT_SENT cannot debit family CONTROL/;
const PAYOUT_WRONG_CREDIT =
	/LENDER_PAYOUT_SENT cannot credit family BORROWER_RECEIVABLE/;
const SUSPENSE_WRONG_DEBIT_TRUST =
	/SUSPENSE_ESCALATED cannot debit family TRUST_CASH/;
const SUSPENSE_WRONG_CREDIT_CONTROL =
	/SUSPENSE_ESCALATED cannot credit family CONTROL/;
const SERVICING_WRONG_DEBIT =
	/SERVICING_FEE_RECOGNIZED cannot debit family WRITE_OFF/;
const WRITTEN_OFF_WRONG_CREDIT =
	/OBLIGATION_WRITTEN_OFF cannot credit family LENDER_PAYABLE/;
const SUSPENSE_WRONG_DEBIT_RECEIVABLE =
	/SUSPENSE_ESCALATED cannot debit family BORROWER_RECEIVABLE/;
const SUSPENSE_WRONG_CREDIT_TRUST =
	/SUSPENSE_ESCALATED cannot credit family TRUST_CASH/;

// ── Valid Postings — one test per entry type ─────────────────────────

describe("Entry Type Coverage — Valid Postings", () => {
	it("OBLIGATION_ACCRUED: debit BORROWER_RECEIVABLE, credit CONTROL(ACCRUAL)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "obligation-accrued-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("OBLIGATION_ACCRUED");
			expect(result.entry.amount).toBe(100_000n);
		});
	});

	it("CASH_RECEIVED: debit TRUST_CASH, credit BORROWER_RECEIVABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: 75_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "cash-received-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("CASH_RECEIVED");
			expect(result.entry.amount).toBe(75_000n);
		});
	});

	it("CASH_APPLIED: debit UNAPPLIED_CASH, credit BORROWER_RECEIVABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "UNAPPLIED_CASH",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			// UNAPPLIED_CASH is debit-normal; needs debit balance to avoid going negative
			await ctx.db.patch(debit._id, { cumulativeDebits: 200_000n });
			const result = await postCashEntryInternal(ctx, {
				entryType: "CASH_APPLIED",
				effectiveDate: "2026-03-01",
				amount: 60_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "cash-applied-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("CASH_APPLIED");
			expect(result.entry.amount).toBe(60_000n);
		});
	});

	it("LENDER_PAYABLE_CREATED: debit CONTROL(ALLOCATION), credit LENDER_PAYABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ALLOCATION",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 40_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "lender-payable-created-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("LENDER_PAYABLE_CREATED");
			expect(result.entry.amount).toBe(40_000n);
		});
	});

	it("SERVICING_FEE_RECOGNIZED: debit CONTROL(ALLOCATION), credit SERVICING_REVENUE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ALLOCATION",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "SERVICING_REVENUE",
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "SERVICING_FEE_RECOGNIZED",
				effectiveDate: "2026-03-01",
				amount: 15_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "servicing-fee-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("SERVICING_FEE_RECOGNIZED");
			expect(result.entry.amount).toBe(15_000n);
		});
	});

	it("LENDER_PAYOUT_SENT: debit LENDER_PAYABLE, credit TRUST_CASH", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			// Pre-set balances to avoid negative balance errors
			// LENDER_PAYABLE is credit-normal: needs cumulativeCredits > amount
			await ctx.db.patch(debit._id, { cumulativeCredits: 200_000n });
			// TRUST_CASH is debit-normal: needs cumulativeDebits > amount
			await ctx.db.patch(credit._id, { cumulativeDebits: 200_000n });
			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "payout-sent-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("LENDER_PAYOUT_SENT");
			expect(result.entry.amount).toBe(50_000n);
		});
	});

	it("OBLIGATION_WAIVED: debit CONTROL(WAIVER), credit BORROWER_RECEIVABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "WAIVER",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "OBLIGATION_WAIVED",
				effectiveDate: "2026-03-01",
				amount: 25_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "obligation-waived-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("OBLIGATION_WAIVED");
			expect(result.entry.amount).toBe(25_000n);
		});
	});

	it("OBLIGATION_WRITTEN_OFF: debit WRITE_OFF, credit BORROWER_RECEIVABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "WRITE_OFF",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "OBLIGATION_WRITTEN_OFF",
				effectiveDate: "2026-03-01",
				amount: 80_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "written-off-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("OBLIGATION_WRITTEN_OFF");
			expect(result.entry.amount).toBe(80_000n);
		});
	});

	it("REVERSAL: mirrors original entry with causedBy reference", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			// Create seed entry for causedBy
			const seedEntryId = await ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				amount: 10_000n,
				idempotencyKey: "seed-for-reversal",
				source: SYSTEM_SOURCE,
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "REVERSAL",
				effectiveDate: "2026-03-01",
				amount: 10_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "reversal-valid",
				causedBy: seedEntryId,
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("REVERSAL");
			expect(result.entry.causedBy).toBe(seedEntryId);
			expect(result.entry.amount).toBe(10_000n);
		});
	});

	it("CORRECTION: admin source with causedBy and reason", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			// Create seed entry for causedBy
			const seedEntryId = await ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				amount: 5_000n,
				idempotencyKey: "seed-for-correction",
				source: SYSTEM_SOURCE,
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "CORRECTION",
				effectiveDate: "2026-03-01",
				amount: 5000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "correction-valid",
				causedBy: seedEntryId,
				reason: "Correcting accrual amount — off by $50",
				source: ADMIN_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("CORRECTION");
			expect(result.entry.causedBy).toBe(seedEntryId);
			expect(result.entry.reason).toBe(
				"Correcting accrual amount — off by $50"
			);
			expect(result.entry.amount).toBe(5_000n);
		});
	});

	it("SUSPENSE_ESCALATED: debit SUSPENSE, credit BORROWER_RECEIVABLE, skips balance check", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			// SUSPENSE account has zero balance — SUSPENSE_ESCALATED skips balance check
			// so this should succeed even though debiting would make SUSPENSE negative
			const result = await postCashEntryInternal(ctx, {
				entryType: "SUSPENSE_ESCALATED",
				effectiveDate: "2026-03-01",
				amount: 30_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "suspense-escalated-valid",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("SUSPENSE_ESCALATED");
			expect(result.entry.amount).toBe(30_000n);
		});
	});
});

// ── Family Rejection — invalid combos for constrained entry types ────

describe("Entry Type Coverage — Family Rejection", () => {
	it("OBLIGATION_ACCRUED rejects debit to TRUST_CASH (wrong debit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "OBLIGATION_ACCRUED",
					effectiveDate: "2026-03-01",
					amount: 100_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-accrued-wrong-debit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(ACCRUED_WRONG_DEBIT);
		});
	});

	it("OBLIGATION_ACCRUED rejects credit to TRUST_CASH (wrong credit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const creditWrong = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "OBLIGATION_ACCRUED",
					effectiveDate: "2026-03-01",
					amount: 100_000,
					debitAccountId: debit._id,
					creditAccountId: creditWrong._id,
					idempotencyKey: "reject-accrued-wrong-credit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(ACCRUED_WRONG_CREDIT);
		});
	});

	it("CASH_RECEIVED rejects credit to CONTROL (wrong credit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "CASH_RECEIVED",
					effectiveDate: "2026-03-01",
					amount: 50_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-received-wrong-credit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(RECEIVED_WRONG_CREDIT);
		});
	});

	it("CASH_RECEIVED rejects debit to LENDER_PAYABLE (wrong debit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "CASH_RECEIVED",
					effectiveDate: "2026-03-01",
					amount: 50_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-received-wrong-debit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(RECEIVED_WRONG_DEBIT);
		});
	});

	it("LENDER_PAYOUT_SENT rejects debit to CONTROL (wrong debit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ALLOCATION",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "LENDER_PAYOUT_SENT",
					effectiveDate: "2026-03-01",
					amount: 50_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-payout-wrong-debit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(PAYOUT_WRONG_DEBIT);
		});
	});

	it("LENDER_PAYOUT_SENT rejects credit to BORROWER_RECEIVABLE (wrong credit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "LENDER_PAYOUT_SENT",
					effectiveDate: "2026-03-01",
					amount: 50_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-payout-wrong-credit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(PAYOUT_WRONG_CREDIT);
		});
	});

	it("SUSPENSE_ESCALATED rejects debit to TRUST_CASH (wrong debit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "SUSPENSE_ESCALATED",
					effectiveDate: "2026-03-01",
					amount: 30_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-suspense-wrong-debit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(SUSPENSE_WRONG_DEBIT_TRUST);
		});
	});

	it("SUSPENSE_ESCALATED rejects credit to CONTROL (wrong credit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "SUSPENSE_ESCALATED",
					effectiveDate: "2026-03-01",
					amount: 30_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-suspense-wrong-credit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(SUSPENSE_WRONG_CREDIT_CONTROL);
		});
	});

	it("SERVICING_FEE_RECOGNIZED rejects debit to WRITE_OFF (wrong debit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "WRITE_OFF",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "SERVICING_REVENUE",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "SERVICING_FEE_RECOGNIZED",
					effectiveDate: "2026-03-01",
					amount: 15_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-servicing-wrong-debit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(SERVICING_WRONG_DEBIT);
		});
	});

	it("OBLIGATION_WRITTEN_OFF rejects credit to LENDER_PAYABLE (wrong credit family)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "WRITE_OFF",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "OBLIGATION_WRITTEN_OFF",
					effectiveDate: "2026-03-01",
					amount: 80_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "reject-written-off-wrong-credit",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(WRITTEN_OFF_WRONG_CREDIT);
		});
	});
});

// ── SUSPENSE_ESCALATED-specific tests ────────────────────────────────

describe("SUSPENSE_ESCALATED — balance exemption & account semantics", () => {
	it("posts successfully with zero-balance SUSPENSE account (balance check skipped)", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			// Both accounts start at zero. SUSPENSE is NOT in
			// NEGATIVE_BALANCE_EXEMPT_FAMILIES, but SUSPENSE_ESCALATED
			// skips the balance check entirely (step 5 early return).
			expect(debit.cumulativeDebits).toBe(0n);
			expect(debit.cumulativeCredits).toBe(0n);

			const result = await postCashEntryInternal(ctx, {
				entryType: "SUSPENSE_ESCALATED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "suspense-zero-balance",
				source: SYSTEM_SOURCE,
			});
			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("SUSPENSE_ESCALATED");
		});
	});

	it("correctly debits SUSPENSE and credits BORROWER_RECEIVABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});

			const result = await postCashEntryInternal(ctx, {
				entryType: "SUSPENSE_ESCALATED",
				effectiveDate: "2026-03-01",
				amount: 45_000,
				debitAccountId: debit._id,
				creditAccountId: credit._id,
				idempotencyKey: "suspense-account-update",
				source: SYSTEM_SOURCE,
			});

			// Verify the entry was persisted correctly
			expect(result.entry.debitAccountId).toBe(debit._id);
			expect(result.entry.creditAccountId).toBe(credit._id);
			expect(result.entry.amount).toBe(45_000n);

			// Verify account balances were updated
			const updatedDebit = await ctx.db.get(debit._id);
			const updatedCredit = await ctx.db.get(credit._id);
			expect(updatedDebit?.cumulativeDebits).toBe(45_000n);
			expect(updatedCredit?.cumulativeCredits).toBe(45_000n);
		});
	});

	it("rejects SUSPENSE_ESCALATED when debit is not SUSPENSE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const creditAlt = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});
			// BORROWER_RECEIVABLE as debit (wrong) — family check catches debit first
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "SUSPENSE_ESCALATED",
					effectiveDate: "2026-03-01",
					amount: 30_000,
					debitAccountId: debit._id,
					creditAccountId: creditAlt._id,
					idempotencyKey: "suspense-reject-wrong-debit-family",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(SUSPENSE_WRONG_DEBIT_RECEIVABLE);
		});
	});

	it("rejects SUSPENSE_ESCALATED when credit is not BORROWER_RECEIVABLE", async () => {
		const t = createHarness();
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "SUSPENSE_ESCALATED",
					effectiveDate: "2026-03-01",
					amount: 30_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "suspense-reject-wrong-credit-family",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(SUSPENSE_WRONG_CREDIT_TRUST);
		});
	});
});
