import { formatDecimalCurrencyCents } from "./format";
import type {
	LedgerChartOfAccountsRow,
	LedgerJournalLine,
	LedgerTrialBalanceRow,
} from "./types";

type CsvCell = boolean | null | number | string;

function csvEscape(value: CsvCell | undefined) {
	if (value === undefined || value === null) {
		return "";
	}

	const raw = String(value);
	if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
		return `"${raw.replaceAll('"', '""')}"`;
	}
	return raw;
}

export function rowsToCsv(
	headers: readonly string[],
	rows: readonly Record<string, CsvCell>[]
) {
	const lines = [headers.join(",")];
	for (const row of rows) {
		lines.push(headers.map((header) => csvEscape(row[header])).join(","));
	}
	return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function buildChartOfAccountsCsv(
	rows: readonly LedgerChartOfAccountsRow[]
) {
	const headers = [
		"account_id",
		"account_code",
		"account_name",
		"account_family",
		"normal_balance",
		"control_subaccount",
		"status",
		"opened_at",
		"closed_at",
		"mortgage_id",
		"obligation_id",
		"lender_id",
		"borrower_id",
		"notes",
	] as const;

	return rowsToCsv(
		headers,
		rows.map((row) => ({
			account_id: row.accountId,
			account_code: row.accountCode,
			account_name: row.accountName,
			account_family: row.accountFamily,
			normal_balance: row.normalBalance,
			control_subaccount: row.controlSubaccount ?? "",
			status: row.status,
			opened_at: new Date(row.createdAt).toISOString(),
			closed_at: "",
			mortgage_id: row.mortgageId ?? "",
			obligation_id: row.obligationId ?? "",
			lender_id: row.lenderId ?? "",
			borrower_id: row.borrowerId ?? "",
			notes: row.lastActivityAt
				? `last activity ${new Date(row.lastActivityAt).toISOString()}`
				: "",
		}))
	);
}

export function buildJournalLinesCsv(rows: readonly LedgerJournalLine[]) {
	const headers = [
		"journal_entry_id",
		"sequence_number",
		"posting_group_id",
		"line_number",
		"line_role",
		"effective_date",
		"timestamp_utc",
		"entry_type",
		"reference",
		"description",
		"account_id",
		"account_code",
		"account_name",
		"account_family",
		"control_subaccount",
		"normal_balance",
		"debit",
		"credit",
		"debit_cents",
		"credit_cents",
		"currency_code",
		"mortgage_id",
		"obligation_id",
		"lender_id",
		"borrower_id",
		"transfer_request_id",
		"dispersal_entry_id",
		"idempotency_key",
		"caused_by_journal_entry_id",
		"source_channel",
		"source_actor_type",
		"source_actor_id",
	] as const;

	return rowsToCsv(
		headers,
		rows.map((row) => ({
			journal_entry_id: row.journalEntryId,
			sequence_number: row.sequenceNumber,
			posting_group_id: row.postingGroupId ?? "",
			line_number: row.lineNumber,
			line_role: row.lineRole,
			effective_date: row.effectiveDate,
			timestamp_utc: row.timestampUtc,
			entry_type: row.entryType,
			reference: row.reference,
			description: row.description,
			account_id: row.accountId,
			account_code: row.accountCode,
			account_name: row.accountName,
			account_family: row.accountFamily,
			control_subaccount: row.controlSubaccount ?? "",
			normal_balance: row.normalBalance,
			debit: formatDecimalCurrencyCents(row.debitCents),
			credit: formatDecimalCurrencyCents(row.creditCents),
			debit_cents: row.debitCents,
			credit_cents: row.creditCents,
			currency_code: row.currencyCode,
			mortgage_id: row.mortgageId ?? "",
			obligation_id: row.obligationId ?? "",
			lender_id: row.lenderId ?? "",
			borrower_id: row.borrowerId ?? "",
			transfer_request_id: row.transferRequestId ?? "",
			dispersal_entry_id: row.dispersalEntryId ?? "",
			idempotency_key: row.idempotencyKey,
			caused_by_journal_entry_id: row.causedByJournalEntryId ?? "",
			source_channel: row.sourceChannel,
			source_actor_type: row.sourceActorType ?? "",
			source_actor_id: row.sourceActorId ?? "",
		}))
	);
}

interface TrialBalanceCsvContext {
	asOfDate?: string;
	generatedAt?: number;
}

function resolveTrialBalanceAsOfDate(
	rows: readonly LedgerTrialBalanceRow[],
	context?: TrialBalanceCsvContext
) {
	if (context?.asOfDate) {
		return context.asOfDate;
	}

	const generatedAt =
		context?.generatedAt ??
		(rows as readonly LedgerTrialBalanceRow[] & { generatedAt?: number })
			.generatedAt;
	if (typeof generatedAt === "number") {
		return new Date(generatedAt).toISOString().slice(0, 10);
	}

	return new Date().toISOString().slice(0, 10);
}

export function buildTrialBalanceCsv(
	rows: readonly LedgerTrialBalanceRow[],
	context?: TrialBalanceCsvContext
) {
	const headers = [
		"account_id",
		"account_code",
		"account_name",
		"account_family",
		"control_subaccount",
		"normal_balance",
		"opening_balance",
		"debit_turnover",
		"credit_turnover",
		"closing_balance",
		"opening_balance_cents",
		"debit_turnover_cents",
		"credit_turnover_cents",
		"closing_balance_cents",
		"as_of_date",
		"mortgage_id",
		"obligation_id",
		"lender_id",
		"borrower_id",
	] as const;

	const asOfDate = resolveTrialBalanceAsOfDate(rows, context);

	return rowsToCsv(
		headers,
		rows.map((row) => ({
			account_id: row.accountId,
			account_code: row.accountCode,
			account_name: row.accountName,
			account_family: row.accountFamily,
			control_subaccount: row.controlSubaccount ?? "",
			normal_balance: row.normalBalance,
			opening_balance: formatDecimalCurrencyCents(row.openingBalanceCents),
			debit_turnover: formatDecimalCurrencyCents(row.debitTurnoverCents),
			credit_turnover: formatDecimalCurrencyCents(row.creditTurnoverCents),
			closing_balance: formatDecimalCurrencyCents(row.closingBalanceCents),
			opening_balance_cents: row.openingBalanceCents,
			debit_turnover_cents: row.debitTurnoverCents,
			credit_turnover_cents: row.creditTurnoverCents,
			closing_balance_cents: row.closingBalanceCents,
			as_of_date: asOfDate,
			mortgage_id: row.mortgageId ?? "",
			obligation_id: row.obligationId ?? "",
			lender_id: row.lenderId ?? "",
			borrower_id: row.borrowerId ?? "",
		}))
	);
}

function parseCsvLine(line: string) {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === '"') {
			if (inQuotes && line[index + 1] === '"') {
				current += '"';
				index += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (character === "," && !inQuotes) {
			result.push(current);
			current = "";
			continue;
		}

		current += character;
	}

	result.push(current);
	return result;
}

export function parseCsv(text: string) {
	const lines = splitCsvRecords(text).filter((line) => line.length > 0);

	if (lines.length === 0) {
		return { headers: [], rows: [] as Record<string, string>[] };
	}

	const headers = parseCsvLine(lines[0]);
	const rows = lines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		return Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""])
		);
	});

	return { headers, rows };
}

function splitCsvRecords(text: string) {
	const records: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		const nextCharacter = text[index + 1];

		if (character === '"') {
			if (inQuotes && nextCharacter === '"') {
				current += '"';
				index += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (!inQuotes && character === "\r" && nextCharacter === "\n") {
			records.push(current);
			current = "";
			index += 1;
			continue;
		}

		if (!inQuotes && (character === "\n" || character === "\r")) {
			records.push(current);
			current = "";
			continue;
		}

		current += character;
	}

	records.push(current);
	return records;
}
