import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import { FAIRLEND_BROKERAGE_ORG_ID } from "../constants";
import type { DisbursementBridgeResult } from "../dispersal/disbursementBridge";
import type { TransitionResult } from "../engine/types";
import { adminAction, adminMutation, adminQuery } from "../fluent";
import { getOrCreateCashAccount } from "../payments/cashLedger/accounts";
import { seedCollectionRulesImpl } from "../payments/collectionPlan/defaultRules";
import type { ExecutePlanEntryResult } from "../payments/collectionPlan/executionContract";

const SCENARIO_PREFIX = "amps-e2e";
const OFFLINE_PROVIDER_CODE = "manual_review" as const;
const DEFAULT_RUN_ID = "local-dev";
const DUE_DATE = Date.parse("2026-02-01T00:00:00Z");
const GRACE_PERIOD_END = Date.parse("2026-02-16T00:00:00Z");

type ScenarioStage =
	| "not_seeded"
	| "seeded"
	| "collection_executed"
	| "inbound_pending_confirmation"
	| "inbound_confirmed"
	| "dispersal_ready"
	| "outbound_pending_confirmation"
	| "outbound_confirmed";

type ScenarioState = Awaited<ReturnType<typeof buildScenarioState>>;

type TableName = keyof DataModel;

function normalizeRunId(runId: string) {
	const trimmed = runId.trim();
	if (!trimmed) {
		throw new ConvexError("runId must be a non-empty string");
	}
	return trimmed;
}

function buildScenarioKey(runId: string) {
	return `${SCENARIO_PREFIX}:${normalizeRunId(runId)}`;
}

function buildAuthId(runId: string, role: "broker" | "borrower" | "lender") {
	return `${buildScenarioKey(runId)}:${role}`;
}

function buildEmail(runId: string, role: "broker" | "borrower" | "lender") {
	return `${SCENARIO_PREFIX}-${normalizeRunId(runId)}-${role}@fairlend.test`;
}

function buildPropertyAddress(runId: string) {
	return `E2E ${normalizeRunId(runId)} Demo Lane`;
}

function buildPropertyCity(runId: string) {
	return `Run ${normalizeRunId(runId)}`;
}

function buildLenderOnboardingPath(runId: string) {
	return `/${buildScenarioKey(runId)}/lender`;
}

function todayISO() {
	return new Date().toISOString().slice(0, 10);
}

function sortNewest<T extends { _creationTime: number }>(rows: T[]) {
	return [...rows].sort(
		(left, right) => right._creationTime - left._creationTime
	);
}

function latestByCreation<T extends { _creationTime: number }>(rows: T[]) {
	return sortNewest(rows)[0] ?? null;
}

async function deleteByIds<Name extends TableName>(
	ctx: MutationCtx,
	_table: Name,
	ids: Id<Name>[]
) {
	for (const id of ids) {
		await ctx.db.delete(id);
	}
}

async function findScenarioMortgage(ctx: Pick<QueryCtx, "db">, runId: string) {
	return ctx.db
		.query("mortgages")
		.withIndex("by_simulation", (q) =>
			q.eq("simulationId", buildScenarioKey(runId))
		)
		.first();
}

async function findScenarioProperty(ctx: Pick<QueryCtx, "db">, runId: string) {
	const address = buildPropertyAddress(runId);
	const city = buildPropertyCity(runId);
	const properties = await ctx.db.query("properties").collect();
	return (
		properties.find(
			(property) => property.streetAddress === address && property.city === city
		) ?? null
	);
}

