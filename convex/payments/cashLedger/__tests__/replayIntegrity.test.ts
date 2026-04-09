import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import { convexModules } from "../../../test/moduleMaps";
import type { PostCashEntryInput } from "../postEntry";
import {
	detectMissingSequences,
	filterByScope,
	getReplayCursor,
	replayJournalIntegrity,
} from "../replayIntegrity";
import { buildIdempotencyKey } from "../types";
import {
	createHarness,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	type TestHarness,
} from "./testUtils";

const modules = convexModules;

function replayIdempotencyKey(scope: string) {
	return buildIdempotencyKey("replay-test", scope);
}

// ── Typed account reader (avoids union-type issue with ctx.db.get) ───

async function readAccount(t: TestHarness, id: Id<"cash_ledger_accounts">) {
	return t.run(async (ctx) => {
		const accts = await ctx.db
			.query("cash_ledger_accounts")
			.filter((q) => q.eq(q.field("_id"), id))
			.first();
		return accts;
	});
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Seeds BORROWER_RECEIVABLE (debit) + CONTROL/ACCRUAL (credit) accounts. */
async function seedAccrualPair(t: TestHarness) {
	const debitAccount = await createTestAccount(t, {
		family: "BORROWER_RECEIVABLE",
	});
	const creditAccount = await createTestAccount(t, {
		family: "CONTROL",
		subaccount: "ACCRUAL",
	});
	return { debitAccount, creditAccount };
}

/** Seeds LENDER_PAYABLE (credit-normal) + CONTROL/ALLOCATION (debit) for LENDER_PAYABLE_CREATED. */
async function seedLenderPayablePair(t: TestHarness) {
	const controlAlloc = await createTestAccount(t, {
		family: "CONTROL",
		subaccount: "ALLOCATION",
	});
	const lenderPayable = await createTestAccount(t, {
		family: "LENDER_PAYABLE",
	});
	return { controlAlloc, lenderPayable };
}

/** Build a valid OBLIGATION_ACCRUED posting input. */
function accrualInput(
	debitAccountId: Id<"cash_ledger_accounts">,
	creditAccountId: Id<"cash_ledger_accounts">,
	overrides?: Partial<PostCashEntryInput>
): PostCashEntryInput {
	const overrideIdempotencyKey = overrides?.idempotencyKey;
	return {
		amount: 10_000,
		effectiveDate: "2026-01-15",
		entryType: "OBLIGATION_ACCRUED",
		source: SYSTEM_SOURCE,
		debitAccountId,
		creditAccountId,
		...overrides,
		idempotencyKey:
			overrideIdempotencyKey?.startsWith("cash-ledger:") === true
				? overrideIdempotencyKey
				: replayIdempotencyKey(
						overrideIdempotencyKey ??
							`${Date.now()}-${Math.random().toString(36).slice(2)}`
					),
	};
}

// ═════════════════════════════════════════════════════════════════════
// T-011: Test harness setup and helpers
// ═════════════════════════════════════════════════════════════════════

describe("Replay integrity — test harness", () => {
	it("createHarness returns a test harness", () => {
		const t = createHarness(modules);
		expect(t).toBeDefined();
		expect(typeof t.run).toBe("function");
	});

	it("seedAccrualPair creates debit and credit accounts", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);
		expect(debitAccount.family).toBe("BORROWER_RECEIVABLE");
		expect(creditAccount.family).toBe("CONTROL");
		expect(creditAccount.subaccount).toBe("ACCRUAL");
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-012: Clean replay passes
// ═════════════════════════════════════════════════════════════════════

describe("Clean replay passes", () => {
	it("posts 5 entries and replay returns passed: true", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		for (let i = 0; i < 5; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 10_000,
					idempotencyKey: `clean-replay-${i}`,
				})
			);
		}

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(true);
		expect(result.entriesReplayed).toBe(5);
		expect(result.accountsChecked).toBe(2);
		expect(result.mismatches).toHaveLength(0);
		expect(result.missingSequences).toHaveLength(0);
		expect(result.mode).toBe("full");
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-013: Drift detection
// ═════════════════════════════════════════════════════════════════════

describe("Drift detection", () => {
	it("detects mismatch when account cumulativeDebits is patched to wrong value", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Post 3 entries of 10_000 each => expected cumulativeDebits on debit account = 30_000
		for (let i = 0; i < 3; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 10_000,
					idempotencyKey: `drift-${i}`,
				})
			);
		}

		// Manually corrupt the debit account balance
		await t.run(async (ctx) => {
			await ctx.db.patch(debitAccount._id, {
				cumulativeDebits: 99_999n,
			});
		});

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(false);
		expect(result.mismatches.length).toBeGreaterThanOrEqual(1);

		const debitMismatch = result.mismatches.find(
			(m) => m.accountId === debitAccount._id
		);
		expect(debitMismatch).toBeDefined();
		expect(debitMismatch?.expectedDebits).toBe("30000");
		expect(debitMismatch?.storedDebits).toBe("99999");
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-014: Missing sequence detection
// ═════════════════════════════════════════════════════════════════════

describe("Missing sequence detection", () => {
	it("detects gap in sequence numbers", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Post entry 1 normally (gets sequence 1)
		await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				idempotencyKey: "missing-seq-1",
			})
		);

		// Manually advance the sequence counter to create a gap (skip 2)
		await t.run(async (ctx) => {
			const counter = await ctx.db
				.query("cash_ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "cash_ledger_global"))
				.first();
			if (counter) {
				await ctx.db.patch(counter._id, {
					currentValue: counter.currentValue + 1n,
				});
			}
		});

		// Post entry 3 (gets sequence 3, skipping 2)
		await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				idempotencyKey: "missing-seq-3",
			})
		);

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(false);
		expect(result.missingSequences).toContain("2");
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-015: Account scope
// ═════════════════════════════════════════════════════════════════════

describe("Account scope", () => {
	it("replay with accountId only checks that account's entries", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Post 2 entries
		for (let i = 0; i < 2; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 5000,
					idempotencyKey: `scope-acct-${i}`,
				})
			);
		}

		// Create a separate pair of accounts with its own entries
		// Need a real borrower ID for the schema validator
		const otherBorrowerId = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "scope-other-borrower",
				email: "scope-other@fairlend.test",
				firstName: "Other",
				lastName: "Borrower",
			});
			return ctx.db.insert("borrowers", {
				status: "active",
				userId,
				createdAt: Date.now(),
			});
		});
		const otherDebit = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			borrowerId: otherBorrowerId,
		});
		const otherCredit = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "SETTLEMENT",
		});

		await postTestEntry(
			t,
			accrualInput(otherDebit._id, otherCredit._id, {
				amount: 50_000,
				idempotencyKey: "scope-acct-other",
			})
		);

		// Replay scoped to the first debit account
		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, {
				mode: "full",
				accountId: debitAccount._id,
			});
		});

		// Should only see entries involving debitAccount._id
		expect(result.entriesReplayed).toBe(2);
		// Scoped replays never report passed=true — partial history cannot verify lifetime totals
		expect(result.passed).toBe(false);
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-016: Mortgage scope
// ═════════════════════════════════════════════════════════════════════

