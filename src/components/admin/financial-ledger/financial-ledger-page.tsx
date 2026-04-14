import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { type ChangeEvent, type ReactNode, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import type { AdminDetailSearch } from "#/lib/admin-detail-search";
import {
	buildChartOfAccountsCsv,
	buildJournalLinesCsv,
	buildTrialBalanceCsv,
	downloadCsv,
	rowsToCsv,
} from "./csv";
import {
	formatCurrencyCents,
	formatDateTime,
	formatInteger,
	humanizeLabel,
} from "./format";
import type {
	FinancialLedgerSearchState,
	FinancialLedgerSnapshot,
	FinancialLedgerTab,
	LedgerChartOfAccountsRow,
	LedgerJournalLine,
	MetricItem,
	PaymentOperationsSearchState,
	PaymentOperationsSnapshot,
	ValidationComparisonRow,
	ValidationExpectedRow,
} from "./types";
import {
	DataTableCard,
	DetailRail,
	EmptyDetailState,
	FilterBar,
	FilterDateInput,
	FilterField,
	FilterSelect,
	FilterSwitch,
	FilterTextInput,
	InlineCode,
	KeyValueList,
	MetricStrip,
	PageHeader,
	SectionCard,
	StatusBadge,
	type TableColumn,
} from "./ui";
import {
	buildValidationDiffCsv,
	compareValidationRows,
	parseValidationCsv,
	summarizeValidationComparisons,
} from "./validation";

interface FinancialLedgerPageProps {
	onRefresh: () => Promise<unknown>;
	paymentOperationsSnapshot?: PaymentOperationsSnapshot;
	search: FinancialLedgerSearchState;
	setSearch: (
		updater: (current: FinancialLedgerSearchState) => FinancialLedgerSearchState
	) => void;
	snapshot: FinancialLedgerSnapshot;
}

type LinkSearchSeed = Partial<{
	borrowerId: string;
	dateFrom: string;
	dateTo: string;
	detailOpen: boolean;
	entityType: string | undefined;
	lenderId: string;
	mortgageId: string;
	recordId: string | undefined;
	search: string;
	selectedCheck: string;
	selectedId: string;
	showOnlyExceptions: boolean;
	status: string;
	tab: FinancialLedgerSearchState["tab"] | PaymentOperationsSearchState["tab"];
	type: string;
}>;

const TAB_LABELS: Record<FinancialLedgerTab, string> = {
	"cash-ledger": "Cash Ledger",
	"ops-health": "Ops Health",
	"ownership-ledger": "Ownership Ledger",
	reconciliation: "Reconciliation",
	validation: "Validation",
};

type ValidationInputMode = "manual" | "paste" | "upload";

function normalizeText(value: string) {
	return value.trim().toLowerCase();
}

function matchesText(
	search: string | undefined,
	values: Array<string | null | undefined>
) {
	if (!search) {
		return true;
	}

	const needle = normalizeText(search);
	return values.some((value) => value && normalizeText(value).includes(needle));
}

function matchesDateRange(
	value: number | string | null | undefined,
	dateFrom?: string,
	dateTo?: string
) {
	if (value === null || value === undefined) {
		return !(dateFrom || dateTo);
	}

	const timestamp =
		typeof value === "string" ? Date.parse(value) : new Date(value).getTime();
	if (Number.isNaN(timestamp)) {
		return false;
	}

	if (dateFrom) {
		const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
		if (!Number.isNaN(fromMs) && timestamp < fromMs) {
			return false;
		}
	}

	if (dateTo) {
		const toMs = Date.parse(`${dateTo}T23:59:59.999Z`);
		if (!Number.isNaN(toMs) && timestamp > toMs) {
			return false;
		}
	}

	return true;
}

function buildOptions(values: Array<string | null | undefined>) {
	return Array.from(
		new Set(values.filter((value): value is string => Boolean(value)))
	)
		.sort((left, right) => left.localeCompare(right, "en"))
		.map((value) => ({ label: humanizeLabel(value), value }));
}

function buildAdminDetailLinkSearch(
	current: LinkSearchSeed
): AdminDetailSearch {
	return {
		detailOpen: current.detailOpen ?? false,
		entityType: current.entityType,
		recordId: current.recordId,
	};
}

function buildPaymentOperationsLinkSearch(
	current: LinkSearchSeed,
	patch: Partial<PaymentOperationsSearchState>
): PaymentOperationsSearchState {
	return {
		...buildAdminDetailLinkSearch(current),
		borrowerId: current.borrowerId,
		dateFrom: current.dateFrom,
		dateTo: current.dateTo,
		lenderId: current.lenderId,
		mortgageId: current.mortgageId,
		search: current.search,
		selectedCheck: current.selectedCheck,
		selectedId: current.selectedId,
		showOnlyExceptions: current.showOnlyExceptions ?? false,
		status: current.status,
		tab:
			current.tab === "collections" ||
			current.tab === "transfers" ||
			current.tab === "collection-plans"
				? current.tab
				: "obligations",
		type: current.type,
		...patch,
	};
}

function buildRowId(
	row: Record<string, boolean | null | number | string>,
	index: number
) {
	const candidates = [
		row.obligationId,
		row.obligation_id,
		row.transferId,
		row.transfer_id,
		row.accountId,
		row.account_id,
		row.postingGroupId,
		row.posting_group_id,
		row.planEntryId,
		row.plan_entry_id,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
	}

	return `row-${index}`;
}

function buildExceptionCsv(
	snapshot: FinancialLedgerSnapshot,
	selectedCheck?: string
) {
	const cards = selectedCheck
		? snapshot.reconciliation.cards.filter(
				(card) => card.checkName === selectedCheck
			)
		: snapshot.reconciliation.cards.filter((card) => !card.isHealthy);

	return rowsToCsv(
		["check_name", "category", "checked_at", "row_id", "payload"],
		cards.flatMap((card) =>
			card.rows.map((row, index) => ({
				category: card.category,
				check_name: card.checkName,
				checked_at: new Date(card.checkedAt).toISOString(),
				payload: JSON.stringify(row),
				row_id: buildRowId(row, index),
			}))
		)
	);
}

function buildOpsIncidentsCsv(snapshot: FinancialLedgerSnapshot) {
	return rowsToCsv(
		[
			"event_id",
			"severity",
			"source_job",
			"title",
			"summary",
			"status",
			"occurred_at",
			"related_resource_type",
			"related_resource_id",
		],
		snapshot.opsHealth.events.map((event) => ({
			event_id: event.eventId,
			occurred_at: new Date(event.occurredAt).toISOString(),
			related_resource_id: event.relatedResourceId,
			related_resource_type: event.relatedResourceType,
			severity: event.severity,
			source_job: event.sourceJob,
			status: event.status,
			summary: event.summary,
			title: event.title,
		}))
	);
}

function renderTabButton(args: {
	currentTab: FinancialLedgerTab;
	label: string;
	onSelect: () => void;
	tab: FinancialLedgerTab;
}) {
	return (
		<button
			className={
				args.currentTab === args.tab
					? "rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm"
					: "rounded-full border px-3 py-1.5 text-muted-foreground text-sm hover:bg-muted"
			}
			key={args.tab}
			onClick={args.onSelect}
			type="button"
		>
			{args.label}
		</button>
	);
}

function computeCashFamilyTotals(args: {
	chartOfAccounts: LedgerChartOfAccountsRow[];
	paymentOperations?: PaymentOperationsSnapshot;
	snapshot: FinancialLedgerSnapshot;
}) {
	const familyTotals = new Map<string, number>();
	for (const account of args.chartOfAccounts) {
		familyTotals.set(
			account.accountFamily,
			(familyTotals.get(account.accountFamily) ?? 0) + account.balanceCents
		);
	}

	const grossLenderPayable = familyTotals.get("LENDER_PAYABLE") ?? 0;
	let inFlightOutbound = 0;
	for (const transfer of args.paymentOperations?.transfers ?? []) {
		if (
			transfer.direction === "outbound" &&
			["pending", "processing"].includes(transfer.status)
		) {
			inFlightOutbound += transfer.amount;
		}
	}

	const controlAlerts =
		args.snapshot.reconciliation.cards.find(
			(card) => normalizeText(card.checkName) === "control_net_zero"
		)?.count ?? 0;

	return {
		availableLenderPayable: grossLenderPayable - inFlightOutbound,
		controlAlerts,
		grossLenderPayable,
		suspense: familyTotals.get("SUSPENSE") ?? 0,
		trustCash: familyTotals.get("TRUST_CASH") ?? 0,
		unappliedCash: familyTotals.get("UNAPPLIED_CASH") ?? 0,
	};
}

function buildAccountRegisterRows(args: {
	account: LedgerChartOfAccountsRow | null;
	dateFrom?: string;
	dateTo?: string;
	journalLines: LedgerJournalLine[];
	mortgageId?: string;
	search?: string;
	type?: string;
	showOnlyCorrections: boolean;
}) {
	if (!args.account) {
		return {
			openingBalanceCents: 0,
			rows: [] as Array<
				LedgerJournalLine & {
					counterAccountName: string;
					runningBalanceCents: number;
				}
			>,
		};
	}

	const groupedByJournalEntryId = new Map<string, LedgerJournalLine[]>();
	for (const line of args.journalLines) {
		const rows = groupedByJournalEntryId.get(line.journalEntryId) ?? [];
		rows.push(line);
		groupedByJournalEntryId.set(line.journalEntryId, rows);
	}

	const allAccountLines = args.journalLines
		.filter((line) => line.accountId === args.account?.accountId)
		.sort((left, right) => {
			if (left.effectiveDate !== right.effectiveDate) {
				return left.effectiveDate.localeCompare(right.effectiveDate, "en");
			}
			if (left.sequenceNumber !== right.sequenceNumber) {
				return left.sequenceNumber - right.sequenceNumber;
			}
			return left.lineNumber - right.lineNumber;
		});

	let runningBalanceCents = 0;
	let openingBalanceCents = 0;
	const registerRows: Array<
		LedgerJournalLine & {
			counterAccountName: string;
			runningBalanceCents: number;
		}
	> = [];

	for (const line of allAccountLines) {
		const changesBalance =
			args.account.normalBalance === "debit"
				? line.lineRole === "debit"
					? line.debitCents
					: -line.creditCents
				: line.lineRole === "credit"
					? line.creditCents
					: -line.debitCents;
		runningBalanceCents += changesBalance;

		const inSelectedDateRange = matchesDateRange(
			line.effectiveDate,
			args.dateFrom,
			args.dateTo
		);
		if (!inSelectedDateRange) {
			openingBalanceCents = runningBalanceCents;
			continue;
		}

		if (args.type && line.entryType !== args.type) {
			continue;
		}
		if (args.mortgageId && line.mortgageId !== args.mortgageId) {
			continue;
		}
		if (
			args.showOnlyCorrections &&
			!line.entryType.includes("REVERSAL") &&
			!line.entryType.includes("CORRECTION") &&
			!line.causedByJournalEntryId
		) {
			continue;
		}
		if (
			!matchesText(args.search, [
				line.journalEntryId,
				line.idempotencyKey,
				line.reference,
				line.postingGroupId,
				line.transferRequestId,
				line.description,
			])
		) {
			continue;
		}

		const siblings = groupedByJournalEntryId.get(line.journalEntryId) ?? [];
		const counterLine = siblings.find(
			(candidate) => candidate.lineRole !== line.lineRole
		);
		registerRows.push({
			...line,
			counterAccountName: counterLine?.accountName ?? "—",
			runningBalanceCents,
		});
	}

	return {
		openingBalanceCents,
		rows: registerRows,
	};
}

export function FinancialLedgerPage({
	onRefresh,
	paymentOperationsSnapshot,
	search,
	setSearch,
	snapshot,
}: FinancialLedgerPageProps) {
	const [selectedJournalId, setSelectedJournalId] = useState<string | null>(
		null
	);
	const [validationMode, setValidationMode] =
		useState<ValidationInputMode>("upload");
	const [validationText, setValidationText] = useState("");
	const [validationDraft, setValidationDraft] = useState<{
		effectiveDate: string;
		expectedAmount: string;
		metric: string;
		subjectId: string;
		subjectType: string;
	}>({
		effectiveDate: "",
		expectedAmount: "",
		metric: "closing_balance",
		subjectId: "",
		subjectType: "account",
	});
	const [expectedRows, setExpectedRows] = useState<ValidationExpectedRow[]>([]);
	const [activeValidationRows, setActiveValidationRows] = useState<
		ValidationExpectedRow[]
	>([]);

	const cashTotals = useMemo(
		() =>
			computeCashFamilyTotals({
				chartOfAccounts: snapshot.chartOfAccounts,
				paymentOperations: paymentOperationsSnapshot,
				snapshot,
			}),
		[paymentOperationsSnapshot, snapshot]
	);

	const reconciliationMetricItems: MetricItem[] = [
		{
			label: "Unhealthy checks",
			tone:
				snapshot.reconciliation.unhealthyChecks > 0 ? "critical" : "positive",
			value: formatInteger(snapshot.reconciliation.unhealthyChecks),
		},
		{
			label: "Healthy checks",
			tone: "positive",
			value: formatInteger(snapshot.reconciliation.healthyChecks),
		},
		{
			label: "Total exceptions",
			tone: snapshot.reconciliation.totalGapCount > 0 ? "critical" : "positive",
			value: formatInteger(snapshot.reconciliation.totalGapCount),
		},
		{
			label: "Exception amount",
			tone:
				snapshot.reconciliation.totalExceptionAmountCents > 0
					? "critical"
					: "positive",
			value: formatCurrencyCents(
				snapshot.reconciliation.totalExceptionAmountCents
			),
		},
	];

	const cashLedgerMetricItems: MetricItem[] = [
		{ label: "Trust cash", value: formatCurrencyCents(cashTotals.trustCash) },
		{
			label: "Gross lender payable",
			value: formatCurrencyCents(cashTotals.grossLenderPayable),
		},
		{
			label: "Available lender payable",
			value: formatCurrencyCents(cashTotals.availableLenderPayable),
		},
		{
			label: "Unapplied cash",
			value: formatCurrencyCents(cashTotals.unappliedCash),
		},
		{ label: "Suspense", value: formatCurrencyCents(cashTotals.suspense) },
		{
			label: "Control alerts",
			tone: cashTotals.controlAlerts > 0 ? "critical" : "positive",
			value: formatInteger(cashTotals.controlAlerts),
		},
	];

	const opsHealthMetricItems: MetricItem[] = [
		{
			label: "Active incidents",
			tone:
				snapshot.opsHealth.summary.activeIncidents > 0
					? "critical"
					: "positive",
			value: formatInteger(snapshot.opsHealth.summary.activeIncidents),
		},
		{
			label: "Failed runs (24h)",
			tone:
				snapshot.opsHealth.summary.failedRunsLast24h > 0
					? "critical"
					: "positive",
			value: formatInteger(snapshot.opsHealth.summary.failedRunsLast24h),
		},
		{
			label: "Escalated healing",
			tone:
				snapshot.opsHealth.summary.escalatedHealingAttempts > 0
					? "critical"
					: "positive",
			value: formatInteger(snapshot.opsHealth.summary.escalatedHealingAttempts),
		},
		{
			label: "Schedules in sync error",
			tone:
				snapshot.opsHealth.summary.schedulesInSyncError > 0
					? "critical"
					: "positive",
			value: formatInteger(snapshot.opsHealth.summary.schedulesInSyncError),
		},
		{
			label: "Open integrity defects",
			tone:
				snapshot.opsHealth.summary.openIntegrityDefects > 0
					? "critical"
					: "positive",
			value: formatInteger(snapshot.opsHealth.summary.openIntegrityDefects),
		},
	];

	const filteredCards = useMemo(
		() =>
			snapshot.reconciliation.cards.filter((card) => {
				if (search.showOnlyExceptions && card.isHealthy) {
					return false;
				}
				if (search.type && card.category !== search.type) {
					return false;
				}
				return matchesText(search.search, [card.checkName, card.category]);
			}),
		[
			search.search,
			search.showOnlyExceptions,
			search.type,
			snapshot.reconciliation.cards,
		]
	);

	const selectedCard =
		filteredCards.find((card) => card.checkName === search.selectedCheck) ??
		filteredCards[0] ??
		null;
	const selectedExceptionRows = selectedCard?.rows ?? [];
	const selectedExceptionColumns = selectedCard?.columns ?? [];
	const selectedExceptionRow =
		selectedExceptionRows.find(
			(row, index) => buildRowId(row, index) === search.selectedId
		) ??
		selectedExceptionRows[0] ??
		null;

	const accountFamilyOptions = useMemo(
		() =>
			buildOptions(snapshot.chartOfAccounts.map((row) => row.accountFamily)),
		[snapshot.chartOfAccounts]
	);
	const entryTypeOptions = useMemo(
		() => buildOptions(snapshot.journalLines.map((row) => row.entryType)),
		[snapshot.journalLines]
	);
	const mortgageOptions = useMemo(
		() =>
			Array.from(
				new Map(
					snapshot.chartOfAccounts
						.filter((row) => row.mortgageId && row.mortgageLabel)
						.map((row) => [
							row.mortgageId as string,
							row.mortgageLabel as string,
						])
				).entries()
			)
				.sort((left, right) => left[1].localeCompare(right[1], "en"))
				.map(([value, label]) => ({ label, value })),
		[snapshot.chartOfAccounts]
	);

	const filteredAccounts = useMemo(
		() =>
			snapshot.chartOfAccounts.filter((row) => {
				if (search.status && row.accountFamily !== search.status) {
					return false;
				}
				if (search.mortgageId && row.mortgageId !== search.mortgageId) {
					return false;
				}
				if (search.borrowerId && row.borrowerId !== search.borrowerId) {
					return false;
				}
				if (search.lenderId && row.lenderId !== search.lenderId) {
					return false;
				}
				if (search.showOnlyExceptions && row.balanceCents === 0) {
					return false;
				}
				return matchesText(search.search, [
					row.accountId,
					row.accountCode,
					row.accountName,
					row.accountFamily,
					row.mortgageLabel,
					row.borrowerLabel,
					row.lenderLabel,
				]);
			}),
		[search, snapshot.chartOfAccounts]
	);

	const selectedAccount =
		filteredAccounts.find((row) => row.accountId === search.selectedId) ??
		filteredAccounts[0] ??
		null;
	const accountSummary =
		snapshot.trialBalance.find(
			(row) => row.accountId === selectedAccount?.accountId
		) ?? null;
	const register = useMemo(
		() =>
			buildAccountRegisterRows({
				account: selectedAccount,
				dateFrom: search.dateFrom,
				dateTo: search.dateTo,
				journalLines: snapshot.journalLines,
				mortgageId: search.mortgageId,
				search: search.search,
				showOnlyCorrections: search.showOnlyExceptions,
				type: search.type,
			}),
		[search, selectedAccount, snapshot.journalLines]
	);
	const selectedJournal =
		register.rows.find((row) => row.journalEntryId === selectedJournalId) ??
		register.rows[0] ??
		null;

	const filteredJobs = useMemo(
		() =>
			snapshot.opsHealth.jobs.filter((job) => {
				if (search.status && job.status !== search.status) {
					return false;
				}
				return matchesText(search.search, [job.jobKey, job.label, job.status]);
			}),
		[search.search, search.status, snapshot.opsHealth.jobs]
	);
	const filteredEvents = useMemo(
		() =>
			snapshot.opsHealth.events.filter((event) => {
				if (search.status && event.severity !== search.status) {
					return false;
				}
				if (search.type && event.sourceJob !== search.type) {
					return false;
				}
				if (
					!matchesDateRange(event.occurredAt, search.dateFrom, search.dateTo)
				) {
					return false;
				}
				if (search.showOnlyExceptions && event.severity === "info") {
					return false;
				}
				return matchesText(search.search, [
					event.eventId,
					event.title,
					event.summary,
					event.sourceJob,
				]);
			}),
		[
			search.dateFrom,
			search.dateTo,
			search.search,
			search.showOnlyExceptions,
			search.status,
			search.type,
			snapshot.opsHealth.events,
		]
	);
	const selectedOpsEvent =
		filteredEvents.find((event) => event.eventId === search.selectedId) ??
		filteredEvents[0] ??
		null;
	const selectedOpsJob =
		filteredJobs.find((job) => job.jobKey === search.selectedId) ??
		filteredJobs[0] ??
		null;

	const comparisonRows = useMemo(
		() =>
			compareValidationRows({
				expectedRows: activeValidationRows,
				financialLedger: snapshot,
				paymentOperations: paymentOperationsSnapshot,
			}),
		[activeValidationRows, paymentOperationsSnapshot, snapshot]
	);
	const filteredComparisonRows = useMemo(
		() =>
			comparisonRows.filter((row) => {
				if (search.status && row.status !== search.status) {
					return false;
				}
				if (search.type && row.subjectType !== search.type) {
					return false;
				}
				if (
					!matchesText(search.search, [
						row.subjectId,
						row.metric,
						row.subjectType,
					])
				) {
					return false;
				}
				return true;
			}),
		[comparisonRows, search.search, search.status, search.type]
	);
	const validationSummary = summarizeValidationComparisons(
		filteredComparisonRows
	);
	const selectedComparison =
		filteredComparisonRows.find(
			(row) =>
				`${row.subjectType}:${row.subjectId}:${row.metric}` ===
				search.selectedId
		) ??
		filteredComparisonRows[0] ??
		null;

	function updateSearch(patch: Partial<FinancialLedgerSearchState>) {
		setSearch((current) => ({ ...current, ...patch }));
	}

	async function handleValidationUpload(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		const text = await file.text();
		const rows = parseValidationCsv(text);
		setExpectedRows(rows);
		setActiveValidationRows(rows);
	}

	function addManualValidationRow() {
		const parsedAmount = validationDraft.expectedAmount.trim();
		const rows = parseValidationCsv(
			[
				"subject_type,subject_id,metric,effective_date,expected_amount",
				[
					validationDraft.subjectType,
					validationDraft.subjectId,
					validationDraft.metric,
					validationDraft.effectiveDate,
					parsedAmount,
				].join(","),
			].join("\n")
		);
		if (rows.length === 0) {
			return;
		}
		setExpectedRows((current) => [...current, ...rows]);
		setValidationDraft({
			effectiveDate: "",
			expectedAmount: "",
			metric: validationDraft.metric,
			subjectId: "",
			subjectType: validationDraft.subjectType,
		});
	}

	function runValidationFromPaste() {
		const rows = parseValidationCsv(validationText);
		setExpectedRows(rows);
		setActiveValidationRows(rows);
	}

	let metricItems = reconciliationMetricItems;
	if (search.tab === "cash-ledger") {
		metricItems = cashLedgerMetricItems;
	} else if (search.tab === "ops-health") {
		metricItems = opsHealthMetricItems;
	} else if (search.tab === "validation") {
		metricItems = [
			{
				label: "Rows compared",
				value: formatInteger(validationSummary.rowsCompared),
			},
			{
				label: "Exact matches",
				tone: "positive",
				value: formatInteger(validationSummary.exactMatches),
			},
			{
				label: "Mismatches",
				tone: validationSummary.mismatches > 0 ? "critical" : "positive",
				value: formatInteger(validationSummary.mismatches),
			},
			{
				label: "Absolute variance",
				tone:
					validationSummary.totalAbsoluteVarianceCents > 0
						? "critical"
						: "positive",
				value: formatCurrencyCents(
					validationSummary.totalAbsoluteVarianceCents
				),
			},
			{
				label: "Largest variance",
				tone:
					validationSummary.largestVarianceCents > 0 ? "critical" : "positive",
				value: formatCurrencyCents(validationSummary.largestVarianceCents),
			},
			{
				label: "Unresolved",
				tone:
					validationSummary.unresolvedVariances > 0 ? "critical" : "positive",
				value: formatInteger(validationSummary.unresolvedVariances),
			},
		];
	} else if (search.tab === "ownership-ledger") {
		metricItems = [
			{
				label: "Active positions",
				value: formatInteger(
					snapshot.ownershipLedger?.activePositionAccounts ?? 0
				),
			},
			{
				label: "Mortgages with positions",
				value: formatInteger(
					snapshot.ownershipLedger?.mortgagesWithPositions ?? 0
				),
			},
			{
				label: "Pending deals",
				tone:
					(snapshot.ownershipLedger?.pendingDealsAffectingOwnership ?? 0) > 0
						? "warning"
						: "default",
				value: formatInteger(
					snapshot.ownershipLedger?.pendingDealsAffectingOwnership ?? 0
				),
			},
			{
				label: "Cash / ownership split",
				value: "Separate",
				description:
					"Ownership context is surfaced here without mixing unit ledger and cash journal truth.",
			},
		];
	}

	const genericCategoryOptions = useMemo(
		() =>
			search.tab === "reconciliation"
				? buildOptions(
						snapshot.reconciliation.cards.map((card) => card.category)
					)
				: search.tab === "cash-ledger"
					? entryTypeOptions
					: search.tab === "ops-health"
						? buildOptions(
								snapshot.opsHealth.events.map((event) => event.sourceJob)
							)
						: buildOptions(
								filteredComparisonRows.map((row) => row.subjectType)
							),
		[
			entryTypeOptions,
			filteredComparisonRows,
			search.tab,
			snapshot.opsHealth.events,
			snapshot.reconciliation.cards,
		]
	);

	const genericStatusOptions = useMemo(
		() =>
			search.tab === "cash-ledger"
				? [{ label: "All families", value: "__all__" }, ...accountFamilyOptions]
				: search.tab === "ops-health"
					? [
							{ label: "All severities", value: "__all__" },
							...buildOptions(
								snapshot.opsHealth.events.map((event) => event.severity)
							),
						]
					: search.tab === "validation"
						? [
								{ label: "All statuses", value: "__all__" },
								...buildOptions(
									filteredComparisonRows.map((row) => row.status)
								),
							]
						: [{ label: "All statuses", value: "__all__" }],
		[
			accountFamilyOptions,
			filteredComparisonRows,
			search.tab,
			snapshot.opsHealth.events,
		]
	);

	let content: ReactNode = null;

	if (search.tab === "reconciliation") {
		const exceptionColumns: TableColumn<
			Record<string, boolean | null | number | string>
		>[] = selectedExceptionColumns.map((column) => ({
			header: humanizeLabel(column),
			id: column,
			render: (row) => String(row[column] ?? "—"),
		}));

		content = (
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
				<div className="space-y-6">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{filteredCards.map((card) => (
							<button
								className="rounded-xl border p-4 text-left hover:border-primary/40 hover:bg-muted/40"
								key={card.checkName}
								onClick={() =>
									updateSearch({
										selectedCheck: card.checkName,
										selectedId: undefined,
									})
								}
								type="button"
							>
								<div className="flex items-center justify-between gap-2">
									<div className="font-medium text-sm">{card.checkName}</div>
									<StatusBadge
										label={card.isHealthy ? "healthy" : "exception"}
										variant={card.isHealthy ? "default" : "destructive"}
									/>
								</div>
								<div className="mt-3 font-semibold text-2xl">
									{formatInteger(card.count)}
								</div>
								<div className="mt-1 text-muted-foreground text-sm">
									{formatCurrencyCents(card.totalAmountCents)}
								</div>
								<div className="mt-3 space-y-1 text-muted-foreground text-xs">
									{card.preview.slice(0, 3).map((preview) => (
										<div key={preview}>{preview}</div>
									))}
								</div>
							</button>
						))}
					</div>

					<SectionCard
						description={
							selectedCard
								? `${selectedCard.checkName} exceptions with full row payloads for triage and deep-linking.`
								: "Choose a reconciliation card to inspect exceptions."
						}
						title={
							selectedCard
								? `${selectedCard.checkName} (${selectedCard.count})`
								: "Exceptions"
						}
					>
						{selectedCard ? (
							<DataTableCard
								columns={exceptionColumns}
								emptyMessage="This reconciliation check is healthy."
								onRowSelect={(row) =>
									updateSearch({
										selectedId: buildRowId(
											row,
											selectedExceptionRows.indexOf(row)
										),
									})
								}
								rowKey={(row) =>
									buildRowId(row, selectedExceptionRows.indexOf(row))
								}
								rows={selectedExceptionRows}
								selectedRowId={
									selectedExceptionRow
										? buildRowId(
												selectedExceptionRow,
												selectedExceptionRows.indexOf(selectedExceptionRow)
											)
										: undefined
								}
							/>
						) : (
							<div className="p-6">
								<EmptyDetailState
									description="Choose a reconciliation card above to inspect the exception rows."
									title="No check selected"
								/>
							</div>
						)}
					</SectionCard>
				</div>

				<DetailRail
					description="Exception-first triage with deep links into the owning records."
					title={
						selectedCard ? selectedCard.checkName : "Reconciliation detail"
					}
				>
					{selectedCard ? (
						<>
							<KeyValueList
								items={[
									{
										label: "Category",
										value: humanizeLabel(selectedCard.category),
									},
									{
										label: "Checked at",
										value: formatDateTime(selectedCard.checkedAt),
									},
									{ label: "Count", value: formatInteger(selectedCard.count) },
									{
										label: "Total amount",
										value: formatCurrencyCents(selectedCard.totalAmountCents),
									},
									{
										label: "Health",
										value: (
											<StatusBadge
												label={selectedCard.isHealthy ? "healthy" : "exception"}
												variant={
													selectedCard.isHealthy ? "default" : "destructive"
												}
											/>
										),
									},
								]}
							/>
							{selectedExceptionRow ? (
								<KeyValueList
									items={Object.entries(selectedExceptionRow).map(
										([label, value]) => ({
											label: humanizeLabel(label),
											value:
												typeof value === "string" && value.length > 18 ? (
													<InlineCode value={value} />
												) : (
													String(value)
												),
										})
									)}
								/>
							) : null}
						</>
					) : (
						<EmptyDetailState
							description="Select a reconciliation card to see the summary and row payloads."
							title="No check selected"
						/>
					)}
				</DetailRail>
			</div>
		);
	} else if (search.tab === "cash-ledger") {
		const registerColumns: TableColumn<
			LedgerJournalLine & {
				counterAccountName: string;
				runningBalanceCents: number;
			}
		>[] = [
			{
				header: "Effective date",
				id: "effectiveDate",
				render: (row) => row.effectiveDate,
			},
			{
				header: "Timestamp",
				id: "timestampUtc",
				render: (row) => formatDateTime(row.timestampUtc),
			},
			{
				header: "Sequence",
				id: "sequenceNumber",
				render: (row) => formatInteger(row.sequenceNumber),
			},
			{
				header: "Entry type",
				id: "entryType",
				render: (row) => humanizeLabel(row.entryType),
			},
			{
				header: "Counter account",
				id: "counter",
				render: (row) => row.counterAccountName,
			},
			{
				align: "right",
				header: "Amount",
				id: "amount",
				render: (row) =>
					formatCurrencyCents(
						row.lineRole === "debit" ? row.debitCents : row.creditCents
					),
			},
			{
				align: "right",
				header: "Running balance",
				id: "runningBalance",
				render: (row) => formatCurrencyCents(row.runningBalanceCents),
			},
			{
				header: "Posting group",
				id: "postingGroupId",
				render: (row) => row.postingGroupId ?? "—",
			},
			{
				header: "Source",
				id: "source",
				render: (row) => humanizeLabel(row.sourceChannel),
			},
		];

		content = (
			<div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
				<SectionCard
					description="Grouped chart of accounts for cash-ledger families."
					title={`Chart of Accounts (${filteredAccounts.length})`}
				>
					<div className="max-h-[70vh] overflow-y-auto p-2">
						{filteredAccounts.map((account) => (
							<button
								className={
									account.accountId === selectedAccount?.accountId
										? "mb-2 w-full rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-left"
										: "mb-2 w-full rounded-lg border px-3 py-3 text-left hover:bg-muted/40"
								}
								key={account.accountId}
								onClick={() =>
									updateSearch({
										selectedId: account.accountId,
									})
								}
								type="button"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="space-y-1">
										<div className="font-medium text-sm">
											{account.accountName}
										</div>
										<div className="text-muted-foreground text-xs">
											{account.accountCode}
										</div>
									</div>
									<StatusBadge
										label={account.accountFamily}
										variant="outline"
									/>
								</div>
								<div className="mt-3 flex items-center justify-between gap-3">
									<div className="text-muted-foreground text-xs">
										{account.lastActivityAt
											? `Last activity ${formatDateTime(account.lastActivityAt)}`
											: "No activity yet"}
									</div>
									<div className="font-semibold text-sm">
										{formatCurrencyCents(account.balanceCents)}
									</div>
								</div>
							</button>
						))}
					</div>
				</SectionCard>

				<SectionCard
					description={
						selectedAccount
							? `${selectedAccount.accountName} register with journal history and running balance.`
							: "Select an account to inspect its register."
					}
					title={selectedAccount ? selectedAccount.accountName : "Register"}
				>
					<div className="space-y-4 p-4">
						{selectedAccount && accountSummary ? (
							<div className="grid gap-3 md:grid-cols-3">
								<div className="rounded-lg border p-3">
									<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
										Opening balance
									</div>
									<div className="mt-2 font-semibold text-lg">
										{formatCurrencyCents(register.openingBalanceCents)}
									</div>
								</div>
								<div className="rounded-lg border p-3">
									<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
										Closing balance
									</div>
									<div className="mt-2 font-semibold text-lg">
										{formatCurrencyCents(accountSummary.closingBalanceCents)}
									</div>
								</div>
								<div className="rounded-lg border p-3">
									<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
										Entries in range
									</div>
									<div className="mt-2 font-semibold text-lg">
										{formatInteger(register.rows.length)}
									</div>
								</div>
							</div>
						) : null}
					</div>
					<DataTableCard
						columns={registerColumns}
						emptyMessage="No journal lines match the current account and filters."
						onRowSelect={(row) => setSelectedJournalId(row.journalEntryId)}
						rowKey={(row) => `${row.journalEntryId}:${row.lineNumber}`}
						rows={register.rows}
						selectedRowId={
							selectedJournal
								? `${selectedJournal.journalEntryId}:${selectedJournal.lineNumber}`
								: undefined
						}
					/>
				</SectionCard>

				<DetailRail
					description="Journal detail and supporting references for the selected row."
					title={
						selectedJournal
							? `Journal ${selectedJournal.journalEntryId}`
							: "Journal detail"
					}
				>
					{selectedJournal ? (
						<KeyValueList
							items={[
								{
									label: "Journal entry ID",
									value: <InlineCode value={selectedJournal.journalEntryId} />,
								},
								{
									label: "Line role",
									value: humanizeLabel(selectedJournal.lineRole),
								},
								{
									label: "Entry type",
									value: humanizeLabel(selectedJournal.entryType),
								},
								{ label: "Reference", value: selectedJournal.reference },
								{ label: "Description", value: selectedJournal.description },
								{
									label: "Amount",
									value: formatCurrencyCents(
										selectedJournal.lineRole === "debit"
											? selectedJournal.debitCents
											: selectedJournal.creditCents
									),
								},
								{
									label: "Posting group",
									value: selectedJournal.postingGroupId ?? "—",
								},
								{
									label: "Transfer",
									value: selectedJournal.transferRequestId ?? "—",
								},
								{
									label: "Mortgage",
									value: selectedJournal.mortgageLabel ?? "—",
								},
								{
									label: "Obligation",
									value: selectedJournal.obligationId ?? "—",
								},
								{
									label: "Counterparty borrower",
									value: selectedJournal.borrowerLabel ?? "—",
								},
								{
									label: "Counterparty lender",
									value: selectedJournal.lenderLabel ?? "—",
								},
								{
									label: "Timestamp",
									value: formatDateTime(selectedJournal.timestampUtc),
								},
							]}
						/>
					) : (
						<EmptyDetailState
							description="Select a journal line to inspect posting group and source metadata."
							title="No journal line selected"
						/>
					)}
				</DetailRail>
			</div>
		);
	} else if (search.tab === "ops-health") {
		const jobColumns: TableColumn<(typeof filteredJobs)[number]>[] = [
			{ header: "Job", id: "label", render: (row) => row.label },
			{
				header: "Status",
				id: "status",
				render: (row) => <StatusBadge label={row.status} />,
			},
			{
				align: "right",
				header: "Open items",
				id: "openItemCount",
				render: (row) => formatInteger(row.openItemCount),
			},
			{
				header: "Last observed",
				id: "lastObservedAt",
				render: (row) => formatDateTime(row.lastObservedAt),
			},
		];
		const eventColumns: TableColumn<(typeof filteredEvents)[number]>[] = [
			{
				header: "Severity",
				id: "severity",
				render: (row) => <StatusBadge label={row.severity} />,
			},
			{
				header: "Source job",
				id: "sourceJob",
				render: (row) => humanizeLabel(row.sourceJob),
			},
			{ header: "Title", id: "title", render: (row) => row.title },
			{
				header: "Related entity",
				id: "relatedResource",
				render: (row) => `${row.relatedResourceType}:${row.relatedResourceId}`,
			},
			{
				header: "Occurred",
				id: "occurredAt",
				render: (row) => formatDateTime(row.occurredAt),
			},
		];

		content = (
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
				<div className="space-y-6">
					<SectionCard
						description="Recurring jobs and self-healing loops surfaced from persisted operational facts."
						title="Job Health Board"
					>
						<DataTableCard
							columns={jobColumns}
							emptyMessage="No operational jobs match the current filters."
							onRowSelect={(row) => updateSearch({ selectedId: row.jobKey })}
							rowKey={(row) => row.jobKey}
							rows={filteredJobs}
							selectedRowId={selectedOpsJob?.jobKey}
						/>
					</SectionCard>
					<SectionCard
						description="Newest persisted incidents and escalations first."
						title="Incident Feed"
					>
						<DataTableCard
							columns={eventColumns}
							emptyMessage="No incidents match the current filters."
							onRowSelect={(row) => updateSearch({ selectedId: row.eventId })}
							rowKey={(row) => row.eventId}
							rows={filteredEvents}
							selectedRowId={selectedOpsEvent?.eventId}
						/>
					</SectionCard>
				</div>
				<DetailRail
					description="Structured incident detail with links back into the affected resource."
					title={
						selectedOpsEvent
							? selectedOpsEvent.title
							: selectedOpsJob
								? selectedOpsJob.label
								: "Ops Health detail"
					}
				>
					{selectedOpsEvent ? (
						<KeyValueList
							items={[
								{
									label: "Event ID",
									value: <InlineCode value={selectedOpsEvent.eventId} />,
								},
								{
									label: "Severity",
									value: <StatusBadge label={selectedOpsEvent.severity} />,
								},
								{
									label: "Source job",
									value: humanizeLabel(selectedOpsEvent.sourceJob),
								},
								{
									label: "Status",
									value: <StatusBadge label={selectedOpsEvent.status} />,
								},
								{
									label: "Occurred at",
									value: formatDateTime(selectedOpsEvent.occurredAt),
								},
								{
									label: "Related resource",
									value: `${selectedOpsEvent.relatedResourceType}:${selectedOpsEvent.relatedResourceId}`,
								},
								{ label: "Summary", value: selectedOpsEvent.summary },
							]}
						/>
					) : selectedOpsJob ? (
						<KeyValueList
							items={[
								{
									label: "Job key",
									value: <InlineCode value={selectedOpsJob.jobKey} />,
								},
								{
									label: "Status",
									value: <StatusBadge label={selectedOpsJob.status} />,
								},
								{
									label: "Open items",
									value: formatInteger(selectedOpsJob.openItemCount),
								},
								{
									label: "Last observed",
									value: formatDateTime(selectedOpsJob.lastObservedAt),
								},
							]}
						/>
					) : (
						<EmptyDetailState
							description="Select a job or incident row to inspect the persisted operational detail."
							title="Nothing selected"
						/>
					)}
				</DetailRail>
			</div>
		);
	} else if (search.tab === "validation") {
		const comparisonColumns: TableColumn<ValidationComparisonRow>[] = [
			{
				header: "Subject type",
				id: "subjectType",
				render: (row) => humanizeLabel(row.subjectType),
			},
			{
				header: "Subject ID",
				id: "subjectId",
				render: (row) => <InlineCode value={row.subjectId} />,
			},
			{
				header: "Metric",
				id: "metric",
				render: (row) => humanizeLabel(row.metric),
			},
			{
				header: "Effective date",
				id: "effectiveDate",
				render: (row) => row.effectiveDate ?? "—",
			},
			{
				align: "right",
				header: "Expected",
				id: "expectedAmount",
				render: (row) =>
					row.expectedAmountCents === null
						? "—"
						: formatCurrencyCents(row.expectedAmountCents),
			},
			{
				align: "right",
				header: "Actual",
				id: "actualAmount",
				render: (row) =>
					row.actualAmountCents === null
						? "—"
						: formatCurrencyCents(row.actualAmountCents),
			},
			{
				align: "right",
				header: "Variance",
				id: "variance",
				render: (row) =>
					row.varianceCents === null
						? "—"
						: formatCurrencyCents(row.varianceCents),
			},
			{
				header: "Status",
				id: "status",
				render: (row) => <StatusBadge label={row.status} />,
			},
		];

		content = (
			<div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
				<SectionCard
					description="Upload spreadsheet-derived expectations or enter rows manually. Expected rows stay in client state only."
					title="Validation Input"
				>
					<div className="space-y-4 p-4">
						<div className="flex flex-wrap gap-2">
							{(["upload", "paste", "manual"] as ValidationInputMode[]).map(
								(mode) => (
									<button
										className={
											validationMode === mode
												? "rounded-full bg-primary px-3 py-1.5 text-primary-foreground text-sm"
												: "rounded-full border px-3 py-1.5 text-sm"
										}
										key={mode}
										onClick={() => setValidationMode(mode)}
										type="button"
									>
										{humanizeLabel(mode)}
									</button>
								)
							)}
						</div>

						{validationMode === "upload" ? (
							<div className="space-y-2">
								<Label htmlFor="validation-upload">Upload CSV from Excel</Label>
								<Input
									accept=".csv,text/csv"
									id="validation-upload"
									onChange={(event) => void handleValidationUpload(event)}
									type="file"
								/>
							</div>
						) : null}

						{validationMode === "paste" ? (
							<div className="space-y-2">
								<Label htmlFor="validation-paste">Paste tabular data</Label>
								<Textarea
									id="validation-paste"
									onChange={(event) => setValidationText(event.target.value)}
									placeholder="Paste CSV with subject_type, subject_id, metric, effective_date, expected_amount"
									rows={12}
									value={validationText}
								/>
								<Button
									onClick={runValidationFromPaste}
									size="sm"
									variant="outline"
								>
									Load pasted rows
								</Button>
							</div>
						) : null}

						{validationMode === "manual" ? (
							<div className="space-y-3">
								<div className="space-y-2">
									<Label htmlFor="manual-subject-type">Subject type</Label>
									<Input
										id="manual-subject-type"
										onChange={(event) =>
											setValidationDraft((current) => ({
												...current,
												subjectType: event.target.value,
											}))
										}
										value={validationDraft.subjectType}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="manual-subject-id">Subject ID</Label>
									<Input
										id="manual-subject-id"
										onChange={(event) =>
											setValidationDraft((current) => ({
												...current,
												subjectId: event.target.value,
											}))
										}
										value={validationDraft.subjectId}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="manual-metric">Metric</Label>
									<Input
										id="manual-metric"
										onChange={(event) =>
											setValidationDraft((current) => ({
												...current,
												metric: event.target.value,
											}))
										}
										value={validationDraft.metric}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="manual-amount">Expected amount (CAD)</Label>
									<Input
										id="manual-amount"
										inputMode="decimal"
										onChange={(event) =>
											setValidationDraft((current) => ({
												...current,
												expectedAmount: event.target.value,
											}))
										}
										value={validationDraft.expectedAmount}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="manual-date">Effective date</Label>
									<Input
										id="manual-date"
										onChange={(event) =>
											setValidationDraft((current) => ({
												...current,
												effectiveDate: event.target.value,
											}))
										}
										type="date"
										value={validationDraft.effectiveDate}
									/>
								</div>
								<Button
									onClick={addManualValidationRow}
									size="sm"
									variant="outline"
								>
									Add row
								</Button>
							</div>
						) : null}

						<div className="rounded-lg border p-3 text-sm">
							<div className="font-medium">Loaded expected rows</div>
							<div className="mt-2 text-muted-foreground">
								{formatInteger(expectedRows.length)} rows currently in client
								state.
							</div>
							<div className="mt-3 flex gap-2">
								<Button
									onClick={() => setActiveValidationRows(expectedRows)}
									size="sm"
								>
									Run comparison
								</Button>
								<Button
									onClick={() => {
										setExpectedRows([]);
										setActiveValidationRows([]);
									}}
									size="sm"
									variant="outline"
								>
									Clear
								</Button>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard
					description="Spreadsheet-vs-system comparison over live ledger actuals."
					title={`Comparison (${filteredComparisonRows.length})`}
				>
					<DataTableCard
						columns={comparisonColumns}
						emptyMessage="Load expected rows, then run the comparison."
						onRowSelect={(row) =>
							updateSearch({
								selectedId: `${row.subjectType}:${row.subjectId}:${row.metric}`,
							})
						}
						rowKey={(row) =>
							`${row.subjectType}:${row.subjectId}:${row.metric}`
						}
						rows={filteredComparisonRows}
						selectedRowId={
							selectedComparison
								? `${selectedComparison.subjectType}:${selectedComparison.subjectId}:${selectedComparison.metric}`
								: undefined
						}
					/>
				</SectionCard>

				<DetailRail
					description="Selected variance with both expected input and actual ledger-derived values."
					title={
						selectedComparison
							? `${selectedComparison.subjectType}:${selectedComparison.subjectId}`
							: "Variance detail"
					}
				>
					{selectedComparison ? (
						<KeyValueList
							items={[
								{
									label: "Subject type",
									value: humanizeLabel(selectedComparison.subjectType),
								},
								{
									label: "Subject ID",
									value: <InlineCode value={selectedComparison.subjectId} />,
								},
								{
									label: "Metric",
									value: humanizeLabel(selectedComparison.metric),
								},
								{
									label: "Expected",
									value:
										selectedComparison.expectedAmountCents === null
											? "—"
											: formatCurrencyCents(
													selectedComparison.expectedAmountCents
												),
								},
								{
									label: "Actual",
									value:
										selectedComparison.actualAmountCents === null
											? "—"
											: formatCurrencyCents(
													selectedComparison.actualAmountCents
												),
								},
								{
									label: "Variance",
									value:
										selectedComparison.varianceCents === null
											? "—"
											: formatCurrencyCents(selectedComparison.varianceCents),
								},
								{
									label: "Variance %",
									value:
										selectedComparison.variancePercent === null
											? "—"
											: `${selectedComparison.variancePercent.toFixed(2)}%`,
								},
								{
									label: "Status",
									value: <StatusBadge label={selectedComparison.status} />,
								},
								{
									label: "Source row",
									value: selectedComparison.sourceRowReference ?? "—",
								},
							]}
						/>
					) : (
						<EmptyDetailState
							description="Select a variance row to inspect the diff payload."
							title="No comparison selected"
						/>
					)}
				</DetailRail>
			</div>
		);
	} else {
		content = (
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
				<SectionCard
					description="Ownership context is surfaced here without merging unit ledger and cash accounting into one table."
					title="Ownership Ledger Context"
				>
					<div className="space-y-4 p-4 text-sm">
						<p>
							This tab keeps the ownership ledger visible to operators while
							preserving the core boundary: unit positions live in the ownership
							ledger, and money movement lives in the cash ledger.
						</p>
						<div className="grid gap-3 md:grid-cols-3">
							<div className="rounded-lg border p-3">
								<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
									Active positions
								</div>
								<div className="mt-2 font-semibold text-2xl">
									{formatInteger(
										snapshot.ownershipLedger?.activePositionAccounts ?? 0
									)}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
									Mortgages with positions
								</div>
								<div className="mt-2 font-semibold text-2xl">
									{formatInteger(
										snapshot.ownershipLedger?.mortgagesWithPositions ?? 0
									)}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
									Pending deals affecting ownership
								</div>
								<div className="mt-2 font-semibold text-2xl">
									{formatInteger(
										snapshot.ownershipLedger?.pendingDealsAffectingOwnership ??
											0
									)}
								</div>
							</div>
						</div>
					</div>
				</SectionCard>
				<DetailRail
					description="Use the existing admin deal and mortgage routes for full ownership detail."
					title="Deep links"
				>
					<KeyValueList
						items={[
							{
								label: "Deals board",
								value: (
									<Link
										className="text-primary text-sm underline"
										search={(current) => buildAdminDetailLinkSearch(current)}
										to="/admin/deals"
									>
										Open admin deals
									</Link>
								),
							},
							{
								label: "Mortgages",
								value: (
									<Link
										className="text-primary text-sm underline"
										search={(current) => buildAdminDetailLinkSearch(current)}
										to="/admin/mortgages"
									>
										Open mortgages
									</Link>
								),
							},
							{
								label: "Why separate tabs",
								value:
									"Ownership unit positions and cash movement have different invariants, audit requirements, and operator questions.",
							},
						]}
					/>
				</DetailRail>
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
			<PageHeader
				actions={
					<>
						<Button
							onClick={() => void onRefresh()}
							size="sm"
							variant="outline"
						>
							<RefreshCw className="size-4" />
							Refresh
						</Button>
						<Button
							onClick={() => {
								if (search.tab === "cash-ledger") {
									downloadCsv(
										"chart-of-accounts.csv",
										buildChartOfAccountsCsv(snapshot.chartOfAccounts)
									);
									downloadCsv(
										"journal-lines.csv",
										buildJournalLinesCsv(snapshot.journalLines)
									);
									downloadCsv(
										"trial-balance.csv",
										buildTrialBalanceCsv(snapshot.trialBalance)
									);
									return;
								}
								if (search.tab === "reconciliation") {
									downloadCsv(
										"ledger-exceptions.csv",
										buildExceptionCsv(snapshot, search.selectedCheck)
									);
									return;
								}
								if (search.tab === "ops-health") {
									downloadCsv(
										"ops-incidents.csv",
										buildOpsIncidentsCsv(snapshot)
									);
									return;
								}
								if (search.tab === "validation") {
									downloadCsv(
										"validation-diff.csv",
										buildValidationDiffCsv(filteredComparisonRows)
									);
								}
							}}
							size="sm"
							variant="outline"
						>
							<Download className="size-4" />
							Export CSV
						</Button>
						<Button
							onClick={() =>
								downloadCsv(
									"reconciliation-exceptions.csv",
									buildExceptionCsv(snapshot, search.selectedCheck)
								)
							}
							size="sm"
							variant="outline"
						>
							<ShieldAlert className="size-4" />
							Export exceptions
						</Button>
						<Button asChild size="sm" variant="outline">
							<Link
								search={(current) =>
									buildPaymentOperationsLinkSearch(current, {
										selectedCheck: undefined,
										selectedId: undefined,
										tab: "obligations",
									})
								}
								to="/admin/payment-operations"
							>
								<ExternalLink className="size-4" />
								Open Payment Operations
							</Link>
						</Button>
					</>
				}
				description="Cash ledger, reconciliation controls, ops health, spreadsheet validation, and ownership context. This page is exception-first and keeps accounting evidence separate from workflow state."
				eyebrow={
					<StatusBadge
						label={`As of ${formatDateTime(snapshot.generatedAt)}`}
						variant="outline"
					/>
				}
				title="Financial Ledger"
			/>

			<MetricStrip items={metricItems} />

			<div className="flex flex-wrap gap-2">
				{(Object.entries(TAB_LABELS) as [FinancialLedgerTab, string][]).map(
					([tab, label]) =>
						renderTabButton({
							currentTab: search.tab,
							label,
							onSelect: () =>
								setSearch((current) => ({
									...current,
									selectedCheck: undefined,
									selectedId: undefined,
									status: undefined,
									tab,
									type: undefined,
								})),
							tab,
						})
				)}
			</div>

			<FilterBar>
				<FilterField label="Search">
					<FilterTextInput
						onChange={(event) =>
							updateSearch({ search: event.target.value || undefined })
						}
						placeholder="Search IDs, refs, posting groups, check names"
						value={search.search ?? ""}
					/>
				</FilterField>
				<FilterField label={search.tab === "cash-ledger" ? "Family" : "Status"}>
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({ status: value === "__all__" ? undefined : value })
						}
						options={genericStatusOptions}
						placeholder="All"
						value={search.status ?? "__all__"}
					/>
				</FilterField>
				<FilterField
					label={
						search.tab === "reconciliation"
							? "Category"
							: search.tab === "cash-ledger"
								? "Entry type"
								: search.tab === "ops-health"
									? "Source job"
									: "Subject type"
					}
				>
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({ type: value === "__all__" ? undefined : value })
						}
						options={[
							{ label: "All", value: "__all__" },
							...genericCategoryOptions,
						]}
						placeholder="All"
						value={search.type ?? "__all__"}
					/>
				</FilterField>
				<FilterField label="Mortgage">
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({
								mortgageId: value === "__all__" ? undefined : value,
							})
						}
						options={[
							{ label: "All mortgages", value: "__all__" },
							...mortgageOptions,
						]}
						placeholder="All mortgages"
						value={search.mortgageId ?? "__all__"}
					/>
				</FilterField>
				<FilterField label="From">
					<FilterDateInput
						onChange={(event) =>
							updateSearch({ dateFrom: event.target.value || undefined })
						}
						value={search.dateFrom ?? ""}
					/>
				</FilterField>
				<FilterField label="To">
					<FilterDateInput
						onChange={(event) =>
							updateSearch({ dateTo: event.target.value || undefined })
						}
						value={search.dateTo ?? ""}
					/>
				</FilterField>
				<FilterSwitch
					checked={search.showOnlyExceptions}
					label={
						search.tab === "cash-ledger"
							? "Only corrections / reversals"
							: "Show only exceptions"
					}
					onCheckedChange={(checked) =>
						updateSearch({ showOnlyExceptions: checked })
					}
				/>
			</FilterBar>

			{content}
		</div>
	);
}
