import { describe, expect, it } from "vitest";
import {
	ADMIN_SOURCE,
	createHarness,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import type { Doc } from "../../../_generated/dataModel";
import { convexModules } from "../../../test/moduleMaps";
import { getCashAccountBalance } from "../accounts";
import { postCashCorrectionForEntry } from "../integrations";
import { postCashEntryInternal } from "../postEntry";

const modules = convexModules;

// ── Regex patterns (top-level for Biome useTopLevelRegex) ───────────
const CORRECTION_ADMIN_PATTERN = /CORRECTION entries require admin actorType/;
const CORRECTION_REASON_PATTERN = /CORRECTION entries require a reason/;
const CORRECTION_ORCHESTRATION_ADMIN_PATTERN =
	/Cash correction requires admin actorType/;
const CORRECTION_EMPTY_REASON_PATTERN =
	/Cash correction requires a non-empty reason/;
const REPLACEMENT_EXCEEDS_PATTERN = /must not exceed original amount/;
const MISMATCHED_RETRY_PATTERN = /Mismatched correction retry/;
const CORRECTION_POSTING_GROUP_PREFIX_PATTERN = /^correction:/;
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ═══════════════════════════════════════════════════════════════════
// T-006: Simple Reversal
// ═══════════════════════════════════════════════════════════════════

describe("T-006: Simple reversal", () => {
	it("creates a REVERSAL entry that mirrors the original with swapped accounts", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post original entry
		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-simple-reversal-original",
			source: SYSTEM_SOURCE,
		});

		// Run correction (simple reversal, no replacement)
		const result = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Posted in error",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
			});
		});

		// Verify reversal entry
		expect(result.reversalEntry.entryType).toBe("REVERSAL");
		expect(result.reversalEntry.causedBy).toBe(original.entry._id);
		expect(result.reversalEntry.debitAccountId).toBe(
			original.entry.creditAccountId
		);
		expect(result.reversalEntry.creditAccountId).toBe(
			original.entry.debitAccountId
		);
		expect(result.reversalEntry.amount).toBe(original.entry.amount);
		expect(result.replacementEntry).toBeNull();
		expect(result.postingGroupId).toMatch(
			CORRECTION_POSTING_GROUP_PREFIX_PATTERN
		);

		// Net effect on receivable is zero vs. state right before the original accrual
		const receivableAfterRow = await t.run(async (ctx) => {
			return ctx.db.get(receivable._id);
		});
		expect(receivableAfterRow).not.toBeNull();
		const receivableAfter = receivableAfterRow as Doc<"cash_ledger_accounts">;
		expect(getCashAccountBalance(receivableAfter)).toBe(
			getCashAccountBalance(receivable)
		);

		// Original entry unchanged
		const originalReread = await t.run(async (ctx) => {
			return ctx.db.get(original.entry._id);
		});
		expect(originalReread).not.toBeNull();
		expect(originalReread?.entryType).toBe("OBLIGATION_ACCRUED");
		expect(originalReread?.amount).toBe(100_000n);
		expect(originalReread?.debitAccountId).toBe(receivable._id);
		expect(originalReread?.creditAccountId).toBe(control._id);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-007: Correction with Replacement
// ═══════════════════════════════════════════════════════════════════

describe("T-007: Correction with replacement", () => {
	it("creates reversal for full amount and replacement for reduced amount", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post original
		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-correction-replacement-original",
			source: SYSTEM_SOURCE,
		});

		// Correct with replacement
		const result = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Amount was wrong",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
				replacement: {
					amount: 80_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					entryType: "OBLIGATION_ACCRUED",
				},
			});
		});

		// Reversal exists with full original amount
		expect(result.reversalEntry.entryType).toBe("REVERSAL");
		expect(result.reversalEntry.amount).toBe(100_000n);
		expect(result.reversalEntry.causedBy).toBe(original.entry._id);

		// Replacement exists with new amount
		expect(result.replacementEntry).not.toBeNull();
		expect(result.replacementEntry?.amount).toBe(80_000n);
		expect(result.replacementEntry?.causedBy).toBe(original.entry._id);
		expect(result.replacementEntry?.entryType).toBe("OBLIGATION_ACCRUED");

		// Both share same postingGroupId
		expect(result.reversalEntry.postingGroupId).toBe(result.postingGroupId);
		expect(result.replacementEntry?.postingGroupId).toBe(result.postingGroupId);

		const receivableAfterRow = await t.run(async (ctx) => {
			return ctx.db.get(receivable._id);
		});
		expect(receivableAfterRow).not.toBeNull();
		const receivableAfter = receivableAfterRow as Doc<"cash_ledger_accounts">;
		// Initial 200k + 100k accrual debit − 100k reversal credit + 80k replacement debit
		expect(getCashAccountBalance(receivableAfter)).toBe(280_000n);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-008: Idempotency