async function loadScenarioGraph(ctx: Pick<QueryCtx, "db">, runId: string) {
	const brokerUser = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", buildAuthId(runId, "broker")))
		.first();
	const borrowerUser = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", buildAuthId(runId, "borrower")))
		.first();
	const lenderUser = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", buildAuthId(runId, "lender")))
		.first();

	const [broker, borrower] = await Promise.all([
		brokerUser
			? ctx.db
					.query("brokers")
					.withIndex("by_user", (q) => q.eq("userId", brokerUser._id))
					.first()
			: Promise.resolve(null),
		borrowerUser
			? ctx.db
					.query("borrowers")
					.withIndex("by_user", (q) => q.eq("userId", borrowerUser._id))
					.first()
			: Promise.resolve(null),
	]);

	const lenders = await ctx.db.query("lenders").collect();
	const lender =
		lenders.find(
			(candidate) =>
				candidate.onboardingEntryPath === buildLenderOnboardingPath(runId)
		) ?? null;

	const mortgage = await findScenarioMortgage(ctx, runId);
	const property =
		(mortgage ? await ctx.db.get(mortgage.propertyId) : null) ??
		(await findScenarioProperty(ctx, runId));

	const mortgageBorrowers = mortgage
		? await ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
				.collect()
		: [];

	const allObligations = await ctx.db.query("obligations").collect();
	const obligations = mortgage
		? allObligations.filter(
				(obligation) => obligation.mortgageId === mortgage._id
			)
		: [];

	const allPlanEntries = await ctx.db.query("collectionPlanEntries").collect();
	const planEntries = mortgage
		? allPlanEntries.filter((entry) => entry.mortgageId === mortgage._id)
		: [];

	const allAttempts = await ctx.db.query("collectionAttempts").collect();
	const attempts = mortgage
		? allAttempts.filter((attempt) => attempt.mortgageId === mortgage._id)
		: [];

	const dispersalEntries = mortgage
		? await ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
				.collect()
		: [];

	const servicingFeeEntries = mortgage
		? await ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
				.collect()
		: [];

	const attemptIds = new Set(attempts.map((attempt) => attempt._id));
	const dispersalIds = new Set(dispersalEntries.map((entry) => entry._id));
	const obligationIds = new Set(
		obligations.map((obligation) => obligation._id)
	);

	const allTransfers = await ctx.db.query("transferRequests").collect();
	const transferRequests = allTransfers.filter(
		(transfer) =>
			(mortgage !== null && transfer.mortgageId === mortgage._id) ||
			(transfer.collectionAttemptId !== undefined &&
				attemptIds.has(transfer.collectionAttemptId)) ||
			(transfer.dispersalEntryId !== undefined &&
				dispersalIds.has(transfer.dispersalEntryId))
	);

	const cashAccounts = (
		await ctx.db.query("cash_ledger_accounts").collect()
	).filter(
		(account) =>
			(mortgage !== null && account.mortgageId === mortgage._id) ||
			(account.obligationId !== undefined &&
				obligationIds.has(account.obligationId)) ||
			(borrower !== null && account.borrowerId === borrower._id) ||
			(lender !== null && account.lenderId === lender._id)
	);

	const transferIds = new Set(transferRequests.map((transfer) => transfer._id));
	const cashLedgerJournalEntries = (
		await ctx.db.query("cash_ledger_journal_entries").collect()
	).filter(
		(entry) =>
			(mortgage !== null && entry.mortgageId === mortgage._id) ||
			(entry.obligationId !== undefined &&
				obligationIds.has(entry.obligationId)) ||
			(entry.attemptId !== undefined && attemptIds.has(entry.attemptId)) ||
			(entry.transferRequestId !== undefined &&
				transferIds.has(entry.transferRequestId)) ||
			(entry.dispersalEntryId !== undefined &&
				dispersalIds.has(entry.dispersalEntryId)) ||
			(borrower !== null && entry.borrowerId === borrower._id) ||
			(lender !== null && entry.lenderId === lender._id)
	);

	const auditEntityIds = new Set<string>([
		...(mortgage ? [String(mortgage._id)] : []),
		...(property ? [String(property._id)] : []),
		...mortgageBorrowers.map((row) => String(row._id)),
		...obligations.map((row) => String(row._id)),
		...planEntries.map((row) => String(row._id)),
		...attempts.map((row) => String(row._id)),
		...transferRequests.map((row) => String(row._id)),
		...dispersalEntries.map((row) => String(row._id)),
		...servicingFeeEntries.map((row) => String(row._id)),
		...(broker ? [String(broker._id)] : []),
		...(borrower ? [String(borrower._id)] : []),
		...(lender ? [String(lender._id)] : []),
	]);

	const auditJournalEntries = (
		await ctx.db.query("auditJournal").collect()
	).filter((entry) => auditEntityIds.has(entry.entityId));

	const transferHealingAttempts = await Promise.all(
		transferRequests.map((transfer) =>
			ctx.db
				.query("transferHealingAttempts")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transfer._id)
				)
				.collect()
		)
	).then((rows) => rows.flat());

	const dispersalHealingAttempts = await Promise.all(
		obligations.map((obligation) =>
			ctx.db
				.query("dispersalHealingAttempts")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
				.collect()
		)
	).then((rows) => rows.flat());

	const webhookEvents = await Promise.all(
		transferRequests.map((transfer) =>
			ctx.db
				.query("webhookEvents")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transfer._id)
				)
				.collect()
		)
	).then((rows) => rows.flat());

	const ledgerMortgageId = mortgage
		? (mortgage.simulationId ?? String(mortgage._id))
		: null;
	const ledgerAccounts = ledgerMortgageId
		? (
				await ctx.db
					.query("ledger_accounts")
					.withIndex("by_mortgage", (q) => q.eq("mortgageId", ledgerMortgageId))
					.collect()
			).filter(
				(account) =>
					account.lenderId === buildAuthId(runId, "lender") ||
					account.type === "POSITION"
			)
		: [];

	return {
		auditJournalEntries,
		attempts,
		borrower,
		borrowerUser,
		broker,
		brokerUser,
		cashAccounts,
		cashLedgerJournalEntries,
		dispersalEntries,
		dispersalHealingAttempts,
		ledgerAccounts,
		lender,
		lenderUser,
		mortgage,
		mortgageBorrowers,
		obligations,
		planEntries,
		property,
		servicingFeeEntries,
		transferHealingAttempts,
		transferRequests,
		webhookEvents,
	};
}

