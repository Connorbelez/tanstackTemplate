import { describe, expect, it } from "vitest";
import { getOrCreateCashAccount } from "../accounts";
import { type PostCashEntryInput, postCashEntryInternal } from "../postEntry";
import {
	ADMIN_SOURCE,
	createHarness,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	type TestHarness,
} from "./testUtils";

// ── Regex patterns (top-level for Biome useTopLevelRegex) ───────────
const POSITIVE_SAFE_INTEGER_PATTERN = /positive safe integer/;
const DIFFERENT_ACCOUNTS_PATTERN =
	/Debit and credit accounts must be different/;
const DATE_FORMAT_PATTERN = /effectiveDate must be YYYY-MM-DD/;
const CANNOT_DEBIT_TRUST_CASH_PATTERN =
	/OBLIGATION_ACCRUED cannot debit family TRUST_CASH/;
const CANNOT_CREDIT_TRUST_CASH_PATTERN =
	/OBLIGATION_ACCRUED cannot credit family TRUST_CASH/;
const NEGATIVE_BALANCE_PATTERN = /negative/i;
const REVERSAL_CAUSED_BY_PATTERN = /REVERSAL entries must reference causedBy/;

// ── Helpers ─────────────────────────────────────────────────────────

/** Seeds BORROWER_RECEIVABLE (debit) + CONTROL/ACCRUAL (credit) accounts. */
async function seedDefaultAccounts(t: TestHarness) {
	return t.run(async (ctx) => {
		const debit = await getOrCreateCashAccount(ctx, {
			family: "BORROWER_RECEIVABLE",
		});
		const credit = await getOrCreateCashAccount(ctx, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});
		return { debitId: debit._id, creditId: credit._id };
	});
}

/** Builds a valid OBLIGATION_ACCRUED input — callers override specific fields. */
function validArgs(
	overrides: Partial<PostCashEntryInput> & {
		debitAccountId: PostCashEntryInput["debitAccountId"];
		creditAccountId: PostCashEntryInput["creditAccountId"];
	}
): PostCashEntryInput {
	return {
		amount: 10_000,
		effectiveDate: "2026-01-15",
		entryType: "OBLIGATION_ACCRUED",
		idempotencyKey: `test-${Date.now()}-${Math.random()}`,
		source: SYSTEM_SOURCE,
		...overrides,
	};
}

// ═══════════════════════════════════════════════════════════════════
// T-006: VALIDATE_INPUT
// ═══════════════════════════════════════════════════════════════════

describe("Step 1 — VALIDATE_INPUT", () => {
	it("rejects zero amount", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: debitId,
						creditAccountId: creditId,
						amount: 0,
					})
				)
			).rejects.toThrow(POSITIVE_SAFE_INTEGER_PATTERN);
		});
	});

	it("rejects negative amount", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: debitId,
						creditAccountId: creditId,
						amount: -500,
					})
				)
			).rejects.toThrow(POSITIVE_SAFE_INTEGER_PATTERN);
		});
	});

	it("rejects non-integer (float) amount", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: debitId,
						creditAccountId: creditId,
						amount: 99.5,
					})
				)
			).rejects.toThrow(POSITIVE_SAFE_INTEGER_PATTERN);
		});
	});

	it("rejects amount exceeding MAX_SAFE_INTEGER", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: debitId,
						creditAccountId: creditId,
						amount: Number.MAX_SAFE_INTEGER + 1,
					})
				)
			).rejects.toThrow(POSITIVE_SAFE_INTEGER_PATTERN);
		});
	});

	it("rejects when debit and credit account are the same", async () => {
		const t = createHarness();
		const { debitId } = await seedDefaultAccounts(t);

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: debitId,
						creditAccountId: debitId,
					})
				)
			).rejects.toThrow(DIFFERENT_ACCOUNTS_PATTERN);
		});
	});

	it("rejects invalid effectiveDate format", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: debitId,
						creditAccountId: creditId,
						effectiveDate: "01-15-2026",
					})
				)
			).rejects.toThrow(DATE_FORMAT_PATTERN);
		});
	});

	it("accepts valid positive integer amount", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 5000,
				idempotencyKey: "valid-positive-test",
			})
		);

		expect(result.entry).toBeDefined();
		expect(result.entry.amount).toBe(5_000n);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-007: IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════════

