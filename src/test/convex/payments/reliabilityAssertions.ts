import { expect } from "vitest";
import {
	getCashAccountBalance,
	type CashAccountSpec,
	findCashAccount,
} from "../../../../convex/payments/cashLedger/accounts";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	LifecycleMonthRecord,
	OwnershipExpectation,
	ReliabilityBootstrap,
	ReliabilityHarness,
} from "./reliabilityHarness";
import { sumAmounts } from "./reliabilityHarness";

function getExpectedFraction(units: number) {
	return units / 10_000;
}

function getTransferTargetState(
	eventType: "FUNDS_SETTLED" | "TRANSFER_FAILED" | "TRANSFER_REVERSED"
) {
	switch (eventType) {
		case "FUNDS_SETTLED":
			return "confirmed";
		case "TRANSFER_FAILED":
			return "failed";
		case "TRANSFER_REVERSED":
			return "reversed";
		default:
			return "confirmed";
	}
}

async function getCashAccount(
	harness: ReliabilityHarness,
	spec: CashAccountSpec
) {
	return harness.t.run(async (ctx) => findCashAccount(ctx.db, spec));
}

export async function assertScheduleIntegrity(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap
) {
	const obligations = await harness.getObligations(bootstrap.fixture.mortgageId);
	expect(obligations).toHaveLength(12);
	expect(obligations.map((obligation) => obligation.paymentNumber)).toEqual(
		Array.from({ length: 12 }, (_, index) => index + 1)
	);

	const planEntries = await harness.getPlanEntries(bootstrap.fixture.mortgageId);
	expect(planEntries).toHaveLength(12);

	for (const obligation of obligations) {
		const planEntry = planEntries.find((entry) =>
			entry.obligationIds.includes(obligation._id)
		);
		expect(planEntry, `Missing plan entry for obligation ${obligation._id}`).toBeTruthy();
		expect(planEntry?.scheduledDate).toBe(obligation.dueDate);
		expect(planEntry?.method).toBe("mock_pad");
	}
}

export async function assertInboundSettlementIntegrity(
	harness: ReliabilityHarness,
	record: LifecycleMonthRecord
) {
	const obligation = await harness.t.run(async (ctx) =>
		ctx.db.get(record.obligationId)
	);
	const attempt = await harness.t.run(async (ctx) => ctx.db.get(record.attemptId));
	const transfer = await harness.t.run(async (ctx) =>
		ctx.db.get(record.inboundTransferId)
	);

	expect(obligation?.status).toBe("settled");
	expect(obligation?.amountSettled).toBe(obligation?.amount);
	expect(attempt?.status).toBe("confirmed");
	expect(attempt?.transferRequestId).toEqual(record.inboundTransferId);
	expect(transfer?.status).toBe("confirmed");
	expect(transfer?.collectionAttemptId).toEqual(record.attemptId);

	const cashReceipts = (await harness.getCashEntriesForAttempt(record.attemptId)).filter(
		(entry) => entry.entryType === "CASH_RECEIVED"
	);
	expect(cashReceipts).toHaveLength(1);
	expect(cashReceipts[0]?.obligationId).toEqual(record.obligationId);
	expect(cashReceipts[0]?.attemptId).toEqual(record.attemptId);

	const webhookEvents = await harness.getWebhookEventsForTransfer(
		record.inboundTransferId
	);
	expect(webhookEvents).toHaveLength(1);
	expect(webhookEvents[0]?.normalizedEventType).toBe("FUNDS_SETTLED");
	expect(webhookEvents[0]?.status).toBe("processed");
	expect(webhookEvents[0]?.transferRequestId).toEqual(record.inboundTransferId);

	if (!obligation) {
		throw new Error(`Obligation ${record.obligationId} not found`);
	}

	const receivableAccount = await getCashAccount(harness, {
		family: "BORROWER_RECEIVABLE",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
	});
	expect(receivableAccount).toBeTruthy();
	expect(
		receivableAccount ? getCashAccountBalance(receivableAccount) : null
	).toBe(0n);
}

