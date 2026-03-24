import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import {
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "../../../payments/cashLedger/__tests__/testUtils";
import { accrueObligation } from "../obligationAccrual";

const _modules = import.meta.glob("/convex/**/*.ts");

interface AccrueObligationHandler {
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

const accrueObligationMutation =
	accrueObligation as unknown as AccrueObligationHandler;

const modules = import.meta.glob("/convex/**/*.ts");

function buildEffectArgs(obligationId: Id<"obligations">) {
	return {
		entityId: obligationId,
		entityType: "obligation" as const,
		eventType: "BECAME_DUE",
		journalEntryId: "audit-journal-accrual-test",
		effectName: "accrueObligation",
		source: SYSTEM_SOURCE,
	};
}

async function createUpcomingObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: "upcoming",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: Date.now(),
		});
	});
}

describe("accrueObligation effect (integration)", () => {
	it("posts OBLIGATION_ACCRUED journal entry with correct accounts and amount", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createUpcomingObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await accrueObligationMutation._handler(
				ctx,
				buildEffectArgs(obligationId)
			);

			// Verify OBLIGATION_ACCRUED journal entry was created
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("OBLIGATION_ACCRUED");
			expect(entries[0].amount).toBe(100_000n);

			// Verify BORROWER_RECEIVABLE account was created and debited
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			expect(receivable).not.toBeNull();
			expect(receivable?.cumulativeDebits).toBe(100_000n);
			expect(receivable?.cumulativeCredits).toBe(0n);

			// Verify CONTROL:ACCRUAL account was created and credited
			const control = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "CONTROL").eq("obligationId", obligationId)
				)
				.first();
			expect(control).not.toBeNull();
			expect(control?.subaccount).toBe("ACCRUAL");
			expect(control?.cumulativeCredits).toBe(100_000n);
			expect(control?.cumulativeDebits).toBe(0n);
		});
	});

	it("is idempotent — duplicate calls produce no duplicate entries", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createUpcomingObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 75_000,
		});

		await t.run(async (ctx) => {
			// First call — creates the entry
			await accrueObligationMutation._handler(
				ctx,
				buildEffectArgs(obligationId)
			);

			// Second call — should be idempotent
			await accrueObligationMutation._handler(
				ctx,
				buildEffectArgs(obligationId)
			);

			// Still exactly one journal entry
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			expect(entries).toHaveLength(1);

			// Balance unchanged after duplicate call
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			expect(receivable?.cumulativeDebits).toBe(75_000n);
		});
	});

	it("handles multiple obligations for the same mortgage independently", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const ob1 = await createUpcomingObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});
		const ob2 = await createUpcomingObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			await accrueObligationMutation._handler(ctx, buildEffectArgs(ob1));
			await accrueObligationMutation._handler(ctx, buildEffectArgs(ob2));

			// Each obligation gets its own BORROWER_RECEIVABLE account
			const receivable1 = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", ob1)
				)
				.first();
			const receivable2 = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", ob2)
				)
				.first();

			expect(receivable1?.cumulativeDebits).toBe(100_000n);
			expect(receivable2?.cumulativeDebits).toBe(50_000n);

			// Two separate journal entries — one per obligation
			const ob1Entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", ob1)
				)
				.collect();
			const ob2Entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", ob2)
				)
				.collect();
			expect(ob1Entries).toHaveLength(1);
			expect(ob2Entries).toHaveLength(1);
		});
	});
});
