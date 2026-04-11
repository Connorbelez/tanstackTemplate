/**
 * Deal closing integration tests — ENG-52.
 *
 * Exercises the full Governed Transition pipeline (transitionMutation) for the
 * deal machine: seed → transition → verify state + effects + audit journal.
 *
 * Uses convex-test with the real transition mutation (not direct handler calls).
 */

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { registerAuditLogComponent } from "../../../src/test/convex/registerAuditLogComponent";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import auditTrailSchema from "../../components/auditTrail/schema";
import schema from "../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
	workflowModules as sharedWorkflowModules,
	workpoolModules as sharedWorkpoolModules,
} from "../../test/moduleMaps";

// ── Module glob ─────────────────────────────────────────────────────
const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;
const workflowModules = sharedWorkflowModules;
const workpoolModules = sharedWorkpoolModules;

// ── Fixtures ────────────────────────────────────────────────────────
const ADMIN_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "user_admin_integration",
	actorType: "admin" as const,
};

// ── Types ───────────────────────────────────────────────────────────
type TestHarness = ReturnType<typeof convexTest>;

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

interface TransitionResult {
	effectsScheduled?: string[];
	journalEntryId?: string;
	newState: string;
	previousState: string;
	reason?: string;
	success: boolean;
}

// ── Test harness factory ────────────────────────────────────────────

/**
 * Creates a convex-test instance with all required components registered.
 * The transition engine uses auditLog, auditTrail, workflow, and workpool.
 */
function createTestHarness(): TestHarness {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

// ── Seed helper ─────────────────────────────────────────────────────

async function seedDeal(
	t: TestHarness,
	overrides?: {
		status?: string;
		buyerId?: string;
		sellerId?: string;
		fractionalShare?: number;
		closingDate?: number;
		reservationId?: Id<"ledger_reservations">;
		lawyerId?: string;
		lawyerType?: "platform_lawyer" | "guest_lawyer";
		mortgageId?: Id<"mortgages">;
	}
): Promise<{ dealId: Id<"deals">; mortgageId: Id<"mortgages"> }> {
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
		const mortgageId =
			overrides?.mortgageId ??
			(await ctx.db.insert("mortgages", {
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
			}));
		const dealId = await ctx.db.insert("deals", {
			status: overrides?.status ?? "initiated",
			mortgageId,
			buyerId: overrides?.buyerId ?? "buyer-user-1",
			sellerId: overrides?.sellerId ?? "seller-user-1",
			fractionalShare: overrides?.fractionalShare ?? 5000,
			closingDate: overrides?.closingDate,
			lawyerId: overrides?.lawyerId ?? "test-lawyer",
			lawyerType: overrides?.lawyerType ?? "platform_lawyer",
			...(overrides?.reservationId !== undefined
				? { reservationId: overrides.reservationId }
				: {}),
			createdAt: Date.now(),
			createdBy: "test-admin",
		});
		return { dealId, mortgageId };
	});
}

// ── Advance helper ──────────────────────────────────────────────────

/** Event definitions for the full happy path. */
const HAPPY_PATH_EVENTS = [
	{
		eventType: "DEAL_LOCKED",
		payload: { closingDate: Date.now() + 14 * 86_400_000 },
	},
	{ eventType: "LAWYER_VERIFIED", payload: { verificationId: "v-1" } },
	{ eventType: "REPRESENTATION_CONFIRMED", payload: {} },
	{ eventType: "LAWYER_APPROVED_DOCUMENTS", payload: {} },
	{ eventType: "ALL_PARTIES_SIGNED", payload: {} },
	{ eventType: "FUNDS_RECEIVED", payload: { method: "manual" } },
] as const;

/** Target state -> number of events to fire from "initiated". */
const STATE_INDEX: Record<string, number> = {
	initiated: 0,
	"lawyerOnboarding.pending": 1,
	"lawyerOnboarding.verified": 2,
	"documentReview.pending": 3,
	"documentReview.signed": 4,
	"fundsTransfer.pending": 5,
	confirmed: 6,
};

/**
 * Advances a deal from "initiated" to the specified target state by firing
 * the necessary sequence of happy-path events.
 */
