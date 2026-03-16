import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ledgerMutation } from "../fluent";
import {
	getOrCreatePositionAccount,
	getPositionAccount,
	getPostedBalance,
	getTreasuryAccount,
	getWorldAccount,
	initializeWorldAccount,
} from "./accounts";
import { MIN_FRACTION, TOTAL_SUPPLY } from "./constants";
import { getNextSequenceNumber } from "./sequenceCounter";
import type { AccountType, EntryType, EventSource } from "./types";
import {
	burnMortgageArgsValidator,
	issueSharesArgsValidator,
	mintMortgageArgsValidator,
	postEntryArgsValidator,
	redeemSharesArgsValidator,
	transferSharesArgsValidator,
} from "./validators";

// ── Types ─────────────────────────────────────────────────────────

interface PostEntryInput {
	amount: number;
	causedBy?: Id<"ledger_journal_entries">;
	creditAccountId: Id<"ledger_accounts">;
	debitAccountId: Id<"ledger_accounts">;
	effectiveDate: string;
	entryType: EntryType;
	idempotencyKey: string;
	metadata?: Record<string, unknown>;
	mortgageId: string;
	reason?: string;
	source: EventSource;
}

// ── Internal postEntry logic ──────────────────────────────────────
// Convention (D-7): debitAccountId = account RECEIVING units,
//                   creditAccountId = account GIVING units.
// FROM→TO notation: FROM gives (credit), TO receives (debit).

async function postEntryInternal(
	ctx: MutationCtx,
	args: PostEntryInput
): Promise<Doc<"ledger_journal_entries">> {
	// 1. Idempotency check
	const existing = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_idempotency", (q) =>
			q.eq("idempotencyKey", args.idempotencyKey)
		)
		.first();
	if (existing) {
		return existing;
	}

	// 2. Load both accounts — throw if missing
	const debitAccount = await ctx.db.get(args.debitAccountId);
	if (!debitAccount) {
		throw new Error(`Debit account ${args.debitAccountId} does not exist`);
	}

	const creditAccount = await ctx.db.get(args.creditAccountId);
	if (!creditAccount) {
		throw new Error(`Credit account ${args.creditAccountId} does not exist`);
	}

	// 3. Common validation
	if (!Number.isFinite(args.amount)) {
		throw new Error("Amount must be a finite number (not NaN or Infinity)");
	}
	if (!Number.isInteger(args.amount)) {
		throw new Error("Amount must be a whole number (integer)");
	}
	if (!Number.isSafeInteger(args.amount)) {
		throw new Error("Amount exceeds safe integer range");
	}
	if (args.amount <= 0) {
		throw new Error("Amount must be positive");
	}
	const amountBigInt = BigInt(args.amount);
	if (args.debitAccountId === args.creditAccountId) {
		throw new Error("Debit and credit accounts must be different");
	}

	// 4. Per-entry-type validation
	validateEntryType(args, debitAccount, creditAccount);

	// 5. Write entry
	const seqNum = await getNextSequenceNumber(ctx);
	const entryId = await ctx.db.insert("ledger_journal_entries", {
		sequenceNumber: seqNum,
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
		metadata: args.metadata,
	});

	// 6. Update cumulative balances atomically with the entry
	await ctx.db.patch(args.debitAccountId, {
		cumulativeDebits: debitAccount.cumulativeDebits + amountBigInt,
	});
	await ctx.db.patch(args.creditAccountId, {
		cumulativeCredits: creditAccount.cumulativeCredits + amountBigInt,
	});

	const entry = await ctx.db.get(entryId);
	if (!entry) {
		throw new Error("Failed to read back journal entry");
	}
	return entry;
}

// ── Validation helpers ────────────────────────────────────────────

function assertAccountType(
	account: Doc<"ledger_accounts">,
	expected: AccountType,
	label: string
) {
	if (account.type !== expected) {
		throw new Error(`${label} must be ${expected}, got ${account.type}`);
	}
}

function assertMortgageMatch(
	account: Doc<"ledger_accounts">,
	mortgageId: string,
	label: string
) {
	if (account.mortgageId !== mortgageId) {
		throw new Error(
			`${label} mortgage mismatch: expected ${mortgageId}, got ${account.mortgageId}`
		);
	}
}

