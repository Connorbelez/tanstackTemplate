import type { Doc, Id, TableNames } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { adminQuery } from "../../fluent";
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
interface ReferenceData {
	borrowerLabels: Map<string, string>;
	lenderLabels: Map<string, string>;
	mortgageLabels: Map<string, string>;
	mortgagesById: Map<string, Doc<"mortgages">>;
	obligationsById: Map<string, Obligation>;
	propertiesById: Map<string, Doc<"properties">>;
	usersById: Map<string, Doc<"users">>;
}

interface ReferenceIdSets {
	borrowerIds: Id<"borrowers">[];
	lenderIds: Id<"lenders">[];
	mortgageIds: Id<"mortgages">[];
	obligationIds: Id<"obligations">[];
}

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

function collectUniqueIds<TableName extends TableNames>(
	values: Array<Id<TableName> | null | undefined>
) {
	const uniqueIds = new Map<string, Id<TableName>>();
	for (const value of values) {
		if (value) {
			uniqueIds.set(String(value), value);
		}
	}
	return [...uniqueIds.values()];
}

async function fetchDocsByIds<
	TableName extends TableNames,
	TDoc extends { _id: Id<TableName> },
>(
	ids: readonly Id<TableName>[],
	loadDoc: (id: Id<TableName>) => Promise<TDoc | null>
) {
	const docsById = new Map<string, TDoc>();
	for (const id of ids) {
		const doc = await loadDoc(id);
		if (doc) {
			docsById.set(String(doc._id), doc);
		}
	}
	return docsById;
}