async function advanceDealTo(
	t: TestHarness,
	dealId: Id<"deals">,
	targetState: string
): Promise<void> {
	const count = STATE_INDEX[targetState];
	if (count === undefined) {
		throw new Error(`Unknown target state: ${targetState}`);
	}
	for (let i = 0; i < count; i++) {
		const event = HAPPY_PATH_EVENTS[i];
		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: event.eventType,
				payload: event.payload,
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;
		if (!result.success) {
			throw new Error(
				`advanceDealTo failed at step ${i} (${event.eventType}): ${result.reason}`
			);
		}
	}
}

// =====================================================================
// T-003: Happy Path — Individual Transition Tests (UC-DC-01)
// =====================================================================

describe("Deal Integration — Happy Path (UC-DC-01)", () => {
	it("initiated -> DEAL_LOCKED -> lawyerOnboarding.pending", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "DEAL_LOCKED",
				payload: { closingDate: Date.now() + 14 * 86_400_000 },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("initiated");
		expect(result.newState).toBe("lawyerOnboarding.pending");
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining([
				"reserveShares",
				"notifyAllParties",
				"createDocumentPackage",
			])
		);
	});

	it("lawyerOnboarding.pending -> LAWYER_VERIFIED -> lawyerOnboarding.verified", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "lawyerOnboarding.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "LAWYER_VERIFIED",
				payload: { verificationId: "v-1" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("lawyerOnboarding.pending");
		expect(result.newState).toBe("lawyerOnboarding.verified");
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(["createDealAccess"])
		);
	});

	it("lawyerOnboarding.verified -> REPRESENTATION_CONFIRMED -> documentReview.pending", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "lawyerOnboarding.verified");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "REPRESENTATION_CONFIRMED",
				payload: {},
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("lawyerOnboarding.verified");
		expect(result.newState).toBe("documentReview.pending");
		// REPRESENTATION_CONFIRMED has no actions on its event handler;
		// the state change comes from the "complete" final state + onDone.
		// extractScheduledEffects only reads event handler actions.
		expect(result.effectsScheduled).toEqual([]);
	});

	it("documentReview.pending -> LAWYER_APPROVED_DOCUMENTS -> documentReview.signed", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "documentReview.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "LAWYER_APPROVED_DOCUMENTS",
				payload: {},
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("documentReview.pending");
		expect(result.newState).toBe("documentReview.signed");
		expect(result.effectsScheduled).toEqual([]);
	});

	it("documentReview.signed -> ALL_PARTIES_SIGNED -> fundsTransfer.pending", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "documentReview.signed");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "ALL_PARTIES_SIGNED",
				payload: {},
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("documentReview.signed");
		expect(result.newState).toBe("fundsTransfer.pending");
		// ALL_PARTIES_SIGNED event handler has actions: ["archiveSignedDocuments"]
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(["archiveSignedDocuments"])
		);
	});

	it("fundsTransfer.pending -> FUNDS_RECEIVED -> confirmed", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "fundsTransfer.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "FUNDS_RECEIVED",
				payload: { method: "manual" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("fundsTransfer.pending");
		expect(result.newState).toBe("confirmed");
		// FUNDS_RECEIVED event handler has actions: ["confirmFundsReceipt"].
		// The onDone actions (commitReservation, prorateAccrualBetweenOwners,
		// updatePaymentSchedule, revokeLawyerAccess) are NOT extracted by
		// extractScheduledEffects — it only reads event handler actions.
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(["confirmFundsReceipt"])
		);
	});
});

// =====================================================================
// T-004: Full Happy Path End-to-End Test
// =====================================================================

