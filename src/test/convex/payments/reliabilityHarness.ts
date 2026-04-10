import process from "node:process";
import { expect, vi } from "vitest";
import { api, internal } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import { attachDefaultFeeSetToMortgage } from "../../../../convex/fees/resolver";
import { getPostedBalance } from "../../../../convex/ledger/accounts";
import { isTransferAlreadyInTargetState } from "../../../../convex/payments/webhooks/transferCore";
import {
	createGovernedTestConvex,
	type GovernedTestConvex,
} from "./helpers";

const SYSTEM_SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

const WEBHOOK_SOURCE = {
	channel: "api_webhook" as const,
	actorId: "reliability-webhook",
	actorType: "system" as const,
};

const LEDGER_SOURCE = {
	type: "system" as const,
	channel: "test",
};

const ADMIN_IDENTITY = {
	subject: "reliability-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "reliability-admin@fairlend.ca",
	user_first_name: "Reliability",
	user_last_name: "Admin",
};

const RELIABILITY_ENV = {
	ENABLE_MOCK_PROVIDERS: "true",
	DISABLE_GT_HASHCHAIN: "true",
	DISABLE_CASH_LEDGER_HASHCHAIN: "true",
} as const;

const FIXTURE_DATES = {
	firstPaymentDate: "2026-01-15",
	maturityDate: "2026-12-15",
	termStartDate: "2026-01-15",
} as const;

const MORTGAGE_LEDGER_TOTAL_SUPPLY = 10_000;
const reliabilityEnvRestoreStack: Array<() => void> = [];

export interface OwnershipExpectation {
	lenderAUnits: number;
	lenderBUnits: number;
}

export interface TransferWebhookFixture {
	normalizedEventType:
		| "FUNDS_SETTLED"
		| "TRANSFER_FAILED"
		| "TRANSFER_REVERSED";
	payload: Record<string, unknown>;
	provider: "mock_eft" | "mock_pad";
	providerEventId: string;
	rawBody: string;
	status: "completed" | "failed" | "returned";
	transactionId: string;
}

export interface ReliabilityFixture {
	borrowerId: Id<"borrowers">;
	borrowerUserId: Id<"users">;
	brokerId: Id<"brokers">;
	brokerUserId: Id<"users">;
	lenderAAuthId: string;
	lenderAId: Id<"lenders">;
	lenderAUserId: Id<"users">;
	lenderBAuthId: string;
	lenderBId: Id<"lenders">;
	lenderBUserId: Id<"users">;
	mortgageId: Id<"mortgages">;
	propertyId: Id<"properties">;
}

export interface LifecycleMonthRecord {
	attemptId: Id<"collectionAttempts">;
	dispersalEntryIds: Id<"dispersalEntries">[];
	inboundTransferId: Id<"transferRequests">;
	inboundWebhookEventId: Id<"webhookEvents">;
	obligationId: Id<"obligations">;
	outboundTransferIds: Id<"transferRequests">[];
	outboundWebhookEventIds: Id<"webhookEvents">[];
	paymentNumber: number;
	payoutEligibleAfter: string;
	planEntryId: Id<"collectionPlanEntries">;
}

export interface PendingMonthlyCycle {
	attempt: Doc<"collectionAttempts">;
	inboundTransfer: Doc<"transferRequests">;
	obligation: Doc<"obligations">;
	paymentNumber: number;
	planEntry: Doc<"collectionPlanEntries">;
}

export interface ReliabilityBootstrap {
	fixture: ReliabilityFixture;
	obligations: Doc<"obligations">[];
	planEntries: Doc<"collectionPlanEntries">[];
}

