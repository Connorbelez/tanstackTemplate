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

describe("Sequence Counter", () => {
	it("initializeSequenceCounter creates singleton with value 0", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const id = await auth.mutation(
			api.ledger.sequenceCounter.initializeSequenceCounter,
			{},
		);

		expect(id).toBeDefined();

		// Verify the document was created with correct fields
		const doc = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
				.unique();
		});
		expect(doc).not.toBeNull();
		expect(doc!.name).toBe("ledger_sequence");
		expect(doc!.value).toBe(0n);
	});

	it("initializeSequenceCounter is idempotent", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		const id1 = await auth.mutation(
			api.ledger.sequenceCounter.initializeSequenceCounter,
			{},
		);
		const id2 = await auth.mutation(
			api.ledger.sequenceCounter.initializeSequenceCounter,
			{},
		);

		expect(id1).toBe(id2);

		// Verify only one document exists
		const docs = await t.run(async (ctx) => {
			return ctx.db.query("ledger_sequence_counters").collect();
		});
		expect(docs).toHaveLength(1);

		// Increment the counter by minting a mortgage (internally calls getNextSequenceNumber)
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		// Re-initialize after increment — should NOT reset the counter
		const id3 = await auth.mutation(
			api.ledger.sequenceCounter.initializeSequenceCounter,
			{},
		);

		expect(id3).toBe(id1);

		// Still only one document
		const docsAfter = await t.run(async (ctx) => {
			return ctx.db.query("ledger_sequence_counters").collect();
		});
		expect(docsAfter).toHaveLength(1);

		// Counter value must still be 1n (not reset to 0n)
		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
				.unique();
		});
		expect(counter!.value).toBe(1n);
	});

	it("getNextSequenceNumber lazy-initializes counter if not present", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		// Calling mintMortgage triggers postEntryInternal → getNextSequenceNumber
		// without initializing the counter first — should auto-initialize
		const result = await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		expect(result.journalEntry.sequenceNumber).toBe(1n);

		// Verify the counter was created
		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
				.unique();
		});
		expect(counter).not.toBeNull();
		expect(counter!.value).toBe(1n);
	});

	it("getNextSequenceNumber returns monotonically increasing values", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		// Initialize counter
		await auth.mutation(
			api.ledger.sequenceCounter.initializeSequenceCounter,
			{},
		);

		// Each mint/issue creates journal entries, each getting a new sequence number
		const mint1 = await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});
		expect(mint1.journalEntry.sequenceNumber).toBe(1n);

		const mint2 = await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m2",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m2",
			source: SYS_SOURCE,
		});
		expect(mint2.journalEntry.sequenceNumber).toBe(2n);

		const issue = await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-1",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-m1-l1",
			source: SYS_SOURCE,
		});
		expect(issue.journalEntry.sequenceNumber).toBe(3n);
	});

	it("sequence numbers are gap-free across multiple operations", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);

		await auth.mutation(
			api.ledger.sequenceCounter.initializeSequenceCounter,
			{},
		);

		// Mint + issue + transfer = 3 journal entries
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});
		await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-1",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-m1-l1",
			source: SYS_SOURCE,
		});
		await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-2",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-m1-l2",
			source: SYS_SOURCE,
		});

		// Verify all entries form a gap-free sequence: 1, 2, 3
		const entries = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_sequence")
				.collect();
		});

		expect(entries).toHaveLength(3);
		for (let i = 0; i < entries.length; i++) {
			expect(entries[i].sequenceNumber).toBe(BigInt(i + 1));
		}

		// Verify the counter document reflects the last value
		const counter = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
				.unique();
		});
		expect(counter!.value).toBe(3n);
	});
});
