import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import schema from "../../../schema";
import {
	getControlAccountsBySubaccount,
	getOrCreateCashAccount,
} from "../accounts";
import { postCashEntryInternal } from "../postEntry";
import {
	getControlBalanceBySubaccount,
	validateControlNetZero,
} from "../reconciliation";
import { ENTRY_TYPE_CONTROL_SUBACCOUNT, TRANSIENT_SUBACCOUNTS } from "../types";

const modules = import.meta.glob("/convex/**/*.ts");

const SYSTEM_SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<{
		created: boolean;
		entries: Array<{
			id: Id<"dispersalEntries">;
			lenderId: Id<"lenders">;
			lenderAccountId: Id<"ledger_accounts">;
			amount: number;
			rawAmount: number;
			units: number;
		}>;
		servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
	}>;
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;

type TestHarness = ReturnType<typeof convexTest>;

function createHarness() {
	return convexTest(schema, modules);
}

async function seedCoreEntities(t: TestHarness) {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `broker-${now}`,
			email: `broker-${now}@fairlend.test`,
			firstName: "Broker",
			lastName: "Tester",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `borrower-${now}`,
			email: `borrower-${now}@fairlend.test`,
			firstName: "Borrower",
			lastName: "Tester",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const lenderAUserId = await ctx.db.insert("users", {
			authId: "cash-ledger-lender-a",
			email: "cash-ledger-lender-a@fairlend.test",
			firstName: "Lender",
			lastName: "A",
		});
		const lenderAId = await ctx.db.insert("lenders", {
			userId: lenderAUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-a",
			status: "active",
			createdAt: now,
		});

		const lenderBUserId = await ctx.db.insert("users", {
			authId: "cash-ledger-lender-b",
			email: "cash-ledger-lender-b@fairlend.test",
			firstName: "Lender",
			lastName: "B",
		});
		const lenderBId = await ctx.db.insert("lenders", {
			userId: lenderBUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-b",
			status: "active",
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Control Subaccount Test St",
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

		await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: "cash-ledger-lender-a",
			cumulativeDebits: 6000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: now,
		});
		await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: "cash-ledger-lender-b",
			cumulativeDebits: 4000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: now,
		});

		return {
			borrowerId,
			lenderAId,
			lenderBId,
			mortgageId,
		};
	});
}

async function createSettledObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: args.amount,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: Date.now(),
		});

		const receivableAccountId = await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: BigInt(args.amount),
			createdAt: Date.now(),
		});
		void receivableAccountId;

		await ctx.db.insert("cash_ledger_accounts", {
			family: "CONTROL",
			mortgageId: args.mortgageId,
			obligationId,
			subaccount: "ALLOCATION",
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});

		return obligationId;
	});
}

// ── T-008: ENTRY_TYPE_CONTROL_SUBACCOUNT mapping correctness ──

describe("ENTRY_TYPE_CONTROL_SUBACCOUNT mapping", () => {
	it("maps OBLIGATION_ACCRUED to ACCRUAL", () => {
		expect(ENTRY_TYPE_CONTROL_SUBACCOUNT.OBLIGATION_ACCRUED).toBe("ACCRUAL");
	});

	it("maps CASH_APPLIED to SETTLEMENT", () => {
		expect(ENTRY_TYPE_CONTROL_SUBACCOUNT.CASH_APPLIED).toBe("SETTLEMENT");
	});

	it("maps LENDER_PAYABLE_CREATED to ALLOCATION", () => {
		expect(ENTRY_TYPE_CONTROL_SUBACCOUNT.LENDER_PAYABLE_CREATED).toBe(
			"ALLOCATION"
		);
	});

	it("maps SERVICING_FEE_RECOGNIZED to ALLOCATION", () => {
		expect(ENTRY_TYPE_CONTROL_SUBACCOUNT.SERVICING_FEE_RECOGNIZED).toBe(
			"ALLOCATION"
		);
	});

	it("maps OBLIGATION_WAIVED to WAIVER", () => {
		expect(ENTRY_TYPE_CONTROL_SUBACCOUNT.OBLIGATION_WAIVED).toBe("WAIVER");
	});

	it("returns undefined for entry types not in the map", () => {
		const unmappedTypes = [
			"CASH_RECEIVED",
			"LENDER_PAYOUT_SENT",
			"OBLIGATION_WRITTEN_OFF",
			"REVERSAL",
			"CORRECTION",
		] as const;

		for (const entryType of unmappedTypes) {
			expect(ENTRY_TYPE_CONTROL_SUBACCOUNT[entryType]).toBeUndefined();
		}
	});
});

// ── T-009: getControlAccountsBySubaccount returns correct subset ──

