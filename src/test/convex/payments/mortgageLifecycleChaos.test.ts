import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
	findCashAccount,
	getCashAccountBalance,
} from "../../../../convex/payments/cashLedger/accounts";
import {
	assertDispersalIntegrity,
	assertLifecycleAuditIntegrity,
	assertLenderPayablesZero,
	assertMonthlyLifecycleIntegrity,
	assertOwnershipIntegrity,
	assertOutboundPayoutIntegrity,
	assertSingleCashReceipt,
	assertSingleLenderPayoutForTransfer,
} from "./reliabilityAssertions";
import {
	createReliabilityHarness,
	ownershipExpectationForPayment,
	type LifecycleMonthRecord,
	type PendingMonthlyCycle,
	type ReliabilityBootstrap,
	type ReliabilityHarness,
	teardownReliabilityHarness,
} from "./reliabilityHarness";

function latestPayoutEligibleAfter(
	dispersalEntries: Doc<"dispersalEntries">[]
): string {
	return (
		dispersalEntries
			.map((entry) => entry.payoutEligibleAfter)
			.filter((value): value is string => typeof value === "string")
			.sort()
			.at(-1) ?? new Date(Date.now()).toISOString().slice(0, 10)
	);
}

async function getRetryEntriesForPlanEntry(
	harness: ReliabilityHarness,
	planEntryId: Id<"collectionPlanEntries">
) {
	return harness.t.run(async (ctx) =>
		ctx.db
			.query("collectionPlanEntries")
			.filter((q) =>
				q.and(
					q.eq(q.field("retryOfId"), planEntryId),
					q.eq(q.field("source"), "retry_rule")
				)
			)
			.collect()
	);
}

async function getCorrectiveObligations(
	harness: ReliabilityHarness,
	sourceObligationId: Id<"obligations">
) {
	return harness.t.run(async (ctx) =>
		ctx.db
			.query("obligations")
			.withIndex("by_source_obligation", (q) =>
				q.eq("sourceObligationId", sourceObligationId)
			)
			.collect()
	);
}

async function getTransferOrThrow(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">
) {
	const transfer = await harness.t.run(async (ctx) => ctx.db.get(transferId));
	if (!transfer) {
		throw new Error(`Expected transfer ${transferId}`);
	}
	return transfer;
}

async function getAttemptOrThrow(
	harness: ReliabilityHarness,
	attemptId: Id<"collectionAttempts">
) {
	const attempt = await harness.t.run(async (ctx) => ctx.db.get(attemptId));
	if (!attempt) {
		throw new Error(`Expected attempt ${attemptId}`);
	}
	return attempt;
}

async function getObligationOrThrow(
	harness: ReliabilityHarness,
	obligationId: Id<"obligations">
) {
	const obligation = await harness.t.run(async (ctx) => ctx.db.get(obligationId));
	if (!obligation) {
		throw new Error(`Expected obligation ${obligationId}`);
	}
	return obligation;
}

async function deliverDuplicateInboundSettlement(
	harness: ReliabilityHarness,
	pending: PendingMonthlyCycle,
	paymentNumber: number,
	providerEventId = `mock_evt_inbound_${paymentNumber}_confirmed`
) {
	const transfer = await getTransferOrThrow(harness, pending.inboundTransfer._id);
	if (!transfer.providerRef) {
		throw new Error("Expected providerRef on inbound transfer");
	}

	await harness.deliverTransferWebhook(pending.inboundTransfer._id, {
		provider: "mock_pad",
		providerEventId,
		normalizedEventType: "FUNDS_SETTLED",
		status: "completed",
		transactionId: transfer.providerRef,
		rawBody: JSON.stringify({
			status: "completed",
			transactionId: transfer.providerRef,
		}),
		payload: {
			settledAt: Date.now(),
			providerData: {
				mockProviderRef: transfer.providerRef,
				paymentNumber,
				replayed: true,
			},
		},
	});
	await harness.drainScheduledWork();
}

