import auditLogTest from "convex-audit-log/test";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import {
	createHarness,
	createTestAccount,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "../../../payments/cashLedger/__tests__/testUtils";
import { effectRegistry } from "../registry";
import {
	publishTransferConfirmed,
	publishTransferFailed,
	publishTransferReversed,
	recordTransferProviderRef,
} from "../transfer";

const modules = import.meta.glob("/convex/**/*.ts");
const NO_DIRECTION_RE = /has no direction set/;
const NO_JOURNAL_ENTRY_RE = /No journal entry found for NON-bridged transfer/;

interface TransferEffectArgs {
	effectName: string;
	entityId: Id<"transferRequests">;
	entityType: "transfer";
	eventType: string;
	journalEntryId: string;
	payload?: Record<string, unknown>;
	source: typeof SYSTEM_SOURCE;
}

interface TransferEffectHandler {
	_handler: (ctx: MutationCtx, args: TransferEffectArgs) => Promise<void>;
}

const recordTransferProviderRefMutation =
	recordTransferProviderRef as unknown as TransferEffectHandler;
const publishTransferConfirmedMutation =
	publishTransferConfirmed as unknown as TransferEffectHandler;
const publishTransferFailedMutation =
	publishTransferFailed as unknown as TransferEffectHandler;
const publishTransferReversedMutation =
	publishTransferReversed as unknown as TransferEffectHandler;

function createTransferHarness() {
	const t = createHarness(modules);
	auditLogTest.register(t, "auditLog");
	return t;
}

function buildEffectArgs(
	transferId: Id<"transferRequests">,
	args: Pick<TransferEffectArgs, "effectName" | "eventType"> & {
		payload?: Record<string, unknown>;
	}
): TransferEffectArgs {
	return {
		entityId: transferId,
		entityType: "transfer",
		eventType: args.eventType,
		journalEntryId: `audit-${args.effectName}-${transferId}`,
		effectName: args.effectName,
		payload: args.payload,
		source: SYSTEM_SOURCE,
	};
}

async function createObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		type?:
			| "regular_interest"
			| "principal_repayment"
			| "late_fee"
			| "arrears_cure";
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: args.type ?? "regular_interest",
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			createdAt: Date.now(),
		});
	});
}

async function createCollectionAttempt(
	t: TestHarness,
	args: {
		obligationIds: Id<"obligations">[];
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: "manual",
			scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
			status: "completed",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		return ctx.db.insert("collectionAttempts", {
			planEntryId,
			amount: args.amount,
			method: "manual",
			status: "confirmed",
			machineContext: {},
			initiatedAt: Date.now(),
		});
	});
}

async function createTransferRequest(
	t: TestHarness,
	args: {
		amount: number;
		counterpartyId: string;
		counterpartyType: "borrower" | "lender" | "investor" | "trust";
		direction: "inbound" | "outbound";
		mortgageId: Id<"mortgages">;
		transferType:
			| "borrower_interest_collection"
			| "borrower_principal_collection"
			| "borrower_late_fee_collection"
			| "borrower_arrears_cure"
			| "locking_fee_collection"
			| "commitment_deposit_collection"
			| "deal_principal_transfer"
			| "lender_dispersal_payout"
			| "lender_principal_return"
			| "deal_seller_payout";
		borrowerId?: Id<"borrowers">;
		collectionAttemptId?: Id<"collectionAttempts">;
		lenderId?: Id<"lenders">;
		obligationId?: Id<"obligations">;
		status?:
			| "initiated"
			| "pending"
			| "processing"
			| "confirmed"
			| "reversed"
			| "failed"
			| "cancelled";
	}
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("transferRequests", {
			status: args.status ?? "initiated",
			direction: args.direction,
			transferType: args.transferType,
			amount: args.amount,
			currency: "CAD",
			counterpartyType: args.counterpartyType,
			counterpartyId: args.counterpartyId,
			providerCode: "manual",
			idempotencyKey: `transfer-effect-test:${args.transferType}:${now}`,
			source: SYSTEM_SOURCE,
			createdAt: now,
			lastTransitionAt: now,
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			lenderId: args.lenderId,
			borrowerId: args.borrowerId,
			collectionAttemptId: args.collectionAttemptId,
		});
	});
}

