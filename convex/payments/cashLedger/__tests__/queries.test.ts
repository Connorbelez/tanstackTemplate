import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import schema from "../../../schema";
import { convexModules } from "../../../test/moduleMaps";
import { getCashAccountBalance, isCreditNormalFamily } from "../accounts";

const modules = convexModules;

const UNAUTHORIZED_PATTERN = /Unauthorized/;
const FORBIDDEN_PATTERN = /Forbidden/;

const SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

const CASH_LEDGER_IDENTITY = {
	subject: "test-cash-ledger-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["cash_ledger:view", "cash_ledger:correct"]),
	user_email: "cash-ledger-test@fairlend.ca",
	user_first_name: "CashLedger",
	user_last_name: "Tester",
};

/**
 * Identity with "ledger:view" but NOT "cash_ledger:view".
 * Used to prove the permission boundary — cashLedgerQuery must reject this.
 */
const WRONG_PERMISSION_IDENTITY = {
	subject: "test-wrong-perm-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view"]),
	user_email: "wrong-perm-test@fairlend.ca",
	user_first_name: "WrongPerm",
	user_last_name: "Tester",
};

type TestHarness = ReturnType<typeof convexTest>;

function createHarness() {
	return convexTest(schema, modules);
}

function asCashLedgerUser(t: TestHarness) {
	return t.withIdentity(CASH_LEDGER_IDENTITY);
}

// ── Seed Helpers ──────────────────────────────────────────────

interface SeedResult {
	borrowerId: Id<"borrowers">;
	lenderId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
}

async function seedCore(t: TestHarness): Promise<SeedResult> {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `broker-q-${now}`,
			email: `broker-q-${now}@fairlend.test`,
			firstName: "Broker",
			lastName: "Q",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `borrower-q-${now}`,
			email: `borrower-q-${now}@fairlend.test`,
			firstName: "Borrower",
			lastName: "Q",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const lenderUserId = await ctx.db.insert("users", {
			authId: `lender-q-${now}`,
			email: `lender-q-${now}@fairlend.test`,
			firstName: "Lender",
			lastName: "Q",
		});
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-q",
			status: "active",
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "456 Query Test Rd",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 2B2",
			propertyType: "residential",
			createdAt: now,
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			annualServicingRate: 0.01,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2026-12-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});

		return { borrowerId, lenderId, mortgageId };
	});
}

/** Insert a cash_ledger_account via raw ctx.db.insert */
async function insertAccount(
	t: TestHarness,
	fields: {
		family: string;
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		borrowerId?: Id<"borrowers">;
		lenderId?: Id<"lenders">;
		cumulativeDebits: bigint;
		cumulativeCredits: bigint;
		subaccount?: string;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("cash_ledger_accounts", {
			...fields,
			createdAt: Date.now(),
		} as Parameters<typeof ctx.db.insert<"cash_ledger_accounts">>[1]);
	});
}

/** Insert a journal entry via raw ctx.db.insert */
async function insertJournalEntry(
	t: TestHarness,
	fields: {
		sequenceNumber: bigint;
		entryType: string;
		debitAccountId: Id<"cash_ledger_accounts">;
		creditAccountId: Id<"cash_ledger_accounts">;
		amount: bigint;
		effectiveDate: string;
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		lenderId?: Id<"lenders">;
		borrowerId?: Id<"borrowers">;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("cash_ledger_journal_entries", {
			...fields,
			timestamp: Date.now(),
			idempotencyKey: `test-${fields.sequenceNumber}`,
			source: SOURCE,
		} as Parameters<typeof ctx.db.insert<"cash_ledger_journal_entries">>[1]);
	});
}

async function insertObligation(
	t: TestHarness,
	fields: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		paymentNumber?: number;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: "upcoming",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: fields.mortgageId,
			borrowerId: fields.borrowerId,
			paymentNumber: fields.paymentNumber ?? 1,
			type: "regular_interest",
			amount: fields.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: Date.now(),
		});
	});
}