describe("Mortgage scope", () => {
	it("replay with mortgageId only checks entries for that mortgage", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Create a fake mortgage
		const mortgageId = await t.run(async (ctx) => {
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: await ctx.db.insert("users", {
					authId: "replay-broker",
					email: "replay-broker@test.com",
					firstName: "Broker",
					lastName: "Test",
				}),
				createdAt: Date.now(),
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "456 Replay Test St",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V 2B2",
				propertyType: "residential",
				createdAt: Date.now(),
			});
			return ctx.db.insert("mortgages", {
				status: "active",
				propertyId,
				principal: 500_000,
				annualServicingRate: 0.01,
				interestRate: 0.06,
				rateType: "fixed",
				termMonths: 12,
				amortizationMonths: 12,
				paymentAmount: 50_000,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-01-01",
				termStartDate: "2026-01-01",
				maturityDate: "2026-12-01",
				firstPaymentDate: "2026-02-01",
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
			});
		});

		// Post 2 entries WITH mortgageId
		for (let i = 0; i < 2; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 10_000,
					mortgageId,
					idempotencyKey: `mortgage-scope-${i}`,
				})
			);
		}

		// Post 1 entry WITHOUT mortgageId
		await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				amount: 10_000,
				idempotencyKey: "mortgage-scope-no-mortgage",
			})
		);

		// Replay scoped to that mortgage
		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, {
				mode: "full",
				mortgageId,
			});
		});

		// Should only see the 2 entries with that mortgage
		expect(result.entriesReplayed).toBe(2);
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-017: Empty ledger
// ═════════════════════════════════════════════════════════════════════

