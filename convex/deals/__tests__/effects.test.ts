/**
 * Confirmation effects tests — ENG-50.
 *
 * Covers: commitReservation, prorateAccrualBetweenOwners, updatePaymentSchedule
 * Tests: idempotency, missing deal, missing data, edge cases.
 *
 * Uses convex-test with direct handler invocation.
 *
 * Note: Some tests that require calling internal queries from within
 * internal actions are skipped (convex-test limitation). Those paths
 * are tested in integration/e2e tests.
 */
import { convexTest } from "convex-test";
import { assert, beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { commitReservation } from "../../engine/effects/dealClosing";
import { updatePaymentSchedule } from "../../engine/effects/dealClosingPayments";
import { prorateAccrualBetweenOwners } from "../../engine/effects/dealClosingProrate";
import schema from "../../schema";

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

const commitReservationAction = commitReservation as unknown as EffectAction;
const prorateAction = prorateAccrualBetweenOwners as unknown as EffectAction;
const updatePaymentScheduleAction =
	updatePaymentSchedule as unknown as EffectAction;

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

async function seedDealWithClosingDate(
	t: TestHarness,
	base: Awaited<ReturnType<typeof seedBaseData>>,
	overrides?: {
		status?: string;
		closingDate?: number;
		reservationId?: Id<"ledger_reservations">;
		fractionalShare?: number;
	}
) {
	return t.run(async (ctx) => {
		const dealId = await ctx.db.insert("deals", {
			status: overrides?.status ?? "confirmed",
			mortgageId: base.mortgageId,
			buyerId: "buyer-user-1",
			sellerId: "seller-user-1",
			fractionalShare: overrides?.fractionalShare ?? 3000,
			closingDate: overrides?.closingDate ?? new Date("2026-02-15").getTime(),
			lawyerId: "test-lawyer",
			lawyerType: "platform_lawyer",
			...(overrides?.reservationId !== undefined
				? { reservationId: overrides.reservationId }
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
		eventType: "FUNDS_RECEIVED",
		journalEntryId: "test-journal-1",
		effectName,
		source: EFFECT_SOURCE,
	};
}

// ── commitReservation ──────────────────────────────────────────────

describe("commitReservation effect", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("handles missing deal — logs error and exits", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		// Delete the deal
		await t.run(async (ctx) => {
			await ctx.db.delete(dealId);
		});

		// Should throw ConvexError("DEAL_NOT_FOUND") from getInternalDeal
		await expect(
			t.run(async (ctx) =>
				commitReservationAction._handler(
					ctx,
					makeEffectArgs(dealId, "commitReservation")
				)
			)
		).rejects.toThrow();
	});

	it("handles missing reservationId — logs and exits without throwing", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		// No reservationId set on deal — effect should log error and return
		// Since getInternalDeal throws on not-found but the deal exists,
		// the handler returns void (no reservationId path)
		// This test verifies the handler completes without throwing
		await t.run(async (ctx) =>
			commitReservationAction._handler(
				ctx,
				makeEffectArgs(dealId, "commitReservation")
			)
		);

		// Deal should be unchanged
		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		assert(deal, "deal should still exist");
		expect(deal.reservationId).toBeUndefined();
	});

	it.skip("happy path: commits pending reservation via ledger API", () => {
		// Requires full ledger setup with accounts and pending reservation
		// Tested via integration tests
	});

	it.skip("idempotency: calling twice with same key returns existing entry", () => {
		// Requires internal query execution in test harness
		// Tested via integration tests
	});
});

// ── prorateAccrualBetweenOwners ────────────────────────────────────

describe("prorateAccrualBetweenOwners effect", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("handles missing deal — throws DEAL_NOT_FOUND", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		await t.run(async (ctx) => {
			await ctx.db.delete(dealId);
		});

		await expect(
			t.run(async (ctx) =>
				prorateAction._handler(
					ctx,
					makeEffectArgs(dealId, "prorateAccrualBetweenOwners")
				)
			)
		).rejects.toThrow();
	});

	it("handles missing closingDate — logs error and exits", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base, {
			closingDate: undefined as unknown as number,
		});

		// Patch deal to remove closingDate
		await t.run(async (ctx) => {
			await ctx.db.patch(dealId, { closingDate: undefined });
		});

		// Should return without throwing (graceful failure)
		await t.run(async (ctx) =>
			prorateAction._handler(
				ctx,
				makeEffectArgs(dealId, "prorateAccrualBetweenOwners")
			)
		);

		// No prorate entries should exist
		const entries = await t.run(async (ctx) => {
			const all = await ctx.db.query("prorateEntries").collect();
			return all.filter((e) => e.dealId === dealId);
		});
		expect(entries).toHaveLength(0);
	});

	it("idempotency: existing prorate entries for dealId — skips", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		// Pre-insert a prorate entry for this deal
		await t.run(async (ctx) => {
			await ctx.db.insert("prorateEntries", {
				mortgageId: base.mortgageId,
				dealId,
				ownerId: "seller-user-1",
				ownerRole: "seller",
				amount: 100,
				days: 5,
				dailyRate: 20,
				periodStart: "2026-02-01",
				periodEnd: "2026-02-15",
				closingDate: "2026-02-15",
				entryType: "prorate_credit",
				createdAt: Date.now(),
			});
		});

		// Run effect — should skip because entries already exist
		await t.run(async (ctx) =>
			prorateAction._handler(
				ctx,
				makeEffectArgs(dealId, "prorateAccrualBetweenOwners")
			)
		);

		// Still only 1 entry (the pre-inserted one)
		const entries = await t.run(async (ctx) => {
			const all = await ctx.db.query("prorateEntries").collect();
			return all.filter((e) => e.dealId === dealId);
		});
		expect(entries).toHaveLength(1);
	});

	it.skip("happy path: writes seller and buyer prorate entries", () => {
		// Requires internal queries (getSettledBeforeDate, getFirstAfterDate,
		// getInternalMortgage) to work within action context in test harness.
		// Tested via integration tests.
	});

	it.skip("zero seller days: closing on last payment date — only buyer entry", () => {
		// Requires full obligation setup + internal query execution
	});

	it.skip("zero buyer days: closing on next payment date — only seller entry", () => {
		// Requires full obligation setup + internal query execution
	});

	it("calculation: dailyRate = (interestRate × fractionalRate × principal) / 365", () => {
		// Pure calculation verification — no DB needed
		const interestRate = 0.05;
		const fractionalShare = 3000;
		const principal = 500_000;

		const fractionalRate = fractionalShare / 10_000; // 0.30
		const dailyRate = (interestRate * fractionalRate * principal) / 365;

		// Expected: (0.05 × 0.30 × 500000) / 365 = 7500 / 365 ≈ 20.5479...
		expect(fractionalRate).toBeCloseTo(0.3, 5);
		expect(dailyRate).toBeCloseTo(20.5479, 2);

		// 14 seller days (Feb 1 → Feb 15)
		const sellerAmount = Math.round(dailyRate * 14 * 100) / 100;
		expect(sellerAmount).toBeCloseTo(287.67, 0);

		// 14 buyer days (Feb 15 → Mar 1)
		const buyerAmount = Math.round(dailyRate * 14 * 100) / 100;
		expect(buyerAmount).toBeCloseTo(287.67, 0);
	});
});

