import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { getAvailableBalance } from "../accounts";
import { reserveShares } from "../mutations";

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
