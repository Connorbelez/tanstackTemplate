import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { adminMutation, authedQuery } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import {
	getAvailableBalance,
	getOrCreatePositionAccount,
	getPositionAccount,
	getPostedBalance,
	initializeWorldAccount,
} from "../ledger/accounts";
import { TOTAL_SUPPLY } from "../ledger/constants";
import { postEntry } from "../ledger/postEntry";
import { initializeSequenceCounterInternal } from "../ledger/sequenceCounter";
import type { EventSource } from "../ledger/types";

// ── Constants ────────────────────────────────────────────────────

const PROD_DEMO_PREFIX = "prod-mtg-";
const DEMO_SOURCE: EventSource = {
	type: "system",
	channel: "prod-demo-seed",
};

const PROD_DEMO_MORTGAGES = [
	{
		mortgageId: "prod-mtg-greenfield",
		label: "123 Greenfield Rd",
		allocations: [
			{ lenderId: "lender-alice", amount: 5000 },
			{ lenderId: "lender-bob", amount: 3000 },
			{ lenderId: "lender-charlie", amount: 2000 },
		],
	},
	{
		mortgageId: "prod-mtg-riverside",
		label: "456 Riverside Dr",
		allocations: [
			{ lenderId: "lender-alice", amount: 4000 },
			{ lenderId: "lender-dave", amount: 6000 },
		],
	},
	{
		mortgageId: "prod-mtg-oakwood",
		label: "789 Oakwood Ave",
		allocations: [
			{ lenderId: "lender-bob", amount: 5000 },
			{ lenderId: "lender-eve", amount: 5000 },
		],
	},
] as const;

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
	return new Date().toISOString().split("T")[0];
}

