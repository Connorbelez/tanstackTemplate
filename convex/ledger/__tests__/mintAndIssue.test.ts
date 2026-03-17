import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Auth identity for ledger tests ──────────────────────────────
const LEDGER_TEST_IDENTITY = {
	subject: "test-ledger-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "ledger-test@fairlend.ca",
	user_first_name: "Ledger",
	user_last_name: "Tester",
};

function createTestHarness() {
	return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(LEDGER_TEST_IDENTITY);
}

// ── Helpers ───────────────────────────────────────────────────────

const SYS_SOURCE = { type: "system" as const, channel: "test" };

async function initCounter(t: ReturnType<typeof createTestHarness>) {
	const auth = asLedgerUser(t);
	await auth.mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{},
	);
}

// ── mintAndIssue Tests ───────────────────────────────────────────

describe("mintAndIssue", () => {
	it("happy path — single allocation of 10,000 to one lender", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const result = await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "m1",
			allocations: [{ lenderId: "lender-1", amount: 10_000 }],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-issue-m1",
			source: SYS_SOURCE,
		});

		expect(result.treasuryAccountId).toBeDefined();
		expect(result.mintEntry).toBeDefined();
		expect(result.mintEntry.entryType).toBe("MORTGAGE_MINTED");
		expect(result.mintEntry.amount).toBe(10_000);
		expect(result.issueEntries).toHaveLength(1);
		expect(result.issueEntries[0].entryType).toBe("SHARES_ISSUED");
		expect(result.issueEntries[0].amount).toBe(10_000);

		// Verify TREASURY balance = 0
		const treasuryBalance = await auth.query(api.ledger.queries.getBalance, {
			accountId: result.treasuryAccountId,
		});
		expect(treasuryBalance).toBe(0n);

		// Verify POSITION balance = 10,000
		const positionBalance = await auth.query(
			api.ledger.queries.getBalance,
			{ accountId: result.issueEntries[0].debitAccountId },
		);
		expect(positionBalance).toBe(10_000n);
	});

	it("happy path — multiple allocations (5,000 + 3,000 + 2,000)", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const result = await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "m2",
			allocations: [
				{ lenderId: "lender-a", amount: 5_000 },
				{ lenderId: "lender-b", amount: 3_000 },
				{ lenderId: "lender-c", amount: 2_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-issue-m2",
			source: SYS_SOURCE,
		});

		expect(result.issueEntries).toHaveLength(3);
		expect(result.issueEntries[0].amount).toBe(5_000);
		expect(result.issueEntries[1].amount).toBe(3_000);
		expect(result.issueEntries[2].amount).toBe(2_000);

		// Verify each POSITION balance
		for (const entry of result.issueEntries) {
			const balance = await auth.query(api.ledger.queries.getBalance, {
				accountId: entry.debitAccountId,
			});
			expect(balance).toBe(BigInt(entry.amount));
		}

		// TREASURY = 0
		const treasuryBalance = await auth.query(api.ledger.queries.getBalance, {
			accountId: result.treasuryAccountId,
		});
		expect(treasuryBalance).toBe(0n);
	});

	it("happy path — two equal allocations (5,000 + 5,000)", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const result = await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "m3",
			allocations: [
				{ lenderId: "lender-x", amount: 5_000 },
				{ lenderId: "lender-y", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-issue-m3",
			source: SYS_SOURCE,
		});

		expect(result.issueEntries).toHaveLength(2);

		const balanceX = await auth.query(api.ledger.queries.getBalance, {
			accountId: result.issueEntries[0].debitAccountId,
		});
		const balanceY = await auth.query(api.ledger.queries.getBalance, {
			accountId: result.issueEntries[1].debitAccountId,
		});
		expect(balanceX).toBe(5_000n);
		expect(balanceY).toBe(5_000n);
	});

	it("rejects allocations that sum to less than 10,000", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await expect(
			auth.mutation(api.ledger.mutations.mintAndIssue, {
				mortgageId: "m-under",
				allocations: [{ lenderId: "lender-1", amount: 5_000 }],
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-issue-under",
				source: SYS_SOURCE,
			}),
		).rejects.toThrow(/ALLOCATIONS_SUM_MISMATCH/);

		// Verify no TREASURY was created (zero side effects)
		await t.run(async (ctx) => {
			const treasury = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", "m-under"),
				)
				.first();
			expect(treasury).toBeNull();
		});
	});

	it("rejects allocations that sum to more than 10,000", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await expect(
			auth.mutation(api.ledger.mutations.mintAndIssue, {
				mortgageId: "m-over",
				allocations: [
					{ lenderId: "lender-1", amount: 6_000 },
					{ lenderId: "lender-2", amount: 6_000 },
				],
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-issue-over",
				source: SYS_SOURCE,
			}),
		).rejects.toThrow(/ALLOCATIONS_SUM_MISMATCH/);
	});

	it("rejects allocation below minimum fraction (1,000)", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await expect(
			auth.mutation(api.ledger.mutations.mintAndIssue, {
				mortgageId: "m-small",
				allocations: [
					{ lenderId: "lender-1", amount: 9_500 },
					{ lenderId: "lender-2", amount: 500 },
				],
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-issue-small",
				source: SYS_SOURCE,
			}),
		).rejects.toThrow(/ALLOCATION_BELOW_MINIMUM/);
	});

	it("rejects double-mint with different idempotency keys", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		// First call succeeds
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "m-double",
			allocations: [{ lenderId: "lender-1", amount: 10_000 }],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-issue-double-1",
			source: SYS_SOURCE,
		});

		// Second call with different idempotency key should fail
		await expect(
			auth.mutation(api.ledger.mutations.mintAndIssue, {
				mortgageId: "m-double",
				allocations: [{ lenderId: "lender-2", amount: 10_000 }],
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-issue-double-2",
				source: SYS_SOURCE,
			}),
		).rejects.toThrow(/ALREADY_MINTED/);
	});

	it("idempotent replay returns same result with same idempotency key", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const firstResult = await auth.mutation(
			api.ledger.mutations.mintAndIssue,
			{
				mortgageId: "m-idem",
				allocations: [{ lenderId: "lender-1", amount: 10_000 }],
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-issue-idem",
				source: SYS_SOURCE,
			},
		);

		const secondResult = await auth.mutation(
			api.ledger.mutations.mintAndIssue,
			{
				mortgageId: "m-idem",
				allocations: [{ lenderId: "lender-1", amount: 10_000 }],
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-issue-idem",
				source: SYS_SOURCE,
			},
		);

		expect(secondResult.treasuryAccountId).toBe(firstResult.treasuryAccountId);
		expect(secondResult.mintEntry._id).toBe(firstResult.mintEntry._id);
		expect(secondResult.issueEntries).toHaveLength(
			firstResult.issueEntries.length,
		);
	});
});