describe("Step 2 — IDEMPOTENCY", () => {
	it("returns existing entry on duplicate idempotency key", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const firstResult = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-dup-key",
			})
		);

		const secondResult = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-dup-key",
			})
		);

		expect(secondResult.entry._id).toBe(firstResult.entry._id);
	});

	it("does not create a second journal entry on duplicate key", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-no-second",
			})
		);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-no-second",
			})
		);

		const entries = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", "idem-no-second")
				)
				.collect();
		});

		expect(entries).toHaveLength(1);
	});

	it("returns zero projected balances on duplicate (no balance update)", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-no-balance-update",
			})
		);

		const secondResult = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-no-balance-update",
			})
		);

		expect(secondResult.projectedDebitBalance).toBe(0n);
		expect(secondResult.projectedCreditBalance).toBe(0n);
	});

	it("creates separate entries for different idempotency keys", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const first = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-key-A",
			})
		);

		const second = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "idem-key-B",
			})
		);

		expect(first.entry._id).not.toBe(second.entry._id);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-008: FAMILY_CHECK
// ═══════════════════════════════════════════════════════════════════

describe("Step 4 — FAMILY_CHECK", () => {
	it("allows valid family combo: OBLIGATION_ACCRUED with BORROWER_RECEIVABLE debit and CONTROL credit", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				entryType: "OBLIGATION_ACCRUED",
				idempotencyKey: "family-valid-accrued",
			})
		);

		expect(result.entry.entryType).toBe("OBLIGATION_ACCRUED");
	});

	it("rejects invalid debit family: OBLIGATION_ACCRUED cannot debit TRUST_CASH", async () => {
		const t = createHarness();
		const trustCash = await createTestAccount(t, { family: "TRUST_CASH" });
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: trustCash._id,
						creditAccountId: control._id,
						entryType: "OBLIGATION_ACCRUED",
						idempotencyKey: "family-bad-debit",
					})
				)
			).rejects.toThrow(CANNOT_DEBIT_TRUST_CASH_PATTERN);
		});
	});

	it("rejects invalid credit family: OBLIGATION_ACCRUED cannot credit TRUST_CASH", async () => {
		const t = createHarness();
		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const trustCash = await createTestAccount(t, { family: "TRUST_CASH" });

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: receivable._id,
						creditAccountId: trustCash._id,
						entryType: "OBLIGATION_ACCRUED",
						idempotencyKey: "family-bad-credit",
					})
				)
			).rejects.toThrow(CANNOT_CREDIT_TRUST_CASH_PATTERN);
		});
	});

	it("REVERSAL accepts any family combination", async () => {
		const t = createHarness();
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});
		const writeOff = await createTestAccount(t, {
			family: "WRITE_OFF",
			initialDebitBalance: 100_000n,
		});

		// Seed a causedBy entry
		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: trustCash._id,
				creditAccountId: writeOff._id,
				amount: 10_000n,
				idempotencyKey: "seed-family-reversal",
				source: SYSTEM_SOURCE,
			});
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: trustCash._id,
				creditAccountId: writeOff._id,
				entryType: "REVERSAL",
				causedBy,
				idempotencyKey: "family-reversal-any",
			})
		);

		expect(result.entry.entryType).toBe("REVERSAL");
	});

	it("CORRECTION accepts any family combination", async () => {
		const t = createHarness();
		const suspense = await createTestAccount(t, {
			family: "SUSPENSE",
			initialDebitBalance: 100_000n,
		});
		const unapplied = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			initialDebitBalance: 100_000n,
		});

		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: suspense._id,
				creditAccountId: unapplied._id,
				amount: 10_000n,
				idempotencyKey: "seed-family-correction",
				source: SYSTEM_SOURCE,
			});
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: suspense._id,
				creditAccountId: unapplied._id,
				entryType: "CORRECTION",
				causedBy,
				reason: "Correcting suspense",
				source: ADMIN_SOURCE,
				idempotencyKey: "family-correction-any",
			})
		);

		expect(result.entry.entryType).toBe("CORRECTION");
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-009: BALANCE_CHECK
// ═══════════════════════════════════════════════════════════════════

