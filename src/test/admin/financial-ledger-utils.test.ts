import { describe, expect, it } from "vitest";
import {
	buildChartOfAccountsCsv,
	buildJournalLinesCsv,
	buildTrialBalanceCsv,
	parseCsv,
} from "#/components/admin/financial-ledger/csv";
import { formatAccountBalanceCents } from "#/components/admin/financial-ledger/format";
import {
	parseFinancialLedgerSearch,
	parsePaymentOperationsSearch,
} from "#/components/admin/financial-ledger/search";
import type {
	FinancialLedgerSnapshot,
	LedgerChartOfAccountsRow,
	LedgerJournalLine,
	LedgerTrialBalanceRow,
	PaymentOperationsSnapshot,
} from "#/components/admin/financial-ledger/types";
import {
	buildValidationDiffCsv,
	compareValidationRows,
	parseValidationCsv,
	summarizeValidationComparisons,
} from "#/components/admin/financial-ledger/validation";

const chartOfAccountsRow: LedgerChartOfAccountsRow = {
	accountCode: "LENDER_PAYABLE.ACC-000001",
	accountFamily: "LENDER_PAYABLE",
	accountId: "acct-lender-payable-1",
	accountName: "Lender Payable • Lender One",
	balanceCents: 100_000,
	borrowerId: null,
	borrowerLabel: null,
	controlSubaccount: "principal",
	createdAt: Date.parse("2026-04-01T12:00:00.000Z"),
	lastActivityAt: Date.parse("2026-04-10T12:00:00.000Z"),
	lenderId: "lender-1",
	lenderLabel: "Lender One",
	mortgageId: "mortgage-1",
	mortgageLabel: "12 King St",
	normalBalance: "credit",
	obligationId: null,
	status: "active",
};

const journalLineRows: LedgerJournalLine[] = [
	{
		accountCode: "BORROWER_RECEIVABLE.ACC-000002",
		accountFamily: "BORROWER_RECEIVABLE",
		accountId: "acct-borrower-receivable-1",
		accountName: "Borrower Receivable • Payment 1",
		borrowerId: "borrower-1",
		borrowerLabel: "Borrower One",
		causedByJournalEntryId: null,
		controlSubaccount: null,
		creditCents: 0,
		currencyCode: "CAD",
		debitCents: 12_345,
		description: "Monthly payment posted",
		dispersalEntryId: null,
		effectiveDate: "2026-04-01",
		entryType: "obligation_posted",
		idempotencyKey: "idem-1",
		journalEntryId: "journal-1",
		lenderId: null,
		lenderLabel: null,
		lineNumber: 1,
		lineRole: "debit",
		mortgageId: "mortgage-1",
		mortgageLabel: "12 King St",
		normalBalance: "debit",
		obligationId: "obligation-1",
		postingGroupId: "posting-group-1",
		reference: "PMT-001",
		sequenceNumber: 101,
		sourceActorId: null,
		sourceActorType: null,
		sourceChannel: "system",
		timestampUtc: "2026-04-01T12:00:00.000Z",
		transferRequestId: null,
	},
	{
		accountCode: "LENDER_PAYABLE.ACC-000001",
		accountFamily: "LENDER_PAYABLE",
		accountId: "acct-lender-payable-1",
		accountName: "Lender Payable • Lender One",
		borrowerId: null,
		borrowerLabel: null,
		causedByJournalEntryId: null,
		controlSubaccount: "principal",
		creditCents: 12_345,
		currencyCode: "CAD",
		debitCents: 0,
		description: "Monthly payment posted",
		dispersalEntryId: null,
		effectiveDate: "2026-04-01",
		entryType: "obligation_posted",
		idempotencyKey: "idem-1",
		journalEntryId: "journal-1",
		lenderId: "lender-1",
		lenderLabel: "Lender One",
		lineNumber: 2,
		lineRole: "credit",
		mortgageId: "mortgage-1",
		mortgageLabel: "12 King St",
		normalBalance: "credit",
		obligationId: "obligation-1",
		postingGroupId: "posting-group-1",
		reference: "PMT-001",
		sequenceNumber: 101,
		sourceActorId: null,
		sourceActorType: null,
		sourceChannel: "system",
		timestampUtc: "2026-04-01T12:00:00.000Z",
		transferRequestId: null,
	},
];

