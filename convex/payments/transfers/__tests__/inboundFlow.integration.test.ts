/**
 * Integration tests for ENG-214 Chunk 3: Inbound Collection Flow.
 *
 * T-012: Manual inbound transfer (non-bridged) -> cash ledger CASH_RECEIVED
 *        posting with correct accounts
 * T-013: Bridge transfer D4 conditional — bridged transfer skips cash posting,
 *        non-bridged posts
 * T-011: Full inbound flow — collection plan entry -> collection attempt ->
 *        bridge transfer -> obligation PAYMENT_APPLIED
 * T-014: Bridge idempotency — re-running emitPaymentReceived does not create
 *        duplicate transfer
 *
 * ORDERING NOTE: T-012 and T-013 are placed BEFORE T-011/T-014 because
 * finishAllScheduledFunctions (used by T-011/T-014) leaves the convex-test
 * workflow component in a state where subsequent workflow.start calls fail.
 * This is a known convex-test limitation — not a bug in application code.
 */

import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import auditTrailSchema from "../../../components/auditTrail/schema";
import { emitPaymentReceived } from "../../../engine/effects/collectionAttempt";
import { publishTransferConfirmed } from "../../../engine/effects/transfer";
import type { CommandSource } from "../../../engine/types";
import schema from "../../../schema";
import { postObligationAccrued } from "../../cashLedger/integrations";

// ── Module globs ────────────────────────────────────────────────────

const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);
const workflowModules = import.meta.glob(
	"/node_modules/@convex-dev/workflow/dist/component/**/*.js"
);
const workpoolModules = import.meta.glob(
	"/node_modules/@convex-dev/workpool/dist/component/**/*.js"
);

// Enable fake timers for the entire file. Required for
// finishAllScheduledFunctions in T-011 and T-014.
vi.useFakeTimers();

// ── Test harness ────────────────────────────────────────────────────

type TestHarness = ReturnType<typeof createFullHarness>;

function createFullHarness() {
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

// ── Handler type casts ──────────────────────────────────────────────

const SYSTEM_SOURCE: CommandSource = {
	channel: "admin_dashboard" as const,
	actorId: "test-inbound-flow-admin",
	actorType: "admin" as const,
};

interface EmitPaymentReceivedHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"collectionAttempts">;
			entityType: "collectionAttempt";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<void>;
}

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

const emitPaymentReceivedMutation =
	emitPaymentReceived as unknown as EmitPaymentReceivedHandler;
const publishTransferConfirmedMutation =
	publishTransferConfirmed as unknown as PublishTransferConfirmedHandler;

// ── Seed helpers ────────────────────────────────────────────────────

async function seedCoreEntities(t: TestHarness) {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `inbound-broker-${now}`,
			email: `inbound-broker-${now}@fairlend.test`,
			firstName: "Inbound",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `inbound-borrower-${now}`,
			email: `inbound-borrower-${now}@fairlend.test`,
			firstName: "Inbound",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const lenderUserId = await ctx.db.insert("users", {
			authId: `inbound-lender-${now}`,
			email: `inbound-lender-${now}@fairlend.test`,
			firstName: "Inbound",
			lastName: "Lender",
		});
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/inbound-lender",
			status: "active",
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "456 Inbound Flow Ave",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 3C3",
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

/**
 * Creates a due obligation WITH an accrual entry (via postObligationAccrued).
 */
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

/**
 * Creates a due obligation with manually-seeded BORROWER_RECEIVABLE and
 * TRUST_CASH accounts. Avoids workflow.start calls so it is safe to call
 * after finishAllScheduledFunctions has been used.
 */
async function createDueObligationWithManualAccounts(
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

		// Manually seed BORROWER_RECEIVABLE (debit-normal)
		await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});

		// Ensure TRUST_CASH account exists
		const existingTrustCash = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_family_and_mortgage", (q) =>
				q.eq("family", "TRUST_CASH").eq("mortgageId", args.mortgageId)
			)
			.first();

		if (!existingTrustCash) {
			await ctx.db.insert("cash_ledger_accounts", {
				family: "TRUST_CASH",
				mortgageId: args.mortgageId,
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});
		}

		return obligationId;
	});
}

