import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { authedMutation, authedQuery } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { UNITS_PER_MORTGAGE } from "../ledger/constants";
import { computeBalance, getOrCreateWorldAccount } from "../ledger/internal";
import { getNextSequenceNumber } from "../ledger/sequenceCounter";

// ── Constants ────────────────────────────────────────────────────

const DEMO_PREFIX = "demo-";
const SEED_SOURCE = { type: "system" as const, channel: "demo-seed" };
const SEED_META = { demo: true, source: "seed" };

const DEMO_MORTGAGES = [
	{
		mortgageId: "demo-mtg-greenfield",
		label: "123 Greenfield Rd — Residential",
		lenders: [
			{ lenderId: "demo-inv-alice", amount: 5000 },
			{ lenderId: "demo-inv-bob", amount: 3000 },
			{ lenderId: "demo-inv-charlie", amount: 2000 },
		],
	},
	{
		mortgageId: "demo-mtg-riverside",
		label: "456 Riverside Dr — Commercial",
		lenders: [
			{ lenderId: "demo-inv-alice", amount: 7000 },
			{ lenderId: "demo-inv-dave", amount: 3000 },
		],
	},
] as const;

// ── Lender display names ───────────────────────────────────────

const LENDER_NAMES: Record<string, string> = {
	"demo-inv-alice": "Alice",
	"demo-inv-bob": "Bob",
	"demo-inv-charlie": "Charlie",
	"demo-inv-dave": "Dave",
};

function lenderDisplayName(id: string): string {
	return LENDER_NAMES[id] ?? id.replace("demo-inv-", "");
}

// ── Seed helpers ─────────────────────────────────────────────────

async function postSeedEntry(
	ctx: MutationCtx,
	args: {
		entryType: Doc<"ledger_journal_entries">["entryType"];
		mortgageId: string;
		debitAccountId: Id<"ledger_accounts">;
		creditAccountId: Id<"ledger_accounts">;
		amount: number;
		idempotencyKey: string;
	}
) {
	const seqNum = await getNextSequenceNumber(ctx);
	const entryId = await ctx.db.insert("ledger_journal_entries", {
		sequenceNumber: seqNum,
		entryType: args.entryType,
		mortgageId: args.mortgageId,
		effectiveDate: new Date().toISOString().split("T")[0],
		timestamp: Date.now(),
		debitAccountId: args.debitAccountId,
		creditAccountId: args.creditAccountId,
		amount: args.amount,
		idempotencyKey: args.idempotencyKey,
		source: SEED_SOURCE,
		metadata: SEED_META,
	});

	// Update cumulative balances
	if (!Number.isFinite(args.amount)) {
		throw new Error("Amount must be a finite number (not NaN or Infinity)");
	}
	if (!Number.isInteger(args.amount)) {
		throw new Error("Amount must be a whole number (integer)");
	}
	if (!Number.isSafeInteger(args.amount)) {
		throw new Error("Amount exceeds safe integer range");
	}
	const amountBigInt = BigInt(args.amount);
	const debitAccount = await ctx.db.get(args.debitAccountId);
	const creditAccount = await ctx.db.get(args.creditAccountId);
	if (debitAccount) {
		await ctx.db.patch(args.debitAccountId, {
			cumulativeDebits: debitAccount.cumulativeDebits + amountBigInt,
		});
	}
	if (creditAccount) {
		await ctx.db.patch(args.creditAccountId, {
			cumulativeCredits: creditAccount.cumulativeCredits + amountBigInt,
		});
	}

	return entryId;
}

// ── Mutations ────────────────────────────────────────────────────

export const seedData = authedMutation
	.handler(async (ctx) => {
		// Idempotency: check if any demo TREASURY accounts exist for any demo mortgage
		for (const mortgage of DEMO_MORTGAGES) {
			const existing = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", mortgage.mortgageId)
				)
				.first();
			if (existing) {
				return {
					seeded: false,
					message: "Demo data already exists. Clean up first.",
				};
			}
		}

		// Ensure the sequence counter exists (getNextSequenceNumber throws if missing)
		const existingCounter = await ctx.db
			.query("ledger_sequence_counters")
			.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
			.first();
		if (!existingCounter) {
			await ctx.db.insert("ledger_sequence_counters", {
				name: "ledger_sequence",
				value: 0n,
			});
		}

		const worldAccount = await getOrCreateWorldAccount(ctx);

		for (const mortgage of DEMO_MORTGAGES) {
			// 1. Create TREASURY
			const treasuryId = await ctx.db.insert("ledger_accounts", {
				type: "TREASURY",
				mortgageId: mortgage.mortgageId,
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: Date.now(),
			});

			// 2. MORTGAGE_MINTED: WORLD → TREASURY
			await postSeedEntry(ctx, {
				entryType: "MORTGAGE_MINTED",
				mortgageId: mortgage.mortgageId,
				debitAccountId: treasuryId,
				creditAccountId: worldAccount._id,
				amount: Number(UNITS_PER_MORTGAGE),
				idempotencyKey: `demo-seed-mint-${mortgage.mortgageId}`,
			});

			// 3. Issue shares to each lender
			for (const inv of mortgage.lenders) {
				const positionId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: mortgage.mortgageId,
					lenderId: inv.lenderId,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					pendingDebits: 0n,
					pendingCredits: 0n,
					createdAt: Date.now(),
				});

				await postSeedEntry(ctx, {
					entryType: "SHARES_ISSUED",
					mortgageId: mortgage.mortgageId,
					debitAccountId: positionId,
					creditAccountId: treasuryId,
					amount: inv.amount,
					idempotencyKey: `demo-seed-issue-${mortgage.mortgageId}-${inv.lenderId}`,
				});
			}
		}

		return {
			seeded: true,
			message: `Seeded ${DEMO_MORTGAGES.length} mortgages with lenders.`,
		};
	})
	.public();