function genIdempotencyKey(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build account label lookup from all accounts for display purposes. */
async function buildAccountLabelMap(
	ctx: QueryCtx
): Promise<
	Map<string, { type: string; lenderId?: string; mortgageId?: string }>
> {
	const allAccounts = await ctx.db.query("ledger_accounts").collect();
	const map = new Map<
		string,
		{ type: string; lenderId?: string; mortgageId?: string }
	>();
	for (const account of allAccounts) {
		map.set(account._id, {
			type: account.type,
			lenderId: getAccountLenderId(account),
			mortgageId: account.mortgageId,
		});
	}
	return map;
}

// ── Queries ──────────────────────────────────────────────────────

export const getLedgerOverview = authedQuery
	.handler(async (ctx) => {
		// Fetch all accounts
		const allAccounts = await ctx.db.query("ledger_accounts").collect();

		// WORLD account balance
		const worldAccount = allAccounts.find((a) => a.type === "WORLD");
		const worldBalance = worldAccount
			? Number(getPostedBalance(worldAccount))
			: 0;

		// Group by mortgage: find all TREASURY and POSITION accounts with prod-mtg- prefix
		const mortgageIds = new Set<string>();
		for (const account of allAccounts) {
			if (account.mortgageId?.startsWith(PROD_DEMO_PREFIX)) {
				mortgageIds.add(account.mortgageId);
			}
		}

		const mortgages: Array<{
			mortgageId: string;
			label: string;
			treasuryBalance: number;
			positions: Array<{
				lenderId: string;
				balance: number;
				availableBalance: number;
				pendingCredits: number;
				pendingDebits: number;
			}>;
			invariant: { valid: boolean; total: number };
			entryCount: number;
		}> = [];

		let totalEntries = 0;

		for (const mortgageId of mortgageIds) {
			const treasury = allAccounts.find(
				(a) => a.type === "TREASURY" && a.mortgageId === mortgageId
			);
			const treasuryBalance = treasury ? Number(getPostedBalance(treasury)) : 0;

			const positionAccounts = allAccounts.filter(
				(a) => a.type === "POSITION" && a.mortgageId === mortgageId
			);

			const positions = positionAccounts.map((a) => ({
				lenderId: getAccountLenderId(a) ?? "",
				balance: Number(getPostedBalance(a)),
				availableBalance: Number(getAvailableBalance(a)),
				pendingCredits: Number(a.pendingCredits ?? 0n),
				pendingDebits: Number(a.pendingDebits ?? 0n),
			}));

			// Count entries for this mortgage
			const entries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
			const entryCount = entries.length;
			totalEntries += entryCount;

			// Invariant: TREASURY + sum(POSITIONS) = TOTAL_SUPPLY
			const positionSum = positions.reduce((sum, p) => sum + p.balance, 0);
			const total = treasuryBalance + positionSum;
			const valid = total === Number(TOTAL_SUPPLY);

			// Label from seed data
			const seedDef = PROD_DEMO_MORTGAGES.find(
				(m) => m.mortgageId === mortgageId
			);
			const label = seedDef?.label ?? mortgageId;

			mortgages.push({
				mortgageId,
				label,
				treasuryBalance,
				positions,
				invariant: { valid, total },
				entryCount,
			});
		}

		// Reservation summary
		const allReservations = await ctx.db.query("ledger_reservations").collect();
		const prodReservations = allReservations.filter((r) =>
			r.mortgageId.startsWith(PROD_DEMO_PREFIX)
		);

		let pending = 0;
		let committed = 0;
		let voided = 0;
		for (const r of prodReservations) {
			if (r.status === "pending") {
				pending++;
			} else if (r.status === "committed") {
				committed++;
			} else if (r.status === "voided") {
				voided++;
			}
		}

		return {
			worldBalance,
			mortgages,
			totalEntries,
			reservationSummary: { pending, committed, voided },
		};
	})
	.public();

export const getJournalRegister = authedQuery
	.handler(async (ctx) => {
		const accountMap = await buildAccountLabelMap(ctx);

		// Query all journal entries sorted by sequenceNumber descending, limit 200
		// Convex doesn't have a global sequence-descending index,
		// so we collect all entries for prod-demo mortgages and sort in memory
		const mortgageIds = new Set<string>();
		for (const [, info] of accountMap) {
			if (info.mortgageId?.startsWith(PROD_DEMO_PREFIX)) {
				mortgageIds.add(info.mortgageId);
			}
		}

		const allEntries: Doc<"ledger_journal_entries">[] = [];
		for (const mortgageId of mortgageIds) {
			const entries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
			allEntries.push(...entries);
		}

		// Sort by sequence number descending (newest first)
		allEntries.sort((a, b) => {
			if (a.sequenceNumber > b.sequenceNumber) {
				return -1;
			}
			if (a.sequenceNumber < b.sequenceNumber) {
				return 1;
			}
			return 0;
		});

		// Limit to 200
		const limited = allEntries.slice(0, 200);

		return limited.map((entry) => {
			const debitInfo = accountMap.get(entry.debitAccountId);
			const creditInfo = accountMap.get(entry.creditAccountId);

			const debitLabel =
				debitInfo?.type === "POSITION"
					? (debitInfo.lenderId ?? "POSITION")
					: (debitInfo?.type ?? "?");
			const creditLabel =
				creditInfo?.type === "POSITION"
					? (creditInfo.lenderId ?? "POSITION")
					: (creditInfo?.type ?? "?");

			return {
				_id: entry._id,
				sequenceNumber: Number(entry.sequenceNumber),
				entryType: entry.entryType,
				mortgageId: entry.mortgageId,
				amount: entry.amount,
				debitLabel,
				creditLabel,
				effectiveDate: entry.effectiveDate,
				timestamp: entry.timestamp,
				reservationId: entry.reservationId,
				source: entry.source,
			};
		});
	})
	.public();

export const getReservations = authedQuery
	.handler(async (ctx) => {
		const accountMap = await buildAccountLabelMap(ctx);

		const allReservations = await ctx.db.query("ledger_reservations").collect();
		const prodReservations = allReservations.filter((r) =>
			r.mortgageId.startsWith(PROD_DEMO_PREFIX)
		);

		return prodReservations.map((r) => {
			const sellerInfo = accountMap.get(r.sellerAccountId);
			const buyerInfo = accountMap.get(r.buyerAccountId);

			return {
				_id: r._id,
				mortgageId: r.mortgageId,
				sellerLenderId: sellerInfo?.lenderId ?? "?",
				buyerLenderId: buyerInfo?.lenderId ?? "?",
				amount: r.amount,
				status: r.status,
				dealId: r.dealId,
				createdAt: r.createdAt,
				resolvedAt: r.resolvedAt,
			};
		});
	})
	.public();

// ── Mutations ────────────────────────────────────────────────────

export const seedProdData = adminMutation
	.handler(async (ctx) => {
		// Idempotency: check if any prod demo TREASURY accounts exist
		for (const mortgage of PROD_DEMO_MORTGAGES) {
			const existing = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", mortgage.mortgageId)
				)
				.first();
			if (existing) {
				return {
					seeded: false,
					message: "Prod demo data already exists. Clean up first.",
				};
			}
		}

		// Bootstrap: initialize sequence counter + WORLD account
		await initializeSequenceCounterInternal(ctx);
		const worldAccount = await initializeWorldAccount(ctx);
		const effectiveDate = todayISO();

		for (const mortgage of PROD_DEMO_MORTGAGES) {
			// Create TREASURY account
			const treasuryId = await ctx.db.insert("ledger_accounts", {
				type: "TREASURY",
				mortgageId: mortgage.mortgageId,
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: Date.now(),
			});

			// MORTGAGE_MINTED via real postEntry pipeline
			const mintEntry = await postEntry(ctx, {
				entryType: "MORTGAGE_MINTED",
				mortgageId: mortgage.mortgageId,
				debitAccountId: treasuryId,
				creditAccountId: worldAccount._id,
				amount: Number(TOTAL_SUPPLY),
				effectiveDate,
				idempotencyKey: `prod-demo-mint-${mortgage.mortgageId}`,
				source: DEMO_SOURCE,
				metadata: { demo: true, source: "prod-seed" },
			});

			// Issue shares to each lender via real postEntry pipeline
			for (const allocation of mortgage.allocations) {
				const position = await getOrCreatePositionAccount(
					ctx,
					mortgage.mortgageId,
					allocation.lenderId
				);

				await postEntry(ctx, {
					entryType: "SHARES_ISSUED",
					mortgageId: mortgage.mortgageId,
					debitAccountId: position._id,
					creditAccountId: treasuryId,
					amount: allocation.amount,
					effectiveDate,
					idempotencyKey: `prod-demo-issue-${mortgage.mortgageId}-${allocation.lenderId}`,
					source: DEMO_SOURCE,
					causedBy: mintEntry._id,
					metadata: { demo: true, source: "prod-seed" },
				});
			}

			// Belt-and-suspenders: verify treasury balance = 0
			const treasuryDoc = await ctx.db.get(treasuryId);
			if (treasuryDoc && getPostedBalance(treasuryDoc) !== 0n) {
				throw new Error(
					`TREASURY balance for ${mortgage.mortgageId} is ${getPostedBalance(treasuryDoc)}, expected 0 after full allocation`
				);
			}
		}

		return {
			seeded: true,
			message: `Seeded ${PROD_DEMO_MORTGAGES.length} prod demo mortgages with lenders.`,
		};
	})
	.public();

