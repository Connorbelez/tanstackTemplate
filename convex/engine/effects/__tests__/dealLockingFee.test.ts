/**
 * Locking fee collection tests — ENG-208.
 *
 * Covers: collectLockingFee effect, deal machine wiring, schema validation.
 *
 * Uses convex-test with direct handler invocation and XState pure transitions.
 *
 * Note: Happy-path tests that require calling internal mutations/actions from
 * within internal actions are skipped (convex-test limitation). Those paths
 * are tested in integration/e2e tests.
 */
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInitialSnapshot, transition } from "xstate";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { collectLockingFee } from "../../effects/dealClosingEffects";
import { dealMachine } from "../../machines/deal.machine";

// ── Module glob ─────────────────────────────────────────────────────
const modules = import.meta.glob("/convex/**/*.ts");

// ── Identity fixtures ───────────────────────────────────────────────
const EFFECT_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "test-admin",
	actorType: "admin" as const,
};

// ── Typed handler wrappers ─────────────────────────────────────────

interface EffectAction {
	_handler: (
		ctx: unknown,
		args: {
			entityId: Id<"deals">;
			entityType: "deal";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			source: { channel: string; actorId: string; actorType: string };
			payload?: { reason?: string };
		}
	) => Promise<void>;
}

const collectLockingFeeAction = collectLockingFee as unknown as EffectAction;

// ── Seed helpers ────────────────────────────────────────────────────
type TestHarness = ReturnType<typeof convexTest>;

async function seedBaseData(t: TestHarness) {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authId: "seed-user",
			email: "seed@test.com",
			firstName: "Seed",
			lastName: "User",
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: Date.now(),
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId,
			createdAt: Date.now(),
		});
		const mortgageId = await ctx.db.insert("mortgages", {
			status: "funded",
			propertyId,
			principal: 500_000,
			interestRate: 0.05,
			rateType: "fixed",
			termMonths: 60,
			amortizationMonths: 300,
			paymentAmount: 2908,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2031-01-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			userId,
			status: "active",
			createdAt: Date.now(),
		});
		return { userId, propertyId, brokerId, mortgageId, borrowerId };
	});
}

async function seedDeal(
	t: TestHarness,
	base: Awaited<ReturnType<typeof seedBaseData>>,
	overrides?: {
		status?: string;
		lockingFeeAmount?: number;
		closingDate?: number;
	}
) {
	return t.run(async (ctx) => {
		const dealId = await ctx.db.insert("deals", {
			status: overrides?.status ?? "initiated",
			mortgageId: base.mortgageId,
			buyerId: "buyer-user-1",
			sellerId: "seller-user-1",
			fractionalShare: 3000,
			closingDate: overrides?.closingDate ?? new Date("2026-02-15").getTime(),
			lawyerId: "test-lawyer",
			lawyerType: "platform_lawyer",
			...(overrides?.lockingFeeAmount !== undefined
				? { lockingFeeAmount: overrides.lockingFeeAmount }
				: {}),
			createdAt: Date.now(),
			createdBy: "test-admin",
		});
		return { dealId };
	});
}

function makeEffectArgs(
	dealId: Id<"deals">,
	effectName: string
): {
	entityId: Id<"deals">;
	entityType: "deal";
	eventType: string;
	journalEntryId: string;
	effectName: string;
	source: { channel: string; actorId: string; actorType: string };
} {
	return {
		entityId: dealId,
		entityType: "deal",
		eventType: "DEAL_LOCKED",
		journalEntryId: "test-journal-1",
		effectName,
		source: EFFECT_SOURCE,
	};
}

// ── XState pure transition tests ───────────────────────────────────