describe("Empty ledger", () => {
	it("no entries, replay returns passed: true with zero entries replayed", async () => {
		const t = createHarness(modules);

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(true);
		expect(result.entriesReplayed).toBe(0);
		expect(result.accountsChecked).toBe(0);
		expect(result.mismatches).toHaveLength(0);
		expect(result.missingSequences).toHaveLength(0);
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-018: Idempotent replay
// ═════════════════════════════════════════════════════════════════════

describe("Idempotent replay", () => {
	it("running replay twice yields the same result (read-only verification)", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		for (let i = 0; i < 3; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 7500,
					idempotencyKey: `idempotent-replay-${i}`,
				})
			);
		}

		const result1 = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		const result2 = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result1.passed).toBe(result2.passed);
		expect(result1.entriesReplayed).toBe(result2.entriesReplayed);
		expect(result1.accountsChecked).toBe(result2.accountsChecked);
		expect(result1.mismatches).toEqual(result2.mismatches);
		expect(result1.missingSequences).toEqual(result2.missingSequences);
		expect(result1.fromSequence).toBe(result2.fromSequence);
		expect(result1.toSequence).toBe(result2.toSequence);
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-019: Credit-normal vs debit-normal families handled correctly
// ═════════════════════════════════════════════════════════════════════

describe("Credit-normal vs debit-normal families", () => {
	it("accumulates debits and credits correctly for credit-normal families", async () => {
		const t = createHarness(modules);

		// LENDER_PAYABLE_CREATED: debit CONTROL/ALLOCATION, credit LENDER_PAYABLE
		// LENDER_PAYABLE is credit-normal
		const { controlAlloc, lenderPayable } = await seedLenderPayablePair(t);

		await postTestEntry(t, {
			amount: 20_000,
			effectiveDate: "2026-02-01",
			entryType: "LENDER_PAYABLE_CREATED",
			idempotencyKey: replayIdempotencyKey("credit-normal-1"),
			source: SYSTEM_SOURCE,
			debitAccountId: controlAlloc._id,
			creditAccountId: lenderPayable._id,
		});

		await postTestEntry(t, {
			amount: 30_000,
			effectiveDate: "2026-02-02",
			entryType: "LENDER_PAYABLE_CREATED",
			idempotencyKey: replayIdempotencyKey("credit-normal-2"),
			source: SYSTEM_SOURCE,
			debitAccountId: controlAlloc._id,
			creditAccountId: lenderPayable._id,
		});

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(true);
		// Both accounts should have been checked
		expect(result.accountsChecked).toBe(2);
	});

	it("accumulates debits and credits correctly for debit-normal families", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// BORROWER_RECEIVABLE is debit-normal, CONTROL is debit-normal
		await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				amount: 15_000,
				idempotencyKey: replayIdempotencyKey("debit-normal-1"),
			})
		);
		await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				amount: 25_000,
				idempotencyKey: replayIdempotencyKey("debit-normal-2"),
			})
		);

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(true);
		expect(result.entriesReplayed).toBe(2);
	});

	it("detects drift on credit-normal family correctly", async () => {
		const t = createHarness(modules);
		const { controlAlloc, lenderPayable } = await seedLenderPayablePair(t);

		await postTestEntry(t, {
			amount: 50_000,
			effectiveDate: "2026-02-01",
			entryType: "LENDER_PAYABLE_CREATED",
			idempotencyKey: replayIdempotencyKey("credit-normal-drift-1"),
			source: SYSTEM_SOURCE,
			debitAccountId: controlAlloc._id,
			creditAccountId: lenderPayable._id,
		});

		// Corrupt LENDER_PAYABLE credits (expected 50_000, set to 99_999)
		await t.run(async (ctx) => {
			await ctx.db.patch(lenderPayable._id, {
				cumulativeCredits: 99_999n,
			});
		});

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(false);
		const mismatch = result.mismatches.find(
			(m) => m.accountId === lenderPayable._id
		);
		expect(mismatch).toBeDefined();
		expect(mismatch?.expectedCredits).toBe("50000");
		expect(mismatch?.storedCredits).toBe("99999");
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-020: Cursor advancement
// ═════════════════════════════════════════════════════════════════════

describe("Cursor advancement", () => {
	it("replay, advance cursor, post more entries, incremental only covers new entries", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Post 3 entries
		for (let i = 0; i < 3; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 10_000,
					idempotencyKey: `cursor-phase1-${i}`,
				})
			);
		}

		// Full replay first to verify baseline
		const fullResult = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});
		expect(fullResult.passed).toBe(true);
		expect(fullResult.entriesReplayed).toBe(3);

		// Advance cursor to the last processed sequence
		const lastSeq = BigInt(fullResult.toSequence);
		await t.run(async (ctx) => {
			// Directly call advanceReplayCursor handler logic
			const existing = await ctx.db
				.query("cash_ledger_cursors")
				.withIndex("by_name", (q) => q.eq("name", "replay_integrity"))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, {
					lastProcessedSequence: lastSeq,
					lastProcessedAt: Date.now(),
				});
			} else {
				await ctx.db.insert("cash_ledger_cursors", {
					name: "replay_integrity",
					lastProcessedSequence: lastSeq,
					lastProcessedAt: Date.now(),
				});
			}
		});

		// Verify cursor was set
		const cursor = await t.run(async (ctx) => {
			return getReplayCursor(ctx);
		});
		expect(cursor).toBe(lastSeq);

		// Post 2 more entries
		for (let i = 0; i < 2; i++) {
			await postTestEntry(
				t,
				accrualInput(debitAccount._id, creditAccount._id, {
					amount: 10_000,
					idempotencyKey: `cursor-phase2-${i}`,
				})
			);
		}

		// Incremental replay should only cover the 2 new entries
		const incrementalResult = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "incremental" });
		});

		expect(incrementalResult.mode).toBe("incremental");
		expect(incrementalResult.entriesReplayed).toBe(2);
		expect(incrementalResult.fromSequence).toBe(lastSeq.toString());
	});
});