function checkMinPosition(balance: bigint, label: string) {
	if (balance !== 0n && balance < MIN_FRACTION) {
		throw new Error(
			`${label} balance ${balance} violates minimum position (must be 0 or >= ${MIN_FRACTION})`
		);
	}
}

interface ValidationContext {
	/** Pre-converted BigInt of args.amount for bigint arithmetic with cumulative fields */
	amountBigInt: bigint;
	args: PostEntryInput;
	creditAccount: Doc<"ledger_accounts">;
	creditBalance: bigint;
	debitAccount: Doc<"ledger_accounts">;
	debitBalance: bigint;
}

function validateMortgageMinted(v: ValidationContext) {
	assertAccountType(v.debitAccount, "TREASURY", "Receiving account");
	assertAccountType(v.creditAccount, "WORLD", "Source account");
	if (v.amountBigInt !== TOTAL_SUPPLY) {
		throw new Error(
			`MORTGAGE_MINTED must be exactly ${TOTAL_SUPPLY} units, got ${v.amountBigInt}`
		);
	}
}

function validateSharesIssued(v: ValidationContext) {
	assertAccountType(v.debitAccount, "POSITION", "Receiving position");
	assertAccountType(v.creditAccount, "TREASURY", "Issuing treasury");
	assertMortgageMatch(v.debitAccount, v.args.mortgageId, "Position");
	assertMortgageMatch(v.creditAccount, v.args.mortgageId, "Treasury");
	if (v.creditBalance < v.amountBigInt) {
		throw new Error(
			`Treasury balance ${v.creditBalance} < issuance amount ${v.amountBigInt}`
		);
	}
	checkMinPosition(v.debitBalance + v.amountBigInt, "Position post-issuance");
}

function validateSharesTransferred(v: ValidationContext) {
	assertAccountType(v.debitAccount, "POSITION", "Buyer account");
	assertAccountType(v.creditAccount, "POSITION", "Seller account");
	assertMortgageMatch(v.debitAccount, v.args.mortgageId, "Buyer position");
	assertMortgageMatch(v.creditAccount, v.args.mortgageId, "Seller position");
	if (v.creditBalance < v.amountBigInt) {
		throw new Error(
			`Seller balance ${v.creditBalance} < transfer amount ${v.amountBigInt}`
		);
	}
	checkMinPosition(v.creditBalance - v.amountBigInt, "Seller post-transfer");
	checkMinPosition(v.debitBalance + v.amountBigInt, "Buyer post-transfer");
}

function validateSharesRedeemed(v: ValidationContext) {
	assertAccountType(v.debitAccount, "TREASURY", "Receiving treasury");
	assertAccountType(v.creditAccount, "POSITION", "Redeeming position");
	assertMortgageMatch(v.debitAccount, v.args.mortgageId, "Treasury");
	assertMortgageMatch(v.creditAccount, v.args.mortgageId, "Position");
	if (v.creditBalance < v.amountBigInt) {
		throw new Error(
			`Position balance ${v.creditBalance} < redemption amount ${v.amountBigInt}`
		);
	}
	checkMinPosition(
		v.creditBalance - v.amountBigInt,
		"Position post-redemption"
	);
}

function validateMortgageBurned(v: ValidationContext) {
	assertAccountType(v.debitAccount, "WORLD", "Receiving account");
	assertAccountType(v.creditAccount, "TREASURY", "Burning treasury");
	if (v.amountBigInt !== TOTAL_SUPPLY) {
		throw new Error(
			`MORTGAGE_BURNED must be exactly ${TOTAL_SUPPLY} units, got ${v.amountBigInt}`
		);
	}
	if (v.creditBalance !== TOTAL_SUPPLY) {
		throw new Error(
			`TREASURY balance must be exactly ${TOTAL_SUPPLY} to burn, got ${v.creditBalance}`
		);
	}
}

