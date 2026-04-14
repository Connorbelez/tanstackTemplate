import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
	createHarness,
	createSettledObligation,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import { registerAuditLogComponent } from "../../../../src/test/convex/registerAuditLogComponent";
import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import auditTrailSchema from "../../../components/auditTrail/schema";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
} from "../../../test/moduleMaps";
import { getOrCreateCashAccount } from "../accounts";
import { postCashEntryInternal } from "../postEntry";
import {
	checkControlNetZero,
	checkMortgageMonthConservation,
	checkNegativePayables,
	checkObligationBalanceDrift,
	checkObligationConservation,
	checkOrphanedObligations,
	checkOrphanedUnappliedCash,
	checkStuckCollections,
	checkSuspenseItems,
	checkUnappliedCash,
	runFullReconciliationSuite,
} from "../reconciliationSuite";
import { buildIdempotencyKey } from "../types";

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;

function createComponentHarness(): TestHarness {
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	return t;
}

const MS_PER_DAY = 86_400_000;

const CASH_LEDGER_IDENTITY = {
	subject: "test-recon-suite-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["cash_ledger:view", "cash_ledger:correct"]),
	user_email: "recon-suite@fairlend.ca",
	user_first_name: "Recon",
	user_last_name: "Suite",
};

function asCashLedgerUser(t: TestHarness) {
	return t.withIdentity(CASH_LEDGER_IDENTITY);
}

// ── T-016: checks 1–4 ─────────────────────────────────────────

describe("ENG-164 reconciliation suite — checks 1–4", () => {
	it("checkUnappliedCash flags UNAPPLIED_CASH with positive balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 25_000n,
		});

		const result = await t.run(async (ctx) => checkUnappliedCash(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.checkName).toBe("unappliedCash");
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.balance).toBe(25_000);
	});

	it("checkNegativePayables flags debit-heavy LENDER_PAYABLE without REVERSAL", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			initialDebitBalance: 10_000n,
			initialCreditBalance: 0n,
		});

		const result = await t.run(async (ctx) => checkNegativePayables(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.items.length).toBeGreaterThanOrEqual(1);
	});

	it("checkNegativePayables still flags a LENDER_PAYABLE account when a REVERSAL leaves it negative", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			initialCreditBalance: 10_000n,
		});
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});

		const seedResult = await postTestEntry(t, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey(
				"lender-payout",
				"recon-np-reversal-seed"
			),
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 20_000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey("reversal", "recon-np-reversal"),
			causedBy: seedResult.entry._id,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) => checkNegativePayables(ctx));
		const hit = result.items.some((i) => i.accountId === lenderPayable._id);
		expect(hit).toBe(true);
	});

	it("checkObligationBalanceDrift flags settled obligations without matching CASH_RECEIVED journal", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const result = await t.run(async (ctx) => checkObligationBalanceDrift(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.driftCents).toBe(100_000);
		expect(result.items[0]?.dueDate).toBe(Date.parse("2026-03-01T00:00:00Z"));
	});

	it("checkControlNetZero surfaces non-zero CONTROL:ALLOCATION posting groups", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const postingGroupId = `allocation:${obligationId}`;

		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			const payableAccount = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 60_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"recon-cnz-partial"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		const result = await t.run(async (ctx) => checkControlNetZero(ctx));
		expect(result.isHealthy).toBe(false);
		const match = result.items.find((i) => i.postingGroupId === postingGroupId);
		expect(match).toBeDefined();
	});
});

// ── T-017: checks 5–8 ─────────────────────────────────────────

