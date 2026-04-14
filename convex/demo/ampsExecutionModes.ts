import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { executeTransition } from "../engine/transition";
import { attachDefaultFeeSetToMortgage } from "../fees/resolver";
import { adminAction, adminQuery, convex } from "../fluent";
import { validateBankAccountRecord } from "../payments/bankAccounts/validation";
import { scheduleInitialEntriesImpl } from "../payments/collectionPlan/initialScheduling";
import {
	buildCollectionAttemptRow,
	buildCollectionPlanEntryRow,
} from "../payments/collectionPlan/readModels";
import { generateObligationsImpl } from "../payments/obligations/generateImpl";
import type {
	NormalizedExternalCollectionOccurrenceEvent,
	RotessaFinancialTransactionStatus,
	RotessaTransactionReportRow,
} from "../payments/recurringSchedules/types";
import { buildNormalizedOccurrenceFromRotessaRow } from "../payments/rotessa/financialTransactions";
import {
	addMonthsToDateString,
	ensureMortgageBorrowerLink,
	ensureOrganization,
	ensureUserByEmail,
} from "../seed/seedHelpers";

const DEFAULT_WORKSPACE_KEY = "amps_execution_modes";
const DEMO_ORG_WORKOS_ID = "demo_org_amps_execution_modes";
const MONTHS_IN_DEMO = 12;

const DEMO_PAYMENT_RAILS = ["manual", "manual_review", "pad_rotessa"] as const;
const DEMO_EXECUTION_MODES = ["app_owned", "provider_managed"] as const;
const DEMO_PROVIDER_OUTCOMES = ["Approved", "Declined"] as const;
const DEMO_PROVIDER_CHANNELS = ["webhook", "poller"] as const;
const COLLECTION_PLAN_ENTRY_STATUSES = [
	"planned",
	"provider_scheduled",
	"executing",
	"completed",
	"cancelled",
	"rescheduled",
] as const;
const COLLECTION_ATTEMPT_STATUSES = [
	"initiated",
	"pending",
	"confirmed",
	"failed",
	"retry_scheduled",
	"permanent_fail",
	"cancelled",
	"reversed",
] as const;
const DEMO_NON_TERMINAL_PLAN_ENTRY_STATUSES = new Set([
	"planned",
	"provider_scheduled",
	"executing",
	"rescheduled",
]);
const DEMO_NON_TERMINAL_ATTEMPT_STATUSES = new Set([
	"initiated",
	"pending",
	"retry_scheduled",
]);
const DEMO_NON_TERMINAL_TRANSFER_STATUSES = new Set([
	"initiated",
	"pending",
	"processing",
]);

type DemoExecutionMode = (typeof DEMO_EXECUTION_MODES)[number];
type DemoPaymentRail = (typeof DEMO_PAYMENT_RAILS)[number];
type DemoProviderOutcome = (typeof DEMO_PROVIDER_OUTCOMES)[number];
type DemoProviderChannel = (typeof DEMO_PROVIDER_CHANNELS)[number];
type DemoWorkspaceDoc = Doc<"demo_collection_execution_workspaces">;
type DemoOccurrenceDoc = Doc<"demo_collection_external_occurrences">;
interface DemoWorkspaceState {
	obligations: Doc<"obligations">[];
	occurrences: DemoOccurrenceDoc[];
	planEntries: Doc<"collectionPlanEntries">[];
	workspace: DemoWorkspaceDoc;
}
type DemoWorkspaceView = Awaited<ReturnType<typeof buildWorkspaceView>>;
interface DemoSeedMutationResult {
	executionMode: DemoExecutionMode;
	futureEvents: Array<{
		occurrenceId: Id<"demo_collection_external_occurrences">;
		event: NormalizedExternalCollectionOccurrenceEvent;
	}>;
	mortgageId: Id<"mortgages">;
	paymentRail: DemoPaymentRail;
	workspaceId: Id<"demo_collection_execution_workspaces">;
}
type AdvanceCollectionExecutionResult =
	| {
			outcome: "complete";
			currentMonthIndex: number;
	  }
	| {
			outcome: "advanced";
			executionMode: "app_owned";
			currentMonthIndex: number;
			runnerSummary: unknown;
	  }
	| {
			outcome: "advanced";
			executionMode: "provider_managed";
			currentMonthIndex: number;
			providerChannel: DemoProviderChannel;
			finalStatus: DemoProviderOutcome;
	  };

const demoExecutionModeValidator = v.union(
	v.literal("app_owned"),
	v.literal("provider_managed")
);
const demoPaymentRailValidator = v.union(
	v.literal("manual"),
	v.literal("manual_review"),
	v.literal("pad_rotessa")
);
const demoProviderOutcomeValidator = v.union(
	v.literal("Approved"),
	v.literal("Declined")
);
const demoProviderChannelValidator = v.union(
	v.literal("webhook"),
	v.literal("poller")
);

function countsByStatus<T extends string>(values: T[]) {
	const counts: Record<string, number> = {};
	for (const value of values) {
		counts[value] = (counts[value] ?? 0) + 1;
	}
	return counts;
}

function sanitizeIdentitySegment(authId: string) {
	return authId.replace(/[^a-zA-Z0-9]/g, "_").slice(-24) || "admin";
}

