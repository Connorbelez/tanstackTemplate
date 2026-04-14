import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { buildNormalizedOccurrenceFromRotessaRow } from "../../../../convex/payments/rotessa/financialTransactions";
import {
	mapRotessaPadStatusToTransferEvent,
	type RotessaPadWebhookEvent,
} from "../../../../convex/payments/webhooks/rotessaPad";
import { getTransferProvider } from "../../../../convex/payments/transfers/providers/registry";
import {
	createReliabilityHarness,
	type ReliabilityHarness,
	teardownReliabilityHarness,
} from "./reliabilityHarness";

type RotessaFinancialTransactionStatus =
	| "Future"
	| "Pending"
	| "Approved"
	| "Declined";

interface RotessaFinancialTransactionFixture {
	account_number: string;
	amount: string;
	comment: string | null;
	created_at: string;
	custom_identifier: string | null;
	customer_id: number;
	earliest_approval_date: string | null;
	id: number;
	institution_number: string | null;
	process_date: string;
	settlement_date: string | null;
	status: RotessaFinancialTransactionStatus;
	status_reason: string | null;
	transaction_number: string | null;
	transaction_schedule_id: number;
	transit_number: string | null;
	updated_at: string | null;
}

function makeTransactionReportRow(
	overrides: Partial<RotessaFinancialTransactionFixture> = {}
): RotessaFinancialTransactionFixture {
	return {
		account_number: "*******23",
		amount: "100.00",
		comment: "",
		created_at: "2020-12-04T16:03:21.000-06:00",
		custom_identifier: "TS1234",
		customer_id: 182374,
		earliest_approval_date: "2020-12-08",
		id: 1_950_625,
		institution_number: "*23",
		process_date: "2026-01-15",
		settlement_date: "2026-01-20",
		status: "Future",
		status_reason: null,
		transaction_number: "INV1980184",
		transaction_schedule_id: 781_754,
		transit_number: "***45",
		updated_at: "2020-12-08T10:42:49.000-06:00",
		...overrides,
	};
}

async function getTransfer(
	harness: ReliabilityHarness,
	transferId: Id<"transferRequests">
) {
	const transfer = await harness.t.run(async (ctx) => ctx.db.get(transferId));
	if (!transfer) {
		throw new Error(`Expected transfer ${transferId}`);
	}
	return transfer;
}

async function getAttempt(
	harness: ReliabilityHarness,
	attemptId: Id<"collectionAttempts">
) {
	const attempt = await harness.t.run(async (ctx) => ctx.db.get(attemptId));
	if (!attempt) {
		throw new Error(`Expected attempt ${attemptId}`);
	}
	return attempt;
}

async function getObligation(
	harness: ReliabilityHarness,
	obligationId: Id<"obligations">
) {
	const obligation = await harness.t.run(async (ctx) => ctx.db.get(obligationId));
	if (!obligation) {
		throw new Error(`Expected obligation ${obligationId}`);
	}
	return obligation;
}

async function makeObligationDue(
	harness: ReliabilityHarness,
	obligationId: Id<"obligations">
) {
	const obligation = await getObligation(harness, obligationId);
	vi.setSystemTime(new Date(obligation.dueDate + 1_000));
	await harness.t.action(
		internal.payments.obligations.crons.processObligationTransitions,
		{}
	);
	await harness.drainScheduledWork();
	return getObligation(harness, obligationId);
}

async function seedRotessaManagedOccurrence(
	harness: ReliabilityHarness,
	args: {
		obligationId: Id<"obligations">;
		planEntryId: Id<"collectionPlanEntries">;
		transactionId: string;
	}
) {
	const obligation = await makeObligationDue(harness, args.obligationId);
	const planEntry = await harness.getPlanEntryForObligation(args.obligationId);
	const createdAt = Date.now();

	const seeded = await harness.t.run(async (ctx) => {
		const attemptId = await ctx.db.insert("collectionAttempts", {
			status: "pending",
			machineContext: {
				attemptId: "",
				maxRetries: 3,
				retryCount: 0,
			},
			lastTransitionAt: createdAt,
			planEntryId: args.planEntryId,
			mortgageId: planEntry.mortgageId,
			obligationIds: planEntry.obligationIds,
			method: "rotessa_pad",
			amount: planEntry.amount,
			initiatedAt: createdAt,
		});

		const transferId = await ctx.db.insert("transferRequests", {
			status: "pending",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: planEntry.amount,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: `${obligation.borrowerId}`,
			providerCode: "pad_rotessa",
			providerRef: args.transactionId,
			idempotencyKey: `rotessa-managed:${args.planEntryId}:${args.transactionId}`,
			source: {
				actorId: "rotessa-managed-test",
				actorType: "system",
				channel: "api_webhook",
			},
			mortgageId: obligation.mortgageId,
			obligationId: obligation._id,
			borrowerId: obligation.borrowerId,
			planEntryId: args.planEntryId,
			collectionAttemptId: attemptId,
			createdAt,
			lastTransitionAt: createdAt,
		});

		await ctx.db.patch(attemptId, {
			transferRequestId: transferId,
		});
		await ctx.db.patch(args.planEntryId, {
			collectionAttemptId: attemptId,
			method: "rotessa_pad",
			status: "executing",
		});

		return { attemptId, transferId };
	});

	return {
		attempt: await getAttempt(harness, seeded.attemptId),
		inboundTransfer: await getTransfer(harness, seeded.transferId),
		obligation,
		planEntry,
	};
}