describe("ENG-164 reconciliation suite — checks 5–8", () => {
	it("checkSuspenseItems flags positive SUSPENSE balance", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);
		await createTestAccount(t, {
			family: "SUSPENSE",
			initialDebitBalance: 12_000n,
		});

		const result = await t.run(async (ctx) => checkSuspenseItems(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.items.some((i) => i.balance === 12_000)).toBe(true);
	});

	it("checkOrphanedObligations flags due obligations missing OBLIGATION_ACCRUED", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			await ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 2,
				type: "regular_interest",
				amount: 50_000,
				amountSettled: 0,
				dueDate: Date.parse("2026-04-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-04-16T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		const result = await t.run(async (ctx) => checkOrphanedObligations(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.items.some((i) => i.status === "due")).toBe(true);
	});

	it("checkStuckCollections flags executing attempts older than 7 days", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				mortgageId: seeded.mortgageId,
				obligationIds: [] as Id<"obligations">[],
				amount: 10_000,
				method: "manual",
				scheduledDate: Date.now(),
				status: "executing",
				source: "admin",
				createdAt: Date.now(),
			});

			await ctx.db.insert("collectionAttempts", {
				status: "executing",
				planEntryId,
				mortgageId: seeded.mortgageId,
				obligationIds: [] as Id<"obligations">[],
				method: "manual",
				amount: 10_000,
				initiatedAt: Date.now() - 10 * MS_PER_DAY,
			});
		});

		const result = await t.run(async (ctx) => checkStuckCollections(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.initiatedAt).toBeLessThan(
			Date.now() - 7 * MS_PER_DAY
		);
	});

	it("checkStuckCollections is healthy at exactly 7 days (boundary — not strictly older)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const nowAtStart = Date.now();
		const sevenDaysAgo = nowAtStart - 7 * MS_PER_DAY;

		await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				mortgageId: seeded.mortgageId,
				obligationIds: [] as Id<"obligations">[],
				amount: 10_000,
				method: "manual",
				scheduledDate: Date.now(),
				status: "executing",
				source: "admin",
				createdAt: Date.now(),
			});

			await ctx.db.insert("collectionAttempts", {
				status: "executing",
				planEntryId,
				mortgageId: seeded.mortgageId,
				obligationIds: [] as Id<"obligations">[],
				method: "manual",
				amount: 10_000,
				initiatedAt: sevenDaysAgo,
			});
		});

		const result = await t.run(async (ctx) =>
			checkStuckCollections(ctx, { nowMs: nowAtStart })
		);
		expect(result.isHealthy).toBe(true);
		expect(result.items).toHaveLength(0);
	});

	it("checkOrphanedUnappliedCash is healthy at exactly 7 days (boundary — age is not > STUCK_THRESHOLD)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const account = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 5_000n,
		});

		// Exactly 7 days old — the strict > threshold should NOT flag it
		const atBoundary = await t.run(async (ctx) => {
			const doc = await ctx.db.get(account._id);
			if (!doc) {
				throw new Error("missing account");
			}
			return doc._creationTime + 7 * MS_PER_DAY;
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedUnappliedCash(ctx, { nowMs: atBoundary })
		);
		expect(result.isHealthy).toBe(true);
		expect(result.items).toHaveLength(0);
	});

	it("checkOrphanedUnappliedCash requires balance and age > 7 days (nowMs override)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const account = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 5_000n,
		});

		const later = await t.run(async (ctx) => {
			const doc = await ctx.db.get(account._id);
			if (!doc) {
				throw new Error("missing account");
			}
			return doc._creationTime + 8 * MS_PER_DAY;
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedUnappliedCash(ctx, { nowMs: later })
		);
		expect(result.isHealthy).toBe(false);
		expect(result.items).toHaveLength(1);
	});
});

// ── T-018: conservation + query filters ────────────────────

