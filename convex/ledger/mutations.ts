import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { adminMutation, ledgerMutation } from "../fluent";
import {
	getOrCreatePositionAccount,
	getPositionAccount,
	getPostedBalance,
	getTreasuryAccount,
	getWorldAccount,
	initializeWorldAccount,
} from "./accounts";
import { MIN_FRACTION, TOTAL_SUPPLY } from "./constants";
import { postEntry } from "./postEntry";
import type { EventSource } from "./types";
import {
	burnMortgageArgsValidator,
	commitReservationArgsValidator,
	issueSharesArgsValidator,
	mintAndIssueArgsValidator,
	mintMortgageArgsValidator,
	mintMortgageWithAllocationsArgsValidator,
	postEntryArgsValidator,
	redeemSharesArgsValidator,
	reserveSharesArgsValidator,
	transferSharesArgsValidator,
	voidReservationArgsValidator,
} from "./validators";

// ── Tier 1: Strict Primitives ─────────────────────────────────────

export const postEntryDirect = internalMutation({
	args: postEntryArgsValidator,
	handler: async (ctx, args) => {
		return postEntry(ctx, args);
	},
});

export const mintMortgage = adminMutation
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
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent mint replay: TREASURY for ${args.mortgageId} not found`,
				});
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
			throw new ConvexError({
				code: "ALREADY_MINTED" as const,
				message: `Mortgage ${args.mortgageId} already minted (TREASURY exists)`,
			});
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
		const journalEntry = await postEntry(ctx, {
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

export const burnMortgage = adminMutation
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
			throw new ConvexError({
				code: "TREASURY_NOT_FOUND" as const,
				message: `No TREASURY account for mortgage ${args.mortgageId}. Mint first.`,
			});
		}
		const treasuryBalance = getPostedBalance(treasury);

		if (treasuryBalance !== TOTAL_SUPPLY) {
			throw new ConvexError({
				code: "TREASURY_NOT_FULL" as const,
				message: `Cannot burn: TREASURY balance is ${treasuryBalance}, must be ${TOTAL_SUPPLY}`,
			});
		}

		// Verify no non-zero POSITION accounts
		const positions = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
		for (const pos of positions) {
			if (pos.type === "POSITION" && getPostedBalance(pos) !== 0n) {
				throw new ConvexError({
					code: "POSITIONS_NOT_ZERO" as const,
					message: `Cannot burn: POSITION ${pos._id} (lender ${pos.lenderId}) has non-zero balance`,
				});
			}
		}

		const worldAccount = await getWorldAccount(ctx);

		// MORTGAGE_BURNED: TREASURY gives → WORLD receives
		return postEntry(ctx, {
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

// ── Tier 2: Convenience Mutation Handlers ────────────────────────
// Exported as plain functions so wrappers can reuse the logic
// without duplicating it.

interface IssueSharesArgs {
	amount: number;
	effectiveDate: string;
	idempotencyKey: string;
	lenderId: string;
	metadata?: Record<string, unknown>;
	mortgageId: string;
	source: EventSource;
}

export async function issueSharesHandler(
	ctx: MutationCtx,
	args: IssueSharesArgs
) {
	const treasury = await getTreasuryAccount(ctx, args.mortgageId);
	if (!treasury) {
		throw new ConvexError({
			code: "TREASURY_NOT_FOUND" as const,
			message: `No TREASURY account for mortgage ${args.mortgageId}. Mint first.`,
		});
	}
	const position = await getOrCreatePositionAccount(
		ctx,
		args.mortgageId,
		args.lenderId
	);

	// SHARES_ISSUED: TREASURY gives → POSITION receives
	const journalEntry = await postEntry(ctx, {
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
}

interface TransferSharesArgs {
	amount: number;
	buyerLenderId: string;
	effectiveDate: string;
	idempotencyKey: string;
	metadata?: Record<string, unknown>;
	mortgageId: string;
	sellerLenderId: string;
	source: EventSource;
}

export async function transferSharesHandler(
	ctx: MutationCtx,
	args: TransferSharesArgs
) {
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

	// Belt-and-suspenders: explicit same-mortgage check
	if (sellerPosition.mortgageId !== buyerPosition.mortgageId) {
		throw new ConvexError({
			code: "MORTGAGE_MISMATCH" as const,
			message: "Cannot transfer shares between different mortgages",
			sellerMortgageId: sellerPosition.mortgageId,
			buyerMortgageId: buyerPosition.mortgageId,
		});
	}

	// SHARES_TRANSFERRED: seller gives → buyer receives
	const journalEntry = await postEntry(ctx, {
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
}

interface RedeemSharesArgs {
	amount: number;
	effectiveDate: string;
	idempotencyKey: string;
	lenderId: string;
	metadata?: Record<string, unknown>;
	mortgageId: string;
	reason?: string;
	source: EventSource;
}

export async function redeemSharesHandler(
	ctx: MutationCtx,
	args: RedeemSharesArgs
) {
	const position = await getPositionAccount(
		ctx,
		args.mortgageId,
		args.lenderId
	);
	const treasury = await getTreasuryAccount(ctx, args.mortgageId);
	if (!treasury) {
		throw new ConvexError({
			code: "TREASURY_NOT_FOUND" as const,
			message: `No TREASURY account for mortgage ${args.mortgageId}. Mint first.`,
		});
	}

	// SHARES_REDEEMED: POSITION gives → TREASURY receives
	return postEntry(ctx, {
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
}

// ── Tier 2: Fluent Public Mutation Wrappers ──────────────────────

export const mintAndIssue = ledgerMutation
	.input(mintAndIssueArgsValidator)
	.handler(async (ctx, args) => {
		// ── Pre-validation: allocations sum must equal TOTAL_SUPPLY ──
		const totalAllocated = args.allocations.reduce(
			(sum, a) => sum + BigInt(a.amount),
			0n
		);
		if (totalAllocated !== TOTAL_SUPPLY) {
			throw new ConvexError({
				code: "ALLOCATIONS_SUM_MISMATCH" as const,
				message: `Allocations sum to ${totalAllocated}, must equal ${TOTAL_SUPPLY}`,
			});
		}

		// ── Pre-validation: each allocation must meet minimum fraction ──
		for (const allocation of args.allocations) {
			if (BigInt(allocation.amount) < MIN_FRACTION) {
				throw new ConvexError({
					code: "ALLOCATION_BELOW_MINIMUM" as const,
					message: `Allocation for lender ${allocation.lenderId} is ${allocation.amount}, minimum is ${MIN_FRACTION}`,
				});
			}
		}

		// ── Idempotency check (on the mint key) ──
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
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent mintAndIssue replay: TREASURY for ${args.mortgageId} not found`,
				});
			}
			// Collect the issue entries for this mortgage
			const issueEntries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (q) =>
					q.eq("mortgageId", args.mortgageId)
				)
				.collect();
			return {
				treasuryAccountId: treasury._id,
				mintEntry: existingEntry,
				issueEntries: issueEntries.filter(
					(e) => e.entryType === "SHARES_ISSUED"
				),
			};
		}

		// ── Double-mint check ──
		const existingTreasury = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
			)
			.first();
		if (existingTreasury) {
			throw new ConvexError({
				code: "ALREADY_MINTED" as const,
				message: `Mortgage ${args.mortgageId} already minted (TREASURY exists)`,
			});
		}

		// ── Create accounts ──
		const worldAccount = await initializeWorldAccount(ctx);

		const treasuryId = await ctx.db.insert("ledger_accounts", {
			type: "TREASURY",
			mortgageId: args.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: Date.now(),
		});

		// ── MORTGAGE_MINTED: WORLD gives → TREASURY receives ──
		const mintEntry = await postEntry(ctx, {
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

		// ── Issue shares to each allocation ──
		const issueEntries: Doc<"ledger_journal_entries">[] = [];

		for (const allocation of args.allocations) {
			const position = await getOrCreatePositionAccount(
				ctx,
				args.mortgageId,
				allocation.lenderId
			);

			const issueEntry = await postEntry(ctx, {
				entryType: "SHARES_ISSUED",
				mortgageId: args.mortgageId,
				debitAccountId: position._id,
				creditAccountId: treasuryId,
				amount: allocation.amount,
				effectiveDate: args.effectiveDate,
				idempotencyKey: `${args.idempotencyKey}:issue:${allocation.lenderId}`,
				source: args.source,
				causedBy: mintEntry._id,
				metadata: args.metadata,
			});

			issueEntries.push(issueEntry);
		}

		// ── Belt-and-suspenders: TREASURY balance must be 0 ──
		const treasuryDoc = await ctx.db.get(treasuryId);
		if (!treasuryDoc) {
			throw new ConvexError({
				code: "INVARIANT_VIOLATION" as const,
				message: "TREASURY account disappeared after mint",
			});
		}
		const treasuryBalance = getPostedBalance(treasuryDoc);
		if (treasuryBalance !== 0n) {
			throw new ConvexError({
				code: "INVARIANT_VIOLATION" as const,
				message: `TREASURY balance is ${treasuryBalance} after full allocation, expected 0`,
			});
		}

		return { treasuryAccountId: treasuryId, mintEntry, issueEntries };
	})
	.public();

