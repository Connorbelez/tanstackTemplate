import { describe, expect, it } from "vitest";
import { registerAuditLogComponent } from "../../../../src/test/convex/registerAuditLogComponent";
import type { Doc, Id } from "../../../_generated/dataModel";
import { convexModules } from "../../../test/moduleMaps";
import { findCashAccount, getOrCreateCashAccount } from "../accounts";
import {
	postPaymentReversalCascade,
	postSettlementAllocation,
	postTransferReversal,
} from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import { getPostingGroupSummary } from "../postingGroups";
import { buildIdempotencyKey } from "../types";
import {
	createHarness,
	createSettledObligation,
	SYSTEM_SOURCE,
	type TestHarness,
} from "./testUtils";

const modules = convexModules;

// ── Regex patterns (top-level for Biome useTopLevelRegex) ───────────
const REVERSAL_EXCEEDS_ORIGINAL_PATTERN = /REVERSAL_EXCEEDS_ORIGINAL/;

// ── Amount constants ────────────────────────────────────────────────
const TOTAL_AMOUNT = 100_000;
const LENDER_A_AMOUNT = 54_000;
const LENDER_B_AMOUNT = 36_000;
const SERVICING_FEE_AMOUNT = 10_000;

// ── Shared Setup Helper ─────────────────────────────────────────────
// Builds the full settlement + allocation state needed for reversal cascade tests.
// Returns all IDs and entries required by individual test cases.

interface SettlementState {
	attemptId: Id<"collectionAttempts">;
	borrowerId: Id<"borrowers">;
	cashReceivedEntry: Doc<"cash_ledger_journal_entries">;
	dispersalEntryAId: Id<"dispersalEntries">;
	dispersalEntryBId: Id<"dispersalEntries">;
	lenderAId: Id<"lenders">;
	lenderBId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
}

async function setupFullSettlementState(
	t: TestHarness
): Promise<SettlementState> {
	// 1. Seed entities
	const { borrowerId, lenderAId, lenderBId, mortgageId } = await t.run(
		async (ctx) => {
			const now = Date.now();

			// Broker
			const brokerUserId = await ctx.db.insert("users", {
				authId: `broker-rev-${now}`,
				email: `broker-rev-${now}@fairlend.test`,
				firstName: "Broker",
				lastName: "Tester",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: brokerUserId,
				createdAt: now,
			});

			// Borrower
			const borrowerUserId = await ctx.db.insert("users", {
				authId: `borrower-rev-${now}`,
				email: `borrower-rev-${now}@fairlend.test`,
				firstName: "Borrower",
				lastName: "Tester",
			});
			const borrowerId = await ctx.db.insert("borrowers", {
				status: "active",
				userId: borrowerUserId,
				createdAt: now,
			});

			// Lender A
			const lenderAUserId = await ctx.db.insert("users", {
				authId: `rev-lender-a-${now}`,
				email: `rev-lender-a-${now}@fairlend.test`,
				firstName: "Lender",
				lastName: "A",
			});
			const lenderAId = await ctx.db.insert("lenders", {
				userId: lenderAUserId,
				brokerId,
				accreditationStatus: "accredited",
				onboardingEntryPath: "/tests/rev-lender-a",
				status: "active",
				createdAt: now,
			});

			// Lender B
			const lenderBUserId = await ctx.db.insert("users", {
				authId: `rev-lender-b-${now}`,
				email: `rev-lender-b-${now}@fairlend.test`,
				firstName: "Lender",
				lastName: "B",
			});
			const lenderBId = await ctx.db.insert("lenders", {
				userId: lenderBUserId,
				brokerId,
				accreditationStatus: "accredited",
				onboardingEntryPath: "/tests/rev-lender-b",
				status: "active",
				createdAt: now,
			});

			// Property
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "999 Reversal Test Blvd",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V 2T1",
				propertyType: "residential",
				createdAt: now,
			});

			// Mortgage
			const mortgageId = await ctx.db.insert("mortgages", {
				status: "active",
				propertyId,
				principal: 10_000_000,
				annualServicingRate: 0.01,
				interestRate: 0.08,
				rateType: "fixed",
				termMonths: 12,
				amortizationMonths: 12,
				paymentAmount: TOTAL_AMOUNT,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-01-01",
				termStartDate: "2026-01-01",
				maturityDate: "2026-12-01",
				firstPaymentDate: "2026-02-01",
				brokerOfRecordId: brokerId,
				createdAt: now,
			});

			// Ownership ledger accounts
			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId,
				lenderId: lenderAId as unknown as string,
				cumulativeDebits: 6000n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: now,
			});
			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId,
				lenderId: lenderBId as unknown as string,
				cumulativeDebits: 4000n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: now,
			});

			return { borrowerId, lenderAId, lenderBId, mortgageId };
		}
	);

	// 2. Create settled obligation
	const obligationId = await createSettledObligation(t, {
		mortgageId,
		borrowerId,
		amount: TOTAL_AMOUNT,
	});

	// 3. Create collectionPlanEntry + collectionAttempt
	const attemptId = await t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId,
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
			mortgageId,
			obligationIds: [obligationId],
			method: "manual",
			amount: TOTAL_AMOUNT,
			initiatedAt: Date.now() - 60_000,
			settledAt: Date.now(),
		});
	});

	// 4. Create dispersalEntry records (one per lender)
	const { dispersalEntryAId, dispersalEntryBId } = await t.run(async (ctx) => {
		// We need ledger_account IDs for dispersalEntry
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

		return {
			dispersalEntryAId,
			dispersalEntryBId,
		};
	});

	// 5. Post CASH_RECEIVED via postCashEntryInternal
	const cashReceivedResult = await t.run(async (ctx) => {
		const trustCash = await getOrCreateCashAccount(ctx, {
			family: "TRUST_CASH",
			mortgageId,
		});
		const borrowerReceivable = await findCashAccount(ctx.db, {
			family: "BORROWER_RECEIVABLE",
			mortgageId,
			obligationId,
		});
		if (!borrowerReceivable) {
			throw new Error("BORROWER_RECEIVABLE not found");
		}

		return postCashEntryInternal(ctx, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: TOTAL_AMOUNT,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: buildIdempotencyKey("cash-received", attemptId as string),
			mortgageId,
			obligationId,
			attemptId,
			borrowerId,
			postingGroupId: `receipt:${obligationId}`,
			source: SYSTEM_SOURCE,
		});
	});

	// 6. Post allocation entries (LENDER_PAYABLE_CREATED x2 + SERVICING_FEE_RECOGNIZED)
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
		mortgageId,
		borrowerId,
		lenderAId,
		lenderBId,
		obligationId,
		attemptId,
		dispersalEntryAId,
		dispersalEntryBId,
		cashReceivedEntry: cashReceivedResult.entry,
	};
}