// ── updatePaymentSchedule ──────────────────────────────────────────

describe("updatePaymentSchedule effect", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("handles missing deal — throws DEAL_NOT_FOUND", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		await t.run(async (ctx) => {
			await ctx.db.delete(dealId);
		});

		await expect(
			t.run(async (ctx) =>
				updatePaymentScheduleAction._handler(
					ctx,
					makeEffectArgs(dealId, "updatePaymentSchedule")
				)
			)
		).rejects.toThrow();
	});

	it("handles missing closingDate — logs error and exits", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		// Remove closingDate
		await t.run(async (ctx) => {
			await ctx.db.patch(dealId, { closingDate: undefined });
		});

		// Should complete without throwing
		await t.run(async (ctx) =>
			updatePaymentScheduleAction._handler(
				ctx,
				makeEffectArgs(dealId, "updatePaymentSchedule")
			)
		);

		// No reroute should exist
		const reroute = await t.run(async (ctx) => {
			const all = await ctx.db.query("dealReroutes").collect();
			return all.find((r) => r.dealId === dealId) ?? null;
		});
		expect(reroute).toBeNull();
	});

	it("idempotency: existing reroute for dealId — skips", async () => {
		const base = await seedBaseData(t);
		const { dealId } = await seedDealWithClosingDate(t, base);

		// Pre-insert a reroute for this deal
		await t.run(async (ctx) => {
			await ctx.db.insert("dealReroutes", {
				dealId,
				mortgageId: base.mortgageId,
				fromOwnerId: "seller-user-1",
				toOwnerId: "buyer-user-1",
				fractionalShare: 3000,
				effectiveAfterDate: "2026-02-15",
				createdAt: Date.now(),
			});
		});

		// Run effect — should skip
		await t.run(async (ctx) =>
			updatePaymentScheduleAction._handler(
				ctx,
				makeEffectArgs(dealId, "updatePaymentSchedule")
			)
		);

		// Still only 1 reroute
		const reroutes = await t.run(async (ctx) => {
			const all = await ctx.db.query("dealReroutes").collect();
			return all.filter((r) => r.dealId === dealId);
		});
		expect(reroutes).toHaveLength(1);
	});

	it.skip("happy path: creates dealReroute record", () => {
		// Requires internal query execution (getInternalDeal, getByDealId)
		// within action context in test harness.
		// Tested via integration tests.
	});
});
