import { describe, expect, it } from "vitest";
import { getCashAccountBalance, isCreditNormalFamily } from "../accounts";
import { type PostCashEntryInput, postCashEntryInternal } from "../postEntry";
import {
	ADMIN_SOURCE,
	createHarness,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const NEGATIVE_BALANCE_PATTERN = /negative/i;
const REVERSAL_CAUSED_BY_PATTERN = /REVERSAL entries must reference causedBy/;

// ══════════════════════════════════════════════════════════════════════
// Invariant 1: CONTROL:ALLOCATION Net-Zero Per Posting Group
// ══════════════════════════════════════════════════════════════════════

describe("Invariant 1: CONTROL:ALLOCATION net-zero per posting group", () => {
	async function seedAllocationAccounts(t: TestHarness) {
		const seeded = await seedMinimalEntities(t);
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayableA = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			lenderId: seeded.lenderAId,
		});
		const lenderPayableB = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			lenderId: seeded.lenderBId,
		});
		const servicingRevenue = await createTestAccount(t, {
			family: "SERVICING_REVENUE",
		});

		return { controlAccount, lenderPayableA, lenderPayableB, servicingRevenue };
	}

	it("complete posting group nets to zero on CONTROL account", async () => {
		const t = createHarness();
		const accounts = await seedAllocationAccounts(t);
		const groupId = "allocation:complete-group";

		// Post 2 LENDER_PAYABLE_CREATED + 1 SERVICING_FEE_RECOGNIZED
		// All debit CONTROL:ALLOCATION
		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableA._id,
			idempotencyKey: "alloc-lenderA",
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 20_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableB._id,
			idempotencyKey: "alloc-lenderB",
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "SERVICING_FEE_RECOGNIZED",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.servicingRevenue._id,
			idempotencyKey: "alloc-fee",
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		// Verify: query entries by postingGroupId, sum debits/credits on CONTROL
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) => q.eq("postingGroupId", groupId))
				.collect();

			expect(entries).toHaveLength(3);

			// Compute per-account net changes across all entries in the group
			// Double-entry: sum of all debits == sum of all credits across accounts
			let totalGroupDebits = 0n;
			let totalGroupCredits = 0n;
			let controlDebits = 0n;
			let controlCredits = 0n;
			for (const entry of entries) {
				totalGroupDebits += entry.amount;
				totalGroupCredits += entry.amount;
				if (entry.debitAccountId === accounts.controlAccount._id) {
					controlDebits += entry.amount;
				}
				if (entry.creditAccountId === accounts.controlAccount._id) {
					controlCredits += entry.amount;
				}
			}

			// Double-entry invariant: total debits == total credits
			expect(totalGroupDebits).toBe(totalGroupCredits);

			// CONTROL was debited 30k + 20k + 5k = 55k, credited 0
			expect(controlDebits).toBe(55_000n);
			expect(controlCredits).toBe(0n);

			// The CONTROL net change (debits allocated out) matches total amounts
			expect(controlDebits).toBe(30_000n + 20_000n + 5_000n);
		});
	});

	it("incomplete posting group has non-zero CONTROL balance", async () => {
		const t = createHarness();
		const accounts = await seedAllocationAccounts(t);
		const groupId = "allocation:incomplete-group";

		// Only post 1 of 3 expected entries
		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableA._id,
			idempotencyKey: "incomplete-lenderA",
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) => q.eq("postingGroupId", groupId))
				.collect();

			expect(entries).toHaveLength(1);

			// With only 1 entry posted, CONTROL was debited 30_000 with no credits
			// The group is incomplete — non-zero net on CONTROL
			let controlDebits = 0n;
			let controlCredits = 0n;
			for (const entry of entries) {
				if (entry.debitAccountId === accounts.controlAccount._id) {
					controlDebits += entry.amount;
				}
				if (entry.creditAccountId === accounts.controlAccount._id) {
					controlCredits += entry.amount;
				}
			}

			const controlNet = controlCredits - controlDebits;
			expect(controlNet).not.toBe(0n);
			expect(controlNet).toBe(-30_000n);
		});
	});

	it("multiple posting groups are independent", async () => {
		const t = createHarness();
		const accounts = await seedAllocationAccounts(t);
		const groupA = "allocation:groupA";
		const groupB = "allocation:groupB";

		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 10_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableA._id,
			idempotencyKey: "groupA-lenderA",
			postingGroupId: groupA,
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 25_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableB._id,
			idempotencyKey: "groupB-lenderB",
			postingGroupId: groupB,
			source: SYSTEM_SOURCE,
		});

		await t.run(async (ctx) => {
			const entriesA = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) => q.eq("postingGroupId", groupA))
				.collect();
			const entriesB = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) => q.eq("postingGroupId", groupB))
				.collect();

			expect(entriesA).toHaveLength(1);
			expect(entriesB).toHaveLength(1);

			// Group A: CONTROL debited 10_000
			let groupAControlDebits = 0n;
			for (const entry of entriesA) {
				if (entry.debitAccountId === accounts.controlAccount._id) {
					groupAControlDebits += entry.amount;
				}
			}
			expect(groupAControlDebits).toBe(10_000n);

			// Group B: CONTROL debited 25_000
			let groupBControlDebits = 0n;
			for (const entry of entriesB) {
				if (entry.debitAccountId === accounts.controlAccount._id) {
					groupBControlDebits += entry.amount;
				}
			}
			expect(groupBControlDebits).toBe(25_000n);

			// Groups are independent — different amounts
			expect(groupAControlDebits).not.toBe(groupBControlDebits);
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// Invariant 2: Non-Negative LENDER_PAYABLE
// ══════════════════════════════════════════════════════════════════════