// Posts LENDER_PAYOUT_SENT for both lenders
async function postPayoutsForBothLenders(
	t: TestHarness,
	state: SettlementState
) {
	await t.run(async (ctx) => {
		// Lender A payout
		const lenderPayableA = await findCashAccount(ctx.db, {
			family: "LENDER_PAYABLE",
			mortgageId: state.mortgageId,
			lenderId: state.lenderAId,
		});
		const trustCash = await findCashAccount(ctx.db, {
			family: "TRUST_CASH",
			mortgageId: state.mortgageId,
		});
		if (!(lenderPayableA && trustCash)) {
			throw new Error("Required accounts not found for payout");
		}

		await postCashEntryInternal(ctx, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: "2026-03-05",
			amount: LENDER_A_AMOUNT,
			debitAccountId: lenderPayableA._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey(
				"lender-payout-sent",
				state.dispersalEntryAId as string,
				state.lenderAId as string
			),
			mortgageId: state.mortgageId,
			obligationId: state.obligationId,
			lenderId: state.lenderAId,
			dispersalEntryId: state.dispersalEntryAId,
			source: SYSTEM_SOURCE,
		});

		// Lender B payout
		const lenderPayableB = await findCashAccount(ctx.db, {
			family: "LENDER_PAYABLE",
			mortgageId: state.mortgageId,
			lenderId: state.lenderBId,
		});
		if (!lenderPayableB) {
			throw new Error("LENDER_PAYABLE B not found");
		}

		await postCashEntryInternal(ctx, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: "2026-03-05",
			amount: LENDER_B_AMOUNT,
			debitAccountId: lenderPayableB._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey(
				"lender-payout-sent",
				state.dispersalEntryBId as string,
				state.lenderBId as string
			),
			mortgageId: state.mortgageId,
			obligationId: state.obligationId,
			lenderId: state.lenderBId,
			dispersalEntryId: state.dispersalEntryBId,
			source: SYSTEM_SOURCE,
		});
	});
}

// ═══════════════════════════════════════════════════════════════════
// T-006: Full reversal cascade (no payouts)
// ═══════════════════════════════════════════════════════════════════