async function createPlanEntryAndAttempt(
	t: TestHarness,
	args: {
		obligationIds: Id<"obligations">[];
		amount: number;
		method?: string;
	}
) {
	return t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: args.method ?? "manual",
			scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
			status: "executing",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		const attemptId = await ctx.db.insert("collectionAttempts", {
			planEntryId,
			amount: args.amount,
			method: args.method ?? "manual",
			status: "initiated",
			machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
			initiatedAt: Date.now(),
		});

		return { planEntryId, attemptId };
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
			idempotencyKey: `inbound-flow-idem-${transferInsertCounter}-${Date.now()}`,
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
// T-012: Manual inbound transfer (non-bridged) -> CASH_RECEIVED
// Runs FIRST because it relies on workflow.start working correctly.
// ══════════════════════════════════════════════════════════════════════

describe("T-012: manual inbound transfer (non-bridged) posts CASH_RECEIVED", () => {
	it("publishTransferConfirmed posts CASH_RECEIVED for a direct inbound transfer", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const transferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 50_000,
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
				journalEntryId: "audit-t012-1",
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
			const entry = entries[0];
			expect(entry.entryType).toBe("CASH_RECEIVED");
			expect(entry.amount).toBe(50_000n);

			const debitAccount = await ctx.db.get(entry.debitAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");

			const creditAccount = await ctx.db.get(entry.creditAccountId);
			expect(creditAccount?.family).toBe("BORROWER_RECEIVABLE");

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.settledAt).toBeDefined();
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-013: Bridge transfer D4 conditional
// ══════════════════════════════════════════════════════════════════════

describe("T-013: bridge transfer D4 conditional — bridged skips cash posting, non-bridged posts", () => {
	it("bridged transfer (with collectionAttemptId) skips cash posting", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 60_000,
		});

		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 60_000,
		});

		const bridgedTransferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 60_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
			collectionAttemptId: attemptId,
			idempotencyKey: `bridged-d4-test-${Date.now()}`,
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: bridgedTransferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t013-bridged",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(bridgedTransferId);
			expect(transfer?.settledAt).toBeDefined();

			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", bridgedTransferId)
				)
				.collect();

			expect(entries).toHaveLength(0);
		});
	});

	it("non-bridged inbound transfer (without collectionAttemptId) posts CASH_RECEIVED", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 60_000,
		});

		const nonBridgedTransferId = await insertTransfer(t, {
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 60_000,
			providerCode: "manual",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
			idempotencyKey: `nonbridged-d4-test-${Date.now()}`,
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: nonBridgedTransferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t013-nonbridged",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", nonBridgedTransferId)
				)
				.collect();

			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("CASH_RECEIVED");
			expect(entries[0].amount).toBe(60_000n);
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-014: Bridge idempotency
// Calls emitPaymentReceived twice in the same mutation to verify that
// the idempotency key check prevents duplicate bridge transfers. The
// key check runs inline inside the handler (not as a scheduled effect),
// so finishAllScheduledFunctions is not required.
// Must run BEFORE T-011 (which uses finishAllScheduledFunctions and
// corrupts global crypto/process references in convex-test).
// ══════════════════════════════════════════════════════════════════════

