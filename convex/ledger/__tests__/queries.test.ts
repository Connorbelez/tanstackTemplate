import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";

const modules = convexModules;

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

const SYS_SOURCE = { type: "system" as const, channel: "test" };

// ── Bootstrap & Helpers ─────────────────────────────────────────

async function initCounter(auth: ReturnType<typeof asLedgerUser>) {
	await auth.mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{}
	);
}

async function mintMortgage(
	auth: ReturnType<typeof asLedgerUser>,
	mortgageId: string,
	idempotencyKey: string
) {
	await initCounter(auth);
	return auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey,
		source: SYS_SOURCE,
	});
}

async function issueShares(
	auth: ReturnType<typeof asLedgerUser>,
	mortgageId: string,
	lenderId: string,
	amount: number,
	idempotencyKey: string
) {
	return auth.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate: "2026-01-01",
		idempotencyKey,
		source: SYS_SOURCE,
	});
}

// ── getBalance ──────────────────────────────────────────────────

describe("getBalance", () => {
	it("returns 0n for treasury after all shares have been issued", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const { treasuryAccountId } = await mintMortgage(
			auth,
			"m-bal-zero",
			"mint-bal-zero"
		);

		// Issue all 10,000 to a lender — treasury should be 0
		await issueShares(auth, "m-bal-zero", "lender-a", 10_000, "issue-all");

		const balance = await auth.query(api.ledger.queries.getBalance, {
			accountId: treasuryAccountId,
		});
		expect(balance).toBe(0n);
	});

	it("returns correct posted balance after debits and credits", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const { treasuryAccountId } = await mintMortgage(
			auth,
			"m-bal-correct",
			"mint-bal-correct"
		);

		// Treasury starts with 10,000. Issue 3,000 → treasury has 7,000
		await issueShares(
			auth,
			"m-bal-correct",
			"lender-b",
			3_000,
			"issue-3k"
		);

		const balance = await auth.query(api.ledger.queries.getBalance, {
			accountId: treasuryAccountId,
		});
		expect(balance).toBe(7_000n);
	});

	it("throws on non-existent accountId", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		// Create then delete an account to get a valid but non-existent ID
		let deletedId: typeof api.ledger.queries.getBalance._args.accountId;
		await t.run(async (ctx) => {
			const id = await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: "m-deleted",
				lenderId: "l-deleted",
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: Date.now(),
			});
			await ctx.db.delete(id);
			deletedId = id;
		});

		await expect(
			auth.query(api.ledger.queries.getBalance, {
				accountId: deletedId!,
			})
		).rejects.toThrow("not found");
	});
});

// ── getPositions ────────────────────────────────────────────────

describe("getPositions", () => {
	it("returns empty array for mortgage with no issued positions", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-pos-empty", "mint-pos-empty");

		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-pos-empty",
		});
		expect(positions).toEqual([]);
	});

	it("returns only non-zero POSITION accounts", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-pos-nonzero", "mint-pos-nonzero");
		await issueShares(
			auth,
			"m-pos-nonzero",
			"lender-1",
			5_000,
			"issue-l1"
		);
		await issueShares(
			auth,
			"m-pos-nonzero",
			"lender-2",
			3_000,
			"issue-l2"
		);

		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-pos-nonzero",
		});

		expect(positions).toHaveLength(2);
		const lenderIds = positions.map(
			(p: { lenderId: string }) => p.lenderId
		);
		expect(lenderIds).toContain("lender-1");
		expect(lenderIds).toContain("lender-2");

		const l1 = positions.find(
			(p: { lenderId: string }) => p.lenderId === "lender-1"
		);
		const l2 = positions.find(
			(p: { lenderId: string }) => p.lenderId === "lender-2"
		);
		expect(l1?.balance).toBe(5_000n);
		expect(l2?.balance).toBe(3_000n);
	});

	it("excludes POSITION accounts with zero balance after redemption", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-pos-redeemed", "mint-pos-redeemed");
		await issueShares(
			auth,
			"m-pos-redeemed",
			"lender-redeem",
			5_000,
			"issue-redeem"
		);
		// Redeem all shares back to treasury
		await auth.mutation(internal.ledger.mutations.redeemSharesInternal, {
			mortgageId: "m-pos-redeemed",
			lenderId: "lender-redeem",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "redeem-all",
			source: SYS_SOURCE,
		});

		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-pos-redeemed",
		});
		expect(positions).toEqual([]);
	});

	it("returns empty array for non-existent mortgage", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "non-existent-mortgage",
		});
		expect(positions).toEqual([]);
	});
});

// ── getLenderPositions ──────────────────────────────────────────

