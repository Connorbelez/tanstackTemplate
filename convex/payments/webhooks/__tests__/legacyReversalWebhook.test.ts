import { describe, expect, it } from "vitest";
import { createWebhookTestHarness } from "../../../../src/test/convex/payments/webhooks/convexTestHarness";
import { internal } from "../../../_generated/api";

const TEST_SOURCE = {
	channel: "api_webhook" as const,
	actorId: "test-legacy-webhook",
	actorType: "system" as const,
};

function createHarness() {
	return createWebhookTestHarness();
}

function buildPayload(
	overrides?: Partial<{
		originalAmount: number;
		provider: "rotessa" | "pad_vopay";
		providerEventId: string;
		providerRef: string;
		reversalCode?: string;
		reversalDate: string;
		reversalReason: string;
	}>
) {
	return {
		originalAmount: 50_000,
		provider: "rotessa" as const,
		providerEventId: "evt_legacy_reversal_001",
		providerRef: "txn_legacy_reversal_001",
		reversalCode: "NSF",
		reversalDate: "2026-04-09",
		reversalReason: "Legacy reversal test",
		...overrides,
	};
}

describe("legacy reversal webhook persistence", () => {
	it("marks webhook events processed when the transfer was already reversed", async () => {
		const t = createHarness();
		const payload = buildPayload();

		const { transferId, webhookEventId } = await t.run(async (ctx) => {
			const transferId = await ctx.db.insert("transferRequests", {
				status: "reversed",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: payload.originalAmount,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: "borrower-legacy",
				providerCode: "pad_rotessa",
				providerRef: payload.providerRef,
				idempotencyKey: "legacy-reversal-processed",
				source: TEST_SOURCE,
				createdAt: Date.now(),
				lastTransitionAt: Date.now(),
				reversedAt: Date.now(),
				reversalRef: "evt_previous_reversal",
			});

			const webhookEventId = await ctx.db.insert("webhookEvents", {
				provider: payload.provider,
				providerEventId: payload.providerEventId,
				rawBody: JSON.stringify(payload),
				status: "pending",
				receivedAt: Date.now(),
				attempts: 0,
				signatureVerified: true,
				normalizedEventType: "TRANSFER_REVERSED",
			});

			return { transferId, webhookEventId };
		});

		const result = await t.action(
			internal.payments.webhooks.legacyReversal.processLegacyReversalWebhook,
			{
				payload,
				webhookEventId,
			}
		);

		const webhook = await t.run(async (ctx) => ctx.db.get(webhookEventId));

		expect(result).toMatchObject({
			success: true,
			reason: "already_reversed",
			transferId,
		});
		expect(webhook?.status).toBe("processed");
		expect(webhook?.transferRequestId).toEqual(transferId);
		expect(webhook?.normalizedEventType).toBe("TRANSFER_REVERSED");
		expect(webhook?.attempts).toBe(1);
	});

	it("marks webhook events failed when no matching transfer exists", async () => {
		const t = createHarness();
		const payload = buildPayload({
			providerEventId: "evt_missing_transfer",
			providerRef: "txn_missing_transfer",
		});

		const webhookEventId = await t.run(async (ctx) => {
			return ctx.db.insert("webhookEvents", {
				provider: payload.provider,
				providerEventId: payload.providerEventId,
				rawBody: JSON.stringify(payload),
				status: "pending",
				receivedAt: Date.now(),
				attempts: 0,
				signatureVerified: true,
				normalizedEventType: "TRANSFER_REVERSED",
			});
		});

		const result = await t.action(
			internal.payments.webhooks.legacyReversal.processLegacyReversalWebhook,
			{
				payload,
				webhookEventId,
			}
		);

		const webhook = await t.run(async (ctx) => ctx.db.get(webhookEventId));

		expect(result).toMatchObject({
			success: false,
			reason: "transfer_not_found",
		});
		expect(webhook?.status).toBe("failed");
		expect(webhook?.transferRequestId).toBeUndefined();
		expect(webhook?.error).toBe("transfer_not_found");
		expect(webhook?.attempts).toBe(1);
	});
});
