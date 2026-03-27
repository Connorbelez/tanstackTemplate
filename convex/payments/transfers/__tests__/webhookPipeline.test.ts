/**
 * T-008: Webhook simulation → transfer state transition pipeline
 * T-009: Webhook deduplication — same eventId processed twice → zero additional state changes
 *
 * Pure unit tests validating the MockTransferProvider webhook flow through
 * the XState transfer machine state transitions.
 */

import { describe, expect, it } from "vitest";
import { getInitialSnapshot, transition } from "xstate";
import { transferMachine } from "../../../engine/machines/transfer.machine";
import type { TransferRequestInput } from "../interface";
import {
	MockTransferProvider,
	type MockWebhookPayload,
} from "../providers/mock";
import type { DomainEntityId } from "../types";

// ── Test Helpers ─────────────────────────────────────────────────────────

/** Deterministic UUID counter for test reproducibility. */
function createDeterministicUUID() {
	let counter = 0;
	return () => {
		counter++;
		return `test-uuid-${String(counter).padStart(4, "0")}`;
	};
}

/** Create a mock transfer request input for testing. */
function createTestTransferRequest(
	overrides: Partial<TransferRequestInput> = {}
): TransferRequestInput {
	return {
		amount: 10_000,
		counterpartyId: "borrower-001" as DomainEntityId,
		counterpartyType: "borrower",
		currency: "CAD",
		direction: "inbound",
		idempotencyKey: "test-idem-001",
		providerCode: "mock_pad",
		references: {},
		source: { channel: "scheduler", actorType: "system" },
		transferType: "borrower_interest_collection",
		...overrides,
	};
}

/** Replay events through the transfer machine and return the final snapshot. */
function snapshotAt(
	...events: Parameters<typeof transition>[2][]
): ReturnType<typeof getInitialSnapshot<typeof transferMachine>> {
	let snap = getInitialSnapshot(transferMachine);
	for (const event of events) {
		const [next] = transition(transferMachine, snap, event);
		snap = next;
	}
	return snap;
}

/** Get the action types produced by a transition. */
function actionTypes(
	...args: Parameters<typeof transition<typeof transferMachine>>
): string[] {
	const [, actions] = transition(...args);
	return actions.map((a) => a.type);
}

// ── T-008: Webhook Simulation → Transfer State Transition Pipeline ──────