describe("getLenderPositions", () => {
	it("returns empty array for lender with no positions", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const positions = await auth.query(
			api.ledger.queries.getLenderPositions,
			{
				lenderId: "lender-nobody",
			}
		);
		expect(positions).toEqual([]);
	});

	it("returns all mortgages where lender has non-zero balance", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-lp-1", "mint-lp-1");
		await mintMortgage(auth, "m-lp-2", "mint-lp-2");

		await issueShares(auth, "m-lp-1", "lender-multi", 3_000, "issue-lp-1");
		await issueShares(auth, "m-lp-2", "lender-multi", 2_000, "issue-lp-2");

		const positions = await auth.query(
			api.ledger.queries.getLenderPositions,
			{
				lenderId: "lender-multi",
			}
		);

		expect(positions).toHaveLength(2);
		const mortgageIds = positions.map(
			(p: { mortgageId: string }) => p.mortgageId
		);
		expect(mortgageIds).toContain("m-lp-1");
		expect(mortgageIds).toContain("m-lp-2");

		const m1 = positions.find(
			(p: { mortgageId: string }) => p.mortgageId === "m-lp-1"
		);
		const m2 = positions.find(
			(p: { mortgageId: string }) => p.mortgageId === "m-lp-2"
		);
		expect(m1?.balance).toBe(3_000n);
		expect(m2?.balance).toBe(2_000n);
	});

	it("excludes mortgages where lender balance is zero", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-lp-zero", "mint-lp-zero");
		await issueShares(
			auth,
			"m-lp-zero",
			"lender-zeroed",
			5_000,
			"issue-lp-zero"
		);
		await auth.mutation(internal.ledger.mutations.redeemSharesInternal, {
			mortgageId: "m-lp-zero",
			lenderId: "lender-zeroed",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "redeem-lp-zero",
			source: SYS_SOURCE,
		});

		const positions = await auth.query(
			api.ledger.queries.getLenderPositions,
			{
				lenderId: "lender-zeroed",
			}
		);
		expect(positions).toEqual([]);
	});
});

// ── validateSupplyInvariant ─────────────────────────────────────

describe("validateSupplyInvariant", () => {
	it("returns valid:true and total:10000n for freshly minted mortgage (all in treasury)", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-inv-fresh", "mint-inv-fresh");

		const result = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "m-inv-fresh" }
		);

		expect(result.valid).toBe(true);
		expect(result.total).toBe(10_000n);
		expect(result.treasury).toBe(10_000n);
		expect(result.positions).toEqual({});
	});

	it("returns valid:true after issuing shares (treasury + positions = 10,000)", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-inv-issued", "mint-inv-issued");
		await issueShares(
			auth,
			"m-inv-issued",
			"lender-inv-1",
			4_000,
			"issue-inv-1"
		);
		await issueShares(
			auth,
			"m-inv-issued",
			"lender-inv-2",
			3_000,
			"issue-inv-2"
		);

		const result = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "m-inv-issued" }
		);

		expect(result.valid).toBe(true);
		expect(result.total).toBe(10_000n);
		expect(result.treasury).toBe(3_000n);
		expect(result.positions["lender-inv-1"]).toBe(4_000n);
		expect(result.positions["lender-inv-2"]).toBe(3_000n);
	});

	it("returns valid:true with total:0n for unminted mortgage", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const result = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "m-inv-unminted" }
		);

		expect(result.valid).toBe(true);
		expect(result.total).toBe(0n);
		expect(result.treasury).toBe(0n);
		expect(result.positions).toEqual({});
	});

	it("returns valid:true after transfer between positions", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-inv-xfer", "mint-inv-xfer");
		await issueShares(
			auth,
			"m-inv-xfer",
			"seller-inv",
			5_000,
			"issue-seller"
		);
		await auth.mutation(internal.ledger.mutations.transferSharesInternal, {
			mortgageId: "m-inv-xfer",
			sellerLenderId: "seller-inv",
			buyerLenderId: "buyer-inv",
			amount: 2_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "xfer-inv",
			source: SYS_SOURCE,
		});

		const result = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "m-inv-xfer" }
		);

		expect(result.valid).toBe(true);
		expect(result.total).toBe(10_000n);
		expect(result.treasury).toBe(5_000n);
		expect(result.positions["seller-inv"]).toBe(3_000n);
		expect(result.positions["buyer-inv"]).toBe(2_000n);
	});

	it("handles mortgage with multiple position accounts correctly", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-inv-multi", "mint-inv-multi");
		// Issue to three different lenders
		await issueShares(
			auth,
			"m-inv-multi",
			"lender-m1",
			3_000,
			"issue-m1"
		);
		await issueShares(
			auth,
			"m-inv-multi",
			"lender-m2",
			3_000,
			"issue-m2"
		);
		await issueShares(
			auth,
			"m-inv-multi",
			"lender-m3",
			2_000,
			"issue-m3"
		);

		const result = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "m-inv-multi" }
		);

		expect(result.valid).toBe(true);
		expect(result.total).toBe(10_000n);
		expect(result.treasury).toBe(2_000n);
		expect(Object.keys(result.positions)).toHaveLength(3);
	});

	it("returns valid:false when supply invariant is broken", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await mintMortgage(auth, "m-inv-broken", "mint-inv-broken");

		// Directly inject an extra POSITION account to break the invariant
		await t.run(async (ctx) => {
			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: "m-inv-broken",
				lenderId: "lender-phantom",
				cumulativeDebits: 5_000n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: Date.now(),
			});
		});

		const result = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "m-inv-broken" }
		);

		expect(result.valid).toBe(false);
		expect(result.total).toBe(15_000n);
	});
});