describe("dealMachine — collectLockingFee wiring", () => {
	it("DEAL_LOCKED from initiated includes collectLockingFee in actions", () => {
		const initial = getInitialSnapshot(dealMachine);
		const [, actions] = transition(dealMachine, initial, {
			type: "DEAL_LOCKED",
			closingDate: Date.now(),
		});

		const actionNames = actions.map((a) =>
			typeof a === "string" ? a : a.type
		);
		expect(actionNames).toContain("collectLockingFee");
	});

	it("DEAL_LOCKED also includes reserveShares, notifyAllParties, createDocumentPackage", () => {
		const initial = getInitialSnapshot(dealMachine);
		const [, actions] = transition(dealMachine, initial, {
			type: "DEAL_LOCKED",
			closingDate: Date.now(),
		});

		const actionNames = actions.map((a) =>
			typeof a === "string" ? a : a.type
		);
		expect(actionNames).toContain("reserveShares");
		expect(actionNames).toContain("notifyAllParties");
		expect(actionNames).toContain("createDocumentPackage");
	});

	it("DEAL_CANCELLED from initiated does NOT include collectLockingFee", () => {
		const initial = getInitialSnapshot(dealMachine);
		const [, actions] = transition(dealMachine, initial, {
			type: "DEAL_CANCELLED",
			reason: "test",
		});

		const actionNames = actions.map((a) =>
			typeof a === "string" ? a : a.type
		);
		expect(actionNames).not.toContain("collectLockingFee");
	});

	it("FUNDS_RECEIVED transition does NOT include collectLockingFee", () => {
		// FUNDS_RECEIVED is only valid from fundsTransfer.pending, not from initiated
		const initial = getInitialSnapshot(dealMachine);
		const [, actions] = transition(dealMachine, initial, {
			type: "FUNDS_RECEIVED",
			method: "manual",
		});

		// From initiated, FUNDS_RECEIVED should not be handled (no matching transition)
		const actionNames = actions.map((a) =>
			typeof a === "string" ? a : a.type
		);
		expect(actionNames).not.toContain("collectLockingFee");
	});
});

// ── Schema validation tests ────────────────────────────────────────

describe("deals schema — lockingFeeAmount field", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("accepts a deal with lockingFeeAmount set", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDeal(t, base, {
			lockingFeeAmount: 5000,
		});

		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(deal).not.toBeNull();
		expect(deal?.lockingFeeAmount).toBe(5000);
	});

	it("accepts a deal without lockingFeeAmount (optional field)", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDeal(t, base);

		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(deal).not.toBeNull();
		expect(deal?.lockingFeeAmount).toBeUndefined();
	});
});

// ── collectLockingFee effect handler tests ─────────────────────────