function buildScenarioStage(
	graph: Awaited<ReturnType<typeof loadScenarioGraph>>
): ScenarioStage {
	if (!graph.mortgage) {
		return "not_seeded";
	}

	const latestAttempt = latestByCreation(graph.attempts);
	const latestInboundTransfer = latestByCreation(
		graph.transferRequests.filter(
			(transfer) => transfer.direction === "inbound"
		)
	);
	const latestOutboundTransfer = latestByCreation(
		graph.transferRequests.filter(
			(transfer) => transfer.direction === "outbound"
		)
	);
	const latestDispersal = latestByCreation(graph.dispersalEntries);
	const latestObligation = latestByCreation(graph.obligations);

	if (
		latestOutboundTransfer?.status === "confirmed" ||
		latestDispersal?.status === "disbursed"
	) {
		return "outbound_confirmed";
	}

	if (
		latestOutboundTransfer &&
		["initiated", "pending", "processing"].includes(
			latestOutboundTransfer.status
		)
	) {
		return "outbound_pending_confirmation";
	}

	if (latestDispersal) {
		return "dispersal_ready";
	}

	if (
		latestInboundTransfer?.status === "confirmed" ||
		latestAttempt?.status === "confirmed" ||
		latestObligation?.status === "settled"
	) {
		return "inbound_confirmed";
	}

	if (
		latestInboundTransfer &&
		["initiated", "pending", "processing"].includes(
			latestInboundTransfer.status
		)
	) {
		return "inbound_pending_confirmation";
	}

	if (latestAttempt) {
		return "collection_executed";
	}

	return "seeded";
}

