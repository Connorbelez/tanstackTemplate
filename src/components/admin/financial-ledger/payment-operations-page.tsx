import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, Landmark, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Button } from "#/components/ui/button";
import type { AdminDetailSearch } from "#/lib/admin-detail-search";
import { useAuthorization } from "#/lib/auth";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	ExecutePlanEntryDialog,
	ReschedulePlanEntryDialog,
} from "../../demo/amps/dialogs";
import { WaiveBalanceDialog, WriteOffBalanceDialog } from "./actions";
import { downloadCsv, rowsToCsv } from "./csv";
import {
	formatCurrencyCents,
	formatDateOnly,
	formatDateTime,
	formatInteger,
	humanizeLabel,
} from "./format";
import type {
	FinancialLedgerSearchState,
	MetricItem,
	PaymentCollectionAttemptRow,
	PaymentCollectionPlanEntryRow,
	PaymentOperationsObligationRow,
	PaymentOperationsSearchState,
	PaymentOperationsSnapshot,
	PaymentOperationsTab,
	PaymentOperationsTransferRow,
} from "./types";
import {
	ActionButtonRow,
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

interface PaymentOperationsPageProps {
	onRefresh: () => Promise<unknown>;
	search: PaymentOperationsSearchState;
	setSearch: (
		updater: (
			current: PaymentOperationsSearchState
		) => PaymentOperationsSearchState
	) => void;
	snapshot: PaymentOperationsSnapshot;
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

const TAB_LABELS: Record<PaymentOperationsTab, string> = {
	collections: "Collections",
	"collection-plans": "Collection Plans",
	obligations: "Obligations",
	transfers: "Transfers",
};

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

function parseLocalDateStart(date: string) {
	return Date.parse(`${date}T00:00:00.000`);
}

function parseLocalDateEnd(date: string) {
	return Date.parse(`${date}T23:59:59.999`);
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
		const fromMs = parseLocalDateStart(dateFrom);
		if (!Number.isNaN(fromMs) && timestamp < fromMs) {
			return false;
		}
	}

	if (dateTo) {
		const toMs = parseLocalDateEnd(dateTo);
		if (!Number.isNaN(toMs) && timestamp > toMs) {
			return false;
		}
	}

	return true;
}

function matchesObligationFilters(
	row: PaymentOperationsObligationRow,
	search: PaymentOperationsSearchState
) {
	return (
		(!search.status || row.status === search.status) &&
		(!search.type || row.type === search.type) &&
		(!search.mortgageId || row.mortgageId === search.mortgageId) &&
		(!search.borrowerId || row.borrowerId === search.borrowerId) &&
		(!search.showOnlyExceptions || row.hasJournalDrift || row.isCorrective) &&
		matchesDateRange(row.dueDate, search.dateFrom, search.dateTo) &&
		matchesText(search.search, [
			row.obligationId,
			row.mortgageLabel,
			row.borrowerLabel,
			row.type,
			row.status,
		])
	);
}

function matchesCollectionFilters(
	row: PaymentCollectionAttemptRow,
	search: PaymentOperationsSearchState
) {
	return (
		(!search.status || row.status === search.status) &&
		(!search.type || row.method === search.type) &&
		(!search.mortgageId || row.mortgageId === search.mortgageId) &&
		(!search.showOnlyExceptions || row.reconciliation?.isHealthy === false) &&
		matchesDateRange(row.initiatedAt, search.dateFrom, search.dateTo) &&
		matchesText(search.search, [
			row.collectionAttemptId,
			row.executionIdempotencyKey,
			...row.obligationIds,
			row.transfer?.providerRef,
			row.status,
			row.triggerSource,
		])
	);
}

function matchesTransferFilters(
	row: PaymentOperationsTransferRow,
	search: PaymentOperationsSearchState
) {
	return (
		(!search.status || row.status === search.status) &&
		(!search.type || row.transferType === search.type) &&
		(!search.mortgageId || row.mortgageId === search.mortgageId) &&
		(!search.lenderId || row.lenderId === search.lenderId) &&
		(!search.borrowerId || row.borrowerId === search.borrowerId) &&
		(!search.showOnlyExceptions || row.journalIntegrity !== "linked") &&
		matchesDateRange(row.createdAt, search.dateFrom, search.dateTo) &&
		matchesText(search.search, [
			row.transferId,
			row.counterpartyLabel,
			row.providerCode,
			row.providerRef,
			row.mortgageLabel,
		])
	);
}

function matchesCollectionPlanFilters(
	row: PaymentCollectionPlanEntryRow,
	search: PaymentOperationsSearchState
) {
	return (
		(!search.status || row.status === search.status) &&
		(!search.type || row.source === search.type) &&
		(!search.mortgageId || row.mortgageId === search.mortgageId) &&
		(!search.showOnlyExceptions ||
			Boolean(row.balancePreCheck.decision || row.workoutPlan)) &&
		matchesDateRange(row.scheduledDate, search.dateFrom, search.dateTo) &&
		matchesText(search.search, [
			row.planEntryId,
			row.source,
			row.createdByRule?.displayName,
			row.workoutPlan?.name,
		])
	);
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

function buildFinancialLedgerLinkSearch(
	current: LinkSearchSeed,
	patch: Partial<FinancialLedgerSearchState>
): FinancialLedgerSearchState {
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
			current.tab === "cash-ledger" ||
			current.tab === "ops-health" ||
			current.tab === "ownership-ledger" ||
			current.tab === "validation"
				? current.tab
				: "reconciliation",
		type: current.type,
		...patch,
	};
}

function exportTabCsv(args: {
	collectionAttempts: PaymentCollectionAttemptRow[];
	collectionPlanEntries: PaymentCollectionPlanEntryRow[];
	obligations: PaymentOperationsObligationRow[];
	tab: PaymentOperationsTab;
	transfers: PaymentOperationsTransferRow[];
}) {
	switch (args.tab) {
		case "obligations":
			downloadCsv(
				"payment-operations-obligations.csv",
				rowsToCsv(
					[
						"obligation_id",
						"status",
						"due_date",
						"mortgage",
						"borrower",
						"type",
						"payment_number",
						"amount",
						"amount_settled",
						"journal_outstanding_balance",
						"projected_outstanding_balance",
						"latest_collection_status",
						"latest_transfer_status",
					],
					args.obligations.map((row) => ({
						amount: (row.amount / 100).toFixed(2),
						amount_settled: (row.amountSettled / 100).toFixed(2),
						borrower: row.borrowerLabel,
						due_date: row.dueDate,
						journal_outstanding_balance: (
							row.journalOutstandingBalance / 100
						).toFixed(2),
						latest_collection_status: row.latestCollectionStatus ?? "",
						latest_transfer_status: row.latestTransferStatus ?? "",
						mortgage: row.mortgageLabel,
						obligation_id: row.obligationId,
						payment_number: row.paymentNumber,
						projected_outstanding_balance: (
							row.projectedOutstandingBalance / 100
						).toFixed(2),
						status: row.status,
						type: row.type,
					}))
				)
			);
			return;
		case "collections":
			downloadCsv(
				"payment-operations-collections.csv",
				rowsToCsv(
					[
						"collection_attempt_id",
						"status",
						"amount",
						"method",
						"mortgage_id",
						"plan_entry_id",
						"obligation_count",
						"transfer_status",
						"reconciliation_status",
						"initiated_at",
						"confirmed_at",
						"failed_at",
						"provider_ref",
					],
					args.collectionAttempts.map((row) => ({
						amount: (row.amount / 100).toFixed(2),
						collection_attempt_id: row.collectionAttemptId,
						confirmed_at: row.confirmedAt
							? new Date(row.confirmedAt).toISOString()
							: "",
						failed_at: row.failedAt ? new Date(row.failedAt).toISOString() : "",
						initiated_at: new Date(row.initiatedAt).toISOString(),
						method: row.method,
						mortgage_id: row.mortgageId,
						obligation_count: row.obligationIds.length,
						plan_entry_id: row.planEntryId,
						provider_ref: row.transfer?.providerRef ?? "",
						reconciliation_status: row.reconciliation?.isHealthy
							? "healthy"
							: "unhealthy",
						status: row.status,
						transfer_status: row.transfer?.status ?? "",
					}))
				)
			);
			return;
		case "transfers":
			downloadCsv(
				"payment-operations-transfers.csv",
				rowsToCsv(
					[
						"transfer_id",
						"status",
						"direction",
						"transfer_type",
						"amount",
						"mortgage",
						"counterparty",
						"provider_code",
						"provider_ref",
						"created_at",
						"confirmed_at",
						"reversed_at",
						"journal_integrity",
					],
					args.transfers.map((row) => ({
						amount: (row.amount / 100).toFixed(2),
						confirmed_at: row.confirmedAt
							? new Date(row.confirmedAt).toISOString()
							: "",
						counterparty: row.counterpartyLabel,
						created_at: new Date(row.createdAt).toISOString(),
						direction: row.direction,
						journal_integrity: row.journalIntegrity,
						mortgage: row.mortgageLabel ?? row.mortgageId ?? "",
						provider_code: row.providerCode,
						provider_ref: row.providerRef ?? "",
						reversed_at: row.reversedAt
							? new Date(row.reversedAt).toISOString()
							: "",
						status: row.status,
						transfer_id: row.transferId,
						transfer_type: row.transferType,
					}))
				)
			);
			return;
		case "collection-plans":
			downloadCsv(
				"payment-operations-collection-plans.csv",
				rowsToCsv(
					[
						"plan_entry_id",
						"status",
						"source",
						"scheduled_date",
						"amount",
						"method",
						"mortgage_id",
						"obligation_count",
						"balance_precheck_decision",
						"workout_plan",
						"related_attempt_id",
					],
					args.collectionPlanEntries.map((row) => ({
						amount: (row.amount / 100).toFixed(2),
						balance_precheck_decision: row.balancePreCheck.decision ?? "",
						method: row.method,
						mortgage_id: row.mortgageId,
						obligation_count: row.obligationIds.length,
						plan_entry_id: row.planEntryId,
						related_attempt_id: row.relatedAttempt?.collectionAttemptId ?? "",
						scheduled_date: new Date(row.scheduledDate).toISOString(),
						source: row.source,
						status: row.status,
						workout_plan: row.workoutPlan?.name ?? "",
					}))
				)
			);
			return;
		default:
			return;
	}
}

function renderTabButton(args: {
	currentTab: PaymentOperationsTab;
	label: string;
	onSelect: () => void;
	tab: PaymentOperationsTab;
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

export function PaymentOperationsPage({
	onRefresh,
	search,
	setSearch,
	snapshot,
}: PaymentOperationsPageProps) {
	const metricItems: MetricItem[] = [
		{
			label: "Upcoming obligations",
			value: formatInteger(snapshot.overview.upcomingObligations),
		},
		{
			label: "Due obligations",
			value: formatInteger(snapshot.overview.dueObligations),
		},
		{
			label: "Overdue obligations",
			tone: snapshot.overview.overdueObligations > 0 ? "critical" : "default",
			value: formatInteger(snapshot.overview.overdueObligations),
		},
		{
			label: "Settled obligations",
			tone: "positive",
			value: formatInteger(snapshot.overview.settledObligations),
		},
		{
			label: "Active collections",
			tone:
				snapshot.overview.activeCollectionAttempts > 0 ? "warning" : "default",
			value: formatInteger(snapshot.overview.activeCollectionAttempts),
		},
		{
			description: "All full-suite gaps and reconciliation exceptions.",
			label: "Reconciliation exceptions",
			tone:
				snapshot.overview.reconciliationExceptions > 0
					? "critical"
					: "positive",
			value: formatInteger(snapshot.overview.reconciliationExceptions),
		},
	];

	const filteredObligations = useMemo(
		() =>
			snapshot.obligations.filter((row) =>
				matchesObligationFilters(row, search)
			),
		[search, snapshot.obligations]
	);

	const filteredCollections = useMemo(
		() =>
			snapshot.collectionAttempts.filter((row) =>
				matchesCollectionFilters(row, search)
			),
		[search, snapshot.collectionAttempts]
	);

	const filteredTransfers = useMemo(
		() =>
			snapshot.transfers.filter((row) => matchesTransferFilters(row, search)),
		[search, snapshot.transfers]
	);

	const filteredCollectionPlans = useMemo(
		() =>
			snapshot.collectionPlanEntries.filter((row) =>
				matchesCollectionPlanFilters(row, search)
			),
		[search, snapshot.collectionPlanEntries]
	);

	const selectedObligation =
		filteredObligations.find((row) => row.obligationId === search.selectedId) ??
		filteredObligations[0] ??
		null;
	const selectedCollection =
		filteredCollections.find(
			(row) => row.collectionAttemptId === search.selectedId
		) ??
		filteredCollections[0] ??
		null;
	const selectedTransfer =
		filteredTransfers.find((row) => row.transferId === search.selectedId) ??
		filteredTransfers[0] ??
		null;
	const selectedCollectionPlan =
		filteredCollectionPlans.find(
			(row) => row.planEntryId === search.selectedId
		) ??
		filteredCollectionPlans[0] ??
		null;

	const currentStatusOptions = useMemo(() => {
		switch (search.tab) {
			case "obligations":
				return buildOptions(snapshot.obligations.map((row) => row.status));
			case "collections":
				return buildOptions(
					snapshot.collectionAttempts.map((row) => row.status)
				);
			case "transfers":
				return buildOptions(snapshot.transfers.map((row) => row.status));
			case "collection-plans":
				return buildOptions(
					snapshot.collectionPlanEntries.map((row) => row.status)
				);
			default:
				return [];
		}
	}, [search.tab, snapshot]);

	const currentTypeOptions = useMemo(() => {
		switch (search.tab) {
			case "obligations":
				return buildOptions(snapshot.obligations.map((row) => row.type));
			case "collections":
				return buildOptions(
					snapshot.collectionAttempts.map((row) => row.method)
				);
			case "transfers":
				return buildOptions(snapshot.transfers.map((row) => row.transferType));
			case "collection-plans":
				return buildOptions(
					snapshot.collectionPlanEntries.map((row) => row.source)
				);
			default:
				return [];
		}
	}, [search.tab, snapshot]);

	const mortgageOptions = useMemo(
		() =>
			Array.from(
				new Map(
					snapshot.obligations.map((row) => [row.mortgageId, row.mortgageLabel])
				).entries()
			)
				.sort((left, right) => left[1].localeCompare(right[1], "en"))
				.map(([value, label]) => ({ label, value })),
		[snapshot.obligations]
	);

	const borrowerOptions = useMemo(
		() =>
			Array.from(
				new Map(
					snapshot.obligations.map((row) => [row.borrowerId, row.borrowerLabel])
				).entries()
			)
				.sort((left, right) => left[1].localeCompare(right[1], "en"))
				.map(([value, label]) => ({ label, value })),
		[snapshot.obligations]
	);

	const lenderOptions = useMemo(
		() =>
			Array.from(
				new Map(
					snapshot.transfers
						.filter((row) => row.lenderId)
						.map((row) => [row.lenderId as string, row.counterpartyLabel])
				).entries()
			)
				.sort((left, right) => left[1].localeCompare(right[1], "en"))
				.map(([value, label]) => ({ label, value })),
		[snapshot.transfers]
	);

	const canWaiveObligationBalance = useAuthorization({
		kind: "permission",
		permission: "obligation:waive",
	}).allowed;
	const canWriteOffObligationBalance = useAuthorization({
		kind: "permission",
		permission: "cash_ledger:correct",
	}).allowed;
	const canManagePaymentOperations = useAuthorization({
		kind: "permission",
		permission: "payment:manage",
	}).allowed;

	const obligationColumns: TableColumn<PaymentOperationsObligationRow>[] = [
		{
			header: "Status",
			id: "status",
			render: (row) => (
				<div className="space-y-1">
					<StatusBadge label={row.status} />
					<div className="flex flex-wrap gap-1">
						{row.isCorrective ? (
							<StatusBadge label="corrective" variant="outline" />
						) : null}
						{row.hasJournalDrift ? (
							<StatusBadge label="journal drift" variant="destructive" />
						) : null}
						{row.hasActiveCollection ? (
							<StatusBadge label="active collection" variant="secondary" />
						) : null}
					</div>
				</div>
			),
		},
		{
			header: "Due date",
			id: "dueDate",
			render: (row) => formatDateOnly(row.dueDate),
		},
		{
			header: "Mortgage",
			id: "mortgage",
			render: (row) => (
				<div className="max-w-[220px] whitespace-normal text-sm">
					{row.mortgageLabel}
				</div>
			),
		},
		{
			header: "Borrower",
			id: "borrower",
			render: (row) => row.borrowerLabel,
		},
		{
			header: "Type",
			id: "type",
			render: (row) => humanizeLabel(row.type),
		},
		{
			align: "right",
			header: "Amount",
			id: "amount",
			render: (row) => formatCurrencyCents(row.amount),
		},
		{
			align: "right",
			header: "Settled",
			id: "settled",
			render: (row) => formatCurrencyCents(row.amountSettled),
		},
		{
			align: "right",
			header: "Journal outstanding",
			id: "journalOutstanding",
			render: (row) => formatCurrencyCents(row.journalOutstandingBalance),
		},
	];

	const collectionColumns: TableColumn<PaymentCollectionAttemptRow>[] = [
		{
			header: "Attempt status",
			id: "status",
			render: (row) => <StatusBadge label={row.status} />,
		},
		{
			header: "Transfer",
			id: "transfer",
			render: (row) => (
				<div className="space-y-1">
					<div>
						{row.transfer ? humanizeLabel(row.transfer.status) : "No transfer"}
					</div>
					<StatusBadge
						label={row.reconciliation?.isHealthy ? "healthy" : "unhealthy"}
						variant={row.reconciliation?.isHealthy ? "default" : "destructive"}
					/>
				</div>
			),
		},
		{
			align: "right",
			header: "Amount",
			id: "amount",
			render: (row) => formatCurrencyCents(row.amount),
		},
		{
			header: "Method",
			id: "method",
			render: (row) => humanizeLabel(row.method),
		},
		{
			header: "Mortgage",
			id: "mortgageId",
			render: (row) => <InlineCode value={row.mortgageId} />,
		},
		{
			align: "right",
			header: "Obligations",
			id: "obligationCount",
			render: (row) => formatInteger(row.obligationIds.length),
		},
		{
			header: "Initiated",
			id: "initiatedAt",
			render: (row) => formatDateTime(row.initiatedAt),
		},
		{
			header: "Provider ref",
			id: "providerRef",
			render: (row) => row.transfer?.providerRef ?? "—",
		},
	];

	const transferColumns: TableColumn<PaymentOperationsTransferRow>[] = [
		{
			header: "Transfer status",
			id: "status",
			render: (row) => <StatusBadge label={row.status} />,
		},
		{
			header: "Direction",
			id: "direction",
			render: (row) => humanizeLabel(row.direction),
		},
		{
			header: "Transfer type",
			id: "transferType",
			render: (row) => humanizeLabel(row.transferType),
		},
		{
			align: "right",
			header: "Amount",
			id: "amount",
			render: (row) => formatCurrencyCents(row.amount),
		},
		{
			header: "Mortgage",
			id: "mortgage",
			render: (row) => row.mortgageLabel ?? "—",
		},
		{
			header: "Counterparty",
			id: "counterparty",
			render: (row) => row.counterpartyLabel,
		},
		{
			header: "Provider ref",
			id: "providerRef",
			render: (row) => row.providerRef ?? "—",
		},
		{
			header: "Journal integrity",
			id: "journalIntegrity",
			render: (row) => (
				<StatusBadge
					label={row.journalIntegrity}
					variant={
						row.journalIntegrity === "linked" ? "default" : "destructive"
					}
				/>
			),
		},
	];

	const collectionPlanColumns: TableColumn<PaymentCollectionPlanEntryRow>[] = [
		{
			header: "Status",
			id: "status",
			render: (row) => <StatusBadge label={row.status} />,
		},
		{
			header: "Source",
			id: "source",
			render: (row) => humanizeLabel(row.source),
		},
		{
			header: "Balance precheck",
			id: "balancePrecheck",
			render: (row) =>
				row.balancePreCheck.decision ? (
					<StatusBadge label={row.balancePreCheck.decision} />
				) : (
					"—"
				),
		},
		{
			header: "Scheduled date",
			id: "scheduledDate",
			render: (row) => formatDateTime(row.scheduledDate),
		},
		{
			align: "right",
			header: "Amount",
			id: "amount",
			render: (row) => formatCurrencyCents(row.amount),
		},
		{
			header: "Method",
			id: "method",
			render: (row) => humanizeLabel(row.method),
		},
		{
			header: "Workout",
			id: "workout",
			render: (row) => row.workoutPlan?.name ?? "—",
		},
		{
			header: "Related attempt",
			id: "relatedAttempt",
			render: (row) => row.relatedAttempt?.collectionAttemptId ?? "—",
		},
	];

	function updateSearch(patch: Partial<PaymentOperationsSearchState>) {
		setSearch((current) => ({ ...current, ...patch }));
	}

	function renderObligationDetail() {
		if (!selectedObligation) {
			return (
				<EmptyDetailState
					description="Select an obligation row to inspect debt truth, journal balance, and quick operator actions."
					title="No obligation selected"
				/>
			);
		}

		return (
			<DetailRail
				actions={
					<ActionButtonRow>
						{canWaiveObligationBalance ? (
							<WaiveBalanceDialog
								defaultAmountCents={
									selectedObligation.journalOutstandingBalance
								}
								obligationId={
									selectedObligation.obligationId as Id<"obligations">
								}
							/>
						) : null}
						{canWriteOffObligationBalance ? (
							<WriteOffBalanceDialog
								defaultAmountCents={
									selectedObligation.journalOutstandingBalance
								}
								obligationId={
									selectedObligation.obligationId as Id<"obligations">
								}
							/>
						) : null}
						<Button asChild size="sm" variant="outline">
							<Link
								params={{ recordid: selectedObligation.mortgageId }}
								search={(current) => buildAdminDetailLinkSearch(current)}
								to="/admin/mortgages/$recordid"
							>
								<Landmark className="size-4" />
								View mortgage
							</Link>
						</Button>
					</ActionButtonRow>
				}
				description="Debt truth stays separate from collection strategy and transfer execution."
				title={`Obligation ${selectedObligation.paymentNumber}`}
			>
				<KeyValueList
					items={[
						{
							label: "Obligation ID",
							value: <InlineCode value={selectedObligation.obligationId} />,
						},
						{ label: "Mortgage", value: selectedObligation.mortgageLabel },
						{ label: "Borrower", value: selectedObligation.borrowerLabel },
						{
							label: "Status",
							value: <StatusBadge label={selectedObligation.status} />,
						},
						{ label: "Type", value: humanizeLabel(selectedObligation.type) },
						{
							label: "Due date",
							value: formatDateOnly(selectedObligation.dueDate),
						},
						{
							label: "Grace period end",
							value: formatDateOnly(selectedObligation.gracePeriodEnd),
						},
						{
							label: "Amount",
							value: formatCurrencyCents(selectedObligation.amount),
						},
						{
							label: "Amount settled",
							value: formatCurrencyCents(selectedObligation.amountSettled),
						},
						{
							label: "Journal outstanding",
							value: formatCurrencyCents(
								selectedObligation.journalOutstandingBalance
							),
						},
						{
							label: "Projected outstanding",
							value: formatCurrencyCents(
								selectedObligation.projectedOutstandingBalance
							),
						},
						{
							label: "Corrective chain",
							value:
								selectedObligation.correctiveCount > 0
									? `${selectedObligation.correctiveCount} downstream corrective obligations`
									: "No corrective chain",
						},
					]}
				/>
				<div className="space-y-2">
					<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
						Quick links
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() =>
								setSearch((current) => ({
									...current,
									search: selectedObligation.obligationId,
									selectedId:
										selectedObligation.latestCollectionAttemptId ?? undefined,
									status: undefined,
									type: undefined,
									tab: "collections",
								}))
							}
							size="sm"
							variant="outline"
						>
							Open collections
						</Button>
						<Button asChild size="sm" variant="outline">
							<Link
								search={(current) =>
									buildFinancialLedgerLinkSearch(current, {
										search: selectedObligation.obligationId,
										selectedCheck: undefined,
										selectedId: undefined,
										tab: "cash-ledger",
									})
								}
								to="/admin/financial-ledger"
							>
								Open in financial ledger
							</Link>
						</Button>
					</div>
				</div>
			</DetailRail>
		);
	}

	function renderCollectionDetail() {
		if (!selectedCollection) {
			return (
				<EmptyDetailState
					description="Select an attempt to inspect provider execution, linked transfer state, and reconciliation health."
					title="No collection attempt selected"
				/>
			);
		}

		return (
			<DetailRail
				description="Execution attempts are separate from the collection plan entries that created them."
				title={`Attempt ${selectedCollection.collectionAttemptId}`}
			>
				<KeyValueList
					items={[
						{
							label: "Attempt ID",
							value: (
								<InlineCode value={selectedCollection.collectionAttemptId} />
							),
						},
						{
							label: "Status",
							value: <StatusBadge label={selectedCollection.status} />,
						},
						{
							label: "Amount",
							value: formatCurrencyCents(selectedCollection.amount),
						},
						{
							label: "Method",
							value: humanizeLabel(selectedCollection.method),
						},
						{
							label: "Plan entry",
							value: <InlineCode value={selectedCollection.planEntryId} />,
						},
						{
							label: "Mortgage",
							value: <InlineCode value={selectedCollection.mortgageId} />,
						},
						{
							label: "Trigger source",
							value: selectedCollection.triggerSource
								? humanizeLabel(selectedCollection.triggerSource)
								: "—",
						},
						{
							label: "Reconciliation",
							value: selectedCollection.reconciliation ? (
								<StatusBadge
									label={
										selectedCollection.reconciliation.isHealthy
											? "healthy"
											: "unhealthy"
									}
									variant={
										selectedCollection.reconciliation.isHealthy
											? "default"
											: "destructive"
									}
								/>
							) : (
								"—"
							),
						},
						{
							label: "Provider ref",
							value: selectedCollection.transfer?.providerRef ?? "—",
						},
						{
							label: "Initiated",
							value: formatDateTime(selectedCollection.initiatedAt),
						},
						{
							label: "Confirmed",
							value: formatDateTime(selectedCollection.confirmedAt),
						},
						{
							label: "Failed",
							value: formatDateTime(selectedCollection.failedAt),
						},
					]}
				/>
			</DetailRail>
		);
	}

	function renderTransferDetail() {
		if (!selectedTransfer) {
			return (
				<EmptyDetailState
					description="Select a transfer row to inspect provider refs, journal linkage, and downstream context."
					title="No transfer selected"
				/>
			);
		}

		return (
			<DetailRail
				description="Transfers are the provider-facing execution truth with drill-through to ledger evidence."
				title={`Transfer ${selectedTransfer.transferId}`}
			>
				<KeyValueList
					items={[
						{
							label: "Transfer ID",
							value: <InlineCode value={selectedTransfer.transferId} />,
						},
						{
							label: "Status",
							value: <StatusBadge label={selectedTransfer.status} />,
						},
						{
							label: "Direction",
							value: humanizeLabel(selectedTransfer.direction),
						},
						{
							label: "Transfer type",
							value: humanizeLabel(selectedTransfer.transferType),
						},
						{
							label: "Counterparty",
							value: selectedTransfer.counterpartyLabel,
						},
						{ label: "Provider code", value: selectedTransfer.providerCode },
						{
							label: "Provider ref",
							value: selectedTransfer.providerRef ?? "—",
						},
						{
							label: "Amount",
							value: formatCurrencyCents(selectedTransfer.amount),
						},
						{
							label: "Journal integrity",
							value: (
								<StatusBadge
									label={selectedTransfer.journalIntegrity}
									variant={
										selectedTransfer.journalIntegrity === "linked"
											? "default"
											: "destructive"
									}
								/>
							),
						},
						{
							label: "Created",
							value: formatDateTime(selectedTransfer.createdAt),
						},
						{
							label: "Confirmed",
							value: formatDateTime(selectedTransfer.confirmedAt),
						},
						{
							label: "Reversed",
							value: formatDateTime(selectedTransfer.reversedAt),
						},
					]}
				/>
				<ActionButtonRow>
					<Button asChild size="sm" variant="outline">
						<Link
							search={(current) =>
								buildFinancialLedgerLinkSearch(current, {
									selectedCheck: undefined,
									selectedId: undefined,
									tab: "cash-ledger",
									type: selectedTransfer.transferType,
								})
							}
							to="/admin/financial-ledger"
						>
							Open in financial ledger
						</Link>
					</Button>
					{selectedTransfer.mortgageId ? (
						<Button asChild size="sm" variant="outline">
							<Link
								params={{ recordid: selectedTransfer.mortgageId }}
								search={(current) => buildAdminDetailLinkSearch(current)}
								to="/admin/mortgages/$recordid"
							>
								Open mortgage
							</Link>
						</Button>
					) : null}
				</ActionButtonRow>
			</DetailRail>
		);
	}

	function renderCollectionPlanDetail() {
		if (!selectedCollectionPlan) {
			return (
				<EmptyDetailState
					description="Select a strategy row to inspect balance precheck facts, lineage, and execute/reschedule actions."
					title="No collection plan selected"
				/>
			);
		}

		return (
			<DetailRail
				actions={
					canManagePaymentOperations ? (
						<ActionButtonRow>
							<ExecutePlanEntryDialog
								planEntryId={
									selectedCollectionPlan.planEntryId as Id<"collectionPlanEntries">
								}
								triggerLabel="Execute"
							/>
							<ReschedulePlanEntryDialog
								planEntryId={
									selectedCollectionPlan.planEntryId as Id<"collectionPlanEntries">
								}
								scheduledDate={selectedCollectionPlan.scheduledDate}
							/>
						</ActionButtonRow>
					) : undefined
				}
				description="Collection strategy stays distinct from attempts and from cash-ledger truth."
				title={`Plan entry ${selectedCollectionPlan.planEntryId}`}
			>
				<KeyValueList
					items={[
						{
							label: "Plan entry ID",
							value: <InlineCode value={selectedCollectionPlan.planEntryId} />,
						},
						{
							label: "Status",
							value: <StatusBadge label={selectedCollectionPlan.status} />,
						},
						{
							label: "Source",
							value: humanizeLabel(selectedCollectionPlan.source),
						},
						{
							label: "Method",
							value: humanizeLabel(selectedCollectionPlan.method),
						},
						{
							label: "Amount",
							value: formatCurrencyCents(selectedCollectionPlan.amount),
						},
						{
							label: "Scheduled date",
							value: formatDateTime(selectedCollectionPlan.scheduledDate),
						},
						{
							label: "Balance precheck",
							value: selectedCollectionPlan.balancePreCheck.decision
								? humanizeLabel(selectedCollectionPlan.balancePreCheck.decision)
								: "Not evaluated",
						},
						{
							label: "Reason detail",
							value: selectedCollectionPlan.balancePreCheck.reasonDetail ?? "—",
						},
						{
							label: "Workout plan",
							value: selectedCollectionPlan.workoutPlan?.name ?? "—",
						},
						{
							label: "Retry lineage",
							value: selectedCollectionPlan.lineage.retryOfId ? (
								<InlineCode value={selectedCollectionPlan.lineage.retryOfId} />
							) : (
								"—"
							),
						},
						{
							label: "Rescheduled from",
							value: selectedCollectionPlan.lineage.rescheduledFromId ? (
								<InlineCode
									value={selectedCollectionPlan.lineage.rescheduledFromId}
								/>
							) : (
								"—"
							),
						},
						{
							label: "Created by rule",
							value:
								selectedCollectionPlan.createdByRule?.displayName ??
								"Manual / inherited",
						},
					]}
				/>
			</DetailRail>
		);
	}

	let tableSection: ReactNode = null;
	let detailSection: ReactNode = null;

	if (search.tab === "obligations") {
		tableSection = (
			<SectionCard
				description="Debt truth, settlement state, and journal alignment."
				title={`Obligations (${filteredObligations.length})`}
			>
				<DataTableCard
					columns={obligationColumns}
					emptyMessage="No obligations match the current filters."
					onRowSelect={(row) => updateSearch({ selectedId: row.obligationId })}
					rowKey={(row) => row.obligationId}
					rows={filteredObligations}
					selectedRowId={selectedObligation?.obligationId}
				/>
			</SectionCard>
		);
		detailSection = renderObligationDetail();
	} else if (search.tab === "collections") {
		tableSection = (
			<SectionCard
				description="Execution attempts, provider state, and transfer reconciliation."
				title={`Collections (${filteredCollections.length})`}
			>
				<DataTableCard
					columns={collectionColumns}
					emptyMessage="No collection attempts match the current filters."
					onRowSelect={(row) =>
						updateSearch({ selectedId: row.collectionAttemptId })
					}
					rowKey={(row) => row.collectionAttemptId}
					rows={filteredCollections}
					selectedRowId={selectedCollection?.collectionAttemptId}
				/>
			</SectionCard>
		);
		detailSection = renderCollectionDetail();
	} else if (search.tab === "transfers") {
		tableSection = (
			<SectionCard
				description="Provider-facing transfer truth and ledger linkage."
				title={`Transfers (${filteredTransfers.length})`}
			>
				<DataTableCard
					columns={transferColumns}
					emptyMessage="No transfers match the current filters."
					onRowSelect={(row) => updateSearch({ selectedId: row.transferId })}
					rowKey={(row) => row.transferId}
					rows={filteredTransfers}
					selectedRowId={selectedTransfer?.transferId}
				/>
			</SectionCard>
		);
		detailSection = renderTransferDetail();
	} else {
		tableSection = (
			<SectionCard
				description="Collection strategy, balance prechecks, and workout lineage."
				title={`Collection plans (${filteredCollectionPlans.length})`}
			>
				<DataTableCard
					columns={collectionPlanColumns}
					emptyMessage="No collection plan entries match the current filters."
					onRowSelect={(row) => updateSearch({ selectedId: row.planEntryId })}
					rowKey={(row) => row.planEntryId}
					rows={filteredCollectionPlans}
					selectedRowId={selectedCollectionPlan?.planEntryId}
				/>
			</SectionCard>
		);
		detailSection = renderCollectionPlanDetail();
	}

	return (
		<div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
			<PageHeader
				actions={
					<>
						<Button
							onClick={() =>
								exportTabCsv({
									collectionAttempts: filteredCollections,
									collectionPlanEntries: filteredCollectionPlans,
									obligations: filteredObligations,
									tab: search.tab,
									transfers: filteredTransfers,
								})
							}
							size="sm"
							variant="outline"
						>
							<Download className="size-4" />
							Export
						</Button>
						<Button asChild size="sm" variant="outline">
							<Link
								search={(current) =>
									buildFinancialLedgerLinkSearch(current, {
										selectedCheck: undefined,
										selectedId: undefined,
										tab: "reconciliation",
									})
								}
								to="/admin/financial-ledger"
							>
								<ExternalLink className="size-4" />
								Open Financial Ledger
							</Link>
						</Button>
						<Button
							onClick={() => void onRefresh()}
							size="sm"
							variant="outline"
						>
							<RefreshCw className="size-4" />
							Refresh
						</Button>
					</>
				}
				description="Borrower debt, collection strategy, execution attempts, and transfer state. This page stays operational, while the cash ledger remains the money source of truth."
				eyebrow={
					<StatusBadge
						label={`As of ${formatDateTime(snapshot.generatedAt)}`}
						variant="outline"
					/>
				}
				title="Payment Operations"
			/>

			<MetricStrip items={metricItems} />

			<div className="flex flex-wrap gap-2">
				{(Object.entries(TAB_LABELS) as [PaymentOperationsTab, string][]).map(
					([tab, label]) =>
						renderTabButton({
							currentTab: search.tab,
							label,
							onSelect: () =>
								setSearch((current) => ({
									...current,
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
						placeholder="Search IDs, mortgage labels, provider refs"
						value={search.search ?? ""}
					/>
				</FilterField>
				<FilterField label="Status">
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({ status: value === "__all__" ? undefined : value })
						}
						options={[
							{ label: "All statuses", value: "__all__" },
							...currentStatusOptions,
						]}
						placeholder="All statuses"
						value={search.status ?? "__all__"}
					/>
				</FilterField>
				<FilterField label="Type">
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({ type: value === "__all__" ? undefined : value })
						}
						options={[
							{ label: "All types", value: "__all__" },
							...currentTypeOptions,
						]}
						placeholder="All types"
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
				<FilterField label="Borrower">
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({
								borrowerId: value === "__all__" ? undefined : value,
							})
						}
						options={[
							{ label: "All borrowers", value: "__all__" },
							...borrowerOptions,
						]}
						placeholder="All borrowers"
						value={search.borrowerId ?? "__all__"}
					/>
				</FilterField>
				<FilterField label="Lender">
					<FilterSelect
						onValueChange={(value) =>
							updateSearch({
								lenderId: value === "__all__" ? undefined : value,
							})
						}
						options={[
							{ label: "All lenders", value: "__all__" },
							...lenderOptions,
						]}
						placeholder="All lenders"
						value={search.lenderId ?? "__all__"}
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
					label="Show only action-needed rows"
					onCheckedChange={(checked) =>
						updateSearch({ showOnlyExceptions: checked })
					}
				/>
			</FilterBar>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
				<div>{tableSection}</div>
				<div>{detailSection}</div>
			</div>
		</div>
	);
}