async function deliverDuplicateOutboundSettlement(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">,
	paymentNumber: number,
	transferIndex: number
) {
	const transfer = await getTransferOrThrow(harness, transferId);
	if (!transfer.providerRef) {
		throw new Error("Expected providerRef on outbound transfer");
	}

	await harness.deliverTransferWebhook(transferId, {
		provider: "mock_eft",
		providerEventId: `mock_evt_outbound_${paymentNumber}_${transferIndex}_confirmed`,
		normalizedEventType: "FUNDS_SETTLED",
		status: "completed",
		transactionId: transfer.providerRef,
		rawBody: JSON.stringify({
			status: "completed",
			transactionId: transfer.providerRef,
		}),
		payload: {
			settledAt: Date.now(),
			providerData: {
				mockProviderRef: transfer.providerRef,
				paymentNumber,
				replayed: true,
				transferIndex,
			},
		},
	});
	await harness.drainScheduledWork();
}

async function reverseInboundTransfer(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">,
	providerEventId: string,
	options?: {
		drainScheduledWork?: boolean;
	}
) {
	const transfer = await getTransferOrThrow(harness, transferId);
	if (!transfer.providerRef) {
		throw new Error("Expected providerRef on inbound transfer");
	}

	await harness.deliverTransferWebhook(transferId, {
		provider: "mock_pad",
		providerEventId,
		normalizedEventType: "TRANSFER_REVERSED",
		status: "returned",
		transactionId: transfer.providerRef,
		rawBody: JSON.stringify({
			status: "returned",
			transactionId: transfer.providerRef,
		}),
		payload: {
			reversalRef: providerEventId,
			reason: "NSF reversal",
		},
	});
	if (options?.drainScheduledWork ?? true) {
		await harness.drainScheduledWork();
	}
}

async function getReversalEntriesForTransfer(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">
) {
	return harness.t.run(async (ctx) =>
		ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_posting_group", (q) =>
				q.eq("postingGroupId", `reversal-group:transfer:${transferId}`)
			)
			.collect()
	);
}

async function createCorrectiveObligationFromReversal(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">,
	originalObligationId: Id<"obligations">,
	reason: string
) {
	const reversalEntries = await getReversalEntriesForTransfer(harness, transferId);
	const cashReceivedReversal = reversalEntries.find((entry) =>
		entry.idempotencyKey.includes("reversal:cash-received:")
	);
	if (!cashReceivedReversal) {
		throw new Error(
			`Expected CASH_RECEIVED reversal for transfer ${transferId as string}`
		);
	}

	await harness.t.mutation(
		internal.payments.obligations.createCorrectiveObligation
			.createCorrectiveObligation,
		{
			originalObligationId,
			reversedAmount: Number(cashReceivedReversal.amount),
			reason,
			postingGroupId: `reversal-group:transfer:${transferId}`,
			source: {
				actorId: "reliability-chaos",
				actorType: "system",
				channel: "api_webhook",
			},
		}
	);
}

async function applyTransferReversalEffect(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">,
	reversalRef: string,
	reason: string,
	effectiveDate: string
) {
	await harness.t.mutation(internal.engine.effects.transfer.publishTransferReversed, {
		entityId: transferId,
		entityType: "transfer",
		eventType: "TRANSFER_REVERSED",
		journalEntryId: `chaos-transfer-reversed:${transferId}`,
		effectName: "publishTransferReversed",
		payload: {
			effectiveDate,
			reason,
			reversalRef,
		},
		source: {
			actorId: "reliability-chaos",
			actorType: "system",
			channel: "api_webhook",
		},
	});
}