export async function assertDispersalIntegrity(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap,
	record: LifecycleMonthRecord,
	expectation: OwnershipExpectation
) {
	const dispersalEntries = await harness.getDispersalEntriesForObligation(
		record.obligationId
	);
	expect(dispersalEntries).toHaveLength(2);

	const servicingFeeEntry = await harness.getServicingFeeEntryForObligation(
		record.obligationId
	);
	expect(servicingFeeEntry).toBeTruthy();

	const totalDispersed = sumAmounts(dispersalEntries);
	const settledAmount =
		dispersalEntries[0]?.calculationDetails.settledAmount ?? 0;
	const distributableAmount =
		dispersalEntries[0]?.calculationDetails.distributableAmount ?? 0;

	expect(totalDispersed).toBe(distributableAmount);
	expect(totalDispersed + (servicingFeeEntry?.amount ?? 0)).toBe(settledAmount);

	const lenderAEntry = dispersalEntries.find(
		(entry) => entry.lenderId === bootstrap.fixture.lenderAId
	);
	const lenderBEntry = dispersalEntries.find(
		(entry) => entry.lenderId === bootstrap.fixture.lenderBId
	);

	expect(lenderAEntry).toBeTruthy();
	expect(lenderBEntry).toBeTruthy();

	expect(
		lenderAEntry?.calculationDetails.ownershipUnits,
		"Unexpected lender A units on dispersal entry"
	).toBe(expectation.lenderAUnits);
	expect(
		lenderBEntry?.calculationDetails.ownershipUnits,
		"Unexpected lender B units on dispersal entry"
	).toBe(expectation.lenderBUnits);
	expect(
		lenderAEntry?.calculationDetails.ownershipFraction ?? 0
	).toBeCloseTo(getExpectedFraction(expectation.lenderAUnits), 5);
	expect(
		lenderBEntry?.calculationDetails.ownershipFraction ?? 0
	).toBeCloseTo(getExpectedFraction(expectation.lenderBUnits), 5);
}

export async function assertOutboundPayoutIntegrity(
	harness: ReliabilityHarness,
	record: LifecycleMonthRecord
) {
	expect(record.outboundTransferIds.length).toBeGreaterThan(0);

	for (const transferId of record.outboundTransferIds) {
		const transfer = await harness.t.run(async (ctx) => ctx.db.get(transferId));
		expect(transfer?.status).toBe("confirmed");

		const webhookEvents = await harness.getWebhookEventsForTransfer(transferId);
		expect(webhookEvents).toHaveLength(1);
		expect(webhookEvents[0]?.normalizedEventType).toBe("FUNDS_SETTLED");
		expect(webhookEvents[0]?.status).toBe("processed");

		const payoutEntries = await harness.t.run(async (ctx) =>
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transferId)
				)
				.collect()
		);
		expect(
			payoutEntries.filter((entry) => entry.entryType === "LENDER_PAYOUT_SENT")
		).toHaveLength(1);
	}

	const obligation = await harness.t.run(async (ctx) =>
		ctx.db.get(record.obligationId)
	);
	if (!obligation) {
		throw new Error(`Obligation ${record.obligationId} not found`);
	}

	const trustCash = await getCashAccount(harness, {
		family: "TRUST_CASH",
		mortgageId: obligation.mortgageId,
	});
	expect(trustCash).toBeTruthy();
	expect(trustCash ? getCashAccountBalance(trustCash) >= 0n : false).toBe(true);
}

export async function assertLenderPayablesZero(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap
) {
	for (const lenderId of [
		bootstrap.fixture.lenderAId,
		bootstrap.fixture.lenderBId,
	]) {
		const payable = await getCashAccount(harness, {
			family: "LENDER_PAYABLE",
			mortgageId: bootstrap.fixture.mortgageId,
			lenderId,
		});
		expect(payable).toBeTruthy();
		expect(payable ? getCashAccountBalance(payable) : null).toBe(0n);
	}
}

export async function assertOwnershipIntegrity(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap,
	expectation: OwnershipExpectation
) {
	const invariant = await harness.validateSupplyInvariant(bootstrap.fixture.mortgageId);
	expect(invariant.valid).toBe(true);

	const balances = await harness.getPositionBalances(bootstrap.fixture.mortgageId);
	expect(balances[bootstrap.fixture.lenderAAuthId]).toBe(expectation.lenderAUnits);
	expect(balances[bootstrap.fixture.lenderBAuthId]).toBe(expectation.lenderBUnits);

	const totalOutstanding = Object.values(balances).reduce(
		(total, balance) => total + balance,
		0
	);
	expect(totalOutstanding).toBe(10_000);
}