// ── getAccountBalanceRange ────────────────────────────────────

describe("getAccountBalanceRange", () => {
	it("partitions entries into opening and closing balances by effectiveDate", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const trustCashId = await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 300_000n,
			cumulativeCredits: 0n,
		});
		const clearingId = await insertAccount(t, {
			family: "CASH_CLEARING",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 300_000n,
		});

		// Jan (before range), Feb (in range), Mar (in range)
		await insertJournalEntry(t, {
			sequenceNumber: 1n,
			entryType: "CASH_RECEIVED",
			debitAccountId: trustCashId,
			creditAccountId: clearingId,
			amount: 100_000n,
			effectiveDate: "2026-01-15",
			mortgageId: seeded.mortgageId,
		});
		await insertJournalEntry(t, {
			sequenceNumber: 2n,
			entryType: "CASH_RECEIVED",
			debitAccountId: trustCashId,
			creditAccountId: clearingId,
			amount: 80_000n,
			effectiveDate: "2026-02-15",
			mortgageId: seeded.mortgageId,
		});
		await insertJournalEntry(t, {
			sequenceNumber: 3n,
			entryType: "CASH_RECEIVED",
			debitAccountId: trustCashId,
			creditAccountId: clearingId,
			amount: 120_000n,
			effectiveDate: "2026-03-15",
			mortgageId: seeded.mortgageId,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getAccountBalanceRange,
			{
				accountId: trustCashId,
				fromDate: "2026-02-01",
				toDate: "2026-03-31",
			}
		);

		// TRUST_CASH is debit-normal: debit increases balance
		// Opening: 100_000 (Jan entry, before range)
		expect(result.openingBalance).toBe(100_000n);
		// Closing: 100_000 + 80_000 + 120_000 = 300_000
		expect(result.closingBalance).toBe(300_000n);
		expect(result.entryCount).toBe(2);
		expect(result.entries).toHaveLength(2);
	});

	it("returns zero balances when no entries exist", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const emptyAccountId = await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getAccountBalanceRange,
			{
				accountId: emptyAccountId,
				fromDate: "2026-01-01",
				toDate: "2026-12-31",
			}
		);

		expect(result.openingBalance).toBe(0n);
		expect(result.closingBalance).toBe(0n);
		expect(result.entryCount).toBe(0);
	});

	it("applies credit-normal sign convention for LENDER_PAYABLE", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const payableId = await insertAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			cumulativeDebits: 0n,
			cumulativeCredits: 50_000n,
		});
		const controlId = await insertAccount(t, {
			family: "CONTROL",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 50_000n,
			cumulativeCredits: 0n,
			subaccount: "ALLOCATION",
		});

		await insertJournalEntry(t, {
			sequenceNumber: 10n,
			entryType: "LENDER_PAYABLE_CREATED",
			debitAccountId: controlId,
			creditAccountId: payableId,
			amount: 50_000n,
			effectiveDate: "2026-02-01",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getAccountBalanceRange,
			{
				accountId: payableId,
				fromDate: "2026-01-01",
				toDate: "2026-12-31",
			}
		);

		// Credit-normal: positive balance when credits > debits
		expect(result.closingBalance).toBe(50_000n);
	});

	it("excludes entries after toDate from closing balance", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const accountId = await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 200_000n,
			cumulativeCredits: 0n,
		});
		const counterId = await insertAccount(t, {
			family: "CASH_CLEARING",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 200_000n,
		});

		await insertJournalEntry(t, {
			sequenceNumber: 20n,
			entryType: "CASH_RECEIVED",
			debitAccountId: accountId,
			creditAccountId: counterId,
			amount: 100_000n,
			effectiveDate: "2026-02-01",
			mortgageId: seeded.mortgageId,
		});
		await insertJournalEntry(t, {
			sequenceNumber: 21n,
			entryType: "CASH_RECEIVED",
			debitAccountId: accountId,
			creditAccountId: counterId,
			amount: 100_000n,
			effectiveDate: "2026-04-01",
			mortgageId: seeded.mortgageId,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getAccountBalanceRange,
			{
				accountId,
				fromDate: "2026-01-01",
				toDate: "2026-03-31",
			}
		);

		// Only Feb entry in range; Apr excluded
		expect(result.closingBalance).toBe(100_000n);
		expect(result.entryCount).toBe(1);
	});

	it("deduplicates entries that appear in both debit and credit results", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		// Self-referencing entry (debit and credit are the same account)
		const accountId = await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 50_000n,
			cumulativeCredits: 50_000n,
		});

		await insertJournalEntry(t, {
			sequenceNumber: 30n,
			entryType: "CORRECTION",
			debitAccountId: accountId,
			creditAccountId: accountId,
			amount: 50_000n,
			effectiveDate: "2026-02-15",
			mortgageId: seeded.mortgageId,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getAccountBalanceRange,
			{
				accountId,
				fromDate: "2026-01-01",
				toDate: "2026-12-31",
			}
		);

		// Debit side: +50_000, but raw delta calculation for same account debit = +amount
		// Entry appears once (deduped), counted as debit since debitAccountId matches
		expect(result.entryCount).toBe(1);
	});
});