describe("T-008: Webhook simulation → transfer state transition pipeline", () => {
	describe("MockTransferProvider in async mode creates pending transfer", () => {
		it("initiates a transfer in async mode with pending status", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const result = await provider.initiate(createTestTransferRequest());
			expect(result.status).toBe("pending");
			expect(result.providerRef).toContain("mock_pad_");
		});

		it("initiates a transfer in immediate mode with confirmed status", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "immediate",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const result = await provider.initiate(createTestTransferRequest());
			expect(result.status).toBe("confirmed");
		});
	});

	describe("simulateWebhook('confirmed') produces FUNDS_SETTLED payload", () => {
		it("maps 'confirmed' event to FUNDS_SETTLED mappedTransferEvent", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "confirmed");

			expect(payload.mappedTransferEvent).toBe("FUNDS_SETTLED");
			expect(payload.status).toBe("completed");
			expect(payload.transactionId).toBe(providerRef);
			expect(payload.amount).toBe(10_000);
		});

		it("maps 'failed' event to TRANSFER_FAILED mappedTransferEvent", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "failed");

			expect(payload.mappedTransferEvent).toBe("TRANSFER_FAILED");
			expect(payload.status).toBe("failed");
			expect(payload.reason).toBe("NSF");
		});

		it("maps 'reversed' event to TRANSFER_REVERSED mappedTransferEvent", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			// First confirm, then reverse (reversed only valid after confirmed in provider)
			await provider.simulateWebhook(providerRef, "confirmed");
			const payload = await provider.simulateWebhook(providerRef, "reversed");

			expect(payload.mappedTransferEvent).toBe("TRANSFER_REVERSED");
			expect(payload.status).toBe("returned");
			expect(payload.reason).toBe("Simulated reversal");
		});
	});

	describe("webhook payload maps to XState FUNDS_SETTLED event producing correct state", () => {
		it("pending transfer + FUNDS_SETTLED → confirmed state", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "confirmed");

			// Verify the webhook produces the correct mapped event
			expect(payload.mappedTransferEvent).toBe("FUNDS_SETTLED");

			// Now apply that mapped event to the state machine
			// Start at initiated, transition to pending via PROVIDER_INITIATED
			const pendingSnap = snapshotAt({
				type: "PROVIDER_INITIATED",
				providerRef,
			});
			expect(pendingSnap.value).toBe("pending");

			// Apply FUNDS_SETTLED
			const [confirmedSnap] = transition(transferMachine, pendingSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_000_000,
				providerData: {},
			});
			expect(confirmedSnap.value).toBe("confirmed");
		});

		it("FUNDS_SETTLED transition fires publishTransferConfirmed action", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "confirmed");

			expect(payload.mappedTransferEvent).toBe("FUNDS_SETTLED");

			const pendingSnap = snapshotAt({
				type: "PROVIDER_INITIATED",
				providerRef,
			});

			const actions = actionTypes(transferMachine, pendingSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_000_000,
				providerData: {},
			});
			expect(actions).toEqual(["publishTransferConfirmed"]);
		});
	});

	describe("webhook payload maps to TRANSFER_FAILED event producing correct state", () => {
		it("pending transfer + TRANSFER_FAILED → failed state", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "failed");

			expect(payload.mappedTransferEvent).toBe("TRANSFER_FAILED");

			const pendingSnap = snapshotAt({
				type: "PROVIDER_INITIATED",
				providerRef,
			});

			const [failedSnap] = transition(transferMachine, pendingSnap, {
				type: "TRANSFER_FAILED",
				errorCode: payload.reason ?? "NSF",
				reason: payload.reason ?? "Unknown",
			});
			expect(failedSnap.value).toBe("failed");
		});
	});

	describe("webhook payload maps to TRANSFER_REVERSED event producing correct state", () => {
		it("confirmed transfer + TRANSFER_REVERSED → reversed state", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);

			// Confirm first
			await provider.simulateWebhook(providerRef, "confirmed");

			// Then reverse
			const reversalPayload = await provider.simulateWebhook(
				providerRef,
				"reversed"
			);
			expect(reversalPayload.mappedTransferEvent).toBe("TRANSFER_REVERSED");

			// Apply to state machine: initiated → pending → confirmed → reversed
			const confirmedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef },
				{
					type: "FUNDS_SETTLED",
					settledAt: 1_700_000_000_000,
					providerData: {},
				}
			);
			expect(confirmedSnap.value).toBe("confirmed");

			const [reversedSnap] = transition(transferMachine, confirmedSnap, {
				type: "TRANSFER_REVERSED",
				reversalRef: reversalPayload.providerEventId,
				reason: reversalPayload.reason ?? "reversal",
			});
			expect(reversedSnap.value).toBe("reversed");
		});
	});

	describe("webhook payload structure", () => {
		it("contains all required fields", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "confirmed");

			expect(payload.eventId).toBeDefined();
			expect(payload.providerEventId).toBeDefined();
			expect(payload.transactionId).toBe(providerRef);
			expect(payload.amount).toBe(10_000);
			expect(payload.provider).toBe("mock_pad");
			expect(payload.timestamp).toBeDefined();
			expect(payload.rawBody).toBeDefined();
			expect(typeof payload.rawBody).toBe("string");
		});

		it("rawBody is valid JSON containing event details", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			const payload = await provider.simulateWebhook(providerRef, "confirmed");

			const parsed = JSON.parse(payload.rawBody) as Record<string, unknown>;
			expect(parsed.event_id).toBe(payload.eventId);
			expect(parsed.transaction_id).toBe(providerRef);
			expect(parsed.status).toBe("completed");
			expect(parsed.amount).toBe(10_000);
		});
	});

	describe("dispatchWebhook callback integration", () => {
		it("calls dispatchWebhook when provided", async () => {
			const dispatched: MockWebhookPayload[] = [];
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
				dispatchWebhook: (payload) => {
					dispatched.push(payload);
				},
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);
			await provider.simulateWebhook(providerRef, "confirmed");

			expect(dispatched).toHaveLength(1);
			expect(dispatched[0].mappedTransferEvent).toBe("FUNDS_SETTLED");
		});
	});
});

// ── T-009: Webhook Deduplication ─────────────────────────────────────────

