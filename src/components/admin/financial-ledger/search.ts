import { parseAdminDetailSearch } from "#/lib/admin-detail-search";
import type {
	FinancialLedgerSearchState,
	FinancialLedgerTab,
	PaymentOperationsSearchState,
	PaymentOperationsTab,
} from "./types";

const PAYMENT_OPERATIONS_TABS = new Set<PaymentOperationsTab>([
	"obligations",
	"collections",
	"transfers",
	"collection-plans",
]);

const FINANCIAL_LEDGER_TABS = new Set<FinancialLedgerTab>([
	"reconciliation",
	"cash-ledger",
	"ops-health",
	"validation",
	"ownership-ledger",
]);

function parseString(value: unknown) {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: unknown) {
	if (value === true) {
		return true;
	}
	if (value === false || value === null || value === undefined) {
		return false;
	}
	if (typeof value === "number") {
		return value === 1;
	}
	if (typeof value !== "string") {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePaymentOperationsTab(value: unknown): PaymentOperationsTab {
	return PAYMENT_OPERATIONS_TABS.has(value as PaymentOperationsTab)
		? (value as PaymentOperationsTab)
		: "obligations";
}

function parseFinancialLedgerTab(value: unknown): FinancialLedgerTab {
	return FINANCIAL_LEDGER_TABS.has(value as FinancialLedgerTab)
		? (value as FinancialLedgerTab)
		: "reconciliation";
}

export function parsePaymentOperationsSearch(
	raw: Record<string, unknown>
): PaymentOperationsSearchState {
	return {
		...parseAdminDetailSearch(raw),
		borrowerId: parseString(raw.borrowerId),
		dateFrom: parseString(raw.dateFrom),
		dateTo: parseString(raw.dateTo),
		lenderId: parseString(raw.lenderId),
		mortgageId: parseString(raw.mortgageId),
		search: parseString(raw.search),
		selectedCheck: parseString(raw.selectedCheck),
		selectedId: parseString(raw.selectedId),
		showOnlyExceptions: parseBoolean(raw.showOnlyExceptions),
		status: parseString(raw.status),
		tab: parsePaymentOperationsTab(raw.tab),
		type: parseString(raw.type),
	};
}

export function parseFinancialLedgerSearch(
	raw: Record<string, unknown>
): FinancialLedgerSearchState {
	return {
		...parseAdminDetailSearch(raw),
		borrowerId: parseString(raw.borrowerId),
		dateFrom: parseString(raw.dateFrom),
		dateTo: parseString(raw.dateTo),
		lenderId: parseString(raw.lenderId),
		mortgageId: parseString(raw.mortgageId),
		search: parseString(raw.search),
		selectedCheck: parseString(raw.selectedCheck),
		selectedId: parseString(raw.selectedId),
		showOnlyExceptions: parseBoolean(raw.showOnlyExceptions),
		status: parseString(raw.status),
		tab: parseFinancialLedgerTab(raw.tab),
		type: parseString(raw.type),
	};
}

export function cleanDashboardSearch<T extends Record<string, unknown>>(
	search: T
) {
	return Object.fromEntries(
		Object.entries(search).filter(([, value]) => {
			if (value === undefined || value === null) {
				return false;
			}
			if (typeof value === "string") {
				return value.trim().length > 0;
			}
			if (typeof value === "boolean") {
				return value;
			}
			return true;
		})
	) as Partial<T>;
}
