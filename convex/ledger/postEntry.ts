import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAvailableBalance, getPostedBalance } from "./accounts";
import {
	AUDIT_ONLY_ENTRY_TYPES,
	MIN_FRACTION,
	TOTAL_SUPPLY,
} from "./constants";
import { getNextSequenceNumber } from "./sequenceCounter";
import {
	type AccountType,
	ENTRY_TYPE_ACCOUNT_MAP,
	type EntryType,
	type EventSource,
} from "./types";

// ── PostEntryInput ──────────────────────────────────────────────────
// T-001: Public interface for the postEntry pipeline

export interface PostEntryInput {
	amount: number; // v.number() — integer, converted to BigInt internally
	causedBy?: Id<"ledger_journal_entries">;
	creditAccountId: Id<"ledger_accounts">; // account GIVING units
	debitAccountId: Id<"ledger_accounts">; // account RECEIVING units
	effectiveDate: string;
	entryType: EntryType;
	idempotencyKey: string;
	metadata?: Record<string, unknown>;
	mortgageId: string;
	reason?: string;
	reservationId?: Id<"ledger_reservations">;
	source: EventSource;
}

// ── Entry types requiring same-mortgage on both accounts ────────────

const SAME_MORTGAGE_ENTRY_TYPES: ReadonlySet<EntryType> = new Set([
	"SHARES_ISSUED",
	"SHARES_TRANSFERRED",
	"SHARES_REDEEMED",
	"SHARES_RESERVED",
	"SHARES_COMMITTED",
	"SHARES_VOIDED",
]);

// ── Step 1: VALIDATE_INPUT ──────────────────────────────────────────
// T-002

function validateInput(args: PostEntryInput): void {
	if (!Number.isFinite(args.amount)) {
		throw new ConvexError({
			code: "INVALID_AMOUNT",
			message: "Amount must be a finite number (not NaN or Infinity)",
		});
	}
	if (!Number.isInteger(args.amount)) {
		throw new ConvexError({
			code: "INVALID_AMOUNT",
			message: "Amount must be a whole number (integer)",
		});
	}
	if (!Number.isSafeInteger(args.amount)) {
		throw new ConvexError({
			code: "INVALID_AMOUNT",
			message: "Amount exceeds safe integer range",
		});
	}
	if (args.amount <= 0) {
		throw new ConvexError({
			code: "INVALID_AMOUNT",
			message: "Amount must be positive",
		});
	}
	if (args.debitAccountId === args.creditAccountId) {
		throw new ConvexError({
			code: "SAME_ACCOUNT",
			message: "Debit and credit accounts must be different",
		});
	}
}

// ── Step 2: IDEMPOTENCY ─────────────────────────────────────────────
// T-003

async function checkIdempotency(
	ctx: MutationCtx,
	idempotencyKey: string
): Promise<Doc<"ledger_journal_entries"> | null> {
	return ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
		.first();
}

// ── Step 3: RESOLVE_ACCOUNTS ────────────────────────────────────────
// T-004

interface ResolvedAccounts {
	creditAccount: Doc<"ledger_accounts">;
	debitAccount: Doc<"ledger_accounts">;
}

async function resolveAccounts(
	ctx: MutationCtx,
	debitAccountId: Id<"ledger_accounts">,
	creditAccountId: Id<"ledger_accounts">
): Promise<ResolvedAccounts> {
	const debitAccount = await ctx.db.get(debitAccountId);
	if (!debitAccount) {
		throw new ConvexError({
			code: "ACCOUNT_NOT_FOUND",
			message: `Debit account ${debitAccountId} does not exist`,
			accountId: debitAccountId,
			side: "debit",
		});
	}

	const creditAccount = await ctx.db.get(creditAccountId);
	if (!creditAccount) {
		throw new ConvexError({
			code: "ACCOUNT_NOT_FOUND",
			message: `Credit account ${creditAccountId} does not exist`,
			accountId: creditAccountId,
			side: "credit",
		});
	}

	return { debitAccount, creditAccount };
}

// ── Mortgage match helpers ──────────────────────────────────────────
// Extracted from typeCheck to stay below cognitive complexity threshold.