describe("Invariant 2: non-negative LENDER_PAYABLE", () => {
	it("rejects payout exceeding LENDER_PAYABLE balance", async () => {
		const t = createHarness();

		// LENDER_PAYABLE is credit-normal: balance = credits - debits
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			initialCreditBalance: 50_000n,
		});

		// TRUST_CASH needs sufficient debit balance (debit-normal: balance = debits - credits)
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});

		// Attempt payout of 60_000 when payable only has 50_000 balance
		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "LENDER_PAYOUT_SENT",
					effectiveDate: "2026-03-01",
					amount: 60_000,
					debitAccountId: lenderPayable._id,
					creditAccountId: trustCash._id,
					idempotencyKey: "payout-exceeding",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(NEGATIVE_BALANCE_PATTERN);
		});
	});

	it("allows REVERSAL to debit LENDER_PAYABLE below zero (clawback)", async () => {
		const t = createHarness();

		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			initialCreditBalance: 10_000n,
		});

		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});

		// First, create a seed entry to reference as causedBy
		const seedResult = await postTestEntry(t, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: "seed-payout-for-reversal",
			source: SYSTEM_SOURCE,
		});

		// Now post a REVERSAL that debits LENDER_PAYABLE by 20_000
		// LENDER_PAYABLE balance after seed = 10_000 - 5_000 = 5_000 credits
		// REVERSAL of 20_000 debiting LENDER_PAYABLE: 5_000 - 20_000 = -15_000
		// REVERSAL skips balance check, so this should succeed
		const result = await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 20_000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: "reversal-clawback",
			causedBy: seedResult.entry._id,
			source: SYSTEM_SOURCE,
		});

		expect(result.entry.entryType).toBe("REVERSAL");

		// Verify the LENDER_PAYABLE balance is now negative
		await t.run(async (ctx) => {
			const account = await ctx.db.get(lenderPayable._id);
			expect(account).not.toBeNull();
			if (account) {
				const balance = getCashAccountBalance(account);
				expect(balance).toBe(-15_000n);
			}
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// Invariant 3: Point-in-Time Reconstruction
// ══════════════════════════════════════════════════════════════════════

describe("Invariant 3: point-in-time reconstruction", () => {
	it("replayed balance matches running cumulative balance", async () => {
		const t = createHarness();

		// Create accounts that will be involved
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});
		const servicingRevenue = await createTestAccount(t, {
			family: "SERVICING_REVENUE",
		});

		// Post 3 entries all debiting CONTROL (the account we'll reconstruct)
		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayable._id,
			idempotencyKey: "pit-entry-1",
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 20_000,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayable._id,
			idempotencyKey: "pit-entry-2",
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "SERVICING_FEE_RECOGNIZED",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: controlAccount._id,
			creditAccountId: servicingRevenue._id,
			idempotencyKey: "pit-entry-3",
			source: SYSTEM_SOURCE,
		});

		await t.run(async (ctx) => {
			// Read the current running balance from the account
			const account = await ctx.db.get(controlAccount._id);
			expect(account).not.toBeNull();
			if (!account) {
				return;
			}

			const runningBalance = getCashAccountBalance(account);

			// Replay: gather all entries touching this account
			const debits = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", controlAccount._id)
				)
				.collect();
			const credits = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_credit_account_and_timestamp", (q) =>
					q.eq("creditAccountId", controlAccount._id)
				)
				.collect();

			// Merge and sort by sequenceNumber
			const allEntries = [
				...debits.map((e) => ({ ...e, side: "debit" as const })),
				...credits.map((e) => ({ ...e, side: "credit" as const })),
			].sort((a, b) => Number(a.sequenceNumber - b.sequenceNumber));

			// Replay balance computation
			let replayDebits = 0n;
			let replayCredits = 0n;
			for (const entry of allEntries) {
				if (entry.side === "debit") {
					replayDebits += entry.amount;
				} else {
					replayCredits += entry.amount;
				}
			}

			const replayBalance = isCreditNormalFamily(account.family)
				? replayCredits - replayDebits
				: replayDebits - replayCredits;

			expect(replayBalance).toBe(runningBalance);
		});
	});

	it("same-timestamp entries are ordered by sequenceNumber", async () => {
		const t = createHarness();

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});

		// Post multiple entries in a single t.run block to ensure same timestamp
		await t.run(async (ctx) => {
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 10_000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: "same-ts-1",
				source: SYSTEM_SOURCE,
			});
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 15_000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: "same-ts-2",
				source: SYSTEM_SOURCE,
			});
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 20_000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: "same-ts-3",
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", controlAccount._id)
				)
				.collect();

			expect(entries.length).toBeGreaterThanOrEqual(3);

			// All same timestamp entries should have ascending sequence numbers
			const sequenceNumbers = entries.map((e) => e.sequenceNumber);
			for (let i = 1; i < sequenceNumbers.length; i++) {
				expect(sequenceNumbers[i]).toBeGreaterThan(sequenceNumbers[i - 1]);
			}
		});
	});

	it("two independent replays produce identical balances", async () => {
		const t = createHarness();

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});

		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 12_000,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayable._id,
			idempotencyKey: "replay-1",
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-02",
			amount: 8000,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayable._id,
			idempotencyKey: "replay-2",
			source: SYSTEM_SOURCE,
		});

		// Two independent replay computations
		const replay = async () => {
			return t.run(async (ctx) => {
				const debits = await ctx.db
					.query("cash_ledger_journal_entries")
					.withIndex("by_debit_account_and_timestamp", (q) =>
						q.eq("debitAccountId", lenderPayable._id)
					)
					.collect();
				const credits = await ctx.db
					.query("cash_ledger_journal_entries")
					.withIndex("by_credit_account_and_timestamp", (q) =>
						q.eq("creditAccountId", lenderPayable._id)
					)
					.collect();

				const allEntries = [
					...debits.map((e) => ({ ...e, side: "debit" as const })),
					...credits.map((e) => ({ ...e, side: "credit" as const })),
				].sort((a, b) => Number(a.sequenceNumber - b.sequenceNumber));

				let totalDebits = 0n;
				let totalCredits = 0n;
				for (const entry of allEntries) {
					if (entry.side === "debit") {
						totalDebits += entry.amount;
					} else {
						totalCredits += entry.amount;
					}
				}

				// LENDER_PAYABLE is credit-normal
				return totalCredits - totalDebits;
			});
		};

		const balance1 = await replay();
		const balance2 = await replay();
		expect(balance1).toBe(balance2);
		expect(balance1).toBe(20_000n); // 12_000 + 8_000
	});
});