export interface ReliabilityHarness {
	asAdmin: () => ReturnType<GovernedTestConvex["withIdentity"]>;
	bootstrap: (options?: {
		disableBalancePreCheck?: boolean;
		seedCollectionRules?: boolean;
	}) => Promise<ReliabilityBootstrap>;
	createRetryEntryForPlanEntry: (
		planEntryId: Id<"collectionPlanEntries">
	) => Promise<Doc<"collectionPlanEntries"> | null>;
	deliverTransferWebhook: (
		transferId: Id<"transferRequests">,
		fixture: TransferWebhookFixture
	) => Promise<Id<"webhookEvents">>;
	drainScheduledWork: () => Promise<void>;
	getCashEntriesForAttempt: (
		attemptId: Id<"collectionAttempts">
	) => Promise<Doc<"cash_ledger_journal_entries">[]>;
	getCashEntriesForDispersalEntry: (
		dispersalEntryId: Id<"dispersalEntries">
	) => Promise<Doc<"cash_ledger_journal_entries">[]>;
	getCashEntriesForObligation: (
		obligationId: Id<"obligations">
	) => Promise<Doc<"cash_ledger_journal_entries">[]>;
	getCollectionAttemptsForPlanEntry: (
		planEntryId: Id<"collectionPlanEntries">
	) => Promise<Doc<"collectionAttempts">[]>;
	getDispersalEntriesForObligation: (
		obligationId: Id<"obligations">
	) => Promise<Doc<"dispersalEntries">[]>;
	getObligationByPaymentNumber: (
		mortgageId: Id<"mortgages">,
		paymentNumber: number
	) => Promise<Doc<"obligations">>;
	getObligations: (
		mortgageId: Id<"mortgages">
	) => Promise<Doc<"obligations">[]>;
	getOutboundTransfersForObligation: (
		obligationId: Id<"obligations">
	) => Promise<Doc<"transferRequests">[]>;
	getPlanEntries: (
		mortgageId: Id<"mortgages">
	) => Promise<Doc<"collectionPlanEntries">[]>;
	getPlanEntryForObligation: (
		obligationId: Id<"obligations">
	) => Promise<Doc<"collectionPlanEntries">>;
	getPositionBalances: (
		mortgageId: Id<"mortgages">
	) => Promise<Record<string, number>>;
	getServicingFeeEntryForObligation: (
		obligationId: Id<"obligations">
	) => Promise<Doc<"servicingFeeEntries"> | null>;
	getTransfersForAttempt: (
		attemptId: Id<"collectionAttempts">
	) => Promise<Doc<"transferRequests">[]>;
	getWebhookEventsForTransfer: (
		transferId: Id<"transferRequests">
	) => Promise<Doc<"webhookEvents">[]>;
	markMortgageMatured: (
		mortgageId: Id<"mortgages">
	) => Promise<void>;
	prepareMonthlyCycle: (
		mortgageId: Id<"mortgages">,
		paymentNumber: number
	) => Promise<PendingMonthlyCycle>;
	runDisbursementBridgeForObligation: (
		obligationId: Id<"obligations">
	) => Promise<{
		asOfDate: string;
		outboundTransfers: Doc<"transferRequests">[];
	}>;
	runMonthlyCycle: (
		mortgageId: Id<"mortgages">,
		paymentNumber: number
	) => Promise<LifecycleMonthRecord>;
	seedReliabilityFixture: () => Promise<ReliabilityFixture>;
	seedRetryRules: (options?: {
		disableBalancePreCheck?: boolean;
	}) => Promise<void>;
	settleInboundTransfer: (
		transferId: Id<"transferRequests">,
		paymentNumber: number
	) => Promise<Id<"webhookEvents">>;
	settleOutboundTransfers: (
		obligationId: Id<"obligations">,
		paymentNumber: number
	) => Promise<{
		outboundTransferIds: Id<"transferRequests">[];
		webhookEventIds: Id<"webhookEvents">[];
	}>;
	t: GovernedTestConvex;
	transferOwnershipMidTerm: (args: {
		buyerLenderAuthId: string;
		effectiveDate: string;
		idempotencyKey: string;
		mortgageId: Id<"mortgages">;
		quantity: number;
		sellerLenderAuthId: string;
	}) => Promise<unknown>;
	upgradeScheduledEntriesToMockPad: (
		mortgageId: Id<"mortgages">
	) => Promise<Doc<"collectionPlanEntries">[]>;
	validateSupplyInvariant: (
		mortgageId: Id<"mortgages">
	) => Promise<{
		totalOutstanding?: number;
		valid: boolean;
	}>;
}

