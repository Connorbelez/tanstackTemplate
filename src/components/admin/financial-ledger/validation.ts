import { parseCsv, rowsToCsv } from "./csv";
import type {
	FinancialLedgerSnapshot,
	FinancialLedgerSupportSnapshot,
	ValidationComparisonRow,
	ValidationExpectedRow,
} from "./types";

const IN_FLIGHT_TRANSFER_STATUSES = new Set(["pending", "processing"]);
const NORMALIZE_TOKEN_REGEX = /[\s-]+/g;
const INTEGER_CENTS_REGEX = /^-?\d+$/;

function normalizeToken(value: string) {
	return value.trim().toLowerCase().replaceAll(NORMALIZE_TOKEN_REGEX, "_");
}

function parseDecimalToCents(value: string | number | null | undefined) {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? Math.round(value) : null;
	}

	const normalized = value.trim().replaceAll(",", "");
	if (normalized.length === 0) {
		return null;
	}

	if (INTEGER_CENTS_REGEX.test(normalized)) {
		const parsedInteger = Number.parseInt(normalized, 10);
		return Number.isFinite(parsedInteger) ? parsedInteger : null;
	}

	const parsedFloat = Number.parseFloat(normalized);
	return Number.isFinite(parsedFloat) ? Math.round(parsedFloat * 100) : null;
}

function normalizeExpectedRow(
	row: Record<string, string>,
	index: number
): ValidationExpectedRow | null {
	const subjectType = normalizeToken(
		row.subject_type ?? row.subjectType ?? row.scope ?? ""
	);
	const subjectId =
		row.subject_id ?? row.subjectId ?? row.id ?? row.account_id ?? "";
	const metric = normalizeToken(row.metric ?? row.metric_name ?? "");

	if (
		subjectType.length === 0 ||
		subjectId.trim().length === 0 ||
		metric.length === 0
	) {
		return null;
	}

	return {
		effectiveDate:
			row.effective_date?.trim() ||
			row.effectiveDate?.trim() ||
			row.month?.trim() ||
			undefined,
		expectedAmountCents: parseDecimalToCents(
			row.expected_amount ??
				row.expectedAmount ??
				row.expected_amount_cents ??
				row.amount
		),
		metric,
		sourceRowReference:
			row.source_row_reference?.trim() ||
			row.sourceRowReference?.trim() ||
			`row-${index + 2}`,
		subjectId: subjectId.trim(),
		subjectType,
	};
}

function buildMetricKey(args: {
	effectiveDate?: string;
	metric: string;
	subjectId: string;
	subjectType: string;
}) {
	return [
		normalizeToken(args.subjectType),
		args.subjectId.trim(),
		normalizeToken(args.metric),
		args.effectiveDate?.trim() ?? "",
	].join("|");
}

function pushActual(
	map: Map<string, number>,
	args: {
		effectiveDate?: string;
		metric: string;
		subjectId: string;
		subjectType: string;
		value: number;
	}
) {
	map.set(buildMetricKey(args), args.value);
}

export function parseValidationCsv(text: string) {
	const { rows } = parseCsv(text);
	return rows
		.map((row, index) => normalizeExpectedRow(row, index))
		.filter((row): row is ValidationExpectedRow => row !== null);
}

