import { makeFunctionReference } from "convex/server";
import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import auditTrailSchema from "../../components/auditTrail/schema";
import schema from "../../schema";
import { findSettledWithoutDispersals } from "../selfHealing";
import type { HealingCandidate } from "../selfHealingTypes";

// ---------------------------------------------------------------------------
// Module globs
// ---------------------------------------------------------------------------
const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);

// ---------------------------------------------------------------------------
// Function references for mutations that use ctx.scheduler
// ---------------------------------------------------------------------------
const RETRIGGER = makeFunctionReference<
	"mutation",
	{
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledAmount: number;
		settledDate: string;
	},
	{ action: "skipped" | "escalated" | "retriggered"; attemptCount: number }
>("dispersal/selfHealing:retriggerDispersal");

const RESOLVE = makeFunctionReference<
	"mutation",
	{ obligationId: Id<"obligations"> },
	void
>("dispersal/selfHealing:resolveHealingAttempt");

// ---------------------------------------------------------------------------
// Handler type for direct ._handler invocation
// ---------------------------------------------------------------------------
interface FindSettledHandler {
	_handler: (
		ctx: QueryCtx,
		args: Record<string, never>
	) => Promise<HealingCandidate[]>;
}

const findSettledQuery =
	findSettledWithoutDispersals as unknown as FindSettledHandler;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
type TestHarness = ReturnType<typeof convexTest>;

function createHarness(): TestHarness {
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	return t;
}

// ---------------------------------------------------------------------------
// Seed scenario
// ---------------------------------------------------------------------------
interface SeedResult {
	borrowerId: Id<"borrowers">;
	borrowerReceivableAccountId: Id<"cash_ledger_accounts">;
	lenderOneAccountId: Id<"ledger_accounts">;
	lenderTwoAccountId: Id<"ledger_accounts">;
	mortgageId: Id<"mortgages">;
	obligationA: Id<"obligations">;
	obligationB: Id<"obligations">;
	obligationC: Id<"obligations">;
	obligationDue: Id<"obligations">;
}

async function seedScenario(t: TestHarness): Promise<SeedResult> {
	return t.run(async (ctx) => {
		const now = Date.now();

		// ── Users ──
		const brokerUserId = await ctx.db.insert("users", {
			authId: "broker-heal-auth",
			email: "broker-heal@test.com",
			firstName: "Broker",
			lastName: "Heal",
		});
		const borrowerUserId = await ctx.db.insert("users", {
			authId: "borrower-heal-auth",
			email: "borrower-heal@test.com",
			firstName: "Borrower",
			lastName: "Heal",
		});
		const lenderOneUserId = await ctx.db.insert("users", {
			authId: "lender-heal-1",
			email: "lender-heal-one@test.com",
			firstName: "Lender",
			lastName: "One",
		});
		const lenderTwoUserId = await ctx.db.insert("users", {
			authId: "lender-heal-2",
			email: "lender-heal-two@test.com",
			firstName: "Lender",
			lastName: "Two",
		});

		// ── Entities ──
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});
		const lenderOneId = await ctx.db.insert("lenders", {
			userId: lenderOneUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-one",
			status: "active",
			createdAt: now,
		});
		const lenderTwoId = await ctx.db.insert("lenders", {
			userId: lenderTwoUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-two",
			status: "active",
			createdAt: now,
		});

		// ── Property + Mortgage ──
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "999 Healing Ln",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: now,
		});
		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: 0.01,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2027-01-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});

		// ── Obligations ──
		// A: settled, HAS dispersal entries (healthy)
		const obligationA = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 100_000,
			amountSettled: 100_000,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			settledAt: Date.parse("2026-02-01T00:00:00Z"),
			createdAt: now,
		});
		// B: settled, NO dispersal entries (orphan)
		const obligationB = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 2,
			type: "regular_interest",
			amount: 50_000,
			amountSettled: 50_000,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: now,
		});
		// C: settled, NO dispersal entries, already escalated
		const obligationC = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 3,
			type: "regular_interest",
			amount: 30_000,
			amountSettled: 30_000,
			dueDate: Date.parse("2026-04-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-04-16T00:00:00Z"),
			settledAt: Date.parse("2026-04-01T00:00:00Z"),
			createdAt: now,
		});
		// D: non-settled (due) — should never be detected
		const obligationDue = await ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 4,
			type: "regular_interest",
			amount: 75_000,
			amountSettled: 0,
			dueDate: Date.parse("2026-05-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-05-16T00:00:00Z"),
			createdAt: now,
		});

		// ── Ledger positions: 60/40 split, 10_000 total ──
		const lenderOneAccountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: "lender-heal-1",
			cumulativeDebits: 6000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: now,
		});
		const lenderTwoAccountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: "lender-heal-2",
			cumulativeDebits: 4000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: now,
		});

		// ── Dispersal entries for obligationA (healthy) ──
		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderOneId,
			lenderAccountId: lenderOneAccountId,
			amount: 60_000,
			dispersalDate: "2026-02-01",
			obligationId: obligationA,
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: "heal-disp-a-l1",
			calculationDetails: {
				settledAmount: 100_000,
				servicingFee: 0,
				distributableAmount: 100_000,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: 60_000,
				roundedAmount: 60_000,
			},
			createdAt: 1,
		});
		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderTwoId,
			lenderAccountId: lenderTwoAccountId,
			amount: 40_000,
			dispersalDate: "2026-02-01",
			obligationId: obligationA,
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: "heal-disp-a-l2",
			calculationDetails: {
				settledAmount: 100_000,
				servicingFee: 0,
				distributableAmount: 100_000,
				ownershipUnits: 4000,
				totalUnits: 10_000,
				ownershipFraction: 0.4,
				rawAmount: 40_000,
				roundedAmount: 40_000,
			},
			createdAt: 2,
		});

		// ── Escalated healing attempt for obligationC ──
		await ctx.db.insert("dispersalHealingAttempts", {
			obligationId: obligationC,
			attemptCount: 4,
			lastAttemptAt: now,
			escalatedAt: now,
			status: "escalated",
			createdAt: now,
		});

		// ── BORROWER_RECEIVABLE cash account for obligationB (needed for escalation) ──
		const borrowerReceivableAccountId = await ctx.db.insert(
			"cash_ledger_accounts",
			{
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId: obligationB,
				borrowerId,
				cumulativeDebits: 50_000n,
				cumulativeCredits: 0n,
				createdAt: now,
			}
		);

		return {
			borrowerId,
			mortgageId,
			obligationA,
			obligationB,
			obligationC,
			obligationDue,
			lenderOneAccountId,
			lenderTwoAccountId,
			borrowerReceivableAccountId,
		};
	});
}

