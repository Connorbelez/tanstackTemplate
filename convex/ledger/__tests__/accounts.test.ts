import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import {
	getAvailableBalance,
	getOrCreatePositionAccount,
	getPostedBalance,
	getTreasuryAccount,
	getWorldAccount,
	initializeWorldAccount,
} from "../accounts";

const modules = import.meta.glob("/convex/**/*.ts");

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

// ── Pure balance functions ──────────────────────────────────────

describe("getPostedBalance", () => {
	it("returns 0n when debits and credits are both zero", () => {
		const result = getPostedBalance({
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
		});
		expect(result).toBe(0n);
	});

	it("returns positive bigint when debits > credits", () => {
		const result = getPostedBalance({
			cumulativeDebits: 500n,
			cumulativeCredits: 200n,
		});
		expect(result).toBe(300n);
	});

	it("returns negative bigint when credits > debits", () => {
		const result = getPostedBalance({
			cumulativeDebits: 100n,
			cumulativeCredits: 400n,
		});
		expect(result).toBe(-300n);
	});
});

describe("getAvailableBalance", () => {
	it("equals posted balance when pendingCredits is zero", () => {
		const result = getAvailableBalance({
			cumulativeDebits: 1000n,
			cumulativeCredits: 200n,
			pendingCredits: 0n,
		});
		expect(result).toBe(800n);
	});

	it("subtracts pendingCredits from posted balance", () => {
		const result = getAvailableBalance({
			cumulativeDebits: 1000n,
			cumulativeCredits: 200n,
			pendingCredits: 300n,
		});
		expect(result).toBe(500n);
	});

	it("equals posted balance when pendingCredits is 0n", () => {
		const result = getAvailableBalance({
			cumulativeDebits: 1000n,
			cumulativeCredits: 200n,
			pendingCredits: 0n,
		});
		expect(result).toBe(800n);
	});
});

// ── WORLD account ───────────────────────────────────────────────

describe("getWorldAccount", () => {
	it("throws when no WORLD account exists", async () => {
		const t = createTestHarness();
		await t.run(async (ctx) => {
			await expect(getWorldAccount(ctx)).rejects.toThrow(
				"WORLD account not found",
			);
		});
	});

	it("returns WORLD account when it exists", async () => {
		const t = createTestHarness();
		await t.run(async (ctx) => {
			await initializeWorldAccount(ctx);
		});
		await t.run(async (ctx) => {
			const world = await getWorldAccount(ctx);
			expect(world.type).toBe("WORLD");
		});
	});
});

describe("initializeWorldAccount", () => {
	it("creates WORLD account on first call", async () => {
		const t = createTestHarness();
		await t.run(async (ctx) => {
			const account = await initializeWorldAccount(ctx);
			expect(account.type).toBe("WORLD");
			expect(account.cumulativeDebits).toBe(0n);
			expect(account.cumulativeCredits).toBe(0n);
			expect(account.mortgageId).toBeUndefined();
		});
	});

	it("returns existing WORLD on second call (idempotent)", async () => {
		const t = createTestHarness();
		let firstId: string | undefined;
		await t.run(async (ctx) => {
			const first = await initializeWorldAccount(ctx);
			firstId = first._id;
		});
		await t.run(async (ctx) => {
			const second = await initializeWorldAccount(ctx);
			expect(second._id).toBe(firstId);
		});
	});
});

// ── TREASURY account ────────────────────────────────────────────

describe("getTreasuryAccount", () => {
	it("returns null when no TREASURY exists for the mortgage", async () => {
		const t = createTestHarness();
		await t.run(async (ctx) => {
			const result = await getTreasuryAccount(ctx, "nonexistent-mortgage");
			expect(result).toBeNull();
		});
	});

	it("returns TREASURY account when it exists", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		// mintMortgage creates both the WORLD and TREASURY accounts
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m-treasury-test",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-treasury-test",
			source: SYS_SOURCE,
		});

		await t.run(async (ctx) => {
			const treasury = await getTreasuryAccount(ctx, "m-treasury-test");
			expect(treasury).not.toBeNull();
			expect(treasury?.type).toBe("TREASURY");
			expect(treasury?.mortgageId).toBe("m-treasury-test");
		});
	});
});

// ── POSITION account ────────────────────────────────────────────

describe("getOrCreatePositionAccount", () => {
	it("creates new POSITION on first call", async () => {
		const t = createTestHarness();
		await t.run(async (ctx) => {
			const account = await getOrCreatePositionAccount(
				ctx,
				"m-pos-test",
				"lender-1",
			);
			expect(account.type).toBe("POSITION");
			expect(account.mortgageId).toBe("m-pos-test");
			expect(account.lenderId).toBe("lender-1");
			expect(account.cumulativeDebits).toBe(0n);
			expect(account.cumulativeCredits).toBe(0n);
		});
	});

	it("returns existing POSITION on second call", async () => {
		const t = createTestHarness();
		let firstId: string | undefined;
		await t.run(async (ctx) => {
			const first = await getOrCreatePositionAccount(
				ctx,
				"m-pos-test-2",
				"lender-2",
			);
			firstId = first._id;
		});
		await t.run(async (ctx) => {
			const second = await getOrCreatePositionAccount(
				ctx,
				"m-pos-test-2",
				"lender-2",
			);
			expect(second._id).toBe(firstId);
		});
	});
});