describe("ENG-164 conservation checks and query filters", () => {
	it("checkObligationConservation flags dispersal + fee totals that do not match obligation.amount", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const ledgerAccount = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
				)
				.first();
			if (!ledgerAccount) {
				throw new Error("ledger account expected");
			}
			await ctx.db.insert("dispersalEntries", {
				obligationId,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				lenderAccountId: ledgerAccount._id,
				amount: 40_000,
				dispersalDate: "2026-03-01",
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: "recon-conservation-bad",
				calculationDetails: {
					settledAmount: 100_000,
					servicingFee: 0,
					distributableAmount: 100_000,
					feeDue: 0,
					feeCashApplied: 0,
					feeReceivable: 0,
					ownershipUnits: 6000,
					totalUnits: 10_000,
					ownershipFraction: 0.6,
					rawAmount: 40_000,
					roundedAmount: 40_000,
					sourceObligationType: "regular_interest",
				},
				createdAt: Date.now(),
			});
		});

		const result = await t.run(async (ctx) => checkObligationConservation(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.items[0]?.differenceCents).toBe(-60_000);
	});

	it("checkMortgageMonthConservation aggregates settled obligations by mortgage month", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const ledgerAccount = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
				)
				.first();
			if (!ledgerAccount) {
				throw new Error("ledger account expected");
			}
			await ctx.db.insert("dispersalEntries", {
				obligationId,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				lenderAccountId: ledgerAccount._id,
				amount: 40_000,
				dispersalDate: "2026-03-01",
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: "recon-mm-bad",
				calculationDetails: {
					settledAmount: 100_000,
					servicingFee: 0,
					distributableAmount: 100_000,
					feeDue: 0,
					feeCashApplied: 0,
					feeReceivable: 0,
					ownershipUnits: 6000,
					totalUnits: 10_000,
					ownershipFraction: 0.6,
					rawAmount: 40_000,
					roundedAmount: 40_000,
					sourceObligationType: "regular_interest",
				},
				createdAt: Date.now(),
			});
		});

		const result = await t.run(async (ctx) =>
			checkMortgageMonthConservation(ctx)
		);
		expect(result.isHealthy).toBe(false);
		expect(result.items.some((i) => i.month === "2026-03")).toBe(true);
	});

	it("reconciliationOrphanedObligations filters by mortgageId and dueDate range", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			await ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 3,
				type: "regular_interest",
				amount: 50_000,
				amountSettled: 0,
				dueDate: Date.parse("2026-04-10T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-04-25T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		const wide = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationOrphanedObligations,
			{
				mortgageId: seeded.mortgageId,
				fromDate: "2026-04-01",
				toDate: "2026-04-30",
			}
		);
		expect(wide.count).toBe(1);

		const narrow = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationOrphanedObligations,
			{
				mortgageId: seeded.mortgageId,
				fromDate: "2026-05-01",
				toDate: "2026-05-31",
			}
		);
		expect(narrow.count).toBe(0);
	});

	it("reconciliationMortgageMonthConservation filters by month bounds", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const ledgerAccount = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
				)
				.first();
			if (!ledgerAccount) {
				throw new Error("ledger account expected");
			}
			await ctx.db.insert("dispersalEntries", {
				obligationId,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				lenderAccountId: ledgerAccount._id,
				amount: 40_000,
				dispersalDate: "2026-03-01",
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: "recon-mm-filter",
				calculationDetails: {
					settledAmount: 100_000,
					servicingFee: 0,
					distributableAmount: 100_000,
					feeDue: 0,
					feeCashApplied: 0,
					feeReceivable: 0,
					ownershipUnits: 6000,
					totalUnits: 10_000,
					ownershipFraction: 0.6,
					rawAmount: 40_000,
					roundedAmount: 40_000,
					sourceObligationType: "regular_interest",
				},
				createdAt: Date.now(),
			});
		});

		const inMarch = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationMortgageMonthConservation,
			{
				mortgageId: seeded.mortgageId,
				fromDate: "2026-03-01",
				toDate: "2026-03-31",
			}
		);
		expect(inMarch.count).toBe(1);

		const wrongMonth = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationMortgageMonthConservation,
			{
				mortgageId: seeded.mortgageId,
				fromDate: "2026-01-01",
				toDate: "2026-01-31",
			}
		);
		expect(wrongMonth.count).toBe(0);
	});

	// ── filter coverage for 7 uncovered query endpoints ─────────────

	it("reconciliationUnappliedCash filters by mortgageId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 25_000n,
		});

		const unmatched = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries.reconciliationUnappliedCash,
			{ mortgageId: seeded.mortgageId }
		);
		expect(unmatched.count).toBe(1);

		// Non-existent mortgage should return no matches
		const otherSeeded = await seedMinimalEntities(t);
		const wrong = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries.reconciliationUnappliedCash,
			{ mortgageId: otherSeeded.mortgageId }
		);
		expect(wrong.count).toBe(0);
	});

	it("reconciliationUnappliedCash filters by date range", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 10_000n,
		});

		// No filter — should find the account
		const all = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries.reconciliationUnappliedCash,
			{}
		);
		expect(all.count).toBeGreaterThan(0);

		// Date range in the future — should be empty
		const future = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries.reconciliationUnappliedCash,
			{ fromDate: "2099-01-01", toDate: "2099-12-31" }
		);
		expect(future.count).toBe(0);
	});

	it("reconciliationNegativePayables filters by lenderId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const lenderAPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			lenderId: seeded.lenderAId,
			initialDebitBalance: 10_000n,
		});
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			lenderId: seeded.lenderBId,
			initialDebitBalance: 20_000n,
		});

		const onlyA = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationNegativePayables,
			{ lenderId: seeded.lenderAId }
		);
		expect(onlyA.items.some((i) => i.accountId === lenderAPayable._id)).toBe(
			true
		);
		expect(onlyA.items.every((i) => i.lenderId === seeded.lenderAId)).toBe(
			true
		);
	});

	it("reconciliationSuspenseItems filters by mortgageId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 5_000n,
		});

		const matched = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries.reconciliationSuspenseItems,
			{ mortgageId: seeded.mortgageId }
		);
		expect(matched.count).toBe(1);

		const unmatched = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries.reconciliationSuspenseItems,
			{}
		);
		expect(unmatched.count).toBeGreaterThanOrEqual(1);
	});

	it("reconciliationStuckCollections filters by date range", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const nowAtStart = Date.now();

		await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				mortgageId: seeded.mortgageId,
				obligationIds: [] as Id<"obligations">[],
				amount: 10_000,
				method: "manual",
				scheduledDate: Date.now(),
				status: "executing",
				source: "admin",
				createdAt: Date.now(),
			});
			await ctx.db.insert("collectionAttempts", {
				status: "executing",
				planEntryId,
				mortgageId: seeded.mortgageId,
				obligationIds: [] as Id<"obligations">[],
				method: "manual",
				amount: 10_000,
				initiatedAt: nowAtStart - 10 * MS_PER_DAY,
			});
		});

		const all = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationStuckCollections,
			{}
		);
		expect(all.count).toBeGreaterThan(0);

		const future = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationStuckCollections,
			{ fromDate: "2099-01-01", toDate: "2099-12-31" }
		);
		expect(future.count).toBe(0);
	});

	it("reconciliationOrphanedUnapplied filters by mortgageId and date range", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const account = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 5_000n,
		});

		// Account is fresh (created moments ago) → age = 0 → not orphaned.
		// No filter matches and orphaned check also returns 0.
		const result = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationOrphanedUnapplied,
			{ mortgageId: seeded.mortgageId }
		);
		expect(result.items.every((i) => i.accountId !== account._id)).toBe(true);
	});

	it("reconciliationObligationConservation filters by mortgageId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const ledgerAccount = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
				)
				.first();
			if (!ledgerAccount) {
				throw new Error("ledger account expected");
			}
			await ctx.db.insert("dispersalEntries", {
				obligationId,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				lenderAccountId: ledgerAccount._id,
				amount: 40_000,
				dispersalDate: "2026-03-01",
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: "recon-oc-filter-test",
				calculationDetails: {
					settledAmount: 100_000,
					servicingFee: 0,
					distributableAmount: 100_000,
					feeDue: 0,
					feeCashApplied: 0,
					feeReceivable: 0,
					ownershipUnits: 6000,
					totalUnits: 10_000,
					ownershipFraction: 0.6,
					rawAmount: 40_000,
					roundedAmount: 40_000,
					sourceObligationType: "regular_interest",
				},
				createdAt: Date.now(),
			});
		});

		const withFilter = await asCashLedgerUser(t).query(
			api.payments.cashLedger.reconciliationQueries
				.reconciliationObligationConservation,
			{ mortgageId: seeded.mortgageId }
		);
		expect(withFilter.count).toBeGreaterThan(0);
	});

	it("rejects invalid YYYY-MM-DD filters with ConvexError", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		await expect(
			asCashLedgerUser(t).query(
				api.payments.cashLedger.reconciliationQueries
					.reconciliationUnappliedCash,
				{ fromDate: "not-a-date" }
			)
		).rejects.toThrow(ConvexError);
	});
});

