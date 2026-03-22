import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import { applyPayment } from "../../../engine/effects/obligationPayment";
import { getOrCreateCashAccount } from "../accounts";
import { postObligationAccrued } from "../integrations";
import { postLenderPayout } from "../mutations";
import { postCashEntryInternal } from "../postEntry";
import { reconcileObligationSettlementProjectionInternal } from "../reconciliation";
import { createHarness, SYSTEM_SOURCE, type TestHarness } from "./testUtils";

const NEGATIVE_BALANCE_PATTERN = /negative/i;
const POSITIVE_SAFE_INTEGER_PATTERN = /positive safe integer/;
const MUST_BE_DIFFERENT_PATTERN = /must be different/;

interface ApplyPaymentHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"obligations">;
			entityType: "obligation";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<void>;
}

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

interface PostLenderPayoutHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			mortgageId: Id<"mortgages">;
			lenderId: Id<"lenders">;
			amount: number;
			effectiveDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
			reason?: string;
		}
	) => Promise<unknown>;
}

const applyPaymentMutation = applyPayment as unknown as ApplyPaymentHandler;
const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;
const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

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
			streetAddress: "123 Cash Ledger Test St",
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

async function createUpcomingObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		type:
			| "regular_interest"
			| "arrears_cure"
			| "late_fee"
			| "principal_repayment";
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "upcoming",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: args.type,
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});

		return obligationId;
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

describe("cash ledger integrations", () => {
	it("journals accrual for principal repayment without creating lender payables", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		const obligationId = await createUpcomingObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			type: "principal_repayment",
			amount: 250_000,
		});

		await t.run(async (ctx) => {
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			expect(receivable).not.toBeNull();
			expect(receivable?.cumulativeDebits).toBe(250_000n);

			const accrualEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.first();
			expect(accrualEntry?.entryType).toBe("OBLIGATION_ACCRUED");
			expect(accrualEntry?.metadata).toMatchObject({
				obligationType: "principal_repayment",
			});

			const payables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();
			expect(payables).toHaveLength(0);
		});
	});

	it("posts cash receipts to TRUST_CASH and reconciliation detects amountSettled drift", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		const obligationId = await createUpcomingObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			type: "regular_interest",
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await applyPaymentMutation._handler(ctx, {
				entityId: obligationId,
				entityType: "obligation",
				eventType: "PAYMENT_APPLIED",
				journalEntryId: "audit-journal-1",
				effectName: "applyPayment",
				payload: { amount: 40_000 },
				source: SYSTEM_SOURCE,
			});

			const trustCashAccount = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q.eq("family", "TRUST_CASH").eq("mortgageId", seeded.mortgageId)
				)
				.first();
			expect(trustCashAccount?.cumulativeDebits).toBe(40_000n);

			const clearingAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "CASH_CLEARING"))
				.collect();
			expect(clearingAccounts).toHaveLength(0);

			await ctx.db.patch(obligationId, { amountSettled: 55_000 });

			const reconciliation =
				await reconcileObligationSettlementProjectionInternal(
					ctx as unknown as QueryCtx,
					obligationId
				);
			expect(reconciliation.journalSettledAmount).toBe(40_000n);
			expect(reconciliation.projectedSettledAmount).toBe(55_000n);
			expect(reconciliation.hasDrift).toBe(true);
			expect(reconciliation.driftAmount).toBe(15_000n);
		});
	});

	it("creates lender payables and servicing revenue only after settlement allocation", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const result = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "cash-ledger-dispersal",
				source: SYSTEM_SOURCE,
			});

			expect(result.created).toBe(true);

			const payables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();
			expect(payables).toHaveLength(2);
			expect(
				payables.reduce(
					(sum, account) =>
						sum + (account.cumulativeCredits - account.cumulativeDebits),
					0n
				)
			).toBe(91_667n);

			const revenueAccount = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q
						.eq("family", "SERVICING_REVENUE")
						.eq("mortgageId", seeded.mortgageId)
				)
				.first();
			expect(revenueAccount?.cumulativeCredits).toBe(8_333n);

			const payableEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();
			expect(payableEntries).toHaveLength(3);
			expect(
				payableEntries.every((entry) =>
					["LENDER_PAYABLE_CREATED", "SERVICING_FEE_RECOGNIZED"].includes(
						entry.entryType
					)
				)
			).toBe(true);
		});
	});

	it("enforces lender payable balance guards for payout posting", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("cash_ledger_accounts", {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
				cumulativeDebits: 100_000n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});

			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "cash-ledger-payout-seed",
				source: SYSTEM_SOURCE,
			});

			await expect(
				postLenderPayoutMutation._handler(ctx, {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					amount: 80_000,
					effectiveDate: "2026-03-02",
					idempotencyKey: "cash-ledger-overpay",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(NEGATIVE_BALANCE_PATTERN);

			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 55_000,
				effectiveDate: "2026-03-02",
				idempotencyKey: "cash-ledger-valid-payout",
				source: SYSTEM_SOURCE,
			});

			const lenderPayable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", seeded.mortgageId)
						.eq("lenderId", seeded.lenderAId)
				)
				.first();
			expect(lenderPayable).not.toBeNull();
			expect(
				lenderPayable
					? lenderPayable.cumulativeCredits - lenderPayable.cumulativeDebits
					: null
			).toBe(0n);
		});
	});

	it("rejects zero-amount entry", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
				mortgageId: seeded.mortgageId,
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "OBLIGATION_ACCRUED",
					effectiveDate: "2026-03-01",
					amount: 0,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "zero-amount-test",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(POSITIVE_SAFE_INTEGER_PATTERN);
		});
	});

	it("rejects negative-amount entry", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		await t.run(async (ctx) => {
			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
				mortgageId: seeded.mortgageId,
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "OBLIGATION_ACCRUED",
					effectiveDate: "2026-03-01",
					amount: -50_000,
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey: "negative-amount-test",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(POSITIVE_SAFE_INTEGER_PATTERN);
		});
	});

	it("rejects debit === credit same account", async () => {
		const t = createHarness();
		const seeded = await seedCoreEntities(t);
		await t.run(async (ctx) => {
			const account = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
			});
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "OBLIGATION_ACCRUED",
					effectiveDate: "2026-03-01",
					amount: 100_000,
					debitAccountId: account._id,
					creditAccountId: account._id,
					idempotencyKey: "same-account-test",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(MUST_BE_DIFFERENT_PATTERN);
		});
	});
});