async function assertSystemReversalBalances(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap,
	record: LifecycleMonthRecord
) {
	const obligation = await getObligationOrThrow(harness, record.obligationId);

	const trustCash = await harness.t.run(async (ctx) => {
		const account = await findCashAccount(ctx.db, {
			family: "TRUST_CASH",
			mortgageId: bootstrap.fixture.mortgageId,
		});
		return account ? getCashAccountBalance(account) : null;
	});
	expect(trustCash).toBe(0n);

	const borrowerReceivable = await harness.t.run(async (ctx) => {
		const account = await findCashAccount(ctx.db, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: bootstrap.fixture.mortgageId,
			obligationId: record.obligationId,
			borrowerId: bootstrap.fixture.borrowerId,
		});
		return account ? getCashAccountBalance(account) : null;
	});
	expect(borrowerReceivable).toBe(BigInt(obligation.amount));

	await assertLenderPayablesZero(harness, bootstrap);

	const servicingRevenue = await harness.t.run(async (ctx) => {
		const account = await findCashAccount(ctx.db, {
			family: "SERVICING_REVENUE",
			mortgageId: bootstrap.fixture.mortgageId,
		});
		return account ? getCashAccountBalance(account) : null;
	});
	expect(servicingRevenue).toBe(0n);
}

function buildLifecycleRecord(args: {
	pending: PendingMonthlyCycle;
	inboundWebhookEventId: Id<"webhookEvents">;
	outboundTransferIds: Id<"transferRequests">[];
	outboundWebhookEventIds: Id<"webhookEvents">[];
	dispersalEntries: Doc<"dispersalEntries">[];
}): LifecycleMonthRecord {
	return {
		attemptId: args.pending.attempt._id,
		dispersalEntryIds: args.dispersalEntries.map((entry) => entry._id),
		inboundTransferId: args.pending.inboundTransfer._id,
		inboundWebhookEventId: args.inboundWebhookEventId,
		obligationId: args.pending.obligation._id,
		outboundTransferIds: args.outboundTransferIds,
		outboundWebhookEventIds: args.outboundWebhookEventIds,
		paymentNumber: args.pending.paymentNumber,
		payoutEligibleAfter: latestPayoutEligibleAfter(args.dispersalEntries),
		planEntryId: args.pending.planEntry._id,
	};
}

