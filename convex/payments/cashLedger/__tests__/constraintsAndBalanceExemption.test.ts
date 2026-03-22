import { describe, expect, it } from "vitest";
import { getOrCreateCashAccount } from "../accounts";
import type { PostCashEntryInput } from "../postEntry";
import { postCashEntryInternal } from "../postEntry";
import {
	ADMIN_SOURCE,
	createHarness,
	SYSTEM_SOURCE,
	type TestHarness,
} from "./testUtils";

const CORRECTION_ADMIN_ACTOR_PATTERN =
	/CORRECTION entries require admin actorType/;
const CORRECTION_ACTOR_ID_PATTERN =
	/CORRECTION entries require source\.actorId/;
const CORRECTION_CAUSED_BY_PATTERN =
	/CORRECTION entries must reference causedBy/;
const CORRECTION_REASON_PATTERN = /CORRECTION entries require a reason/;
const REVERSAL_CAUSED_BY_PATTERN = /REVERSAL entries must reference causedBy/;
const NEGATIVE_BALANCE_PATTERN = /negative/i;

/**
 * Seeds a minimal set of cash ledger accounts needed for CORRECTION/REVERSAL
 * and balance exemption tests. Returns account IDs and a fake causedBy ID.
 */
async function seedAccountsForConstraintTests(t: TestHarness) {
	return t.run(async (ctx) => {
		// We need two distinct accounts. REVERSAL and CORRECTION allow ALL_FAMILIES,
		// so we can use any families. We create a BORROWER_RECEIVABLE and a CONTROL
		// account since they are both NEGATIVE_BALANCE_EXEMPT.
		const receivableAccount = await getOrCreateCashAccount(ctx, {
			family: "BORROWER_RECEIVABLE",
		});
		const controlAccount = await getOrCreateCashAccount(ctx, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Create a seed journal entry to use as causedBy reference
		const seedEntryId = await ctx.db.insert("cash_ledger_journal_entries", {
			sequenceNumber: 0n,
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-01-15",
			timestamp: Date.now(),
			debitAccountId: receivableAccount._id,
			creditAccountId: controlAccount._id,
			amount: 10_000n,
			idempotencyKey: "seed-entry-for-constraint-tests",
			source: SYSTEM_SOURCE,
		});

		return {
			debitAccountId: receivableAccount._id,
			creditAccountId: controlAccount._id,
			causedBy: seedEntryId,
		};
	});
}

/**
 * Seeds accounts for balance guard tests: one BORROWER_RECEIVABLE (exempt)
 * and one CASH_HOLDING-equivalent (non-exempt). We use TRUST_CASH as the
 * non-exempt family.
 */
async function seedAccountsForBalanceTests(t: TestHarness) {
	return t.run(async (ctx) => {
		// BORROWER_RECEIVABLE is exempt from negative balance checks
		const receivableAccount = await getOrCreateCashAccount(ctx, {
			family: "BORROWER_RECEIVABLE",
		});

		// TRUST_CASH is NOT exempt — should trigger negative balance guard
		const trustCashAccount = await getOrCreateCashAccount(ctx, {
			family: "TRUST_CASH",
		});

		// CONTROL is also exempt
		const controlAccount = await getOrCreateCashAccount(ctx, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		return {
			receivableAccountId: receivableAccount._id,
			trustCashAccountId: trustCashAccount._id,
			controlAccountId: controlAccount._id,
		};
	});
}

// ── CORRECTION constraint checks ────────────────────────────────────────

describe("constraintCheck — CORRECTION entries", () => {
	it("rejects CORRECTION when source.actorType is not admin", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const args: PostCashEntryInput = {
				entryType: "CORRECTION",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "correction-bad-actor-type",
				causedBy: seeded.causedBy,
				reason: "Fix misposting",
				source: { ...SYSTEM_SOURCE, actorType: "system" },
			};

			await expect(postCashEntryInternal(ctx, args)).rejects.toThrow(
				CORRECTION_ADMIN_ACTOR_PATTERN
			);
		});
	});

	it("rejects CORRECTION when source.actorId is missing", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const args: PostCashEntryInput = {
				entryType: "CORRECTION",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "correction-no-actor-id",
				causedBy: seeded.causedBy,
				reason: "Fix misposting",
				source: { channel: "admin_dashboard", actorType: "admin" },
			};

			await expect(postCashEntryInternal(ctx, args)).rejects.toThrow(
				CORRECTION_ACTOR_ID_PATTERN
			);
		});
	});

	it("rejects CORRECTION when causedBy is missing", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const args: PostCashEntryInput = {
				entryType: "CORRECTION",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "correction-no-caused-by",
				reason: "Fix misposting",
				source: ADMIN_SOURCE,
			};

			await expect(postCashEntryInternal(ctx, args)).rejects.toThrow(
				CORRECTION_CAUSED_BY_PATTERN
			);
		});
	});

	it("rejects CORRECTION when reason is missing", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const args: PostCashEntryInput = {
				entryType: "CORRECTION",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "correction-no-reason",
				causedBy: seeded.causedBy,
				source: ADMIN_SOURCE,
			};

			await expect(postCashEntryInternal(ctx, args)).rejects.toThrow(
				CORRECTION_REASON_PATTERN
			);
		});
	});

	it("succeeds when all required CORRECTION fields are present", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const result = await postCashEntryInternal(ctx, {
				entryType: "CORRECTION",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "correction-valid",
				causedBy: seeded.causedBy,
				reason: "Fix misposting — correcting accrual amount",
				source: ADMIN_SOURCE,
			});

			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("CORRECTION");
			expect(result.entry.causedBy).toBe(seeded.causedBy);
			expect(result.entry.reason).toBe(
				"Fix misposting — correcting accrual amount"
			);
		});
	});
});

