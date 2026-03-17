/**
 * Shared test utilities for ledger test suites.
 *
 * Centralizes auth identities, harness helpers, typed mutation wrappers,
 * and the ConvexError code extractor so they stay in sync across files.
 */
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import {
	commitReservation,
	reserveShares,
	voidReservation,
} from "../mutations";

// ── Glob for convex-test module loader ───────────────────────────
const modules = import.meta.glob("/convex/**/*.ts");

// ── Auth identity ────────────────────────────────────────────────

export const LEDGER_TEST_IDENTITY = {
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

// ── Test harness helpers ─────────────────────────────────────────

export function createTestHarness() {
	return convexTest(schema, modules);
}

export type TestHarness = ReturnType<typeof createTestHarness>;

export function asLedgerUser(t: TestHarness) {
	return t.withIdentity(LEDGER_TEST_IDENTITY);
}

export type AuthenticatedHarness = ReturnType<typeof asLedgerUser>;

// ── Common constants ─────────────────────────────────────────────

export const SYS_SOURCE = { type: "system" as const, channel: "test" };

// ── Counter initializer ──────────────────────────────────────────

export async function initCounter(auth: AuthenticatedHarness) {
	await auth.mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{},
	);
}

// ── Typed mutation wrappers ──────────────────────────────────────

export type ReserveSharesArgs = {
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

export type ReserveSharesResult = {
	journalEntry: Doc<"ledger_journal_entries">;
	reservationId: Id<"ledger_reservations">;
};

type ReserveSharesMutation = {
	_handler: (
		ctx: MutationCtx,
		args: ReserveSharesArgs,
	) => Promise<ReserveSharesResult>;
};

const reserveSharesMutation =
	reserveShares as unknown as ReserveSharesMutation;

export type CommitReservationArgs = {
	reservationId: Id<"ledger_reservations">;
	effectiveDate: string;
	idempotencyKey: string;
	source: {
		actor?: string;
		channel?: string;
		type: "cron" | "system" | "user" | "webhook";
	};
};

export type CommitReservationResult = {
	journalEntry: Doc<"ledger_journal_entries">;
};

type CommitReservationMutation = {
	_handler: (
		ctx: MutationCtx,
		args: CommitReservationArgs,
	) => Promise<CommitReservationResult>;
};

const commitReservationMutation =
	commitReservation as unknown as CommitReservationMutation;

export type VoidReservationArgs = {
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

export type VoidReservationResult = {
	journalEntry: Doc<"ledger_journal_entries">;
};

type VoidReservationMutation = {
	_handler: (
		ctx: MutationCtx,
		args: VoidReservationArgs,
	) => Promise<VoidReservationResult>;
};

const voidReservationMutation =
	voidReservation as unknown as VoidReservationMutation;

// ── Execute helpers ──────────────────────────────────────────────

export async function executeReserveShares(
	t: TestHarness,
	args: ReserveSharesArgs,
) {
	return t.run(async (ctx) => reserveSharesMutation._handler(ctx, args));
}

export async function executeCommitReservation(
	t: TestHarness,
	args: CommitReservationArgs,
) {
	return t.run(async (ctx) => commitReservationMutation._handler(ctx, args));
}

export async function executeVoidReservation(
	t: TestHarness,
	args: VoidReservationArgs,
) {
	return t.run(async (ctx) => voidReservationMutation._handler(ctx, args));
}

// ── DB lookup helpers ────────────────────────────────────────────

export async function getAccount(
	t: TestHarness,
	mortgageId: string,
	lenderId: string,
) {
	const account = await t.run(async (ctx) =>
		ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage_and_lender", (q) =>
				q.eq("mortgageId", mortgageId).eq("lenderId", lenderId),
			)
			.first(),
	);

	if (!account) {
		throw new Error(
			`Missing POSITION account for lender ${lenderId} on mortgage ${mortgageId}`,
		);
	}

	return account;
}

export async function getReservation(
	t: TestHarness,
	reservationId: Id<"ledger_reservations">,
) {
	return t.run(async (ctx) => ctx.db.get(reservationId));
}

export async function getJournalEntry(
	t: TestHarness,
	journalEntryId: Id<"ledger_journal_entries">,
) {
	return t.run(async (ctx) => ctx.db.get(journalEntryId));
}

// ── Mint + issue convenience helpers ─────────────────────────────

/** Mint a mortgage and issue all shares to a single lender. */
export async function mintAndIssue(
	auth: AuthenticatedHarness,
	mortgageId: string,
	lenderId: string,
	amount: number,
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

/**
 * Mint a mortgage and issue shares to multiple lenders.
 * Allocations are validated by the underlying mutations.
 */
export async function mintAndIssueMultiple(
	auth: AuthenticatedHarness,
	mortgageId: string,
	allocations: Array<{ lenderId: string; amount: number }>,
) {
	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});

	const results = [];
	for (const { lenderId, amount } of allocations) {
		const result = await auth.mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId,
				lenderId,
				amount,
				effectiveDate: "2026-01-01",
				idempotencyKey: `issue-${mortgageId}-${lenderId}`,
				source: SYS_SOURCE,
			},
		);
		results.push(result);
	}
	return results;
}

// ── ConvexError code extractor ───────────────────────────────────

/**
 * Extract the structured error code from a ConvexError, handling both
 * structured `{ code }` payloads and string-embedded codes.
 */
export function getConvexErrorCode(error: unknown): string {
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
					/\b(INVALID_AMOUNT|SAME_ACCOUNT|ACCOUNT_NOT_FOUND|TYPE_MISMATCH|INSUFFICIENT_BALANCE|MIN_FRACTION_VIOLATED|MORTGAGE_MISMATCH|CORRECTION_REQUIRES_ADMIN|CORRECTION_REQUIRES_CAUSED_BY|CORRECTION_REQUIRES_REASON|ALREADY_MINTED|RESERVATION_NOT_PENDING|RESERVATION_NOT_FOUND)\b/,
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
