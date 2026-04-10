import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import { createTestHarness } from "./testUtils.test";

const ADMIN_IDENTITY = {
	subject: "test-bootstrap-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "admin@fairlend.ca",
	user_first_name: "Bootstrap",
	user_last_name: "Admin",
};

const NON_ADMIN_IDENTITY = {
	subject: "test-non-admin-user",
	issuer: "https://api.workos.com",
	org_id: "org_some_other_org",
	organization_name: "SomeOrg",
	role: "member",
	roles: JSON.stringify(["member"]),
	permissions: JSON.stringify(["ledger:view"]),
	user_email: "user@example.ca",
	user_first_name: "Regular",
	user_last_name: "User",
};

function asAdmin(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(ADMIN_IDENTITY);
}

const SYS_SOURCE = { type: "system" as const, channel: "test" };

describe("bootstrapLedger", () => {
	it("fresh bootstrap creates both singletons", async () => {
		const t = createTestHarness();
		const admin = asAdmin(t);

		const result = await admin.mutation(
			api.ledger.bootstrap.bootstrapLedger,
			{},
		);

		expect(result.worldAccountId).toBeDefined();
		expect(result.sequenceCounterId).toBeDefined();

		// Verify WORLD account exists with correct fields
		const worldAccount = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "WORLD").eq("mortgageId", undefined),
				)
				.first();
		});
		expect(worldAccount).not.toBeNull();
		expect(worldAccount!.type).toBe("WORLD");
		expect(worldAccount!.cumulativeDebits).toBe(0n);
		expect(worldAccount!.cumulativeCredits).toBe(0n);
		expect(worldAccount!.pendingDebits).toBe(0n);
		expect(worldAccount!.pendingCredits).toBe(0n);
		expect(worldAccount!.mortgageId).toBeUndefined();

		// Verify sequence counter exists with correct fields
		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
				.first();
		});
		expect(counter).not.toBeNull();
		expect(counter!.name).toBe("ledger_sequence");
		expect(counter!.value).toBe(0n);
	});

	it("idempotent re-run returns same IDs with no duplicates", async () => {
		const t = createTestHarness();
		const admin = asAdmin(t);

		const first = await admin.mutation(
			api.ledger.bootstrap.bootstrapLedger,
			{},
		);
		const second = await admin.mutation(
			api.ledger.bootstrap.bootstrapLedger,
			{},
		);

		// Same IDs returned
		expect(first.worldAccountId).toBe(second.worldAccountId);
		expect(first.sequenceCounterId).toBe(second.sequenceCounterId);

		// No duplicates — exactly 1 WORLD account and 1 sequence counter
		const worldAccounts = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "WORLD").eq("mortgageId", undefined),
				)
				.collect();
		});
		expect(worldAccounts).toHaveLength(1);

		const counters = await t.run(async (ctx) => {
			return ctx.db.query("ledger_sequence_counters").collect();
		});
		expect(counters).toHaveLength(1);
	});

	it("non-admin user is rejected", async () => {
		const t = createTestHarness();
		const nonAdmin = t.withIdentity(NON_ADMIN_IDENTITY);

		await expect(
			nonAdmin.mutation(api.ledger.bootstrap.bootstrapLedger, {}),
		).rejects.toThrow(/[Ff]orbidden|admin/);
	});

	it("ledger operations succeed after bootstrap", async () => {
		const t = createTestHarness();
		const admin = asAdmin(t);

		// Bootstrap first
		await admin.mutation(api.ledger.bootstrap.bootstrapLedger, {});

		// Mint a mortgage — this requires both WORLD account and sequence counter
		const mintResult = await admin.mutation(
			api.ledger.mutations.mintMortgage,
			{
				mortgageId: "m1",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-m1",
				source: SYS_SOURCE,
			},
		);

		// Proves both WORLD and counter were initialized
		expect(mintResult.journalEntry.sequenceNumber).toBe(1n);
	});
});