// ═══════════════════════════════════════════════════════════════════

describe("T-008: Idempotency", () => {
	it("returns the same reversal entry ID on repeated correction calls", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-idempotency-original",
			source: SYSTEM_SOURCE,
		});

		// First correction
		const first = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Idempotency test",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
			});
		});

		// Second correction with same params (new t.run)
		const second = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Idempotency test",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
			});
		});

		// The reversal idempotency key is `cash-ledger:correction-reversal:{originalId}`
		// so both calls should return the same reversal entry
		expect(second.reversalEntry._id).toBe(first.reversalEntry._id);
		expect(second.postingGroupId).toBe(first.postingGroupId);

		const causedByCount = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_caused_by", (q) => q.eq("causedBy", original.entry._id))
				.collect();
			return rows.filter((e) => e.entryType === "REVERSAL").length;
		});
		expect(causedByCount).toBe(1);
	});

	it("rejects a second call with a different replacement payload", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-mismatch-original",
			source: SYSTEM_SOURCE,
		});

		// First call: WITH replacement (creates the replacement entry)
		await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Original reason",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
				replacement: {
					amount: 80_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					entryType: "OBLIGATION_ACCRUED",
				},
			});
		});

		// Second call: same original, different replacement reason → must reject
		await expect(
			t.run(async (ctx) => {
				return postCashCorrectionForEntry(ctx, {
					originalEntryId: original.entry._id,
					reason: "Different reason",
					source: ADMIN_SOURCE,
					effectiveDate: "2026-03-03",
					replacement: {
						amount: 80_000,
						debitAccountId: receivable._id,
						creditAccountId: control._id,
						entryType: "OBLIGATION_ACCRUED",
					},
				});
			})
		).rejects.toThrow(MISMATCHED_RETRY_PATTERN);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-009: Non-Admin Rejection for CORRECTION
// ═══════════════════════════════════════════════════════════════════

describe("T-009: Non-admin rejection for CORRECTION", () => {
	it("rejects postCashCorrectionForEntry when source is not admin", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-orchestration-non-admin",
			source: SYSTEM_SOURCE,
		});

		await expect(
			t.run(async (ctx) => {
				return postCashCorrectionForEntry(ctx, {
					originalEntryId: original.entry._id,
					reason: "System may not correct",
					source: SYSTEM_SOURCE,
					effectiveDate: "2026-03-02",
				});
			})
		).rejects.toThrow(CORRECTION_ORCHESTRATION_ADMIN_PATTERN);
	});

	it("rejects CORRECTION entry type with non-admin source in pipeline", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-03-01",
				timestamp: Date.now(),
				debitAccountId: receivable._id,
				creditAccountId: control._id,
				amount: 100_000n,
				idempotencyKey: "seed-non-admin-rejection",
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "CORRECTION",
					effectiveDate: "2026-03-02",
					amount: 50_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					causedBy,
					reason: "System trying to correct",
					source: SYSTEM_SOURCE,
					idempotencyKey: "test-non-admin-correction",
				})
			).rejects.toThrow(CORRECTION_ADMIN_PATTERN);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-010: Missing Reason Rejection
// ═══════════════════════════════════════════════════════════════════

