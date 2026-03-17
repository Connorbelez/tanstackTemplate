import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ledgerMutation } from "../fluent";
import {
	getOrCreatePositionAccount,
	getPositionAccount,
	getPostedBalance,
	getTreasuryAccount,
	getWorldAccount,
	initializeWorldAccount,
} from "./accounts";
import { TOTAL_SUPPLY } from "./constants";
import { postEntry } from "./postEntry";
import {
	burnMortgageArgsValidator,
	issueSharesArgsValidator,
	mintMortgageArgsValidator,
	postEntryArgsValidator,
	redeemSharesArgsValidator,
	transferSharesArgsValidator,
} from "./validators";

// ── Tier 1: Strict Primitives ─────────────────────────────────────

export const postEntryDirect = internalMutation({
	args: postEntryArgsValidator,
	handler: async (ctx, args) => {
		return postEntry(ctx, args);
	},
});

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

// ── Tier 2: Convenience Mutations ─────────────────────────────────

export const issueShares = ledgerMutation
	.input(issueSharesArgsValidator)
	.handler(async (ctx, args) => {
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
	})
	.public();
