/**
 * Financial property tests and regression for ENG-214 Chunk 5.
 *
 * T-019: Property — sum of rounded dispersal outputs = distributable amount
 *        (rounding invariant via largest-remainder method)
 * T-020: Property — one transfer confirmation = exactly one ledger posting
 *        (no duplicates)
 * T-021: Property — replayed webhook = zero additional postings
 *        (idempotency invariant)
 * T-022: Property — reversal net effect = zero across original + compensating
 *        postings
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { registerAuditLogComponent } from "../../../../src/test/convex/registerAuditLogComponent";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { calculateProRataShares } from "../../../accrual/interestMath";
import auditTrailSchema from "../../../components/auditTrail/schema";
import {
	publishTransferConfirmed,
	publishTransferReversed,
} from "../../../engine/effects/transfer";
import type { CommandSource } from "../../../engine/types";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
	workflowModules as sharedWorkflowModules,
	workpoolModules as sharedWorkpoolModules,
} from "../../../test/moduleMaps";
import { postObligationAccrued } from "../../cashLedger/integrations";

// ── Module globs ────────────────────────────────────────────────────

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;
const workflowModules = sharedWorkflowModules;
const workpoolModules = sharedWorkpoolModules;

// ── Test harness ────────────────────────────────────────────────────

type TestHarness = ReturnType<typeof createFullHarness>;

function createFullHarness() {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

// ── Handler type casts ──────────────────────────────────────────────

const SYSTEM_SOURCE: CommandSource = {
	channel: "admin_dashboard" as const,
	actorId: "test-financial-properties-admin",
	actorType: "admin" as const,
};

interface TransferEffectHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"transferRequests">;
			entityType: "transfer";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<void>;
}

const publishTransferConfirmedMutation =
	publishTransferConfirmed as unknown as TransferEffectHandler;
const publishTransferReversedMutation =
	publishTransferReversed as unknown as TransferEffectHandler;

// ── Seed helpers ────────────────────────────────────────────────────

async function seedCoreEntities(t: TestHarness) {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `fin-prop-broker-${now}`,
			email: `fin-prop-broker-${now}@fairlend.test`,
			firstName: "FinProp",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `fin-prop-borrower-${now}`,
			email: `fin-prop-borrower-${now}@fairlend.test`,
			firstName: "FinProp",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const lenderUserId = await ctx.db.insert("users", {
			authId: `fin-prop-lender-${now}`,
			email: `fin-prop-lender-${now}@fairlend.test`,
			firstName: "FinProp",
			lastName: "Lender",
		});
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/fin-prop-lender",
			status: "active",
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "100 Financial Property Ln",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 5E5",
			propertyType: "residential",
			createdAt: now,
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			annualServicingRate: 0.01,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
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

		// Ownership ledger account (required for posting paths)
		await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: `${lenderId}`,
			cumulativeDebits: 10000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: now,
		});

		return { borrowerId, brokerId, lenderId, mortgageId, propertyId };
	});
}

async function createDueObligationWithAccrual(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		paymentNumber?: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: args.paymentNumber ?? 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});

		return obligationId;
	});
}

let transferInsertCounter = 0;

async function insertTransfer(
	t: TestHarness,
	overrides: Record<string, unknown>
): Promise<Id<"transferRequests">> {
	transferInsertCounter += 1;
	return t.run(async (ctx) => {
		const base = {
			status: "initiated",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 50_000,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: "counterparty-default",
			providerCode: "manual",
			idempotencyKey: `fin-prop-idem-${transferInsertCounter}-${Date.now()}`,
			source: SYSTEM_SOURCE,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		};

		return ctx.db.insert("transferRequests", {
			...base,
			...overrides,
		} as Parameters<typeof ctx.db.insert<"transferRequests">>[1]);
	});
}

// ══════════════════════════════════════════════════════════════════════
// T-019: Property — sum of rounded dispersal outputs = distributable amount
// ══════════════════════════════════════════════════════════════════════

describe("T-019: dispersal rounding invariant — sum of shares equals distributable amount", () => {
	/**
	 * The production code in `calculateProRataShares` (interestMath.ts) uses
	 * the largest-remainder method:
	 *
	 * 1. rawAmount = (distributableAmount * position.units) / totalUnits
	 * 2. amount = Math.floor(rawAmount + 1e-9)  (epsilon-guard for FP noise)
	 * 3. Remainder cents distributed largest-remainder-first, breaking ties
	 *    by units (descending) then original index (ascending).
	 *
	 * This test exercises the real `calculateProRataShares` function directly
	 * with various share configurations to prove the rounding invariant:
	 * sum(share.amount) === distributableAmount for all valid inputs.
	 */

	// Helper to create positions with fake IDs (pure math test, IDs are
	// irrelevant but required by the interface)
	function makePositions(unitsList: number[]) {
		return unitsList.map((units, i) => ({
			units,
			lenderAccountId: `fake-account-${i}` as Id<"ledger_accounts">,
			lenderId: `fake-lender-${i}` as Id<"lenders">,
		}));
	}

	function assertRoundingInvariant(
		distributableAmount: number,
		unitsList: number[],
		label: string
	) {
		const positions = makePositions(unitsList);
		const shares = calculateProRataShares(positions, distributableAmount);
		const totalAllocated = shares.reduce((sum, s) => sum + s.amount, 0);
		expect(totalAllocated, `${label}: total allocated`).toBe(
			distributableAmount
		);

		// Each share amount must be non-negative
		for (const share of shares) {
			expect(
				share.amount,
				`${label}: non-negative share`
			).toBeGreaterThanOrEqual(0);
		}
	}

	it("3 lenders with equal shares (33.33% each), 100 cents", () => {
		// 3333 units each out of 9999 total
		assertRoundingInvariant(100, [3333, 3333, 3333], "equal-3-100c");
	});

	it("2 lenders 50/50, even amount", () => {
		assertRoundingInvariant(200, [5000, 5000], "50-50-200c");
	});

	it("4 lenders uneven (40/30/20/10), various amounts", () => {
		assertRoundingInvariant(1000, [4000, 3000, 2000, 1000], "uneven-4-1000c");
		assertRoundingInvariant(999, [4000, 3000, 2000, 1000], "uneven-4-999c");
		assertRoundingInvariant(1, [4000, 3000, 2000, 1000], "uneven-4-1c");
		assertRoundingInvariant(7, [4000, 3000, 2000, 1000], "uneven-4-7c");
	});

	it("edge case: 1 cent with 3 lenders", () => {
		assertRoundingInvariant(1, [3333, 3333, 3334], "1c-3-lenders");
	});

	it("edge case: 0 cents", () => {
		assertRoundingInvariant(0, [5000, 5000], "0c-2-lenders");
	});

	it("large: $100,000 (10,000,000 cents) with 7 lenders", () => {
		assertRoundingInvariant(
			10_000_000,
			[2500, 2000, 1500, 1200, 1000, 900, 900],
			"large-7-lenders"
		);
	});

	it("worst-case remainder: N lenders where N > distributable amount", () => {
		// 5 lenders sharing 3 cents — only 3 should get 1 cent each
		assertRoundingInvariant(3, [2000, 2000, 2000, 2000, 2000], "3c-5-lenders");
	});

	it("single lender gets full amount", () => {
		assertRoundingInvariant(12_345, [10_000], "single-lender");
	});

	it("prime distribution", () => {
		// 97 cents across 3 lenders with varying shares
		assertRoundingInvariant(97, [5000, 3000, 2000], "prime-97c");
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-020: One confirmation = exactly one ledger posting (no duplicates)
// ══════════════════════════════════════════════════════════════════════

describe("T-020: one transfer confirmation = exactly one ledger posting", () => {
	it("inbound: publishTransferConfirmed creates exactly 1 cash_ledger_journal_entry", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 45_000,
		});

		const transferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 45_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t020-inbound",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();

			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("CASH_RECEIVED");
			expect(entries[0].amount).toBe(45_000n);
		});
	});

	it("outbound: publishTransferConfirmed creates exactly 1 cash_ledger_journal_entry", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		// Pre-fund LENDER_PAYABLE and TRUST_CASH
		await t.run(async (ctx) => {
			await ctx.db.insert("cash_ledger_accounts", {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderId,
				cumulativeDebits: 0n,
				cumulativeCredits: 200_000n,
				createdAt: Date.now(),
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
				cumulativeDebits: 200_000n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});
		});

		const transferId = await insertTransfer(t, {
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: 60_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.lenderId}`,
			counterpartyType: "lender",
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t020-outbound",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();

			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("LENDER_PAYOUT_SENT");
			expect(entries[0].amount).toBe(60_000n);
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-021: Replayed webhook = zero additional postings (idempotency)
// ══════════════════════════════════════════════════════════════════════

describe("T-021: replayed webhook = zero additional postings (idempotency invariant)", () => {
	it("inbound: second publishTransferConfirmed does not create a second cash entry", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 70_000,
		});

		const transferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 70_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
		});

		// First confirmation — should create 1 entry
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t021-first",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Verify 1 entry after first call
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();
			expect(entries).toHaveLength(1);
		});

		// Second confirmation (replay) — idempotency key should prevent duplicate
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t021-replay",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Verify still exactly 1 entry — no duplicate created
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();
			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("CASH_RECEIVED");
		});
	});

	it("outbound: second publishTransferConfirmed does not create a second cash entry", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		// Pre-fund LENDER_PAYABLE and TRUST_CASH
		await t.run(async (ctx) => {
			await ctx.db.insert("cash_ledger_accounts", {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderId,
				cumulativeDebits: 0n,
				cumulativeCredits: 200_000n,
				createdAt: Date.now(),
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
				cumulativeDebits: 200_000n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});
		});

		const transferId = await insertTransfer(t, {
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: 55_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.lenderId}`,
			counterpartyType: "lender",
		});

		// First confirmation
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t021-out-first",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Second confirmation (replay)
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t021-out-replay",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Verify still exactly 1 entry
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();
			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("LENDER_PAYOUT_SENT");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-022: Reversal net effect = zero across original + compensating postings
