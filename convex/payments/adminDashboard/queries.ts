import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { cashLedgerQuery, paymentQuery } from "../../fluent";
import { getPostedBalance } from "../../ledger/accounts";
import {
	getCashAccountBalance,
	isCreditNormalFamily,
	safeBigintToNumber,
} from "../cashLedger/accounts";
import {
	type FullReconciliationResult,
	runFullReconciliationSuite,
} from "../cashLedger/reconciliationSuite";
import {
	buildCollectionAttemptRow,
	buildCollectionPlanEntryRow,
} from "../collectionPlan/readModels";

type CashAccount = Doc<"cash_ledger_accounts">;
type CashJournalEntry = Doc<"cash_ledger_journal_entries">;
type Obligation = Doc<"obligations">;
type TransferRequest = Doc<"transferRequests">;

type PrimitiveCell = boolean | null | number | string;

function compareDescending(left: number, right: number) {
	return right - left;
}

function compareSequence(
	left: { sequenceNumber: bigint },
	right: { sequenceNumber: bigint }
) {
	if (left.sequenceNumber < right.sequenceNumber) {
		return -1;
	}
	if (left.sequenceNumber > right.sequenceNumber) {
		return 1;
	}
	return 0;
}

function idTail(value: string) {
	return value.slice(-6);
}