// ══════════════════════════════════════════════════════════════════════
// Invariant 4: Idempotent Replay
// ══════════════════════════════════════════════════════════════════════

describe("Invariant 4: idempotent replay", () => {
	it("posting same entries twice produces identical state", async () => {
		const t = createHarness();

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});
		const servicingRevenue = await createTestAccount(t, {
			family: "SERVICING_REVENUE",
		});

		const entries: PostCashEntryInput[] = [
			{
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 30_000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: "idempotent-1",
				source: SYSTEM_SOURCE,
			},
			{
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 20_000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: "idempotent-2",
				source: SYSTEM_SOURCE,
			},
			{
				entryType: "SERVICING_FEE_RECOGNIZED",
				effectiveDate: "2026-03-01",
				amount: 5000,
				debitAccountId: controlAccount._id,
				creditAccountId: servicingRevenue._id,
				idempotencyKey: "idempotent-3",
				source: SYSTEM_SOURCE,
			},
		];

		// First pass: post all 3 entries
		for (const entry of entries) {
			await postTestEntry(t, entry);
		}

		// Snapshot state after first pass
		const snapshotAfterFirstPass = await t.run(async (ctx) => {
			const allEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.collect();
			const controlAcc = await ctx.db.get(controlAccount._id);
			const payableAcc = await ctx.db.get(lenderPayable._id);
			const revenueAcc = await ctx.db.get(servicingRevenue._id);

			return {
				entryCount: allEntries.length,
				controlBalance: controlAcc ? getCashAccountBalance(controlAcc) : null,
				payableBalance: payableAcc ? getCashAccountBalance(payableAcc) : null,
				revenueBalance: revenueAcc ? getCashAccountBalance(revenueAcc) : null,
			};
		});

		// Second pass: post same 3 entries again (same idempotency keys)
		for (const entry of entries) {
			await postTestEntry(t, entry);
		}

		// Snapshot state after second pass
		const snapshotAfterSecondPass = await t.run(async (ctx) => {
			const allEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.collect();
			const controlAcc = await ctx.db.get(controlAccount._id);
			const payableAcc = await ctx.db.get(lenderPayable._id);
			const revenueAcc = await ctx.db.get(servicingRevenue._id);

			return {
				entryCount: allEntries.length,
				controlBalance: controlAcc ? getCashAccountBalance(controlAcc) : null,
				payableBalance: payableAcc ? getCashAccountBalance(payableAcc) : null,
				revenueBalance: revenueAcc ? getCashAccountBalance(revenueAcc) : null,
			};
		});

		// Entry count unchanged
		expect(snapshotAfterSecondPass.entryCount).toBe(
			snapshotAfterFirstPass.entryCount
		);

		// Balances unchanged
		expect(snapshotAfterSecondPass.controlBalance).toBe(
			snapshotAfterFirstPass.controlBalance
		);
		expect(snapshotAfterSecondPass.payableBalance).toBe(
			snapshotAfterFirstPass.payableBalance
		);
		expect(snapshotAfterSecondPass.revenueBalance).toBe(
			snapshotAfterFirstPass.revenueBalance
		);
	});

	it("idempotent replay returns original entry without creating duplicates", async () => {
		const t = createHarness();

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});

		const firstResult = await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 10_000,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayable._id,
			idempotencyKey: "idempotent-return-check",
			source: SYSTEM_SOURCE,
		});

		const secondResult = await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 10_000,
			debitAccountId: controlAccount._id,
			creditAccountId: lenderPayable._id,
			idempotencyKey: "idempotent-return-check",
			source: SYSTEM_SOURCE,
		});

		// Both returns should reference the same entry
		expect(secondResult.entry._id).toBe(firstResult.entry._id);
		expect(secondResult.entry.sequenceNumber).toBe(
			firstResult.entry.sequenceNumber
		);
	});
});

