import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { getAvailableBalance, getPostedBalance } from "../accounts";
import { commitReservation, reserveShares, voidReservation } from "../mutations";

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
type ReserveSharesArgs = {
	amount: number;
	buyerLenderId: string;
	dealId?: string;
	effectiveDate: string;
	idempotencyKey: string;
	metadata?: unknown;
	mortgageId: string;
	sellerLenderId: string;
	source: {
		actor?: string;
		channel?: string;
		type: "cron" | "system" | "user" | "webhook";
	};
};

type ReserveSharesResult = {
	journalEntry: Doc<"ledger_journal_entries">;
	reservationId: Id<"ledger_reservations">;
};

type ReserveSharesMutation = {
	_handler: (
		ctx: MutationCtx,
		args: ReserveSharesArgs
	) => Promise<ReserveSharesResult>;
};

const reserveSharesMutation = reserveShares as unknown as ReserveSharesMutation;

function getConvexErrorCode(error: unknown): string {
	expect(error).toBeInstanceOf(ConvexError);
	if (!(error instanceof ConvexError)) {
		throw new Error("Expected ConvexError");
	}

	const visited = new Set<unknown>();

	function findCode(value: unknown): string {
		if (typeof value === "string") {
			try {
				return findCode(JSON.parse(value));
			} catch {
				const match = value.match(
					/\b(INVALID_AMOUNT|SAME_ACCOUNT|ACCOUNT_NOT_FOUND|TYPE_MISMATCH|INSUFFICIENT_BALANCE|MIN_FRACTION_VIOLATED|MORTGAGE_MISMATCH|CORRECTION_REQUIRES_ADMIN|CORRECTION_REQUIRES_CAUSED_BY|CORRECTION_REQUIRES_REASON)\b/
				);
				return match?.[1] ?? "";
			}
		}

		if (typeof value !== "object" || value === null || visited.has(value)) {
			return "";
		}

		visited.add(value);

		if ("code" in value && typeof value.code === "string") {
			return value.code;
		}

		for (const nested of Object.values(value)) {
			const code = findCode(nested);
			if (code) {
				return code;
			}
		}

		return "";
	}

	return findCode(error.data) || findCode(error.message) || findCode(error);
}

async function initCounter(auth: ReturnType<typeof asLedgerUser>) {
	await auth.mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
}

async function mintAndIssue(
	auth: ReturnType<typeof asLedgerUser>,
	mortgageId: string,
	lenderId: string,
	amount: number
) {
	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});

	return auth.mutation(api.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate: "2026-01-01",
		idempotencyKey: `issue-${mortgageId}-${lenderId}`,
		source: SYS_SOURCE,
	});
}

async function getAccount(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string
) {
	const account = await t.run(async (ctx) =>
		ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage_and_lender", (q) =>
				q.eq("mortgageId", mortgageId).eq("lenderId", lenderId)
			)
			.first()
	);

	if (!account) {
		throw new Error(
			`Missing POSITION account for lender ${lenderId} on mortgage ${mortgageId}`
		);
	}

	return account;
}

async function executeReserveShares(
	t: ReturnType<typeof createTestHarness>,
	args: ReserveSharesArgs
) {
	return t.run(async (ctx) => reserveSharesMutation._handler(ctx, args));
}

type CommitReservationArgs = {
	reservationId: Id<"ledger_reservations">;
	effectiveDate: string;
	idempotencyKey: string;
	source: {
		actor?: string;
		channel?: string;
		type: "cron" | "system" | "user" | "webhook";
	};
};

type CommitReservationResult = {
	journalEntry: Doc<"ledger_journal_entries">;
};

type CommitReservationMutation = {
	_handler: (
		ctx: MutationCtx,
		args: CommitReservationArgs
	) => Promise<CommitReservationResult>;
};

const commitReservationMutation =
	commitReservation as unknown as CommitReservationMutation;