/** Delete journal entries and reservations for the given mortgage IDs. */
async function deleteDemoEntriesAndReservations(
	ctx: MutationCtx,
	mortgageIds: Set<string>
): Promise<{ deletedEntries: number; deletedReservations: number }> {
	let deletedEntries = 0;
	let deletedReservations = 0;

	for (const mortgageId of mortgageIds) {
		const entries = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_mortgage_and_time", (q) => q.eq("mortgageId", mortgageId))
			.collect();
		for (const entry of entries) {
			await ctx.db.delete(entry._id);
			deletedEntries++;
		}

		const reservations = await ctx.db
			.query("ledger_reservations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
			.collect();
		for (const reservation of reservations) {
			await ctx.db.delete(reservation._id);
			deletedReservations++;
		}
	}

	return { deletedEntries, deletedReservations };
}

/** Recompute or delete WORLD account after demo data removal. */
async function reconcileWorldAccount(
	ctx: MutationCtx,
	worldAccount: Doc<"ledger_accounts">,
	hasRemainingMortgages: boolean
): Promise<void> {
	if (!hasRemainingMortgages) {
		await ctx.db.delete(worldAccount._id);
		const counter = await ctx.db
			.query("ledger_sequence_counters")
			.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
			.first();
		if (counter) {
			await ctx.db.delete(counter._id);
		}
		return;
	}

	const remainingDebits = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_debit_account", (q) =>
			q.eq("debitAccountId", worldAccount._id)
		)
		.collect();
	const remainingCredits = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_credit_account", (q) =>
			q.eq("creditAccountId", worldAccount._id)
		)
		.collect();

	let totalDebits = 0n;
	for (const e of remainingDebits) {
		totalDebits += BigInt(e.amount);
	}
	let totalCredits = 0n;
	for (const e of remainingCredits) {
		totalCredits += BigInt(e.amount);
	}

	await ctx.db.patch(worldAccount._id, {
		cumulativeDebits: totalDebits,
		cumulativeCredits: totalCredits,
	});
}