async function loadTransferEntries(
	ctx: MutationCtx,
	transferId: Id<"transferRequests">
) {
	return ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_transfer_request", (q) =>
			q.eq("transferRequestId", transferId)
		)
		.collect();
}

describe("transfer effects registry", () => {
	it("registers all transfer effects", () => {
		expect(effectRegistry.recordTransferProviderRef).toBeDefined();
		expect(effectRegistry.publishTransferConfirmed).toBeDefined();
		expect(effectRegistry.publishTransferFailed).toBeDefined();
		expect(effectRegistry.publishTransferReversed).toBeDefined();
	});
});

describe("recordTransferProviderRef effect", () => {
	it("patches providerRef onto the transfer", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const transferId = await createTransferRequest(t, {
			amount: 10_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "locking_fee_collection",
			borrowerId: seeded.borrowerId,
		});

		await t.run(async (ctx) => {
			await recordTransferProviderRefMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "recordTransferProviderRef",
					eventType: "PROVIDER_INITIATED",
					payload: { providerRef: "provider-ref-001" },
				})
			);

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.providerRef).toBe("provider-ref-001");
		});
	});
});

describe("publishTransferConfirmed effect", () => {
	it("creates exactly one CASH_RECEIVED entry for a non-bridged inbound transfer", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});
		await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 100_000n,
		});
		const transferId = await createTransferRequest(t, {
			amount: 100_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "borrower_interest_collection",
			borrowerId: seeded.borrowerId,
			obligationId,
		});
		const settledAt = Date.parse("2026-03-05T00:00:00Z");

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferConfirmed",
					eventType: "FUNDS_SETTLED",
					payload: { settledAt },
				})
			);

			const entries = await loadTransferEntries(ctx, transferId);
			expect(entries).toHaveLength(1);
			expect(entries[0]?.entryType).toBe("CASH_RECEIVED");
			expect(entries[0]?.transferRequestId).toBe(transferId);
			expect(entries[0]?.amount).toBe(100_000n);

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.settledAt).toBe(settledAt);
		});
	});

	it("creates exactly one LENDER_PAYOUT_SENT entry for a non-bridged outbound transfer", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 60_000n,
		});
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 60_000n,
		});
		const transferId = await createTransferRequest(t, {
			amount: 60_000,
			counterpartyId: seeded.lenderAId,
			counterpartyType: "lender",
			direction: "outbound",
			mortgageId: seeded.mortgageId,
			transferType: "lender_dispersal_payout",
			lenderId: seeded.lenderAId,
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferConfirmed",
					eventType: "FUNDS_SETTLED",
					payload: { settledAt: Date.parse("2026-03-06T00:00:00Z") },
				})
			);

			const entries = await loadTransferEntries(ctx, transferId);
			expect(entries).toHaveLength(1);
			expect(entries[0]?.entryType).toBe("LENDER_PAYOUT_SENT");
			expect(entries[0]?.transferRequestId).toBe(transferId);
			expect(entries[0]?.amount).toBe(60_000n);
		});
	});

	it("skips duplicate cash posting for bridged transfers", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 75_000,
		});
		const collectionAttemptId = await createCollectionAttempt(t, {
			obligationIds: [obligationId],
			amount: 75_000,
		});
		const transferId = await createTransferRequest(t, {
			amount: 75_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "borrower_interest_collection",
			borrowerId: seeded.borrowerId,
			obligationId,
			collectionAttemptId,
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferConfirmed",
					eventType: "FUNDS_SETTLED",
				})
			);

			const entries = await loadTransferEntries(ctx, transferId);
			expect(entries).toHaveLength(0);

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.settledAt).toBeTypeOf("number");
		});
	});

	it("fails loudly when a malformed non-bridged transfer has no direction", async () => {
		const transferId = "transfer_missing_direction" as Id<"transferRequests">;
		const ctx = {
			db: {
				get: vi.fn().mockResolvedValue({
					_id: transferId,
					amount: 42_000,
				}),
				patch: vi.fn().mockResolvedValue(undefined),
			},
		} as unknown as MutationCtx;

		await expect(
			publishTransferConfirmedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferConfirmed",
					eventType: "FUNDS_SETTLED",
				})
			)
		).rejects.toThrow(NO_DIRECTION_RE);
	});
});