describe("T-006: Full reversal cascade", () => {
	it("reverses cash received + allocation entries with clawbackRequired false", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF reversal test",
			});
		});

		expect(result.clawbackRequired).toBe(false);

		// All returned entries should be REVERSAL type
		for (const entry of result.reversalEntries) {
			expect(entry.entryType).toBe("REVERSAL");
		}

		// At least 4 entries: 1 cash received + 2 lender payable + 1 servicing fee
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(4);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-007: Cascade with clawback
// ═══════════════════════════════════════════════════════════════════

describe("T-007: Cascade with clawback", () => {
	it("includes payout reversal entries and sets clawbackRequired true", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		// Post payouts for both lenders
		await postPayoutsForBothLenders(t, state);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF clawback test",
			});
		});

		expect(result.clawbackRequired).toBe(true);

		// All entries are REVERSAL
		for (const entry of result.reversalEntries) {
			expect(entry.entryType).toBe("REVERSAL");
		}

		// Should have more entries than T-006 (base 4 + 2 payout clawbacks = 6)
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(6);

		// Verify payout clawback entries exist via idempotencyKey pattern
		const clawbackEntries = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		expect(clawbackEntries.length).toBe(2);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-008: Cascade without clawback
// ═══════════════════════════════════════════════════════════════════

describe("T-008: Cascade without clawback", () => {
	it("produces only base reversal entries when no payouts have been sent", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "NSF no-clawback test",
			});
		});

		expect(result.clawbackRequired).toBe(false);

		// No payout clawback entries
		const clawbackEntries = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		expect(clawbackEntries.length).toBe(0);

		// Only base entries (cash received reversal + lender payable reversals + servicing fee reversal)
		expect(result.reversalEntries.length).toBe(4);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-009: Idempotency
// ═══════════════════════════════════════════════════════════════════

describe("T-009: Idempotency", () => {
	it("returns the same entries on repeated cascade calls", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		// First call
		const first = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "Idempotency test",
			});
		});

		// Second call with same args
		const second = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "Idempotency test",
			});
		});

		// Same number of entries
		expect(second.reversalEntries.length).toBe(first.reversalEntries.length);

		// Same entry IDs
		const firstIds = first.reversalEntries.map((e) => e._id).sort();
		const secondIds = second.reversalEntries.map((e) => e._id).sort();
		expect(secondIds).toEqual(firstIds);

		// Same posting group
		expect(second.postingGroupId).toBe(first.postingGroupId);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-010: Amount validation via assertReversalAmountValid
// ═══════════════════════════════════════════════════════════════════

describe("T-010: Amount validation via assertReversalAmountValid", () => {
	it("rejects postTransferReversal when amount exceeds original", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		// Create a transfer request
		const transferRequestId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("transferRequests", {
				status: "reversed",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: TOTAL_AMOUNT,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: "test-borrower",
				providerCode: "manual",
				idempotencyKey: `test-reversal-amount-${now}`,
				source: SYSTEM_SOURCE,
				mortgageId: state.mortgageId,
				reversedAt: now,
				createdAt: now,
				lastTransitionAt: now,
			});
		});

		// Post a transfer-backed CASH_RECEIVED entry (with transferRequestId)
		// so postTransferReversal doesn't reject with NOT_A_TRANSFER_ENTRY
		const transferBackedEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: state.mortgageId,
			});
			const borrowerReceivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
			});
			if (!borrowerReceivable) {
				throw new Error("BORROWER_RECEIVABLE not found");
			}

			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: TOTAL_AMOUNT,
				debitAccountId: trustCash._id,
				creditAccountId: borrowerReceivable._id,
				idempotencyKey: buildIdempotencyKey(
					"cash-received",
					"transfer",
					transferRequestId as string
				),
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				transferRequestId,
				borrowerId: state.borrowerId,
				source: SYSTEM_SOURCE,
			});
		});

		await expect(
			t.run(async (ctx) => {
				return postTransferReversal(ctx, {
					transferRequestId,
					originalEntryId: transferBackedEntry.entry._id,
					amount: TOTAL_AMOUNT + 1, // exceeds original
					effectiveDate: "2026-03-10",
					source: SYSTEM_SOURCE,
					reason: "Amount exceeds test",
				});
			})
		).rejects.toThrow(REVERSAL_EXCEEDS_ORIGINAL_PATTERN);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-011: causedBy linkage
// ═══════════════════════════════════════════════════════════════════