export const cleanupProdData = adminMutation
	.handler(async (ctx) => {
		const allAccounts = await ctx.db.query("ledger_accounts").collect();

		const demoMortgageIds = new Set<string>();
		const demoAccountIds: Id<"ledger_accounts">[] = [];

		for (const account of allAccounts) {
			if (account.mortgageId?.startsWith(PROD_DEMO_PREFIX)) {
				demoMortgageIds.add(account.mortgageId);
				demoAccountIds.push(account._id);
			}
		}

		if (demoMortgageIds.size === 0) {
			return {
				deletedEntries: 0,
				deletedAccounts: 0,
				deletedReservations: 0,
			};
		}

		const { deletedEntries, deletedReservations } =
			await deleteDemoEntriesAndReservations(ctx, demoMortgageIds);

		for (const accountId of demoAccountIds) {
			await ctx.db.delete(accountId);
		}

		const worldAccount = allAccounts.find((a) => a.type === "WORLD");
		if (worldAccount) {
			const hasRemainingMortgages = allAccounts.some(
				(a) => a.type !== "WORLD" && !a.mortgageId?.startsWith(PROD_DEMO_PREFIX)
			);
			await reconcileWorldAccount(ctx, worldAccount, hasRemainingMortgages);
		}

		return {
			deletedEntries,
			deletedAccounts: demoAccountIds.length,
			deletedReservations,
		};
	})
	.public();

export const demoReserveShares = adminMutation
	.input({
		mortgageId: v.string(),
		sellerLenderId: v.string(),
		buyerLenderId: v.string(),
		amount: v.number(),
		dealId: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		return reserveSharesInternal(ctx, {
			mortgageId: args.mortgageId,
			sellerLenderId: args.sellerLenderId,
			buyerLenderId: args.buyerLenderId,
			amount: args.amount,
			effectiveDate: todayISO(),
			idempotencyKey: genIdempotencyKey("prod-demo-reserve"),
			source: { type: "system", channel: "prod-demo" },
			dealId: args.dealId,
		});
	})
	.public();

export const demoCommitReservation = adminMutation
	.input({
		reservationId: v.id("ledger_reservations"),
	})
	.handler(async (ctx, args) => {
		return commitReservationInternal(ctx, {
			reservationId: args.reservationId,
			effectiveDate: todayISO(),
			idempotencyKey: genIdempotencyKey("prod-demo-commit"),
			source: { type: "system", channel: "prod-demo" },
		});
	})
	.public();

export const demoVoidReservation = adminMutation
	.input({
		reservationId: v.id("ledger_reservations"),
		reason: v.string(),
	})
	.handler(async (ctx, args) => {
		return voidReservationInternal(ctx, {
			reservationId: args.reservationId,
			reason: args.reason,
			effectiveDate: todayISO(),
			idempotencyKey: genIdempotencyKey("prod-demo-void"),
			source: { type: "system", channel: "prod-demo" },
		});
	})
	.public();

// ── Internal handler functions (replicate production logic via postEntry) ──
// These call the real postEntry pipeline directly, matching the production
// internalMutation handlers in convex/ledger/mutations.ts.