function humanize(value: string) {
	return value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replaceAll("_", " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildUserLabel(
	user:
		| Pick<Doc<"users">, "email" | "firstName" | "lastName">
		| undefined
		| null,
	fallback: string
) {
	if (!user) {
		return fallback;
	}

	const fullName = `${user.firstName} ${user.lastName}`.trim();
	if (fullName.length > 0) {
		return fullName;
	}

	return user.email || fallback;
}

function buildPropertyLabel(property?: Doc<"properties"> | null) {
	if (!property) {
		return "Unknown property";
	}

	return `${property.streetAddress}, ${property.city}`;
}

function normalBalanceLabel(family: CashAccount["family"]) {
	return isCreditNormalFamily(family) ? "credit" : "debit";
}

function familyLabel(family: CashAccount["family"]) {
	return humanize(family.toLowerCase());
}

function toPrimitiveCell(value: unknown): PrimitiveCell {
	if (typeof value === "bigint") {
		return safeBigintToNumber(value);
	}
	if (
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	}
	if (value === null || value === undefined) {
		return null;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry)).join(", ");
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

function normalizeRecordRow(item: unknown): Record<string, PrimitiveCell> {
	if (!item || typeof item !== "object" || Array.isArray(item)) {
		return { value: toPrimitiveCell(item) };
	}

	return Object.fromEntries(
		Object.entries(item).map(([key, value]) => [key, toPrimitiveCell(value)])
	);
}

function buildPreview(rows: readonly Record<string, PrimitiveCell>[]) {
	return rows.slice(0, 3).map((row) => {
		const previewParts = Object.entries(row)
			.slice(0, 3)
			.map(([key, value]) => `${humanize(key)} ${value ?? "—"}`);
		return previewParts.join(" • ");
	});
}

async function loadReferenceData(ctx: QueryCtx) {
	const [users, borrowers, lenders, mortgages, properties, obligations] =
		await Promise.all([
			ctx.db.query("users").collect(),
			ctx.db.query("borrowers").collect(),
			ctx.db.query("lenders").collect(),
			ctx.db.query("mortgages").collect(),
			ctx.db.query("properties").collect(),
			ctx.db.query("obligations").collect(),
		]);

	const usersById = new Map(users.map((user) => [String(user._id), user]));
	const propertiesById = new Map(
		properties.map((property) => [String(property._id), property])
	);
	const mortgagesById = new Map(
		mortgages.map((mortgage) => [String(mortgage._id), mortgage])
	);
	const obligationsById = new Map(
		obligations.map((obligation) => [String(obligation._id), obligation])
	);

	const borrowerLabels = new Map<string, string>();
	for (const borrower of borrowers) {
		borrowerLabels.set(
			String(borrower._id),
			buildUserLabel(
				usersById.get(String(borrower.userId)),
				`Borrower ${idTail(String(borrower._id))}`
			)
		);
	}

	const lenderLabels = new Map<string, string>();
	for (const lender of lenders) {
		lenderLabels.set(
			String(lender._id),
			buildUserLabel(
				usersById.get(String(lender.userId)),
				`Lender ${idTail(String(lender._id))}`
			)
		);
	}

	const mortgageLabels = new Map<string, string>();
	for (const mortgage of mortgages) {
		mortgageLabels.set(
			String(mortgage._id),
			buildPropertyLabel(propertiesById.get(String(mortgage.propertyId)))
		);
	}

	return {
		borrowerLabels,
		lenderLabels,
		mortgageLabels,
		mortgagesById,
		obligationsById,
		propertiesById,
		usersById,
	};
}

function buildAccountCode(account: CashAccount) {
	const segments: string[] = [account.family];

	if (account.subaccount) {
		segments.push(account.subaccount);
	}

	if (account.obligationId) {
		segments.push(`OBL-${idTail(String(account.obligationId))}`);
	} else if (account.mortgageId) {
		segments.push(`MRT-${idTail(String(account.mortgageId))}`);
	} else if (account.lenderId) {
		segments.push(`LND-${idTail(String(account.lenderId))}`);
	} else if (account.borrowerId) {
		segments.push(`BRW-${idTail(String(account.borrowerId))}`);
	} else {
		segments.push(`ACC-${idTail(String(account._id))}`);
	}

	return segments.join(".");
}

function buildAccountName(
	account: CashAccount,
	references: Awaited<ReturnType<typeof loadReferenceData>>
) {
	const parts = [familyLabel(account.family)];
	if (account.subaccount) {
		parts.push(humanize(account.subaccount.toLowerCase()));
	}
	if (account.obligationId) {
		const obligation = references.obligationsById.get(
			String(account.obligationId)
		);
		parts.push(
			obligation
				? `Payment ${obligation.paymentNumber}`
				: `Obligation ${idTail(String(account.obligationId))}`
		);
	}
	if (account.mortgageId) {
		parts.push(
			references.mortgageLabels.get(String(account.mortgageId)) ??
				`Mortgage ${idTail(String(account.mortgageId))}`
		);
	}
	if (account.lenderId) {
		parts.push(
			references.lenderLabels.get(String(account.lenderId)) ??
				`Lender ${idTail(String(account.lenderId))}`
		);
	}
	if (account.borrowerId) {
		parts.push(
			references.borrowerLabels.get(String(account.borrowerId)) ??
				`Borrower ${idTail(String(account.borrowerId))}`
		);
	}
	return parts.join(" • ");
}

function buildChartOfAccountsRows(
	accounts: readonly CashAccount[],
	journalEntries: readonly CashJournalEntry[],
	references: Awaited<ReturnType<typeof loadReferenceData>>
) {
	const lastActivityByAccountId = new Map<string, number>();

	for (const entry of journalEntries) {
		const timestamp = entry.timestamp;
		for (const accountId of [entry.debitAccountId, entry.creditAccountId]) {
			const key = String(accountId);
			const current = lastActivityByAccountId.get(key) ?? 0;
			if (timestamp > current) {
				lastActivityByAccountId.set(key, timestamp);
			}
		}
	}

	return accounts
		.map((account) => {
			const balance = safeBigintToNumber(getCashAccountBalance(account));
			return {
				accountId: String(account._id),
				accountCode: buildAccountCode(account),
				accountFamily: account.family,
				accountName: buildAccountName(account, references),
				balanceCents: balance,
				borrowerId: account.borrowerId ? String(account.borrowerId) : null,
				borrowerLabel: account.borrowerId
					? (references.borrowerLabels.get(String(account.borrowerId)) ?? null)
					: null,
				controlSubaccount: account.subaccount ?? null,
				createdAt: account.createdAt,
				lenderId: account.lenderId ? String(account.lenderId) : null,
				lenderLabel: account.lenderId
					? (references.lenderLabels.get(String(account.lenderId)) ?? null)
					: null,
				lastActivityAt:
					lastActivityByAccountId.get(String(account._id)) ?? null,
				mortgageId: account.mortgageId ? String(account.mortgageId) : null,
				mortgageLabel: account.mortgageId
					? (references.mortgageLabels.get(String(account.mortgageId)) ?? null)
					: null,
				normalBalance: normalBalanceLabel(account.family),
				obligationId: account.obligationId
					? String(account.obligationId)
					: null,
				status: balance !== 0 ? "active" : "open",
			};
		})
		.sort((left, right) =>
			left.accountCode.localeCompare(right.accountCode, "en")
		);
}

function buildJournalLineRows(
	journalEntries: readonly CashJournalEntry[],
	accountsById: ReadonlyMap<string, CashAccount>,
	references: Awaited<ReturnType<typeof loadReferenceData>>
) {
	const rows: Array<{
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
	}> = [];

	for (const entry of [...journalEntries].sort(compareSequence)) {
		const amountCents = safeBigintToNumber(entry.amount);
		const sequenceNumber = safeBigintToNumber(entry.sequenceNumber);
		const timestampUtc = new Date(entry.timestamp).toISOString();
		const reference =
			entry.postingGroupId ??
			entry.reason ??
			`${entry.entryType.toLowerCase()}-${idTail(String(entry._id))}`;

		const sides = [
			{
				account: accountsById.get(String(entry.debitAccountId)),
				accountId: String(entry.debitAccountId),
				creditCents: 0,
				debitCents: amountCents,
				lineNumber: 1 as const,
				lineRole: "debit" as const,
			},
			{
				account: accountsById.get(String(entry.creditAccountId)),
				accountId: String(entry.creditAccountId),
				creditCents: amountCents,
				debitCents: 0,
				lineNumber: 2 as const,
				lineRole: "credit" as const,
			},
		];

		for (const side of sides) {
			rows.push({
				accountCode: side.account
					? buildAccountCode(side.account)
					: side.accountId,
				accountFamily: side.account?.family ?? "UNKNOWN",
				accountId: side.accountId,
				accountName: side.account
					? buildAccountName(side.account, references)
					: side.accountId,
				borrowerId: entry.borrowerId ? String(entry.borrowerId) : null,
				borrowerLabel: entry.borrowerId
					? (references.borrowerLabels.get(String(entry.borrowerId)) ?? null)
					: null,
				causedByJournalEntryId: entry.causedBy ? String(entry.causedBy) : null,
				controlSubaccount: side.account?.subaccount ?? null,
				creditCents: side.creditCents,
				currencyCode: "CAD",
				debitCents: side.debitCents,
				description: entry.reason ?? humanize(entry.entryType.toLowerCase()),
				dispersalEntryId: entry.dispersalEntryId
					? String(entry.dispersalEntryId)
					: null,
				effectiveDate: entry.effectiveDate,
				entryType: entry.entryType,
				idempotencyKey: entry.idempotencyKey,
				journalEntryId: String(entry._id),
				lenderId: entry.lenderId ? String(entry.lenderId) : null,
				lenderLabel: entry.lenderId
					? (references.lenderLabels.get(String(entry.lenderId)) ?? null)
					: null,
				lineNumber: side.lineNumber,
				lineRole: side.lineRole,
				mortgageId: entry.mortgageId ? String(entry.mortgageId) : null,
				mortgageLabel: entry.mortgageId
					? (references.mortgageLabels.get(String(entry.mortgageId)) ?? null)
					: null,
				normalBalance: side.account
					? normalBalanceLabel(side.account.family)
					: "debit",
				obligationId: entry.obligationId ? String(entry.obligationId) : null,
				postingGroupId: entry.postingGroupId ?? null,
				reference,
				sequenceNumber,
				sourceActorId: entry.source.actorId ?? null,
				sourceActorType: entry.source.actorType ?? null,
				sourceChannel: entry.source.channel,
				timestampUtc,
				transferRequestId: entry.transferRequestId
					? String(entry.transferRequestId)
					: null,
			});
		}
	}

	return rows;
}

function buildTrialBalanceRows(
	chartOfAccounts: ReturnType<typeof buildChartOfAccountsRows>,
	accountsById: ReadonlyMap<string, CashAccount>
) {
	return chartOfAccounts.map((accountRow) => {
		const account = accountsById.get(accountRow.accountId);
		const debitTurnover = account
			? safeBigintToNumber(account.cumulativeDebits)
			: 0;
		const creditTurnover = account
			? safeBigintToNumber(account.cumulativeCredits)
			: 0;

		return {
			accountId: accountRow.accountId,
			accountCode: accountRow.accountCode,
			accountFamily: accountRow.accountFamily,
			accountName: accountRow.accountName,
			borrowerId: accountRow.borrowerId,
			closingBalanceCents: accountRow.balanceCents,
			controlSubaccount: accountRow.controlSubaccount,
			creditTurnoverCents: creditTurnover,
			debitTurnoverCents: debitTurnover,
			lenderId: accountRow.lenderId,
			mortgageId: accountRow.mortgageId,
			normalBalance: accountRow.normalBalance,
			obligationId: accountRow.obligationId,
			openingBalanceCents: 0,
		};
	});
}

function buildReconciliationCards(result: FullReconciliationResult) {
	const allResults = [
		...result.checkResults.map((item) => ({
			category: "checks",
			...item,
		})),
		...result.conservationResults.map((item) => ({
			category: "conservation",
			...item,
		})),
		...result.transferResults.map((item) => ({
			category: "transfers",
			...item,
		})),
	];

	return allResults.map((checkResult) => {
		const rows = checkResult.items.map((item) => normalizeRecordRow(item));
		return {
			category: checkResult.category,
			checkName: checkResult.checkName,
			checkedAt: checkResult.checkedAt,
			columns: rows[0] ? Object.keys(rows[0]) : [],
			count: checkResult.count,
			isHealthy: checkResult.isHealthy,
			preview: buildPreview(rows),
			rows,
			totalAmountCents: checkResult.totalAmountCents,
		};
	});
}

function buildTransferRow(
	transfer: TransferRequest,
	references: Awaited<ReturnType<typeof loadReferenceData>>,
	hasLedgerLink: boolean
) {
	const mortgageLabel = transfer.mortgageId
		? (references.mortgageLabels.get(String(transfer.mortgageId)) ?? null)
		: null;

	let counterpartyLabel = transfer.counterpartyId;
	if (transfer.counterpartyType === "borrower") {
		counterpartyLabel =
			references.borrowerLabels.get(transfer.counterpartyId) ??
			transfer.counterpartyId;
	} else if (transfer.counterpartyType === "lender") {
		counterpartyLabel =
			references.lenderLabels.get(transfer.counterpartyId) ??
			transfer.counterpartyId;
	}

	return {
		amount: transfer.amount,
		borrowerId: transfer.borrowerId ? String(transfer.borrowerId) : null,
		confirmedAt: transfer.confirmedAt ?? null,
		counterpartyId: transfer.counterpartyId,
		counterpartyLabel,
		counterpartyType: transfer.counterpartyType,
		createdAt: transfer.createdAt,
		dealId: transfer.dealId ? String(transfer.dealId) : null,
		direction: transfer.direction,
		dispersalEntryId: transfer.dispersalEntryId
			? String(transfer.dispersalEntryId)
			: null,
		failureCode: transfer.failureCode ?? null,
		failureReason: transfer.failureReason ?? null,
		hasLedgerLink,
		idempotencyKey: transfer.idempotencyKey,
		journalIntegrity:
			hasLedgerLink ||
			transfer.status === "initiated" ||
			transfer.status === "pending"
				? "linked"
				: transfer.status === "confirmed" || transfer.status === "reversed"
					? "missing"
					: "pending",
		lenderId: transfer.lenderId ? String(transfer.lenderId) : null,
		mortgageId: transfer.mortgageId ? String(transfer.mortgageId) : null,
		mortgageLabel,
		obligationId: transfer.obligationId ? String(transfer.obligationId) : null,
		planEntryId: transfer.planEntryId ? String(transfer.planEntryId) : null,
		providerCode: transfer.providerCode,
		providerRef: transfer.providerRef ?? null,
		reversedAt: transfer.reversedAt ?? null,
		status: transfer.status,
		transferId: String(transfer._id),
		transferType: transfer.transferType,
	};
}

function buildObligationRows(args: {
	attempts: readonly Doc<"collectionAttempts">[];
	cashAccounts: readonly CashAccount[];
	obligations: readonly Obligation[];
	references: Awaited<ReturnType<typeof loadReferenceData>>;
	transfers: readonly TransferRequest[];
}) {
	const receivablesByObligationId = new Map<string, number>();
	for (const account of args.cashAccounts) {
		if (account.family !== "BORROWER_RECEIVABLE" || !account.obligationId) {
			continue;
		}
		receivablesByObligationId.set(
			String(account.obligationId),
			safeBigintToNumber(getCashAccountBalance(account))
		);
	}

	const latestAttemptByObligationId = new Map<
		string,
		Doc<"collectionAttempts">
	>();
	for (const attempt of args.attempts) {
		for (const obligationId of attempt.obligationIds) {
			const key = String(obligationId);
			const current = latestAttemptByObligationId.get(key);
			if (!current || attempt.initiatedAt > current.initiatedAt) {
				latestAttemptByObligationId.set(key, attempt);
			}
		}
	}

	const latestTransferByObligationId = new Map<string, TransferRequest>();
	for (const transfer of args.transfers) {
		if (!transfer.obligationId) {
			continue;
		}
		const key = String(transfer.obligationId);
		const current = latestTransferByObligationId.get(key);
		if (!current || transfer.createdAt > current.createdAt) {
			latestTransferByObligationId.set(key, transfer);
		}
	}

	const correctiveChildrenBySourceId = new Map<string, number>();
	for (const obligation of args.obligations) {
		if (!obligation.sourceObligationId || obligation.type === "late_fee") {
			continue;
		}
		const key = String(obligation.sourceObligationId);
		correctiveChildrenBySourceId.set(
			key,
			(correctiveChildrenBySourceId.get(key) ?? 0) + 1
		);
	}

	return args.obligations
		.map((obligation) => {
			const obligationId = String(obligation._id);
			const projectedOutstandingBalance =
				obligation.amount - obligation.amountSettled;
			const journalOutstandingBalance =
				receivablesByObligationId.get(obligationId) ?? 0;
			const latestAttempt = latestAttemptByObligationId.get(obligationId);
			const latestTransfer = latestTransferByObligationId.get(obligationId);
			const mortgageLabel =
				args.references.mortgageLabels.get(String(obligation.mortgageId)) ??
				`Mortgage ${idTail(String(obligation.mortgageId))}`;
			const borrowerLabel =
				args.references.borrowerLabels.get(String(obligation.borrowerId)) ??
				`Borrower ${idTail(String(obligation.borrowerId))}`;

			return {
				amount: obligation.amount,
				amountSettled: obligation.amountSettled,
				borrowerId: String(obligation.borrowerId),
				borrowerLabel,
				correctiveCount: correctiveChildrenBySourceId.get(obligationId) ?? 0,
				dueDate: obligation.dueDate,
				gracePeriodEnd: obligation.gracePeriodEnd,
				hasActiveCollection:
					latestAttempt?.status === "executing" ||
					latestAttempt?.status === "initiated" ||
					latestAttempt?.status === "pending",
				hasJournalDrift:
					projectedOutstandingBalance !== journalOutstandingBalance,
				isCorrective:
					obligation.sourceObligationId !== undefined &&
					obligation.type !== "late_fee",
				journalOutstandingBalance,
				latestCollectionAttemptId: latestAttempt
					? String(latestAttempt._id)
					: null,
				latestCollectionStatus: latestAttempt?.status ?? null,
				latestTransferId: latestTransfer ? String(latestTransfer._id) : null,
				latestTransferStatus: latestTransfer?.status ?? null,
				mortgageId: String(obligation.mortgageId),
				mortgageLabel,
				obligationId,
				paymentNumber: obligation.paymentNumber,
				postingGroupId: obligation.postingGroupId ?? null,
				projectedOutstandingBalance,
				sourceObligationId: obligation.sourceObligationId
					? String(obligation.sourceObligationId)
					: null,
				status: obligation.status,
				type: obligation.type,
			};
		})
		.sort((left, right) => compareDescending(left.dueDate, right.dueDate));
}

export const getPaymentOperationsDashboardSnapshot = paymentQuery
	.handler(async (ctx) => {
		const [
			references,
			obligations,
			collectionAttempts,
			collectionPlanEntries,
			transfers,
			cashAccounts,
			reconciliationSuite,
		] = await Promise.all([
			loadReferenceData(ctx),
			ctx.db.query("obligations").collect(),
			ctx.db.query("collectionAttempts").collect(),
			ctx.db.query("collectionPlanEntries").collect(),
			ctx.db.query("transferRequests").collect(),
			ctx.db.query("cash_ledger_accounts").collect(),
			runFullReconciliationSuite(ctx),
		]);

		const obligationRows = buildObligationRows({
			attempts: collectionAttempts,
			cashAccounts,
			obligations,
			references,
			transfers,
		});

		const attemptRows = await Promise.all(
			[...collectionAttempts]
				.sort((left, right) =>
					compareDescending(left.initiatedAt, right.initiatedAt)
				)
				.map((attempt) => buildCollectionAttemptRow(ctx, attempt))
		);

		const planEntryRows = await Promise.all(
			[...collectionPlanEntries]
				.sort((left, right) =>
					compareDescending(left.scheduledDate, right.scheduledDate)
				)
				.map((entry) => buildCollectionPlanEntryRow(ctx, entry))
		);

		const transferLedgerLinks = new Set<string>();
		const journalEntries = await ctx.db
			.query("cash_ledger_journal_entries")
			.collect();
		for (const entry of journalEntries) {
			if (entry.transferRequestId) {
				transferLedgerLinks.add(String(entry.transferRequestId));
			}
		}

		const transferRows = transfers
			.map((transfer) =>
				buildTransferRow(
					transfer,
					references,
					transferLedgerLinks.has(String(transfer._id))
				)
			)
			.sort((left, right) =>
				compareDescending(left.createdAt, right.createdAt)
			);

		const obligationCounts = obligations.reduce<Record<string, number>>(
			(counts, obligation) => {
				counts[obligation.status] = (counts[obligation.status] ?? 0) + 1;
				return counts;
			},
			{}
		);
		const activeAttemptCount = collectionAttempts.filter((attempt) =>
			["executing", "initiated", "pending"].includes(attempt.status)
		).length;

		return {
			generatedAt: Date.now(),
			overview: {
				activeCollectionAttempts: activeAttemptCount,
				dueObligations: obligationCounts.due ?? 0,
				overdueObligations: obligationCounts.overdue ?? 0,
				reconciliationExceptions: reconciliationSuite.totalGapCount,
				settledObligations: obligationCounts.settled ?? 0,
				upcomingObligations: obligationCounts.upcoming ?? 0,
			},
			collectionAttempts: attemptRows,
			collectionPlanEntries: planEntryRows,
			obligations: obligationRows,
			transfers: transferRows,
		};
	})
	.public();

export const getFinancialLedgerDashboardSnapshot = cashLedgerQuery
	.handler(async (ctx) => {
		const [
			references,
			accounts,
			journalEntries,
			fullSuite,
			schedules,
			monitoring,
			ownershipAccounts,
			deals,
		] = await Promise.all([
			loadReferenceData(ctx),
			ctx.db.query("cash_ledger_accounts").collect(),
			ctx.db.query("cash_ledger_journal_entries").collect(),
			runFullReconciliationSuite(ctx),
			ctx.db
				.query("externalCollectionSchedules")
				.withIndex("by_status", (q) => q.eq("status", "sync_error"))
				.collect(),
			ctx.db.query("obligationCronMonitoring").collect(),
			ctx.db.query("ledger_accounts").collect(),
			ctx.db.query("deals").collect(),
		]);

		const accountsById = new Map(
			accounts.map((account) => [String(account._id), account] as const)
		);
		const chartOfAccounts = buildChartOfAccountsRows(
			accounts,
			journalEntries,
			references
		);
		const journalLines = buildJournalLineRows(
			journalEntries,
			accountsById,
			references
		);
		const trialBalance = buildTrialBalanceRows(chartOfAccounts, accountsById);
		const reconciliationCards = buildReconciliationCards(fullSuite);
		const totalExceptionAmountCents = reconciliationCards.reduce(
			(sum, card) => sum + Math.abs(card.totalAmountCents),
			0
		);

		const dispersalHealingAttempts = await ctx.db
			.query("dispersalHealingAttempts")
			.collect();
		const transferHealingAttempts = await ctx.db
			.query("transferHealingAttempts")
			.collect();

		const opsEvents = [
			...dispersalHealingAttempts.map((attempt) => ({
				eventId: `dispersal:${String(attempt._id)}`,
				occurredAt: attempt.escalatedAt ?? attempt.lastAttemptAt,
				relatedResourceId: String(attempt.obligationId),
				relatedResourceType: "obligation",
				severity: attempt.status === "escalated" ? "error" : "warning",
				sourceJob: "dispersal-self-healing",
				status: attempt.status,
				summary: `Attempt count ${attempt.attemptCount}`,
				title:
					attempt.status === "escalated"
						? "Dispersal healing escalated"
						: attempt.status === "resolved"
							? "Dispersal healing resolved"
							: "Dispersal healing retrying",
			})),
			...transferHealingAttempts.map((attempt) => ({
				eventId: `transfer:${String(attempt._id)}`,
				occurredAt:
					attempt.resolvedAt ?? attempt.escalatedAt ?? attempt.lastAttemptAt,
				relatedResourceId: String(attempt.transferRequestId),
				relatedResourceType: "transferRequest",
				severity: attempt.status === "escalated" ? "error" : "warning",
				sourceJob: "transfer-reconciliation",
				status: attempt.status,
				summary: `Attempt count ${attempt.attemptCount}`,
				title:
					attempt.status === "escalated"
						? "Transfer integrity defect escalated"
						: attempt.status === "resolved"
							? "Transfer healing resolved"
							: "Transfer healing retrying",
			})),
			...schedules.map((schedule) => ({
				eventId: `schedule:${String(schedule._id)}`,
				occurredAt:
					schedule.lastSyncErrorAt ??
					schedule.lastSyncAttemptAt ??
					schedule.createdAt,
				relatedResourceId: String(schedule._id),
				relatedResourceType: "externalCollectionSchedule",
				severity: "error",
				sourceJob: "recurring-schedule-poller",
				status: schedule.status,
				summary:
					schedule.lastSyncErrorMessage ??
					`Consecutive failures ${schedule.consecutiveSyncFailures}`,
				title: "Recurring schedule sync error",
			})),
		].sort((left, right) =>
			compareDescending(left.occurredAt, right.occurredAt)
		);

		const jobs = [
			{
				jobKey: "dispersal-self-healing",
				label: "Dispersal self-healing",
				lastObservedAt:
					dispersalHealingAttempts
						.map((attempt) => attempt.lastAttemptAt)
						.sort(compareDescending)[0] ?? null,
				openItemCount: dispersalHealingAttempts.filter(
					(attempt) => attempt.status !== "resolved"
				).length,
				status: dispersalHealingAttempts.some(
					(attempt) => attempt.status === "escalated"
				)
					? "error"
					: dispersalHealingAttempts.some(
								(attempt) => attempt.status === "retrying"
							)
						? "warning"
						: "healthy",
			},
			{
				jobKey: "transfer-reconciliation",
				label: "Transfer reconciliation",
				lastObservedAt:
					transferHealingAttempts
						.map((attempt) => attempt.lastAttemptAt)
						.sort(compareDescending)[0] ?? null,
				openItemCount: transferHealingAttempts.filter(
					(attempt) => attempt.status !== "resolved"
				).length,
				status: transferHealingAttempts.some(
					(attempt) => attempt.status === "escalated"
				)
					? "error"
					: transferHealingAttempts.some(
								(attempt) => attempt.status === "retrying"
							)
						? "warning"
						: "healthy",
			},
			{
				jobKey: "recurring-schedule-poller",
				label: "Recurring schedule poller",
				lastObservedAt:
					schedules
						.map(
							(schedule) =>
								schedule.lastSyncAttemptAt ??
								schedule.lastSyncErrorAt ??
								schedule.createdAt
						)
						.sort(compareDescending)[0] ?? null,
				openItemCount: schedules.length,
				status: schedules.length > 0 ? "error" : "healthy",
			},
			{
				jobKey: "obligation-transition-cron",
				label: "Obligation transition cron",
				lastObservedAt:
					monitoring.map((row) => row.updatedAt).sort(compareDescending)[0] ??
					null,
				openItemCount: monitoring.filter(
					(row) =>
						row.newlyDueOverflowStreak > 0 || row.pastGraceOverflowStreak > 0
				).length,
				status: monitoring.some(
					(row) =>
						row.newlyDueOverflowStreak > 0 || row.pastGraceOverflowStreak > 0
				)
					? "warning"
					: "healthy",
			},
		];

		const now = Date.now();
		const last24h = now - 86_400_000;
		const activePositionAccounts = ownershipAccounts.filter(
			(account) => account.type === "POSITION" && getPostedBalance(account) > 0n
		);
		const mortgagesWithPositions = new Set(
			activePositionAccounts
				.map((account) => account.mortgageId)
				.filter((value): value is string => Boolean(value))
		).size;
		const pendingDealsAffectingOwnership = deals.filter(
			(deal) => deal.status !== "confirmed" && deal.status !== "failed"
		).length;

		return {
			chartOfAccounts,
			generatedAt: now,
			journalLines,
			opsHealth: {
				events: opsEvents,
				jobs,
				summary: {
					activeIncidents: opsEvents.filter(
						(event) => event.status !== "resolved"
					).length,
					escalatedHealingAttempts:
						dispersalHealingAttempts.filter(
							(attempt) => attempt.status === "escalated"
						).length +
						transferHealingAttempts.filter(
							(attempt) => attempt.status === "escalated"
						).length,
					failedRunsLast24h: opsEvents.filter(
						(event) => event.severity === "error" && event.occurredAt >= last24h
					).length,
					openIntegrityDefects: transferHealingAttempts.filter(
						(attempt) => attempt.status === "escalated"
					).length,
					schedulesInSyncError: schedules.length,
				},
			},
			ownershipLedger: {
				activePositionAccounts: activePositionAccounts.length,
				mortgagesWithPositions,
				pendingDealsAffectingOwnership,
			},
			reconciliation: {
				cards: reconciliationCards,
				checkedAt: fullSuite.checkedAt,
				healthyChecks: reconciliationCards.filter((card) => card.isHealthy)
					.length,
				isHealthy: fullSuite.isHealthy,
				totalExceptionAmountCents,
				totalGapCount: fullSuite.totalGapCount,
				unhealthyChecks: reconciliationCards.filter((card) => !card.isHealthy)
					.length,
				unhealthyCheckNames: fullSuite.unhealthyCheckNames,
			},
			trialBalance,
		};
	})
	.public();