function addDays(dateString: string, days: number) {
	const date = new Date(`${dateString}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function firstDayOfNextMonth(nowMs: number) {
	const date = new Date(nowMs);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
		.toISOString()
		.slice(0, 10);
}

function toBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function parseIsoDate(dateString: string) {
	const parsed = Date.parse(`${dateString}T00:00:00.000Z`);
	if (Number.isNaN(parsed)) {
		throw new ConvexError(`Invalid ISO business date: ${dateString}`);
	}
	return parsed;
}

function lastFour(value: string) {
	return value.slice(-4);
}

function demoRailForMode(args: {
	executionMode: DemoExecutionMode;
	paymentRail: DemoPaymentRail;
}) {
	if (args.executionMode === "provider_managed") {
		if (args.paymentRail !== "pad_rotessa") {
			throw new ConvexError(
				'Provider-managed demos currently require paymentRail = "pad_rotessa".'
			);
		}
		return args.paymentRail;
	}

	if (args.paymentRail === "pad_rotessa") {
		throw new ConvexError(
			'Application-managed demos do not support "pad_rotessa" in v1. Select "manual" or "manual_review".'
		);
	}

	return args.paymentRail;
}

function buildMortgageAddress(nowMs: number) {
	const timestampSuffix = String(nowMs).slice(-4);
	return {
		streetAddress: "118 Harbour St",
		unit: timestampSuffix,
		city: "Toronto",
		postalCode: "M5J2L2",
		propertyType: "condo" as const,
	};
}

function buildRotessaDemoRow(args: {
	amountCents: number;
	externalScheduleRef: string;
	monthIndex: number;
	processDate: string;
	status: RotessaFinancialTransactionStatus;
	statusReason?: string;
}) {
	return {
		account_number: "1234567",
		amount: (args.amountCents / 100).toFixed(2),
		comment: "demo-managed recurring schedule",
		created_at: `${args.processDate}T08:00:00.000Z`,
		custom_identifier: `demo-borrower-${args.externalScheduleRef}`,
		customer_id: 42,
		earliest_approval_date: args.status === "Future" ? args.processDate : null,
		id:
			Number(args.externalScheduleRef.replace(/\D/g, "")) * 100 +
			args.monthIndex,
		institution_number: "001",
		process_date: args.processDate,
		settlement_date: args.status === "Approved" ? args.processDate : null,
		status: args.status,
		status_reason: args.statusReason ?? null,
		transaction_number: `demo-rotessa-txn-${args.externalScheduleRef}-${args.monthIndex}`,
		transaction_schedule_id: Number(
			args.externalScheduleRef.replace(/\D/g, "")
		),
		transit_number: "00011",
		updated_at: `${args.processDate}T16:00:00.000Z`,
	} satisfies RotessaTransactionReportRow;
}

function buildOccurrenceSequenceLabel(history: DemoOccurrenceDoc["history"]) {
	return history.map((entry) => entry.status).join(" -> ");
}

async function listPlanEntriesForMortgage(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	mortgageId: Id<"mortgages">
) {
	const batches = await Promise.all(
		COLLECTION_PLAN_ENTRY_STATUSES.map((status) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (q) =>
					q.eq("mortgageId", mortgageId).eq("status", status)
				)
				.collect()
		)
	);

	return batches
		.flat()
		.sort((left, right) => left.scheduledDate - right.scheduledDate);
}

async function listAttemptsForMortgage(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	mortgageId: Id<"mortgages">
) {
	const batches = await Promise.all(
		COLLECTION_ATTEMPT_STATUSES.map((status) =>
			ctx.db
				.query("collectionAttempts")
				.withIndex("by_mortgage_status", (q) =>
					q.eq("mortgageId", mortgageId).eq("status", status)
				)
				.collect()
		)
	);

	return batches
		.flat()
		.sort((left, right) => left.initiatedAt - right.initiatedAt);
}

async function getDemoWorkspaceByOwner(args: {
	ctx: Pick<QueryCtx | MutationCtx, "db">;
	ownerAuthId: string;
	workspaceKey: string;
}) {
	return args.ctx.db
		.query("demo_collection_execution_workspaces")
		.withIndex("by_owner_workspace", (q) =>
			q
				.eq("ownerAuthId", args.ownerAuthId)
				.eq("workspaceKey", args.workspaceKey)
		)
		.first();
}

async function decommissionWorkspaceGraph(args: {
	ctx: MutationCtx;
	workspace: DemoWorkspaceDoc;
	decommissionedAt: number;
}) {
	const { ctx, workspace, decommissionedAt } = args;
	const priorOccurrences = await ctx.db
		.query("demo_collection_external_occurrences")
		.withIndex("by_workspace_month", (q) => q.eq("workspaceId", workspace._id))
		.collect();
	for (const occurrence of priorOccurrences) {
		await ctx.db.delete(occurrence._id);
	}

	const priorPlanEntries = await listPlanEntriesForMortgage(
		ctx,
		workspace.mortgageId
	);
	for (const planEntry of priorPlanEntries) {
		if (DEMO_NON_TERMINAL_PLAN_ENTRY_STATUSES.has(planEntry.status)) {
			await ctx.db.patch(planEntry._id, {
				// DEMO-ONLY: reseeding throws away the disposable execution graph instead
				// of routing each stale entry through the production collection workflow.
				status: "cancelled",
				cancelledAt: decommissionedAt,
			});
		}

		if (!planEntry.collectionAttemptId) {
			continue;
		}

		const attempt = await ctx.db.get(planEntry.collectionAttemptId);
		if (!attempt) {
			continue;
		}

		if (DEMO_NON_TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) {
			await ctx.db.patch(attempt._id, {
				// DEMO-ONLY: old workspace attempts are hard-cancelled so the demo can
				// reseed a fresh mortgage without leaving pending servicing artifacts.
				status: "cancelled",
				cancelledAt: decommissionedAt,
				lastTransitionAt: decommissionedAt,
			});
		}

		if (!attempt.transferRequestId) {
			continue;
		}

		const transfer = await ctx.db.get(attempt.transferRequestId);
		if (transfer && DEMO_NON_TERMINAL_TRANSFER_STATUSES.has(transfer.status)) {
			await ctx.db.patch(transfer._id, {
				// DEMO-ONLY: disposable demo transfers are cancelled in place; live
				// production collection requests still transition through the payment rail.
				status: "cancelled",
				lastTransitionAt: decommissionedAt,
			});
		}
	}

	if (workspace.externalCollectionScheduleId) {
		const schedule = await ctx.db.get(workspace.externalCollectionScheduleId);
		if (
			schedule &&
			schedule.status !== "cancelled" &&
			schedule.status !== "completed"
		) {
			await ctx.db.patch(schedule._id, {
				status: "cancelled",
				cancelledAt: decommissionedAt,
				nextPollAt: undefined,
				syncLeaseOwner: undefined,
				syncLeaseExpiresAt: undefined,
				lastTransitionAt: decommissionedAt,
			});
		}
	}

	await ctx.db.patch(workspace.mortgageId, {
		activeExternalCollectionScheduleId: undefined,
		collectionExecutionUpdatedAt: decommissionedAt,
	});
}

async function ensureDemoProfiles(
	ctx: MutationCtx,
	ownerAuthId: string
): Promise<{
	organizationWorkosId: string;
	borrowerId: Id<"borrowers">;
	brokerId: Id<"brokers">;
}> {
	const suffix = sanitizeIdentitySegment(ownerAuthId);
	await ensureOrganization(ctx, {
		workosId: DEMO_ORG_WORKOS_ID,
		name: "AMPS Demo Brokerage",
		allowProfilesOutsideOrganization: true,
	});

	const borrowerUser = await ensureUserByEmail(ctx, {
		authId: `demo_amps_borrower_${suffix}`,
		email: `amps.execution.borrower+${suffix}@fairlend.demo`,
		firstName: "Avery",
		lastName: "Morrison",
	});
	const brokerUser = await ensureUserByEmail(ctx, {
		authId: `demo_amps_broker_${suffix}`,
		email: `amps.execution.broker+${suffix}@fairlend.demo`,
		firstName: "Jordan",
		lastName: "Patel",
	});

	const existingBorrower = await ctx.db
		.query("borrowers")
		.withIndex("by_user", (q) => q.eq("userId", borrowerUser.userId))
		.first();
	const borrowerId =
		existingBorrower?._id ??
		(await ctx.db.insert("borrowers", {
			status: "active",
			orgId: DEMO_ORG_WORKOS_ID,
			userId: borrowerUser.userId,
			onboardedAt: Date.now(),
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		}));

	const existingBroker = await ctx.db
		.query("brokers")
		.withIndex("by_user", (q) => q.eq("userId", brokerUser.userId))
		.first();
	const brokerId =
		existingBroker?._id ??
		(await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUser.userId,
			licenseId: `DEMO-AMPS-${suffix}`,
			licenseProvince: "ON",
			brokerageName: "AMPS Demo Brokerage",
			orgId: DEMO_ORG_WORKOS_ID,
			onboardedAt: Date.now(),
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		}));

	return {
		organizationWorkosId: DEMO_ORG_WORKOS_ID,
		borrowerId,
		brokerId,
	};
}

async function buildWorkspaceView(ctx: QueryCtx, workspace: DemoWorkspaceDoc) {
	const [
		mortgage,
		property,
		bankAccount,
		obligations,
		planEntries,
		attempts,
		occurrences,
	] = await Promise.all([
		ctx.db.get(workspace.mortgageId),
		ctx.db.get(workspace.propertyId),
		ctx.db.get(workspace.bankAccountId),
		ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", workspace.mortgageId))
			.collect(),
		listPlanEntriesForMortgage(ctx, workspace.mortgageId),
		listAttemptsForMortgage(ctx, workspace.mortgageId),
		ctx.db
			.query("demo_collection_external_occurrences")
			.withIndex("by_workspace_month", (q) =>
				q.eq("workspaceId", workspace._id)
			)
			.collect(),
	]);

	if (!(mortgage && property && bankAccount)) {
		return null;
	}

	const planEntryRows = new Map<
		string,
		Awaited<ReturnType<typeof buildCollectionPlanEntryRow>>
	>();
	for (const planEntry of planEntries) {
		planEntryRows.set(
			`${planEntry._id}`,
			await buildCollectionPlanEntryRow(ctx, planEntry)
		);
	}

	const attemptRows = new Map<
		string,
		Awaited<ReturnType<typeof buildCollectionAttemptRow>>
	>();
	for (const attempt of attempts) {
		attemptRows.set(
			`${attempt._id}`,
			await buildCollectionAttemptRow(ctx, attempt)
		);
	}

	const schedule = workspace.externalCollectionScheduleId
		? await ctx.db.get(workspace.externalCollectionScheduleId)
		: null;
	const occurrenceMap = new Map(
		occurrences.map(
			(occurrence) => [`${occurrence.planEntryId}`, occurrence] as const
		)
	);
	const obligationMap = new Map(
		obligations.map((obligation) => [`${obligation._id}`, obligation] as const)
	);

	const installments = planEntries.map((planEntry, index) => {
		const obligation = obligationMap.get(`${planEntry.obligationIds[0]}`);
		const occurrence = occurrenceMap.get(`${planEntry._id}`);
		const planEntryRow = planEntryRows.get(`${planEntry._id}`) ?? null;
		const relatedAttempt =
			planEntry.collectionAttemptId &&
			attemptRows.get(`${planEntry.collectionAttemptId}`)
				? (attemptRows.get(`${planEntry.collectionAttemptId}`) ?? null)
				: (planEntryRow?.relatedAttempt ?? null);

		return {
			monthIndex: index + 1,
			amount: planEntry.amount,
			scheduledDate: planEntry.scheduledDate,
			dueDate: obligation?.dueDate,
			obligation: obligation
				? {
						obligationId: obligation._id,
						paymentNumber: obligation.paymentNumber,
						status: obligation.status,
						amount: obligation.amount,
						amountSettled: obligation.amountSettled,
					}
				: null,
			planEntry: planEntryRow,
			attempt: relatedAttempt,
			providerOccurrence: occurrence
				? {
						status: occurrence.status,
						statusReason: occurrence.statusReason,
						lastDeliveredVia: occurrence.lastDeliveredVia,
						lastDeliveredAt: occurrence.lastDeliveredAt,
						sequenceLabel: buildOccurrenceSequenceLabel(occurrence.history),
					}
				: null,
		};
	});

	const pendingManualTransfer = installments.find(
		(installment) =>
			installment.attempt?.transfer?.providerCode === "manual_review" &&
			(installment.attempt.transfer.status === "pending" ||
				installment.attempt.transfer.status === "processing")
	);

	return {
		workspace: {
			workspaceId: workspace._id,
			executionMode: workspace.executionMode,
			paymentRail: workspace.paymentRail,
			currentMonthIndex: workspace.currentMonthIndex,
			currentDate: workspace.currentDate,
			startDate: workspace.startDate,
			lastAdvancedAt: workspace.lastAdvancedAt,
		},
		mortgage: {
			mortgageId: mortgage._id,
			label: property.unit
				? `${property.streetAddress}, Unit ${property.unit} · ${property.city}`
				: `${property.streetAddress} · ${property.city}`,
			address: property.unit
				? `${property.streetAddress}, Unit ${property.unit}, ${property.city}`
				: `${property.streetAddress}, ${property.city}`,
			principal: mortgage.principal,
			paymentAmount: mortgage.paymentAmount,
			interestRate: mortgage.interestRate,
			firstPaymentDate: mortgage.firstPaymentDate,
			maturityDate: mortgage.maturityDate,
			status: mortgage.status,
			collectionExecutionMode: mortgage.collectionExecutionMode,
			collectionExecutionProviderCode: mortgage.collectionExecutionProviderCode,
		},
		bankAccount: {
			bankAccountId: bankAccount._id,
			status: bankAccount.status,
			mandateStatus: bankAccount.mandateStatus,
			institutionNumber: bankAccount.institutionNumber,
			transitNumber: bankAccount.transitNumber,
			accountLast4: bankAccount.accountLast4,
		},
		schedule: schedule
			? {
					scheduleId: schedule._id,
					status: schedule.status,
					externalScheduleRef: schedule.externalScheduleRef,
					lastProviderScheduleStatus: schedule.lastProviderScheduleStatus,
					lastSyncedAt: schedule.lastSyncedAt,
					nextPollAt: schedule.nextPollAt,
					consecutiveSyncFailures: schedule.consecutiveSyncFailures,
				}
			: null,
		counts: {
			obligationStatusCounts: countsByStatus(
				obligations.map((item) => item.status)
			),
			planEntryStatusCounts: countsByStatus(
				planEntries.map((item) => item.status)
			),
			attemptStatusCounts: countsByStatus(attempts.map((item) => item.status)),
		},
		nextInstallment:
			installments.find(
				(installment) =>
					installment.monthIndex === workspace.currentMonthIndex + 1
			) ?? null,
		pendingManualTransfer: pendingManualTransfer?.attempt?.transfer
			? {
					transferId: pendingManualTransfer.attempt.transfer.transferId,
					monthIndex: pendingManualTransfer.monthIndex,
				}
			: null,
		installments,
	};
}

export const getCollectionExecutionWorkspaceInternal = convex
	.query()
	.input({
		ownerAuthId: v.string(),
		workspaceKey: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<DemoWorkspaceState | null> => {
		const workspace = await getDemoWorkspaceByOwner({
			ctx,
			ownerAuthId: args.ownerAuthId,
			workspaceKey: args.workspaceKey ?? DEFAULT_WORKSPACE_KEY,
		});
		if (!workspace) {
			return null;
		}

		const [planEntries, obligations, occurrences] = await Promise.all([
			listPlanEntriesForMortgage(ctx, workspace.mortgageId),
			ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", workspace.mortgageId)
				)
				.collect(),
			ctx.db
				.query("demo_collection_external_occurrences")
				.withIndex("by_workspace_month", (q) =>
					q.eq("workspaceId", workspace._id)
				)
				.collect(),
		]);

		return {
			workspace,
			planEntries,
			obligations,
			occurrences: occurrences.sort(
				(left, right) => left.monthIndex - right.monthIndex
			),
		};
	})
	.internal();

export const getPendingManualReviewTransferInternal = convex
	.query()
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const attempts = await listAttemptsForMortgage(ctx, args.mortgageId);
		for (const attempt of attempts) {
			if (!attempt.transferRequestId) {
				continue;
			}
			const transfer = await ctx.db.get(attempt.transferRequestId);
			if (
				transfer?.providerCode === "manual_review" &&
				(transfer.status === "pending" || transfer.status === "processing")
			) {
				return transfer._id;
			}
		}
		return null;
	})
	.internal();

export const getCollectionExecutionWorkspace = adminQuery
	.input({
		workspaceKey: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<DemoWorkspaceView> => {
		const workspace = await getDemoWorkspaceByOwner({
			ctx,
			ownerAuthId: ctx.viewer.authId,
			workspaceKey: args.workspaceKey ?? DEFAULT_WORKSPACE_KEY,
		});
		if (!workspace) {
			return null;
		}
		return buildWorkspaceView(ctx, workspace);
	})
	.public();

export const seedCollectionExecutionWorkspaceInternal = convex
	.mutation()
	.input({
		ownerAuthId: v.string(),
		executionMode: demoExecutionModeValidator,
		paymentRail: demoPaymentRailValidator,
		workspaceKey: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<DemoSeedMutationResult> => {
		const paymentRail = demoRailForMode({
			executionMode: args.executionMode,
			paymentRail: args.paymentRail,
		});
		const workspaceKey = args.workspaceKey ?? DEFAULT_WORKSPACE_KEY;
		const now = Date.now();
		const existingWorkspace = await getDemoWorkspaceByOwner({
			ctx,
			ownerAuthId: args.ownerAuthId,
			workspaceKey,
		});

		if (existingWorkspace) {
			await decommissionWorkspaceGraph({
				ctx,
				workspace: existingWorkspace,
				decommissionedAt: now,
			});
		}

		const { borrowerId, brokerId, organizationWorkosId } =
			await ensureDemoProfiles(ctx, args.ownerAuthId);
		const firstPaymentDate = firstDayOfNextMonth(now);
		const maturityDate = addMonthsToDateString(
			firstPaymentDate,
			MONTHS_IN_DEMO - 1
		);
		const startDate = addDays(firstPaymentDate, -7);
		const propertyAddress = buildMortgageAddress(now);

		const propertyId = await ctx.db.insert("properties", {
			...propertyAddress,
			province: "ON",
			latitude: 43.6426,
			longitude: -79.3871,
			createdAt: now,
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			orgId: organizationWorkosId,
			status: "active",
			machineContext: {
				lastPaymentAt: 0,
				missedPayments: 0,
			},
			lastTransitionAt: now,
			propertyId,
			principal: 68_000_000,
			interestRate: 0.0695,
			rateType: "fixed",
			termMonths: MONTHS_IN_DEMO,
			amortizationMonths: 300,
			paymentAmount: 394_083,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: 0.01,
			interestAdjustmentDate: firstPaymentDate,
			termStartDate: firstPaymentDate,
			maturityDate,
			firstPaymentDate,
			brokerOfRecordId: brokerId,
			fundedAt: now,
			createdAt: now,
		});
		await attachDefaultFeeSetToMortgage(ctx.db, mortgageId, 0.01);
		await ensureMortgageBorrowerLink(ctx, {
			addedAt: now,
			borrowerId,
			mortgageId,
			role: "primary",
		});

		await generateObligationsImpl(ctx, {
			mortgageId,
			borrowerId,
			interestRate: 0.0695,
			principal: 68_000_000,
			paymentFrequency: "monthly",
			firstPaymentDate,
			maturityDate,
		});

		await scheduleInitialEntriesImpl(ctx, {
			mortgageId,
			delayDays: 0,
			nowMs: parseIsoDate(maturityDate) + 12 * 60 * 60 * 1000,
		});

		const planEntries = await listPlanEntriesForMortgage(ctx, mortgageId);
		const bankAccountId = await ctx.db.insert("bankAccounts", {
			ownerType: "borrower",
			ownerId: `${borrowerId}`,
			institutionNumber: "001",
			transitNumber: "00011",
			accountLast4: lastFour(`${now}${mortgageId}`),
			status: "validated",
			validationMethod: "provider_verified",
			mandateStatus: "active",
			isDefaultInbound: true,
			country: "CA",
			currency: "CAD",
			createdAt: now,
			metadata:
				args.executionMode === "provider_managed"
					? {
							rotessaCustomerCustomIdentifier: `demo-borrower-${sanitizeIdentitySegment(args.ownerAuthId)}`,
						}
					: undefined,
		});

		for (const planEntry of planEntries) {
			await ctx.db.patch(planEntry._id, {
				method: paymentRail,
				executionMode: "app_owned",
			});
		}

		let externalCollectionScheduleId:
			| Id<"externalCollectionSchedules">
			| undefined;
		const futureEvents: Array<{
			occurrenceId: Id<"demo_collection_external_occurrences">;
			event: NormalizedExternalCollectionOccurrenceEvent;
		}> = [];

		if (args.executionMode === "provider_managed") {
			const bankAccount = await ctx.db.get(bankAccountId);
			if (!bankAccount) {
				throw new ConvexError(
					"Expected demo bank account to exist after insert."
				);
			}
			const bankValidation = validateBankAccountRecord(
				bankAccount,
				"pad_rotessa"
			);
			if (!bankValidation.valid) {
				throw new ConvexError(bankValidation.errorMessage);
			}

			// DEMO-ONLY: production provider-managed setup creates the external schedule
			// through the recurring-schedule activation flow and a live provider adapter.
			// The demo persists a local schedule mirror directly so admins can exercise
			// the servicing lifecycle without provisioning a real Rotessa schedule.
			externalCollectionScheduleId = await ctx.db.insert(
				"externalCollectionSchedules",
				{
					status: "active",
					mortgageId,
					borrowerId,
					providerCode: "pad_rotessa",
					bankAccountId,
					externalScheduleRef: `demo-rotessa-schedule-${now}`,
					activationIdempotencyKey: `demo:${workspaceKey}:${mortgageId}:${now}`,
					startDate: planEntries[0]?.scheduledDate ?? now,
					endDate: planEntries.at(-1)?.scheduledDate ?? now,
					cadence: "Monthly",
					coveredFromPlanEntryId: (() => {
						const firstPlanEntry = planEntries[0];
						if (!firstPlanEntry) {
							throw new ConvexError(
								"No plan entries available for demo activation."
							);
						}
						return firstPlanEntry._id;
					})(),
					coveredToPlanEntryId: (() => {
						const lastPlanEntry = planEntries.at(-1);
						if (!lastPlanEntry) {
							throw new ConvexError(
								"No plan entries available for demo activation."
							);
						}
						return lastPlanEntry._id;
					})(),
					activatedAt: now,
					lastSyncedAt: now,
					nextPollAt: now + 15 * 60 * 1000,
					consecutiveSyncFailures: 0,
					lastProviderScheduleStatus: "active",
					providerData: {
						demoMode: true,
						note: "Created by the AMPS execution-mode demo.",
					},
					source: "demo_execution_modes",
					createdAt: now,
					lastTransitionAt: now,
				}
			);

			for (const [index, planEntry] of planEntries.entries()) {
				await ctx.db.patch(planEntry._id, {
					status: "provider_scheduled",
					method: "pad_rotessa",
					executionMode: "provider_managed",
					externalCollectionScheduleId,
					externalOccurrenceOrdinal: index + 1,
					externallyManagedAt: now,
				});
			}

			await ctx.db.patch(mortgageId, {
				collectionExecutionMode: "provider_managed",
				collectionExecutionProviderCode: "pad_rotessa",
				activeExternalCollectionScheduleId: externalCollectionScheduleId,
				collectionExecutionUpdatedAt: now,
			});

			const workspaceId =
				existingWorkspace?._id ??
				(await ctx.db.insert("demo_collection_execution_workspaces", {
					ownerAuthId: args.ownerAuthId,
					workspaceKey,
					executionMode: args.executionMode,
					paymentRail,
					mortgageId,
					borrowerId,
					brokerId,
					propertyId,
					bankAccountId,
					externalCollectionScheduleId,
					currentMonthIndex: 0,
					currentDate: startDate,
					startDate,
					createdAt: now,
					updatedAt: now,
				}));

			if (existingWorkspace) {
				await ctx.db.patch(existingWorkspace._id, {
					executionMode: args.executionMode,
					paymentRail,
					mortgageId,
					borrowerId,
					brokerId,
					propertyId,
					bankAccountId,
					externalCollectionScheduleId,
					currentMonthIndex: 0,
					currentDate: startDate,
					startDate,
					updatedAt: now,
					lastAdvancedAt: undefined,
				});
			}

			const scheduleDoc = await ctx.db.get(externalCollectionScheduleId);
			const externalScheduleRef = scheduleDoc?.externalScheduleRef;
			if (!externalScheduleRef) {
				throw new ConvexError(
					"Expected external schedule ref for provider-managed demo activation."
				);
			}

			for (const [index, planEntry] of planEntries.entries()) {
				const row = buildRotessaDemoRow({
					amountCents: planEntry.amount,
					externalScheduleRef,
					monthIndex: index + 1,
					processDate: toBusinessDate(planEntry.scheduledDate),
					status: "Future",
				});
				const occurrenceId = await ctx.db.insert(
					"demo_collection_external_occurrences",
					{
						// DEMO-ONLY: this table mirrors the provider occurrence lifecycle so
						// the UI can show Future -> Pending -> Approved / Declined transitions
						// before or alongside the canonical local attempt and transfer rows.
						workspaceId,
						planEntryId: planEntry._id,
						externalCollectionScheduleId,
						monthIndex: index + 1,
						externalScheduleRef,
						externalOccurrenceRef: `rotessa_financial_transaction:${row.id}`,
						providerRef:
							row.transaction_number ??
							`rotessa_financial_transaction:${row.id}`,
						scheduledDate: row.process_date,
						status: "Future",
						history: [
							{
								status: "Future",
								deliveredVia: "poller",
								occurredAt: Date.parse(row.created_at),
							},
						],
						createdAt: now,
						updatedAt: now,
					}
				);

				const normalizedEvent = buildNormalizedOccurrenceFromRotessaRow({
					externalScheduleRef,
					receivedVia: "poller",
					row,
				});
				if (!normalizedEvent) {
					throw new ConvexError("Expected a normalized Rotessa Future event.");
				}
				futureEvents.push({
					occurrenceId,
					event: normalizedEvent,
				});
			}

			return {
				workspaceId,
				mortgageId,
				executionMode: args.executionMode,
				paymentRail,
				futureEvents,
			};
		}

		await ctx.db.patch(mortgageId, {
			collectionExecutionMode: "app_owned",
			collectionExecutionProviderCode: paymentRail,
			collectionExecutionUpdatedAt: now,
		});

		const workspaceId =
			existingWorkspace?._id ??
			(await ctx.db.insert("demo_collection_execution_workspaces", {
				ownerAuthId: args.ownerAuthId,
				workspaceKey,
				executionMode: args.executionMode,
				paymentRail,
				mortgageId,
				borrowerId,
				brokerId,
				propertyId,
				bankAccountId,
				externalCollectionScheduleId: undefined,
				currentMonthIndex: 0,
				currentDate: startDate,
				startDate,
				createdAt: now,
				updatedAt: now,
			}));

		if (existingWorkspace) {
			await ctx.db.patch(existingWorkspace._id, {
				executionMode: args.executionMode,
				paymentRail,
				mortgageId,
				borrowerId,
				brokerId,
				propertyId,
				bankAccountId,
				externalCollectionScheduleId: undefined,
				currentMonthIndex: 0,
				currentDate: startDate,
				startDate,
				updatedAt: now,
				lastAdvancedAt: undefined,
			});
		}

		return {
			workspaceId,
			mortgageId,
			executionMode: args.executionMode,
			paymentRail,
			futureEvents,
		};
	})
	.internal();

export const recordDemoOccurrenceEventInternal = convex
	.mutation()
	.input({
		occurrenceId: v.id("demo_collection_external_occurrences"),
		deliveredVia: demoProviderChannelValidator,
		occurredAt: v.number(),
		status: v.union(
			v.literal("Future"),
			v.literal("Pending"),
			v.literal("Approved"),
			v.literal("Declined"),
			v.literal("Chargeback")
		),
		statusReason: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const occurrence = await ctx.db.get(args.occurrenceId);
		if (!occurrence) {
			throw new ConvexError(
				`Demo external occurrence not found: ${args.occurrenceId}`
			);
		}

		await ctx.db.patch(args.occurrenceId, {
			status: args.status,
			statusReason: args.statusReason,
			lastDeliveredVia: args.deliveredVia,
			lastDeliveredAt: args.occurredAt,
			updatedAt: Date.now(),
			history: [
				...occurrence.history,
				{
					status: args.status,
					deliveredVia: args.deliveredVia,
					occurredAt: args.occurredAt,
					reason: args.statusReason,
				},
			],
		});
	})
	.internal();

export const advanceWorkspaceClockInternal = convex
	.mutation()
	.input({
		advancedAt: v.number(),
		currentDate: v.string(),
		currentMonthIndex: v.number(),
		workspaceId: v.id("demo_collection_execution_workspaces"),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.workspaceId, {
			currentMonthIndex: args.currentMonthIndex,
			currentDate: args.currentDate,
			updatedAt: args.advancedAt,
			lastAdvancedAt: args.advancedAt,
		});
	})
	.internal();

export const transitionWorkspaceObligationsInternal = convex
	.mutation()
	.input({
		asOf: v.number(),
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
		const source = {
			actorId: "demo:amps:execution-modes",
			actorType: "system" as const,
			channel: "simulation" as const,
		};

		for (const obligation of obligations
			.filter((item) => item.status === "upcoming" && item.dueDate <= args.asOf)
			.sort((left, right) => left.dueDate - right.dueDate)) {
			await executeTransition(ctx, {
				entityType: "obligation",
				entityId: obligation._id,
				eventType: "BECAME_DUE",
				payload: {},
				source,
			});
		}

		for (const obligation of obligations
			.filter(
				(item) =>
					(item.status === "due" || item.status === "partially_settled") &&
					item.gracePeriodEnd <= args.asOf
			)
			.sort((left, right) => left.gracePeriodEnd - right.gracePeriodEnd)) {
			await executeTransition(ctx, {
				entityType: "obligation",
				entityId: obligation._id,
				eventType: "GRACE_PERIOD_EXPIRED",
				payload: {},
				source,
			});
		}
	})
	.internal();

export const patchDemoScheduleSyncMirrorInternal = convex
	.mutation()
	.input({
		asOf: v.number(),
		lastProviderScheduleStatus: v.string(),
		scheduleId: v.id("externalCollectionSchedules"),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) {
			throw new ConvexError(
				`External collection schedule not found: ${args.scheduleId}`
			);
		}

		await ctx.db.patch(args.scheduleId, {
			lastSyncedAt: args.asOf,
			lastSyncAttemptAt: args.asOf,
			nextPollAt: args.asOf + 15 * 60 * 1000,
			lastProviderScheduleStatus: args.lastProviderScheduleStatus,
			providerData: {
				...(schedule.providerData ?? {}),
				demoLastPollAt: args.asOf,
			},
			consecutiveSyncFailures: 0,
			lastSyncErrorAt: undefined,
			lastSyncErrorMessage: undefined,
		});
	})
	.internal();

export const seedCollectionExecutionWorkspace = adminAction
	.input({
		executionMode: demoExecutionModeValidator,
		paymentRail: demoPaymentRailValidator,
		workspaceKey: v.optional(v.string()),
	})
	.handler(
		async (
			ctx,
			args
		): Promise<Omit<DemoSeedMutationResult, "futureEvents">> => {
			const seeded: DemoSeedMutationResult = await ctx.runMutation(
				// DEMO-ONLY: we keep the seed orchestration in a dedicated mutation so the
				// UI can spin up disposable demo data without touching the live Rotessa API.
				internal.demo.ampsExecutionModes
					.seedCollectionExecutionWorkspaceInternal,
				{
					ownerAuthId: ctx.viewer.authId,
					executionMode: args.executionMode,
					paymentRail: args.paymentRail,
					workspaceKey: args.workspaceKey,
				}
			);

			if (seeded.executionMode === "provider_managed") {
				for (const futureEvent of seeded.futureEvents) {
					// DEMO-ONLY: the production system learns about Future occurrences from
					// webhook delivery or scheduled polling. The demo injects the already
					// normalized Future events directly into the shared ingestion path so the
					// rest of the materialization flow stays identical and deterministic.
					await ctx.runMutation(
						internal.payments.recurringSchedules.occurrenceIngestion
							.ingestExternalOccurrenceEvent,
						{
							event: {
								...futureEvent.event,
								receivedVia: "poller",
							},
						}
					);
				}
			}

			return {
				mortgageId: seeded.mortgageId,
				workspaceId: seeded.workspaceId,
				executionMode: seeded.executionMode,
				paymentRail: seeded.paymentRail,
			};
		}
	)
	.public();

function buildDemoOccurrenceEvent(args: {
	event: DemoOccurrenceDoc;
	amountCents: number;
	externalScheduleRef: string;
	channel: DemoProviderChannel;
	status: RotessaFinancialTransactionStatus;
	statusReason?: string;
}) {
	const row = buildRotessaDemoRow({
		amountCents: args.amountCents,
		externalScheduleRef: args.externalScheduleRef,
		monthIndex: args.event.monthIndex,
		processDate: args.event.scheduledDate,
		status: args.status,
		statusReason: args.statusReason,
	});
	const normalized = buildNormalizedOccurrenceFromRotessaRow({
		externalScheduleRef: args.externalScheduleRef,
		receivedVia: args.channel,
		row,
	});
	if (!normalized) {
		throw new ConvexError(
			`Unable to normalize demo Rotessa occurrence status ${args.status}.`
		);
	}
	return normalized;
}

async function persistAdvancedWorkspaceClock(args: {
	advancedAt: number;
	currentMonthIndex: number;
	currentDate: string;
	ctx: Pick<ActionCtx, "runMutation">;
	workspaceId: Id<"demo_collection_execution_workspaces">;
}) {
	await args.ctx.runMutation(
		internal.demo.ampsExecutionModes.advanceWorkspaceClockInternal,
		{
			workspaceId: args.workspaceId,
			currentMonthIndex: args.currentMonthIndex,
			currentDate: args.currentDate,
			advancedAt: args.advancedAt,
		}
	);
}

export const advanceCollectionExecutionMonth = adminAction
	.input({
		outcome: v.optional(demoProviderOutcomeValidator),
		providerChannel: v.optional(demoProviderChannelValidator),
		workspaceKey: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<AdvanceCollectionExecutionResult> => {
		const state: DemoWorkspaceState | null = await ctx.runQuery(
			internal.demo.ampsExecutionModes.getCollectionExecutionWorkspaceInternal,
			{
				ownerAuthId: ctx.viewer.authId,
				workspaceKey: args.workspaceKey,
			}
		);
		if (!state) {
			throw new ConvexError(
				"Seed the execution-mode demo before advancing it."
			);
		}

		const nextMonthIndex = state.workspace.currentMonthIndex + 1;
		const planEntry = state.planEntries[nextMonthIndex - 1];
		if (!planEntry) {
			return {
				outcome: "complete" as const,
				currentMonthIndex: state.workspace.currentMonthIndex,
			};
		}

		const advancedAt = Date.now();
		const asOf = planEntry.scheduledDate + 60_000;
		await ctx.runMutation(
			internal.demo.ampsExecutionModes.transitionWorkspaceObligationsInternal,
			{
				mortgageId: state.workspace.mortgageId,
				asOf,
			}
		);

		if (state.workspace.executionMode === "app_owned") {
			const summary: unknown = await ctx.runAction(
				internal.payments.collectionPlan.runner.processDuePlanEntries,
				{
					asOf,
					batchSize: 12,
					mortgageId: state.workspace.mortgageId,
				}
			);
			await persistAdvancedWorkspaceClock({
				advancedAt,
				currentMonthIndex: nextMonthIndex,
				currentDate: toBusinessDate(planEntry.scheduledDate),
				ctx,
				workspaceId: state.workspace._id,
			});
			return {
				outcome: "advanced" as const,
				executionMode: "app_owned" as const,
				currentMonthIndex: nextMonthIndex,
				runnerSummary: summary,
			};
		}

		const occurrence = state.occurrences.find(
			(item: DemoOccurrenceDoc) => item.monthIndex === nextMonthIndex
		);
		if (!(occurrence && state.workspace.externalCollectionScheduleId)) {
			throw new ConvexError(
				`Provider-managed demo occurrence is missing for month ${nextMonthIndex}.`
			);
		}

		const channel = args.providerChannel ?? "webhook";
		const outcome = args.outcome ?? "Approved";
		const schedule = await ctx.runQuery(
			internal.payments.recurringSchedules.queries
				.getExternalCollectionScheduleDetail,
			{
				scheduleId: state.workspace.externalCollectionScheduleId,
			}
		);
		const externalScheduleRef = schedule?.schedule.externalScheduleRef;
		if (!externalScheduleRef) {
			throw new ConvexError(
				"Provider-managed demo schedule is missing externalScheduleRef."
			);
		}

		const pendingEvent = buildDemoOccurrenceEvent({
			event: occurrence,
			amountCents: planEntry.amount,
			externalScheduleRef,
			channel,
			status: "Pending",
		});
		await ctx.runMutation(
			internal.demo.ampsExecutionModes.recordDemoOccurrenceEventInternal,
			{
				occurrenceId: occurrence._id,
				status: "Pending",
				deliveredVia: channel,
				occurredAt: pendingEvent.occurredAt ?? advancedAt,
			}
		);

		// DEMO-ONLY: the webhook and poller transports are bypassed here. We inject
		// the normalized provider event directly into occurrence ingestion so the
		// real materialization, transfer, attempt, and ledger codepaths still run.
		await ctx.runMutation(
			internal.payments.recurringSchedules.occurrenceIngestion
				.ingestExternalOccurrenceEvent,
			{
				event: {
					...pendingEvent,
					receivedVia: channel,
				},
			}
		);

		const finalStatus = outcome === "Approved" ? "Approved" : "Declined";
		const statusReason = outcome === "Declined" ? "NSF" : undefined;
		const finalEvent = buildDemoOccurrenceEvent({
			event: occurrence,
			amountCents: planEntry.amount,
			externalScheduleRef,
			channel,
			status: finalStatus,
			statusReason,
		});
		await ctx.runMutation(
			internal.demo.ampsExecutionModes.recordDemoOccurrenceEventInternal,
			{
				occurrenceId: occurrence._id,
				status: finalStatus,
				deliveredVia: channel,
				occurredAt: finalEvent.occurredAt ?? advancedAt + 1,
				statusReason,
			}
		);
		await ctx.runMutation(
			internal.payments.recurringSchedules.occurrenceIngestion
				.ingestExternalOccurrenceEvent,
			{
				event: {
					...finalEvent,
					rawProviderReason: finalEvent.rawProviderReason ?? statusReason,
					receivedVia: channel,
				},
			}
		);

		if (channel === "poller") {
			await ctx.runMutation(
				internal.demo.ampsExecutionModes.patchDemoScheduleSyncMirrorInternal,
				{
					scheduleId: state.workspace.externalCollectionScheduleId,
					asOf: finalEvent.occurredAt ?? advancedAt,
					lastProviderScheduleStatus: finalStatus,
				}
			);
		}

		await persistAdvancedWorkspaceClock({
			advancedAt,
			currentMonthIndex: nextMonthIndex,
			currentDate: toBusinessDate(planEntry.scheduledDate),
			ctx,
			workspaceId: state.workspace._id,
		});

		return {
			outcome: "advanced" as const,
			executionMode: "provider_managed" as const,
			currentMonthIndex: nextMonthIndex,
			providerChannel: channel,
			finalStatus,
		};
	})
	.public();

export const confirmPendingManualReviewTransfer = adminAction
	.input({
		workspaceKey: v.optional(v.string()),
	})
	.handler(
		async (ctx, args): Promise<{ transferId: Id<"transferRequests"> }> => {
			const workspace: DemoWorkspaceState | null = await ctx.runQuery(
				internal.demo.ampsExecutionModes
					.getCollectionExecutionWorkspaceInternal,
				{
					ownerAuthId: ctx.viewer.authId,
					workspaceKey: args.workspaceKey,
				}
			);
			if (!workspace) {
				throw new ConvexError(
					"There is no execution-mode demo workspace to confirm yet."
				);
			}

			const transferId: Id<"transferRequests"> | null = await ctx.runQuery(
				internal.demo.ampsExecutionModes.getPendingManualReviewTransferInternal,
				{
					mortgageId: workspace.workspace.mortgageId,
				}
			);
			if (!transferId) {
				throw new ConvexError(
					"There is no pending manual-review transfer ready for confirmation."
				);
			}

			await ctx.runMutation(
				internal.payments.transfers.mutations.confirmManualTransferInternal,
				{
					transferId,
					source: {
						actorId: "demo:amps:execution-modes",
						actorType: "system",
						channel: "simulation",
					},
				}
			);

			return { transferId };
		}
	)
	.public();