async function buildScenarioState(ctx: Pick<QueryCtx, "db">, runId: string) {
	const graph = await loadScenarioGraph(ctx, runId);
	const latestObligation = latestByCreation(graph.obligations);
	const latestPlanEntry = latestByCreation(graph.planEntries);
	const latestAttempt = latestByCreation(graph.attempts);
	const latestInboundTransfer = latestByCreation(
		graph.transferRequests.filter(
			(transfer) => transfer.direction === "inbound"
		)
	);
	const latestOutboundTransfer = latestByCreation(
		graph.transferRequests.filter(
			(transfer) => transfer.direction === "outbound"
		)
	);
	const latestDispersal = latestByCreation(graph.dispersalEntries);

	return {
		exists: graph.mortgage !== null,
		runId: normalizeRunId(runId),
		scenarioKey: buildScenarioKey(runId),
		stage: buildScenarioStage(graph),
		mortgage: graph.mortgage
			? {
					mortgageId: graph.mortgage._id,
					status: graph.mortgage.status,
					propertyId: graph.mortgage.propertyId,
					simulationId: graph.mortgage.simulationId,
				}
			: null,
		property: graph.property
			? {
					propertyId: graph.property._id,
					streetAddress: graph.property.streetAddress,
					city: graph.property.city,
				}
			: null,
		borrower: graph.borrower ? { borrowerId: graph.borrower._id } : null,
		lender: graph.lender ? { lenderId: graph.lender._id } : null,
		obligation: latestObligation
			? {
					obligationId: latestObligation._id,
					status: latestObligation.status,
					amount: latestObligation.amount,
					amountSettled: latestObligation.amountSettled,
					type: latestObligation.type,
				}
			: null,
		planEntry: latestPlanEntry
			? {
					planEntryId: latestPlanEntry._id,
					status: latestPlanEntry.status,
					amount: latestPlanEntry.amount,
					method: latestPlanEntry.method,
				}
			: null,
		collectionAttempt: latestAttempt
			? {
					collectionAttemptId: latestAttempt._id,
					status: latestAttempt.status,
					amount: latestAttempt.amount,
					transferRequestId: latestAttempt.transferRequestId ?? null,
				}
			: null,
		inboundTransfer: latestInboundTransfer
			? {
					transferId: latestInboundTransfer._id,
					status: latestInboundTransfer.status,
					providerCode: latestInboundTransfer.providerCode,
					providerRef: latestInboundTransfer.providerRef ?? null,
				}
			: null,
		outboundTransfer: latestOutboundTransfer
			? {
					transferId: latestOutboundTransfer._id,
					status: latestOutboundTransfer.status,
					providerCode: latestOutboundTransfer.providerCode,
					providerRef: latestOutboundTransfer.providerRef ?? null,
				}
			: null,
		dispersal: latestDispersal
			? {
					dispersalEntryId: latestDispersal._id,
					status: latestDispersal.status,
					amount: latestDispersal.amount,
					payoutEligibleAfter: latestDispersal.payoutEligibleAfter ?? null,
				}
			: null,
		rowCounts: {
			planEntries: graph.planEntries.length,
			attempts: graph.attempts.length,
			transfers: graph.transferRequests.length,
			dispersals: graph.dispersalEntries.length,
			servicingFees: graph.servicingFeeEntries.length,
			cashAccounts: graph.cashAccounts.length,
			cashJournalEntries: graph.cashLedgerJournalEntries.length,
		},
	};
}

async function cleanupScenarioGraph(ctx: MutationCtx, runId: string) {
	const graph = await loadScenarioGraph(ctx, runId);

	await deleteByIds(
		ctx,
		"transferHealingAttempts",
		graph.transferHealingAttempts.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"dispersalHealingAttempts",
		graph.dispersalHealingAttempts.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"webhookEvents",
		graph.webhookEvents.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"cash_ledger_journal_entries",
		graph.cashLedgerJournalEntries.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"auditJournal",
		graph.auditJournalEntries.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"dispersalEntries",
		graph.dispersalEntries.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"servicingFeeEntries",
		graph.servicingFeeEntries.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"transferRequests",
		graph.transferRequests.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"collectionAttempts",
		graph.attempts.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"collectionPlanEntries",
		graph.planEntries.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"obligations",
		graph.obligations.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"cash_ledger_accounts",
		graph.cashAccounts.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"ledger_accounts",
		graph.ledgerAccounts.map((row) => row._id)
	);
	await deleteByIds(
		ctx,
		"mortgageBorrowers",
		graph.mortgageBorrowers.map((row) => row._id)
	);

	if (graph.mortgage) {
		await ctx.db.delete(graph.mortgage._id);
	}
	if (graph.property) {
		await ctx.db.delete(graph.property._id);
	}
	if (graph.lender) {
		await ctx.db.delete(graph.lender._id);
	}
	if (graph.borrower) {
		await ctx.db.delete(graph.borrower._id);
	}
	if (graph.broker) {
		await ctx.db.delete(graph.broker._id);
	}
	if (graph.lenderUser) {
		await ctx.db.delete(graph.lenderUser._id);
	}
	if (graph.borrowerUser) {
		await ctx.db.delete(graph.borrowerUser._id);
	}
	if (graph.brokerUser) {
		await ctx.db.delete(graph.brokerUser._id);
	}

	return {
		deletedAttempts: graph.attempts.length,
		deletedAuditJournalEntries: graph.auditJournalEntries.length,
		deletedCashAccounts: graph.cashAccounts.length,
		deletedCashLedgerEntries: graph.cashLedgerJournalEntries.length,
		deletedDispersalEntries: graph.dispersalEntries.length,
		deletedDispersalHealingAttempts: graph.dispersalHealingAttempts.length,
		deletedLedgerAccounts: graph.ledgerAccounts.length,
		deletedMortgages: graph.mortgage ? 1 : 0,
		deletedMortgageBorrowers: graph.mortgageBorrowers.length,
		deletedObligations: graph.obligations.length,
		deletedPlanEntries: graph.planEntries.length,
		deletedProperties: graph.property ? 1 : 0,
		deletedProfiles:
			(graph.broker ? 1 : 0) +
			(graph.borrower ? 1 : 0) +
			(graph.lender ? 1 : 0),
		deletedServicingFeeEntries: graph.servicingFeeEntries.length,
		deletedTransferHealingAttempts: graph.transferHealingAttempts.length,
		deletedTransfers: graph.transferRequests.length,
		deletedUsers:
			(graph.brokerUser ? 1 : 0) +
			(graph.borrowerUser ? 1 : 0) +
			(graph.lenderUser ? 1 : 0),
		deletedWebhookEvents: graph.webhookEvents.length,
	};
}