type VoidReservationArgs = {
	reservationId: Id<"ledger_reservations">;
	reason: string;
	effectiveDate: string;
	idempotencyKey: string;
	source: {
		actor?: string;
		channel?: string;
		type: "cron" | "system" | "user" | "webhook";
	};
};

type VoidReservationResult = {
	journalEntry: Doc<"ledger_journal_entries">;
};

type VoidReservationMutation = {
	_handler: (
		ctx: MutationCtx,
		args: VoidReservationArgs
	) => Promise<VoidReservationResult>;
};

const voidReservationMutation =
	voidReservation as unknown as VoidReservationMutation;

async function executeCommitReservation(
	t: ReturnType<typeof createTestHarness>,
	args: CommitReservationArgs
) {
	return t.run(async (ctx) => commitReservationMutation._handler(ctx, args));
}

async function executeVoidReservation(
	t: ReturnType<typeof createTestHarness>,
	args: VoidReservationArgs
) {
	return t.run(async (ctx) => voidReservationMutation._handler(ctx, args));
}

async function getReservation(
	t: ReturnType<typeof createTestHarness>,
	reservationId: Id<"ledger_reservations">
) {
	return t.run(async (ctx) => ctx.db.get(reservationId));
}

async function getJournalEntry(
	t: ReturnType<typeof createTestHarness>,
	journalEntryId: Id<"ledger_journal_entries">
) {
	return t.run(async (ctx) => ctx.db.get(journalEntryId));
}