describe("Step 5 — BALANCE_CHECK", () => {
	it("rejects non-exempt family when posting would make balance negative", async () => {
		const t = createHarness();
		// LENDER_PAYOUT_SENT: debit LENDER_PAYABLE, credit TRUST_CASH
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			initialCreditBalance: 100_000n,
		});
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			// Zero balance — crediting makes it negative for debit-normal
		});

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: lenderPayable._id,
						creditAccountId: trustCash._id,
						entryType: "LENDER_PAYOUT_SENT",
						amount: 50_000,
						idempotencyKey: "balance-reject-non-exempt",
					})
				)
			).rejects.toThrow(NEGATIVE_BALANCE_PATTERN);
		});
	});

	it("allows CONTROL family to go negative", async () => {
		const t = createHarness();
		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
			// Zero balance — will go negative on credit side
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: receivable._id,
				creditAccountId: control._id,
				entryType: "OBLIGATION_ACCRUED",
				amount: 50_000,
				idempotencyKey: "balance-control-negative-ok",
			})
		);

		expect(result.entry).toBeDefined();
	});

	it("allows BORROWER_RECEIVABLE to go negative", async () => {
		const t = createHarness();
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 200_000n,
		});
		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			// Zero balance — crediting makes it negative for debit-normal
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: trustCash._id,
				creditAccountId: receivable._id,
				entryType: "CASH_RECEIVED",
				amount: 50_000,
				idempotencyKey: "balance-receivable-negative-ok",
			})
		);

		expect(result.entry).toBeDefined();
	});

	it("skips balance check for REVERSAL", async () => {
		const t = createHarness();
		// Use TRUST_CASH with zero balance — would normally fail balance check
		const trustCash = await createTestAccount(t, { family: "TRUST_CASH" });
		const writeOff = await createTestAccount(t, { family: "WRITE_OFF" });

		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_WRITTEN_OFF",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: writeOff._id,
				creditAccountId: trustCash._id,
				amount: 10_000n,
				idempotencyKey: "seed-balance-reversal",
				source: SYSTEM_SOURCE,
			});
		});

		// REVERSAL with zero-balance non-exempt accounts — should pass because
		// balance check is skipped for REVERSAL
		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: trustCash._id,
				creditAccountId: writeOff._id,
				entryType: "REVERSAL",
				causedBy,
				amount: 5000,
				idempotencyKey: "balance-skip-reversal",
			})
		);

		expect(result.entry.entryType).toBe("REVERSAL");
	});

	it("skips balance check for CORRECTION", async () => {
		const t = createHarness();
		const trustCash = await createTestAccount(t, { family: "TRUST_CASH" });
		const writeOff = await createTestAccount(t, { family: "WRITE_OFF" });

		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_WRITTEN_OFF",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: writeOff._id,
				creditAccountId: trustCash._id,
				amount: 10_000n,
				idempotencyKey: "seed-balance-correction",
				source: SYSTEM_SOURCE,
			});
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: trustCash._id,
				creditAccountId: writeOff._id,
				entryType: "CORRECTION",
				causedBy,
				reason: "Correcting write-off",
				source: ADMIN_SOURCE,
				amount: 5000,
				idempotencyKey: "balance-skip-correction",
			})
		);

		expect(result.entry.entryType).toBe("CORRECTION");
	});

	it("skips balance check for SUSPENSE_ESCALATED", async () => {
		const t = createHarness();
		// Seed SUSPENSE with negative balance (credits > debits).
		// balance = debits - credits = 0 - 100_000 = -100_000.
		// Without the exemption, debiting would fail assertNonNegativeBalance.
		const suspense = await createTestAccount(t, {
			family: "SUSPENSE",
			initialCreditBalance: 100_000n,
		});
		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: suspense._id,
				creditAccountId: receivable._id,
				entryType: "SUSPENSE_ESCALATED",
				amount: 5000,
				idempotencyKey: "balance-skip-suspense-escalated",
			})
		);

		expect(result.entry.entryType).toBe("SUSPENSE_ESCALATED");
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-010: CONSTRAINT_CHECK (representative — full coverage in
//        constraintsAndBalanceExemption.test.ts)
// ═══════════════════════════════════════════════════════════════════

describe("Step 6 — CONSTRAINT_CHECK (representative)", () => {
	it("rejects REVERSAL without causedBy through full pipeline", async () => {
		const t = createHarness();
		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(
					ctx,
					validArgs({
						debitAccountId: receivable._id,
						creditAccountId: control._id,
						entryType: "REVERSAL",
						idempotencyKey: "constraint-reversal-no-caused",
					})
				)
			).rejects.toThrow(REVERSAL_CAUSED_BY_PATTERN);
		});
	});

	it("accepts CORRECTION with all required fields through full pipeline", async () => {
		const t = createHarness();
		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-01-15",
				timestamp: Date.now(),
				debitAccountId: receivable._id,
				creditAccountId: control._id,
				amount: 10_000n,
				idempotencyKey: "seed-constraint-correction",
				source: SYSTEM_SOURCE,
			});
		});

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: receivable._id,
				creditAccountId: control._id,
				entryType: "CORRECTION",
				causedBy,
				reason: "Correcting accrual",
				source: ADMIN_SOURCE,
				idempotencyKey: "constraint-correction-valid",
			})
		);

		expect(result.entry.entryType).toBe("CORRECTION");
		expect(result.entry.causedBy).toBe(causedBy);
		expect(result.entry.reason).toBe("Correcting accrual");
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-011: SEQUENCE + PERSIST
// ═══════════════════════════════════════════════════════════════════

