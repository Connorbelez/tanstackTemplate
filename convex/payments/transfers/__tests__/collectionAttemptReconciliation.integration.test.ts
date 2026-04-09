import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { afterAll, describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import auditTrailSchema from "../../../components/auditTrail/schema";
import { emitPaymentReceived } from "../../../engine/effects/collectionAttempt";
import { applyPayment } from "../../../engine/effects/obligationPayment";
import {
	publishTransferCancelled,
	publishTransferConfirmed,
	publishTransferFailed,
	publishTransferReversed,
} from "../../../engine/effects/transfer";
import schema from "../../../schema";
import {
	auditTrailModules,
	convexModules,
	workflowModules,
	workpoolModules,
} from "../../../test/moduleMaps";
import { postObligationAccrued } from "../../cashLedger/integrations";

const PAYMENT_HANDLER_IDENTITY = {
	subject: "test-transfer-reconciliation-user",
	issuer: "https://api.workos.com",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([
		"payment:view",
		"payment:manage",
		"payment:retry",
		"payment:cancel",
	]),
	user_email: "transfer-reconciliation-test@fairlend.ca",
	user_first_name: "Transfer",
	user_last_name: "Reconciliation",
};

const ADMIN_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "test-transfer-reconciliation-admin",
	actorType: "admin" as const,
};

type TestHarness = ReturnType<typeof convexTest>;

function createHarness() {
	process.env.DISABLE_GT_HASHCHAIN = "true";
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, convexModules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

function asPaymentUser(t: TestHarness) {
	return t.withIdentity(PAYMENT_HANDLER_IDENTITY);
}

async function seedCoreEntities(t: TestHarness) {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `recon-broker-${now}`,
			email: `recon-broker-${now}@fairlend.test`,
			firstName: "Recon",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `recon-borrower-${now}`,
			email: `recon-borrower-${now}@fairlend.test`,
			firstName: "Recon",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "789 Reconciliation Ave",
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

		return { borrowerId, mortgageId };
	});
}

async function createDueObligationWithAccrual(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		await postObligationAccrued(ctx, {
			obligationId,
			source: ADMIN_SOURCE,
		});

		return obligationId;
	});
}

async function createPlanEntryAndAttempt(
	t: TestHarness,
	args: {
		obligationIds: Id<"obligations">[];
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const firstObligation = await ctx.db.get(args.obligationIds[0]);
		if (!firstObligation) {
			throw new Error("Expected at least one obligation for plan entry setup");
		}

		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId: firstObligation.mortgageId,
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: "manual",
			scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
			status: "executing",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		const attemptId = await ctx.db.insert("collectionAttempts", {
			planEntryId,
			mortgageId: firstObligation.mortgageId,
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: "manual",
			status: "initiated",
			machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
			initiatedAt: Date.now(),
		});

		return { attemptId, planEntryId };
	});
}

let transferInsertCounter = 0;

async function insertTransfer(
	t: TestHarness,
	overrides: Record<string, unknown>
): Promise<Id<"transferRequests">> {
	transferInsertCounter += 1;
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("transferRequests", {
			status: "initiated",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 50_000,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: "counterparty-default",
			providerCode: "manual",
			idempotencyKey: `transfer-recon-${transferInsertCounter}-${now}`,
			source: ADMIN_SOURCE,
			createdAt: now,
			lastTransitionAt: now,
			...overrides,
		} as Parameters<typeof ctx.db.insert<"transferRequests">>[1]);
	});
}

interface TransferEffectArgs {
	effectName: string;
	entityId: Id<"transferRequests">;
	entityType: "transfer";
	eventType: string;
	journalEntryId: string;
	payload?: Record<string, unknown>;
	source: typeof ADMIN_SOURCE;
}

interface TransferEffectHandler {
	_handler: (ctx: MutationCtx, args: TransferEffectArgs) => Promise<void>;
}

interface CollectionAttemptEffectHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"collectionAttempts">;
			entityType: "collectionAttempt";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof ADMIN_SOURCE;
		}
	) => Promise<void>;
}

const publishTransferFailedMutation =
	publishTransferFailed as unknown as TransferEffectHandler;
const publishTransferConfirmedMutation =
	publishTransferConfirmed as unknown as TransferEffectHandler;
const publishTransferCancelledMutation =
	publishTransferCancelled as unknown as TransferEffectHandler;
const publishTransferReversedMutation =
	publishTransferReversed as unknown as TransferEffectHandler;
const emitPaymentReceivedMutation =
	emitPaymentReceived as unknown as CollectionAttemptEffectHandler;
const applyPaymentMutation = applyPayment as unknown as {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"obligations">;
			entityType: "obligation";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof ADMIN_SOURCE;
		}
	) => Promise<void>;
};

vi.useFakeTimers();

