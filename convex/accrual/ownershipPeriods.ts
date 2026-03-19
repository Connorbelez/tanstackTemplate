import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { AUDIT_ONLY_ENTRY_TYPES, TOTAL_SUPPLY } from "../ledger/constants";
import { dayAfter, dayBefore } from "./interestMath";
import type { OwnershipPeriod } from "./types";

interface DbCtx {
	db: QueryCtx["db"];
}

type LedgerAccount = Doc<"ledger_accounts">;
type LedgerEntry = Doc<"ledger_journal_entries">;

function toBigIntAmount(amount: number | bigint, entryId: string): bigint {
	if (typeof amount === "bigint") {
		return amount;
	}
	if (!Number.isSafeInteger(amount)) {
		throw new Error(
			`Journal entry ${entryId} has an unsafe amount (${amount})`
		);
	}
	return BigInt(amount);
}

function compareSequenceNumbers(left: LedgerEntry, right: LedgerEntry): number {
	if (left.sequenceNumber < right.sequenceNumber) {
		return -1;
	}
	if (left.sequenceNumber > right.sequenceNumber) {
		return 1;
	}
	return 0;
}

async function findPositionAccount(
	ctx: DbCtx,
	mortgageId: string,
	lenderId: string
): Promise<LedgerAccount | null> {
	const indexed = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage_and_lender", (q) =>
			q.eq("mortgageId", mortgageId).eq("lenderId", lenderId)
		)
		.first();

	if (indexed && indexed.type === "POSITION") {
		return indexed;
	}

	const fallback = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.collect();

	return (
		fallback.find(
			(account) =>
				account.type === "POSITION" && getAccountLenderId(account) === lenderId
		) ?? null
	);
}

function getStartDate(entry: LedgerEntry, isDebitSide: boolean): string {
	if (isDebitSide) {
		if (entry.entryType === "SHARES_ISSUED") {
			return entry.effectiveDate;
		}
		return dayAfter(entry.effectiveDate);
	}

	return entry.effectiveDate;
}

function closeCurrentPeriod(
	periods: OwnershipPeriod[],
	closingDate: string
): void {
	const current = periods.at(-1);
	if (!current || current.toDate !== null) {
		throw new Error("Invalid ownership timeline: no open period to close");
	}
	current.toDate = closingDate;
}

export async function getOwnershipPeriods(
	ctx: { db: QueryCtx["db"] },
	mortgageId: string,
	lenderId: string
): Promise<OwnershipPeriod[]> {
	const positionAccount = await findPositionAccount(ctx, mortgageId, lenderId);
	if (!positionAccount) {
		return [];
	}

	const [debitEntries, creditEntries] = await Promise.all([
		ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_debit_account", (q) =>
				q.eq("debitAccountId", positionAccount._id)
			)
			.collect(),
		ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_credit_account", (q) =>
				q.eq("creditAccountId", positionAccount._id)
			)
			.collect(),
	]);

	const seen = new Set<string>();
	const entries = [...debitEntries, ...creditEntries]
		.filter((entry) => {
			if (seen.has(entry._id)) {
				return false;
			}
			seen.add(entry._id);
			return !AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType);
		})
		.sort(compareSequenceNumbers);

	if (entries.length === 0) {
		return [];
	}

	const periods: OwnershipPeriod[] = [];
	let runningBalance = 0n;

	for (const entry of entries) {
		const amount = toBigIntAmount(entry.amount, entry._id);
		const isDebitSide = entry.debitAccountId === positionAccount._id;
		const startDate = getStartDate(entry, isDebitSide);
		const previousBalance = runningBalance;

		if (isDebitSide) {
			runningBalance += amount;
			if (runningBalance > TOTAL_SUPPLY) {
				throw new Error(
					`Invalid ownership timeline: balance for ${positionAccount._id} exceeds total supply`
				);
			}

			if (previousBalance > 0n) {
				closeCurrentPeriod(periods, dayBefore(startDate));
			}

			if (runningBalance > 0n) {
				periods.push({
					lenderId: lenderId as OwnershipPeriod["lenderId"],
					mortgageId: mortgageId as OwnershipPeriod["mortgageId"],
					fraction: Number(runningBalance) / Number(TOTAL_SUPPLY),
					fromDate: startDate,
					toDate: null,
				});
			}
			continue;
		}

		runningBalance -= amount;
		if (runningBalance < 0n) {
			throw new Error(
				`Invalid ownership timeline: negative balance for ${positionAccount._id}`
			);
		}

		if (previousBalance <= 0n) {
			throw new Error(
				`Invalid ownership timeline: credit entry ${entry._id} closes a zero-balance position`
			);
		}

		closeCurrentPeriod(periods, entry.effectiveDate);

		if (runningBalance > 0n) {
			periods.push({
				lenderId: lenderId as OwnershipPeriod["lenderId"],
				mortgageId: mortgageId as OwnershipPeriod["mortgageId"],
				fraction: Number(runningBalance) / Number(TOTAL_SUPPLY),
				fromDate: dayAfter(entry.effectiveDate),
				toDate: null,
			});
		}
	}

	return periods;
}