async function seedScenarioGraph(ctx: MutationCtx, runId: string) {
	const rules = await seedCollectionRulesImpl(ctx);
	const scheduleRuleId = rules.ruleIdsByCode.schedule_rule;
	if (!scheduleRuleId) {
		throw new ConvexError("Canonical schedule_rule was not seeded");
	}

	const now = Date.now();
	const brokerUserId = await ctx.db.insert("users", {
		authId: buildAuthId(runId, "broker"),
		email: buildEmail(runId, "broker"),
		firstName: "E2E",
		lastName: "Broker",
	});
	const brokerId = await ctx.db.insert("brokers", {
		orgId: FAIRLEND_BROKERAGE_ORG_ID,
		status: "active",
		lastTransitionAt: now,
		userId: brokerUserId,
		createdAt: now,
	});

	const borrowerUserId = await ctx.db.insert("users", {
		authId: buildAuthId(runId, "borrower"),
		email: buildEmail(runId, "borrower"),
		firstName: "E2E",
		lastName: "Borrower",
	});
	const borrowerId = await ctx.db.insert("borrowers", {
		orgId: FAIRLEND_BROKERAGE_ORG_ID,
		status: "active",
		lastTransitionAt: now,
		userId: borrowerUserId,
		createdAt: now,
	});

	const lenderUserId = await ctx.db.insert("users", {
		authId: buildAuthId(runId, "lender"),
		email: buildEmail(runId, "lender"),
		firstName: "E2E",
		lastName: "Lender",
	});
	const lenderId = await ctx.db.insert("lenders", {
		orgId: FAIRLEND_BROKERAGE_ORG_ID,
		userId: lenderUserId,
		brokerId,
		accreditationStatus: "accredited",
		onboardingEntryPath: buildLenderOnboardingPath(runId),
		status: "active",
		createdAt: now,
	});

	const propertyId = await ctx.db.insert("properties", {
		streetAddress: buildPropertyAddress(runId),
		city: buildPropertyCity(runId),
		province: "ON",
		postalCode: "M5V 1E2",
		propertyType: "residential",
		createdAt: now,
	});

	const mortgageId = await ctx.db.insert("mortgages", {
		orgId: FAIRLEND_BROKERAGE_ORG_ID,
		status: "active",
		lastTransitionAt: now,
		propertyId,
		principal: 2_500_000,
		annualServicingRate: 0,
		interestRate: 0.08,
		rateType: "fixed",
		termMonths: 12,
		amortizationMonths: 12,
		paymentAmount: 250_000,
		paymentFrequency: "monthly",
		loanType: "conventional",
		lienPosition: 1,
		interestAdjustmentDate: "2026-01-01",
		termStartDate: "2026-01-01",
		maturityDate: "2026-12-01",
		firstPaymentDate: "2026-02-01",
		brokerOfRecordId: brokerId,
		simulationId: buildScenarioKey(runId),
		createdAt: now,
	});

	await ctx.db.insert("mortgageBorrowers", {
		mortgageId,
		borrowerId,
		role: "primary",
		addedAt: now,
	});

	await ctx.db.insert("ledger_accounts", {
		type: "POSITION",
		mortgageId: buildScenarioKey(runId),
		lenderId: buildAuthId(runId, "lender"),
		cumulativeDebits: 10_000n,
		cumulativeCredits: 0n,
		pendingDebits: 0n,
		pendingCredits: 0n,
		createdAt: now,
	});

	const obligationId = await ctx.db.insert("obligations", {
		orgId: FAIRLEND_BROKERAGE_ORG_ID,
		status: "due",
		machineContext: {},
		lastTransitionAt: now,
		mortgageId,
		borrowerId,
		paymentNumber: 1,
		type: "regular_interest",
		amount: 250_000,
		amountSettled: 0,
		dueDate: DUE_DATE,
		gracePeriodEnd: GRACE_PERIOD_END,
		createdAt: now,
	});

	const receivableAccount = await getOrCreateCashAccount(ctx, {
		family: "BORROWER_RECEIVABLE",
		mortgageId,
		obligationId,
		borrowerId,
	});
	await ctx.db.patch(receivableAccount._id, {
		cumulativeDebits: BigInt(250_000),
		cumulativeCredits: 0n,
	});

	const planEntryId = await ctx.db.insert("collectionPlanEntries", {
		mortgageId,
		obligationIds: [obligationId],
		amount: 250_000,
		method: OFFLINE_PROVIDER_CODE,
		scheduledDate: now - 1000,
		status: "planned",
		source: "default_schedule",
		createdByRuleId: scheduleRuleId,
		createdAt: now,
	});

	return {
		borrowerId,
		lenderId,
		mortgageId,
		obligationId,
		planEntryId,
		receivableAccountId: receivableAccount._id,
	};
}