describe("Deal Integration — Full Happy Path E2E", () => {
	it("full happy path: initiated -> confirmed with all effects verified", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);

		const events = [
			{
				eventType: "DEAL_LOCKED",
				payload: { closingDate: Date.now() + 14 * 86_400_000 },
			},
			{ eventType: "LAWYER_VERIFIED", payload: { verificationId: "v-1" } },
			{ eventType: "REPRESENTATION_CONFIRMED", payload: {} },
			{ eventType: "LAWYER_APPROVED_DOCUMENTS", payload: {} },
			{ eventType: "ALL_PARTIES_SIGNED", payload: {} },
			{ eventType: "FUNDS_RECEIVED", payload: { method: "manual" } },
		];

		const expectedStates = [
			"lawyerOnboarding.pending",
			"lawyerOnboarding.verified",
			"documentReview.pending",
			"documentReview.signed",
			"fundsTransfer.pending",
			"confirmed",
		];

		const expectedEffects = [
			["reserveShares", "notifyAllParties", "createDocumentPackage"],
			["createDealAccess"],
			[], // REPRESENTATION_CONFIRMED: auto-transition via onDone, no event-level actions
			[], // LAWYER_APPROVED_DOCUMENTS: no actions
			["archiveSignedDocuments"],
			["confirmFundsReceipt"], // only event handler actions; onDone actions not extracted
		];

		for (let i = 0; i < events.length; i++) {
			const event = events[i];
			const result = (await t.mutation(
				internal.engine.transitionMutation.transitionMutation,
				{
					entityType: "deal",
					entityId: dealId,
					eventType: event.eventType,
					payload: event.payload,
					source: ADMIN_SOURCE,
				}
			)) as TransitionResult;

			expect(result.success).toBe(true);
			expect(result.newState).toBe(expectedStates[i]);

			const expected = expectedEffects[i];
			if (expected.length === 0) {
				expect(result.effectsScheduled).toEqual([]);
			} else {
				expect(result.effectsScheduled).toEqual(
					expect.arrayContaining(expected)
				);
			}
		}

		// Verify final DB state
		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(deal).not.toBeNull();
		expect(deal?.status).toBe("confirmed");
	});
});

// =====================================================================
// T-005: Audit Journal Causal Chain Test
// =====================================================================

describe("Deal Integration — Audit Journal", () => {
	it("audit journal has entries for every transition with correct compound states", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);

		// Run full happy path
		await advanceDealTo(t, dealId, "confirmed");

		// Query audit journal (use .filter() since t.run ctx lacks typed indexes)
		const journalEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("auditJournal")
				.filter((q) =>
					q.and(
						q.eq(q.field("entityType"), "deal"),
						q.eq(q.field("entityId"), dealId)
					)
				)
				.collect();
		});

		// Filter to only "transitioned" entries
		const transitioned = journalEntries
			.filter((e) => e.outcome === "transitioned")
			.sort((a, b) => a.timestamp - b.timestamp);

		// Should have at least 6 entries (one per transition)
		expect(transitioned.length).toBeGreaterThanOrEqual(6);

		// Verify causal chain: journal[i].newState === journal[i+1].previousState
		for (let i = 0; i < transitioned.length - 1; i++) {
			expect(transitioned[i].newState).toBe(transitioned[i + 1].previousState);
		}

		// Verify first and last
		expect(transitioned[0].previousState).toBe("initiated");
		const lastEntry = transitioned.at(-1);
		expect(lastEntry).toBeDefined();
		expect(lastEntry?.newState).toBe("confirmed");
	});
});

// =====================================================================
// T-006: Cancellation Tests (UC-DC-02)
// =====================================================================

const CANCELLATION_EFFECTS = [
	"voidReservation",
	"notifyCancellation",
	"revokeAllDealAccess",
];

describe("Deal Integration — Cancellation (UC-DC-02)", () => {
	it("cancel from initiated -> failed, cancellation effects scheduled", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "DEAL_CANCELLED",
				payload: { reason: "Client withdrew" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.newState).toBe("failed");
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(CANCELLATION_EFFECTS)
		);
	});

	it("cancel from lawyerOnboarding.pending -> failed", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "lawyerOnboarding.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "DEAL_CANCELLED",
				payload: { reason: "Client withdrew" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.newState).toBe("failed");
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(CANCELLATION_EFFECTS)
		);
	});

	it("cancel from documentReview.signed -> failed", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "documentReview.signed");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "DEAL_CANCELLED",
				payload: { reason: "Client withdrew" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.newState).toBe("failed");
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(CANCELLATION_EFFECTS)
		);
	});

	it("cancel from fundsTransfer.pending -> failed", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "fundsTransfer.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "DEAL_CANCELLED",
				payload: { reason: "Client withdrew" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(true);
		expect(result.newState).toBe("failed");
		expect(result.effectsScheduled).toEqual(
			expect.arrayContaining(CANCELLATION_EFFECTS)
		);
	});
});

// =====================================================================
// T-007: Rejection Tests — Out-of-Phase Events (UC-DC-04)
// =====================================================================