export async function assertLifecycleAuditIntegrity(
	harness: ReliabilityHarness,
	record: LifecycleMonthRecord
) {
	const planEntry = await harness.t.run(async (ctx) =>
		ctx.db.get(record.planEntryId)
	);
	const attempt = await harness.t.run(async (ctx) => ctx.db.get(record.attemptId));
	const transfer = await harness.t.run(async (ctx) =>
		ctx.db.get(record.inboundTransferId)
	);

	expect(planEntry?.collectionAttemptId).toEqual(record.attemptId);
	expect(attempt?.transferRequestId).toEqual(record.inboundTransferId);
	expect(transfer?.collectionAttemptId).toEqual(record.attemptId);

	const cashReceipts = await harness.getCashEntriesForAttempt(record.attemptId);
	expect(
		cashReceipts.some((entry) => entry.obligationId === record.obligationId)
	).toBe(true);

	for (const transferId of record.outboundTransferIds) {
		const transferRows = await harness.t.run(async (ctx) =>
			ctx.db
				.query("transferRequests")
				.filter((q) => q.eq(q.field("_id"), transferId))
				.collect()
		);
		expect(transferRows).toHaveLength(1);
	}
}

export async function assertMonthlyLifecycleIntegrity(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap,
	record: LifecycleMonthRecord,
	expectation: OwnershipExpectation
) {
	await assertInboundSettlementIntegrity(harness, record);
	await assertDispersalIntegrity(harness, bootstrap, record, expectation);
	await assertOutboundPayoutIntegrity(harness, record);
	await assertLenderPayablesZero(harness, bootstrap);
	await assertOwnershipIntegrity(harness, bootstrap, expectation);
	await assertLifecycleAuditIntegrity(harness, record);
}

export async function assertFinalLifecycleTotals(
	harness: ReliabilityHarness,
	bootstrap: ReliabilityBootstrap
) {
	const obligations = await harness.getObligations(bootstrap.fixture.mortgageId);
	expect(obligations).toHaveLength(12);
	expect(obligations.every((obligation) => obligation.status === "settled")).toBe(
		true
	);

	const inboundTransfers = await harness.t.run(async (ctx) =>
		ctx.db
			.query("transferRequests")
			.filter((q) =>
				q.and(
					q.eq(q.field("mortgageId"), bootstrap.fixture.mortgageId),
					q.eq(q.field("direction"), "inbound")
				)
			)
			.collect()
	);
	const outboundTransfers = await harness.t.run(async (ctx) =>
		ctx.db
			.query("transferRequests")
			.filter((q) =>
				q.and(
					q.eq(q.field("mortgageId"), bootstrap.fixture.mortgageId),
					q.eq(q.field("direction"), "outbound")
				)
			)
			.collect()
	);
	const servicingFeeEntries = await harness.t.run(async (ctx) =>
		ctx.db
			.query("servicingFeeEntries")
			.withIndex("by_mortgage", (q) =>
				q.eq("mortgageId", bootstrap.fixture.mortgageId)
			)
			.collect()
	);

	const inboundSettledTotal = sumAmounts(
		inboundTransfers.filter((transfer) => transfer.status === "confirmed")
	);
	const outboundSettledTotal = sumAmounts(
		outboundTransfers.filter((transfer) => transfer.status === "confirmed")
	);
	const servicingRevenue = sumAmounts(servicingFeeEntries);
	const obligationTotal = sumAmounts(obligations);

	expect(inboundSettledTotal).toBe(obligationTotal);
	expect(outboundSettledTotal + servicingRevenue).toBe(obligationTotal);

	await assertLenderPayablesZero(harness, bootstrap);
	await assertOwnershipIntegrity(harness, bootstrap, {
		lenderAUnits: 4000,
		lenderBUnits: 6000,
	});

	const mortgage = await harness.t.run(async (ctx) =>
		ctx.db.get(bootstrap.fixture.mortgageId)
	);
	expect(mortgage?.status).toBe("matured");
}

export async function assertTransferWebhookStatus(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">,
	eventType: "FUNDS_SETTLED" | "TRANSFER_FAILED" | "TRANSFER_REVERSED"
) {
	const webhookEvents = await harness.getWebhookEventsForTransfer(transferId);
	expect(webhookEvents).toHaveLength(1);
	expect(webhookEvents[0]?.normalizedEventType).toBe(eventType);

	const transfer = await harness.t.run(async (ctx) => ctx.db.get(transferId));
	expect(transfer?.status).toBe(getTransferTargetState(eventType));
}

export async function assertSingleCashReceipt(
	harness: ReliabilityHarness,
	attemptId: Id<"collectionAttempts">
) {
	const entries = await harness.getCashEntriesForAttempt(attemptId);
	expect(entries.filter((entry) => entry.entryType === "CASH_RECEIVED")).toHaveLength(
		1
	);
}

export async function assertSingleLenderPayoutForTransfer(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">
) {
	const entries = await harness.t.run(async (ctx) =>
		ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) => q.eq("transferRequestId", transferId))
			.collect()
	);
	expect(
		entries.filter((entry) => entry.entryType === "LENDER_PAYOUT_SENT")
	).toHaveLength(1);
}
