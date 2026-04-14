import type { AdminDetailSearch } from "#/lib/admin-detail-search";

export interface MetricItem {
	description?: string;
	label: string;
	tone?: "critical" | "default" | "positive" | "warning";
	value: string;
}

export type PaymentOperationsTab =
	| "obligations"
	| "collections"
	| "transfers"
	| "collection-plans";

export type FinancialLedgerTab =
	| "reconciliation"
	| "cash-ledger"
	| "ops-health"
	| "validation"
	| "ownership-ledger";

export interface DashboardSearchState<TTab extends string>
	extends AdminDetailSearch {
	borrowerId?: string;
	dateFrom?: string;
	dateTo?: string;
	lenderId?: string;
	mortgageId?: string;
	search?: string;
	selectedCheck?: string;
	selectedId?: string;
	showOnlyExceptions: boolean;
	status?: string;
	tab: TTab;
	type?: string;
}

export interface PaymentOperationsSearchState
	extends DashboardSearchState<PaymentOperationsTab> {}

export interface FinancialLedgerSearchState
	extends DashboardSearchState<FinancialLedgerTab> {}

export interface CollectionAttemptTransferSummary {
	collectionAttemptId?: string;
	confirmedAt?: number;
	counterpartyId?: string;
	counterpartyType?: string;
	createdAt: number;
	direction?: string;
	failedAt?: number;
	failureCode?: string;
	failureReason?: string;
	idempotencyKey: string;
	metadata?: unknown;
	providerCode?: string;
	providerRef?: string;
	reversedAt?: number;
	status: string;
	transferId: string;
	transferType?: string;
}

export interface CollectionAttemptReconciliationSummary {
	expectedLifecycle:
		| "attempt_confirmed_and_cash_received"
		| "attempt_reversed_and_reversal_posted";
	hasExpectedPostingEntry: boolean;
	isHealthy: boolean;
	reason?: string;
}

export interface PaymentCollectionAttemptRow {
	amount: number;
	cancelledAt?: number;
	collectionAttemptId: string;
	confirmedAt?: number;
	executionIdempotencyKey?: string;
	executionReason?: string;
	executionRequestedAt?: number;
	failedAt?: number;
	failureReason?: string;
	initiatedAt: number;
	method: string;
	mortgageId: string;
	obligationIds: string[];
	planEntryId: string;
	reconciliation?: CollectionAttemptReconciliationSummary | null;
	requestedByActorId?: string;
	requestedByActorType?: string;
	reversedAt?: number;
	status: string;
	transfer?: CollectionAttemptTransferSummary | null;
	triggerSource?: string;
}

export interface PaymentCollectionPlanEntryRow {
	amount: number;
	balancePreCheck: {
		decision?: string;
		evaluatedAt?: number;
		nextEvaluationAt?: number;
		reasonCode?: string;
		reasonDetail?: string;
		ruleId?: string;
		signalSource?: string;
	};
	collectionAttemptId?: string;
	createdAt: number;
	createdByRule?: {
		code: string;
		description: string;
		displayName: string;
		ruleId: string;
		scopeSummary: string;
		status: string;
	} | null;
	executedAt?: number;
	executionIdempotencyKey?: string;
	lineage: {
		rescheduledFromId?: string;
		retryOfId?: string;
		supersededAt?: number;
		supersededByWorkoutPlanId?: string;
		workoutPlanId?: string;
	};
	method: string;
	mortgageId: string;
	obligationIds: string[];
	planEntryId: string;
	relatedAttempt?: PaymentCollectionAttemptRow | null;
	reschedule: {
		reason?: string;
		requestedAt?: number;
		requestedByActorId?: string;
		requestedByActorType?: string;
	};
	scheduledDate: number;
	source: string;
	status: string;
	workoutPlan?: {
		name: string;
		status: string;
		workoutPlanId: string;
	} | null;
}

export interface PaymentOperationsObligationRow {
	amount: number;
	amountSettled: number;
	borrowerId: string;
	borrowerLabel: string;
	correctiveCount: number;
	dueDate: number;
	gracePeriodEnd?: number;
	hasActiveCollection: boolean;
	hasJournalDrift: boolean;
	isCorrective: boolean;
	journalOutstandingBalance: number;
	latestCollectionAttemptId: string | null;
	latestCollectionStatus: string | null;
	latestTransferId: string | null;
	latestTransferStatus: string | null;
	mortgageId: string;
	mortgageLabel: string;
	obligationId: string;
	paymentNumber: number;
	postingGroupId: string | null;
	projectedOutstandingBalance: number;
	sourceObligationId: string | null;
	status: string;
	type: string;
}

export interface PaymentOperationsTransferRow {
	amount: number;
	borrowerId: string | null;
	confirmedAt: number | null;
	counterpartyId: string;
	counterpartyLabel: string;
	counterpartyType: string;
	createdAt: number;
	dealId: string | null;
	direction: string;
	dispersalEntryId: string | null;
	failureCode: string | null;
	failureReason: string | null;
	hasLedgerLink: boolean;
	idempotencyKey: string;
	journalIntegrity: string;
	lenderId: string | null;
	mortgageId: string | null;
	mortgageLabel: string | null;
	obligationId: string | null;
	planEntryId: string | null;
	providerCode: string;
	providerRef: string | null;
	reversedAt: number | null;
	status: string;
	transferId: string;
	transferType: string;
}