describe("Deal Integration — Rejection (UC-DC-04)", () => {
	it("LAWYER_VERIFIED from initiated -> rejected, state unchanged", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "LAWYER_VERIFIED",
				payload: { verificationId: "v-1" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(false);
		expect(result.newState).toBe("initiated");
		expect(result.reason).toBeDefined();
		expect(
			result.effectsScheduled === undefined ||
				result.effectsScheduled.length === 0
		).toBe(true);

		// Verify rejection journaled
		const journalEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("auditJournal")
				.filter((q) =>
					q.and(
						q.eq(q.field("entityType"), "deal"),
						q.eq(q.field("entityId"), dealId)
					)
				)
				.collect();
		});
		const rejected = journalEntries.filter((e) => e.outcome === "rejected");
		expect(rejected.length).toBeGreaterThanOrEqual(1);
		expect(rejected.some((e) => e.eventType === "LAWYER_VERIFIED")).toBe(true);
	});

	it("FUNDS_RECEIVED from lawyerOnboarding.pending -> rejected", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "lawyerOnboarding.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "FUNDS_RECEIVED",
				payload: { method: "manual" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(false);
		expect(result.newState).toBe("lawyerOnboarding.pending");
		expect(result.reason).toBeDefined();
		expect(
			result.effectsScheduled === undefined ||
				result.effectsScheduled.length === 0
		).toBe(true);
	});

	it("REPRESENTATION_CONFIRMED from lawyerOnboarding.pending -> rejected", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "lawyerOnboarding.pending");

		const result = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "REPRESENTATION_CONFIRMED",
				payload: {},
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(result.success).toBe(false);
		expect(result.newState).toBe("lawyerOnboarding.pending");
		expect(result.reason).toBeDefined();
		expect(
			result.effectsScheduled === undefined ||
				result.effectsScheduled.length === 0
		).toBe(true);
	});
});

// =====================================================================
// T-008: Terminal State Rejection Tests
// =====================================================================

describe("Deal Integration — Terminal State Rejection", () => {
	it("any event from confirmed -> rejected", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "confirmed");

		const eventsToReject = [
			{
				eventType: "DEAL_LOCKED",
				payload: { closingDate: Date.now() + 14 * 86_400_000 },
			},
			{ eventType: "DEAL_CANCELLED", payload: { reason: "Too late" } },
			{ eventType: "LAWYER_VERIFIED", payload: { verificationId: "v-2" } },
		];

		for (const event of eventsToReject) {
			const result = (await t.mutation(
				internal.engine.transitionMutation.transitionMutation,
				{
					entityType: "deal",
					entityId: dealId,
					eventType: event.eventType,
					payload: event.payload,
					source: ADMIN_SOURCE,
				}
			)) as TransitionResult;

			expect(result.success).toBe(false);
			expect(result.newState).toBe("confirmed");
			expect(result.reason).toBeDefined();
		}
	});

	it("any event from failed -> rejected", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);

		// Cancel to reach "failed"
		const cancelResult = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "DEAL_CANCELLED",
				payload: { reason: "Client withdrew" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;
		expect(cancelResult.success).toBe(true);
		expect(cancelResult.newState).toBe("failed");

		const eventsToReject = [
			{
				eventType: "DEAL_LOCKED",
				payload: { closingDate: Date.now() + 14 * 86_400_000 },
			},
			{ eventType: "LAWYER_VERIFIED", payload: { verificationId: "v-2" } },
			{ eventType: "FUNDS_RECEIVED", payload: { method: "manual" } },
		];

		for (const event of eventsToReject) {
			const result = (await t.mutation(
				internal.engine.transitionMutation.transitionMutation,
				{
					entityType: "deal",
					entityId: dealId,
					eventType: event.eventType,
					payload: event.payload,
					source: ADMIN_SOURCE,
				}
			)) as TransitionResult;

			expect(result.success).toBe(false);
			expect(result.newState).toBe("failed");
			expect(result.reason).toBeDefined();
		}
	});
});

// =====================================================================
// T-009: Concurrency Simulation (UC-DC-05)
// =====================================================================

