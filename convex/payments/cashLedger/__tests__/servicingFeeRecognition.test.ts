import { describe, expect, it } from "vitest";
import {
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import { convexModules } from "../../../test/moduleMaps";
import { getCashAccountBalance } from "../accounts";
import type { ServicingFeeMetadata } from "../integrations";

const modules = convexModules;

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

async function createSettledObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		type?:
			| "regular_interest"
			| "arrears_cure"
			| "late_fee"
			| "principal_repayment";
		paymentNumber?: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: args.paymentNumber ?? 1,
			type: args.type ?? "regular_interest",
			amount: args.amount,
			amountSettled: args.amount,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: Date.now(),
		});

		await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: BigInt(args.amount),
			createdAt: Date.now(),
		});

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

describe("servicing fee recognition — ENG-161", () => {
	it("SERVICING_FEE_RECOGNIZED entry posted for regular_interest allocation", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
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
				idempotencyKey: "sfr-basic",
				source: SYSTEM_SOURCE,
			});

			expect(result.created).toBe(true);
			expect(result.servicingFeeEntryId).not.toBeNull();

			const feeEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect()
				.then((entries) =>
					entries.filter((e) => e.entryType === "SERVICING_FEE_RECOGNIZED")
				);

			expect(feeEntries).toHaveLength(1);
			expect(feeEntries[0].amount).toBeGreaterThan(0n);
		});
	});

	it("fee entry shares postingGroupId with lender payable entries", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
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
				idempotencyKey: "sfr-group",
				source: SYSTEM_SOURCE,
			});

			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();

			const types = new Set(entries.map((e) => e.entryType));
			expect(types.has("LENDER_PAYABLE_CREATED")).toBe(true);
			expect(types.has("SERVICING_FEE_RECOGNIZED")).toBe(true);
		});
	});

	it("fee entry carries full traceability fields", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
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
				idempotencyKey: "sfr-trace",
				source: SYSTEM_SOURCE,
			});

			const feeEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect()
				.then((entries) =>
					entries.find((e) => e.entryType === "SERVICING_FEE_RECOGNIZED")
				);

			if (!feeEntry) {
				throw new Error("Expected SERVICING_FEE_RECOGNIZED entry");
			}

			expect(feeEntry.mortgageId).toBe(seeded.mortgageId);
			expect(feeEntry.obligationId).toBe(obligationId);
			expect(feeEntry.borrowerId).toBeDefined();
			expect(feeEntry.postingGroupId).toBe(`allocation:${obligationId}`);
			expect(feeEntry.idempotencyKey).toBe(
				`cash-ledger:servicing-fee:${obligationId}`
			);
		});
	});

	it("SERVICING_REVENUE balance tracks cumulative revenue across multiple allocations", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const obligation1 = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
			paymentNumber: 1,
		});

		const obligation2 = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
			paymentNumber: 2,
		});

		await t.run(async (ctx) => {
			// First allocation
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId: obligation1,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "sfr-cumulative-1",
				source: SYSTEM_SOURCE,
			});

			const revenueAfterFirst = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q
						.eq("family", "SERVICING_REVENUE")
						.eq("mortgageId", seeded.mortgageId)
				)
				.first();

			if (!revenueAfterFirst) {
				throw new Error(
					"Expected SERVICING_REVENUE account after first allocation"
				);
			}

			const balanceAfterFirst = getCashAccountBalance(revenueAfterFirst);
			expect(balanceAfterFirst).toBeGreaterThan(0n);

			// Second allocation
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId: obligation2,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-04-01",
				idempotencyKey: "sfr-cumulative-2",
				source: SYSTEM_SOURCE,
			});

			const revenueAfterSecond = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q
						.eq("family", "SERVICING_REVENUE")
						.eq("mortgageId", seeded.mortgageId)
				)
				.first();

			if (!revenueAfterSecond) {
				throw new Error(
					"Expected SERVICING_REVENUE account after second allocation"
				);
			}

			const balanceAfterSecond = getCashAccountBalance(revenueAfterSecond);

			// Cumulative: second balance should be exactly 2x the first
			// (same mortgage, same amount, same fee config)
			expect(balanceAfterSecond).toBe(balanceAfterFirst * 2n);
			expect(balanceAfterSecond).toBeGreaterThan(balanceAfterFirst);
		});
	});

	it("zero-fee allocation (non-interest obligation) produces no fee entry", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
			type: "principal_repayment",
		});

		await t.run(async (ctx) => {
			const result = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 50_000,
				settledDate: "2026-03-01",
				idempotencyKey: "sfr-zero-fee",
				source: SYSTEM_SOURCE,
			});

			expect(result.servicingFeeEntryId).toBeNull();

			const feeEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect()
				.then((entries) =>
					entries.filter((e) => e.entryType === "SERVICING_FEE_RECOGNIZED")
				);

			expect(feeEntries).toHaveLength(0);

			// No SERVICING_REVENUE account should exist for this mortgage —
			// a zero-fee path must not eagerly create an account
			const revenueAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q
						.eq("family", "SERVICING_REVENUE")
						.eq("mortgageId", seeded.mortgageId)
				)
				.collect();

			expect(revenueAccounts).toHaveLength(0);
		});
	});

	it("fee entry metadata contains fee calculation details", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
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
				idempotencyKey: "sfr-metadata",
				source: SYSTEM_SOURCE,
			});

			const feeEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect()
				.then((entries) =>
					entries.find((e) => e.entryType === "SERVICING_FEE_RECOGNIZED")
				);

			if (!feeEntry) {
				throw new Error("Expected SERVICING_FEE_RECOGNIZED entry");
			}

			expect(feeEntry.metadata).toBeDefined();
			const meta = feeEntry.metadata as ServicingFeeMetadata;

			// Fee calculation inputs
			expect(meta.annualRate).toBe(0.01);
			expect(meta.principalBalance).toBe(10_000_000);
			expect(meta.paymentFrequency).toBe("monthly");

			// Fee calculation outputs — exact values for 10M principal, 1% annual, monthly
			expect(meta.feeDue).toBe(8333);
			expect(meta.feeCashApplied).toBe(8333);
			expect(meta.feeReceivable).toBe(0);
		});
	});

	it("fee debits CONTROL:ALLOCATION and credits SERVICING_REVENUE", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
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
				idempotencyKey: "sfr-accounts",
				source: SYSTEM_SOURCE,
			});

			const feeEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect()
				.then((entries) =>
					entries.find((e) => e.entryType === "SERVICING_FEE_RECOGNIZED")
				);

			if (!feeEntry) {
				throw new Error("Expected SERVICING_FEE_RECOGNIZED entry");
			}

			const debitAccount = await ctx.db.get(feeEntry.debitAccountId);
			const creditAccount = await ctx.db.get(feeEntry.creditAccountId);

			if (!(debitAccount && creditAccount)) {
				throw new Error("Expected both debit and credit accounts");
			}

			expect(debitAccount.family).toBe("CONTROL");
			expect(debitAccount.subaccount).toBe("ALLOCATION");
			expect(creditAccount.family).toBe("SERVICING_REVENUE");
		});
	});
});