describe("reserveShares", () => {
	it("creates a pending reservation, locks pending fields, and backfills reservationId on the journal entry", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-happy", "seller", 5_000);

		const sellerBefore = await getAccount(t, "m-reserve-happy", "seller");

		const result = await executeReserveShares(t, {
			mortgageId: "m-reserve-happy",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			dealId: "deal-1",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-happy",
			source: SYS_SOURCE,
		});

		const sellerAfter = await getAccount(t, "m-reserve-happy", "seller");
		const buyerAfter = await getAccount(t, "m-reserve-happy", "buyer");
		const reservation = await getReservation(t, result.reservationId);
		const journalEntry = await getJournalEntry(t, result.journalEntry._id);

		expect(result.journalEntry.entryType).toBe("SHARES_RESERVED");
		expect(result.journalEntry.amount).toBe(3_000);
		expect(result.journalEntry.reservationId).toBe(result.reservationId);

		expect(sellerAfter.pendingCredits).toBe(3_000n);
		expect(buyerAfter.pendingDebits).toBe(3_000n);
		expect(sellerAfter.cumulativeDebits).toBe(sellerBefore.cumulativeDebits);
		expect(sellerAfter.cumulativeCredits).toBe(sellerBefore.cumulativeCredits);
		expect(buyerAfter.cumulativeDebits).toBe(0n);
		expect(buyerAfter.cumulativeCredits).toBe(0n);
		expect(getAvailableBalance(sellerAfter)).toBe(2_000n);

		expect(reservation).not.toBeNull();
		expect(reservation?.status).toBe("pending");
		expect(reservation?.dealId).toBe("deal-1");
		expect(reservation?.sellerAccountId).toBe(sellerAfter._id);
		expect(reservation?.buyerAccountId).toBe(buyerAfter._id);
		expect(reservation?.reserveJournalEntryId).toBe(result.journalEntry._id);

		expect(journalEntry?.reservationId).toBe(result.reservationId);
	});

	it("is idempotent and does not double-lock pending fields on retry", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-idempotent", "seller", 5_000);

		const first = await executeReserveShares(t, {
			mortgageId: "m-reserve-idempotent",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-idempotent",
			source: SYS_SOURCE,
		});

		const second = await executeReserveShares(t, {
			mortgageId: "m-reserve-idempotent",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-idempotent",
			source: SYS_SOURCE,
		});

		const sellerAfter = await getAccount(t, "m-reserve-idempotent", "seller");
		const buyerAfter = await getAccount(t, "m-reserve-idempotent", "buyer");
		const reservations = await t.run(async (ctx) =>
			ctx.db
				.query("ledger_reservations")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", "m-reserve-idempotent").eq("status", "pending")
				)
				.collect()
		);

		expect(second.reservationId).toBe(first.reservationId);
		expect(second.journalEntry._id).toBe(first.journalEntry._id);
		expect(sellerAfter.pendingCredits).toBe(3_000n);
		expect(buyerAfter.pendingDebits).toBe(3_000n);
		expect(reservations).toHaveLength(1);
	});

	it("treats existing reservations as a mutex over available balance across multiple deals", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-mutex", "seller", 10_000);

		await executeReserveShares(t, {
			mortgageId: "m-reserve-mutex",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-a",
			amount: 8_000,
			dealId: "deal-a",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-mutex-a",
			source: SYS_SOURCE,
		});

		try {
			await executeReserveShares(t, {
				mortgageId: "m-reserve-mutex",
				sellerLenderId: "seller",
				buyerLenderId: "buyer-b",
				amount: 3_000,
				dealId: "deal-b",
				effectiveDate: "2026-01-02",
				idempotencyKey: "reserve-mutex-b",
				source: SYS_SOURCE,
			});
			expect.fail("Expected mutex reservation to fail");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("INSUFFICIENT_BALANCE");
		}

		await executeReserveShares(t, {
			mortgageId: "m-reserve-mutex",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-c",
			amount: 2_000,
			dealId: "deal-c",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-mutex-c",
			source: SYS_SOURCE,
		});

		const sellerAfter = await getAccount(t, "m-reserve-mutex", "seller");
		expect(sellerAfter.pendingCredits).toBe(10_000n);
		expect(getAvailableBalance(sellerAfter)).toBe(0n);
	});

	it("void of one reservation restores available balance for subsequent reservations", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-void-mutex", "seller", 10_000);

		// Reserve 8,000 for Deal A → available = 2,000
		const dealA = await executeReserveShares(t, {
			mortgageId: "m-reserve-void-mutex",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-a",
			amount: 8_000,
			dealId: "deal-a",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-void-mutex-a",
			source: SYS_SOURCE,
		});

		// Reserve 2,000 for Deal B → available = 0
		await executeReserveShares(t, {
			mortgageId: "m-reserve-void-mutex",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-b",
			amount: 2_000,
			dealId: "deal-b",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-void-mutex-b",
			source: SYS_SOURCE,
		});

		const sellerBeforeVoid = await getAccount(
			t,
			"m-reserve-void-mutex",
			"seller"
		);
		expect(sellerBeforeVoid.pendingCredits).toBe(10_000n);
		expect(getAvailableBalance(sellerBeforeVoid)).toBe(0n);

		// Void Deal A → releases 8,000, available = 8,000
		await executeVoidReservation(t, {
			reservationId: dealA.reservationId,
			reason: "deal A cancelled",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-mutex-a",
			source: SYS_SOURCE,
		});

		const sellerAfterVoid = await getAccount(
			t,
			"m-reserve-void-mutex",
			"seller"
		);
		// Only Deal B's 2,000 remains pending
		expect(sellerAfterVoid.pendingCredits).toBe(2_000n);
		expect(getAvailableBalance(sellerAfterVoid)).toBe(8_000n);

		// Now a new 5,000 reservation should succeed
		await executeReserveShares(t, {
			mortgageId: "m-reserve-void-mutex",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-c",
			amount: 5_000,
			dealId: "deal-c",
			effectiveDate: "2026-01-03",
			idempotencyKey: "reserve-void-mutex-c",
			source: SYS_SOURCE,
		});

		const sellerFinal = await getAccount(
			t,
			"m-reserve-void-mutex",
			"seller"
		);
		expect(sellerFinal.pendingCredits).toBe(7_000n);
		expect(getAvailableBalance(sellerFinal)).toBe(3_000n);
	});

	it("rejects when seller available balance is below the requested amount", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-insufficient", "seller", 3_000);

		try {
			await executeReserveShares(t, {
				mortgageId: "m-reserve-insufficient",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 4_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "reserve-insufficient",
				source: SYS_SOURCE,
			});
			expect.fail("Expected insufficient balance rejection");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("INSUFFICIENT_BALANCE");
		}
	});

	it("rejects seller or buyer min-fraction violations during reservation validation", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-min-fraction", "seller", 1_500);

		try {
			await executeReserveShares(t, {
				mortgageId: "m-reserve-min-fraction",
				sellerLenderId: "seller",
				buyerLenderId: "buyer-a",
				amount: 600,
				effectiveDate: "2026-01-02",
				idempotencyKey: "reserve-seller-min-fraction",
				source: SYS_SOURCE,
			});
			expect.fail("Expected seller min-fraction rejection");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("MIN_FRACTION_VIOLATED");
		}

		await mintAndIssue(auth, "m-reserve-buyer-min-fraction", "seller", 5_000);

		try {
			await executeReserveShares(t, {
				mortgageId: "m-reserve-buyer-min-fraction",
				sellerLenderId: "seller",
				buyerLenderId: "buyer-b",
				amount: 500,
				effectiveDate: "2026-01-02",
				idempotencyKey: "reserve-buyer-min-fraction",
				source: SYS_SOURCE,
			});
			expect.fail("Expected buyer min-fraction rejection");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("MIN_FRACTION_VIOLATED");
		}
	});

	it("allows a sell-all reservation that drives the seller's available balance to zero", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-reserve-sell-all", "seller", 3_000);

		const result = await executeReserveShares(t, {
			mortgageId: "m-reserve-sell-all",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-sell-all",
			source: SYS_SOURCE,
		});

		const sellerAfter = await getAccount(t, "m-reserve-sell-all", "seller");
		expect(result.journalEntry.entryType).toBe("SHARES_RESERVED");
		expect(sellerAfter.pendingCredits).toBe(3_000n);
		expect(getAvailableBalance(sellerAfter)).toBe(0n);
	});
});