describe("Deal Integration — Concurrency (UC-DC-05)", () => {
	it("same event fired twice sequentially: first succeeds, second rejected", async () => {
		const t = createTestHarness();
		const { dealId } = await seedDeal(t);
		await advanceDealTo(t, dealId, "lawyerOnboarding.pending");

		// Admin A fires LAWYER_VERIFIED — should succeed
		const resultA = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "LAWYER_VERIFIED",
				payload: { verificationId: "v-1" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		// Admin B fires LAWYER_VERIFIED — should be rejected (state already advanced)
		const resultB = (await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "LAWYER_VERIFIED",
				payload: { verificationId: "v-2" },
				source: ADMIN_SOURCE,
			}
		)) as TransitionResult;

		expect(resultA.success).toBe(true);
		expect(resultA.newState).toBe("lawyerOnboarding.verified");

		expect(resultB.success).toBe(false);
		expect(resultB.newState).toBe("lawyerOnboarding.verified");
		expect(resultB.reason).toBeDefined();

		// Verify both attempts journaled
		const journalEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("auditJournal")
				.filter((q) =>
					q.and(
						q.eq(q.field("entityType"), "deal"),
						q.eq(q.field("entityId"), dealId),
						q.eq(q.field("eventType"), "LAWYER_VERIFIED")
					)
				)
				.collect();
		});

		const transitioned = journalEntries.filter(
			(e) => e.outcome === "transitioned"
		);
		const rejected = journalEntries.filter((e) => e.outcome === "rejected");

		expect(transitioned).toHaveLength(1);
		expect(rejected).toHaveLength(1);
	});
});

// =====================================================================
// T-011: Prorate Boundary Condition Integration Tests
// =====================================================================
// Rewritten from skipped unit tests in effects.test.ts that required
// internal query execution from action context (convex-test limitation).
// These tests call the prorateAccrualBetweenOwners action via t.action()
// with full Convex runtime support.

// Function reference for prorateAccrualBetweenOwners (not yet in codegen).
// TODO: Replace with `internal.engine.effects.dealClosingProrate.prorateAccrualBetweenOwners`
// once `bunx convex codegen` is re-run with a live deployment.
const prorateActionRef = makeFunctionReference<"action">(
	"engine/effects/dealClosingProrate:prorateAccrualBetweenOwners"
);

/** Parse a date-only string as UTC midnight to avoid timezone-dependent flakiness. */
function parseUTCDate(dateStr: string): number {
	return new Date(`${dateStr}T00:00:00Z`).getTime();
}

/** Seed helper for prorate tests: creates deal + mortgage + borrower + obligations. */
async function seedProrateScenario(
	t: TestHarness,
	opts: {
		closingDate: string; // ISO date e.g. "2026-02-15"
		lastPaymentDate: string; // settled obligation due date
		nextPaymentDate: string; // future obligation due date
		fractionalShare?: number;
	}
) {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authId: "prorate-seed-user",
			email: "prorate@test.com",
			firstName: "Prorate",
			lastName: "User",
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "456 Prorate Ave",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 2B2",
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

		// Seed settled obligation (last payment before closing)
		await ctx.db.insert("obligations", {
			status: "settled",
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 290_800,
			amountSettled: 290_800,
			dueDate: parseUTCDate(opts.lastPaymentDate),
			gracePeriodEnd: parseUTCDate(opts.lastPaymentDate),
			settledAt: parseUTCDate(opts.lastPaymentDate),
			createdAt: Date.now(),
		});

		// Seed future obligation (next payment after closing)
		await ctx.db.insert("obligations", {
			status: "upcoming",
			mortgageId,
			borrowerId,
			paymentNumber: 2,
			type: "regular_interest",
			amount: 290_800,
			amountSettled: 0,
			dueDate: parseUTCDate(opts.nextPaymentDate),
			gracePeriodEnd: parseUTCDate(opts.nextPaymentDate),
			createdAt: Date.now(),
		});

		const closingTimestamp = parseUTCDate(opts.closingDate);
		const dealId = await ctx.db.insert("deals", {
			status: "confirmed",
			mortgageId,
			buyerId: "buyer-prorate-1",
			sellerId: "seller-prorate-1",
			fractionalShare: opts.fractionalShare ?? 3000,
			closingDate: closingTimestamp,
			lawyerId: "test-lawyer",
			lawyerType: "platform_lawyer",
			createdAt: Date.now(),
			createdBy: "test-admin",
		});

		return { dealId, mortgageId, borrowerId };
	});
}

const PRORATE_EFFECT_ARGS_BASE = {
	entityType: "deal" as const,
	eventType: "FUNDS_RECEIVED",
	journalEntryId: "test-journal-prorate",
	effectName: "prorateAccrualBetweenOwners",
	source: ADMIN_SOURCE,
};