const trialBalanceRows: LedgerTrialBalanceRow[] = [
	{
		accountCode: "LENDER_PAYABLE.ACC-000001",
		accountFamily: "LENDER_PAYABLE",
		accountId: "acct-lender-payable-1",
		accountName: "Lender Payable • Lender One",
		borrowerId: null,
		closingBalanceCents: 100_000,
		controlSubaccount: "principal",
		creditTurnoverCents: 12_345,
		debitTurnoverCents: 0,
		lenderId: "lender-1",
		mortgageId: "mortgage-1",
		normalBalance: "credit",
		obligationId: null,
		openingBalanceCents: 87_655,
	},
];

const financialLedgerSnapshot: FinancialLedgerSnapshot = {
	chartOfAccounts: [chartOfAccountsRow],
	generatedAt: Date.parse("2026-04-14T12:00:00.000Z"),
	journalLines: journalLineRows,
	opsHealth: {
		events: [],
		jobs: [],
		summary: {
			activeIncidents: 1,
			escalatedHealingAttempts: 1,
			failedRunsLast24h: 2,
			openIntegrityDefects: 1,
			schedulesInSyncError: 1,
		},
	},
	ownershipLedger: {
		activePositionAccounts: 4,
		mortgagesWithPositions: 2,
		pendingDealsAffectingOwnership: 1,
	},
	reconciliation: {
		cards: [
			{
				category: "Control",
				checkedAt: Date.parse("2026-04-14T11:09:28.000Z"),
				checkName: "control_net_zero",
				columns: ["postingGroupId", "controlAllocationBalance"],
				count: 1,
				isHealthy: false,
				preview: ["Posting Group posting-group-1 • Control Allocation Balance 25.00"],
				rows: [
					{
						controlAllocationBalance: 2_500,
						postingGroupId: "posting-group-1",
					},
				],
				totalAmountCents: 2_500,
			},
		],
		checkedAt: Date.parse("2026-04-14T11:09:28.000Z"),
		healthyChecks: 0,
		isHealthy: false,
		totalExceptionAmountCents: 2_500,
		totalGapCount: 1,
		unhealthyCheckNames: ["control_net_zero"],
		unhealthyChecks: 1,
	},
	trialBalance: trialBalanceRows,
};

const paymentOperationsSnapshot: PaymentOperationsSnapshot = {
	collectionAttempts: [],
	collectionPlanEntries: [],
	generatedAt: Date.parse("2026-04-14T12:00:00.000Z"),
	obligations: [
		{
			amount: 100_000,
			amountSettled: 60_000,
			borrowerId: "borrower-1",
			borrowerLabel: "Borrower One",
			correctiveCount: 0,
			dueDate: Date.parse("2026-04-01T00:00:00.000Z"),
			gracePeriodEnd: Date.parse("2026-04-16T00:00:00.000Z"),
			hasActiveCollection: false,
			hasJournalDrift: false,
			isCorrective: false,
			journalOutstandingBalance: 40_000,
			latestCollectionAttemptId: null,
			latestCollectionStatus: null,
			latestTransferId: null,
			latestTransferStatus: null,
			mortgageId: "mortgage-1",
			mortgageLabel: "12 King St",
			obligationId: "obligation-1",
			paymentNumber: 1,
			postingGroupId: "posting-group-1",
			projectedOutstandingBalance: 40_000,
			sourceObligationId: null,
			status: "due",
			type: "scheduled_payment",
		},
	],
	overview: {
		activeCollectionAttempts: 0,
		dueObligations: 1,
		overdueObligations: 0,
		reconciliationExceptions: 1,
		settledObligations: 0,
		upcomingObligations: 0,
	},
	transfers: [
		{
			amount: 25_000,
			borrowerId: null,
			confirmedAt: null,
			counterpartyId: "lender-1",
			counterpartyLabel: "Lender One",
			counterpartyType: "lender",
			createdAt: Date.parse("2026-04-14T10:00:00.000Z"),
			dealId: null,
			direction: "outbound",
			dispersalEntryId: null,
			failureCode: null,
			failureReason: null,
			hasLedgerLink: true,
			idempotencyKey: "transfer-1",
			journalIntegrity: "linked",
			lenderId: "lender-1",
			mortgageId: "mortgage-1",
			mortgageLabel: "12 King St",
			obligationId: null,
			planEntryId: null,
			providerCode: "manual",
			providerRef: null,
			reversedAt: null,
			status: "pending",
			transferId: "transfer-1",
			transferType: "lender_disbursement",
		},
	],
};

