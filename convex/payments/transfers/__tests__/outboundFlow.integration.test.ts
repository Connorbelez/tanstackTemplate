/**
 * Integration tests for ENG-214 Chunk 4: Outbound & Multi-Leg Integration.
 *
 * T-015: Obligation settlement -> dispersal calculation -> outbound transfer
 *        creation -> LENDER_PAYOUT_SENT posting
 * T-016: Failed outbound transfer leaves LENDER_PAYABLE intact (no money lost)
 * T-017: Deal close Leg 1 success + Leg 2 failure -> trust-held state
 *        (TRUST_CASH holds funds)
 * T-018: Effect-level test — publishTransferConfirmed cash ledger posting
 *        and ledger-idempotency (public path tested in handlers.integration)
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import auditTrailSchema from "../../../components/auditTrail/schema";
import {
	publishTransferConfirmed,
	publishTransferFailed,
} from "../../../engine/effects/transfer";
import type { CommandSource } from "../../../engine/types";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
	workflowModules as sharedWorkflowModules,
	workpoolModules as sharedWorkpoolModules,
} from "../../../test/moduleMaps";
import { registerAuditLogComponent } from "../../../test/registerAuditLogComponent";

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
	actorId: "test-outbound-flow-admin",
	actorType: "admin" as const,
};

interface PublishTransferConfirmedHandler {
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

interface PublishTransferFailedHandler {
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
	publishTransferConfirmed as unknown as PublishTransferConfirmedHandler;
const publishTransferFailedMutation =
	publishTransferFailed as unknown as PublishTransferFailedHandler;

// ── Seed helpers ────────────────────────────────────────────────────

async function seedCoreEntities(t: TestHarness) {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `outbound-broker-${now}`,
			email: `outbound-broker-${now}@fairlend.test`,
			firstName: "Outbound",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `outbound-borrower-${now}`,
			email: `outbound-borrower-${now}@fairlend.test`,
			firstName: "Outbound",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const lenderUserId = await ctx.db.insert("users", {
			authId: `outbound-lender-${now}`,
			email: `outbound-lender-${now}@fairlend.test`,
			firstName: "Outbound",
			lastName: "Lender",
		});
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/outbound-lender",
			status: "active",
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "789 Outbound Flow Blvd",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 4D4",
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

		// Ownership ledger account (required for some posting paths)
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

let transferInsertCounter = 0;

async function insertTransfer(
	t: TestHarness,
	overrides: Record<string, unknown>
): Promise<Id<"transferRequests">> {
	transferInsertCounter += 1;
	return t.run(async (ctx) => {
		const base = {
			status: "initiated",
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: 50_000,
			currency: "CAD",
			counterpartyType: "lender",
			counterpartyId: "counterparty-default",
			providerCode: "manual",
			idempotencyKey: `outbound-flow-idem-${transferInsertCounter}-${Date.now()}`,
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
// T-015: Obligation settlement -> dispersal -> outbound transfer ->
//        LENDER_PAYOUT_SENT
// ══════════════════════════════════════════════════════════════════════

describe("T-015: obligation settlement -> dispersal -> outbound transfer -> LENDER_PAYOUT_SENT", () => {
	it("publishTransferConfirmed posts LENDER_PAYOUT_SENT with correct debit/credit for an outbound lender dispersal payout linked to a dispersal entry", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		// Pre-fund LENDER_PAYABLE (credit-normal: balance = credits - debits)
		// and TRUST_CASH (debit-normal: balance = debits - credits) so payout
		// posting doesn't trip the non-negative balance guard.
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

		// Seed an obligation + dispersal entry to model the full
		// settlement -> dispersal -> outbound transfer pipeline.
		const { obligationId, dispersalEntryId } = await t.run(async (ctx) => {
			const now = Date.now();

			const obligationId = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: now,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 100_000,
				dueDate: Date.parse("2026-02-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
				createdAt: now,
			});

			// Ownership ledger account is already seeded via seedCoreEntities.
			// We need its ID for the dispersalEntry.
			const lenderAccount = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage_and_lender", (q) =>
					q
						.eq("mortgageId", seeded.mortgageId as unknown as string)
						.eq("lenderId", `${seeded.lenderId}`)
				)
				.first();
			if (!lenderAccount) {
				throw new Error("Expected ledger_account to exist");
			}

			const dispersalEntryId = await ctx.db.insert("dispersalEntries", {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderId,
				lenderAccountId: lenderAccount._id,
				amount: 75_000,
				dispersalDate: "2026-03-01",
				obligationId,
				servicingFeeDeducted: 1000,
				status: "eligible",
				idempotencyKey: `dispersal-t015-${now}`,
				calculationDetails: {
					settledAmount: 100_000,
					servicingFee: 1000,
					distributableAmount: 99_000,
					ownershipUnits: 10_000,
					totalUnits: 10_000,
					ownershipFraction: 1.0,
					rawAmount: 75_000,
					roundedAmount: 75_000,
				},
				createdAt: now,
			});

			return { obligationId, dispersalEntryId };
		});

		// Create an outbound transfer linked to the dispersal entry
		const transferId = await insertTransfer(t, {
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: 75_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.lenderId}`,
			counterpartyType: "lender",
			dispersalEntryId,
			obligationId,
		});

		// Confirm the transfer — should post LENDER_PAYOUT_SENT
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t015-1",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Verify: LENDER_PAYOUT_SENT journal entry with correct accounts
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();

			expect(entries).toHaveLength(1);
			const entry = entries[0];
			expect(entry.entryType).toBe("LENDER_PAYOUT_SENT");
			expect(entry.amount).toBe(75_000n);

			// Debit: LENDER_PAYABLE (credit-normal account, debit reduces balance)
			const debitAccount = await ctx.db.get(entry.debitAccountId);
			expect(debitAccount?.family).toBe("LENDER_PAYABLE");
			expect(debitAccount?.mortgageId).toBe(seeded.mortgageId);
			expect(debitAccount?.lenderId).toBe(seeded.lenderId);

			// Credit: TRUST_CASH (debit-normal account, credit reduces balance)
			const creditAccount = await ctx.db.get(entry.creditAccountId);
			expect(creditAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.mortgageId).toBe(seeded.mortgageId);

			// Transfer should have settledAt set and link to dispersal entry
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.settledAt).toBeDefined();
			expect(transfer?.dispersalEntryId).toBe(dispersalEntryId);
			expect(transfer?.obligationId).toBe(obligationId);
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-016: Failed outbound transfer leaves LENDER_PAYABLE intact
// ══════════════════════════════════════════════════════════════════════

describe("T-016: failed outbound transfer leaves LENDER_PAYABLE intact (no money lost)", () => {
	it("publishTransferFailed does NOT create any cash ledger entry and records failure metadata", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		// Pre-create a LENDER_PAYABLE account with a known balance
		const lenderPayableId = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_accounts", {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderId,
				cumulativeDebits: 0n,
				cumulativeCredits: 100_000n, // credit-normal, balance = 100k
				createdAt: Date.now(),
			});
		});

		// Create an outbound transfer
		const transferId = await insertTransfer(t, {
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: 50_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			counterpartyId: `${seeded.lenderId}`,
			counterpartyType: "lender",
		});

		// Fail the transfer
		await t.run(async (ctx) => {
			await publishTransferFailedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "PROVIDER_DECLINED",
				journalEntryId: "audit-t016-1",
				effectName: "publishTransferFailed",
				payload: {
					errorCode: "INSUFFICIENT_BALANCE",
					reason: "Provider declined: insufficient balance in trust account",
				},
				source: SYSTEM_SOURCE,
			});
		});

		// Verify: NO cash_ledger_journal_entries created
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();

			expect(entries).toHaveLength(0);
		});

		// Verify: Transfer has failure metadata set
		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(transferId);
			expect(transfer).not.toBeNull();
			expect(transfer?.failedAt).toBeDefined();
			expect(transfer?.failureReason).toBe(
				"Provider declined: insufficient balance in trust account"
			);
			expect(transfer?.failureCode).toBe("INSUFFICIENT_BALANCE");
		});

		// Verify: LENDER_PAYABLE account balance unchanged
		await t.run(async (ctx) => {
			const account = await ctx.db.get(lenderPayableId);
			expect(account).not.toBeNull();
			// Credit-normal account: balance = credits - debits = 100k - 0 = 100k
			expect(account?.cumulativeDebits).toBe(0n);
			expect(account?.cumulativeCredits).toBe(100_000n);
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-017: Deal close Leg 1 success + Leg 2 failure -> trust-held state
// ══════════════════════════════════════════════════════════════════════

describe("T-017: deal close Leg 1 success + Leg 2 failure -> TRUST_CASH holds funds", () => {
	it("Leg 1 inbound confirmed posts CASH_RECEIVED, Leg 2 outbound failed posts nothing, TRUST_CASH retains funds, deal state unaffected", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const pipelineId = `deal-close-pipeline-${Date.now()}`;

		// Seed a deal so transfers exercise the deal -> transfer link.
		// A regression where Leg 2 failure still advances the deal to
		// `confirmed` would be caught by the deal-state assertion below.
		const dealId = await t.run(async (ctx) => {
			return ctx.db.insert("deals", {
				status: "active",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				buyerId: `${seeded.borrowerId}`,
				sellerId: `${seeded.lenderId}`,
				fractionalShare: 1,
				createdAt: Date.now(),
				createdBy: "test-t017-suite",
			});
		});

		// Create Leg 1: inbound deal_principal_transfer (buyer -> trust)
		const leg1TransferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "deal_principal_transfer",
			amount: 200_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			counterpartyId: `${seeded.borrowerId}`,
			counterpartyType: "borrower",
			pipelineId,
			legNumber: 1,
			dealId,
		});

		// Create Leg 2: outbound deal_seller_payout (trust -> seller/lender)
		const leg2TransferId = await insertTransfer(t, {
			direction: "outbound",
			transferType: "deal_seller_payout",
			amount: 200_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			counterpartyId: `${seeded.lenderId}`,
			counterpartyType: "lender",
			pipelineId,
			legNumber: 2,
			dealId,
		});

		// Confirm Leg 1 — should post CASH_RECEIVED (debit TRUST_CASH, credit CASH_CLEARING)
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: leg1TransferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t017-leg1",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Verify Leg 1 posted CASH_RECEIVED
		await t.run(async (ctx) => {
			const leg1Entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", leg1TransferId)
				)
				.collect();

			expect(leg1Entries).toHaveLength(1);
			expect(leg1Entries[0].entryType).toBe("CASH_RECEIVED");
			expect(leg1Entries[0].amount).toBe(200_000n);

			const debitAccount = await ctx.db.get(leg1Entries[0].debitAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");

			const creditAccount = await ctx.db.get(leg1Entries[0].creditAccountId);
			expect(creditAccount?.family).toBe("CASH_CLEARING");
		});

		// Fail Leg 2 — should NOT post any cash entry
		await t.run(async (ctx) => {
			await publishTransferFailedMutation._handler(ctx, {
				entityId: leg2TransferId,
				entityType: "transfer",
				eventType: "PROVIDER_DECLINED",
				journalEntryId: "audit-t017-leg2",
				effectName: "publishTransferFailed",
				payload: {
					errorCode: "NETWORK_ERROR",
					reason: "Provider unreachable during payout attempt",
				},
				source: SYSTEM_SOURCE,
			});
		});

		// Verify: NO cash entry for Leg 2
		await t.run(async (ctx) => {
			const leg2Entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", leg2TransferId)
				)
				.collect();

			expect(leg2Entries).toHaveLength(0);
		});

		// Verify: Leg 1's CASH_RECEIVED entry still exists (not reversed by Leg 2 failure)
		await t.run(async (ctx) => {
			const leg1Entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", leg1TransferId)
				)
				.collect();

			expect(leg1Entries).toHaveLength(1);
			expect(leg1Entries[0].entryType).toBe("CASH_RECEIVED");
		});

		// Verify: Both transfers queryable by pipelineId and linked to dealId
		await t.run(async (ctx) => {
			const pipelineTransfers = await ctx.db
				.query("transferRequests")
				.withIndex("by_pipeline", (q) => q.eq("pipelineId", pipelineId))
				.collect();

			expect(pipelineTransfers).toHaveLength(2);

			const leg1 = pipelineTransfers.find((t) => t.legNumber === 1);
			const leg2 = pipelineTransfers.find((t) => t.legNumber === 2);

			expect(leg1).toBeDefined();
			expect(leg1?._id).toBe(leg1TransferId);
			expect(leg1?.settledAt).toBeDefined();
			expect(leg1?.dealId).toBe(dealId);

			expect(leg2).toBeDefined();
			expect(leg2?._id).toBe(leg2TransferId);
			expect(leg2?.failedAt).toBeDefined();
			expect(leg2?.failureCode).toBe("NETWORK_ERROR");
			expect(leg2?.dealId).toBe(dealId);
		});

		// Verify: TRUST_CASH account has the funds from Leg 1 (debit-normal, so
		// debit increases balance). The Leg 2 failure means funds stay in trust.
		await t.run(async (ctx) => {
			const trustCashAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q.eq("family", "TRUST_CASH").eq("mortgageId", seeded.mortgageId)
				)
				.collect();

			expect(trustCashAccounts.length).toBeGreaterThanOrEqual(1);
			const trustCash = trustCashAccounts[0];
			// TRUST_CASH is debit-normal. Leg 1 debited it with 200k.
			// Since Leg 2 failed, no credit was applied — balance remains positive.
			expect(trustCash.cumulativeDebits).toBe(200_000n);
			expect(trustCash.cumulativeCredits).toBe(0n);
		});

		// Verify: Deal state remains "active" — Leg 2 failure must NOT advance
		// the deal to "confirmed" or any other terminal state.
		await t.run(async (ctx) => {
			const deal = await ctx.db.get(dealId);
			expect(deal).not.toBeNull();
			expect(deal?.status).toBe("active");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-018: Effect-level test — publishTransferConfirmed cash ledger posting
//
// NOTE: This test calls the publishTransferConfirmed effect handler
// directly, bypassing the public `confirmManualTransfer` mutation's
// provider/status guards and providerRef update. The public-path
// integration (initiate -> pending -> confirmManualTransfer -> confirmed)
// is covered in handlers.integration.test.ts. This test isolates the
// ledger posting logic and its idempotency at the effect layer.
// ══════════════════════════════════════════════════════════════════════

describe("T-018: effect-level publishTransferConfirmed -> LENDER_PAYOUT_SENT posting", () => {
	it("publishTransferConfirmed effect posts LENDER_PAYOUT_SENT with correct accounts and is ledger-idempotent", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		// Pre-fund LENDER_PAYABLE (credit-normal) and TRUST_CASH (debit-normal)
		// so payout posting doesn't trip the non-negative balance guard.
		await t.run(async (ctx) => {
			await ctx.db.insert("cash_ledger_accounts", {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderId,
				cumulativeDebits: 0n,
				cumulativeCredits: 100_000n,
				createdAt: Date.now(),
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
				cumulativeDebits: 100_000n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});
		});

		// Create a manual outbound transfer
		const transferId = await insertTransfer(t, {
			direction: "outbound",
			transferType: "lender_dispersal_payout",
			amount: 30_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.lenderId}`,
			counterpartyType: "lender",
		});

		// Invoke the effect handler directly (bypasses public confirmManualTransfer guards)
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t018-1",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		// Verify: LENDER_PAYOUT_SENT entry created
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();

			expect(entries).toHaveLength(1);
			const entry = entries[0];
			expect(entry.entryType).toBe("LENDER_PAYOUT_SENT");
			expect(entry.amount).toBe(30_000n);
			expect(entry.mortgageId).toBe(seeded.mortgageId);
			expect(entry.lenderId).toBe(seeded.lenderId);

			// Debit: LENDER_PAYABLE
			const debitAccount = await ctx.db.get(entry.debitAccountId);
			expect(debitAccount?.family).toBe("LENDER_PAYABLE");
			expect(debitAccount?.lenderId).toBe(seeded.lenderId);

			// Credit: TRUST_CASH
			const creditAccount = await ctx.db.get(entry.creditAccountId);
			expect(creditAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.mortgageId).toBe(seeded.mortgageId);
		});

		// Verify: Transfer has settledAt set
		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.settledAt).toBeDefined();
		});

		// Verify: Ledger-level idempotency — calling the effect again does NOT
		// create a second cash entry. Note: the public confirmManualTransfer
		// rejects already-confirmed transfers; this tests the deeper
		// postCashEntryInternal idempotency guard.
		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t018-idempotent",
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

			// Still only 1 entry thanks to idempotency
			expect(entries).toHaveLength(1);
		});
	});
});