function requirePendingTransfer(
	transfer: Pick<
		Doc<"transferRequests">,
		"_id" | "providerCode" | "status"
	> | null,
	label: string
) {
	if (!transfer) {
		throw new ConvexError(`${label} transfer not found`);
	}
	if (transfer.providerCode !== OFFLINE_PROVIDER_CODE) {
		throw new ConvexError(
			`${label} transfer must use provider "${OFFLINE_PROVIDER_CODE}", got "${transfer.providerCode}"`
		);
	}
	if (!["initiated", "pending", "processing"].includes(transfer.status)) {
		throw new ConvexError(
			`${label} transfer is not awaiting manual confirmation. Current status: "${transfer.status}"`
		);
	}
	return transfer;
}

export const getOfflineLifecycleScenario = adminQuery
	.input({ runId: v.string() })
	.handler(async (ctx, args): Promise<ScenarioState> => {
		return ctx.runQuery(
			internal.demo.ampsE2e.getOfflineLifecycleScenarioInternal,
			{
				runId: args.runId || DEFAULT_RUN_ID,
			}
		);
	})
	.public();

export const getOfflineLifecycleScenarioInternal = internalQuery({
	args: { runId: v.string() },
	handler: async (ctx, args): Promise<ScenarioState> => {
		return buildScenarioState(ctx, args.runId || DEFAULT_RUN_ID);
	},
});

export const seedOfflineLifecycleScenario = adminMutation
	.input({ runId: v.string() })
	.handler(async (ctx, args) => {
		const runId = args.runId || DEFAULT_RUN_ID;
		await cleanupScenarioGraph(ctx, runId);
		const seeded = await seedScenarioGraph(ctx, runId);
		return {
			seeded,
			state: await buildScenarioState(ctx, runId),
		};
	})
	.public();

export const executeOfflineLifecyclePlanEntry = adminAction
	.input({ runId: v.string() })
	.handler(async (ctx, args): Promise<ExecutePlanEntryResult> => {
		const runId = args.runId || DEFAULT_RUN_ID;
		const state: ScenarioState = await ctx.runQuery(
			internal.demo.ampsE2e.getOfflineLifecycleScenarioInternal,
			{
				runId,
			}
		);
		const planEntryId: Id<"collectionPlanEntries"> | undefined =
			state.planEntry?.planEntryId;
		if (!planEntryId) {
			throw new ConvexError(
				"No collection plan entry exists for this scenario"
			);
		}

		return ctx.runAction(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "admin_manual",
				requestedAt: Date.now(),
				idempotencyKey: `amps-e2e:${runId}:execute`,
				requestedByActorType: "admin",
				requestedByActorId: ctx.viewer.authId,
				reason: "AMPS E2E offline lifecycle harness",
			}
		);
	})
	.public();