/** Throws MORTGAGE_MISMATCH if accountMortgageId !== expectedMortgageId. */
function assertAccountMortgage(
	accountMortgageId: string | undefined,
	expectedMortgageId: string,
	side: "debit" | "credit"
): void {
	if (accountMortgageId !== expectedMortgageId) {
		throw new ConvexError({
			code: "MORTGAGE_MISMATCH",
			message: `args.mortgageId (${expectedMortgageId}) does not match ${side} account mortgageId (${accountMortgageId})`,
			argsMortgageId: expectedMortgageId,
			accountMortgageId,
			side,
		});
	}
}

/** Verify args.mortgageId matches the relevant account mortgageIds by entry type. */
function checkArgsMortgageMatch(
	args: PostEntryInput,
	debitAccount: Doc<"ledger_accounts">,
	creditAccount: Doc<"ledger_accounts">
): void {
	if (SAME_MORTGAGE_ENTRY_TYPES.has(args.entryType)) {
		// Share-level types: both accounts must match args.mortgageId
		assertAccountMortgage(debitAccount.mortgageId, args.mortgageId, "debit");
		assertAccountMortgage(creditAccount.mortgageId, args.mortgageId, "credit");
		return;
	}

	if (args.entryType === "MORTGAGE_MINTED") {
		// Debit account (TREASURY) must match; credit (WORLD) has no mortgageId
		assertAccountMortgage(debitAccount.mortgageId, args.mortgageId, "debit");
		return;
	}

	if (args.entryType === "MORTGAGE_BURNED") {
		// Credit account (TREASURY) must match; debit (WORLD) has no mortgageId
		assertAccountMortgage(creditAccount.mortgageId, args.mortgageId, "credit");
		return;
	}

	if (args.entryType === "CORRECTION") {
		// If an account has mortgageId, it must match args.mortgageId
		if (debitAccount.mortgageId) {
			assertAccountMortgage(debitAccount.mortgageId, args.mortgageId, "debit");
		}
		if (creditAccount.mortgageId) {
			assertAccountMortgage(
				creditAccount.mortgageId,
				args.mortgageId,
				"credit"
			);
		}
	}
}

/** Verify accounts match each other's mortgageId where required. */
function checkAccountMortgageMatch(
	args: PostEntryInput,
	debitAccount: Doc<"ledger_accounts">,
	creditAccount: Doc<"ledger_accounts">
): void {
	// Same-mortgage enforcement for share-level entry types
	if (
		SAME_MORTGAGE_ENTRY_TYPES.has(args.entryType) &&
		debitAccount.mortgageId !== creditAccount.mortgageId
	) {
		throw new ConvexError({
			code: "MORTGAGE_MISMATCH",
			message: `${args.entryType} requires both accounts on the same mortgage`,
			entryType: args.entryType,
			debitMortgageId: debitAccount.mortgageId,
			creditMortgageId: creditAccount.mortgageId,
		});
	}

	// CORRECTION: if both accounts have mortgageId, they must match each other
	if (
		args.entryType === "CORRECTION" &&
		debitAccount.mortgageId &&
		creditAccount.mortgageId &&
		debitAccount.mortgageId !== creditAccount.mortgageId
	) {
		throw new ConvexError({
			code: "MORTGAGE_MISMATCH",
			message: "CORRECTION cannot move units between different mortgages",
			entryType: "CORRECTION",
			debitMortgageId: debitAccount.mortgageId,
			creditMortgageId: creditAccount.mortgageId,
		});
	}
}

// ── Step 4: TYPE_CHECK ──────────────────────────────────────────────
// T-005