describe("T-009: Webhook deduplication — same eventId twice → zero additional state changes", () => {
	describe("same explicit eventId produces identical payloads", () => {
		it("two simulateWebhook calls with same eventId produce identical eventIds", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);

			const explicitEventId = "dedup-event-001";
			const payload1 = await provider.simulateWebhook(
				providerRef,
				"confirmed",
				explicitEventId
			);
			const payload2 = await provider.simulateWebhook(
				providerRef,
				"confirmed",
				explicitEventId
			);

			expect(payload1.eventId).toBe(explicitEventId);
			expect(payload2.eventId).toBe(explicitEventId);
			expect(payload1.eventId).toBe(payload2.eventId);
			expect(payload1.providerEventId).toBe(payload2.providerEventId);
		});
	});

	describe("second FUNDS_SETTLED on already-confirmed transfer → no state change", () => {
		it("confirmed + FUNDS_SETTLED → remains confirmed (no transition)", () => {
			// Simulate: transfer is already confirmed
			const confirmedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef: "ref-001" },
				{
					type: "FUNDS_SETTLED",
					settledAt: 1_700_000_000_000,
					providerData: {},
				}
			);
			expect(confirmedSnap.value).toBe("confirmed");

			// Apply duplicate FUNDS_SETTLED
			const [afterDuplicate] = transition(transferMachine, confirmedSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_001_000,
				providerData: {},
			});
			expect(afterDuplicate.value).toBe("confirmed");
		});

		it("duplicate FUNDS_SETTLED on confirmed state fires zero actions", () => {
			const confirmedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef: "ref-001" },
				{
					type: "FUNDS_SETTLED",
					settledAt: 1_700_000_000_000,
					providerData: {},
				}
			);

			const actions = actionTypes(transferMachine, confirmedSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_001_000,
				providerData: {},
			});
			expect(actions).toEqual([]);
		});
	});

	describe("second TRANSFER_FAILED on already-failed transfer → no state change", () => {
		it("failed + TRANSFER_FAILED → remains failed (no transition)", () => {
			const failedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef: "ref-001" },
				{
					type: "TRANSFER_FAILED",
					errorCode: "NSF",
					reason: "Insufficient funds",
				}
			);
			expect(failedSnap.value).toBe("failed");

			const [afterDuplicate] = transition(transferMachine, failedSnap, {
				type: "TRANSFER_FAILED",
				errorCode: "NSF",
				reason: "Insufficient funds",
			});
			expect(afterDuplicate.value).toBe("failed");
		});

		it("duplicate TRANSFER_FAILED on failed state fires zero actions", () => {
			const failedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef: "ref-001" },
				{
					type: "TRANSFER_FAILED",
					errorCode: "NSF",
					reason: "Insufficient funds",
				}
			);

			const actions = actionTypes(transferMachine, failedSnap, {
				type: "TRANSFER_FAILED",
				errorCode: "NSF",
				reason: "Insufficient funds",
			});
			expect(actions).toEqual([]);
		});
	});

	describe("second TRANSFER_REVERSED on already-reversed transfer → no state change", () => {
		it("reversed + TRANSFER_REVERSED → remains reversed (no transition)", () => {
			const reversedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef: "ref-001" },
				{
					type: "FUNDS_SETTLED",
					settledAt: 1_700_000_000_000,
					providerData: {},
				},
				{
					type: "TRANSFER_REVERSED",
					reversalRef: "rev-001",
					reason: "Chargeback",
				}
			);
			expect(reversedSnap.value).toBe("reversed");

			const [afterDuplicate] = transition(transferMachine, reversedSnap, {
				type: "TRANSFER_REVERSED",
				reversalRef: "rev-001",
				reason: "Chargeback",
			});
			expect(afterDuplicate.value).toBe("reversed");
		});

		it("duplicate TRANSFER_REVERSED on reversed state fires zero actions", () => {
			const reversedSnap = snapshotAt(
				{ type: "PROVIDER_INITIATED", providerRef: "ref-001" },
				{
					type: "FUNDS_SETTLED",
					settledAt: 1_700_000_000_000,
					providerData: {},
				},
				{
					type: "TRANSFER_REVERSED",
					reversalRef: "rev-001",
					reason: "Chargeback",
				}
			);

			const actions = actionTypes(transferMachine, reversedSnap, {
				type: "TRANSFER_REVERSED",
				reversalRef: "rev-001",
				reason: "Chargeback",
			});
			expect(actions).toEqual([]);
		});
	});

	describe("end-to-end: mock provider webhook dedup through state machine", () => {
		it("full pipeline: initiate → webhook(confirmed) → duplicate webhook → no additional effect", async () => {
			const provider = new MockTransferProvider({
				defaultMode: "async",
				randomUUID: createDeterministicUUID(),
				now: () => 1_700_000_000_000,
			});

			// 1. Initiate transfer
			const { providerRef } = await provider.initiate(
				createTestTransferRequest()
			);

			// 2. State machine: initiated → pending
			const pendingSnap = snapshotAt({
				type: "PROVIDER_INITIATED",
				providerRef,
			});
			expect(pendingSnap.value).toBe("pending");

			// 3. First webhook: confirmed
			const explicitEventId = "webhook-evt-001";
			const firstPayload = await provider.simulateWebhook(
				providerRef,
				"confirmed",
				explicitEventId
			);
			expect(firstPayload.mappedTransferEvent).toBe("FUNDS_SETTLED");

			// 4. Apply first FUNDS_SETTLED → confirmed + publishTransferConfirmed
			const firstActions = actionTypes(transferMachine, pendingSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_000_000,
				providerData: {},
			});
			expect(firstActions).toEqual(["publishTransferConfirmed"]);

			const [confirmedSnap] = transition(transferMachine, pendingSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_000_000,
				providerData: {},
			});
			expect(confirmedSnap.value).toBe("confirmed");

			// 5. Second webhook: same eventId
			const secondPayload = await provider.simulateWebhook(
				providerRef,
				"confirmed",
				explicitEventId
			);
			expect(secondPayload.eventId).toBe(firstPayload.eventId);

			// 6. Apply duplicate FUNDS_SETTLED → no state change, no actions
			const dupActions = actionTypes(transferMachine, confirmedSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_000_000,
				providerData: {},
			});
			expect(dupActions).toEqual([]);

			const [afterDupSnap] = transition(transferMachine, confirmedSnap, {
				type: "FUNDS_SETTLED",
				settledAt: 1_700_000_000_000,
				providerData: {},
			});
			expect(afterDupSnap.value).toBe("confirmed");
		});
	});
});