describe("admin financial ledger search parsers", () => {
	it("parses payment operations search and preserves inherited admin detail fields", () => {
		expect(
			parsePaymentOperationsSearch({
				borrowerId: "borrower-1",
				detailOpen: "true",
				entityType: "mortgages",
				recordId: '"mortgage_123"',
				search: "  pending  ",
				showOnlyExceptions: "yes",
				status: "due",
				tab: "collections",
			})
		).toEqual({
			borrowerId: "borrower-1",
			detailOpen: true,
			entityType: "mortgages",
			recordId: "mortgage_123",
			search: "pending",
			selectedCheck: undefined,
			selectedId: undefined,
			showOnlyExceptions: true,
			status: "due",
			tab: "collections",
			type: undefined,
			dateFrom: undefined,
			dateTo: undefined,
			lenderId: undefined,
			mortgageId: undefined,
		});
	});

	it("defaults malformed financial-ledger search input to safe values", () => {
		expect(
			parseFinancialLedgerSearch({
				detailOpen: "not-true",
				selectedId: " account-1 ",
				showOnlyExceptions: 0,
				tab: "not-a-tab",
				type: "  credit  ",
			})
		).toEqual({
			borrowerId: undefined,
			dateFrom: undefined,
			dateTo: undefined,
			detailOpen: false,
			entityType: undefined,
			lenderId: undefined,
			mortgageId: undefined,
			recordId: undefined,
			search: undefined,
			selectedCheck: undefined,
			selectedId: "account-1",
			showOnlyExceptions: false,
			status: undefined,
			tab: "reconciliation",
			type: "credit",
		});
	});
});

describe("admin financial ledger CSV exports", () => {
	it("builds chart, journal, and trial balance CSVs with accounting-friendly columns", () => {
		const chartRows = parseCsv(buildChartOfAccountsCsv([chartOfAccountsRow])).rows;
		const journalRows = parseCsv(buildJournalLinesCsv(journalLineRows)).rows;
		const trialBalanceExportRows = parseCsv(
			buildTrialBalanceCsv(trialBalanceRows)
		).rows;

		expect(chartRows).toEqual([
			expect.objectContaining({
				account_code: "LENDER_PAYABLE.ACC-000001",
				account_family: "LENDER_PAYABLE",
				account_id: "acct-lender-payable-1",
				normal_balance: "credit",
			}),
		]);

		expect(journalRows).toEqual([
			expect.objectContaining({
				account_id: "acct-borrower-receivable-1",
				credit: "0.00",
				debit: "123.45",
				journal_entry_id: "journal-1",
				line_number: "1",
				line_role: "debit",
			}),
			expect.objectContaining({
				account_id: "acct-lender-payable-1",
				credit: "123.45",
				debit: "0.00",
				journal_entry_id: "journal-1",
				line_number: "2",
				line_role: "credit",
			}),
		]);

		expect(trialBalanceExportRows).toEqual([
			expect.objectContaining({
				account_id: "acct-lender-payable-1",
				closing_balance: "1000.00",
				credit_turnover: "123.45",
				debit_turnover: "0.00",
				opening_balance: "876.55",
			}),
		]);
	});
});