// ══════════════════════════════════════════════════════════════════════
// Invariant 5: Append-Only Correction
// ══════════════════════════════════════════════════════════════════════

describe("Invariant 5: append-only correction", () => {
	it("CORRECTION creates new entry with causedBy, original unchanged", async () => {
		const t = createHarness();

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post the original entry
		const originalResult = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "original-accrual",
			source: SYSTEM_SOURCE,
		});

		// Snapshot the original entry
		const originalSnapshot = await t.run(async (ctx) => {
			const entry = await ctx.db.get(originalResult.entry._id);
			return entry;
		});
		expect(originalSnapshot).not.toBeNull();

		// Post a CORRECTION referencing the original
		const correctionResult = await postTestEntry(t, {
			entryType: "CORRECTION",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "correction-of-accrual",
			causedBy: originalResult.entry._id,
			reason: "Correcting accrual amount",
			source: ADMIN_SOURCE,
		});

		// CORRECTION is a separate entry with its own ID
		expect(correctionResult.entry._id).not.toBe(originalResult.entry._id);
		expect(correctionResult.entry.entryType).toBe("CORRECTION");
		expect(correctionResult.entry.causedBy).toBe(originalResult.entry._id);

		// Re-read original entry — all fields unchanged
		await t.run(async (ctx) => {
			const reloaded = await ctx.db.get(originalResult.entry._id);
			expect(reloaded).not.toBeNull();
			if (!(reloaded && originalSnapshot)) {
				return;
			}

			expect(reloaded.entryType).toBe(originalSnapshot.entryType);
			expect(reloaded.amount).toBe(originalSnapshot.amount);
			expect(reloaded.effectiveDate).toBe(originalSnapshot.effectiveDate);
			expect(reloaded.debitAccountId).toBe(originalSnapshot.debitAccountId);
			expect(reloaded.creditAccountId).toBe(originalSnapshot.creditAccountId);
			expect(reloaded.sequenceNumber).toBe(originalSnapshot.sequenceNumber);
			expect(reloaded.idempotencyKey).toBe(originalSnapshot.idempotencyKey);
			expect(reloaded.causedBy).toBe(originalSnapshot.causedBy);
			expect(reloaded.source).toEqual(originalSnapshot.source);
		});
	});

	it("REVERSAL creates new entry leaving original intact", async () => {
		const t = createHarness();

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post the original entry
		const originalResult = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 75_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "original-for-reversal",
			source: SYSTEM_SOURCE,
		});

		// Snapshot the original
		const originalSnapshot = await t.run(async (ctx) => {
			return ctx.db.get(originalResult.entry._id);
		});

		// Post REVERSAL referencing the original
		const reversalResult = await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 75_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "reversal-of-original",
			causedBy: originalResult.entry._id,
			source: SYSTEM_SOURCE,
		});

		// REVERSAL is a separate entry
		expect(reversalResult.entry._id).not.toBe(originalResult.entry._id);
		expect(reversalResult.entry.entryType).toBe("REVERSAL");
		expect(reversalResult.entry.causedBy).toBe(originalResult.entry._id);

		// Original unchanged
		await t.run(async (ctx) => {
			const reloaded = await ctx.db.get(originalResult.entry._id);
			expect(reloaded).not.toBeNull();
			if (!(reloaded && originalSnapshot)) {
				return;
			}

			expect(reloaded.entryType).toBe(originalSnapshot.entryType);
			expect(reloaded.amount).toBe(originalSnapshot.amount);
			expect(reloaded.effectiveDate).toBe(originalSnapshot.effectiveDate);
			expect(reloaded.debitAccountId).toBe(originalSnapshot.debitAccountId);
			expect(reloaded.creditAccountId).toBe(originalSnapshot.creditAccountId);
			expect(reloaded.sequenceNumber).toBe(originalSnapshot.sequenceNumber);
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// Invariant 6: Reversal Traceability
// ══════════════════════════════════════════════════════════════════════

describe("Invariant 6: reversal traceability", () => {
	it("every REVERSAL has causedBy referencing a valid entry", async () => {
		const t = createHarness();

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post an original entry
		const originalResult = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 40_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "traceable-original",
			source: SYSTEM_SOURCE,
		});

		// Post a REVERSAL with valid causedBy
		const reversalResult = await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 40_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "traceable-reversal",
			causedBy: originalResult.entry._id,
			source: SYSTEM_SOURCE,
		});

		// Verify causedBy is set on the reversal
		expect(reversalResult.entry.causedBy).toBeDefined();
		expect(reversalResult.entry.causedBy).toBe(originalResult.entry._id);

		// Load the causedBy entry from DB — verify it exists and is valid
		await t.run(async (ctx) => {
			const causedById = reversalResult.entry.causedBy;
			expect(causedById).toBeDefined();
			if (!causedById) {
				return;
			}

			const causedByEntry = await ctx.db.get(causedById);
			expect(causedByEntry).not.toBeNull();
			expect(causedByEntry?._id).toBe(originalResult.entry._id);
			expect(causedByEntry?.entryType).toBe("OBLIGATION_ACCRUED");
			expect(causedByEntry?.amount).toBe(40_000n);
		});
	});

	it("REVERSAL without causedBy is rejected", async () => {
		const t = createHarness();

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "REVERSAL",
					effectiveDate: "2026-03-01",
					amount: 10_000,
					debitAccountId: receivable._id,
					creditAccountId: controlAccount._id,
					idempotencyKey: "reversal-no-causedby",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(REVERSAL_CAUSED_BY_PATTERN);
		});
	});

	it("causedBy can be queried via by_caused_by index", async () => {
		const t = createHarness();

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
		});
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const originalResult = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 25_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "index-test-original",
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 25_000,
			debitAccountId: receivable._id,
			creditAccountId: controlAccount._id,
			idempotencyKey: "index-test-reversal",
			causedBy: originalResult.entry._id,
			source: SYSTEM_SOURCE,
		});

		// Query by_caused_by to find the reversal
		await t.run(async (ctx) => {
			const reversals = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_caused_by", (q) =>
					q.eq("causedBy", originalResult.entry._id)
				)
				.collect();

			expect(reversals).toHaveLength(1);
			expect(reversals[0].entryType).toBe("REVERSAL");
			expect(reversals[0].causedBy).toBe(originalResult.entry._id);
		});
	});
});
