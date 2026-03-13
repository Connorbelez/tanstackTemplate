import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { UNITS_PER_MORTGAGE } from "../ledger/constants";
import {
	computeBalance,
	getOrCreateWorldAccount,
	nextSequenceNumber,
} from "../ledger/internal";

// ── Constants ────────────────────────────────────────────────────

const DEMO_PREFIX = "demo-";
const SEED_SOURCE = { type: "system" as const, channel: "demo-seed" };
const SEED_META = { demo: true, source: "seed" };

const DEMO_MORTGAGES = [
	{
		mortgageId: "demo-mtg-greenfield",
		label: "123 Greenfield Rd — Residential",
		investors: [
			{ investorId: "demo-inv-alice", amount: 5_000n },
			{ investorId: "demo-inv-bob", amount: 3_000n },
			{ investorId: "demo-inv-charlie", amount: 2_000n },
		],
	},
	{
		mortgageId: "demo-mtg-riverside",
		label: "456 Riverside Dr — Commercial",
		investors: [
			{ investorId: "demo-inv-alice", amount: 7_000n },
			{ investorId: "demo-inv-dave", amount: 3_000n },
		],
	},
] as const;

// ── Investor display names ───────────────────────────────────────

const INVESTOR_NAMES: Record<string, string> = {
	"demo-inv-alice": "Alice",
	"demo-inv-bob": "Bob",
	"demo-inv-charlie": "Charlie",
	"demo-inv-dave": "Dave",
};

function investorDisplayName(id: string): string {
	return INVESTOR_NAMES[id] ?? id.replace("demo-inv-", "");
}

// ── Seed helpers ─────────────────────────────────────────────────

async function postSeedEntry(
	ctx: MutationCtx,
	args: {
		entryType:
			| "MORTGAGE_MINTED"
			| "SHARES_ISSUED"
			| "SHARES_TRANSFERRED"
			| "SHARES_REDEEMED"
			| "MORTGAGE_BURNED"
			| "CORRECTION";
		mortgageId: string;
		debitAccountId: Id<"ledger_accounts">;
		creditAccountId: Id<"ledger_accounts">;
		amount: bigint;
		idempotencyKey: string;
	}
) {
	const seqNum = await nextSequenceNumber(ctx);
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
	const debitAccount = await ctx.db.get(args.debitAccountId);
	const creditAccount = await ctx.db.get(args.creditAccountId);
	if (debitAccount) {
		await ctx.db.patch(args.debitAccountId, {
			cumulativeDebits: debitAccount.cumulativeDebits + args.amount,
		});
	}
	if (creditAccount) {
		await ctx.db.patch(args.creditAccountId, {
			cumulativeCredits: creditAccount.cumulativeCredits + args.amount,
		});
	}

	return entryId;
}

// ── Mutations ────────────────────────────────────────────────────

export const seedData = mutation({
	args: {},
	handler: async (ctx) => {
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

		const worldAccount = await getOrCreateWorldAccount(ctx);

		for (const mortgage of DEMO_MORTGAGES) {
			// 1. Create TREASURY
			const treasuryId = await ctx.db.insert("ledger_accounts", {
				type: "TREASURY",
				mortgageId: mortgage.mortgageId,
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});

			// 2. MORTGAGE_MINTED: WORLD → TREASURY
			await postSeedEntry(ctx, {
				entryType: "MORTGAGE_MINTED",
				mortgageId: mortgage.mortgageId,
				debitAccountId: treasuryId,
				creditAccountId: worldAccount._id,
				amount: UNITS_PER_MORTGAGE,
				idempotencyKey: `demo-seed-mint-${mortgage.mortgageId}`,
			});

			// 3. Issue shares to each investor
			for (const inv of mortgage.investors) {
				const positionId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: mortgage.mortgageId,
					investorId: inv.investorId,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				await postSeedEntry(ctx, {
					entryType: "SHARES_ISSUED",
					mortgageId: mortgage.mortgageId,
					debitAccountId: positionId,
					creditAccountId: treasuryId,
					amount: inv.amount,
					idempotencyKey: `demo-seed-issue-${mortgage.mortgageId}-${inv.investorId}`,
				});
			}
		}

		return {
			seeded: true,
			message: `Seeded ${DEMO_MORTGAGES.length} mortgages with investors.`,
		};
	},
});

export const cleanup = mutation({
	args: {},
	handler: async (ctx) => {
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
				totalDebits += e.amount;
			}
			let totalCredits = 0n;
			for (const e of remainingCredits) {
				totalCredits += e.amount;
			}

			await ctx.db.patch(worldAccount._id, {
				cumulativeDebits: totalDebits,
				cumulativeCredits: totalCredits,
			});
		}

		return { deletedEntries, deletedAccounts: demoAccountIds.length };
	},
});

// ── Queries ──────────────────────────────────────────────────────

export const getDemoState = query({
	args: {},
	handler: async (ctx) => {
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
				investorId: string;
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
				.map((a) => ({
					investorId: a.investorId ?? "",
					displayName: investorDisplayName(a.investorId ?? ""),
					accountId: a._id,
					balance: Number(computeBalance(a)),
				}));

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
	},
});

export const getDemoJournal = query({
	args: {},
	handler: async (ctx) => {
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
			{ type: string; investorId?: string }
		>();
		for (const account of allAccounts) {
			accountTypeMap.set(account._id, {
				type: account.type,
				investorId: account.investorId,
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
					? investorDisplayName(debitInfo.investorId ?? "")
					: (debitInfo?.type ?? "?");
			const creditLabel =
				creditInfo?.type === "POSITION"
					? investorDisplayName(creditInfo.investorId ?? "")
					: (creditInfo?.type ?? "?");

			const meta = entry.metadata as
				| { demo?: boolean; source?: string }
				| undefined;

			return {
				_id: entry._id,
				sequenceNumber: Number(entry.sequenceNumber),
				entryType: entry.entryType,
				mortgageId: entry.mortgageId,
				amount: Number(entry.amount),
				fromLabel: creditLabel,
				toLabel: debitLabel,
				source: meta?.source ?? "unknown",
				timestamp: entry.timestamp,
			};
		});
	},
});