// ── REVERSAL constraint checks ──────────────────────────────────────────

describe("constraintCheck — REVERSAL entries", () => {
	it("rejects REVERSAL when causedBy is missing", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const args: PostCashEntryInput = {
				entryType: "REVERSAL",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "reversal-no-caused-by",
				source: SYSTEM_SOURCE,
			};

			await expect(postCashEntryInternal(ctx, args)).rejects.toThrow(
				REVERSAL_CAUSED_BY_PATTERN
			);
		});
	});

	it("succeeds when causedBy is present", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForConstraintTests(t);

		await t.run(async (ctx) => {
			const result = await postCashEntryInternal(ctx, {
				entryType: "REVERSAL",
				effectiveDate: "2026-03-01",
				amount: 1000,
				debitAccountId: seeded.debitAccountId,
				creditAccountId: seeded.creditAccountId,
				idempotencyKey: "reversal-valid",
				causedBy: seeded.causedBy,
				source: SYSTEM_SOURCE,
			});

			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("REVERSAL");
			expect(result.entry.causedBy).toBe(seeded.causedBy);
		});
	});
});

// ── BORROWER_RECEIVABLE negative balance exemption ──────────────────────

describe("balanceCheck — NEGATIVE_BALANCE_EXEMPT_FAMILIES", () => {
	it("allows BORROWER_RECEIVABLE account to go negative (exempt from balance check)", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForBalanceTests(t);

		await t.run(async (ctx) => {
			// CASH_RECEIVED: debit TRUST_CASH, credit BORROWER_RECEIVABLE
			// The BORROWER_RECEIVABLE account has 0 balance. Crediting it would make
			// its balance negative (debits-credits goes below zero for debit-normal).
			// Because BORROWER_RECEIVABLE is in NEGATIVE_BALANCE_EXEMPT_FAMILIES,
			// this should succeed.
			const result = await postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: seeded.trustCashAccountId,
				creditAccountId: seeded.receivableAccountId,
				idempotencyKey: "balance-exempt-receivable",
				source: SYSTEM_SOURCE,
			});

			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("CASH_RECEIVED");
		});
	});

	it("rejects non-exempt family (TRUST_CASH) when posting would make balance negative", async () => {
		const t = createHarness();
		const seeded = await seedAccountsForBalanceTests(t);

		await t.run(async (ctx) => {
			// LENDER_PAYOUT_SENT: debit LENDER_PAYABLE, credit TRUST_CASH
			// But we don't have LENDER_PAYABLE set up. Instead, let's create a scenario
			// where TRUST_CASH (non-exempt, debit-normal) would go negative.
			//
			// We need an entry type whose family constraint allows crediting TRUST_CASH.
			// LENDER_PAYOUT_SENT: debit LENDER_PAYABLE, credit TRUST_CASH.
			// Create a LENDER_PAYABLE account with some balance.
			const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
			});

			// Give LENDER_PAYABLE a credit balance (credit-normal) so debiting it is fine
			await ctx.db.patch(lenderPayableAccount._id, {
				cumulativeCredits: 100_000n,
			});

			// TRUST_CASH has 0 balance (debit-normal). Crediting it makes balance go
			// negative: 0 - 50_000 = -50_000. Since TRUST_CASH is NOT exempt, this
			// should throw.
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "LENDER_PAYOUT_SENT",
					effectiveDate: "2026-03-01",
					amount: 50_000,
					debitAccountId: lenderPayableAccount._id,
					creditAccountId: seeded.trustCashAccountId,
					idempotencyKey: "balance-guard-trust-cash",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(NEGATIVE_BALANCE_PATTERN);
		});
	});
});

// ── SUSPENSE_ESCALATED balance exemption ─────────────────────────────

describe("balanceCheck — SUSPENSE_ESCALATED exemption", () => {
	it("SUSPENSE_ESCALATED skips balance check (like REVERSAL/CORRECTION)", async () => {
		const t = createHarness();

		await t.run(async (ctx) => {
			const suspenseAccount = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
			});
			const receivableAccount = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});

			// Seed SUSPENSE with a negative balance (credits > debits).
			// SUSPENSE is debit-normal: balance = debits - credits = 0 - 100_000 = -100_000.
			// Debiting by 25_000 still leaves projected balance at -75_000 which would
			// fail assertNonNegativeBalance if the check ran. This proves the exemption.
			await ctx.db.patch(suspenseAccount._id, {
				cumulativeCredits: 100_000n,
			});
			const result = await postCashEntryInternal(ctx, {
				entryType: "SUSPENSE_ESCALATED",
				effectiveDate: "2026-03-01",
				amount: 25_000,
				debitAccountId: suspenseAccount._id,
				creditAccountId: receivableAccount._id,
				idempotencyKey: "suspense-escalated-balance-exempt",
				source: SYSTEM_SOURCE,
			});

			expect(result.entry).toBeDefined();
			expect(result.entry.entryType).toBe("SUSPENSE_ESCALATED");
		});
	});
});