describe("T-010: Missing reason rejection", () => {
	it("rejects whitespace-only reason at orchestration layer", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-empty-reason-orchestration",
			source: SYSTEM_SOURCE,
		});

		await expect(
			t.run(async (ctx) => {
				return postCashCorrectionForEntry(ctx, {
					originalEntryId: original.entry._id,
					reason: "   \t  ",
					source: ADMIN_SOURCE,
					effectiveDate: "2026-03-02",
				});
			})
		).rejects.toThrow(CORRECTION_EMPTY_REASON_PATTERN);
	});

	it("rejects CORRECTION entry type without a reason", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const causedBy = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: 0n,
				entryType: "OBLIGATION_ACCRUED",
				effectiveDate: "2026-03-01",
				timestamp: Date.now(),
				debitAccountId: receivable._id,
				creditAccountId: control._id,
				amount: 100_000n,
				idempotencyKey: "seed-missing-reason",
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "CORRECTION",
					effectiveDate: "2026-03-02",
					amount: 50_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					causedBy,
					source: ADMIN_SOURCE,
					idempotencyKey: "test-missing-reason-correction",
				})
			).rejects.toThrow(CORRECTION_REASON_PATTERN);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-011: Replacement Exceeds Original Amount
// ═══════════════════════════════════════════════════════════════════

describe("T-011: Replacement exceeds original amount", () => {
	it("rejects replacement amount that exceeds original", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-exceeds-original",
			source: SYSTEM_SOURCE,
		});

		await t.run(async (ctx) => {
			await expect(
				postCashCorrectionForEntry(ctx, {
					originalEntryId: original.entry._id,
					reason: "Trying to increase amount",
					source: ADMIN_SOURCE,
					effectiveDate: "2026-03-02",
					replacement: {
						amount: 60_000,
						debitAccountId: receivable._id,
						creditAccountId: control._id,
						entryType: "OBLIGATION_ACCRUED",
					},
				})
			).rejects.toThrow(REPLACEMENT_EXCEEDS_PATTERN);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-012: Original Entry Immutability After Correction
// ═══════════════════════════════════════════════════════════════════

describe("T-012: Original entry immutability after correction", () => {
	it("does not modify the original entry after correction", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-immutability-original",
			source: SYSTEM_SOURCE,
		});

		// Snapshot all fields before correction
		const before = await t.run(async (ctx) => {
			return ctx.db.get(original.entry._id);
		});
		expect(before).not.toBeNull();

		// Run correction with replacement
		await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Immutability test",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
				replacement: {
					amount: 80_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					entryType: "OBLIGATION_ACCRUED",
				},
			});
		});

		// Re-read original and compare every key field
		const after = await t.run(async (ctx) => {
			return ctx.db.get(original.entry._id);
		});
		expect(after).not.toBeNull();

		expect(after?.entryType).toBe(before?.entryType);
		expect(after?.amount).toBe(before?.amount);
		expect(after?.debitAccountId).toBe(before?.debitAccountId);
		expect(after?.creditAccountId).toBe(before?.creditAccountId);
		expect(after?.effectiveDate).toBe(before?.effectiveDate);
		expect(after?.idempotencyKey).toBe(before?.idempotencyKey);
		expect(after?.source).toEqual(before?.source);
		expect(after?.reason).toBe(before?.reason);
		expect(after?.causedBy).toBe(before?.causedBy);
		expect(after?.postingGroupId).toBe(before?.postingGroupId);
		expect(after?.sequenceNumber).toBe(before?.sequenceNumber);
		expect(after?.timestamp).toBe(before?.timestamp);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-013: Correction Chain Auditability via causedBy Traversal
// ═══════════════════════════════════════════════════════════════════

describe("T-013: Correction chain auditability via causedBy traversal", () => {
	it("finds both reversal and replacement via by_caused_by index", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post entry A
		const entryA = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-audit-chain-original",
			source: SYSTEM_SOURCE,
		});

		// Correct A with replacement -> creates reversal B and replacement C
		await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: entryA.entry._id,
				reason: "Audit chain test",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
				replacement: {
					amount: 80_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					entryType: "OBLIGATION_ACCRUED",
				},
			});
		});

		// Query by_caused_by index for entryA's ID
		const causedByEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_caused_by", (q) => q.eq("causedBy", entryA.entry._id))
				.collect();
		});

		expect(causedByEntries).toHaveLength(2);

		const reversal = causedByEntries.find((e) => e.entryType === "REVERSAL");
		const replacement = causedByEntries.find(
			(e) => e.entryType === "OBLIGATION_ACCRUED"
		);

		expect(reversal).toBeDefined();
		expect(replacement).toBeDefined();
		expect(reversal?.causedBy).toBe(entryA.entry._id);
		expect(replacement?.causedBy).toBe(entryA.entry._id);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-014: postCashCorrectionForEntry Integration Helper (end-to-end)