// ═════════════════════════════════════════════════════════════════════
// T-021: REVERSAL entries correctly reduce replayed totals
// ═════════════════════════════════════════════════════════════════════

describe("REVERSAL entries reduce replayed totals", () => {
	it("reversal debits/credits are accumulated just like normal entries", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Post an original OBLIGATION_ACCRUED: debit BORROWER_RECEIVABLE, credit CONTROL
		const original = await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				amount: 50_000,
				idempotencyKey: replayIdempotencyKey("reversal-original"),
			})
		);

		// Post a REVERSAL entry: swap debit/credit sides to "undo" the original
		// REVERSAL: debit the credit account, credit the debit account
		await postTestEntry(t, {
			amount: 50_000,
			effectiveDate: "2026-01-16",
			entryType: "REVERSAL",
			idempotencyKey: replayIdempotencyKey("reversal-undo"),
			source: SYSTEM_SOURCE,
			debitAccountId: creditAccount._id, // reversing: debit the CONTROL
			creditAccountId: debitAccount._id, // reversing: credit the BORROWER_RECEIVABLE
			causedBy: original.entry._id,
		});

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		// Both entries are replayed
		expect(result.entriesReplayed).toBe(2);
		expect(result.passed).toBe(true);

		// Verify the accounts are correctly balanced:
		// debitAccount (BORROWER_RECEIVABLE):
		//   cumulativeDebits = 50_000 (from original)
		//   cumulativeCredits = 50_000 (from reversal)
		// creditAccount (CONTROL):
		//   cumulativeDebits = 50_000 (from reversal)
		//   cumulativeCredits = 50_000 (from original)
		const debit = await readAccount(t, debitAccount._id);
		const credit = await readAccount(t, creditAccount._id);

		expect(debit?.cumulativeDebits).toBe(50_000n);
		expect(debit?.cumulativeCredits).toBe(50_000n);
		expect(credit?.cumulativeDebits).toBe(50_000n);
		expect(credit?.cumulativeCredits).toBe(50_000n);
	});

	it("partial reversal leaves correct remaining balance with replay pass", async () => {
		const t = createHarness(modules);
		const { debitAccount, creditAccount } = await seedAccrualPair(t);

		// Post original for 100_000
		const original = await postTestEntry(
			t,
			accrualInput(debitAccount._id, creditAccount._id, {
				amount: 100_000,
				idempotencyKey: replayIdempotencyKey("partial-reversal-original"),
			})
		);

		// Reverse only 40_000
		await postTestEntry(t, {
			amount: 40_000,
			effectiveDate: "2026-01-16",
			entryType: "REVERSAL",
			idempotencyKey: replayIdempotencyKey("partial-reversal-undo"),
			source: SYSTEM_SOURCE,
			debitAccountId: creditAccount._id,
			creditAccountId: debitAccount._id,
			causedBy: original.entry._id,
		});

		const result = await t.run(async (ctx) => {
			return replayJournalIntegrity(ctx, { mode: "full" });
		});

		expect(result.passed).toBe(true);
		expect(result.entriesReplayed).toBe(2);

		// debitAccount: debits=100_000, credits=40_000
		// creditAccount: debits=40_000, credits=100_000
		const debit = await readAccount(t, debitAccount._id);
		const credit = await readAccount(t, creditAccount._id);

		expect(debit?.cumulativeDebits).toBe(100_000n);
		expect(debit?.cumulativeCredits).toBe(40_000n);
		expect(credit?.cumulativeDebits).toBe(40_000n);
		expect(credit?.cumulativeCredits).toBe(100_000n);
	});
});