describe("mortgage lifecycle chaos", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
		teardownReliabilityHarness();
	});

	it("keeps a monthly cycle single-write under scheduler replay and duplicate inbound/outbound confirmations", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();
		const pending = await harness.prepareMonthlyCycle(
			bootstrap.fixture.mortgageId,
			1
		);

		await harness.t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: pending.planEntry.scheduledDate,
				batchSize: 25,
			}
		);
		await harness.drainScheduledWork();
		await harness.t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: pending.planEntry.scheduledDate,
				batchSize: 25,
			}
		);
		await harness.drainScheduledWork();

		expect(
			await harness.getCollectionAttemptsForPlanEntry(pending.planEntry._id)
		).toHaveLength(1);
		expect(await harness.getTransfersForAttempt(pending.attempt._id)).toHaveLength(1);

		const inboundWebhookEventId = await harness.settleInboundTransfer(
			pending.inboundTransfer._id,
			1
		);
		await deliverDuplicateInboundSettlement(harness, pending, 1);

		await assertSingleCashReceipt(harness, pending.attempt._id);
		expect(
			await harness.getWebhookEventsForTransfer(pending.inboundTransfer._id)
		).toHaveLength(1);

		const firstBridgeRun = await harness.runDisbursementBridgeForObligation(
			pending.obligation._id
		);
		const secondBridgeRun = await harness.runDisbursementBridgeForObligation(
			pending.obligation._id
		);
		expect(secondBridgeRun.outboundTransfers).toHaveLength(
			firstBridgeRun.outboundTransfers.length
		);

		const outboundSettlement = await harness.settleOutboundTransfers(
			pending.obligation._id,
			1
		);
		for (const [index, transferId] of outboundSettlement.outboundTransferIds.entries()) {
			await deliverDuplicateOutboundSettlement(harness, transferId, 1, index + 1);
			await assertSingleLenderPayoutForTransfer(harness, transferId);
			expect(await harness.getWebhookEventsForTransfer(transferId)).toHaveLength(1);
		}

		const dispersalEntries = await harness.getDispersalEntriesForObligation(
			pending.obligation._id
		);
		const record = buildLifecycleRecord({
			pending,
			inboundWebhookEventId,
			outboundTransferIds: outboundSettlement.outboundTransferIds,
			outboundWebhookEventIds: outboundSettlement.webhookEventIds,
			dispersalEntries,
		});

		await assertMonthlyLifecycleIntegrity(
			harness,
			bootstrap,
			record,
			ownershipExpectationForPayment(1)
		);
	});

	it("ignores a late failure event after inbound settlement and preserves the confirmed monthly cycle", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();
		const pending = await harness.prepareMonthlyCycle(
			bootstrap.fixture.mortgageId,
			1
		);

		const inboundWebhookEventId = await harness.settleInboundTransfer(
			pending.inboundTransfer._id,
			1
		);
		const inboundTransfer = await getTransferOrThrow(
			harness,
			pending.inboundTransfer._id
		);
		if (!inboundTransfer.providerRef) {
			throw new Error("Expected providerRef on settled inbound transfer");
		}

		await harness.deliverTransferWebhook(pending.inboundTransfer._id, {
			provider: "mock_pad",
			providerEventId: "mock_evt_inbound_1_late_failure",
			normalizedEventType: "TRANSFER_FAILED",
			status: "failed",
			transactionId: inboundTransfer.providerRef,
			rawBody: JSON.stringify({
				status: "failed",
				transactionId: inboundTransfer.providerRef,
			}),
			payload: {
				errorCode: "NSF",
				reason: "late failure should be ignored",
			},
		});
		await harness.drainScheduledWork();

		expect((await getTransferOrThrow(harness, pending.inboundTransfer._id)).status).toBe(
			"confirmed"
		);
		expect((await getAttemptOrThrow(harness, pending.attempt._id)).status).toBe(
			"confirmed"
		);
		await assertSingleCashReceipt(harness, pending.attempt._id);
		expect(await getRetryEntriesForPlanEntry(harness, pending.planEntry._id)).toHaveLength(
			0
		);

		await harness.runDisbursementBridgeForObligation(pending.obligation._id);
		const outboundSettlement = await harness.settleOutboundTransfers(
			pending.obligation._id,
			1
		);
		const dispersalEntries = await harness.getDispersalEntriesForObligation(
			pending.obligation._id
		);
		const record = buildLifecycleRecord({
			pending,
			inboundWebhookEventId,
			outboundTransferIds: outboundSettlement.outboundTransferIds,
			outboundWebhookEventIds: outboundSettlement.webhookEventIds,
			dispersalEntries,
		});

		const inboundWebhookEvents = await harness.getWebhookEventsForTransfer(
			record.inboundTransferId
		);
		expect(
			inboundWebhookEvents.map((event) => event.normalizedEventType).sort()
		).toEqual(["FUNDS_SETTLED", "TRANSFER_FAILED"]);
		expect(
			inboundWebhookEvents.every((event) => event.status === "processed")
		).toBe(true);

		await assertDispersalIntegrity(
			harness,
			bootstrap,
			record,
			ownershipExpectationForPayment(1)
		);
		await assertOutboundPayoutIntegrity(harness, record);
		await assertLenderPayablesZero(harness, bootstrap);
		await assertOwnershipIntegrity(
			harness,
			bootstrap,
			ownershipExpectationForPayment(1)
		);
		await assertLifecycleAuditIntegrity(harness, record);
	});

	it("reversal after a fully paid month creates one corrective obligation and stays idempotent on replay", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();
		const record = await harness.runMonthlyCycle(bootstrap.fixture.mortgageId, 1);

		await reverseInboundTransfer(
			harness,
			record.inboundTransferId,
			"mock_evt_inbound_1_reversed",
			{ drainScheduledWork: false }
		);
		await reverseInboundTransfer(
			harness,
			record.inboundTransferId,
			"mock_evt_inbound_1_reversed",
			{ drainScheduledWork: false }
		);

		expect((await getTransferOrThrow(harness, record.inboundTransferId)).status).toBe(
			"reversed"
		);

		await applyTransferReversalEffect(
			harness,
			record.inboundTransferId,
			"mock_evt_inbound_1_reversed",
			"NSF reversal",
			"2026-01-22"
		);
		await harness.drainScheduledWork();
		expect((await getAttemptOrThrow(harness, record.attemptId)).status).toBe(
			"reversed"
		);

		const firstReversalEntries = await getReversalEntriesForTransfer(
			harness,
			record.inboundTransferId
		);
		expect(firstReversalEntries.length).toBeGreaterThan(0);
		await applyTransferReversalEffect(
			harness,
			record.inboundTransferId,
			"mock_evt_inbound_1_reversed",
			"NSF reversal",
			"2026-01-22"
		);
		await harness.drainScheduledWork();
		const secondReversalEntries = await getReversalEntriesForTransfer(
			harness,
			record.inboundTransferId
		);
		expect(secondReversalEntries.map((entry) => entry._id).sort()).toEqual(
			firstReversalEntries.map((entry) => entry._id).sort()
		);
		expect(
			firstReversalEntries.every((entry) => entry.entryType === "REVERSAL")
		).toBe(true);

		await createCorrectiveObligationFromReversal(
			harness,
			record.inboundTransferId,
			record.obligationId,
			"NSF reversal"
		);
		await createCorrectiveObligationFromReversal(
			harness,
			record.inboundTransferId,
			record.obligationId,
			"NSF reversal"
		);

		const correctiveObligations = await getCorrectiveObligations(
			harness,
			record.obligationId
		);
		expect(correctiveObligations).toHaveLength(1);
		expect(correctiveObligations[0]?.status).toBe("upcoming");
		expect(correctiveObligations[0]?.amount).toBe(
			(await getObligationOrThrow(harness, record.obligationId)).amount
		);

		const webhookEvents = await harness.getWebhookEventsForTransfer(
			record.inboundTransferId
		);
		expect(
			webhookEvents.filter(
				(event) => event.normalizedEventType === "TRANSFER_REVERSED"
			)
		).toHaveLength(1);

		await assertSystemReversalBalances(harness, bootstrap, record);
	});

	it("duplicate failed inbound delivery and runner replay create exactly one retry chain before clean recovery", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap({
			seedCollectionRules: true,
			disableBalancePreCheck: true,
		});
		const pending = await harness.prepareMonthlyCycle(
			bootstrap.fixture.mortgageId,
			1
		);

		const inboundTransfer = await getTransferOrThrow(
			harness,
			pending.inboundTransfer._id
		);
		if (!inboundTransfer.providerRef) {
			throw new Error("Expected providerRef on pending inbound transfer");
		}

		const failureFixture = {
			provider: "mock_pad" as const,
			providerEventId: "mock_evt_inbound_1_failed",
			normalizedEventType: "TRANSFER_FAILED" as const,
			status: "failed" as const,
			transactionId: inboundTransfer.providerRef,
			rawBody: JSON.stringify({
				status: "failed",
				transactionId: inboundTransfer.providerRef,
			}),
			payload: {
				errorCode: "NSF",
				reason: "chaos duplicate failure",
			},
		};

		await harness.deliverTransferWebhook(pending.inboundTransfer._id, failureFixture);
		await harness.drainScheduledWork();
		await harness.deliverTransferWebhook(pending.inboundTransfer._id, failureFixture);
		await harness.drainScheduledWork();

		expect((await getAttemptOrThrow(harness, pending.attempt._id)).status).toBe(
			"retry_scheduled"
		);
		expect(await getRetryEntriesForPlanEntry(harness, pending.planEntry._id)).toHaveLength(
			1
		);

		const [retryEntry] = await getRetryEntriesForPlanEntry(
			harness,
			pending.planEntry._id
		);
		if (!retryEntry) {
			throw new Error("Expected a retry entry");
		}

		vi.setSystemTime(new Date(retryEntry.scheduledDate + 1000));
		await harness.t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: retryEntry.scheduledDate,
				batchSize: 25,
			}
		);
		await harness.drainScheduledWork();
		await harness.t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: retryEntry.scheduledDate,
				batchSize: 25,
			}
		);
		await harness.drainScheduledWork();

		const retryAttempts = await harness.getCollectionAttemptsForPlanEntry(
			retryEntry._id
		);
		expect(retryAttempts).toHaveLength(1);
		const retryAttempt = retryAttempts[0];
		if (!retryAttempt) {
			throw new Error("Expected retry attempt");
		}

		const retryTransfers = await harness.getTransfersForAttempt(retryAttempt._id);
		expect(retryTransfers).toHaveLength(1);
		const retryTransfer = retryTransfers[0];
		if (!retryTransfer?.providerRef) {
			throw new Error("Expected retry transfer providerRef");
		}

		await harness.deliverTransferWebhook(retryTransfer._id, {
			provider: "mock_pad",
			providerEventId: "mock_evt_inbound_1_retry_confirmed",
			normalizedEventType: "FUNDS_SETTLED",
			status: "completed",
			transactionId: retryTransfer.providerRef,
			rawBody: JSON.stringify({
				status: "completed",
				transactionId: retryTransfer.providerRef,
			}),
			payload: {
				settledAt: Date.now(),
				providerData: {
					mockProviderRef: retryTransfer.providerRef,
					paymentNumber: 1,
					retry: true,
				},
			},
		});
		await harness.drainScheduledWork();
		await harness.deliverTransferWebhook(retryTransfer._id, {
			provider: "mock_pad",
			providerEventId: "mock_evt_inbound_1_retry_confirmed",
			normalizedEventType: "FUNDS_SETTLED",
			status: "completed",
			transactionId: retryTransfer.providerRef,
			rawBody: JSON.stringify({
				status: "completed",
				transactionId: retryTransfer.providerRef,
			}),
			payload: {
				settledAt: Date.now(),
				providerData: {
					mockProviderRef: retryTransfer.providerRef,
					paymentNumber: 1,
					retryReplay: true,
				},
			},
		});
		await harness.drainScheduledWork();

		const cashEntries = await harness.getCashEntriesForObligation(
			pending.obligation._id
		);
		expect(
			cashEntries.filter((entry) => entry.entryType === "CASH_RECEIVED")
		).toHaveLength(1);
		await assertSingleCashReceipt(harness, retryAttempt._id);

		await harness.runDisbursementBridgeForObligation(pending.obligation._id);
		const outboundSettlement = await harness.settleOutboundTransfers(
			pending.obligation._id,
			1
		);
		const dispersalEntries = await harness.getDispersalEntriesForObligation(
			pending.obligation._id
		);
		const recoveredPending: PendingMonthlyCycle = {
			attempt: retryAttempt,
			inboundTransfer: retryTransfer,
			obligation: pending.obligation,
			paymentNumber: 1,
			planEntry: retryEntry,
		};
		const record = buildLifecycleRecord({
			pending: recoveredPending,
			inboundWebhookEventId:
				(await harness.getWebhookEventsForTransfer(retryTransfer._id))[0]?._id ??
				(() => {
					throw new Error("Expected retry inbound webhook event");
				})(),
			outboundTransferIds: outboundSettlement.outboundTransferIds,
			outboundWebhookEventIds: outboundSettlement.webhookEventIds,
			dispersalEntries,
		});

		await assertMonthlyLifecycleIntegrity(
			harness,
			bootstrap,
			record,
			ownershipExpectationForPayment(1)
		);
		await assertOwnershipIntegrity(harness, bootstrap, {
			lenderAUnits: 6000,
			lenderBUnits: 4000,
		});
	});
});