async function persistWebhookEvent(
	harness: ReliabilityHarness,
	event: RotessaPadWebhookEvent
) {
	return harness.t.run(async (ctx) =>
		ctx.db.insert("webhookEvents", {
			provider: "pad_rotessa",
			providerEventId: event.data.event_id ?? event.data.transaction_id,
			rawBody: JSON.stringify(event),
			status: "pending",
			receivedAt: Date.now(),
			attempts: 0,
			signatureVerified: true,
		})
	);
}

async function processRotessaWebhook(
	harness: ReliabilityHarness,
	event: RotessaPadWebhookEvent
) {
	const webhookEventId = await persistWebhookEvent(harness, event);

	await harness.t.action(
		internal.payments.webhooks.rotessaPad.processRotessaPadWebhook,
		{
			webhookEventId,
			transactionId: event.data.transaction_id,
			eventType: event.event_type,
			eventId: event.data.event_id,
			reason: event.data.reason,
			returnCode: event.data.return_code,
			date: event.data.date,
		}
	);
	await harness.drainScheduledWork();
	return webhookEventId;
}

function makeRotessaWebhookEvent(args: {
	amount: number;
	date: string;
	eventId: string;
	eventType: string;
	reason?: string;
	returnCode?: string;
	transactionId: string;
}): RotessaPadWebhookEvent {
	return {
		data: {
			amount: args.amount,
			date: args.date,
			event_id: args.eventId,
			reason: args.reason,
			return_code: args.returnCode,
			transaction_id: args.transactionId,
		},
		event_type: args.eventType,
	};
}

function businessDateForObligation(obligation: Doc<"obligations">) {
	return new Date(obligation.dueDate).toISOString().slice(0, 10);
}