afterAll(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

/**
 * Page-04 canonical inbound reconciliation tests.
 * Spec: https://www.notion.so/337fc1b4402481a48a13ee61e289e8f0
 *
 * Use Cases covered:
 * - UC-1: Provider-settled inbound transfer confirms the originating Collection Attempt
 *
 * Requirements covered:
 * - REQ-1: Transfer lifecycle outcomes must reconcile to the linked Collection Attempt
 * - REQ-2: Confirmed inbound collections must produce one business settlement outcome
 * - REQ-3: Obligation application must stay downstream of the Collection Attempt boundary
 * - REQ-4: Borrower cash posting must occur exactly once for attempt-linked inbound collections
 * - REQ-5: Settlement-layer modules must not require plan-entry awareness to post money
 */
describe("collection attempt reconciliation for attempt-linked inbound transfers", () => {
	it("publishTransferConfirmed settles the linked collection attempt and leaves inbound cash posting on the obligation path", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 50_000,
		});

		const transferId = await insertTransfer(t, {
			status: "confirmed",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
			collectionAttemptId: attemptId,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(attemptId, {
				transferRequestId: transferId,
			});
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-transfer-settled",
				effectName: "publishTransferConfirmed",
				payload: { settledAt: Date.now() },
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.status).toBe("confirmed");
			expect(transfer?.settledAt).toBeTypeOf("number");
		});

		await t.run(async (ctx) => {
			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-attempt-settled",
				effectName: "emitPaymentReceived",
				payload: { settledAt: Date.now() },
				source: ADMIN_SOURCE,
			});

			await applyPaymentMutation._handler(ctx, {
				entityId: obligationId,
				entityType: "obligation",
				eventType: "PAYMENT_APPLIED",
				journalEntryId: "audit-obligation-payment-applied",
				effectName: "applyPayment",
				payload: {
					amount: 50_000,
					attemptId,
					postingGroupId: `cash-receipt:${attemptId}`,
				},
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const attempt = await ctx.db.get(attemptId);
			expect(attempt?.status).toBe("confirmed");

			const obligation = await ctx.db.get(obligationId);
			expect(obligation?.status).toBe("settled");
			expect(obligation?.amountSettled).toBe(50_000);

			const transferEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();
			expect(transferEntries).toHaveLength(0);

			const obligationEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			const cashReceipts = obligationEntries.filter(
				(entry) => entry.entryType === "CASH_RECEIVED"
			);

			expect(cashReceipts).toHaveLength(1);
			expect(cashReceipts[0]?.attemptId).toBe(attemptId);
			expect(cashReceipts[0]?.transferRequestId).toBeUndefined();
		});
	});

	it("publishTransferFailed moves the linked attempt into retry_scheduled failure handling", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 50_000,
		});

		const transferId = await insertTransfer(t, {
			status: "pending",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
			collectionAttemptId: attemptId,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(attemptId, {
				status: "pending",
				transferRequestId: transferId,
			});
		});

		await t.run(async (ctx) => {
			await publishTransferFailedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "TRANSFER_FAILED",
				journalEntryId: "audit-transfer-failed",
				effectName: "publishTransferFailed",
				payload: {
					errorCode: "NSF",
					reason: "insufficient_funds",
				},
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.failureCode).toBe("NSF");
			expect(transfer?.failureReason).toBe("insufficient_funds");
			expect(transfer?.failedAt).toBeTypeOf("number");

			const attempt = await ctx.db.get(attemptId);
			expect(attempt?.status).toBe("retry_scheduled");
			expect(attempt?.failureReason).toBe("insufficient_funds");
			expect(attempt?.providerStatus).toBeUndefined();
		});
	});

	it("cancelTransfer cancels the linked collection attempt without posting money", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 50_000,
		});

		const transferId = await insertTransfer(t, {
			status: "initiated",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
			collectionAttemptId: attemptId,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(attemptId, {
				transferRequestId: transferId,
			});
		});

		const result = await auth.mutation(
			api.payments.transfers.mutations.cancelTransfer,
			{
				transferId,
				reason: "cancelled before settlement",
			}
		);

		expect(result.success).toBe(true);
		expect(result.newState).toBe("cancelled");

		await t.run(async (ctx) => {
			await publishTransferCancelledMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "TRANSFER_CANCELLED",
				journalEntryId: "audit-transfer-cancelled",
				effectName: "publishTransferCancelled",
				payload: { reason: "cancelled before settlement" },
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.status).toBe("cancelled");

			const attempt = await ctx.db.get(attemptId);
			expect(attempt?.status).toBe("cancelled");
			expect(attempt?.providerStatus).toBeUndefined();

			const transferEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();
			expect(transferEntries).toHaveLength(0);
		});
	});

	it("publishTransferReversed moves the linked confirmed attempt into reversed", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 50_000,
		});

		const transferId = await insertTransfer(t, {
			status: "confirmed",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			counterpartyId: `${seeded.borrowerId}`,
			collectionAttemptId: attemptId,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(attemptId, {
				status: "confirmed",
				transferRequestId: transferId,
			});

			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-attempt-settled-for-reversal",
				effectName: "emitPaymentReceived",
				payload: { settledAt: Date.now() },
				source: ADMIN_SOURCE,
			});

			await applyPaymentMutation._handler(ctx, {
				entityId: obligationId,
				entityType: "obligation",
				eventType: "PAYMENT_APPLIED",
				journalEntryId: "audit-obligation-payment-applied-for-reversal",
				effectName: "applyPayment",
				payload: {
					amount: 50_000,
					attemptId,
					postingGroupId: `cash-receipt:${attemptId}`,
				},
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			await publishTransferReversedMutation._handler(ctx, {
				entityId: transferId,
				entityType: "transfer",
				eventType: "TRANSFER_REVERSED",
				journalEntryId: "audit-transfer-reversed",
				effectName: "publishTransferReversed",
				payload: {
					reversalRef: "REV-001",
					reason: "chargeback",
				},
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const transfer = await ctx.db.get(transferId);
			expect(transfer?.reversalRef).toBe("REV-001");
			expect(transfer?.reversedAt).toBeTypeOf("number");

			const attempt = await ctx.db.get(attemptId);
			expect(attempt?.status).toBe("reversed");
			expect(attempt?.reversedAt).toBeTypeOf("number");
			expect(attempt?.providerStatus).toBeUndefined();

			const reversalEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect();
			expect(reversalEntries.length).toBeGreaterThanOrEqual(1);
			expect(
				reversalEntries.every(
					(entry) =>
						entry.entryType === "REVERSAL" &&
						entry.postingGroupId === `reversal-group:transfer:${transferId}`
				)
			).toBe(true);
		});
	});
});
