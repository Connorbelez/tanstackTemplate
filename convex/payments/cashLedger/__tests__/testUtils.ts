import { convexTest } from "convex-test";
import type { Doc, Id } from "../../../_generated/dataModel";
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
//
// The hash-chain kill switch is enabled here because createHarness does NOT
// register workflow/workpool components that nudge() → startCashLedgerHashChain()
// requires. Tests that exercise hash-chain behaviour use their own harnesses
// with workflow components (e.g. cashReceiptIntegration.test.ts, auditTrail.test.ts).

export function createHarness(modules: Record<string, () => Promise<unknown>>) {
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
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
): Promise<Doc<"cash_ledger_accounts">> {
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
			return updated as Doc<"cash_ledger_accounts">;
		}

		return account;
	});
}

// ── createSettledObligation ──────────────────────────────────────────
// Creates a settled obligation with pre-balanced BORROWER_RECEIVABLE and
// a zeroed CONTROL:ALLOCATION account ready for dispersal testing.

export async function createSettledObligation(
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

		// Pre-create BORROWER_RECEIVABLE with balanced debits/credits (fully settled)
		await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: BigInt(args.amount),
			createdAt: Date.now(),
		});

		// Pre-create CONTROL:ALLOCATION for the dispersal
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

// ── createConfirmedTransfer ───────────────────────────────────────────
// Creates a transferRequests record with status: "confirmed".

export async function createConfirmedTransfer(
	t: TestHarness,
	args: {
		direction: "inbound" | "outbound";
		amount: number;
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		lenderId?: Id<"lenders">;
		borrowerId?: Id<"borrowers">;
		dispersalEntryId?: Id<"dispersalEntries">;
		confirmedAt?: number;
	}
): Promise<Id<"transferRequests">> {
	return t.run(async (ctx) => {
		return ctx.db.insert("transferRequests", {
			status: "confirmed",
			direction: args.direction,
			amount: args.amount,
			currency: "CAD",
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			lenderId: args.lenderId,
			borrowerId: args.borrowerId,
			dispersalEntryId: args.dispersalEntryId,
			confirmedAt: args.confirmedAt ?? Date.now() - 10 * 60_000, // 10 min ago
			createdAt: Date.now(),
		});
	});
}

// ── createReversedTransfer ───────────────────────────────────────────
// Creates a transferRequests record with status: "reversed".

export async function createReversedTransfer(
	t: TestHarness,
	args: {
		direction: "inbound" | "outbound";
		amount: number;
		mortgageId?: Id<"mortgages">;
		reversedAt?: number;
	}
): Promise<Id<"transferRequests">> {
	return t.run(async (ctx) => {
		return ctx.db.insert("transferRequests", {
			status: "reversed",
			direction: args.direction,
			amount: args.amount,
			currency: "CAD",
			mortgageId: args.mortgageId,
			reversedAt: args.reversedAt ?? Date.now() - 10 * 60_000,
			createdAt: Date.now(),
		});
	});
}

// ── postTestEntry ────────────────────────────────────────────────────
// Convenience wrapper around postCashEntryInternal for tests.

export async function postTestEntry(t: TestHarness, args: PostCashEntryInput) {
	return t.run(async (ctx) => {
		return postCashEntryInternal(ctx, args);
	});
}