export function buildValidationActualMap(args: {
	financialLedger: FinancialLedgerSnapshot;
	paymentOperations?: FinancialLedgerSupportSnapshot;
}) {
	const map = new Map<string, number>();

	for (const row of args.financialLedger.trialBalance) {
		pushActual(map, {
			metric: "closing_balance",
			subjectId: row.accountId,
			subjectType: "account",
			value: row.closingBalanceCents,
		});
		pushActual(map, {
			metric: "current_balance",
			subjectId: row.accountId,
			subjectType: "account",
			value: row.closingBalanceCents,
		});
		pushActual(map, {
			metric: "opening_balance",
			subjectId: row.accountId,
			subjectType: "account",
			value: row.openingBalanceCents,
		});
		pushActual(map, {
			metric: "debit_turnover",
			subjectId: row.accountId,
			subjectType: "account",
			value: row.debitTurnoverCents,
		});
		pushActual(map, {
			metric: "credit_turnover",
			subjectId: row.accountId,
			subjectType: "account",
			value: row.creditTurnoverCents,
		});
	}

	const familyBalances = new Map<string, number>();
	const mortgageFamilyBalances = new Map<string, number>();
	const lenderPayables = new Map<string, number>();

	for (const row of args.financialLedger.chartOfAccounts) {
		familyBalances.set(
			row.accountFamily,
			(familyBalances.get(row.accountFamily) ?? 0) + row.balanceCents
		);

		if (row.mortgageId) {
			const key = `${row.mortgageId}:${row.accountFamily}`;
			mortgageFamilyBalances.set(
				key,
				(mortgageFamilyBalances.get(key) ?? 0) + row.balanceCents
			);
		}

		if (row.lenderId && row.accountFamily === "LENDER_PAYABLE") {
			lenderPayables.set(
				row.lenderId,
				(lenderPayables.get(row.lenderId) ?? 0) + row.balanceCents
			);
		}
	}

	for (const [family, balanceCents] of familyBalances) {
		pushActual(map, {
			metric: "balance",
			subjectId: family,
			subjectType: "family",
			value: balanceCents,
		});
	}

	for (const [subjectId, balanceCents] of mortgageFamilyBalances) {
		pushActual(map, {
			metric: "balance",
			subjectId,
			subjectType: "mortgage_family",
			value: balanceCents,
		});
	}

	for (const [lenderId, balanceCents] of lenderPayables) {
		pushActual(map, {
			metric: "gross_lender_payable_balance",
			subjectId: lenderId,
			subjectType: "lender",
			value: balanceCents,
		});
	}

	for (const card of args.financialLedger.reconciliation.cards) {
		if (normalizeToken(card.checkName) !== "control_net_zero") {
			continue;
		}

		for (const row of card.rows) {
			const postingGroupId = String(
				row.postingGroupId ?? row.posting_group_id ?? row.postingGroup ?? ""
			).trim();
			if (postingGroupId.length === 0) {
				continue;
			}

			const rawBalance =
				row.controlAllocationBalance ??
				row.control_balance ??
				row.controlBalance;
			const balanceCents = parseDecimalToCents(rawBalance as string | number);
			if (balanceCents === null) {
				continue;
			}

			pushActual(map, {
				metric: "control_balance",
				subjectId: postingGroupId,
				subjectType: "posting_group",
				value: balanceCents,
			});
		}
	}

	if (args.paymentOperations) {
		for (const row of args.paymentOperations.obligations) {
			pushActual(map, {
				metric: "journal_outstanding_balance",
				subjectId: row.obligationId,
				subjectType: "obligation",
				value: row.journalOutstandingBalance,
			});
			pushActual(map, {
				metric: "journal_settled_amount",
				subjectId: row.obligationId,
				subjectType: "obligation",
				value: row.amount - row.journalOutstandingBalance,
			});
			pushActual(map, {
				metric: "projected_outstanding_balance",
				subjectId: row.obligationId,
				subjectType: "obligation",
				value: row.projectedOutstandingBalance,
			});
		}

		const inFlightByLender = new Map<string, number>();
		for (const transfer of args.paymentOperations.transfers) {
			if (
				!(
					transfer.lenderId && IN_FLIGHT_TRANSFER_STATUSES.has(transfer.status)
				) ||
				transfer.direction !== "outbound"
			) {
				continue;
			}

			inFlightByLender.set(
				transfer.lenderId,
				(inFlightByLender.get(transfer.lenderId) ?? 0) + transfer.amount
			);
		}

		for (const [lenderId, grossBalance] of lenderPayables) {
			pushActual(map, {
				metric: "available_lender_payable_balance",
				subjectId: lenderId,
				subjectType: "lender",
				value: grossBalance - (inFlightByLender.get(lenderId) ?? 0),
			});
		}
	}

	return map;
}