describe("publishTransferFailed effect", () => {
	it("patches failure metadata on the transfer", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const transferId = await createTransferRequest(t, {
			amount: 20_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "locking_fee_collection",
			borrowerId: seeded.borrowerId,
		});

		await t.run(async (ctx) => {
			await publishTransferFailedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferFailed",
					eventType: "TRANSFER_FAILED",
					payload: {
						errorCode: "NSF",
						reason: "insufficient_funds",
					},
				})
			);

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.failureCode).toBe("NSF");
			expect(transfer?.failureReason).toBe("insufficient_funds");
			expect(transfer?.failedAt).toBeTypeOf("number");
		});
	});
});

describe("publishTransferReversed effect", () => {
	it("creates exactly one REVERSAL entry linked via causedBy", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 90_000,
		});
		await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 90_000n,
		});
		const transferId = await createTransferRequest(t, {
			amount: 90_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "borrower_interest_collection",
			borrowerId: seeded.borrowerId,
			obligationId,
			status: "confirmed",
		});

		await t.run(async (ctx) => {
			await publishTransferConfirmedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferConfirmed",
					eventType: "FUNDS_SETTLED",
				})
			);

			const originalEntries = await loadTransferEntries(ctx, transferId);
			expect(originalEntries).toHaveLength(1);
			const originalEntry = originalEntries[0];
			if (!originalEntry) {
				throw new Error("Expected transfer-backed journal entry");
			}

			await publishTransferReversedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferReversed",
					eventType: "TRANSFER_REVERSED",
					payload: {
						reversalRef: "REV-123",
						reason: "chargeback",
					},
				})
			);

			const entries = await loadTransferEntries(ctx, transferId);
			expect(entries).toHaveLength(2);

			const reversalEntry = entries.find(
				(entry) => entry.entryType === "REVERSAL"
			);
			expect(reversalEntry?._id).toBeTruthy();
			expect(reversalEntry?.causedBy).toBe(originalEntry._id);
			expect(reversalEntry?.transferRequestId).toBe(transferId);

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.reversalRef).toBe("REV-123");
			expect(transfer?.reversedAt).toBeTypeOf("number");
		});
	});

	it("skips cash reversal for bridged transfers without transfer-backed journal entries", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 55_000,
		});
		const collectionAttemptId = await createCollectionAttempt(t, {
			obligationIds: [obligationId],
			amount: 55_000,
		});
		const transferId = await createTransferRequest(t, {
			amount: 55_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "borrower_interest_collection",
			borrowerId: seeded.borrowerId,
			obligationId,
			collectionAttemptId,
			status: "confirmed",
		});

		await t.run(async (ctx) => {
			await publishTransferReversedMutation._handler(
				ctx,
				buildEffectArgs(transferId, {
					effectName: "publishTransferReversed",
					eventType: "TRANSFER_REVERSED",
				})
			);

			const entries = await loadTransferEntries(ctx, transferId);
			expect(entries).toHaveLength(0);

			const transfer = await ctx.db.get(transferId);
			expect(transfer?.reversedAt).toBeTypeOf("number");
		});
	});

	it("fails closed when a non-bridged transfer has no original journal entry", async () => {
		const t = createTransferHarness();
		const seeded = await seedMinimalEntities(t);
		const transferId = await createTransferRequest(t, {
			amount: 45_000,
			counterpartyId: seeded.borrowerId,
			counterpartyType: "borrower",
			direction: "inbound",
			mortgageId: seeded.mortgageId,
			transferType: "locking_fee_collection",
			borrowerId: seeded.borrowerId,
			status: "confirmed",
		});

		await t.run(async (ctx) => {
			await expect(
				publishTransferReversedMutation._handler(
					ctx,
					buildEffectArgs(transferId, {
						effectName: "publishTransferReversed",
						eventType: "TRANSFER_REVERSED",
					})
				)
			).rejects.toThrow(NO_JOURNAL_ENTRY_RE);
		});
	});
});