describe("T-014: bridge idempotency — re-running emitPaymentReceived does not create duplicate transfer", () => {
	it("second invocation of emitPaymentReceived for same attempt does not create a second bridge transfer", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithManualAccounts(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 40_000,
		});

		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 40_000,
		});

		// Call emitPaymentReceived TWICE within the same mutation context.
		// The second call should find the existing bridge transfer by
		// idempotency key and skip creation.
		await t.run(async (ctx) => {
			// First invocation — creates bridge transfer
			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t014-first",
				effectName: "emitPaymentReceived",
				source: SYSTEM_SOURCE,
			});

			// Second invocation — should find existing bridge and skip
			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t014-second",
				effectName: "emitPaymentReceived",
				source: SYSTEM_SOURCE,
			});

			// Verify: only ONE bridge transfer exists for this attempt
			const bridgeKey = `transfer:bridge:${attemptId}`;
			const bridgeTransfers = await ctx.db
				.query("transferRequests")
				.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", bridgeKey))
				.collect();

			expect(bridgeTransfers).toHaveLength(1);
			expect(bridgeTransfers[0].collectionAttemptId).toBe(attemptId);
			expect(bridgeTransfers[0].direction).toBe("inbound");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// T-011: Full inbound flow (uses finishAllScheduledFunctions)
// MUST be the LAST test in this file because finishAllScheduledFunctions
// corrupts global references (crypto, process) in the convex-test
// workflow component. This is a known convex-test limitation.
// ══════════════════════════════════════════════════════════════════════

describe("T-011: full inbound flow — collection plan -> attempt -> bridge transfer -> obligation PAYMENT_APPLIED", () => {
	it("FUNDS_SETTLED on collection attempt triggers PAYMENT_APPLIED, creates bridge transfer, and posts cash receipt", async () => {
		const t = createFullHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 80_000,
		});

		const { planEntryId, attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 80_000,
		});

		await t.run(async (ctx) => {
			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-t011-1",
				effectName: "emitPaymentReceived",
				source: SYSTEM_SOURCE,
			});
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify obligation transitioned to "settled"
		await t.run(async (ctx) => {
			const obligation = await ctx.db.get(obligationId);
			if (!obligation) {
				throw new Error("Obligation not found");
			}
			expect(obligation.status).toBe("settled");
			expect(obligation.amountSettled).toBeGreaterThanOrEqual(80_000);
		});

		// Verify bridge transfer was created with correct fields
		const bridgeTransfer = await t.run(async (ctx) => {
			const bridgeKey = `transfer:bridge:${attemptId}`;
			const transfer = await ctx.db
				.query("transferRequests")
				.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", bridgeKey))
				.first();

			if (!transfer) {
				throw new Error("Bridge transfer not found");
			}
			return transfer;
		});

		expect(bridgeTransfer.direction).toBe("inbound");
		expect(bridgeTransfer.collectionAttemptId).toBe(attemptId);
		expect(bridgeTransfer.planEntryId).toBe(planEntryId);
		expect(bridgeTransfer.obligationId).toBe(obligationId);
		expect(bridgeTransfer.amount).toBe(80_000);
		expect(bridgeTransfer.counterpartyType).toBe("borrower");
		expect(bridgeTransfer.status).toBe("confirmed");

		// Verify cash receipt was posted via obligation path
		await t.run(async (ctx) => {
			const cashEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();

			const cashReceipts = cashEntries.filter(
				(e) => e.entryType === "CASH_RECEIVED"
			);
			expect(cashReceipts.length).toBeGreaterThanOrEqual(1);

			const receipt = cashReceipts[0];
			expect(receipt.amount).toBe(80_000n);

			const creditAccount = await ctx.db.get(receipt.creditAccountId);
			expect(creditAccount?.family).toBe("BORROWER_RECEIVABLE");

			const debitAccount = await ctx.db.get(receipt.debitAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");
		});

		// Verify bridge transfer did NOT create its own cash entry (D4)
		await t.run(async (ctx) => {
			const bridgeKey = `transfer:bridge:${attemptId}`;
			const bridge = await ctx.db
				.query("transferRequests")
				.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", bridgeKey))
				.first();

			if (!bridge) {
				throw new Error("Bridge transfer not found");
			}

			const bridgeCashEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", bridge._id)
				)
				.collect();

			expect(bridgeCashEntries).toHaveLength(0);
		});
	});
});