export const transferShares = ledgerMutation
	.input(transferSharesArgsValidator)
	.handler(async (ctx, args) => transferSharesHandler(ctx, args))
	.public();

export const redeemShares = ledgerMutation
	.input(redeemSharesArgsValidator)
	.handler(async (ctx, args) => redeemSharesHandler(ctx, args))
	.public();

// Optional compatibility endpoint for specs branches that refer to this validator.
export const mintMortgageWithAllocations = ledgerMutation
	.input(mintMortgageWithAllocationsArgsValidator)
	.handler(async (ctx, args) => {
		return mintAndIssue.handler(ctx as never, args as never);
	})
	.public();

// ── Tier 2: Internal Mutation Registrations ──────────────────────

export const issueShares = internalMutation({
	args: issueSharesArgsValidator,
	handler: issueSharesHandler,
});

export const transferSharesInternal = internalMutation({
	args: transferSharesArgsValidator,
	handler: transferSharesHandler,
});

export const redeemSharesInternal = internalMutation({
	args: redeemSharesArgsValidator,
	handler: redeemSharesHandler,
});

export const reserveShares = internalMutation({
	args: reserveSharesArgsValidator,
	handler: async (ctx, args) => {
		const existingEntry = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();
		if (existingEntry) {
			if (!existingEntry.reservationId) {
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent reserveShares replay: existing entry ${existingEntry._id} lacks reservation linkage`,
				});
			}
			const reservation = await ctx.db.get(existingEntry.reservationId);
			if (!reservation) {
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent reserveShares replay: reservation ${existingEntry.reservationId} missing`,
				});
			}
			return {
				reservationId: reservation._id,
				journalEntry: existingEntry,
			};
		}

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

		const journalEntry = await postEntry(ctx, {
			entryType: "SHARES_RESERVED",
			mortgageId: args.mortgageId,
			debitAccountId: buyerPosition._id,
			creditAccountId: sellerPosition._id,
			amount: args.amount,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			metadata: args.metadata,
		});

		const amountDelta = BigInt(args.amount);
		await ctx.db.patch(sellerPosition._id, {
			pendingCredits: sellerPosition.pendingCredits + amountDelta,
		});
		await ctx.db.patch(buyerPosition._id, {
			pendingDebits: buyerPosition.pendingDebits + amountDelta,
		});

		const reservationId = await ctx.db.insert("ledger_reservations", {
			mortgageId: args.mortgageId,
			sellerAccountId: sellerPosition._id,
			buyerAccountId: buyerPosition._id,
			amount: args.amount,
			status: "pending",
			dealId: args.dealId,
			reserveJournalEntryId: journalEntry._id,
			createdAt: Date.now(),
		});

		await ctx.db.patch(journalEntry._id, { reservationId });

		return {
			reservationId,
			journalEntry: { ...journalEntry, reservationId },
		};
	},
});