describe("Rotessa managed recurring lifecycle contracts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("ROTESSA_API_KEY", "test-rotessa-key");
	});

	afterEach(() => {
		teardownReliabilityHarness();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	describe("pull-based transaction_report sync", () => {
		it('resolves "pad_rotessa" for poll-based status retrieval', () => {
			const provider = getTransferProvider("pad_rotessa");
			expect(provider).toBeDefined();
		});

		it.each([
			["Future", "PROCESSING_UPDATE"],
			["Pending", "PROCESSING_UPDATE"],
			["Approved", "FUNDS_SETTLED"],
			["Declined", "TRANSFER_FAILED"],
		] as const)(
			'normalizes polled Rotessa transaction_report status "%s"',
			(status, expected) => {
				const row = makeTransactionReportRow({ status });

				// Current closest seam is the Rotessa PAD normalizer used by webhook
				// handling. When pull sync lands, this expectation should move to the
				// dedicated transaction-report mapper.
				expect(mapRotessaPadStatusToTransferEvent(row.status)).toBe(expected);
			}
		);

		it("polls 12 monthly Rotessa transaction_report rows through Future -> Pending -> Approved", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const provider = getTransferProvider("pad_rotessa");

			for (let paymentNumber = 1; paymentNumber <= 12; paymentNumber += 1) {
				const baseRow = makeTransactionReportRow({
					id: 1_950_625 + paymentNumber,
					process_date: `2026-${String(paymentNumber).padStart(2, "0")}-15`,
					status: "Future",
					transaction_number: `INV1980${paymentNumber}`,
					transaction_schedule_id: 781_754,
				});

				fetchMock.mockResolvedValueOnce({
					ok: true,
					json: async () => [baseRow],
				});
				const future = await provider.getStatus(baseRow.transaction_number);
				expect(future.status).toBe("pending");
				expect(future.providerData).toMatchObject({
					rotessaFinancialTransactionId: baseRow.id,
					rotessaTransactionStatus: "Future",
				});

				const pendingRow = { ...baseRow, status: "Pending" as const };
				fetchMock.mockResolvedValueOnce({
					ok: true,
					json: async () => [pendingRow],
				});
				const pending = await provider.getStatus(pendingRow.transaction_number);
				expect(pending.status).toBe("processing");
				expect(pending.providerData).toMatchObject({
					rotessaFinancialTransactionId: pendingRow.id,
					rotessaTransactionStatus: "Pending",
				});

				const approvedRow = {
					...baseRow,
					earliest_approval_date: `2026-${String(paymentNumber).padStart(2, "0")}-20`,
					settlement_date: `2026-${String(paymentNumber).padStart(2, "0")}-20`,
					status: "Approved" as const,
				};
				fetchMock.mockResolvedValueOnce({
					ok: true,
					json: async () => [approvedRow],
				});
				const approved = await provider.getStatus(
					approvedRow.transaction_number
				);
				expect(approved.status).toBe("confirmed");
				expect(approved.providerData).toMatchObject({
					rotessaFinancialTransactionId: approvedRow.id,
					rotessaTransactionStatus: "Approved",
				});
			}
		});

		it("polls a declined NSF Rotessa transaction and returns a failed provider status", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const provider = getTransferProvider("pad_rotessa");
			const declinedRow = makeTransactionReportRow({
				id: 1_950_999,
				process_date: "2026-01-15",
				settlement_date: "2026-01-20",
				status: "Declined",
				status_reason: "NSF",
			});

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => [declinedRow],
			});

			const result = await provider.getStatus(
				declinedRow.transaction_number
			);

			expect(result.status).toBe("failed");
			expect(result.providerData).toMatchObject({
				rotessaFinancialTransactionId: declinedRow.id,
				rotessaTransactionStatus: "Declined",
				statusReason: "NSF",
			});
		});

		it("throws when the polled transaction report window does not include the provider ref", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const provider = getTransferProvider("pad_rotessa");
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => [
					makeTransactionReportRow({
						id: 1_951_111,
						process_date: "2026-01-15",
						status: "Pending",
						transaction_number: "INV198099",
						transaction_schedule_id: 781_754,
					}),
				],
			});

			await expect(provider.getStatus("missing_rotessa_ref")).rejects.toThrow(
				'Rotessa transaction "missing_rotessa_ref" was not found in the transaction report window.'
			);
		});

		it("paginates transaction_report lookups until the requested provider ref is found past page ten", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const provider = getTransferProvider("pad_rotessa");
			const fullPageRows = Array.from({ length: 1000 }, (_, index) =>
				makeTransactionReportRow({
					id: 2_000_000 + index,
					transaction_number: `other_${index}`,
				})
			);
			const secondPageRow = makeTransactionReportRow({
				id: 3_000_001,
				status: "Approved",
				transaction_number: "target_txn",
			});

			for (let page = 0; page < 10; page += 1) {
				fetchMock.mockResolvedValueOnce({
					ok: true,
					json: async () => fullPageRows,
				});
			}
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => [secondPageRow],
			});

			const result = await provider.getStatus("target_txn");

			expect(fetchMock).toHaveBeenCalledTimes(11);
			expect(result.status).toBe("confirmed");
			expect(result.providerData).toMatchObject({
				rotessaFinancialTransactionId: secondPageRow.id,
				rotessaTransactionStatus: "Approved",
			});
		});

		it("rejects invalid provider amounts during occurrence normalization", () => {
			expect(() =>
				buildNormalizedOccurrenceFromRotessaRow({
					externalScheduleRef: "987",
					receivedVia: "poller",
					row: makeTransactionReportRow({
						amount: "NaN",
						status: "Pending",
						transaction_number: "invalid_amount_txn",
					}),
				})
			).toThrow('Rotessa invalid provider amount: "NaN"');
		});

		it("uses the raw Rotessa row id as providerRef when transaction_number is absent", () => {
			const event = buildNormalizedOccurrenceFromRotessaRow({
				externalScheduleRef: "987",
				receivedVia: "poller",
				row: makeTransactionReportRow({
					id: 198099,
					status: "Pending",
					transaction_number: null,
				}),
			});

			expect(event.providerRef).toBe("198099");
			expect(event.externalOccurrenceRef).toBe(
				"rotessa_financial_transaction:198099"
			);
		});
	});

	describe("webhook-driven recurring occurrences", () => {
		it("settles a 12-month cycle through Future -> Pending -> Approved", async () => {
			const harness = createReliabilityHarness();
			const { fixture } = await harness.bootstrap({
				seedCollectionRules: true,
			});

			for (let paymentNumber = 1; paymentNumber <= 12; paymentNumber += 1) {
				const scheduledObligation = await harness.getObligationByPaymentNumber(
					fixture.mortgageId,
					paymentNumber
				);
				const scheduledPlanEntry = await harness.getPlanEntryForObligation(
					scheduledObligation._id
				);
				const attemptsBefore = await harness.getCollectionAttemptsForPlanEntry(
					scheduledPlanEntry._id
				);

				expect(attemptsBefore).toHaveLength(0);

				const rotessaTransactionId = `rotessa_txn_${paymentNumber}`;
				const pending = await seedRotessaManagedOccurrence(harness, {
					obligationId: scheduledObligation._id,
					planEntryId: scheduledPlanEntry._id,
					transactionId: rotessaTransactionId,
				});
				const processDate = businessDateForObligation(pending.obligation);

				await processRotessaWebhook(
					harness,
					makeRotessaWebhookEvent({
						amount: pending.inboundTransfer.amount / 100,
						date: processDate,
						eventId: `evt_pending_${paymentNumber}`,
						eventType: "transaction.pending",
						transactionId: rotessaTransactionId,
					})
				);

				const processingTransfer = await getTransfer(
					harness,
					pending.inboundTransfer._id
				);
				const processingAttempt = await getAttempt(harness, pending.attempt._id);

				expect(processingTransfer.status).toBe("processing");
				expect(processingAttempt.status).toBe("pending");

				await processRotessaWebhook(
					harness,
					makeRotessaWebhookEvent({
						amount: pending.inboundTransfer.amount / 100,
						date: processDate,
						eventId: `evt_approved_${paymentNumber}`,
						eventType: "transaction.completed",
						transactionId: rotessaTransactionId,
					})
				);

				const confirmedTransfer = await getTransfer(
					harness,
					pending.inboundTransfer._id
				);
				const confirmedAttempt = await getAttempt(harness, pending.attempt._id);
				const settledObligation = await getObligation(
					harness,
					pending.obligation._id
				);

				expect(confirmedTransfer.status).toBe("confirmed");
				expect(confirmedAttempt.status).toBe("confirmed");
				expect(settledObligation.status).toBe("settled");
			}

			const obligations = await harness.getObligations(fixture.mortgageId);
			expect(obligations).toHaveLength(12);
			expect(obligations.every((obligation) => obligation.status === "settled")).toBe(
				true
			);
		});

		it("routes a Rotessa NSF decline into retry scheduling on the current collection attempt", async () => {
			const harness = createReliabilityHarness();
			const { fixture } = await harness.bootstrap({
				seedCollectionRules: true,
			});

			const rotessaTransactionId = "rotessa_txn_nsf_1";
			const scheduledObligation = await harness.getObligationByPaymentNumber(
				fixture.mortgageId,
				1
			);
			const scheduledPlanEntry = await harness.getPlanEntryForObligation(
				scheduledObligation._id
			);
			const pending = await seedRotessaManagedOccurrence(harness, {
				obligationId: scheduledObligation._id,
				planEntryId: scheduledPlanEntry._id,
				transactionId: rotessaTransactionId,
			});
			const processDate = businessDateForObligation(pending.obligation);

			await processRotessaWebhook(
				harness,
				makeRotessaWebhookEvent({
					amount: pending.inboundTransfer.amount / 100,
					date: processDate,
					eventId: "evt_pending_nsf_1",
					eventType: "transaction.pending",
					transactionId: rotessaTransactionId,
				})
			);

			await processRotessaWebhook(
				harness,
				makeRotessaWebhookEvent({
					amount: pending.inboundTransfer.amount / 100,
					date: processDate,
					eventId: "evt_declined_nsf_1",
					eventType: "transaction.nsf",
					reason: "NSF",
					returnCode: "NSF",
					transactionId: rotessaTransactionId,
				})
			);

			const failedTransfer = await getTransfer(harness, pending.inboundTransfer._id);
			const failedAttempt = await getAttempt(harness, pending.attempt._id);
			const obligation = await getObligation(harness, pending.obligation._id);

			expect(failedTransfer.status).toBe("failed");
			expect(failedAttempt.status).toBe("retry_scheduled");
			expect(failedAttempt.failureReason).toContain("NSF");
			expect(obligation.status).toBe("due");
		});
	});
});