describe("commitReservation", () => {
	it("converts a pending reservation to a posted transfer, updating cumulative and pending fields", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-commit-happy", "seller", 5_000);

		const sellerBefore = await getAccount(t, "m-commit-happy", "seller");

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-commit-happy",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-commit-happy",
			source: SYS_SOURCE,
		});

		const sellerAfterReserve = await getAccount(t, "m-commit-happy", "seller");

		const commitResult = await executeCommitReservation(t, {
			reservationId: reserveResult.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-happy",
			source: SYS_SOURCE,
		});

		const sellerAfter = await getAccount(t, "m-commit-happy", "seller");
		const buyerAfter = await getAccount(t, "m-commit-happy", "buyer");
		const reservation = await getReservation(t, reserveResult.reservationId);

		// Journal entry assertions
		expect(commitResult.journalEntry.entryType).toBe("SHARES_COMMITTED");
		expect(commitResult.journalEntry.reservationId).toBe(
			reserveResult.reservationId
		);

		// Seller posted balance decreased by 3,000 (cumulativeCredits increased)
		expect(sellerAfter.cumulativeCredits).toBe(
			sellerAfterReserve.cumulativeCredits + 3_000n
		);
		expect(getPostedBalance(sellerAfter)).toBe(
			getPostedBalance(sellerBefore) - 3_000n
		);

		// Buyer posted balance increased by 3,000 (cumulativeDebits increased)
		expect(buyerAfter.cumulativeDebits).toBe(3_000n);
		expect(getPostedBalance(buyerAfter)).toBe(3_000n);

		// Pending fields zeroed
		expect(sellerAfter.pendingCredits).toBe(0n);
		expect(buyerAfter.pendingDebits).toBe(0n);

		// Reservation status
		expect(reservation?.status).toBe("committed");
		expect(typeof reservation?.resolvedAt).toBe("number");
		expect(reservation?.commitJournalEntryId).toBe(
			commitResult.journalEntry._id
		);
	});

	it("is idempotent on retry with same idempotencyKey", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-commit-idempotent", "seller", 5_000);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-commit-idempotent",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-commit-idempotent",
			source: SYS_SOURCE,
		});

		// First commit
		const firstResult = await executeCommitReservation(t, {
			reservationId: reserveResult.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-idempotent",
			source: SYS_SOURCE,
		});

		// Record all account balances after first commit
		const sellerAfterFirst = await getAccount(
			t,
			"m-commit-idempotent",
			"seller"
		);
		const buyerAfterFirst = await getAccount(
			t,
			"m-commit-idempotent",
			"buyer"
		);

		// Retry with same idempotencyKey
		const secondResult = await executeCommitReservation(t, {
			reservationId: reserveResult.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-idempotent",
			source: SYS_SOURCE,
		});

		// Record all account balances after retry
		const sellerAfterSecond = await getAccount(
			t,
			"m-commit-idempotent",
			"seller"
		);
		const buyerAfterSecond = await getAccount(
			t,
			"m-commit-idempotent",
			"buyer"
		);

		// Same journal entry returned
		expect(secondResult.journalEntry._id).toBe(
			firstResult.journalEntry._id
		);

		// All account balances unchanged
		expect(sellerAfterSecond.cumulativeDebits).toBe(
			sellerAfterFirst.cumulativeDebits
		);
		expect(sellerAfterSecond.cumulativeCredits).toBe(
			sellerAfterFirst.cumulativeCredits
		);
		expect(sellerAfterSecond.pendingCredits).toBe(
			sellerAfterFirst.pendingCredits
		);
		expect(sellerAfterSecond.pendingDebits).toBe(
			sellerAfterFirst.pendingDebits
		);
		expect(buyerAfterSecond.cumulativeDebits).toBe(
			buyerAfterFirst.cumulativeDebits
		);
		expect(buyerAfterSecond.cumulativeCredits).toBe(
			buyerAfterFirst.cumulativeCredits
		);
		expect(buyerAfterSecond.pendingCredits).toBe(
			buyerAfterFirst.pendingCredits
		);
		expect(buyerAfterSecond.pendingDebits).toBe(
			buyerAfterFirst.pendingDebits
		);
	});

	it("rejects double-commit with ConvexError and zero side effects", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-double-commit", "seller", 5_000);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-double-commit",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-double-commit",
			source: SYS_SOURCE,
		});

		await executeCommitReservation(t, {
			reservationId: reserveResult.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-double-1",
			source: SYS_SOURCE,
		});

		// Record state after first commit
		const sellerAfterCommit = await getAccount(
			t,
			"m-double-commit",
			"seller"
		);
		const buyerAfterCommit = await getAccount(
			t,
			"m-double-commit",
			"buyer"
		);
		const reservationAfterCommit = await getReservation(
			t,
			reserveResult.reservationId
		);

		// Attempt second commit
		try {
			await executeCommitReservation(t, {
				reservationId: reserveResult.reservationId,
				effectiveDate: "2026-01-04",
				idempotencyKey: "commit-double-2",
				source: SYS_SOURCE,
			});
			expect.fail("Expected double-commit to fail");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("RESERVATION_NOT_PENDING");
		}

		// Verify zero side effects
		const sellerAfter = await getAccount(t, "m-double-commit", "seller");
		const buyerAfter = await getAccount(t, "m-double-commit", "buyer");
		const reservationAfter = await getReservation(
			t,
			reserveResult.reservationId
		);

		expect(sellerAfter.cumulativeDebits).toBe(
			sellerAfterCommit.cumulativeDebits
		);
		expect(sellerAfter.cumulativeCredits).toBe(
			sellerAfterCommit.cumulativeCredits
		);
		expect(sellerAfter.pendingCredits).toBe(
			sellerAfterCommit.pendingCredits
		);
		expect(buyerAfter.cumulativeDebits).toBe(
			buyerAfterCommit.cumulativeDebits
		);
		expect(buyerAfter.cumulativeCredits).toBe(
			buyerAfterCommit.cumulativeCredits
		);
		expect(buyerAfter.pendingDebits).toBe(buyerAfterCommit.pendingDebits);
		expect(reservationAfter?.status).toBe(reservationAfterCommit?.status);
	});

	it("rejects commit after void with ConvexError and zero side effects", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-commit-after-void", "seller", 5_000);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-commit-after-void",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-commit-after-void",
			source: SYS_SOURCE,
		});

		await executeVoidReservation(t, {
			reservationId: reserveResult.reservationId,
			reason: "deal cancelled",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-before-commit",
			source: SYS_SOURCE,
		});

		// Record state after void
		const sellerAfterVoid = await getAccount(
			t,
			"m-commit-after-void",
			"seller"
		);
		const buyerAfterVoid = await getAccount(
			t,
			"m-commit-after-void",
			"buyer"
		);
		const reservationAfterVoid = await getReservation(
			t,
			reserveResult.reservationId
		);

		// Attempt commit after void
		try {
			await executeCommitReservation(t, {
				reservationId: reserveResult.reservationId,
				effectiveDate: "2026-01-04",
				idempotencyKey: "commit-after-void",
				source: SYS_SOURCE,
			});
			expect.fail("Expected commit-after-void to fail");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("RESERVATION_NOT_PENDING");
		}

		// Verify reservation still voided, accounts unchanged
		const sellerAfter = await getAccount(
			t,
			"m-commit-after-void",
			"seller"
		);
		const buyerAfter = await getAccount(
			t,
			"m-commit-after-void",
			"buyer"
		);
		const reservationAfter = await getReservation(
			t,
			reserveResult.reservationId
		);

		expect(reservationAfter?.status).toBe("voided");
		expect(sellerAfter.cumulativeDebits).toBe(
			sellerAfterVoid.cumulativeDebits
		);
		expect(sellerAfter.cumulativeCredits).toBe(
			sellerAfterVoid.cumulativeCredits
		);
		expect(sellerAfter.pendingCredits).toBe(
			sellerAfterVoid.pendingCredits
		);
		expect(buyerAfter.cumulativeDebits).toBe(
			buyerAfterVoid.cumulativeDebits
		);
		expect(buyerAfter.cumulativeCredits).toBe(
			buyerAfterVoid.cumulativeCredits
		);
		expect(buyerAfter.pendingDebits).toBe(buyerAfterVoid.pendingDebits);
		expect(reservationAfter?.resolvedAt).toBe(
			reservationAfterVoid?.resolvedAt
		);
	});
});