describe("collectLockingFee effect", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("skips when deal has no lockingFeeAmount — no transfers created", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDeal(t, base);

		// Handler calls ctx.runQuery(getInternalDeal) which returns the deal,
		// then checks lockingFeeAmount === undefined and returns early.
		await t.run(async (ctx) =>
			collectLockingFeeAction._handler(
				ctx,
				makeEffectArgs(dealId, "collectLockingFee")
			)
		);

		// No transfer requests should have been created
		const transfers = await t.run(async (ctx) => {
			return ctx.db.query("transferRequests").collect();
		});
		expect(transfers).toHaveLength(0);
	});

	it("skips when deal has lockingFeeAmount of 0 — no transfers created", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDeal(t, base, { lockingFeeAmount: 0 });

		await t.run(async (ctx) =>
			collectLockingFeeAction._handler(
				ctx,
				makeEffectArgs(dealId, "collectLockingFee")
			)
		);

		const transfers = await t.run(async (ctx) => {
			return ctx.db.query("transferRequests").collect();
		});
		expect(transfers).toHaveLength(0);
	});

	it("skips when deal has negative lockingFeeAmount — no transfers created", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDeal(t, base, {
			lockingFeeAmount: -100,
		});

		await t.run(async (ctx) =>
			collectLockingFeeAction._handler(
				ctx,
				makeEffectArgs(dealId, "collectLockingFee")
			)
		);

		const transfers = await t.run(async (ctx) => {
			return ctx.db.query("transferRequests").collect();
		});
		expect(transfers).toHaveLength(0);
	});

	it("handles missing deal gracefully — returns without throwing", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDeal(t, base);

		// Delete the deal so getInternalDeal throws DEAL_NOT_FOUND
		await t.run(async (ctx) => {
			await ctx.db.delete(dealId);
		});

		// The handler catches the getInternalDeal error via .catch(() => null)
		// and returns gracefully without creating any transfers.
		await t.run(async (ctx) =>
			collectLockingFeeAction._handler(
				ctx,
				makeEffectArgs(dealId, "collectLockingFee")
			)
		);

		const transfers = await t.run(async (ctx) => {
			return ctx.db.query("transferRequests").collect();
		});
		expect(transfers).toHaveLength(0);
	});

	// ── Mocked ctx tests for happy path ───────────────────────────
	// These bypass convex-test limitations by mocking the ctx methods
	// that the handler calls (runQuery, runMutation, runAction).

	it("happy path: creates inbound locking_fee_collection transfer with correct fields", async () => {
		const fakeDealId = "deals:test-deal-123" as Id<"deals">;
		const fakeMortgageId = "mortgages:test-mortgage-456" as Id<"mortgages">;
		const fakeTransferId = "transferRequests:test-transfer-789";

		const runQuery = vi.fn().mockResolvedValue({
			_id: fakeDealId,
			buyerId: "buyer-user-1",
			sellerId: "seller-user-1",
			mortgageId: fakeMortgageId,
			lockingFeeAmount: 5000,
			status: "locked",
		});
		const runMutation = vi.fn().mockResolvedValue(fakeTransferId);
		const runAction = vi.fn().mockResolvedValue(undefined);

		const mockCtx = { runQuery, runMutation, runAction };

		await collectLockingFeeAction._handler(
			mockCtx,
			makeEffectArgs(fakeDealId, "collectLockingFee")
		);

		// Verify createTransferRequestInternal was called with correct fields
		expect(runMutation).toHaveBeenCalledTimes(1);
		const mutationArgs = runMutation.mock.calls[0][1];
		expect(mutationArgs).toMatchObject({
			direction: "inbound",
			transferType: "locking_fee_collection",
			amount: 5000,
			counterpartyType: "borrower",
			counterpartyId: "buyer-user-1",
			mortgageId: fakeMortgageId,
			dealId: fakeDealId,
			providerCode: "manual",
			idempotencyKey: `locking-fee:${fakeDealId}`,
		});

		// Verify initiateTransferInternal was called with the transfer ID
		expect(runAction).toHaveBeenCalledTimes(1);
		const actionArgs = runAction.mock.calls[0][1];
		expect(actionArgs).toEqual({ transferId: fakeTransferId });
	});

	it("idempotency key is deterministic per deal", async () => {
		const fakeDealId = "deals:test-deal-abc" as Id<"deals">;

		const runQuery = vi.fn().mockResolvedValue({
			_id: fakeDealId,
			buyerId: "buyer-1",
			sellerId: "seller-1",
			mortgageId: "mortgages:m1",
			lockingFeeAmount: 3000,
			status: "locked",
		});
		const runMutation = vi.fn().mockResolvedValue("transferRequests:t1");
		const runAction = vi.fn().mockResolvedValue(undefined);

		const mockCtx = { runQuery, runMutation, runAction };

		// Call twice with same dealId
		await collectLockingFeeAction._handler(
			mockCtx,
			makeEffectArgs(fakeDealId, "collectLockingFee")
		);
		await collectLockingFeeAction._handler(
			mockCtx,
			makeEffectArgs(fakeDealId, "collectLockingFee")
		);

		// Both calls should use the same idempotency key
		const key1 = runMutation.mock.calls[0][1].idempotencyKey;
		const key2 = runMutation.mock.calls[1][1].idempotencyKey;
		expect(key1).toBe(`locking-fee:${fakeDealId}`);
		expect(key2).toBe(key1);
	});

	it("gracefully handles transfer creation failure without propagating", async () => {
		const fakeDealId = "deals:test-deal-err" as Id<"deals">;

		const runQuery = vi.fn().mockResolvedValue({
			_id: fakeDealId,
			buyerId: "buyer-1",
			sellerId: "seller-1",
			mortgageId: "mortgages:m1",
			lockingFeeAmount: 5000,
			status: "locked",
		});
		const runMutation = vi
			.fn()
			.mockRejectedValue(new Error("Provider disabled"));
		const runAction = vi.fn();

		const mockCtx = { runQuery, runMutation, runAction };

		// Should not throw — the try/catch catches and logs
		await expect(
			collectLockingFeeAction._handler(
				mockCtx,
				makeEffectArgs(fakeDealId, "collectLockingFee")
			)
		).resolves.toBeUndefined();

		// initiateTransferInternal should NOT have been called
		expect(runAction).not.toHaveBeenCalled();
	});
});
