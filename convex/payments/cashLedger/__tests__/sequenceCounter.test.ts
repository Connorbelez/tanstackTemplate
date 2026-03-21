import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import schema from "../../../schema";
import { getNextCashSequenceNumber } from "../sequenceCounter";

const modules = import.meta.glob("/convex/**/*.ts");

const FAIR_LEND_ADMIN_PATTERN = /fair lend admin/i;

const ADMIN_IDENTITY = {
	subject: "test-cash-seq-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "cash-seq-admin@fairlend.test",
	user_first_name: "Cash",
	user_last_name: "Admin",
};

const NON_ADMIN_IDENTITY = {
	subject: "test-cash-seq-member",
	issuer: "https://api.workos.com",
	org_id: "org_some_other_org",
	organization_name: "Some Other Org",
	role: "member",
	roles: JSON.stringify(["member"]),
	permissions: JSON.stringify([]),
	user_email: "cash-seq-member@fairlend.test",
	user_first_name: "Cash",
	user_last_name: "Member",
};

function createHarness() {
	return convexTest(schema, modules);
}

function asAdmin(t: ReturnType<typeof createHarness>) {
	return t.withIdentity(ADMIN_IDENTITY);
}

function asNonAdmin(t: ReturnType<typeof createHarness>) {
	return t.withIdentity(NON_ADMIN_IDENTITY);
}

describe("Cash Ledger Sequence Counter", () => {
	it("initializeCashSequenceCounter creates singleton with currentValue 0", async () => {
		const t = createHarness();
		const auth = asAdmin(t);

		const id = await auth.mutation(
			api.payments.cashLedger.sequenceCounter.initializeCashSequenceCounter,
			{}
		);

		expect(id).toBeDefined();

		const doc = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "cash_ledger_global"))
				.unique();
		});
		expect(doc).not.toBeNull();
		expect(doc?.name).toBe("cash_ledger_global");
		expect(doc?.currentValue).toBe(0n);
	});

	it("initializeCashSequenceCounter is idempotent", async () => {
		const t = createHarness();
		const auth = asAdmin(t);

		const id1 = await auth.mutation(
			api.payments.cashLedger.sequenceCounter.initializeCashSequenceCounter,
			{}
		);
		const id2 = await auth.mutation(
			api.payments.cashLedger.sequenceCounter.initializeCashSequenceCounter,
			{}
		);

		expect(id1).toBe(id2);

		const docs = await t.run(async (ctx) => {
			return ctx.db.query("cash_ledger_sequence_counters").collect();
		});
		expect(docs).toHaveLength(1);
	});

	it("initializeCashSequenceCounter does not reset counter after increment", async () => {
		const t = createHarness();
		const auth = asAdmin(t);

		await auth.mutation(
			api.payments.cashLedger.sequenceCounter.initializeCashSequenceCounter,
			{}
		);

		// Increment the counter directly
		await t.run(async (ctx) => {
			const val = await getNextCashSequenceNumber(ctx);
			expect(val).toBe(1n);
		});

		// Re-initialize — must NOT reset counter to 0
		await auth.mutation(
			api.payments.cashLedger.sequenceCounter.initializeCashSequenceCounter,
			{}
		);

		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "cash_ledger_global"))
				.unique();
		});
		expect(counter?.currentValue).toBe(1n);
	});

	it("getNextCashSequenceNumber lazy-initializes counter if not present", async () => {
		const t = createHarness();

		// Call getNextCashSequenceNumber without prior initialization
		const value = await t.run(async (ctx) => {
			return getNextCashSequenceNumber(ctx);
		});

		expect(value).toBe(1n);

		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "cash_ledger_global"))
				.unique();
		});
		expect(counter).not.toBeNull();
		expect(counter?.currentValue).toBe(1n);
	});

	it("getNextCashSequenceNumber returns monotonically increasing values", async () => {
		const t = createHarness();

		const values = await t.run(async (ctx) => {
			const v1 = await getNextCashSequenceNumber(ctx);
			const v2 = await getNextCashSequenceNumber(ctx);
			const v3 = await getNextCashSequenceNumber(ctx);
			return [v1, v2, v3];
		});

		expect(values).toEqual([1n, 2n, 3n]);
		for (let i = 1; i < values.length; i++) {
			expect(values[i]).toBeGreaterThan(values[i - 1]);
		}
	});

	it("sequence numbers are gap-free across multiple t.run calls", async () => {
		const t = createHarness();

		const v1 = await t.run(async (ctx) => {
			return getNextCashSequenceNumber(ctx);
		});
		const v2 = await t.run(async (ctx) => {
			return getNextCashSequenceNumber(ctx);
		});
		const v3 = await t.run(async (ctx) => {
			return getNextCashSequenceNumber(ctx);
		});

		expect(v1).toBe(1n);
		expect(v2).toBe(2n);
		expect(v3).toBe(3n);

		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "cash_ledger_global"))
				.unique();
		});
		expect(counter?.currentValue).toBe(3n);
	});

	it("rejects non-FairLend-admin from initializeCashSequenceCounter mutation", async () => {
		const t = createHarness();
		const auth = asNonAdmin(t);

		await expect(
			auth.mutation(
				api.payments.cashLedger.sequenceCounter.initializeCashSequenceCounter,
				{}
			)
		).rejects.toThrow(FAIR_LEND_ADMIN_PATTERN);
	});
});