function typeCheck(
	args: PostEntryInput,
	debitAccount: Doc<"ledger_accounts">,
	creditAccount: Doc<"ledger_accounts">
): void {
	const constraint = ENTRY_TYPE_ACCOUNT_MAP[args.entryType];

	if (!constraint.debit.includes(debitAccount.type as AccountType)) {
		throw new ConvexError({
			code: "TYPE_MISMATCH",
			message: `Entry type ${args.entryType} requires debit account type in [${constraint.debit.join(", ")}], got ${debitAccount.type}`,
			entryType: args.entryType,
			side: "debit",
			expected: [...constraint.debit],
			actual: debitAccount.type,
		});
	}

	if (!constraint.credit.includes(creditAccount.type as AccountType)) {
		throw new ConvexError({
			code: "TYPE_MISMATCH",
			message: `Entry type ${args.entryType} requires credit account type in [${constraint.credit.join(", ")}], got ${creditAccount.type}`,
			entryType: args.entryType,
			side: "credit",
			expected: [...constraint.credit],
			actual: creditAccount.type,
		});
	}

	// Mortgage matching: accounts must match each other and args.mortgageId
	checkAccountMortgageMatch(args, debitAccount, creditAccount);
	checkArgsMortgageMatch(args, debitAccount, creditAccount);

	// CORRECTION structural preconditions — must fire before balanceCheck (Step 5).
	// Ordered: admin first, then causedBy, then reason.
	if (args.entryType === "CORRECTION") {
		if (args.source.type !== "user") {
			throw new ConvexError({
				code: "CORRECTION_REQUIRES_ADMIN",
				message: "CORRECTION requires source.type = 'user'",
			});
		}
		if (!args.source.actor) {
			throw new ConvexError({
				code: "CORRECTION_REQUIRES_ADMIN",
				message: "CORRECTION requires source.actor (admin identity)",
			});
		}
		if (!args.causedBy) {
			throw new ConvexError({
				code: "CORRECTION_REQUIRES_CAUSED_BY",
				message: "CORRECTION requires causedBy reference to existing entry",
			});
		}
		if (!args.reason) {
			throw new ConvexError({
				code: "CORRECTION_REQUIRES_REASON",
				message: "CORRECTION requires a reason",
			});
		}
	}
}

// ── Step 5: BALANCE_CHECK ───────────────────────────────────────────
// T-006

function balanceCheck(
	args: PostEntryInput,
	creditAccount: Doc<"ledger_accounts">
): void {
	// WORLD is exempt — can go negative
	if (creditAccount.type === "WORLD") {
		return;
	}

	// AUDIT_ONLY types don't move posted balance
	if (AUDIT_ONLY_ENTRY_TYPES.has(args.entryType)) {
		return;
	}

	const available = getAvailableBalance(creditAccount);
	const amountBigInt = BigInt(args.amount);

	if (available < amountBigInt) {
		throw new ConvexError({
			code: "INSUFFICIENT_BALANCE",
			message: `Credit account available balance ${available} < amount ${amountBigInt}`,
			availableBalance: Number(available),
			requestedAmount: args.amount,
			creditAccountId: creditAccount._id,
		});
	}
}

// ── Min position helper (REQ-84) ────────────────────────────────────

function checkMinPosition(resultingBalance: bigint, label: string): void {
	if (resultingBalance !== 0n && resultingBalance < MIN_FRACTION) {
		throw new ConvexError({
			code: "MIN_FRACTION_VIOLATED",
			message: `${label} balance ${resultingBalance} violates minimum (must be 0 or >= ${MIN_FRACTION})`,
			label,
			resultingBalance: Number(resultingBalance),
			minimum: Number(MIN_FRACTION),
		});
	}
}

// ── Step 6: CONSTRAINT_CHECK ────────────────────────────────────────
// T-007: Strategy map of entry-type-specific constraints

interface ConstraintContext {
	amountBigInt: bigint;
	args: PostEntryInput;
	creditAccount: Doc<"ledger_accounts">;
	debitAccount: Doc<"ledger_accounts">;
}

type ConstraintChecker = (ctx: ConstraintContext) => void;

function constraintMortgageMinted(ctx: ConstraintContext): void {
	if (ctx.amountBigInt !== TOTAL_SUPPLY) {
		throw new ConvexError({
			code: "INVALID_MINT_AMOUNT",
			message: `MORTGAGE_MINTED must be exactly ${TOTAL_SUPPLY} units, got ${ctx.amountBigInt}`,
			expected: Number(TOTAL_SUPPLY),
			actual: ctx.args.amount,
		});
	}
}

