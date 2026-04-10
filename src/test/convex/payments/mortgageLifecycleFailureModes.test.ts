import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import {
	assertLenderPayablesZero,
	assertMonthlyLifecycleIntegrity,
	assertOwnershipIntegrity,
	assertSingleCashReceipt,
	assertSingleLenderPayoutForTransfer,
} from "./reliabilityAssertions";
import {
	createReliabilityHarness,
	ownershipExpectationForPayment,
	teardownReliabilityHarness,
} from "./reliabilityHarness";

describe("mortgage lifecycle failure modes", () => {
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

	it("duplicate inbound webhook event does not create a second cash receipt", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();
		const pending = await harness.prepareMonthlyCycle(
			bootstrap.fixture.mortgageId,
			1
		);

		await harness.settleInboundTransfer(pending.inboundTransfer._id, 1);

		const transfer = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.inboundTransfer._id)
		);
		if (!transfer?.providerRef) {
			throw new Error("Expected providerRef on inbound transfer");
		}

		await harness.deliverTransferWebhook(pending.inboundTransfer._id, {
			provider: "mock_pad",
			providerEventId: "mock_evt_inbound_1_confirmed",
			normalizedEventType: "FUNDS_SETTLED",
			status: "completed",
			transactionId: transfer.providerRef,
			rawBody: JSON.stringify({
				status: "completed",
				transactionId: transfer.providerRef,
			}),
			payload: {
				settledAt: Date.now(),
				providerData: { replayed: true },
			},
		});
		await harness.drainScheduledWork();

		await assertSingleCashReceipt(harness, pending.attempt._id);

		const obligation = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.obligation._id)
		);
		expect(obligation?.status).toBe("settled");

		const inboundTransfer = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.inboundTransfer._id)
		);
		expect(inboundTransfer?.status).toBe("confirmed");
	});

	it("duplicate outbound webhook event does not create a second lender payout", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();
		const record = await harness.runMonthlyCycle(bootstrap.fixture.mortgageId, 1);

		const outboundTransferId = record.outboundTransferIds[0];
		if (!outboundTransferId) {
			throw new Error("Expected at least one outbound transfer");
		}

		const outboundTransfer = await harness.t.run(async (ctx) =>
			ctx.db.get(outboundTransferId)
		);
		if (!outboundTransfer?.providerRef) {
			throw new Error("Expected providerRef on outbound transfer");
		}

		await harness.deliverTransferWebhook(outboundTransferId, {
			provider: "mock_eft",
			providerEventId: "mock_evt_outbound_1_1_confirmed",
			normalizedEventType: "FUNDS_SETTLED",
			status: "completed",
			transactionId: outboundTransfer.providerRef,
			rawBody: JSON.stringify({
				status: "completed",
				transactionId: outboundTransfer.providerRef,
			}),
			payload: {
				settledAt: Date.now(),
				providerData: { replayed: true },
			},
		});
		await harness.drainScheduledWork();

		await assertSingleLenderPayoutForTransfer(harness, outboundTransferId);
		await assertLenderPayablesZero(harness, bootstrap);
	});

	it("re-running the disbursement bridge is idempotent for already-created outbound transfers", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();
		const pending = await harness.prepareMonthlyCycle(
			bootstrap.fixture.mortgageId,
			1
		);

		await harness.settleInboundTransfer(pending.inboundTransfer._id, 1);
		const first = await harness.runDisbursementBridgeForObligation(
			pending.obligation._id
		);
		const second = await harness.runDisbursementBridgeForObligation(
			pending.obligation._id
		);

		expect(first.outboundTransfers.length).toBeGreaterThan(0);
		expect(second.outboundTransfers).toHaveLength(first.outboundTransfers.length);

		const uniqueDispersalEntryIds = new Set(
			second.outboundTransfers.map((transfer) => `${transfer.dispersalEntryId}`)
		);
		expect(uniqueDispersalEntryIds.size).toBe(second.outboundTransfers.length);
	});

	it("failed inbound month does not post cash and recovery month succeeds cleanly", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap({
			seedCollectionRules: true,
			disableBalancePreCheck: true,
		});
		const pending = await harness.prepareMonthlyCycle(
			bootstrap.fixture.mortgageId,
			1
		);

		const transfer = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.inboundTransfer._id)
		);
		if (!transfer?.providerRef) {
			throw new Error("Expected providerRef on inbound transfer");
		}

		await harness.deliverTransferWebhook(pending.inboundTransfer._id, {
			provider: "mock_pad",
			providerEventId: "mock_evt_inbound_1_failed",
			normalizedEventType: "TRANSFER_FAILED",
			status: "failed",
			transactionId: transfer.providerRef,
			rawBody: JSON.stringify({
				status: "failed",
				transactionId: transfer.providerRef,
			}),
			payload: {
				errorCode: "NSF",
				reason: "mock failure",
			},
		});
		await harness.drainScheduledWork();

		const failedObligation = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.obligation._id)
		);
		expect(failedObligation?.status).toBe("due");

		const cashEntries = await harness.getCashEntriesForObligation(
			pending.obligation._id
		);
		expect(
			cashEntries.filter((entry) => entry.entryType === "CASH_RECEIVED")
		).toHaveLength(0);

		const failedAttempt = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.attempt._id)
		);
		expect(failedAttempt?.status).toBe("retry_scheduled");

		const retryEntry = await harness.createRetryEntryForPlanEntry(
			pending.planEntry._id
		);
		expect(retryEntry).toBeTruthy();
		if (!retryEntry) {
			throw new Error("Expected retry plan entry after failed inbound transfer");
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

		const retryAttempts = await harness.getCollectionAttemptsForPlanEntry(
			retryEntry._id
		);
		expect(retryAttempts).toHaveLength(1);

		const retryAttempt = retryAttempts[0];
		if (!retryAttempt) {
			throw new Error("Expected retry attempt to be created");
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
				providerData: { retry: true },
			},
		});
		await harness.drainScheduledWork();

		const recoveredObligation = await harness.t.run(async (ctx) =>
			ctx.db.get(pending.obligation._id)
		);
		expect(recoveredObligation?.status).toBe("settled");
		expect(recoveredObligation?.amountSettled).toBe(recoveredObligation?.amount);

		const recoveredCashEntries = await harness.getCashEntriesForObligation(
			pending.obligation._id
		);
		expect(
			recoveredCashEntries.filter((entry) => entry.entryType === "CASH_RECEIVED")
		).toHaveLength(1);
	});

	it("ownership transfer replay does not break supply or downstream allocations", async () => {
		const harness = createReliabilityHarness();
		const bootstrap = await harness.bootstrap();

		for (let paymentNumber = 1; paymentNumber <= 6; paymentNumber += 1) {
			await harness.runMonthlyCycle(bootstrap.fixture.mortgageId, paymentNumber);
		}

		await harness.transferOwnershipMidTerm({
			mortgageId: bootstrap.fixture.mortgageId,
			sellerLenderAuthId: bootstrap.fixture.lenderAAuthId,
			buyerLenderAuthId: bootstrap.fixture.lenderBAuthId,
			quantity: 2000,
			effectiveDate: "2026-06-20",
			idempotencyKey: "reliability-midterm-transfer-replay",
		});
		await harness.transferOwnershipMidTerm({
			mortgageId: bootstrap.fixture.mortgageId,
			sellerLenderAuthId: bootstrap.fixture.lenderAAuthId,
			buyerLenderAuthId: bootstrap.fixture.lenderBAuthId,
			quantity: 2000,
			effectiveDate: "2026-06-20",
			idempotencyKey: "reliability-midterm-transfer-replay",
		});

		await assertOwnershipIntegrity(harness, bootstrap, {
			lenderAUnits: 4000,
			lenderBUnits: 6000,
		});

		const monthSeven = await harness.runMonthlyCycle(
			bootstrap.fixture.mortgageId,
			7
		);
		await assertMonthlyLifecycleIntegrity(
			harness,
			bootstrap,
			monthSeven,
			ownershipExpectationForPayment(7)
		);
	});
});