function validateCorrection(v: ValidationContext) {
	if (v.args.source.type !== "user") {
		throw new Error("CORRECTION requires source.type = 'user'");
	}
	if (!v.args.source.actor) {
		throw new Error("CORRECTION requires source.actor (admin identity)");
	}
	if (!v.args.causedBy) {
		throw new Error("CORRECTION requires causedBy reference to existing entry");
	}
	if (!v.args.reason) {
		throw new Error("CORRECTION requires a reason");
	}
	// Enforce same-mortgage when both accounts belong to a mortgage
	if (
		v.debitAccount.mortgageId &&
		v.creditAccount.mortgageId &&
		v.debitAccount.mortgageId !== v.creditAccount.mortgageId
	) {
		throw new Error("CORRECTION cannot move units between different mortgages");
	}
	if (v.debitAccount.type === "POSITION") {
		checkMinPosition(
			v.debitBalance + v.amountBigInt,
			"Corrected debit position"
		);
	}
	if (v.creditAccount.type === "POSITION") {
		if (v.creditBalance < v.amountBigInt) {
			throw new Error(
				`CORRECTION would make position balance negative: ${v.creditBalance} - ${v.amountBigInt}`
			);
		}
		checkMinPosition(
			v.creditBalance - v.amountBigInt,
			"Corrected credit position"
		);
	}
	if (
		v.creditAccount.type === "TREASURY" &&
		v.creditBalance - v.amountBigInt < 0n
	) {
		throw new Error("CORRECTION would make TREASURY balance negative");
	}
}

// Reservation entry types must go through dedicated mutations, not postEntry.
function rejectReservationViaPostEntry(entryType: string) {
	return (_v: ValidationContext) => {
		throw new Error(
			`${entryType} cannot be posted via postEntry. Use the dedicated reserveShares/commitReservation/voidReservation mutations.`
		);
	};
}

const VALIDATORS: Record<EntryType, (v: ValidationContext) => void> = {
	MORTGAGE_MINTED: validateMortgageMinted,
	SHARES_ISSUED: validateSharesIssued,
	SHARES_TRANSFERRED: validateSharesTransferred,
	SHARES_REDEEMED: validateSharesRedeemed,
	MORTGAGE_BURNED: validateMortgageBurned,
	SHARES_RESERVED: rejectReservationViaPostEntry("SHARES_RESERVED"),
	SHARES_COMMITTED: rejectReservationViaPostEntry("SHARES_COMMITTED"),
	SHARES_VOIDED: rejectReservationViaPostEntry("SHARES_VOIDED"),
	CORRECTION: validateCorrection,
};

function validateEntryType(
	args: PostEntryInput,
	debitAccount: Doc<"ledger_accounts">,
	creditAccount: Doc<"ledger_accounts">
) {
	const ctx: ValidationContext = {
		args,
		amountBigInt: BigInt(args.amount),
		debitAccount,
		creditAccount,
		debitBalance: getPostedBalance(debitAccount),
		creditBalance: getPostedBalance(creditAccount),
	};
	VALIDATORS[args.entryType](ctx);
}

// ── Tier 1: Strict Primitives ─────────────────────────────────────

export const postEntry = ledgerMutation
	.input(postEntryArgsValidator)
	.handler(async (ctx, args) => {
		return postEntryInternal(ctx, args);
	})
	.public();

export const mintMortgage = ledgerMutation
	.input(mintMortgageArgsValidator)
	.handler(async (ctx, args) => {
		// Idempotency: check if this exact request already succeeded
		const existingEntry = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();
		if (existingEntry) {
			const treasury = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
				)
				.first();
			if (!treasury) {
				throw new Error(
					`Idempotent mint replay: TREASURY for ${args.mortgageId} not found`
				);
			}
			return { treasuryAccountId: treasury._id, journalEntry: existingEntry };
		}

		// Prevent double-mint
		const existingTreasury = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
			)
			.first();
		if (existingTreasury) {
			throw new Error(
				`Mortgage ${args.mortgageId} already minted (TREASURY exists)`
			);
		}

		const worldAccount = await initializeWorldAccount(ctx);

		// Create TREASURY account
		const treasuryId = await ctx.db.insert("ledger_accounts", {
			type: "TREASURY",
			mortgageId: args.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: Date.now(),
		});

		// MORTGAGE_MINTED: WORLD gives → TREASURY receives
		const journalEntry = await postEntryInternal(ctx, {
			entryType: "MORTGAGE_MINTED",
			mortgageId: args.mortgageId,
			debitAccountId: treasuryId,
			creditAccountId: worldAccount._id,
			amount: Number(TOTAL_SUPPLY),
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			metadata: args.metadata,
		});

		return { treasuryAccountId: treasuryId, journalEntry };
	})
	.public();