// ── getBorrowerBalance ────────────────────────────────────────

describe("getBorrowerBalance", () => {
	it("aggregates BORROWER_RECEIVABLE accounts for a borrower", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const obligationId1 = await insertObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
			paymentNumber: 1,
		});
		const obligationId2 = await insertObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 30_000,
			paymentNumber: 2,
		});

		await insertAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			obligationId: obligationId1,
			borrowerId: seeded.borrowerId,
			cumulativeDebits: 50_000n,
			cumulativeCredits: 0n,
		});
		await insertAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			obligationId: obligationId2,
			borrowerId: seeded.borrowerId,
			cumulativeDebits: 30_000n,
			cumulativeCredits: 0n,
		});
		// Non-receivable account — should be excluded
		await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			cumulativeDebits: 999_999n,
			cumulativeCredits: 0n,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getBorrowerBalance,
			{ borrowerId: seeded.borrowerId }
		);

		expect(result.total).toBe(80_000n);
		expect(result.obligations).toHaveLength(2);

		const ob1 = result.obligations.find(
			(o: { obligationId: string }) => o.obligationId === obligationId1
		);
		const ob2 = result.obligations.find(
			(o: { obligationId: string }) => o.obligationId === obligationId2
		);
		expect(ob1?.balance).toBe(50_000n);
		expect(ob2?.balance).toBe(30_000n);
	});

	it("returns zero total when borrower has no receivable accounts", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const result = await auth.query(
			api.payments.cashLedger.queries.getBorrowerBalance,
			{ borrowerId: seeded.borrowerId }
		);

		expect(result.total).toBe(0n);
		expect(result.obligations).toHaveLength(0);
	});
});

// ── getBalancesByFamily ───────────────────────────────────────

describe("getBalancesByFamily", () => {
	it("groups balances by family for a specific mortgage", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 200_000n,
			cumulativeCredits: 0n,
		});
		await insertAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 100_000n,
			cumulativeCredits: 40_000n,
		});
		await insertAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			cumulativeDebits: 0n,
			cumulativeCredits: 80_000n,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getBalancesByFamily,
			{ mortgageId: seeded.mortgageId }
		);

		expect(result.TRUST_CASH).toBe(200_000n);
		expect(result.BORROWER_RECEIVABLE).toBe(60_000n);
		expect(result.LENDER_PAYABLE).toBe(80_000n);
	});

	it("aggregates multiple accounts of the same family", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 100_000n,
			cumulativeCredits: 0n,
		});
		await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 50_000n,
			cumulativeCredits: 0n,
		});

		const result = await auth.query(
			api.payments.cashLedger.queries.getBalancesByFamily,
			{ mortgageId: seeded.mortgageId }
		);

		expect(result.TRUST_CASH).toBe(150_000n);
	});

	it("returns empty object when no accounts exist for mortgage", async () => {
		const t = createHarness();
		const auth = asCashLedgerUser(t);
		const seeded = await seedCore(t);

		const result = await auth.query(
			api.payments.cashLedger.queries.getBalancesByFamily,
			{ mortgageId: seeded.mortgageId }
		);

		expect(Object.keys(result)).toHaveLength(0);
	});
});

