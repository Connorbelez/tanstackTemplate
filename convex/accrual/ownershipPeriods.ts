import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { AUDIT_ONLY_ENTRY_TYPES, TOTAL_SUPPLY } from "../ledger/constants";
import { getPositionAccount } from "../ledger/accounts";
import { dayAfter, dayBefore } from "./interestMath";
import type { OwnershipPeriod } from "./types";

type LedgerJournalEntry = Pick<
	Doc<"ledger_journal_entries">,
	| "_id"
	| "amount"
	| "creditAccountId"
	| "debitAccountId"
	| "effectiveDate"
	| "entryType"
	| "sequenceNumber"
>;

const TRANSFER_LIKE_ENTRY_TYPES = new Set([
	"SHARES_TRANSFERRED",
	"SHARES_COMMITTED",
]);

function amountToNumber(amount: number | bigint): number {
	return typeof amount === "bigint" ? Number(amount) : amount;
}

function compareBySequence(
	left: LedgerJournalEntry,
	right: LedgerJournalEntry
) {
	if (left.sequenceNumber < right.sequenceNumber) {
		return -1;
	}
	if (left.sequenceNumber > right.sequenceNumber) {
		return 1;
	}
	return 0;
}

async function getPositionHistory(
	ctx: { db: QueryCtx["db"] },
	accountId: Doc<"ledger_accounts">["_id"]
) {
	const [debits, credits] = await Promise.all([
		ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_debit_account", (q) => q.eq("debitAccountId", accountId))
			.collect(),
		ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_credit_account", (q) => q.eq("creditAccountId", accountId))
			.collect(),
	]);

	const seen = new Set<string>();
	const merged = [...debits, ...credits].filter((entry) => {
		if (seen.has(entry._id)) {
			return false;
		}
		seen.add(entry._id);
		return true;
	});

	merged.sort(compareBySequence);
	return merged as LedgerJournalEntry[];
}

function getPeriodStartDate(entry: LedgerJournalEntry, isDebitSide: boolean) {
	if (!isDebitSide) {
		return entry.effectiveDate;
	}

	if (TRANSFER_LIKE_ENTRY_TYPES.has(entry.entryType)) {
		return dayAfter(entry.effectiveDate);
	}

	return entry.effectiveDate;
}

function getPeriodEndDate(entry: LedgerJournalEntry, isCreditSide: boolean) {
	if (!isCreditSide) {
		return null;
	}

	if (AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType)) {
		return null;
	}

	return entry.effectiveDate;
}

function getNextBalance(
	currentBalance: bigint,
	entry: LedgerJournalEntry,
	positionAccountId: Doc<"ledger_accounts">["_id"]
) {
	const delta = BigInt(amountToNumber(entry.amount));
	return entry.debitAccountId === positionAccountId
		? currentBalance + delta
		: currentBalance - delta;
}

function closeOpenPeriod(
	periods: OwnershipPeriod[],
	openPeriod: OwnershipPeriod | null,
	currentBalance: bigint,
	currentEndDate: string | null
) {
	if (!openPeriod || currentBalance <= 0n) {
		return null;
	}

	openPeriod.toDate = currentEndDate ?? openPeriod.toDate;
	periods.push(openPeriod);
	return null;
}

/**
 * Reconstructs a lender's ownership periods for a mortgage from ledger history.
 * The ledger uses date-level business events, so transfers/commits close on the
 * effective date for the seller and reopen the buyer on the next day.
 */
export async function getOwnershipPeriods(
	ctx: { db: QueryCtx["db"] },
	mortgageId: string,
	lenderId: string
): Promise<OwnershipPeriod[]> {
	const positionAccount = await getPositionAccount(ctx, mortgageId, lenderId);
	if (!positionAccount) {
		return [];
	}

	const history = await getPositionHistory(ctx, positionAccount._id);
	const periods: OwnershipPeriod[] = [];
	let currentBalance = 0n;
	let openPeriod: OwnershipPeriod | null = null;

	for (const entry of history) {
		if (AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType)) {
			continue;
		}

		const isDebitSide = entry.debitAccountId === positionAccount._id;
		const isCreditSide = entry.creditAccountId === positionAccount._id;
		if (!(isDebitSide || isCreditSide)) {
			continue;
		}

		const nextBalance = getNextBalance(
			currentBalance,
			entry,
			positionAccount._id
		);

		if (nextBalance === currentBalance) {
			continue;
		}

		const isIncrease = nextBalance > currentBalance;
		const nextStartDate = isIncrease
			? getPeriodStartDate(entry, isDebitSide)
			: dayAfter(entry.effectiveDate);
		const currentEndDate = isIncrease
			? dayBefore(nextStartDate)
			: getPeriodEndDate(entry, isCreditSide);

		// If this change affects the same future start date as the currently open
		// period, merge it into that period instead of closing and reopening.
		if (openPeriod && openPeriod.fromDate === nextStartDate) {
			if (nextBalance > 0n) {
				openPeriod = {
					...openPeriod,
					fraction: Number(nextBalance) / Number(TOTAL_SUPPLY),
				};
			} else {
				// Net effect is that there should be no ownership starting at this date.
				openPeriod = null;
			}
		} else {
			openPeriod = closeOpenPeriod(
				periods,
				openPeriod,
				currentBalance,
				currentEndDate
			);

			if (nextBalance > 0n) {
				openPeriod = {
					lenderId,
					mortgageId,
					fraction: Number(nextBalance) / Number(TOTAL_SUPPLY),
					fromDate: nextStartDate,
					toDate: null,
				};
			}
		}

		currentBalance = nextBalance;
	}

	if (openPeriod) {
		periods.push(openPeriod);
	}

	return periods;
}