describe("getControlAccountsBySubaccount", () => {
	it("returns only accounts matching the requested subaccount", async () => {
		const t = createHarness();

		await t.run(async (ctx) => {
			const now = Date.now();

			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				subaccount: "ACCRUAL",
				cumulativeDebits: 1000n,
				cumulativeCredits: 0n,
				createdAt: now,
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				subaccount: "ACCRUAL",
				cumulativeDebits: 2000n,
				cumulativeCredits: 0n,
				createdAt: now,
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				subaccount: "ALLOCATION",
				cumulativeDebits: 500n,
				cumulativeCredits: 0n,
				createdAt: now,
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				subaccount: "SETTLEMENT",
				cumulativeDebits: 300n,
				cumulativeCredits: 0n,
				createdAt: now,
			});

			const accrualAccounts = await getControlAccountsBySubaccount(
				ctx.db,
				"ACCRUAL"
			);
			expect(accrualAccounts).toHaveLength(2);
			expect(accrualAccounts.every((a) => a.subaccount === "ACCRUAL")).toBe(
				true
			);

			const allocationAccounts = await getControlAccountsBySubaccount(
				ctx.db,
				"ALLOCATION"
			);
			expect(allocationAccounts).toHaveLength(1);
			expect(allocationAccounts[0].subaccount).toBe("ALLOCATION");

			const settlementAccounts = await getControlAccountsBySubaccount(
				ctx.db,
				"SETTLEMENT"
			);
			expect(settlementAccounts).toHaveLength(1);
			expect(settlementAccounts[0].subaccount).toBe("SETTLEMENT");
		});
	});
});

// ── T-010: getControlBalanceBySubaccount sums correctly ──

describe("getControlBalanceBySubaccount", () => {
	it("sums balances across multiple CONTROL accounts with the same subaccount", async () => {
		const t = createHarness();

		await t.run(async (ctx) => {
			const now = Date.now();

			// CONTROL is NOT credit-normal, so balance = debits - credits.
			// Account 1: debits=5000, credits=2000 => balance=3000
			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				subaccount: "ACCRUAL",
				cumulativeDebits: 5000n,
				cumulativeCredits: 2000n,
				createdAt: now,
			});
			// Account 2: debits=3000, credits=1000 => balance=2000
			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				subaccount: "ACCRUAL",
				cumulativeDebits: 3000n,
				cumulativeCredits: 1000n,
				createdAt: now,
			});

			const result = await getControlBalanceBySubaccount(
				ctx as unknown as QueryCtx,
				"ACCRUAL"
			);

			expect(result.accountCount).toBe(2);
			expect(result.totalBalance).toBe(5000n);
		});
	});
});

// ── T-011: validateControlNetZero for complete posting group ──
// The allocation posting group only debits CONTROL:ALLOCATION (for lender
// payables and servicing fee). The total debits equal the settled amount.
// ACCRUAL and SETTLEMENT are not touched, so they report valid=true (0n).