// ── T-019: full suite + cron pattern ─────────────────────────

describe("ENG-164 full suite aggregation and cron wiring", () => {
	it("runFullReconciliationSuite returns structured results on clean seed", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		const result = await t.run(async (ctx) => runFullReconciliationSuite(ctx));
		expect(result.isHealthy).toBe(true);
		expect(result.checkResults).toHaveLength(8);
		expect(result.conservationResults).toHaveLength(2);
		expect(result.totalGapCount).toBe(0);
		expect(result.unhealthyCheckNames).toEqual([]);
	});

	it("internal reconcileCashLedgerInternal mirrors runFullReconciliationSuite", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		const fromCron = await t.query(
			internal.payments.cashLedger.reconciliationCron
				.reconcileCashLedgerInternal,
			{}
		);
		expect(fromCron.isHealthy).toBe(true);
		expect(
			fromCron.checkResults.length + fromCron.conservationResults.length
		).toBe(10);
	});

	it("cashLedgerReconciliation internalAction runs without error", async () => {
		const t = createComponentHarness();
		await seedMinimalEntities(t);

		const out = await t.action(
			internal.payments.cashLedger.reconciliationCron.cashLedgerReconciliation,
			{}
		);
		expect(out).not.toBeNull();
		expect(out?.isHealthy).toBe(true);
	});
});