// ===========================================================================
// Tests
// ===========================================================================

describe("dispersal self-healing", () => {
	// ── T-017: No candidates when all settled obligations have dispersals ──
	it("findSettledWithoutDispersals returns only orphaned, non-escalated obligations", async () => {
		const t = createHarness();
		const { obligationB, obligationC, obligationDue } = await seedScenario(t);

		const candidates = await t.run(async (ctx) => {
			return findSettledQuery._handler(
				ctx as unknown as QueryCtx,
				{} as Record<string, never>
			);
		});

		// obligationB is the only orphan that is NOT escalated
		const candidateIds = candidates.map((c) => c.obligationId);
		expect(candidateIds).toContain(obligationB);
		// obligationA has dispersals → excluded
		// obligationC is escalated → excluded
		expect(candidateIds).not.toContain(obligationC);
		// obligationDue has status "due" → excluded
		expect(candidateIds).not.toContain(obligationDue);

		// Verify the candidate data shape
		const bCandidate = candidates.find((c) => c.obligationId === obligationB);
		expect(bCandidate).toBeDefined();
		expect(bCandidate?.amount).toBe(50_000);
		expect(bCandidate?.settledAt).toBeDefined();
	});

	// ── T-018: Single orphan detected → retriggerDispersal called ──
	it("retriggerDispersal creates a healing attempt with status retrying on first call", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const { obligationB, mortgageId } = await seedScenario(t);

		const result = await t.mutation(RETRIGGER, {
			obligationId: obligationB,
			mortgageId,
			settledAmount: 50_000,
			settledDate: "2026-03-01",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result.action).toBe("retriggered");
		expect(result.attemptCount).toBe(1);

		// Verify healing attempt record
		await t.run(async (ctx) => {
			const all = await ctx.db.query("dispersalHealingAttempts").collect();
			const attempt = all.find((a) => a.obligationId === obligationB);
			expect(attempt).toBeDefined();
			expect(attempt?.status).toBe("retrying");
			expect(attempt?.attemptCount).toBe(1);
		});
		vi.useRealTimers();
	});

	// ── T-019: Idempotent retrigger — calling twice doesn't create duplicates ──
	it("retrigger is idempotent — second call increments attempt count instead of creating duplicate", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const { obligationB, mortgageId } = await seedScenario(t);

		// First call
		await t.mutation(RETRIGGER, {
			obligationId: obligationB,
			mortgageId,
			settledAmount: 50_000,
			settledDate: "2026-03-01",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Second call
		const result2 = await t.mutation(RETRIGGER, {
			obligationId: obligationB,
			mortgageId,
			settledAmount: 50_000,
			settledDate: "2026-03-01",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result2.action).toBe("retriggered");
		expect(result2.attemptCount).toBe(2);

		// Only ONE healing attempt record should exist
		await t.run(async (ctx) => {
			const all = await ctx.db.query("dispersalHealingAttempts").collect();
			const attempts = all.filter((a) => a.obligationId === obligationB);
			expect(attempts).toHaveLength(1);
			expect(attempts[0].attemptCount).toBe(2);
		});
		vi.useRealTimers();
	});

	// ── T-020: Retry counting — 3 attempts increment, 4th triggers escalation ──
	it("escalates after MAX_HEALING_ATTEMPTS retries", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const { obligationB, mortgageId } = await seedScenario(t);

		const args = {
			obligationId: obligationB,
			mortgageId,
			settledAmount: 50_000,
			settledDate: "2026-03-01",
		};

		// Calls 1–3: should be "retriggered"
		const r1 = await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(r1).toEqual({ action: "retriggered", attemptCount: 1 });

		const r2 = await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(r2).toEqual({ action: "retriggered", attemptCount: 2 });

		const r3 = await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(r3).toEqual({ action: "retriggered", attemptCount: 3 });

		// Call 4: should escalate (attemptCount > MAX_HEALING_ATTEMPTS=3)
		const r4 = await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(r4.action).toBe("escalated");
		expect(r4.attemptCount).toBe(4);

		// Verify healing attempt is marked escalated
		await t.run(async (ctx) => {
			const all = await ctx.db.query("dispersalHealingAttempts").collect();
			const attempt = all.find((a) => a.obligationId === obligationB);
			expect(attempt).toBeDefined();
			expect(attempt?.status).toBe("escalated");
			expect(attempt?.escalatedAt).toBeDefined();
			expect(attempt?.attemptCount).toBe(4);
		});
		vi.useRealTimers();
	});

	// ── T-021: Escalation creates SUSPENSE_ESCALATED journal entry ──
	it("escalation posts a SUSPENSE_ESCALATED cash ledger journal entry", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const { obligationB, mortgageId } = await seedScenario(t);

		const args = {
			obligationId: obligationB,
			mortgageId,
			settledAmount: 50_000,
			settledDate: "2026-03-01",
		};

		// Drive to escalation (4 calls)
		await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		await t.mutation(RETRIGGER, args);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify SUSPENSE_ESCALATED journal entry
		await t.run(async (ctx) => {
			const allEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.collect();
			const entry = allEntries.find(
				(e) => e.idempotencyKey === `suspense-escalation:${obligationB}`
			);

			expect(entry).not.toBeNull();
			expect(entry?.entryType).toBe("SUSPENSE_ESCALATED");
			expect(entry?.amount).toBe(50_000n);
			expect(entry?.mortgageId).toBe(mortgageId);
			expect(entry?.obligationId).toBe(obligationB);

			// Verify debit is SUSPENSE, credit is BORROWER_RECEIVABLE
			const debitAccount = entry
				? await ctx.db.get(entry.debitAccountId)
				: null;
			const creditAccount = entry
				? await ctx.db.get(entry.creditAccountId)
				: null;
			expect(debitAccount?.family).toBe("SUSPENSE");
			expect(creditAccount?.family).toBe("BORROWER_RECEIVABLE");
		});
		vi.useRealTimers();
	});

	// ── T-022: Already-escalated obligations are skipped ──
	it("findSettledWithoutDispersals excludes already-escalated obligations", async () => {
		const t = createHarness();
		const { obligationC } = await seedScenario(t);

		const candidates = await t.run(async (ctx) => {
			return findSettledQuery._handler(
				ctx as unknown as QueryCtx,
				{} as Record<string, never>
			);
		});

		const candidateIds = candidates.map((c) => c.obligationId);
		expect(candidateIds).not.toContain(obligationC);
	});

	it("retriggerDispersal returns skipped for an already-escalated obligation", async () => {
		const t = createHarness();
		const { obligationC, mortgageId } = await seedScenario(t);

		const result = await t.mutation(RETRIGGER, {
			obligationId: obligationC,
			mortgageId,
			settledAmount: 30_000,
			settledDate: "2026-04-01",
		});

		expect(result.action).toBe("skipped");
	});

	// ── T-023: resolveHealingAttempt marks attempt as resolved ──
	it("resolveHealingAttempt marks a retrying attempt as resolved", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const { obligationB, mortgageId } = await seedScenario(t);

		// Create a healing attempt by retriggering
		await t.mutation(RETRIGGER, {
			obligationId: obligationB,
			mortgageId,
			settledAmount: 50_000,
			settledDate: "2026-03-01",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Resolve it
		await t.mutation(RESOLVE, { obligationId: obligationB });

		// Verify status changed
		await t.run(async (ctx) => {
			const all = await ctx.db.query("dispersalHealingAttempts").collect();
			const attempt = all.find((a) => a.obligationId === obligationB);
			expect(attempt).toBeDefined();
			expect(attempt?.status).toBe("resolved");
		});
		vi.useRealTimers();
	});
});