describe("Deal Integration — Prorate Boundary Conditions (T-011)", () => {
	it("happy path: writes seller and buyer prorate entries with correct amounts", async () => {
		const t = createTestHarness();
		// Closing Feb 15, last payment Feb 1, next payment Mar 1
		// Seller days: 14 (Feb 1 → Feb 15), Buyer days: 14 (Feb 15 → Mar 1)
		const { dealId, mortgageId } = await seedProrateScenario(t, {
			closingDate: "2026-02-15",
			lastPaymentDate: "2026-02-01",
			nextPaymentDate: "2026-03-01",
			fractionalShare: 3000,
		});

		await t.action(prorateActionRef, {
			...PRORATE_EFFECT_ARGS_BASE,
			entityId: dealId,
		});

		const entries = await t.run(async (ctx) => {
			const all = await ctx.db.query("prorateEntries").collect();
			return all.filter((e) => e.dealId === dealId);
		});

		expect(entries).toHaveLength(2);

		const sellerEntry = entries.find((e) => e.ownerRole === "seller");
		const buyerEntry = entries.find((e) => e.ownerRole === "buyer");

		expect(sellerEntry).toBeDefined();
		expect(buyerEntry).toBeDefined();

		// dailyRate = (0.05 × 0.30 × 500000) / 365 = 7500 / 365 ≈ 20.5479...
		const expectedDailyRate = (0.05 * 0.3 * 500_000) / 365;

		expect(sellerEntry?.days).toBe(14);
		expect(sellerEntry?.dailyRate).toBeCloseTo(expectedDailyRate, 2);
		expect(sellerEntry?.amount).toBeCloseTo(
			Math.round(expectedDailyRate * 14 * 100) / 100,
			2
		);
		expect(sellerEntry?.periodStart).toBe("2026-02-01");
		expect(sellerEntry?.periodEnd).toBe("2026-02-15");
		expect(sellerEntry?.ownerId).toBe("seller-prorate-1");
		expect(sellerEntry?.mortgageId).toBe(mortgageId);

		expect(buyerEntry?.days).toBe(14);
		expect(buyerEntry?.dailyRate).toBeCloseTo(expectedDailyRate, 2);
		expect(buyerEntry?.amount).toBeCloseTo(
			Math.round(expectedDailyRate * 14 * 100) / 100,
			2
		);
		expect(buyerEntry?.periodStart).toBe("2026-02-15");
		expect(buyerEntry?.periodEnd).toBe("2026-03-01");
		expect(buyerEntry?.ownerId).toBe("buyer-prorate-1");
	});

	it("zero seller days: closing on last payment date — only buyer entry", async () => {
		const t = createTestHarness();
		// Closing ON the last payment date (Feb 1) → seller days = 0
		// Buyer days: 28 (Feb 1 → Mar 1)
		const { dealId } = await seedProrateScenario(t, {
			closingDate: "2026-02-01",
			lastPaymentDate: "2026-02-01",
			nextPaymentDate: "2026-03-01",
			fractionalShare: 3000,
		});

		await t.action(prorateActionRef, {
			...PRORATE_EFFECT_ARGS_BASE,
			entityId: dealId,
		});

		const entries = await t.run(async (ctx) => {
			const all = await ctx.db.query("prorateEntries").collect();
			return all.filter((e) => e.dealId === dealId);
		});

		// Zero seller days → no seller entry
		expect(entries).toHaveLength(1);
		expect(entries[0].ownerRole).toBe("buyer");
		expect(entries[0].days).toBe(28);
		expect(entries[0].periodStart).toBe("2026-02-01");
		expect(entries[0].periodEnd).toBe("2026-03-01");
	});

	it("zero buyer days: closing on next payment date — only seller entry", async () => {
		const t = createTestHarness();
		// Closing ON the next payment date (Mar 1) → buyer days = 0
		// Seller days: 28 (Feb 1 → Mar 1)
		const { dealId } = await seedProrateScenario(t, {
			closingDate: "2026-03-01",
			lastPaymentDate: "2026-02-01",
			nextPaymentDate: "2026-03-01",
			fractionalShare: 3000,
		});

		await t.action(prorateActionRef, {
			...PRORATE_EFFECT_ARGS_BASE,
			entityId: dealId,
		});

		const entries = await t.run(async (ctx) => {
			const all = await ctx.db.query("prorateEntries").collect();
			return all.filter((e) => e.dealId === dealId);
		});

		// Zero buyer days → no buyer entry
		expect(entries).toHaveLength(1);
		expect(entries[0].ownerRole).toBe("seller");
		expect(entries[0].days).toBe(28);
		expect(entries[0].periodStart).toBe("2026-02-01");
		expect(entries[0].periodEnd).toBe("2026-03-01");
	});
});