export const burnMortgage = ledgerMutation
	.input(burnMortgageArgsValidator)
	.handler(async (ctx, args) => {
		// Idempotency: check if this exact request already succeeded
		const existingEntry = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();
		if (existingEntry) {
			return existingEntry;
		}

		const treasury = await getTreasuryAccount(ctx, args.mortgageId);
		if (!treasury) {
			throw new Error(
				`No TREASURY account for mortgage ${args.mortgageId}. Mint first.`
			);
		}
		const treasuryBalance = getPostedBalance(treasury);

		if (treasuryBalance !== TOTAL_SUPPLY) {
			throw new Error(
				`Cannot burn: TREASURY balance is ${treasuryBalance}, must be ${TOTAL_SUPPLY}`
			);
		}

		// Verify no non-zero POSITION accounts
		const positions = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
		for (const pos of positions) {
			if (pos.type === "POSITION" && getPostedBalance(pos) !== 0n) {
				throw new Error(
					`Cannot burn: POSITION ${pos._id} (lender ${pos.lenderId}) has non-zero balance`
				);
			}
		}

		const worldAccount = await getWorldAccount(ctx);

		// MORTGAGE_BURNED: TREASURY gives → WORLD receives
		return postEntryInternal(ctx, {
			entryType: "MORTGAGE_BURNED",
			mortgageId: args.mortgageId,
			debitAccountId: worldAccount._id,
			creditAccountId: treasury._id,
			amount: Number(TOTAL_SUPPLY),
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			reason: args.reason,
			metadata: args.metadata,
		});
	})
	.public();

// ── Tier 2: Convenience Mutations ─────────────────────────────────

export const issueShares = ledgerMutation
	.input(issueSharesArgsValidator)
	.handler(async (ctx, args) => {
		const treasury = await getTreasuryAccount(ctx, args.mortgageId);
		if (!treasury) {
			throw new Error(
				`No TREASURY account for mortgage ${args.mortgageId}. Mint first.`
			);
		}
		const position = await getOrCreatePositionAccount(
			ctx,
			args.mortgageId,
			args.lenderId
		);

		// SHARES_ISSUED: TREASURY gives → POSITION receives
		const journalEntry = await postEntryInternal(ctx, {
			entryType: "SHARES_ISSUED",
			mortgageId: args.mortgageId,
			debitAccountId: position._id,
			creditAccountId: treasury._id,
			amount: args.amount,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			metadata: args.metadata,
		});

		return { positionAccountId: position._id, journalEntry };
	})
	.public();

export const transferShares = ledgerMutation
	.input(transferSharesArgsValidator)
	.handler(async (ctx, args) => {
		const sellerPosition = await getPositionAccount(
			ctx,
			args.mortgageId,
			args.sellerLenderId
		);
		const buyerPosition = await getOrCreatePositionAccount(
			ctx,
			args.mortgageId,
			args.buyerLenderId
		);

		// SHARES_TRANSFERRED: seller gives → buyer receives
		const journalEntry = await postEntryInternal(ctx, {
			entryType: "SHARES_TRANSFERRED",
			mortgageId: args.mortgageId,
			debitAccountId: buyerPosition._id,
			creditAccountId: sellerPosition._id,
			amount: args.amount,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			metadata: args.metadata,
		});

		return { buyerAccountId: buyerPosition._id, journalEntry };
	})
	.public();

export const redeemShares = ledgerMutation
	.input(redeemSharesArgsValidator)
	.handler(async (ctx, args) => {
		const position = await getPositionAccount(
			ctx,
			args.mortgageId,
			args.lenderId
		);
		const treasury = await getTreasuryAccount(ctx, args.mortgageId);
		if (!treasury) {
			throw new Error(
				`No TREASURY account for mortgage ${args.mortgageId}. Mint first.`
			);
		}

		// SHARES_REDEEMED: POSITION gives → TREASURY receives
		return postEntryInternal(ctx, {
			entryType: "SHARES_REDEEMED",
			mortgageId: args.mortgageId,
			debitAccountId: treasury._id,
			creditAccountId: position._id,
			amount: args.amount,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			reason: args.reason,
			metadata: args.metadata,
		});
	})
	.public();