export const confirmOfflineLifecycleInbound = adminAction
	.input({ runId: v.string() })
	.handler(async (ctx, args): Promise<TransitionResult> => {
		const runId = args.runId || DEFAULT_RUN_ID;
		const state: ScenarioState = await ctx.runQuery(
			internal.demo.ampsE2e.getOfflineLifecycleScenarioInternal,
			{
				runId,
			}
		);
		if (!state.exists) {
			throw new ConvexError("No scenario seeded for this runId");
		}
		const inboundTransfer = requirePendingTransfer(
			state.inboundTransfer
				? {
						_id: state.inboundTransfer.transferId,
						status: state.inboundTransfer.status,
						providerCode: state.inboundTransfer.providerCode,
					}
				: null,
			"Inbound"
		);

		const providerRef =
			state.inboundTransfer?.providerRef ??
			`${OFFLINE_PROVIDER_CODE}_inbound_${Date.now()}`;
		await ctx.runMutation(
			internal.payments.transfers.mutations.persistProviderRef,
			{
				transferId: inboundTransfer._id,
				providerRef,
			}
		);

		return ctx.runMutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "transfer",
				entityId: inboundTransfer._id,
				eventType: "FUNDS_SETTLED",
				payload: {
					settledAt: Date.now(),
					providerData: {
						providerRef,
						method: OFFLINE_PROVIDER_CODE,
					},
				},
				source: {
					channel: "admin_dashboard",
					actorType: "admin",
					actorId: ctx.viewer.authId,
				},
			}
		);
	})
	.public();

export const triggerOfflineLifecyclePayout = adminAction
	.input({ runId: v.string() })
	.handler(async (ctx, args): Promise<DisbursementBridgeResult> => {
		const runId = args.runId || DEFAULT_RUN_ID;
		const state: ScenarioState = await ctx.runQuery(
			internal.demo.ampsE2e.getOfflineLifecycleScenarioInternal,
			{
				runId,
			}
		);
		if (!state.exists) {
			throw new ConvexError("No scenario seeded for this runId");
		}
		if (!state.lender) {
			throw new ConvexError("Scenario lender not found");
		}
		if (!state.dispersal) {
			throw new ConvexError("No dispersal entries are ready for payout");
		}

		return ctx.runAction(
			internal.dispersal.disbursementBridge.triggerDisbursementBridge,
			{
				asOfDate: todayISO(),
				lenderId: state.lender.lenderId,
				batchSize: 1,
				providerCode: OFFLINE_PROVIDER_CODE,
			}
		);
	})
	.public();

export const confirmOfflineLifecycleOutbound = adminAction
	.input({ runId: v.string() })
	.handler(async (ctx, args): Promise<TransitionResult> => {
		const runId = args.runId || DEFAULT_RUN_ID;
		const state: ScenarioState = await ctx.runQuery(
			internal.demo.ampsE2e.getOfflineLifecycleScenarioInternal,
			{
				runId,
			}
		);
		if (!state.exists) {
			throw new ConvexError("No scenario seeded for this runId");
		}
		const outboundTransfer = requirePendingTransfer(
			state.outboundTransfer
				? {
						_id: state.outboundTransfer.transferId,
						status: state.outboundTransfer.status,
						providerCode: state.outboundTransfer.providerCode,
					}
				: null,
			"Outbound"
		);

		const providerRef =
			state.outboundTransfer?.providerRef ??
			`${OFFLINE_PROVIDER_CODE}_outbound_${Date.now()}`;
		await ctx.runMutation(
			internal.payments.transfers.mutations.persistProviderRef,
			{
				transferId: outboundTransfer._id,
				providerRef,
			}
		);

		return ctx.runMutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "transfer",
				entityId: outboundTransfer._id,
				eventType: "FUNDS_SETTLED",
				payload: {
					settledAt: Date.now(),
					providerData: {
						providerRef,
						method: OFFLINE_PROVIDER_CODE,
					},
				},
				source: {
					channel: "admin_dashboard",
					actorType: "admin",
					actorId: ctx.viewer.authId,
				},
			}
		);
	})
	.public();

export const cleanupOfflineLifecycleScenario = adminMutation
	.input({ runId: v.string() })
	.handler(async (ctx, args) => {
		return cleanupScenarioGraph(ctx, args.runId || DEFAULT_RUN_ID);
	})
	.public();