function pushReliabilityEnv() {
	const previous = new Map<string, string | undefined>();
	for (const [key, value] of Object.entries(RELIABILITY_ENV)) {
		previous.set(key, process.env[key]);
		process.env[key] = value;
	}
	return () => {
		for (const [key, value] of previous.entries()) {
			if (value === undefined) {
				delete process.env[key];
				continue;
			}
			process.env[key] = value;
		}
	};
}

export function createReliabilityHarness(): ReliabilityHarness {
	const restoreEnv = pushReliabilityEnv();
	reliabilityEnvRestoreStack.push(restoreEnv);
	const t = createGovernedTestConvex();

	function asAdmin() {
		return t.withIdentity(ADMIN_IDENTITY);
	}

	async function drainScheduledWork() {
		await t.finishAllScheduledFunctions(() => vi.runAllTimers());
		await Promise.resolve();
	}

	async function seedReliabilityFixture(): Promise<ReliabilityFixture> {
		return t.run(async (ctx) => {
			const createdAt = Date.now();
			const lenderAAuthId = "reliability-lender-a";
			const lenderBAuthId = "reliability-lender-b";

			const brokerUserId = await ctx.db.insert("users", {
				authId: "reliability-broker",
				email: "reliability-broker@fairlend.test",
				firstName: "Reliability",
				lastName: "Broker",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: brokerUserId,
				createdAt,
			});

			const borrowerUserId = await ctx.db.insert("users", {
				authId: "reliability-borrower",
				email: "reliability-borrower@fairlend.test",
				firstName: "Reliability",
				lastName: "Borrower",
			});
			const borrowerId = await ctx.db.insert("borrowers", {
				status: "active",
				userId: borrowerUserId,
				createdAt,
			});

			const lenderAUserId = await ctx.db.insert("users", {
				authId: lenderAAuthId,
				email: "reliability-lender-a@fairlend.test",
				firstName: "Lender",
				lastName: "Alpha",
			});
			const lenderAId = await ctx.db.insert("lenders", {
				userId: lenderAUserId,
				brokerId,
				accreditationStatus: "accredited",
				onboardingEntryPath: "/tests/reliability-lender-a",
				status: "active",
				createdAt,
			});

			const lenderBUserId = await ctx.db.insert("users", {
				authId: lenderBAuthId,
				email: "reliability-lender-b@fairlend.test",
				firstName: "Lender",
				lastName: "Beta",
			});
			const lenderBId = await ctx.db.insert("lenders", {
				userId: lenderBUserId,
				brokerId,
				accreditationStatus: "accredited",
				onboardingEntryPath: "/tests/reliability-lender-b",
				status: "active",
				createdAt,
			});

			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "12 Reliability Crescent",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V1E1",
				propertyType: "residential",
				createdAt,
			});

			const mortgageId = await ctx.db.insert("mortgages", {
				status: "active",
				machineContext: { missedPayments: 0, lastPaymentAt: 0 },
				lastTransitionAt: createdAt,
				propertyId,
				principal: 50_000_000,
				annualServicingRate: 0.01,
				interestRate: 0.08,
				rateType: "fixed",
				termMonths: 12,
				amortizationMonths: 12,
				paymentAmount: 333_333,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: FIXTURE_DATES.termStartDate,
				termStartDate: FIXTURE_DATES.termStartDate,
				maturityDate: FIXTURE_DATES.maturityDate,
				firstPaymentDate: FIXTURE_DATES.firstPaymentDate,
				brokerOfRecordId: brokerId,
				createdAt,
			});

			await ctx.db.insert("mortgageBorrowers", {
				mortgageId,
				borrowerId,
				role: "primary",
				addedAt: createdAt,
			});

			await attachDefaultFeeSetToMortgage(ctx.db, mortgageId, 0.01);

			await ctx.db.insert("bankAccounts", {
				ownerType: "borrower",
				ownerId: String(borrowerId),
				institutionNumber: "001",
				transitNumber: "12345",
				accountNumber: "0001234567",
				accountLast4: "4567",
				country: "CA",
				currency: "CAD",
				status: "validated",
				validationMethod: "manual",
				mandateStatus: "active",
				isDefaultInbound: true,
				createdAt,
			});
			await ctx.db.insert("bankAccounts", {
				ownerType: "lender",
				ownerId: String(lenderAId),
				institutionNumber: "002",
				transitNumber: "23456",
				accountNumber: "0002345678",
				accountLast4: "5678",
				country: "CA",
				currency: "CAD",
				status: "validated",
				validationMethod: "manual",
				mandateStatus: "not_required",
				isDefaultOutbound: true,
				createdAt,
			});
			await ctx.db.insert("bankAccounts", {
				ownerType: "lender",
				ownerId: String(lenderBId),
				institutionNumber: "003",
				transitNumber: "34567",
				accountNumber: "0003456789",
				accountLast4: "6789",
				country: "CA",
				currency: "CAD",
				status: "validated",
				validationMethod: "manual",
				mandateStatus: "not_required",
				isDefaultOutbound: true,
				createdAt,
			});

			return {
				borrowerId,
				borrowerUserId,
				brokerId,
				brokerUserId,
				lenderAAuthId,
				lenderAId,
				lenderAUserId,
				lenderBAuthId,
				lenderBId,
				lenderBUserId,
				mortgageId,
				propertyId,
			};
		});
	}

	async function seedRetryRules(options?: {
		disableBalancePreCheck?: boolean;
	}) {
		await t.mutation(internal.payments.collectionPlan.seed.seedCollectionRules, {});
		if (!options?.disableBalancePreCheck) {
			return;
		}

		await t.run(async (ctx) => {
			const balanceRule = await ctx.db
				.query("collectionRules")
				.filter((q) => q.eq(q.field("code"), "balance_pre_check_rule"))
				.first();
			if (!balanceRule) {
				throw new Error("Expected balance_pre_check_rule to exist");
			}
			await ctx.db.patch(balanceRule._id, { status: "disabled" });
		});
	}

	async function initializeOwnershipLedger(fixture: ReliabilityFixture) {
		await asAdmin().mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
		await asAdmin().mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: String(fixture.mortgageId),
			effectiveDate: FIXTURE_DATES.termStartDate,
			idempotencyKey: `mint-${fixture.mortgageId}`,
			source: LEDGER_SOURCE,
		});
		await asAdmin().mutation(internal.ledger.mutations.issueShares, {
			mortgageId: String(fixture.mortgageId),
			lenderId: fixture.lenderAAuthId,
			amount: 6000,
			effectiveDate: FIXTURE_DATES.termStartDate,
			idempotencyKey: `issue-${fixture.mortgageId}-${fixture.lenderAAuthId}`,
			source: LEDGER_SOURCE,
		});
		await asAdmin().mutation(internal.ledger.mutations.issueShares, {
			mortgageId: String(fixture.mortgageId),
			lenderId: fixture.lenderBAuthId,
			amount: 4000,
			effectiveDate: FIXTURE_DATES.termStartDate,
			idempotencyKey: `issue-${fixture.mortgageId}-${fixture.lenderBAuthId}`,
			source: LEDGER_SOURCE,
		});
	}

	async function getObligations(mortgageId: Id<"mortgages">) {
		const obligations = await t.run(async (ctx) =>
			ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (q) => q.eq("mortgageId", mortgageId))
				.collect()
		);
		return [...obligations].sort((left, right) => left.paymentNumber - right.paymentNumber);
	}

	async function getPlanEntries(mortgageId: Id<"mortgages">) {
		const planEntries = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.filter((q) => q.eq(q.field("mortgageId"), mortgageId))
				.collect()
		);
		return [...planEntries].sort((left, right) => left.scheduledDate - right.scheduledDate);
	}

	async function getObligationByPaymentNumber(
		mortgageId: Id<"mortgages">,
		paymentNumber: number
	) {
		const obligations = await getObligations(mortgageId);
		const obligation = obligations.find(
			(candidate) => candidate.paymentNumber === paymentNumber
		);
		if (!obligation) {
			throw new Error(
				`Expected obligation for mortgage ${mortgageId} payment #${paymentNumber}`
			);
		}
		return obligation;
	}

	async function getPlanEntryForObligation(obligationId: Id<"obligations">) {
		const planEntry = await t.run(async (ctx) => {
			const allEntries = await ctx.db.query("collectionPlanEntries").collect();
			return (
				allEntries.find((entry) => entry.obligationIds.includes(obligationId)) ?? null
			);
		});
		if (!planEntry) {
			throw new Error(`Expected collection plan entry for obligation ${obligationId}`);
		}
		return planEntry;
	}

	async function getCollectionAttemptsForPlanEntry(
		planEntryId: Id<"collectionPlanEntries">
	) {
		return t.run(async (ctx) =>
			ctx.db
				.query("collectionAttempts")
				.withIndex("by_plan_entry", (q) => q.eq("planEntryId", planEntryId))
				.collect()
		);
	}

	async function getTransfersForAttempt(attemptId: Id<"collectionAttempts">) {
		return t.run(async (ctx) =>
			ctx.db
				.query("transferRequests")
				.filter((q) => q.eq(q.field("collectionAttemptId"), attemptId))
				.collect()
		);
	}

	async function getCashEntriesForObligation(obligationId: Id<"obligations">) {
		return t.run(async (ctx) =>
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect()
		);
	}

	async function getCashEntriesForAttempt(attemptId: Id<"collectionAttempts">) {
		return t.run(async (ctx) =>
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `cash-receipt:${attemptId}`)
				)
				.collect()
		);
	}

	async function getDispersalEntriesForObligation(obligationId: Id<"obligations">) {
		return t.run(async (ctx) =>
			ctx.db
				.query("dispersalEntries")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
				.collect()
		);
	}

	async function getCashEntriesForDispersalEntry(
		dispersalEntryId: Id<"dispersalEntries">
	) {
		return t.run(async (ctx) =>
			ctx.db
				.query("cash_ledger_journal_entries")
				.filter((q) => q.eq(q.field("dispersalEntryId"), dispersalEntryId))
				.collect()
		);
	}

	async function getServicingFeeEntryForObligation(
		obligationId: Id<"obligations">
	) {
		return t.run(async (ctx) =>
			ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
				.first()
		);
	}

	async function getOutboundTransfersForObligation(obligationId: Id<"obligations">) {
		const dispersalEntries = await getDispersalEntriesForObligation(obligationId);
		const entryIds = new Set(dispersalEntries.map((entry) => `${entry._id}`));
		return t.run(async (ctx) => {
			const transfers = await ctx.db
				.query("transferRequests")
				.filter((q) => q.eq(q.field("direction"), "outbound"))
				.collect();
			return transfers.filter(
				(transfer) =>
					transfer.dispersalEntryId !== undefined &&
					entryIds.has(`${transfer.dispersalEntryId}`)
			);
		});
	}

	async function getWebhookEventsForTransfer(transferId: Id<"transferRequests">) {
		return t.run(async (ctx) =>
			ctx.db
				.query("webhookEvents")
				.filter((q) => q.eq(q.field("transferRequestId"), transferId))
				.collect()
		);
	}

	async function getPositionBalances(mortgageId: Id<"mortgages">) {
		return t.run(async (ctx) => {
			const accounts = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(mortgageId))
				)
				.collect();

			const balances: Record<string, number> = {};
			for (const account of accounts) {
				const lenderAuthId = account.lenderId;
				if (!lenderAuthId) {
					continue;
				}
				balances[lenderAuthId] = Number(getPostedBalance(account));
			}
			return balances;
		});
	}

	async function validateSupplyInvariant(mortgageId: Id<"mortgages">) {
		return asAdmin().query(api.ledger.queries.validateSupplyInvariant, {
			mortgageId: String(mortgageId),
		}) as Promise<{ totalOutstanding?: number; valid: boolean }>;
	}

	async function upgradeScheduledEntriesToMockPad(mortgageId: Id<"mortgages">) {
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("collectionPlanEntries")
				.filter((q) => q.eq(q.field("mortgageId"), mortgageId))
				.collect();
			for (const entry of entries) {
				await ctx.db.patch(entry._id, { method: "mock_pad" });
			}
		});
		return getPlanEntries(mortgageId);
	}

	async function bootstrap(options?: {
		disableBalancePreCheck?: boolean;
		seedCollectionRules?: boolean;
	}): Promise<ReliabilityBootstrap> {
		const fixture = await seedReliabilityFixture();
		if (options?.seedCollectionRules) {
			await seedRetryRules({
				disableBalancePreCheck: options.disableBalancePreCheck,
			});
		}
		await initializeOwnershipLedger(fixture);
		await t.mutation(internal.payments.obligations.generate.generateObligations, {
			mortgageId: fixture.mortgageId,
		});
		await t.mutation(
			internal.payments.collectionPlan.mutations.scheduleInitialEntries,
			{
				mortgageId: fixture.mortgageId,
				delayDays: 0,
				nowMs: Date.parse(`${FIXTURE_DATES.maturityDate}T12:00:00.000Z`),
			}
		);
		const planEntries = await upgradeScheduledEntriesToMockPad(fixture.mortgageId);
		const obligations = await getObligations(fixture.mortgageId);
		return { fixture, obligations, planEntries };
	}

	function setClock(ms: number) {
		vi.setSystemTime(new Date(ms));
	}

	function businessDateToMs(date: string) {
		return Date.parse(`${date}T12:00:00.000Z`);
	}

	async function prepareMonthlyCycle(
		mortgageId: Id<"mortgages">,
		paymentNumber: number
	): Promise<PendingMonthlyCycle> {
		const obligation = await getObligationByPaymentNumber(mortgageId, paymentNumber);
		setClock(obligation.dueDate + 1000);
		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);
		await drainScheduledWork();

		const dueObligation = await t.run(async (ctx) => ctx.db.get(obligation._id));
		expect(dueObligation?.status).toBe("due");

		const planEntry = await getPlanEntryForObligation(obligation._id);
		await t.action(internal.payments.collectionPlan.runner.processDuePlanEntries, {
			asOf: planEntry.scheduledDate,
			batchSize: 25,
		});
		await drainScheduledWork();

		const attempts = await getCollectionAttemptsForPlanEntry(planEntry._id);
		expect(attempts).toHaveLength(1);
		const attempt = attempts[0];
		if (!attempt) {
			throw new Error(`Expected collection attempt for plan entry ${planEntry._id}`);
		}

		const transfers = await getTransfersForAttempt(attempt._id);
		expect(transfers).toHaveLength(1);
		const inboundTransfer = transfers[0];
		if (!inboundTransfer) {
			throw new Error(`Expected inbound transfer for attempt ${attempt._id}`);
		}

		expect(inboundTransfer.status).toBe("pending");

		return {
			paymentNumber,
			obligation: dueObligation as Doc<"obligations">,
			planEntry,
			attempt,
			inboundTransfer,
		};
	}

	async function deliverTransferWebhook(
		transferId: Id<"transferRequests">,
		fixture: TransferWebhookFixture
	) {
		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		if (!transfer) {
			throw new Error(`Transfer ${transferId} not found`);
		}

		const webhookEventId = await t.mutation(
			internal.payments.webhooks.transferCore.persistTransferWebhookEvent,
			{
				provider: fixture.provider,
				providerEventId: fixture.providerEventId,
				rawBody: fixture.rawBody,
				signatureVerified: true,
				normalizedEventType: fixture.normalizedEventType,
			}
		);

		await t.mutation(
			internal.payments.webhooks.transferCore.patchTransferWebhookMetadata,
			{
				webhookEventId,
				normalizedEventType: fixture.normalizedEventType,
				transferRequestId: transferId,
			}
		);

		if (
			!isTransferAlreadyInTargetState(
				transfer.status,
				fixture.normalizedEventType
			)
		) {
			await t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "transfer",
				entityId: transferId,
				eventType: fixture.normalizedEventType,
				payload: fixture.payload,
				source: WEBHOOK_SOURCE,
			});
		}

		await t.mutation(
			internal.payments.webhooks.transferCore.updateTransferWebhookEventStatus,
			{
				webhookEventId,
				status: "processed",
			}
		);

		return webhookEventId;
	}

	async function settleInboundTransfer(
		transferId: Id<"transferRequests">,
		paymentNumber: number
	) {
		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		if (!transfer?.providerRef) {
			throw new Error(`Inbound transfer ${transferId} missing providerRef`);
		}

		const settledAt = Date.now();
		const webhookEventId = await deliverTransferWebhook(transferId, {
			provider: "mock_pad",
			providerEventId: `mock_evt_inbound_${paymentNumber}_confirmed`,
			normalizedEventType: "FUNDS_SETTLED",
			status: "completed",
			transactionId: transfer.providerRef,
			rawBody: JSON.stringify({
				status: "completed",
				transactionId: transfer.providerRef,
			}),
			payload: {
				settledAt,
				providerData: {
					mockProviderRef: transfer.providerRef,
					paymentNumber,
				},
			},
		});
		await drainScheduledWork();
		return webhookEventId;
	}

	async function runDisbursementBridgeForObligation(obligationId: Id<"obligations">) {
		const dispersalEntries = await getDispersalEntriesForObligation(obligationId);
		expect(dispersalEntries.length).toBeGreaterThan(0);

		const asOfDate =
			dispersalEntries
				.map((entry) => entry.payoutEligibleAfter)
				.filter((value): value is string => typeof value === "string")
				.sort()
				.at(-1) ?? new Date(Date.now()).toISOString().slice(0, 10);

		setClock(businessDateToMs(asOfDate));

		await t.action(internal.dispersal.disbursementBridge.triggerDisbursementBridge, {
			asOfDate,
			providerCode: "mock_eft",
			batchSize: 50,
		});
		await drainScheduledWork();

		return {
			asOfDate,
			outboundTransfers: await getOutboundTransfersForObligation(obligationId),
		};
	}

	async function settleOutboundTransfers(
		obligationId: Id<"obligations">,
		paymentNumber: number
	) {
		const outboundTransfers = await getOutboundTransfersForObligation(obligationId);
		const webhookEventIds: Id<"webhookEvents">[] = [];
		let transferIndex = 0;

		for (const transfer of outboundTransfers) {
			transferIndex += 1;
			if (!transfer.providerRef) {
				throw new Error(`Outbound transfer ${transfer._id} missing providerRef`);
			}
			const webhookEventId = await deliverTransferWebhook(transfer._id, {
				provider: "mock_eft",
				providerEventId: `mock_evt_outbound_${paymentNumber}_${transferIndex}_confirmed`,
				normalizedEventType: "FUNDS_SETTLED",
				status: "completed",
				transactionId: transfer.providerRef,
				rawBody: JSON.stringify({
					status: "completed",
					transactionId: transfer.providerRef,
				}),
				payload: {
					settledAt: Date.now(),
					providerData: {
						mockProviderRef: transfer.providerRef,
						paymentNumber,
						transferIndex,
					},
				},
			});
			webhookEventIds.push(webhookEventId);
		}

		await drainScheduledWork();

		return {
			outboundTransferIds: outboundTransfers.map((transfer) => transfer._id),
			webhookEventIds,
		};
	}

	async function runMonthlyCycle(
		mortgageId: Id<"mortgages">,
		paymentNumber: number
	): Promise<LifecycleMonthRecord> {
		const pending = await prepareMonthlyCycle(mortgageId, paymentNumber);
		const inboundWebhookEventId = await settleInboundTransfer(
			pending.inboundTransfer._id,
			paymentNumber
		);
		const dispersalEntries = await getDispersalEntriesForObligation(
			pending.obligation._id
		);
		expect(dispersalEntries.length).toBeGreaterThan(0);
		const payoutEligibleAfter =
			dispersalEntries
				.map((entry) => entry.payoutEligibleAfter)
				.filter((value): value is string => typeof value === "string")
				.sort()
				.at(-1) ?? new Date(Date.now()).toISOString().slice(0, 10);

		await runDisbursementBridgeForObligation(pending.obligation._id);
		const outboundSettlement = await settleOutboundTransfers(
			pending.obligation._id,
			paymentNumber
		);

		return {
			attemptId: pending.attempt._id,
			dispersalEntryIds: dispersalEntries.map((entry) => entry._id),
			inboundTransferId: pending.inboundTransfer._id,
			inboundWebhookEventId,
			obligationId: pending.obligation._id,
			outboundTransferIds: outboundSettlement.outboundTransferIds,
			outboundWebhookEventIds: outboundSettlement.webhookEventIds,
			paymentNumber,
			payoutEligibleAfter,
			planEntryId: pending.planEntry._id,
		};
	}

	async function createRetryEntryForPlanEntry(
		planEntryId: Id<"collectionPlanEntries">
	) {
		await drainScheduledWork();
		return t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.filter((q) =>
					q.and(
						q.eq(q.field("retryOfId"), planEntryId),
						q.eq(q.field("source"), "retry_rule")
					)
				)
				.first()
		);
	}

	async function transferOwnershipMidTerm(args: {
		buyerLenderAuthId: string;
		effectiveDate: string;
		idempotencyKey: string;
		mortgageId: Id<"mortgages">;
		quantity: number;
		sellerLenderAuthId: string;
	}) {
		return asAdmin().mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(args.mortgageId),
			sellerLenderId: args.sellerLenderAuthId,
			buyerLenderId: args.buyerLenderAuthId,
			amount: args.quantity,
			effectiveDate: args.effectiveDate,
			idempotencyKey: args.idempotencyKey,
			source: LEDGER_SOURCE,
		});
	}

	async function markMortgageMatured(mortgageId: Id<"mortgages">) {
		await t.mutation(internal.engine.transitionMutation.transitionMutation, {
			entityType: "mortgage",
			entityId: mortgageId,
			eventType: "MATURED",
			payload: {},
			source: SYSTEM_SOURCE,
		});
		await drainScheduledWork();
	}

	return {
		t,
		asAdmin,
		bootstrap,
		createRetryEntryForPlanEntry,
		deliverTransferWebhook,
		drainScheduledWork,
		getCashEntriesForAttempt,
		getCashEntriesForDispersalEntry,
		getCashEntriesForObligation,
		getCollectionAttemptsForPlanEntry,
		getDispersalEntriesForObligation,
		getObligationByPaymentNumber,
		getObligations,
		getOutboundTransfersForObligation,
		getPlanEntries,
		getPlanEntryForObligation,
		getPositionBalances,
		getServicingFeeEntryForObligation,
		getTransfersForAttempt,
		getWebhookEventsForTransfer,
		markMortgageMatured,
		prepareMonthlyCycle,
		runDisbursementBridgeForObligation,
		runMonthlyCycle,
		seedReliabilityFixture,
		seedRetryRules,
		settleInboundTransfer,
		settleOutboundTransfers,
		transferOwnershipMidTerm,
		upgradeScheduledEntriesToMockPad,
		validateSupplyInvariant,
	};
}

export function ownershipExpectationForPayment(
	paymentNumber: number
): OwnershipExpectation {
	if (paymentNumber <= 6) {
		return { lenderAUnits: 6000, lenderBUnits: 4000 };
	}
	return { lenderAUnits: 4000, lenderBUnits: 6000 };
}

export function paymentDateForNumber(paymentNumber: number) {
	return Date.parse(`2026-${String(paymentNumber).padStart(2, "0")}-15T00:00:00.000Z`);
}

export function sumAmounts<T extends { amount: number }>(rows: T[]) {
	return rows.reduce((total, row) => total + row.amount, 0);
}

export function teardownReliabilityHarness() {
	while (reliabilityEnvRestoreStack.length > 0) {
		const restore = reliabilityEnvRestoreStack.pop();
		restore?.();
	}
}