describe("admin financial ledger balance formatting", () => {
	it("renders account balances using DR and CR semantics instead of signed currency", () => {
		expect(
			formatAccountBalanceCents({
				balanceCents: -448,
				normalBalance: "debit",
			})
		).toBe("$4.48 CR");
		expect(
			formatAccountBalanceCents({
				balanceCents: 100_000,
				normalBalance: "debit",
			})
		).toBe("$1,000.00 DR");
		expect(
			formatAccountBalanceCents({
				balanceCents: 100_000,
				normalBalance: "credit",
			})
		).toBe("$1,000.00 CR");
		expect(
			formatAccountBalanceCents({
				balanceCents: 0,
				normalBalance: "credit",
			})
		).toBe("$0.00");
	});
});

describe("admin financial ledger validation workflow", () => {
	it("normalizes imported validation CSV rows and compares them to actual ledger state", () => {
		const expectedRows = parseValidationCsv([
			"subject_type,subject_id,metric,expected_amount,effective_date,source_row_reference",
			"lender,lender-1,available lender payable balance,750.00,2026-04-14,excel-1",
			"posting_group,posting-group-1,control_balance,25.00,2026-04-14,excel-2",
			"account,acct-lender-payable-1,closing_balance,999.00,2026-04-14,excel-3",
			"account,missing-account,closing_balance,25.00,2026-04-14,excel-4",
		].join("\n"));

		expect(expectedRows).toEqual([
			expect.objectContaining({
				effectiveDate: "2026-04-14",
				expectedAmountCents: 75_000,
				metric: "available_lender_payable_balance",
				sourceRowReference: "excel-1",
				subjectId: "lender-1",
				subjectType: "lender",
			}),
			expect.objectContaining({
				expectedAmountCents: 2_500,
				metric: "control_balance",
				subjectId: "posting-group-1",
				subjectType: "posting_group",
			}),
			expect.objectContaining({
				expectedAmountCents: 99_900,
				metric: "closing_balance",
				subjectId: "acct-lender-payable-1",
				subjectType: "account",
			}),
			expect.objectContaining({
				expectedAmountCents: 2_500,
				metric: "closing_balance",
				subjectId: "missing-account",
				subjectType: "account",
			}),
		]);

		const comparisons = compareValidationRows({
			expectedRows,
			financialLedger: financialLedgerSnapshot,
			paymentOperations: paymentOperationsSnapshot,
		});
		const summary = summarizeValidationComparisons(comparisons);
		const diffRows = parseCsv(buildValidationDiffCsv(comparisons)).rows;

		expect(comparisons).toEqual([
			expect.objectContaining({
				actualAmountCents: 75_000,
				status: "exact_match",
				varianceCents: 0,
			}),
			expect.objectContaining({
				actualAmountCents: 2_500,
				status: "exact_match",
				varianceCents: 0,
			}),
			expect.objectContaining({
				actualAmountCents: 100_000,
				status: "mismatch",
				varianceCents: 100,
			}),
			expect.objectContaining({
				actualAmountCents: null,
				status: "missing_actual",
				varianceCents: null,
			}),
		]);

		expect(summary).toEqual({
			exactMatches: 2,
			largestVarianceCents: 100,
			mismatches: 1,
			rowsCompared: 4,
			totalAbsoluteVarianceCents: 100,
			unresolvedVariances: 1,
		});

		expect(diffRows).toEqual([
			expect.objectContaining({
				actual_amount: "750.00",
				status: "exact_match",
				subject_id: "lender-1",
				variance: "0.00",
			}),
			expect.objectContaining({
				actual_amount: "25.00",
				status: "exact_match",
				subject_id: "posting-group-1",
				variance: "0.00",
			}),
			expect.objectContaining({
				actual_amount: "1000.00",
				status: "mismatch",
				subject_id: "acct-lender-payable-1",
				variance: "1.00",
			}),
			expect.objectContaining({
				actual_amount: "",
				status: "missing_actual",
				subject_id: "missing-account",
				variance: "",
			}),
		]);
	});
});
