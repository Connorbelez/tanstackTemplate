import { describe, expect, it } from "vitest";
import { createWebhookTestHarness } from "../../../../src/test/convex/payments/webhooks/convexTestHarness";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { seedMinimalEntities } from "../../cashLedger/__tests__/testUtils";

const TEST_SOURCE = {
	channel: "api_webhook" as const,
	actorId: "test-webhook",
	actorType: "system" as const,
};

function createHarness() {
	return createWebhookTestHarness();
}

async function seedBridgedTransfer(
	t: ReturnType<typeof createWebhookTestHarness>,
	args: {
		providerCode: "pad_vopay" | "eft_vopay";
		providerRef: string;
		status?: "pending" | "confirmed";
	}
) {
	const { mortgageId } = await seedMinimalEntities(t);

	return t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId,
			obligationIds: [],
			amount: 50_000,
			method: args.providerCode,
			scheduledDate: Date.now(),
			status: "executing",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		const attemptId = await ctx.db.insert("collectionAttempts", {
			status: "pending",
			machineContext: {},
			lastTransitionAt: Date.now(),
			planEntryId,
			mortgageId,
			obligationIds: [],
			method: args.providerCode,
			amount: 50_000,
			providerRef: args.providerRef,
			initiatedAt: Date.now(),
		});

		const transferId = await ctx.db.insert("transferRequests", {
			status: args.status ?? "pending",
			direction: args.providerCode === "eft_vopay" ? "outbound" : "inbound",
			transferType:
				args.providerCode === "eft_vopay"
					? "lender_dispersal_payout"
					: "borrower_interest_collection",
			amount: 50_000,
			currency: "CAD",
			counterpartyType:
				args.providerCode === "eft_vopay" ? "lender" : "borrower",
			counterpartyId: "test-counterparty",
			providerCode: args.providerCode,
			providerRef: args.providerRef,
			idempotencyKey: `${args.providerCode}-${args.providerRef}`,
			source: TEST_SOURCE,
			mortgageId,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
			collectionAttemptId: attemptId,
		});

		const webhookEventId = await ctx.db.insert("webhookEvents", {
			provider: args.providerCode,
			providerEventId: `evt-${args.providerRef}`,
			rawBody: "{}",
			status: "pending",
			receivedAt: Date.now(),
			attempts: 0,
			signatureVerified: true,
		});

		return { transferId, webhookEventId };
	});
}

describe("transfer webhook core persistence", () => {
	it("deduplicates provider + providerEventId and preserves the same webhook event id", async () => {
		const t = createHarness();

		const firstId = await t.mutation(
			internal.payments.webhooks.transferCore.persistTransferWebhookEvent,
			{
				provider: "eft_vopay",
				providerEventId: "evt-dedupe-001",
				rawBody: '{"status":"completed"}',
				signatureVerified: true,
				normalizedEventType: "FUNDS_SETTLED",
			}
		);

		const secondId = await t.mutation(
			internal.payments.webhooks.transferCore.persistTransferWebhookEvent,
			{
				provider: "eft_vopay",
				providerEventId: "evt-dedupe-001",
				rawBody: '{"status":"completed"}',
				signatureVerified: true,
				normalizedEventType: "FUNDS_SETTLED",
			}
		);

		expect(secondId).toEqual(firstId);

		const event = await t.run(async (ctx) =>
			ctx.db.get(firstId as Id<"webhookEvents">)
		);
		expect(event?.status).toBe("pending");
		expect(event?.normalizedEventType).toBe("FUNDS_SETTLED");
		expect(event?.attempts).toBe(0);
	});
});

describe("processVoPayWebhook for eft_vopay", () => {
	it("processes outbound EFT settlement through the shared VoPay mutation", async () => {
		const t = createHarness();
		const { transferId, webhookEventId } = await seedBridgedTransfer(t, {
			providerCode: "eft_vopay",
			providerRef: "txn_eft_confirm_001",
		});

		await t.mutation(internal.payments.webhooks.vopay.processVoPayWebhook, {
			webhookEventId,
			providerCode: "eft_vopay",
			transactionId: "txn_eft_confirm_001",
			status: "completed",
		});

		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		const webhook = await t.run(async (ctx) => ctx.db.get(webhookEventId));

		expect(transfer?.status).toBe("confirmed");
		expect(webhook?.status).toBe("processed");
		expect(webhook?.normalizedEventType).toBe("FUNDS_SETTLED");
		expect(webhook?.transferRequestId).toEqual(transferId);
	});

	it("marks the webhook processed when no EFT transfer matches the provider ref", async () => {
		const t = createHarness();
		const webhookEventId = await t.run(async (ctx) => {
			return ctx.db.insert("webhookEvents", {
				provider: "eft_vopay",
				providerEventId: "evt-missing-transfer",
				rawBody: "{}",
				status: "pending",
				receivedAt: Date.now(),
				attempts: 0,
				signatureVerified: true,
			});
		});

		await t.mutation(internal.payments.webhooks.vopay.processVoPayWebhook, {
			webhookEventId,
			providerCode: "eft_vopay",
			transactionId: "txn_missing_transfer",
			status: "completed",
		});

		const webhook = await t.run(async (ctx) => ctx.db.get(webhookEventId));
		expect(webhook?.status).toBe("processed");
		expect(webhook?.normalizedEventType).toBe("FUNDS_SETTLED");
		expect(webhook?.transferRequestId).toBeUndefined();
	});
});