describe("validateControlNetZero", () => {
	it("reports the correct ALLOCATION balance for a complete allocation posting group", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "ctrl-sub-dispersal-netzero",
				source: SYSTEM_SOURCE,
			});

			const results = await validateControlNetZero(
				ctx as unknown as QueryCtx,
				`allocation:${obligationId}`
			);

			// ALLOCATION is debited for all lender payables + servicing fee = settled amount
			const allocationResult = results.find(
				(r) => r.subaccount === "ALLOCATION"
			);
			expect(allocationResult).toBeDefined();
			expect(allocationResult?.balance).toBe(100_000n);
			expect(allocationResult?.valid).toBe(false);

			// ACCRUAL and SETTLEMENT are not involved in this posting group
			const accrualResult = results.find((r) => r.subaccount === "ACCRUAL");
			expect(accrualResult?.balance).toBe(0n);
			expect(accrualResult?.valid).toBe(true);

			const settlementResult = results.find(
				(r) => r.subaccount === "SETTLEMENT"
			);
			expect(settlementResult?.balance).toBe(0n);
			expect(settlementResult?.valid).toBe(true);
		});
	});

	// ── T-012: incomplete posting group (non-zero) ──

	it("reports a partial ALLOCATION balance when only some entries are posted", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);

		const obligationId = await t.run(async (ctx) => {
			const oId = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 100_000,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				settledAt: Date.parse("2026-03-01T00:00:00Z"),
				createdAt: Date.now(),
			});
			return oId;
		});

		await t.run(async (ctx) => {
			// Create the CONTROL:ALLOCATION account
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});

			// Create a lender payable account
			const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});

			// Post ONLY a LENDER_PAYABLE_CREATED entry (no servicing fee)
			// This debits CONTROL:ALLOCATION and credits LENDER_PAYABLE
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayableAccount._id,
				idempotencyKey: "ctrl-sub-incomplete-lp-1",
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId: `allocation:${obligationId}`,
				source: SYSTEM_SOURCE,
			});

			const results = await validateControlNetZero(
				ctx as unknown as QueryCtx,
				`allocation:${obligationId}`
			);

			const allocationResult = results.find(
				(r) => r.subaccount === "ALLOCATION"
			);
			expect(allocationResult).toBeDefined();
			expect(allocationResult?.balance).not.toBe(0n);
			expect(allocationResult?.valid).toBe(false);
		});
	});

	// ── T-013: WAIVER subaccount exempt from net-zero ──

	it("does not include WAIVER in validateControlNetZero results", async () => {
		const t = createHarness();

		await t.run(async (ctx) => {
			const now = Date.now();

			// Minimal entities for an obligation waiver
			const brokerUserId = await ctx.db.insert("users", {
				authId: "waiver-broker",
				email: "waiver-broker@fairlend.test",
				firstName: "Broker",
				lastName: "Waiver",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: brokerUserId,
				createdAt: now,
			});
			const borrowerUserId = await ctx.db.insert("users", {
				authId: "waiver-borrower",
				email: "waiver-borrower@fairlend.test",
				firstName: "Borrower",
				lastName: "Waiver",
			});
			const borrowerId = await ctx.db.insert("borrowers", {
				status: "active",
				userId: borrowerUserId,
				createdAt: now,
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "456 Waiver Test St",
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

			const obligationId = await ctx.db.insert("obligations", {
				status: "waived",
				machineContext: {},
				lastTransitionAt: now,
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 50_000,
				amountSettled: 0,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				createdAt: now,
			});

			// Create CONTROL:WAIVER account
			const waiverControlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId,
				obligationId,
				subaccount: "WAIVER",
			});

			// Create BORROWER_RECEIVABLE account with a pre-existing debit balance
			// (the obligation was accrued before being waived)
			const receivableAccountId = await ctx.db.insert("cash_ledger_accounts", {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
				borrowerId,
				cumulativeDebits: 50_000n,
				cumulativeCredits: 0n,
				createdAt: now,
			});
			const receivableAccount = await ctx.db.get(receivableAccountId);
			if (!receivableAccount) {
				throw new Error("Failed to create receivable");
			}

			const postingGroupId = `waiver:${obligationId}`;

			// Post OBLIGATION_WAIVED: debit CONTROL:WAIVER, credit BORROWER_RECEIVABLE
			await postCashEntryInternal(ctx, {
				entryType: "OBLIGATION_WAIVED",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: waiverControlAccount._id,
				creditAccountId: receivableAccount._id,
				idempotencyKey: `ctrl-sub-waiver:${obligationId}`,
				mortgageId,
				obligationId,
				borrowerId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			const results = await validateControlNetZero(
				ctx as unknown as QueryCtx,
				postingGroupId
			);

			// WAIVER is NOT in TRANSIENT_SUBACCOUNTS, so it should not appear
			const subaccountsReported = results.map((r) => r.subaccount);
			expect(subaccountsReported).not.toContain("WAIVER");

			// Only transient subaccounts appear
			for (const sub of subaccountsReported) {
				expect(
					TRANSIENT_SUBACCOUNTS.has(
						sub as "ACCRUAL" | "ALLOCATION" | "SETTLEMENT"
					)
				).toBe(true);
			}

			// The transient subaccounts should all be zero (no entries touched them)
			for (const result of results) {
				expect(result.balance).toBe(0n);
				expect(result.valid).toBe(true);
			}
		});
	});
});

// ── T-014: CONTROL account creation with and without subaccount ──

describe("getOrCreateCashAccount with CONTROL subaccounts", () => {
	it("creates different accounts for different subaccounts and is idempotent for the same subaccount", async () => {
		const t = createHarness();

		await t.run(async (ctx) => {
			const now = Date.now();

			// Minimal mortgage for the account spec
			const brokerUserId = await ctx.db.insert("users", {
				authId: "ctrl-create-broker",
				email: "ctrl-create-broker@fairlend.test",
				firstName: "Broker",
				lastName: "Create",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: brokerUserId,
				createdAt: now,
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "789 Create Test St",
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

			// Create CONTROL:ACCRUAL account
			const accrualAccount1 = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId,
				subaccount: "ACCRUAL",
			});

			// Create CONTROL:ALLOCATION account
			const allocationAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId,
				subaccount: "ALLOCATION",
			});

			// They should be different accounts
			expect(accrualAccount1._id).not.toBe(allocationAccount._id);
			expect(accrualAccount1.subaccount).toBe("ACCRUAL");
			expect(allocationAccount.subaccount).toBe("ALLOCATION");

			// Call again with ACCRUAL — should return the SAME account (idempotent)
			const accrualAccount2 = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId,
				subaccount: "ACCRUAL",
			});

			expect(accrualAccount2._id).toBe(accrualAccount1._id);
		});
	});
});