export interface PaymentOperationsSnapshot {
	collectionAttempts: PaymentCollectionAttemptRow[];
	collectionPlanEntries: PaymentCollectionPlanEntryRow[];
	generatedAt: number;
	obligations: PaymentOperationsObligationRow[];
	overview: {
		activeCollectionAttempts: number;
		dueObligations: number;
		overdueObligations: number;
		reconciliationExceptions: number;
		settledObligations: number;
		upcomingObligations: number;
	};
	transfers: PaymentOperationsTransferRow[];
}

export type FinancialLedgerSupportObligationRow = Pick<
	PaymentOperationsObligationRow,
	| "amount"
	| "journalOutstandingBalance"
	| "obligationId"
	| "projectedOutstandingBalance"
>;

export type FinancialLedgerSupportTransferRow = Pick<
	PaymentOperationsTransferRow,
	"amount" | "direction" | "lenderId" | "status"
>;

export interface FinancialLedgerSupportSnapshot {
	generatedAt: number;
	obligations: FinancialLedgerSupportObligationRow[];
	transfers: FinancialLedgerSupportTransferRow[];
}

export interface LedgerChartOfAccountsRow {
	accountCode: string;
	accountFamily: string;
	accountId: string;
	accountName: string;
	balanceCents: number;
	borrowerId: string | null;
	borrowerLabel: string | null;
	controlSubaccount: string | null;
	createdAt: number;
	lastActivityAt: number | null;
	lenderId: string | null;
	lenderLabel: string | null;
	mortgageId: string | null;
	mortgageLabel: string | null;
	normalBalance: string;
	obligationId: string | null;
	status: string;
}

export interface LedgerJournalLine {
	accountCode: string;
	accountFamily: string;
	accountId: string;
	accountName: string;
	borrowerId: string | null;
	borrowerLabel: string | null;
	causedByJournalEntryId: string | null;
	controlSubaccount: string | null;
	creditCents: number;
	currencyCode: "CAD";
	debitCents: number;
	description: string;
	dispersalEntryId: string | null;
	effectiveDate: string;
	entryType: string;
	idempotencyKey: string;
	journalEntryId: string;
	lenderId: string | null;
	lenderLabel: string | null;
	lineNumber: 1 | 2;
	lineRole: "credit" | "debit";
	mortgageId: string | null;
	mortgageLabel: string | null;
	normalBalance: string;
	obligationId: string | null;
	postingGroupId: string | null;
	reference: string;
	sequenceNumber: number;
	sourceActorId: string | null;
	sourceActorType: string | null;
	sourceChannel: string;
	timestampUtc: string;
	transferRequestId: string | null;
}

export interface LedgerTrialBalanceRow {
	accountCode: string;
	accountFamily: string;
	accountId: string;
	accountName: string;
	borrowerId: string | null;
	closingBalanceCents: number;
	controlSubaccount: string | null;
	creditTurnoverCents: number;
	debitTurnoverCents: number;
	lenderId: string | null;
	mortgageId: string | null;
	normalBalance: string;
	obligationId: string | null;
	openingBalanceCents: number;
}

export interface ReconciliationSummary {
	cards: ReconciliationCard[];
	checkedAt: number;
	healthyChecks: number;
	isHealthy: boolean;
	totalExceptionAmountCents: number;
	totalGapCount: number;
	unhealthyCheckNames: string[];
	unhealthyChecks: number;
}

export interface ReconciliationCard {
	category: string;
	checkedAt: number;
	checkName: string;
	columns: string[];
	count: number;
	isHealthy: boolean;
	preview: string[];
	rows: Record<string, boolean | null | number | string>[];
	totalAmountCents: number;
}

export interface OpsHealthJob {
	jobKey: string;
	label: string;
	lastObservedAt: number | null;
	openItemCount: number;
	status: string;
}

export interface OpsHealthEvent {
	eventId: string;
	occurredAt: number;
	relatedResourceId: string;
	relatedResourceType: string;
	severity: string;
	sourceJob: string;
	status: string;
	summary: string;
	title: string;
}

export interface OpsHealthSummary {
	activeIncidents: number;
	escalatedHealingAttempts: number;
	failedRunsLast24h: number;
	openIntegrityDefects: number;
	schedulesInSyncError: number;
}

export interface OwnershipLedgerSummary {
	activePositionAccounts: number;
	mortgagesWithPositions: number;
	pendingDealsAffectingOwnership: number;
}

export interface FinancialLedgerSnapshot {
	chartOfAccounts: LedgerChartOfAccountsRow[];
	generatedAt: number;
	journalLines: LedgerJournalLine[];
	opsHealth: {
		events: OpsHealthEvent[];
		jobs: OpsHealthJob[];
		summary: OpsHealthSummary;
	};
	ownershipLedger?: OwnershipLedgerSummary;
	reconciliation: ReconciliationSummary;
	trialBalance: LedgerTrialBalanceRow[];
}

export interface ValidationExpectedRow {
	effectiveDate?: string;
	expectedAmountCents: number | null;
	metric: string;
	sourceRowReference?: string;
	subjectId: string;
	subjectType: string;
}

export interface ValidationComparisonRow {
	actualAmountCents: number | null;
	effectiveDate?: string;
	expectedAmountCents: number | null;
	metric: string;
	sourceRowReference?: string;
	status:
		| "exact_match"
		| "within_tolerance"
		| "mismatch"
		| "missing_actual"
		| "missing_expected";
	subjectId: string;
	subjectType: string;
	varianceCents: number | null;
	variancePercent: number | null;
}