// ═══════════════════════════════════════════════════════════════════

describe("T-014: postCashCorrectionForEntry integration helper", () => {
	it("returns correct shape and persists entries to the database", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		// Post original entry
		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-integration-helper-original",
			source: SYSTEM_SOURCE,
		});

		// Call integration helper with replacement
		const result = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Integration helper test",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
				replacement: {
					amount: 75_000,
					debitAccountId: receivable._id,
					creditAccountId: control._id,
					entryType: "OBLIGATION_ACCRUED",
					metadata: { correctionNote: "reduced amount" },
				},
			});
		});

		// Verify return shape
		expect(result.reversalEntry).toBeDefined();
		expect(result.reversalEntry._id).toBeDefined();
		expect(result.replacementEntry).not.toBeNull();
		expect(result.replacementEntry?._id).toBeDefined();
		expect(typeof result.postingGroupId).toBe("string");
		expect(result.postingGroupId).toMatch(
			CORRECTION_POSTING_GROUP_PREFIX_PATTERN
		);

		// Verify reversal persisted in DB
		const reversalInDb = await t.run(async (ctx) => {
			return ctx.db.get(result.reversalEntry._id);
		});
		expect(reversalInDb).not.toBeNull();
		expect(reversalInDb?.entryType).toBe("REVERSAL");
		expect(reversalInDb?.amount).toBe(100_000n);
		expect(reversalInDb?.effectiveDate).toBe("2026-03-02");
		expect(reversalInDb?.reason).toBe("Integration helper test");
		expect(reversalInDb?.causedBy).toBe(original.entry._id);
		// Source should be normalized — actorType and actorId preserved
		expect(reversalInDb?.source.actorType).toBe("admin");
		expect(reversalInDb?.source.actorId).toBe("admin-user-123");

		// Verify replacement persisted in DB
		const replacementRow = result.replacementEntry;
		expect(replacementRow).not.toBeNull();
		if (replacementRow === null) {
			throw new Error("expected replacement entry");
		}
		const replacementInDb = await t.run(async (ctx) => {
			return ctx.db.get(replacementRow._id);
		});
		expect(replacementInDb).not.toBeNull();
		expect(replacementInDb?.entryType).toBe("OBLIGATION_ACCRUED");
		expect(replacementInDb?.amount).toBe(75_000n);
		expect(replacementInDb?.effectiveDate).toBe("2026-03-02");
		expect(replacementInDb?.causedBy).toBe(original.entry._id);
		expect(replacementInDb?.metadata).toEqual({
			correctionNote: "reduced amount",
		});

		// Verify both entries reference same posting group
		expect(reversalInDb?.postingGroupId).toBe(result.postingGroupId);
		expect(replacementInDb?.postingGroupId).toBe(result.postingGroupId);
	});

	it("handles correction without replacement (simple reversal via helper)", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-integration-simple-reversal",
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Simple reversal via helper",
				source: ADMIN_SOURCE,
				effectiveDate: "2026-03-02",
			});
		});

		expect(result.reversalEntry).toBeDefined();
		expect(result.replacementEntry).toBeNull();
		expect(result.reversalEntry.amount).toBe(50_000n);
	});

	it("defaults effectiveDate to today when not provided", async () => {
		const t = createHarness(modules);

		const receivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			initialDebitBalance: 200_000n,
		});
		const control = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ACCRUAL",
		});

		const original = await postTestEntry(t, {
			entryType: "OBLIGATION_ACCRUED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: receivable._id,
			creditAccountId: control._id,
			idempotencyKey: "test-integration-default-date",
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: original.entry._id,
				reason: "Default date test",
				source: ADMIN_SOURCE,
			});
		});

		// effectiveDate should be a YYYY-MM-DD string (today's date)
		expect(result.reversalEntry.effectiveDate).toMatch(BUSINESS_DATE_PATTERN);
	});
});