export const cleanup = authedMutation
	.handler(async (ctx) => {
		// Collect all demo mortgage IDs by scanning TREASURY and POSITION accounts
		const allAccounts = await ctx.db.query("ledger_accounts").collect();

		const demoMortgageIds = new Set<string>();
		const demoAccountIds: Id<"ledger_accounts">[] = [];

		for (const account of allAccounts) {
			if (account.mortgageId?.startsWith(DEMO_PREFIX)) {
				demoMortgageIds.add(account.mortgageId);
				demoAccountIds.push(account._id);
			}
		}

		if (demoMortgageIds.size === 0) {
			return { deletedEntries: 0, deletedAccounts: 0 };
		}

		// Delete all journal entries for demo mortgages
		let deletedEntries = 0;
		for (const mortgageId of demoMortgageIds) {
			const entries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
			for (const entry of entries) {
				await ctx.db.delete(entry._id);
				deletedEntries++;
			}
		}

		// Delete all demo accounts
		for (const accountId of demoAccountIds) {
			await ctx.db.delete(accountId);
		}

		// Recompute WORLD account cumulative balances from remaining entries
		const worldAccount = allAccounts.find((a) => a.type === "WORLD");
		if (worldAccount) {
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

		return { deletedEntries, deletedAccounts: demoAccountIds.length };
	})
	.public();

// ── Queries ──────────────────────────────────────────────────────

export const getDemoState = authedQuery
	.handler(async (ctx) => {
		// Find all demo accounts
		const allAccounts = await ctx.db.query("ledger_accounts").collect();

		const demoMortgageIds = new Set<string>();
		for (const account of allAccounts) {
			if (account.mortgageId?.startsWith(DEMO_PREFIX)) {
				demoMortgageIds.add(account.mortgageId);
			}
		}

		if (demoMortgageIds.size === 0) {
			return { mortgages: [], totalEntries: 0 };
		}

		const mortgages: Array<{
			mortgageId: string;
			label: string;
			treasuryBalance: number;
			positions: Array<{
				lenderId: string;
				displayName: string;
				accountId: string;
				balance: number;
			}>;
			entryCount: number;
			invariantValid: boolean;
			total: number;
		}> = [];
		let totalEntries = 0;

		for (const mortgageId of demoMortgageIds) {
			// Find treasury
			const treasury = allAccounts.find(
				(a) => a.type === "TREASURY" && a.mortgageId === mortgageId
			);
			const treasuryBalance = treasury ? Number(computeBalance(treasury)) : 0;

			// Find positions
			const positions = allAccounts
				.filter(
					(a) =>
						a.type === "POSITION" &&
						a.mortgageId === mortgageId &&
						computeBalance(a) > 0n
				)
				.map((a) => {
					const lenderId = getAccountLenderId(a) ?? "";
					return {
						lenderId,
						displayName: lenderDisplayName(lenderId),
						accountId: a._id,
						balance: Number(computeBalance(a)),
					};
				});

			// Count entries
			const entries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();

			const entryCount = entries.length;
			totalEntries += entryCount;

			// Supply invariant
			const positionSum = positions.reduce((sum, p) => sum + p.balance, 0);
			const total = treasuryBalance + positionSum;
			const invariantValid = total === Number(UNITS_PER_MORTGAGE);

			// Find label from seed data
			const seedDef = DEMO_MORTGAGES.find((m) => m.mortgageId === mortgageId);
			const label = seedDef?.label ?? mortgageId;

			mortgages.push({
				mortgageId,
				label,
				treasuryBalance,
				positions,
				entryCount,
				invariantValid,
				total,
			});
		}

		return { mortgages, totalEntries };
	})
	.public();

export const getDemoJournal = authedQuery
	.handler(async (ctx) => {
		// Collect demo mortgage IDs
		const allAccounts = await ctx.db.query("ledger_accounts").collect();

		const demoMortgageIds = new Set<string>();
		for (const account of allAccounts) {
			if (account.mortgageId?.startsWith(DEMO_PREFIX)) {
				demoMortgageIds.add(account.mortgageId);
			}
		}

		if (demoMortgageIds.size === 0) {
			return [];
		}

		// Build account type lookup
		const accountTypeMap = new Map<
			string,
			{ type: string; lenderId?: string }
		>();
		for (const account of allAccounts) {
			accountTypeMap.set(account._id, {
				type: account.type,
				lenderId: getAccountLenderId(account),
			});
		}

		// Collect entries across all demo mortgages
		const allEntries: Doc<"ledger_journal_entries">[] = [];
		for (const mortgageId of demoMortgageIds) {
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

		return allEntries.map((entry) => {
			const debitInfo = accountTypeMap.get(entry.debitAccountId);
			const creditInfo = accountTypeMap.get(entry.creditAccountId);

			const debitLabel =
				debitInfo?.type === "POSITION"
					? lenderDisplayName(debitInfo.lenderId ?? "")
					: (debitInfo?.type ?? "?");
			const creditLabel =
				creditInfo?.type === "POSITION"
					? lenderDisplayName(creditInfo.lenderId ?? "")
					: (creditInfo?.type ?? "?");

			const meta = entry.metadata as
				| { demo?: boolean; source?: string }
				| undefined;

			return {
				_id: entry._id,
				sequenceNumber: Number(entry.sequenceNumber),
				entryType: entry.entryType,
				mortgageId: entry.mortgageId,
				amount: entry.amount,
				fromLabel: creditLabel,
				toLabel: debitLabel,
				source: meta?.source ?? "unknown",
				timestamp: entry.timestamp,
			};
		});
	})
	.public();
