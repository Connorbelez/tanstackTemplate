import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

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

function getConvexErrorCode(error: unknown): string {
	expect(error).toBeInstanceOf(ConvexError);
	if (!(error instanceof ConvexError)) {
		throw new Error("Expected ConvexError");
	}
	if (typeof error.data === "string") {
		const parsed = JSON.parse(error.data) as { code?: string };
		return parsed.code ?? "";
	}
	if (typeof error.data === "object" && error.data !== null) {
		return (error.data as { code?: string }).code ?? "";
	}
	return "";
}

async function initCounter(t: ReturnType<typeof createTestHarness>) {
	const auth = asLedgerUser(t);
	await auth.mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{},
	);
}

async function createSevenEntries(t: ReturnType<typeof createTestHarness>) {
	const auth = asLedgerUser(t);

	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId: "m1",
		effectiveDate: "2026-01-01",
		idempotencyKey: "mint-m1",
		source: SYS_SOURCE,
	});
	await auth.mutation(api.ledger.mutations.issueShares, {
		mortgageId: "m1",
		lenderId: "lender-a",
		amount: 5_000,
		effectiveDate: "2026-01-01",
		idempotencyKey: "issue-a",
		source: SYS_SOURCE,
	});
	await auth.mutation(api.ledger.mutations.issueShares, {
		mortgageId: "m1",
		lenderId: "lender-b",
		amount: 5_000,
		effectiveDate: "2026-01-01",
		idempotencyKey: "issue-b",
		source: SYS_SOURCE,
	});
	await auth.mutation(api.ledger.mutations.transferShares, {
		mortgageId: "m1",
		sellerLenderId: "lender-a",
		buyerLenderId: "lender-c",
		amount: 2_000,
		effectiveDate: "2026-01-02",
		idempotencyKey: "transfer-a-c",
		source: SYS_SOURCE,
	});
	await auth.mutation(api.ledger.mutations.redeemShares, {
		mortgageId: "m1",
		lenderId: "lender-b",
		amount: 1_000,
		effectiveDate: "2026-01-02",
		idempotencyKey: "redeem-b-1",
		source: SYS_SOURCE,
	});
	await auth.mutation(api.ledger.mutations.transferShares, {
		mortgageId: "m1",
		sellerLenderId: "lender-b",
		buyerLenderId: "lender-d",
		amount: 1_000,
		effectiveDate: "2026-01-03",
		idempotencyKey: "transfer-b-d",
		source: SYS_SOURCE,
	});
	await auth.mutation(api.ledger.mutations.redeemShares, {
		mortgageId: "m1",
		lenderId: "lender-c",
		amount: 1_000,
		effectiveDate: "2026-01-03",
		idempotencyKey: "redeem-c-1",
		source: SYS_SOURCE,
	});
}