describe("voidReservation", () => {
	it("releases a pending reservation, restoring available balance with no cumulative changes", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-void-happy", "seller", 5_000);

		const sellerBeforeReserve = await getAccount(
			t,
			"m-void-happy",
			"seller"
		);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-void-happy",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-void-happy",
			source: SYS_SOURCE,
		});

		const voidResult = await executeVoidReservation(t, {
			reservationId: reserveResult.reservationId,
			reason: "deal cancelled",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-happy",
			source: SYS_SOURCE,
		});

		const sellerAfter = await getAccount(t, "m-void-happy", "seller");
		const buyerAfter = await getAccount(t, "m-void-happy", "buyer");
		const reservation = await getReservation(t, reserveResult.reservationId);

		// Journal entry assertions
		expect(voidResult.journalEntry.entryType).toBe("SHARES_VOIDED");
		expect(voidResult.journalEntry.reason).toBe("deal cancelled");
		expect(voidResult.journalEntry.reservationId).toBe(
			reserveResult.reservationId
		);

		// Seller cumulatives UNCHANGED from before reservation
		expect(sellerAfter.cumulativeDebits).toBe(
			sellerBeforeReserve.cumulativeDebits
		);
		expect(sellerAfter.cumulativeCredits).toBe(
			sellerBeforeReserve.cumulativeCredits
		);

		// Buyer cumulatives unchanged (still 0)
		expect(buyerAfter.cumulativeDebits).toBe(0n);
		expect(buyerAfter.cumulativeCredits).toBe(0n);

		// Pending fields zeroed
		expect(sellerAfter.pendingCredits).toBe(0n);
		expect(buyerAfter.pendingDebits).toBe(0n);

		// Available balance equals posted balance (no pending)
		expect(getAvailableBalance(sellerAfter)).toBe(
			getPostedBalance(sellerAfter)
		);

		// Reservation status
		expect(reservation?.status).toBe("voided");
		expect(typeof reservation?.resolvedAt).toBe("number");
		expect(reservation?.voidJournalEntryId).toBe(
			voidResult.journalEntry._id
		);
	});

	it("is idempotent on retry with same idempotencyKey", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-void-idempotent", "seller", 5_000);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-void-idempotent",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-void-idempotent",
			source: SYS_SOURCE,
		});

		// First void
		const firstResult = await executeVoidReservation(t, {
			reservationId: reserveResult.reservationId,
			reason: "deal cancelled",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-idempotent",
			source: SYS_SOURCE,
		});

		// Record all account balances after first void
		const sellerAfterFirst = await getAccount(
			t,
			"m-void-idempotent",
			"seller"
		);
		const buyerAfterFirst = await getAccount(
			t,
			"m-void-idempotent",
			"buyer"
		);

		// Retry with same idempotencyKey
		const secondResult = await executeVoidReservation(t, {
			reservationId: reserveResult.reservationId,
			reason: "deal cancelled",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-idempotent",
			source: SYS_SOURCE,
		});

		// Record all account balances after retry
		const sellerAfterSecond = await getAccount(
			t,
			"m-void-idempotent",
			"seller"
		);
		const buyerAfterSecond = await getAccount(
			t,
			"m-void-idempotent",
			"buyer"
		);

		// Same journal entry returned
		expect(secondResult.journalEntry._id).toBe(
			firstResult.journalEntry._id
		);

		// All account balances unchanged
		expect(sellerAfterSecond.cumulativeDebits).toBe(
			sellerAfterFirst.cumulativeDebits
		);
		expect(sellerAfterSecond.cumulativeCredits).toBe(
			sellerAfterFirst.cumulativeCredits
		);
		expect(sellerAfterSecond.pendingCredits).toBe(
			sellerAfterFirst.pendingCredits
		);
		expect(sellerAfterSecond.pendingDebits).toBe(
			sellerAfterFirst.pendingDebits
		);
		expect(buyerAfterSecond.cumulativeDebits).toBe(
			buyerAfterFirst.cumulativeDebits
		);
		expect(buyerAfterSecond.cumulativeCredits).toBe(
			buyerAfterFirst.cumulativeCredits
		);
		expect(buyerAfterSecond.pendingCredits).toBe(
			buyerAfterFirst.pendingCredits
		);
		expect(buyerAfterSecond.pendingDebits).toBe(
			buyerAfterFirst.pendingDebits
		);
	});

	it("rejects double-void with ConvexError and zero side effects", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-double-void", "seller", 5_000);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-double-void",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-double-void",
			source: SYS_SOURCE,
		});

		await executeVoidReservation(t, {
			reservationId: reserveResult.reservationId,
			reason: "deal cancelled",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-double-1",
			source: SYS_SOURCE,
		});

		// Record state after first void
		const sellerAfterVoid = await getAccount(t, "m-double-void", "seller");
		const buyerAfterVoid = await getAccount(t, "m-double-void", "buyer");
		const reservationAfterVoid = await getReservation(
			t,
			reserveResult.reservationId
		);

		// Attempt second void
		try {
			await executeVoidReservation(t, {
				reservationId: reserveResult.reservationId,
				reason: "deal cancelled again",
				effectiveDate: "2026-01-04",
				idempotencyKey: "void-double-2",
				source: SYS_SOURCE,
			});
			expect.fail("Expected double-void to fail");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("RESERVATION_NOT_PENDING");
		}

		// Verify zero side effects
		const sellerAfter = await getAccount(t, "m-double-void", "seller");
		const buyerAfter = await getAccount(t, "m-double-void", "buyer");
		const reservationAfter = await getReservation(
			t,
			reserveResult.reservationId
		);

		expect(sellerAfter.cumulativeDebits).toBe(
			sellerAfterVoid.cumulativeDebits
		);
		expect(sellerAfter.cumulativeCredits).toBe(
			sellerAfterVoid.cumulativeCredits
		);
		expect(sellerAfter.pendingCredits).toBe(
			sellerAfterVoid.pendingCredits
		);
		expect(buyerAfter.cumulativeDebits).toBe(
			buyerAfterVoid.cumulativeDebits
		);
		expect(buyerAfter.cumulativeCredits).toBe(
			buyerAfterVoid.cumulativeCredits
		);
		expect(buyerAfter.pendingDebits).toBe(buyerAfterVoid.pendingDebits);
		expect(reservationAfter?.status).toBe(reservationAfterVoid?.status);
	});

	it("rejects void after commit with ConvexError and zero side effects", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-void-after-commit", "seller", 5_000);

		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-void-after-commit",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-void-after-commit",
			source: SYS_SOURCE,
		});

		await executeCommitReservation(t, {
			reservationId: reserveResult.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-before-void",
			source: SYS_SOURCE,
		});

		// Record state after commit
		const sellerAfterCommit = await getAccount(
			t,
			"m-void-after-commit",
			"seller"
		);
		const buyerAfterCommit = await getAccount(
			t,
			"m-void-after-commit",
			"buyer"
		);
		const reservationAfterCommit = await getReservation(
			t,
			reserveResult.reservationId
		);

		// Attempt void after commit
		try {
			await executeVoidReservation(t, {
				reservationId: reserveResult.reservationId,
				reason: "too late",
				effectiveDate: "2026-01-04",
				idempotencyKey: "void-after-commit",
				source: SYS_SOURCE,
			});
			expect.fail("Expected void-after-commit to fail");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("RESERVATION_NOT_PENDING");
		}

		// Verify reservation still committed, accounts unchanged
		const sellerAfter = await getAccount(
			t,
			"m-void-after-commit",
			"seller"
		);
		const buyerAfter = await getAccount(
			t,
			"m-void-after-commit",
			"buyer"
		);
		const reservationAfter = await getReservation(
			t,
			reserveResult.reservationId
		);

		expect(reservationAfter?.status).toBe("committed");
		expect(sellerAfter.cumulativeDebits).toBe(
			sellerAfterCommit.cumulativeDebits
		);
		expect(sellerAfter.cumulativeCredits).toBe(
			sellerAfterCommit.cumulativeCredits
		);
		expect(sellerAfter.pendingCredits).toBe(
			sellerAfterCommit.pendingCredits
		);
		expect(buyerAfter.cumulativeDebits).toBe(
			buyerAfterCommit.cumulativeDebits
		);
		expect(buyerAfter.cumulativeCredits).toBe(
			buyerAfterCommit.cumulativeCredits
		);
		expect(buyerAfter.pendingDebits).toBe(buyerAfterCommit.pendingDebits);
		expect(reservationAfter?.resolvedAt).toBe(
			reservationAfterCommit?.resolvedAt
		);
	});
});