// ═════════════════════════════════════════════════════════════════════
// Unit tests for pure helper functions
// ═════════════════════════════════════════════════════════════════════

describe("filterByScope (unit)", () => {
	// Minimal entry-like objects for unit testing
	const fakeAccountA = "account-a" as Id<"cash_ledger_accounts">;
	const fakeAccountB = "account-b" as Id<"cash_ledger_accounts">;
	const fakeMortgage1 = "mortgage-1" as Id<"mortgages">;
	const fakeMortgage2 = "mortgage-2" as Id<"mortgages">;

	function fakeEntry(overrides: {
		debitAccountId?: Id<"cash_ledger_accounts">;
		creditAccountId?: Id<"cash_ledger_accounts">;
		mortgageId?: Id<"mortgages">;
	}) {
		return {
			debitAccountId: overrides.debitAccountId ?? fakeAccountA,
			creditAccountId: overrides.creditAccountId ?? fakeAccountB,
			mortgageId: overrides.mortgageId,
		} as unknown as import("../../../_generated/dataModel").Doc<"cash_ledger_journal_entries">;
	}

	it("returns all entries when no scope filters", () => {
		const entries = [fakeEntry({}), fakeEntry({})];
		const filtered = filterByScope(entries, { mode: "full" });
		expect(filtered).toHaveLength(2);
	});

	it("filters by accountId (debit side)", () => {
		const entries = [
			fakeEntry({ debitAccountId: fakeAccountA }),
			fakeEntry({ debitAccountId: fakeAccountB }),
		];
		const filtered = filterByScope(entries, {
			mode: "full",
			accountId: fakeAccountA,
		});
		expect(filtered).toHaveLength(1);
	});

	it("filters by accountId (credit side)", () => {
		const entries = [
			fakeEntry({
				debitAccountId: fakeAccountB,
				creditAccountId: fakeAccountA,
			}),
			fakeEntry({
				debitAccountId: fakeAccountB,
				creditAccountId: fakeAccountB,
			}),
		];
		const filtered = filterByScope(entries, {
			mode: "full",
			accountId: fakeAccountA,
		});
		expect(filtered).toHaveLength(1);
	});

	it("filters by mortgageId", () => {
		const entries = [
			fakeEntry({ mortgageId: fakeMortgage1 }),
			fakeEntry({ mortgageId: fakeMortgage2 }),
			fakeEntry({}),
		];
		const filtered = filterByScope(entries, {
			mode: "full",
			mortgageId: fakeMortgage1,
		});
		expect(filtered).toHaveLength(1);
	});
});

describe("detectMissingSequences (unit)", () => {
	function fakeEntryWithSeq(sequenceNumber: bigint) {
		return {
			sequenceNumber,
		} as unknown as import("../../../_generated/dataModel").Doc<"cash_ledger_journal_entries">;
	}

	it("returns empty for contiguous sequences", () => {
		const entries = [
			fakeEntryWithSeq(1n),
			fakeEntryWithSeq(2n),
			fakeEntryWithSeq(3n),
		];
		expect(detectMissingSequences(entries)).toEqual([]);
	});

	it("returns empty for empty entries", () => {
		expect(detectMissingSequences([])).toEqual([]);
	});

	it("detects single gap", () => {
		const entries = [fakeEntryWithSeq(1n), fakeEntryWithSeq(3n)];
		expect(detectMissingSequences(entries)).toEqual(["2"]);
	});

	it("detects multiple gaps", () => {
		const entries = [fakeEntryWithSeq(1n), fakeEntryWithSeq(5n)];
		expect(detectMissingSequences(entries)).toEqual(["2", "3", "4"]);
	});
});