export function compareValidationRows(args: {
	expectedRows: ValidationExpectedRow[];
	financialLedger: FinancialLedgerSnapshot;
	paymentOperations?: FinancialLedgerSupportSnapshot;
	toleranceCents?: number;
}) {
	const toleranceCents = args.toleranceCents ?? 1;
	const actualMap = buildValidationActualMap(args);

	return args.expectedRows.map<ValidationComparisonRow>((row) => {
		const datedMetricKey = buildMetricKey({
			effectiveDate: row.effectiveDate,
			metric: row.metric,
			subjectId: row.subjectId,
			subjectType: row.subjectType,
		});
		const undatedMetricKey = buildMetricKey({
			metric: row.metric,
			subjectId: row.subjectId,
			subjectType: row.subjectType,
		});
		let actualAmountCents: number | null = null;
		if (actualMap.has(datedMetricKey)) {
			actualAmountCents = actualMap.get(datedMetricKey) ?? null;
		} else if (row.effectiveDate && actualMap.has(undatedMetricKey)) {
			actualAmountCents = actualMap.get(undatedMetricKey) ?? null;
		}

		if (row.expectedAmountCents === null) {
			return {
				...row,
				actualAmountCents,
				status: "missing_expected",
				varianceCents: null,
				variancePercent: null,
			};
		}

		if (actualAmountCents === null) {
			return {
				...row,
				actualAmountCents: null,
				status: "missing_actual",
				varianceCents: null,
				variancePercent: null,
			};
		}

		const varianceCents = actualAmountCents - row.expectedAmountCents;
		const absoluteVariance = Math.abs(varianceCents);
		let variancePercent: number | null = null;
		if (row.expectedAmountCents === 0) {
			variancePercent = actualAmountCents === 0 ? 0 : null;
		} else {
			variancePercent = (varianceCents / row.expectedAmountCents) * 100;
		}

		let status: ValidationComparisonRow["status"] = "mismatch";
		if (varianceCents === 0) {
			status = "exact_match";
		} else if (absoluteVariance <= toleranceCents) {
			status = "within_tolerance";
		}

		return {
			...row,
			actualAmountCents,
			status,
			varianceCents,
			variancePercent,
		};
	});
}

export function summarizeValidationComparisons(
	rows: ValidationComparisonRow[]
) {
	const exactMatches = rows.filter(
		(row) => row.status === "exact_match"
	).length;
	const mismatches = rows.filter((row) => row.status === "mismatch").length;
	const unresolvedVariances = rows.filter(
		(row) =>
			row.status === "missing_actual" || row.status === "missing_expected"
	).length;
	const absoluteVariances = rows
		.map((row) => Math.abs(row.varianceCents ?? 0))
		.filter((value) => value > 0);

	return {
		exactMatches,
		largestVarianceCents:
			absoluteVariances.length > 0 ? Math.max(...absoluteVariances) : 0,
		mismatches,
		rowsCompared: rows.length,
		totalAbsoluteVarianceCents: absoluteVariances.reduce(
			(sum, value) => sum + value,
			0
		),
		unresolvedVariances,
	};
}

export function buildValidationDiffCsv(rows: ValidationComparisonRow[]) {
	return rowsToCsv(
		[
			"subject_type",
			"subject_id",
			"metric",
			"effective_date",
			"expected_amount",
			"actual_amount",
			"variance",
			"variance_percent",
			"status",
			"source_row_reference",
		],
		rows.map((row) => ({
			actual_amount:
				row.actualAmountCents === null
					? ""
					: (row.actualAmountCents / 100).toFixed(2),
			effective_date: row.effectiveDate ?? "",
			expected_amount:
				row.expectedAmountCents === null
					? ""
					: (row.expectedAmountCents / 100).toFixed(2),
			metric: row.metric,
			source_row_reference: row.sourceRowReference ?? "",
			status: row.status,
			subject_id: row.subjectId,
			subject_type: row.subjectType,
			variance:
				row.varianceCents === null ? "" : (row.varianceCents / 100).toFixed(2),
			variance_percent:
				row.variancePercent === null ? "" : row.variancePercent.toFixed(2),
		}))
	);
}