// ── Auth rejection ───────────────────────────────────────────

describe("auth", () => {
	it("rejects unauthenticated access to getAccountBalanceRange", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		const accountId = await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
		});

		await expect(
			t.query(api.payments.cashLedger.queries.getAccountBalanceRange, {
				accountId,
				fromDate: "2026-01-01",
				toDate: "2026-12-31",
			})
		).rejects.toThrow(UNAUTHORIZED_PATTERN);
	});

	it("rejects unauthenticated access to getBorrowerBalance", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		await expect(
			t.query(api.payments.cashLedger.queries.getBorrowerBalance, {
				borrowerId: seeded.borrowerId,
			})
		).rejects.toThrow(UNAUTHORIZED_PATTERN);
	});

	it("rejects unauthenticated access to getBalancesByFamily", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		await expect(
			t.query(api.payments.cashLedger.queries.getBalancesByFamily, {
				mortgageId: seeded.mortgageId,
			})
		).rejects.toThrow(UNAUTHORIZED_PATTERN);
	});

	it("rejects ledger:view (without cash_ledger:view) on getAccountBalanceRange", async () => {
		const t = createHarness();
		const wrongAuth = t.withIdentity(WRONG_PERMISSION_IDENTITY);
		const seeded = await seedCore(t);

		const accountId = await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
		});

		await expect(
			wrongAuth.query(api.payments.cashLedger.queries.getAccountBalanceRange, {
				accountId,
				fromDate: "2026-01-01",
				toDate: "2026-12-31",
			})
		).rejects.toThrow(FORBIDDEN_PATTERN);
	});

	it("rejects ledger:view (without cash_ledger:view) on getBorrowerBalance", async () => {
		const t = createHarness();
		const wrongAuth = t.withIdentity(WRONG_PERMISSION_IDENTITY);
		const seeded = await seedCore(t);

		await expect(
			wrongAuth.query(api.payments.cashLedger.queries.getBorrowerBalance, {
				borrowerId: seeded.borrowerId,
			})
		).rejects.toThrow(FORBIDDEN_PATTERN);
	});

	it("rejects ledger:view (without cash_ledger:view) on getBalancesByFamily", async () => {
		const t = createHarness();
		const wrongAuth = t.withIdentity(WRONG_PERMISSION_IDENTITY);
		const seeded = await seedCore(t);

		await expect(
			wrongAuth.query(api.payments.cashLedger.queries.getBalancesByFamily, {
				mortgageId: seeded.mortgageId,
			})
		).rejects.toThrow(FORBIDDEN_PATTERN);
	});
});

// ── Internal Queries ─────────────────────────────────────────

describe("internalGetObligationBalance", () => {
	it("returns outstanding balance as number for an obligation with a receivable", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		const obligationId = await insertObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 75_000,
		});

		await insertAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
			cumulativeDebits: 75_000n,
			cumulativeCredits: 25_000n,
		});

		const balance = await t.query(
			internal.payments.cashLedger.queries.internalGetObligationBalance,
			{ obligationId }
		);

		expect(balance).toBe(50_000);
		expect(typeof balance).toBe("number");
	});

	it("returns 0 when no receivable account exists", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		const obligationId = await insertObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const balance = await t.query(
			internal.payments.cashLedger.queries.internalGetObligationBalance,
			{ obligationId }
		);

		expect(balance).toBe(0);
	});
});