describe("T-011: causedBy linkage", () => {
	it("every reversal entry has causedBy pointing to a valid original entry", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "causedBy linkage test",
			});
		});

		// Every reversal entry must have causedBy set
		for (const entry of result.reversalEntries) {
			expect(entry.causedBy).toBeDefined();
		}

		// Load each causedBy target and verify it exists with expected original type
		const expectedOriginalTypes = new Set([
			"CASH_RECEIVED",
			"LENDER_PAYABLE_CREATED",
			"SERVICING_FEE_RECOGNIZED",
		]);

		await t.run(async (ctx) => {
			for (const entry of result.reversalEntries) {
				const causedById = entry.causedBy;
				if (!causedById) {
					throw new Error(`Reversal entry ${entry._id} missing causedBy`);
				}
				const original = await ctx.db.get(causedById);
				if (!original) {
					throw new Error(`Original entry ${causedById} not found`);
				}
				expect(expectedOriginalTypes.has(original.entryType)).toBe(true);
			}
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-012: Posting group integrity
// ═══════════════════════════════════════════════════════════════════

describe("T-012: Posting group integrity", () => {
	it("allocation + reversal posting groups net to zero CONTROL:ALLOCATION balance", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: state.attemptId,
				obligationId: state.obligationId,
				mortgageId: state.mortgageId,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "Posting group integrity test",
			});
		});

		// All entries share the same postingGroupId
		for (const entry of result.reversalEntries) {
			expect(entry.postingGroupId).toBe(result.postingGroupId);
		}

		// The reversal posting group reverses the allocation entries, so its
		// CONTROL:ALLOCATION balance is the negative of the original allocation
		// posting group. Verify the two posting groups net to zero when combined.
		const reversalSummary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, result.postingGroupId);
		});

		const allocationSummary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, `allocation:${state.obligationId}`);
		});

		expect(reversalSummary.hasCorruptEntries).toBe(false);
		expect(allocationSummary.hasCorruptEntries).toBe(false);
		expect(reversalSummary.totalJournalEntryCount).toBeGreaterThan(0);
		expect(allocationSummary.totalJournalEntryCount).toBeGreaterThan(0);

		// Combined balance across both posting groups should be zero
		const combinedBalance =
			allocationSummary.controlAllocationBalance +
			reversalSummary.controlAllocationBalance;
		expect(combinedBalance).toBe(0n);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-013: postTransferReversal single-entry
// ═══════════════════════════════════════════════════════════════════

describe("T-013: postTransferReversal single-entry", () => {
	it("creates a REVERSAL entry with swapped accounts and correct linkage", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await setupFullSettlementState(t);

		// Create a transfer request linked to the cash received entry
		const transferRequestId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("transferRequests", {
				status: "reversed",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: TOTAL_AMOUNT,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: "test-borrower",
				providerCode: "manual",
				idempotencyKey: `test-reversal-linkage-${now}`,
				source: SYSTEM_SOURCE,
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				borrowerId: state.borrowerId,
				reversedAt: now,
				createdAt: now,
				lastTransitionAt: now,
			});
		});

		// Post a transfer-backed CASH_RECEIVED entry (with transferRequestId)
		// so postTransferReversal doesn't reject with NOT_A_TRANSFER_ENTRY
		const transferBackedEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: state.mortgageId,
			});
			const borrowerReceivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
			});
			if (!borrowerReceivable) {
				throw new Error("BORROWER_RECEIVABLE not found");
			}

			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: TOTAL_AMOUNT,
				debitAccountId: trustCash._id,
				creditAccountId: borrowerReceivable._id,
				idempotencyKey: buildIdempotencyKey(
					"cash-received",
					"transfer",
					transferRequestId as string
				),
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				transferRequestId,
				borrowerId: state.borrowerId,
				source: SYSTEM_SOURCE,
			});
		});

		const result = await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId,
				originalEntryId: transferBackedEntry.entry._id,
				amount: TOTAL_AMOUNT,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "Transfer reversal test",
			});
		});

		// Verify entry type is REVERSAL
		expect(result.entry.entryType).toBe("REVERSAL");

		// Verify accounts are swapped from original
		expect(result.entry.debitAccountId).toBe(
			transferBackedEntry.entry.creditAccountId
		);
		expect(result.entry.creditAccountId).toBe(
			transferBackedEntry.entry.debitAccountId
		);

		// Verify causedBy points to original
		expect(result.entry.causedBy).toBe(transferBackedEntry.entry._id);

		// Verify transferRequestId is set
		expect(result.entry.transferRequestId).toBe(transferRequestId);

		// Verify idempotencyKey follows expected pattern
		const expectedKey = buildIdempotencyKey(
			"reversal",
			"transfer",
			transferRequestId as string
		);
		expect(result.entry.idempotencyKey).toBe(expectedKey);

		// Verify amount matches
		expect(result.entry.amount).toBe(BigInt(TOTAL_AMOUNT));
	});
});