async function reserveSharesInternal(
	ctx: MutationCtx,
	args: {
		mortgageId: string;
		sellerLenderId: string;
		buyerLenderId: string;
		amount: number;
		effectiveDate: string;
		idempotencyKey: string;
		source: EventSource;
		dealId?: string;
		metadata?: Record<string, unknown>;
	}
) {
	// Idempotency check
	const existingEntry = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_idempotency", (q) =>
			q.eq("idempotencyKey", args.idempotencyKey)
		)
		.first();
	if (existingEntry) {
		if (!existingEntry.reservationId) {
			throw new Error(
				`Idempotent reserveShares replay: existing entry ${existingEntry._id} lacks reservation linkage`
			);
		}
		const reservation = await ctx.db.get(existingEntry.reservationId);
		if (!reservation) {
			throw new Error(
				`Idempotent reserveShares replay: reservation ${existingEntry.reservationId} missing`
			);
		}
		return { reservationId: reservation._id, journalEntry: existingEntry };
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
		pendingCredits: (sellerPosition.pendingCredits ?? 0n) + amountDelta,
	});
	await ctx.db.patch(buyerPosition._id, {
		pendingDebits: (buyerPosition.pendingDebits ?? 0n) + amountDelta,
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
}

async function commitReservationInternal(
	ctx: MutationCtx,
	args: {
		reservationId: Id<"ledger_reservations">;
		effectiveDate: string;
		idempotencyKey: string;
		source: EventSource;
	}
) {
	// Idempotency
	const existingEntry = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_idempotency", (q) =>
			q.eq("idempotencyKey", args.idempotencyKey)
		)
		.first();
	if (existingEntry) {
		if (existingEntry.entryType !== "SHARES_COMMITTED") {
			throw new Error(
				`Idempotent commitReservation replay: existing entry ${existingEntry._id} has entryType ${existingEntry.entryType}, expected SHARES_COMMITTED`
			);
		}
		return { journalEntry: existingEntry };
	}

	const reservation = await ctx.db.get(args.reservationId);
	if (!reservation) {
		throw new Error(`Reservation ${args.reservationId} does not exist`);
	}
	if (reservation.status !== "pending") {
		throw new Error(
			`Reservation ${args.reservationId} is ${reservation.status}, expected pending`
		);
	}

	const sellerAccount = await ctx.db.get(reservation.sellerAccountId);
	const buyerAccount = await ctx.db.get(reservation.buyerAccountId);
	if (!(sellerAccount && buyerAccount)) {
		throw new Error("Seller or buyer account from reservation not found");
	}

	// Clear pending fields BEFORE postEntry
	const amountDelta = BigInt(reservation.amount);
	await ctx.db.patch(reservation.sellerAccountId, {
		pendingCredits: (sellerAccount.pendingCredits ?? 0n) - amountDelta,
	});
	await ctx.db.patch(reservation.buyerAccountId, {
		pendingDebits: (buyerAccount.pendingDebits ?? 0n) - amountDelta,
	});

	// Post SHARES_COMMITTED via real postEntry pipeline
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
}

async function voidReservationInternal(
	ctx: MutationCtx,
	args: {
		reservationId: Id<"ledger_reservations">;
		reason: string;
		effectiveDate: string;
		idempotencyKey: string;
		source: EventSource;
	}
) {
	// Idempotency
	const existingEntry = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_idempotency", (q) =>
			q.eq("idempotencyKey", args.idempotencyKey)
		)
		.first();
	if (existingEntry) {
		if (existingEntry.entryType !== "SHARES_VOIDED") {
			throw new Error(
				`Idempotent voidReservation replay: existing entry ${existingEntry._id} has entryType ${existingEntry.entryType}, expected SHARES_VOIDED`
			);
		}
		return { journalEntry: existingEntry };
	}

	const reservation = await ctx.db.get(args.reservationId);
	if (!reservation) {
		throw new Error(`Reservation ${args.reservationId} does not exist`);
	}
	if (reservation.status !== "pending") {
		throw new Error(
			`Reservation ${args.reservationId} is ${reservation.status}, expected pending`
		);
	}

	const sellerAccount = await ctx.db.get(reservation.sellerAccountId);
	const buyerAccount = await ctx.db.get(reservation.buyerAccountId);
	if (!(sellerAccount && buyerAccount)) {
		throw new Error("Seller or buyer account from reservation not found");
	}

	// Release pending fields before posting audit entry
	const amountDelta = BigInt(reservation.amount);
	await ctx.db.patch(reservation.sellerAccountId, {
		pendingCredits: (sellerAccount.pendingCredits ?? 0n) - amountDelta,
	});
	await ctx.db.patch(reservation.buyerAccountId, {
		pendingDebits: (buyerAccount.pendingDebits ?? 0n) - amountDelta,
	});

	// Post SHARES_VOIDED via real postEntry pipeline
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
}