// ══════════════════════════════════════════════════════════════════════

describe("T-022: reversal net effect = zero across original + compensating postings", () => {
	it("inbound CASH_RECEIVED + REVERSAL nets to zero on both accounts", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 90_000,
		});

		const transferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 90_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
		});

		// Step 1: Confirm the transfer -> CASH_RECEIVED entry
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t022-confirm",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Step 2: Reverse the transfer -> REVERSAL entry (swapped accounts)
		await t.run(async (ctx) => {
			await publishTransferReversedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "TRANSFER_REVERSED",
				journalEntryId: "audit-t022-reverse",
				effectName: "publishTransferReversed",
				payload: {
					reversalRef: "REV-TEST-001",
					reason: "test reversal for property check",
				},
				source: SYSTEM_SOURCE,
			});
		});

		// Step 3: Verify net effect = zero
		await t.run(async (ctx) => {
			// Should now have 2 entries: CASH_RECEIVED + REVERSAL
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();

			expect(entries).toHaveLength(2);

			const cashReceived = entries.find((e) => e.entryType === "CASH_RECEIVED");
			const reversal = entries.find((e) => e.entryType === "REVERSAL");
			expect(cashReceived).toBeDefined();
			expect(reversal).toBeDefined();

			if (!(cashReceived && reversal)) {
				throw new Error("Missing entries");
			}

			// REVERSAL should have the same amount
			expect(reversal.amount).toBe(cashReceived.amount);

			// REVERSAL should have swapped debit/credit accounts
			expect(reversal.debitAccountId).toBe(cashReceived.creditAccountId);
			expect(reversal.creditAccountId).toBe(cashReceived.debitAccountId);

			// REVERSAL should reference the original via causedBy
			expect(reversal.causedBy).toBe(cashReceived._id);

			// Verify net zero: for each account involved, the confirm added
			// to one side (debit or credit) and the reversal added the same
			// amount to the opposite side, producing a net balance change of zero.
			//
			// CASH_RECEIVED:   debit TRUST_CASH 90k, credit BORROWER_RECEIVABLE 90k
			// REVERSAL:        debit BORROWER_RECEIVABLE 90k, credit TRUST_CASH 90k
			//
			// TRUST_CASH cumulative:   debits += 90k (confirm), credits += 90k (reversal) -> net 0
			// BORROWER_RECEIVABLE:     credits += 90k (confirm), debits += 90k (reversal) -> net 0

			const trustCashAccount = await ctx.db.get(cashReceived.debitAccountId);
			if (!trustCashAccount) {
				throw new Error("TRUST_CASH not found");
			}

			// TRUST_CASH: confirm debited 90k, reversal credited 90k.
			// Net balance movement = delta_debits - delta_credits = 0.
			// We verify the cumulative changes from both operations are symmetric.
			// The accrual (postObligationAccrued) may have created the initial
			// accounts with pre-existing balances, so we compare the deltas
			// from both journal entries rather than absolute values.
			// Both entries target TRUST_CASH: one as debit, one as credit, same amount.
			expect(cashReceived.amount).toBe(reversal.amount);

			const borrowerReceivableAccount = await ctx.db.get(
				cashReceived.creditAccountId
			);
			if (!borrowerReceivableAccount) {
				throw new Error("BORROWER_RECEIVABLE not found");
			}

			// For TRUST_CASH: net cumulative change = debits_added - credits_added
			// confirm: +90k debits, reversal: +90k credits => net = 0
			// We can verify by checking that cumulativeDebits - cumulativeCredits
			// changed by exactly 0 relative to the pre-transfer state.
			// Since TRUST_CASH was created by postObligationAccrued, it started
			// at some baseline. The confirm added 90k debits and the reversal
			// added 90k credits, so net is 0.
			// trustCash: debits = baseline + 90k, credits = baseline_credits + 90k
			// balance_change = (baseline + 90k - baseline_credits - 90k) - (baseline - baseline_credits) = 0

			// Verify symmetry: TRUST_CASH got exactly 1 debit and 1 credit of equal amounts
			const trustCashDebited = entries.filter(
				(e) => e.debitAccountId === trustCashAccount._id
			);
			const trustCashCredited = entries.filter(
				(e) => e.creditAccountId === trustCashAccount._id
			);
			expect(trustCashDebited).toHaveLength(1);
			expect(trustCashCredited).toHaveLength(1);
			expect(trustCashDebited[0].amount).toBe(trustCashCredited[0].amount);

			// Verify symmetry: BORROWER_RECEIVABLE got exactly 1 credit and 1 debit of equal amounts
			const brDebited = entries.filter(
				(e) => e.debitAccountId === borrowerReceivableAccount._id
			);
			const brCredited = entries.filter(
				(e) => e.creditAccountId === borrowerReceivableAccount._id
			);
			expect(brDebited).toHaveLength(1);
			expect(brCredited).toHaveLength(1);
			expect(brDebited[0].amount).toBe(brCredited[0].amount);

			// Final check: transfer has reversedAt set
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.reversedAt).toBeDefined();
			expect(transfer?.reversalRef).toBe("REV-TEST-001");
		});
	});
});