export const commitReservation = internalMutation({
	args: commitReservationArgsValidator,
	handler: async (ctx, args) => {
		// Idempotency
		const existingEntry = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();
		if (existingEntry) {
			if (existingEntry.entryType !== "SHARES_COMMITTED") {
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent commitReservation replay: existing entry ${existingEntry._id} has entryType ${existingEntry.entryType}, expected SHARES_COMMITTED`,
				});
			}
			if (existingEntry.reservationId !== args.reservationId) {
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent commitReservation replay: existing entry ${existingEntry._id} has reservationId ${existingEntry.reservationId}, expected ${args.reservationId}`,
				});
			}
			return { journalEntry: existingEntry };
		}

		const reservation = await ctx.db.get(args.reservationId);
		if (!reservation) {
			throw new ConvexError({
				code: "RESERVATION_NOT_FOUND" as const,
				message: `Reservation ${args.reservationId} does not exist`,
			});
		}
		if (reservation.status !== "pending") {
			throw new ConvexError({
				code: "RESERVATION_NOT_PENDING" as const,
				message: `Reservation ${args.reservationId} is ${reservation.status}, expected pending`,
			});
		}

		const sellerAccount = await ctx.db.get(reservation.sellerAccountId);
		const buyerAccount = await ctx.db.get(reservation.buyerAccountId);
		if (!(sellerAccount && buyerAccount)) {
			throw new ConvexError({
				code: "ACCOUNT_NOT_FOUND" as const,
				message: "Seller or buyer account from reservation not found",
			});
		}

		// Clear pending fields BEFORE postEntry so that balanceCheck sees
		// the correct available balance (the reserved units are being committed,
		// not double-spent). Convex mutations are transactional — if postEntry
		// fails, this patch rolls back too.
		const amountDelta = BigInt(reservation.amount);
		await ctx.db.patch(reservation.sellerAccountId, {
			pendingCredits: sellerAccount.pendingCredits - amountDelta,
		});
		await ctx.db.patch(reservation.buyerAccountId, {
			pendingDebits: buyerAccount.pendingDebits - amountDelta,
		});

		// Post SHARES_COMMITTED: buyer receives ← seller gives
		const journalEntry = await postEntry(ctx, {
			entryType: "SHARES_COMMITTED",
			mortgageId: reservation.mortgageId,
			debitAccountId: reservation.buyerAccountId,
			creditAccountId: reservation.sellerAccountId,
			amount: reservation.amount,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			reservationId: reservation._id,
		});

		// Finalize reservation
		await ctx.db.patch(reservation._id, {
			status: "committed",
			commitJournalEntryId: journalEntry._id,
			resolvedAt: Date.now(),
		});

		return { journalEntry };
	},
});