function constraintMortgageBurned(ctx: ConstraintContext): void {
	if (ctx.amountBigInt !== TOTAL_SUPPLY) {
		throw new ConvexError({
			code: "INVALID_BURN_AMOUNT",
			message: `MORTGAGE_BURNED must be exactly ${TOTAL_SUPPLY} units, got ${ctx.amountBigInt}`,
			expected: Number(TOTAL_SUPPLY),
			actual: ctx.args.amount,
		});
	}
	const treasuryBalance = getPostedBalance(ctx.creditAccount);
	if (treasuryBalance !== TOTAL_SUPPLY) {
		throw new ConvexError({
			code: "TREASURY_NOT_FULL",
			message: `TREASURY balance must be exactly ${TOTAL_SUPPLY} to burn, got ${treasuryBalance}`,
			expected: Number(TOTAL_SUPPLY),
			actual: Number(treasuryBalance),
		});
	}
}

function constraintSharesIssued(ctx: ConstraintContext): void {
	// Min position on debit (POSITION) after
	const debitAfter = getPostedBalance(ctx.debitAccount) + ctx.amountBigInt;
	checkMinPosition(debitAfter, "Position post-issuance");
}

function constraintSharesTransferred(ctx: ConstraintContext): void {
	// Min position on credit (seller) after — using available balance to account for pending reservations
	const creditAfter = getAvailableBalance(ctx.creditAccount) - ctx.amountBigInt;
	checkMinPosition(creditAfter, "Seller post-transfer");

	// Min position on debit (buyer) after
	const debitAfter = getPostedBalance(ctx.debitAccount) + ctx.amountBigInt;
	checkMinPosition(debitAfter, "Buyer post-transfer");
}

function constraintSharesRedeemed(ctx: ConstraintContext): void {
	// Min position on credit (POSITION) after
	const creditAfter = getPostedBalance(ctx.creditAccount) - ctx.amountBigInt;
	checkMinPosition(creditAfter, "Position post-redemption");
}

function constraintSharesReserved(ctx: ConstraintContext): void {
	// Check insufficient balance explicitly before min position check
	const sellerAvailable = getAvailableBalance(ctx.creditAccount);
	if (sellerAvailable < ctx.amountBigInt) {
		throw new ConvexError({
			code: "INSUFFICIENT_BALANCE",
			message: `Seller available balance ${sellerAvailable} < reservation amount ${ctx.amountBigInt}`,
			availableBalance: Number(sellerAvailable),
			requestedAmount: ctx.args.amount,
			creditAccountId: ctx.creditAccount._id,
		});
	}
	const sellerAfter = sellerAvailable - ctx.amountBigInt;
	checkMinPosition(sellerAfter, "Seller post-reservation");

	// Min position on debit (buyer) after
	const buyerBalance = getPostedBalance(ctx.debitAccount);
	const buyerAfter = buyerBalance + ctx.amountBigInt;
	checkMinPosition(buyerAfter, "Buyer post-reservation");
}

function constraintSharesCommitted(_ctx: ConstraintContext): void {
	// No additional constraints — reservation already validated
}

function constraintSharesVoided(_ctx: ConstraintContext): void {
	// No additional constraints
}

function constraintCorrection(ctx: ConstraintContext): void {
	// Admin, causedBy, and reason checks are in typeCheck (Step 4)
	// to ensure they fire before balanceCheck (Step 5).
	// Only min-position constraints remain here.

	// Min position on affected POSITIONs
	if (ctx.debitAccount.type === "POSITION") {
		const debitAfter = getPostedBalance(ctx.debitAccount) + ctx.amountBigInt;
		checkMinPosition(debitAfter, "Corrected debit position");
	}
	if (ctx.creditAccount.type === "POSITION") {
		const creditAfter = getPostedBalance(ctx.creditAccount) - ctx.amountBigInt;
		checkMinPosition(creditAfter, "Corrected credit position");
	}
}

const CONSTRAINT_STRATEGIES: Record<EntryType, ConstraintChecker> = {
	MORTGAGE_MINTED: constraintMortgageMinted,
	SHARES_ISSUED: constraintSharesIssued,
	SHARES_TRANSFERRED: constraintSharesTransferred,
	SHARES_REDEEMED: constraintSharesRedeemed,
	MORTGAGE_BURNED: constraintMortgageBurned,
	SHARES_RESERVED: constraintSharesReserved,
	SHARES_COMMITTED: constraintSharesCommitted,
	SHARES_VOIDED: constraintSharesVoided,
	CORRECTION: constraintCorrection,
};