describe("Steps 7+8 — SEQUENCE + PERSIST", () => {
	it("assigns monotonically increasing sequence numbers", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const first = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "seq-mono-1",
			})
		);

		const second = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "seq-mono-2",
			})
		);

		const third = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "seq-mono-3",
			})
		);

		expect(second.entry.sequenceNumber).toBeGreaterThan(
			first.entry.sequenceNumber
		);
		expect(third.entry.sequenceNumber).toBeGreaterThan(
			second.entry.sequenceNumber
		);
	});

	it("updates debit account cumulativeDebits", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 25_000,
				idempotencyKey: "persist-debit-cumulative",
			})
		);

		const debitAccount = await t.run(async (ctx) => {
			return ctx.db.get(debitId);
		});

		expect(debitAccount).not.toBeNull();
		expect(debitAccount?.cumulativeDebits).toBe(25_000n);
	});

	it("updates credit account cumulativeCredits", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 30_000,
				idempotencyKey: "persist-credit-cumulative",
			})
		);

		const creditAccount = await t.run(async (ctx) => {
			return ctx.db.get(creditId);
		});

		expect(creditAccount).not.toBeNull();
		expect(creditAccount?.cumulativeCredits).toBe(30_000n);
	});

	it("does NOT update wrong side — debit account cumulativeCredits stays zero", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 15_000,
				idempotencyKey: "persist-wrong-side",
			})
		);

		const debitAccount = await t.run(async (ctx) => {
			return ctx.db.get(debitId);
		});
		const creditAccount = await t.run(async (ctx) => {
			return ctx.db.get(creditId);
		});

		// Debit account: only cumulativeDebits should change
		expect(debitAccount?.cumulativeCredits).toBe(0n);
		// Credit account: only cumulativeCredits should change
		expect(creditAccount?.cumulativeDebits).toBe(0n);
	});

	it("persists cross-reference fields on the journal entry", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				idempotencyKey: "persist-cross-refs",
				postingGroupId: "pg-123",
				reason: "test reason",
				metadata: { note: "hello" },
			})
		);

		expect(result.entry.debitAccountId).toBe(debitId);
		expect(result.entry.creditAccountId).toBe(creditId);
		expect(result.entry.postingGroupId).toBe("pg-123");
		expect(result.entry.reason).toBe("test reason");
		expect(result.entry.metadata).toEqual({ note: "hello" });
	});

	it("returns projected balances for both accounts", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 40_000,
				idempotencyKey: "persist-projected",
			})
		);

		// BORROWER_RECEIVABLE is debit-normal: balance = debits - credits
		// After posting 40_000 debit: 40_000 - 0 = 40_000
		expect(result.projectedDebitBalance).toBe(40_000n);

		// CONTROL is debit-normal: balance = debits - credits
		// After posting 40_000 credit: 0 - 40_000 = -40_000
		expect(result.projectedCreditBalance).toBe(-40_000n);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-012: Cents Integrity
// ═══════════════════════════════════════════════════════════════════

describe("Cents integrity — bigint storage", () => {
	it("stores amount as bigint on the journal entry", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 123_456,
				idempotencyKey: "cents-amount-bigint",
			})
		);

		expect(typeof result.entry.amount).toBe("bigint");
		expect(result.entry.amount).toBe(123_456n);
	});

	it("stores cumulative totals as bigint on accounts", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 77_777,
				idempotencyKey: "cents-cumulative-bigint",
			})
		);

		const debitAccount = await t.run(async (ctx) => ctx.db.get(debitId));
		const creditAccount = await t.run(async (ctx) => ctx.db.get(creditId));

		expect(typeof debitAccount?.cumulativeDebits).toBe("bigint");
		expect(typeof creditAccount?.cumulativeCredits).toBe("bigint");
		expect(debitAccount?.cumulativeDebits).toBe(77_777n);
		expect(creditAccount?.cumulativeCredits).toBe(77_777n);
	});

	it("returns projected balance as bigint", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		const result = await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 88_888,
				idempotencyKey: "cents-projected-bigint",
			})
		);

		expect(typeof result.projectedDebitBalance).toBe("bigint");
		expect(typeof result.projectedCreditBalance).toBe("bigint");
	});

	it("no floating point drift across multiple postings", async () => {
		const t = createHarness();
		const { debitId, creditId } = await seedDefaultAccounts(t);

		// Post three entries with amounts that would cause float drift: 0.1+0.2 != 0.3
		// In cents: 10 + 20 + 30 = 60 (no drift)
		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 10,
				idempotencyKey: "cents-no-drift-1",
			})
		);
		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 20,
				idempotencyKey: "cents-no-drift-2",
			})
		);
		await postTestEntry(
			t,
			validArgs({
				debitAccountId: debitId,
				creditAccountId: creditId,
				amount: 30,
				idempotencyKey: "cents-no-drift-3",
			})
		);

		const debitAccount = await t.run(async (ctx) => ctx.db.get(debitId));

		expect(debitAccount?.cumulativeDebits).toBe(60n);
	});
});