describe("Ledger Consumer Cursors", () => {
	it("registerCursor is idempotent and initializes the cursor at genesis", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const id1 = await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});
		const id2 = await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});

		expect(id1).toBe(id2);

		const cursor = await auth.query(api.ledger.cursors.getCursor, {
			consumerId: "accrual_engine",
		});
		expect(cursor?._id).toBe(id1);
		expect(cursor?.lastProcessedSequence).toBe(0n);
	});

	it("implements the SPEC 6.7 polling, advance, and replay flow", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});
		await createSevenEntries(t);

		const initialPoll = await auth.query(api.ledger.cursors.getNewEntries, {
			consumerId: "accrual_engine",
		});
		expect(initialPoll.entries).toHaveLength(7);
		expect(initialPoll.entries.map((entry) => entry.sequenceNumber)).toEqual([
			1n,
			2n,
			3n,
			4n,
			5n,
			6n,
			7n,
		]);
		expect(initialPoll.cursorPosition).toBe(0n);
		expect(initialPoll.hasMore).toBe(false);

		await auth.mutation(api.ledger.cursors.advanceCursor, {
			consumerId: "accrual_engine",
			lastProcessedSequence: 3n,
		});

		const afterAdvance = await auth.query(api.ledger.cursors.getNewEntries, {
			consumerId: "accrual_engine",
		});
		expect(afterAdvance.entries.map((entry) => entry.sequenceNumber)).toEqual([
			4n,
			5n,
			6n,
			7n,
		]);
		expect(afterAdvance.cursorPosition).toBe(3n);

		await auth.mutation(api.ledger.cursors.advanceCursor, {
			consumerId: "accrual_engine",
			lastProcessedSequence: 7n,
		});

		const emptyPoll = await auth.query(api.ledger.cursors.getNewEntries, {
			consumerId: "accrual_engine",
		});
		expect(emptyPoll.entries).toHaveLength(0);
		expect(emptyPoll.cursorPosition).toBe(7n);
		expect(emptyPoll.hasMore).toBe(false);

		await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "dispersal_engine",
		});
		const replayPoll = await auth.query(api.ledger.cursors.getNewEntries, {
			consumerId: "dispersal_engine",
		});
		expect(replayPoll.entries.map((entry) => entry.sequenceNumber)).toEqual([
			1n,
			2n,
			3n,
			4n,
			5n,
			6n,
			7n,
		]);
		expect(replayPoll.cursorPosition).toBe(0n);
	});

	it("supports batch size limiting and reports hasMore correctly", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});
		await createSevenEntries(t);

		const firstBatch = await auth.query(api.ledger.cursors.getNewEntries, {
			consumerId: "accrual_engine",
			batchSize: 3,
		});
		expect(firstBatch.entries.map((entry) => entry.sequenceNumber)).toEqual([
			1n,
			2n,
			3n,
		]);
		expect(firstBatch.hasMore).toBe(true);

		await auth.mutation(api.ledger.cursors.advanceCursor, {
			consumerId: "accrual_engine",
			lastProcessedSequence: 3n,
		});

		const secondBatch = await auth.query(api.ledger.cursors.getNewEntries, {
			consumerId: "accrual_engine",
			batchSize: 10,
		});
		expect(secondBatch.entries.map((entry) => entry.sequenceNumber)).toEqual([
			4n,
			5n,
			6n,
			7n,
		]);
		expect(secondBatch.hasMore).toBe(false);
	});

	it("throws structured errors for missing cursors, invalid sequences, and invalid batch sizes", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		try {
			await auth.query(api.ledger.cursors.getNewEntries, {
				consumerId: "missing_consumer",
			});
			expect.unreachable("Expected getNewEntries to reject");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("CURSOR_NOT_FOUND");
		}

		try {
			await auth.mutation(api.ledger.cursors.advanceCursor, {
				consumerId: "missing_consumer",
				lastProcessedSequence: 1n,
			});
			expect.unreachable("Expected advanceCursor to reject missing cursor");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("CURSOR_NOT_FOUND");
		}

		await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});
		await createSevenEntries(t);

		try {
			await auth.mutation(api.ledger.cursors.advanceCursor, {
				consumerId: "accrual_engine",
				lastProcessedSequence: 999n,
			});
			expect.unreachable("Expected advanceCursor to reject bad sequence");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("INVALID_SEQUENCE");
		}

		try {
			await auth.query(api.ledger.cursors.getNewEntries, {
				consumerId: "accrual_engine",
				batchSize: 0,
			});
			expect.unreachable("Expected getNewEntries to reject invalid batch size");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("INVALID_BATCH_SIZE");
		}
	});

	it("resetCursor resets to 0 by default and accepts a valid target sequence", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});
		await createSevenEntries(t);

		// Advance to sequence 5, then reset to 0
		await auth.mutation(api.ledger.cursors.advanceCursor, {
			consumerId: "accrual_engine",
			lastProcessedSequence: 5n,
		});

		await auth.mutation(api.ledger.cursors.resetCursor, {
			consumerId: "accrual_engine",
		});

		const afterReset = await auth.query(api.ledger.cursors.getCursor, {
			consumerId: "accrual_engine",
		});
		expect(afterReset?.lastProcessedSequence).toBe(0n);

		// Reset to a specific valid sequence
		await auth.mutation(api.ledger.cursors.resetCursor, {
			consumerId: "accrual_engine",
			toSequence: 3n,
		});

		const afterResetToThree = await auth.query(api.ledger.cursors.getCursor, {
			consumerId: "accrual_engine",
		});
		expect(afterResetToThree?.lastProcessedSequence).toBe(3n);
	});

	it("resetCursor rejects a non-existent target sequence", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await auth.mutation(api.ledger.cursors.registerCursor, {
			consumerId: "accrual_engine",
		});

		try {
			await auth.mutation(api.ledger.cursors.resetCursor, {
				consumerId: "accrual_engine",
				toSequence: 999n,
			});
			expect.unreachable("Expected resetCursor to reject non-existent sequence");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("INVALID_SEQUENCE");
		}
	});
});
