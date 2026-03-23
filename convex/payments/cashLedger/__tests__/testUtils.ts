import { convexTest } from "convex-test";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { getOrCreateCashAccount } from "../accounts";
import { type PostCashEntryInput, postCashEntryInternal } from "../postEntry";
import type { CashAccountFamily, ControlSubaccount } from "../types";

// ── Shared Constants ─────────────────────────────────────────────────

export const SYSTEM_SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

export const ADMIN_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "admin-user-123",
	actorType: "admin" as const,
};

export const ADMIN_IDENTITY = {
	name: "Admin",
	email: "admin@fairlend.test",
	tokenIdentifier: "test-admin",
	subject: "test-admin",
};

// ── Harness Factory ──────────────────────────────────────────────────
// Callers must pass import.meta.glob("/convex/**/*.ts") from their .test.ts
// file — import.meta.glob is a Vite-only API that crashes in Convex's runtime,
// so it cannot live in this non-test utility module.

export function createHarness(modules: Record<string, () => Promise<unknown>>) {
	return convexTest(schema, modules);
}

export type TestHarness = ReturnType<typeof convexTest>;

// ── seedMinimalEntities ──────────────────────────────────────────────
// Seeds broker, borrower, two lenders, property, mortgage, and ownership
// ledger accounts. Does NOT create an obligation — tests create their own.

export async function seedMinimalEntities(t: TestHarness) {
	return t.run(async (ctx) => {
		const now = Date.now();

		// Broker
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

		// Borrower
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

		// Lender A
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

		// Lender B
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

		// Property
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Cash Ledger Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: now,
		});

		// Mortgage
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

		// Ownership ledger accounts (60/40 split)
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

// ── createTestAccount ────────────────────────────────────────────────
// Creates a cash_ledger_account by family with optional scope fields.
// If initialDebitBalance or initialCreditBalance are provided, patches
// the account after creation.

interface CreateTestAccountSpec {
	borrowerId?: Id<"borrowers">;
	family: CashAccountFamily;
	initialCreditBalance?: bigint;
	initialDebitBalance?: bigint;
	lenderId?: Id<"lenders">;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	subaccount?: ControlSubaccount;
}

export async function createTestAccount(
	t: TestHarness,
	spec: CreateTestAccountSpec
) {
	return t.run(async (ctx) => {
		const account = await getOrCreateCashAccount(ctx, {
			family: spec.family,
			mortgageId: spec.mortgageId,
			obligationId: spec.obligationId,
			lenderId: spec.lenderId,
			borrowerId: spec.borrowerId,
			subaccount: spec.subaccount,
		});

		if (
			spec.initialDebitBalance !== undefined ||
			spec.initialCreditBalance !== undefined
		) {
			await ctx.db.patch(account._id, {
				...(spec.initialDebitBalance !== undefined && {
					cumulativeDebits: spec.initialDebitBalance,
				}),
				...(spec.initialCreditBalance !== undefined && {
					cumulativeCredits: spec.initialCreditBalance,
				}),
			});
			const updated = await ctx.db.get(account._id);
			if (!updated) {
				throw new Error("Failed to read patched account");
			}
			return updated;
		}

		return account;
	});
}

// ── postTestEntry ────────────────────────────────────────────────────
// Convenience wrapper around postCashEntryInternal for tests.

export async function postTestEntry(t: TestHarness, args: PostCashEntryInput) {
	return t.run(async (ctx) => {
		return postCashEntryInternal(ctx, args);
	});
}