function constraintCheck(
	args: PostEntryInput,
	debitAccount: Doc<"ledger_accounts">,
	creditAccount: Doc<"ledger_accounts">
): void {
	const amountBigInt = BigInt(args.amount);
	CONSTRAINT_STRATEGIES[args.entryType]({
		args,
		amountBigInt,
		debitAccount,
		creditAccount,
	});
}

// ── Step 8: PERSIST ─────────────────────────────────────────────────
// T-008

async function persist(
	ctx: MutationCtx,
	args: PostEntryInput,
	debitAccount: Doc<"ledger_accounts">,
	creditAccount: Doc<"ledger_accounts">,
	sequenceNumber: bigint
): Promise<Doc<"ledger_journal_entries">> {
	const amountBigInt = BigInt(args.amount);

	// Skip cumulative updates for AUDIT_ONLY types
	if (!AUDIT_ONLY_ENTRY_TYPES.has(args.entryType)) {
		await ctx.db.patch(args.debitAccountId, {
			cumulativeDebits: debitAccount.cumulativeDebits + amountBigInt,
		});
		await ctx.db.patch(args.creditAccountId, {
			cumulativeCredits: creditAccount.cumulativeCredits + amountBigInt,
		});
	}

	// Insert journal entry with all fields
	const entryId = await ctx.db.insert("ledger_journal_entries", {
		sequenceNumber,
		entryType: args.entryType,
		mortgageId: args.mortgageId,
		effectiveDate: args.effectiveDate,
		timestamp: Date.now(),
		debitAccountId: args.debitAccountId,
		creditAccountId: args.creditAccountId,
		amount: args.amount,
		idempotencyKey: args.idempotencyKey,
		causedBy: args.causedBy,
		source: args.source,
		reason: args.reason,
		reservationId: args.reservationId,
		metadata: args.metadata,
	});

	const entry = await ctx.db.get(entryId);
	if (!entry) {
		throw new ConvexError({
			code: "PERSIST_FAILED",
			message: "Failed to read back journal entry after insert",
		});
	}
	return entry;
}

// ── Step 9: NUDGE ───────────────────────────────────────────────────
// T-009

async function nudge(_ctx: MutationCtx): Promise<void> {
	// No-op: cursor consumers not built yet.
	// When implemented, this will call:
	// ctx.scheduler.runAfter(0, internal.ledger.cursors.nudgeConsumers, { sequenceNumber })
}

// ── Main Pipeline ───────────────────────────────────────────────────
// T-010: Wire all 9 steps together

/**
 * The 9-step postEntry pipeline — the **only code path** for modifying
 * accounts or inserting journal entries.
 *
 * This is a plain async function (NOT a Convex mutation) called from
 * within mutations.
 *
 * Convention (D-7): debitAccountId = account RECEIVING units,
 *                   creditAccountId = account GIVING units.
 */
export async function postEntry(
	ctx: MutationCtx,
	args: PostEntryInput
): Promise<Doc<"ledger_journal_entries">> {
	// 1. VALIDATE_INPUT
	validateInput(args);

	// 2. IDEMPOTENCY
	const existing = await checkIdempotency(ctx, args.idempotencyKey);
	if (existing) {
		return existing;
	}

	// 3. RESOLVE_ACCOUNTS
	const { debitAccount, creditAccount } = await resolveAccounts(
		ctx,
		args.debitAccountId,
		args.creditAccountId
	);

	// 4. TYPE_CHECK
	typeCheck(args, debitAccount, creditAccount);

	// 5. BALANCE_CHECK
	balanceCheck(args, creditAccount);

	// 6. CONSTRAINT_CHECK
	constraintCheck(args, debitAccount, creditAccount);

	// 7. SEQUENCE
	const sequenceNumber = await getNextSequenceNumber(ctx);

	// 8. PERSIST
	const entry = await persist(
		ctx,
		args,
		debitAccount,
		creditAccount,
		sequenceNumber
	);

	// 9. NUDGE
	await nudge(ctx);

	return entry;
}