async function loadReferenceData(
	ctx: QueryCtx,
	referenceIds: ReferenceIdSets
): Promise<ReferenceData> {
	const borrowersById = await fetchDocsByIds(referenceIds.borrowerIds, (id) =>
		ctx.db.get(id)
	);
	const lendersById = await fetchDocsByIds(referenceIds.lenderIds, (id) =>
		ctx.db.get(id)
	);
	const mortgagesById = await fetchDocsByIds(referenceIds.mortgageIds, (id) =>
		ctx.db.get(id)
	);
	const obligationsById = await fetchDocsByIds(
		referenceIds.obligationIds,
		(id) => ctx.db.get(id)
	);

	const userIds = collectUniqueIds([
		...[...borrowersById.values()].map((borrower) => borrower.userId),
		...[...lendersById.values()].map((lender) => lender.userId),
	]);
	const propertyIds = collectUniqueIds(
		[...mortgagesById.values()].map((mortgage) => mortgage.propertyId)
	);

	const usersById = await fetchDocsByIds(userIds, (id) => ctx.db.get(id));
	const propertiesById = await fetchDocsByIds(propertyIds, (id) =>
		ctx.db.get(id)
	);

	const borrowerLabels = new Map<string, string>();
	for (const borrower of borrowersById.values()) {
		borrowerLabels.set(
			String(borrower._id),
			buildUserLabel(
				usersById.get(String(borrower.userId)),
				`Borrower ${idTail(String(borrower._id))}`
			)
		);
	}

	const lenderLabels = new Map<string, string>();
	for (const lender of lendersById.values()) {
		lenderLabels.set(
			String(lender._id),
			buildUserLabel(
				usersById.get(String(lender.userId)),
				`Lender ${idTail(String(lender._id))}`
			)
		);
	}

	const mortgageLabels = new Map<string, string>();
	for (const mortgage of mortgagesById.values()) {
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

function buildAccountName(account: CashAccount, references: ReferenceData) {
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

function buildChartOfAccountsRow(args: {
	account: CashAccount;
	lastActivityByAccountId: ReadonlyMap<string, number>;
	references: ReferenceData;
}) {
	const { account, lastActivityByAccountId, references } = args;
	const balance = safeBigintToNumber(getCashAccountBalance(account));
	const borrowerId = account.borrowerId ? String(account.borrowerId) : null;
	const lenderId = account.lenderId ? String(account.lenderId) : null;
	const mortgageId = account.mortgageId ? String(account.mortgageId) : null;
	const obligationId = account.obligationId
		? String(account.obligationId)
		: null;

	return {
		accountId: String(account._id),
		accountCode: buildAccountCode(account),
		accountFamily: account.family,
		accountName: buildAccountName(account, references),
		balanceCents: balance,
		borrowerId,
		borrowerLabel: borrowerId
			? (references.borrowerLabels.get(borrowerId) ?? null)
			: null,
		controlSubaccount: account.subaccount ?? null,
		createdAt: account.createdAt,
		lenderId,
		lenderLabel: lenderId
			? (references.lenderLabels.get(lenderId) ?? null)
			: null,
		lastActivityAt: lastActivityByAccountId.get(String(account._id)) ?? null,
		mortgageId,
		mortgageLabel: mortgageId
			? (references.mortgageLabels.get(mortgageId) ?? null)
			: null,
		normalBalance: normalBalanceLabel(account.family),
		obligationId,
		status: balance !== 0 ? "active" : "open",
	};
}

function buildChartOfAccountsRows(
	accounts: readonly CashAccount[],
	journalEntries: readonly CashJournalEntry[],
	references: ReferenceData
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
		.map((account) =>
			buildChartOfAccountsRow({
				account,
				lastActivityByAccountId,
				references,
			})
		)
		.sort((left, right) =>
			left.accountCode.localeCompare(right.accountCode, "en")
		);
}

interface JournalLineRow {
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

function buildJournalLineReference(entry: CashJournalEntry) {
	return (
		entry.postingGroupId ??
		entry.reason ??
		`${entry.entryType.toLowerCase()}-${idTail(String(entry._id))}`
	);
}

function buildJournalLineSide(args: {
	account: CashAccount | undefined;
	accountId: string;
	amountCents: number;
	lineNumber: 1 | 2;
	lineRole: "credit" | "debit";
}) {
	return {
		account: args.account,
		accountId: args.accountId,
		creditCents: args.lineRole === "credit" ? args.amountCents : 0,
		debitCents: args.lineRole === "debit" ? args.amountCents : 0,
		lineNumber: args.lineNumber,
		lineRole: args.lineRole,
	};
}

function buildJournalEntryParties(
	entry: CashJournalEntry,
	references: ReferenceData
) {
	const borrowerId = entry.borrowerId ? String(entry.borrowerId) : null;
	const lenderId = entry.lenderId ? String(entry.lenderId) : null;
	const mortgageId = entry.mortgageId ? String(entry.mortgageId) : null;

	return {
		borrowerId,
		borrowerLabel: borrowerId
			? (references.borrowerLabels.get(borrowerId) ?? null)
			: null,
		lenderId,
		lenderLabel: lenderId
			? (references.lenderLabels.get(lenderId) ?? null)
			: null,
		mortgageId,
		mortgageLabel: mortgageId
			? (references.mortgageLabels.get(mortgageId) ?? null)
			: null,
	};
}

function buildJournalLineAccountDetails(
	side: ReturnType<typeof buildJournalLineSide>,
	references: ReferenceData
) {
	return {
		accountCode: side.account ? buildAccountCode(side.account) : side.accountId,
		accountFamily: side.account?.family ?? "UNKNOWN",
		accountId: side.accountId,
		accountName: side.account
			? buildAccountName(side.account, references)
			: side.accountId,
		controlSubaccount: side.account?.subaccount ?? null,
		normalBalance: side.account
			? normalBalanceLabel(side.account.family)
			: "debit",
	};
}

function buildJournalLineRow(args: {
	entry: CashJournalEntry;
	reference: string;
	references: ReferenceData;
	sequenceNumber: number;
	side: ReturnType<typeof buildJournalLineSide>;
	timestampUtc: string;
}): JournalLineRow {
	const { entry, reference, references, sequenceNumber, side, timestampUtc } =
		args;
	const parties = buildJournalEntryParties(entry, references);
	const accountDetails = buildJournalLineAccountDetails(side, references);

	return {
		...accountDetails,
		borrowerId: parties.borrowerId,
		borrowerLabel: parties.borrowerLabel,
		causedByJournalEntryId: entry.causedBy ? String(entry.causedBy) : null,
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
		lenderId: parties.lenderId,
		lenderLabel: parties.lenderLabel,
		lineNumber: side.lineNumber,
		lineRole: side.lineRole,
		mortgageId: parties.mortgageId,
		mortgageLabel: parties.mortgageLabel,
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
	};
}

function buildJournalLineRows(
	journalEntries: readonly CashJournalEntry[],
	accountsById: ReadonlyMap<string, CashAccount>,
	references: ReferenceData
) {
	const rows: JournalLineRow[] = [];

	for (const entry of [...journalEntries].sort(compareSequence)) {
		const amountCents = safeBigintToNumber(entry.amount);
		const sequenceNumber = safeBigintToNumber(entry.sequenceNumber);
		const timestampUtc = new Date(entry.timestamp).toISOString();
		const reference = buildJournalLineReference(entry);

		const sides = [
			buildJournalLineSide({
				account: accountsById.get(String(entry.debitAccountId)),
				accountId: String(entry.debitAccountId),
				amountCents,
				lineNumber: 1,
				lineRole: "debit",
			}),
			buildJournalLineSide({
				account: accountsById.get(String(entry.creditAccountId)),
				accountId: String(entry.creditAccountId),
				amountCents,
				lineNumber: 2,
				lineRole: "credit",
			}),
		];

		for (const side of sides) {
			rows.push(
				buildJournalLineRow({
					entry,
					reference,
					references,
					sequenceNumber,
					side,
					timestampUtc,
				})
			);
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
	references: ReferenceData,
	hasLedgerLink: boolean
) {
	const mortgageLabel = transfer.mortgageId
		? (references.mortgageLabels.get(String(transfer.mortgageId)) ?? null)
		: null;

	const counterpartyLabel = buildTransferCounterpartyLabel(
		transfer,
		references
	);
	const journalIntegrity = buildTransferJournalIntegrity(
		transfer,
		hasLedgerLink
	);

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
		journalIntegrity,
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

function buildTransferCounterpartyLabel(
	transfer: TransferRequest,
	references: ReferenceData
) {
	if (transfer.counterpartyType === "borrower") {
		return (
			references.borrowerLabels.get(transfer.counterpartyId) ??
			transfer.counterpartyId
		);
	}

	if (transfer.counterpartyType === "lender") {
		return (
			references.lenderLabels.get(transfer.counterpartyId) ??
			transfer.counterpartyId
		);
	}

	return transfer.counterpartyId;
}

function buildTransferJournalIntegrity(
	transfer: TransferRequest,
	hasLedgerLink: boolean
) {
	if (
		hasLedgerLink ||
		transfer.status === "initiated" ||
		transfer.status === "pending"
	) {
		return "linked";
	}

	if (transfer.status === "confirmed" || transfer.status === "reversed") {
		return "missing";
	}

	return "pending";
}

function buildReceivableBalancesByObligationId(
	cashAccounts: readonly CashAccount[]
) {
	const receivablesByObligationId = new Map<string, number>();
	for (const account of cashAccounts) {
		if (account.family !== "BORROWER_RECEIVABLE" || !account.obligationId) {
			continue;
		}
		receivablesByObligationId.set(
			String(account.obligationId),
			safeBigintToNumber(getCashAccountBalance(account))
		);
	}
	return receivablesByObligationId;
}

function buildLatestAttemptByObligationId(
	attempts: readonly Doc<"collectionAttempts">[]
) {
	const latestAttemptByObligationId = new Map<
		string,
		Doc<"collectionAttempts">
	>();
	for (const attempt of attempts) {
		for (const obligationId of attempt.obligationIds) {
			const key = String(obligationId);
			const current = latestAttemptByObligationId.get(key);
			if (!current || attempt.initiatedAt > current.initiatedAt) {
				latestAttemptByObligationId.set(key, attempt);
			}
		}
	}
	return latestAttemptByObligationId;
}

function buildLatestTransferByObligationId(
	transfers: readonly TransferRequest[]
) {
	const latestTransferByObligationId = new Map<string, TransferRequest>();
	for (const transfer of transfers) {
		if (!transfer.obligationId) {
			continue;
		}
		const key = String(transfer.obligationId);
		const current = latestTransferByObligationId.get(key);
		if (!current || transfer.createdAt > current.createdAt) {
			latestTransferByObligationId.set(key, transfer);
		}
	}
	return latestTransferByObligationId;
}

function buildCorrectiveChildrenBySourceId(obligations: readonly Obligation[]) {
	const correctiveChildrenBySourceId = new Map<string, number>();
	for (const obligation of obligations) {
		if (!obligation.sourceObligationId || obligation.type === "late_fee") {
			continue;
		}
		const key = String(obligation.sourceObligationId);
		correctiveChildrenBySourceId.set(
			key,
			(correctiveChildrenBySourceId.get(key) ?? 0) + 1
		);
	}
	return correctiveChildrenBySourceId;
}

function buildObligationRows(args: {
	attempts: readonly Doc<"collectionAttempts">[];
	cashAccounts: readonly CashAccount[];
	obligations: readonly Obligation[];
	references: ReferenceData;
	transfers: readonly TransferRequest[];
}) {
	const receivablesByObligationId = buildReceivableBalancesByObligationId(
		args.cashAccounts
	);
	const latestAttemptByObligationId = buildLatestAttemptByObligationId(
		args.attempts
	);
	const latestTransferByObligationId = buildLatestTransferByObligationId(
		args.transfers
	);
	const correctiveChildrenBySourceId = buildCorrectiveChildrenBySourceId(
		args.obligations
	);

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

function buildFinancialLedgerSupportObligationRows(args: {
	cashAccounts: readonly CashAccount[];
	obligations: readonly Obligation[];
}) {
	const receivablesByObligationId = buildReceivableBalancesByObligationId(
		args.cashAccounts
	);

	return args.obligations
		.map((obligation) => {
			const obligationId = String(obligation._id);
			const projectedOutstandingBalance =
				obligation.amount - obligation.amountSettled;
			const journalOutstandingBalance =
				receivablesByObligationId.get(obligationId) ?? 0;

			return {
				amount: obligation.amount,
				journalOutstandingBalance,
				obligationId,
				projectedOutstandingBalance,
			};
		})
		.sort((left, right) =>
			compareDescending(
				left.projectedOutstandingBalance,
				right.projectedOutstandingBalance
			)
		);
}

function buildFinancialLedgerSupportTransferRows(
	transfers: readonly TransferRequest[]
) {
	return [...transfers]
		.sort((left, right) => compareDescending(left.createdAt, right.createdAt))
		.map((transfer) => ({
			amount: transfer.amount,
			direction: transfer.direction,
			lenderId: transfer.lenderId ? String(transfer.lenderId) : null,
			status: transfer.status,
		}));
}

function collectPaymentOperationsReferenceIds(args: {
	obligations: readonly Obligation[];
	transfers: readonly TransferRequest[];
}): ReferenceIdSets {
	return {
		borrowerIds: collectUniqueIds([
			...args.obligations.map((obligation) => obligation.borrowerId),
			...args.transfers.map((transfer) => transfer.borrowerId),
		]),
		lenderIds: collectUniqueIds(
			args.transfers.map((transfer) => transfer.lenderId)
		),
		mortgageIds: collectUniqueIds([
			...args.obligations.map((obligation) => obligation.mortgageId),
			...args.transfers.map((transfer) => transfer.mortgageId),
		]),
		obligationIds: collectUniqueIds(
			args.obligations.map((obligation) => obligation._id)
		),
	};
}

function collectFinancialLedgerReferenceIds(args: {
	accounts: readonly CashAccount[];
	journalEntries: readonly CashJournalEntry[];
}): ReferenceIdSets {
	return {
		borrowerIds: collectUniqueIds([
			...args.accounts.map((account) => account.borrowerId),
			...args.journalEntries.map((entry) => entry.borrowerId),
		]),
		lenderIds: collectUniqueIds([
			...args.accounts.map((account) => account.lenderId),
			...args.journalEntries.map((entry) => entry.lenderId),
		]),
		mortgageIds: collectUniqueIds([
			...args.accounts.map((account) => account.mortgageId),
			...args.journalEntries.map((entry) => entry.mortgageId),
		]),
		obligationIds: collectUniqueIds([
			...args.accounts.map((account) => account.obligationId),
			...args.journalEntries.map((entry) => entry.obligationId),
		]),
	};
}

function buildHealingEventTitle(args: {
	resolvedTitle: string;
	retryingTitle: string;
	status: string;
	escalatedTitle: string;
}) {
	if (args.status === "escalated") {
		return args.escalatedTitle;
	}
	if (args.status === "resolved") {
		return args.resolvedTitle;
	}
	return args.retryingTitle;
}

function buildJobStatus(args: { hasEscalated: boolean; hasRetrying: boolean }) {
	if (args.hasEscalated) {
		return "error";
	}
	if (args.hasRetrying) {
		return "warning";
	}
	return "healthy";
}

export const getPaymentOperationsDashboardSnapshot = adminQuery
	.handler(async (ctx) => {
		const [
			obligations,
			collectionAttempts,
			collectionPlanEntries,
			transfers,
			cashAccounts,
			reconciliationSuite,
		] = await Promise.all([
			ctx.db.query("obligations").collect(),
			ctx.db.query("collectionAttempts").collect(),
			ctx.db.query("collectionPlanEntries").collect(),
			ctx.db.query("transferRequests").collect(),
			ctx.db.query("cash_ledger_accounts").collect(),
			runFullReconciliationSuite(ctx),
		]);
		const references = await loadReferenceData(
			ctx,
			collectPaymentOperationsReferenceIds({ obligations, transfers })
		);

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

export const getFinancialLedgerSupportSnapshot = adminQuery
	.handler(async (ctx) => {
		const [obligations, transfers, cashAccounts] = await Promise.all([
			ctx.db.query("obligations").collect(),
			ctx.db.query("transferRequests").collect(),
			ctx.db.query("cash_ledger_accounts").collect(),
		]);

		return {
			generatedAt: Date.now(),
			obligations: buildFinancialLedgerSupportObligationRows({
				cashAccounts,
				obligations,
			}),
			transfers: buildFinancialLedgerSupportTransferRows(transfers),
		};
	})
	.public();

export const getFinancialLedgerDashboardSnapshot = adminQuery
	.handler(async (ctx) => {
		const [
			accounts,
			journalEntries,
			fullSuite,
			schedules,
			monitoring,
			ownershipAccounts,
			deals,
		] = await Promise.all([
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
		const references = await loadReferenceData(
			ctx,
			collectFinancialLedgerReferenceIds({ accounts, journalEntries })
		);

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
				title: buildHealingEventTitle({
					escalatedTitle: "Dispersal healing escalated",
					resolvedTitle: "Dispersal healing resolved",
					retryingTitle: "Dispersal healing retrying",
					status: attempt.status,
				}),
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
				title: buildHealingEventTitle({
					escalatedTitle: "Transfer integrity defect escalated",
					resolvedTitle: "Transfer healing resolved",
					retryingTitle: "Transfer healing retrying",
					status: attempt.status,
				}),
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
				status: buildJobStatus({
					hasEscalated: dispersalHealingAttempts.some(
						(attempt) => attempt.status === "escalated"
					),
					hasRetrying: dispersalHealingAttempts.some(
						(attempt) => attempt.status === "retrying"
					),
				}),
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
				status: buildJobStatus({
					hasEscalated: transferHealingAttempts.some(
						(attempt) => attempt.status === "escalated"
					),
					hasRetrying: transferHealingAttempts.some(
						(attempt) => attempt.status === "retrying"
					),
				}),
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