describe("internalGetLenderPayableBalance", () => {
	it("sums LENDER_PAYABLE accounts for a lender as number", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		await insertAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			cumulativeDebits: 0n,
			cumulativeCredits: 60_000n,
		});
		await insertAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			cumulativeDebits: 10_000n,
			cumulativeCredits: 40_000n,
		});
		// Non-payable — excluded
		await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			cumulativeDebits: 999_999n,
			cumulativeCredits: 0n,
		});

		const balance = await t.query(
			internal.payments.cashLedger.queries.internalGetLenderPayableBalance,
			{ lenderId: seeded.lenderId }
		);

		// Credit-normal: (60_000 - 0) + (40_000 - 10_000) = 90_000
		expect(balance).toBe(90_000);
		expect(typeof balance).toBe("number");
	});

	it("returns 0 when lender has no payable accounts", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		const balance = await t.query(
			internal.payments.cashLedger.queries.internalGetLenderPayableBalance,
			{ lenderId: seeded.lenderId }
		);

		expect(balance).toBe(0);
	});
});

describe("internalGetMortgageCashState", () => {
	it("returns family-grouped balances as numbers", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		await insertAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 200_000n,
			cumulativeCredits: 50_000n,
		});
		await insertAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			cumulativeDebits: 100_000n,
			cumulativeCredits: 0n,
		});
		await insertAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderId,
			cumulativeDebits: 0n,
			cumulativeCredits: 75_000n,
		});

		const state = await t.query(
			internal.payments.cashLedger.queries.internalGetMortgageCashState,
			{ mortgageId: seeded.mortgageId }
		);

		expect(state.TRUST_CASH).toBe(150_000);
		expect(state.BORROWER_RECEIVABLE).toBe(100_000);
		expect(state.LENDER_PAYABLE).toBe(75_000);
		expect(typeof state.TRUST_CASH).toBe("number");
	});

	it("returns empty state when no accounts exist", async () => {
		const t = createHarness();
		const seeded = await seedCore(t);

		const state = await t.query(
			internal.payments.cashLedger.queries.internalGetMortgageCashState,
			{ mortgageId: seeded.mortgageId }
		);

		expect(Object.keys(state)).toHaveLength(0);
	});
});

// ── Pure function unit tests ─────────────────────────────────

describe("getCashAccountBalance (pure)", () => {
	it("computes debit-normal balance for TRUST_CASH", () => {
		const balance = getCashAccountBalance({
			family: "TRUST_CASH",
			cumulativeDebits: 500n,
			cumulativeCredits: 200n,
		});
		expect(balance).toBe(300n);
	});

	it("computes credit-normal balance for LENDER_PAYABLE", () => {
		const balance = getCashAccountBalance({
			family: "LENDER_PAYABLE",
			cumulativeDebits: 100n,
			cumulativeCredits: 400n,
		});
		expect(balance).toBe(300n);
	});

	it("returns negative for overdraft on debit-normal account", () => {
		const balance = getCashAccountBalance({
			family: "TRUST_CASH",
			cumulativeDebits: 100n,
			cumulativeCredits: 300n,
		});
		expect(balance).toBe(-200n);
	});
});

describe("isCreditNormalFamily", () => {
	it("classifies LENDER_PAYABLE as credit-normal", () => {
		expect(isCreditNormalFamily("LENDER_PAYABLE")).toBe(true);
	});

	it("classifies SERVICING_REVENUE as credit-normal", () => {
		expect(isCreditNormalFamily("SERVICING_REVENUE")).toBe(true);
	});

	it("classifies TRUST_CASH as debit-normal", () => {
		expect(isCreditNormalFamily("TRUST_CASH")).toBe(false);
	});

	it("classifies BORROWER_RECEIVABLE as debit-normal", () => {
		expect(isCreditNormalFamily("BORROWER_RECEIVABLE")).toBe(false);
	});
});