export const voidReservation = internalMutation({
	args: voidReservationArgsValidator,
	handler: async (ctx, args) => {
		// Idempotency
		const existingEntry = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();
		if (existingEntry) {
			if (existingEntry.entryType !== "SHARES_VOIDED") {
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent voidReservation replay: existing entry ${existingEntry._id} has entryType ${existingEntry.entryType}, expected SHARES_VOIDED`,
				});
			}
			if (existingEntry.reservationId !== args.reservationId) {
				throw new ConvexError({
					code: "IDEMPOTENT_REPLAY_FAILED" as const,
					message: `Idempotent voidReservation replay: existing entry ${existingEntry._id} has reservationId ${existingEntry.reservationId}, expected ${args.reservationId}`,
				});
			}
			return { journalEntry: existingEntry };
		}

		const reservation = await ctx.db.get(args.reservationId);
		if (!reservation) {
			throw new ConvexError({
				code: "RESERVATION_NOT_FOUND" as const,
				message: `Reservation ${args.reservationId} does not exist`,
			});
		}
		if (reservation.status !== "pending") {
			throw new ConvexError({
				code: "RESERVATION_NOT_PENDING" as const,
				message: `Reservation ${args.reservationId} is ${reservation.status}, expected pending`,
			});
		}

		const sellerAccount = await ctx.db.get(reservation.sellerAccountId);
		const buyerAccount = await ctx.db.get(reservation.buyerAccountId);
		if (!(sellerAccount && buyerAccount)) {
			throw new ConvexError({
				code: "ACCOUNT_NOT_FOUND" as const,
				message: "Seller or buyer account from reservation not found",
			});
		}

		// Release pending fields before posting audit entry
		const amountDelta = BigInt(reservation.amount);
		await ctx.db.patch(reservation.sellerAccountId, {
			pendingCredits: sellerAccount.pendingCredits - amountDelta,
		});
		await ctx.db.patch(reservation.buyerAccountId, {
			pendingDebits: buyerAccount.pendingDebits - amountDelta,
		});

		// Post SHARES_VOIDED: reverse direction (seller receives ← buyer gives)
		const journalEntry = await postEntry(ctx, {
			entryType: "SHARES_VOIDED",
			mortgageId: reservation.mortgageId,
			debitAccountId: reservation.sellerAccountId,
			creditAccountId: reservation.buyerAccountId,
			amount: reservation.amount,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: args.source,
			reason: args.reason,
			reservationId: reservation._id,
		});

		// Finalize reservation
		await ctx.db.patch(reservation._id, {
			status: "voided",
			voidJournalEntryId: journalEntry._id,
			resolvedAt: Date.now(),
		});

		return { journalEntry };
	},
});
