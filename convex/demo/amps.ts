import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { executeTransition } from "../engine/transition";
import { adminAction, adminQuery, convex } from "../fluent";
import { upsertCollectionRuleByCode } from "../payments/collectionPlan/ruleRecords";
import { createTransferRequestRecord } from "../payments/transfers/mutations";

const MS_PER_DAY = 86_400_000;
const DEMO_SOURCE = {
	actorId: "system:demo-amps",
	actorType: "system" as const,
	channel: "simulation" as const,
};

const seedAllActionRef = makeFunctionReference<"action">(
	"seed/seedAll:seedAll"
);
const getRetryScenarioSeedContextQueryRef = makeFunctionReference<"query">(
	"demo/amps:getRetryScenarioSeedContextInternal"
);

const DEMO_SCENARIOS = [
	{
		key: "healthy",
		title: "Healthy Collection Flow",
		description:
			"Baseline mortgage with canonical rules, untouched default scheduling, and no execution-side interventions.",
		streetAddress: "260 Wellington St W",
		city: "Toronto",
		tone: "emerald",
	},
	{
		key: "overdue",
		title: "Overdue Obligation Pressure",
		description:
			"Mortgage with an overdue obligation so operators can inspect obligation truth separately from strategy and execution.",
		streetAddress: "44 Front St E",
		city: "Toronto",
		tone: "amber",
	},
	{
		key: "failed_retry",
		title: "Failed Attempt + Retry Strategy",
		description:
			"Demo-seeded permanent failure with canonical retry-rule output so execution history and follow-up strategy are visible together.",
		streetAddress: "44 Front St E",
		city: "Toronto",
		tone: "rose",
	},
	{
		key: "review_required",
		title: "Operator Review Required",
		description:
			"Mortgage-scoped balance pre-check escalates execution to operator review without mutating obligation truth.",
		streetAddress: "12 Garden Ave",
		city: "Mississauga",
		tone: "violet",
	},
	{
		key: "workout_backed",
		title: "Workout-Backed Strategy",
		description:
			"An active workout supersedes future default scheduling while leaving delinquency and ledger boundaries untouched.",
		streetAddress: "12 Garden Ave",
		city: "Mississauga",
		tone: "cyan",
	},
	{
		key: "suppressed",
		title: "Suppressed By Balance Signal",
		description:
			"Mortgage-scoped balance pre-check suppresses execution entirely while keeping the plan entry visible to operators.",
		streetAddress: "18 Maple Grove Rd",
		city: "Oakville",
		tone: "slate",
	},
] as const;

type DemoScenarioKey = (typeof DEMO_SCENARIOS)[number]["key"];

interface DemoScenarioTargetRecord {
	activeWorkoutPlanId?: Id<"workoutPlans">;
	address: string;
	availableDraftWorkoutPlanId?: Id<"workoutPlans">;
	borrowerId: Id<"borrowers">;
	city: string;
	collectibleObligationIds: Id<"obligations">[];
	mortgageId: Id<"mortgages">;
	mortgageStatus: Doc<"mortgages">["status"];
	nextPlannedEntry?: {
		amount: number;
		method: string;
		obligationIds: Id<"obligations">[];
		planEntryId: Id<"collectionPlanEntries">;
		scheduledDate: number;
	};
	obligationStatusCounts: Record<string, number>;
	paymentAmount: number;
	planEntryIdsByDecision: Partial<
		Record<
			"defer" | "proceed" | "require_operator_review" | "suppress",
			Id<"collectionPlanEntries">[]
		>
	>;
	planEntryStatusCounts: Record<string, number>;
	propertyLabel: string;
	recentAttemptStatusCounts: Record<string, number>;
	upcomingObligationIds: Id<"obligations">[];
}

interface RequiredDemoTargets {
	retry: DemoScenarioTargetRecord;
	reviewRequired: DemoScenarioTargetRecord;
	suppress: DemoScenarioTargetRecord;
}

interface DemoWorkspaceActionCtx {
	runAction: ActionCtx["runAction"];
	runMutation: ActionCtx["runMutation"];
	runQuery: ActionCtx["runQuery"];
	viewer: {
		authId: string;
	};
}

interface DemoDecisionScenarioDefinition {
	idempotencyPrefix: string;
	readyDecision: "require_operator_review" | "suppress";
	reason: string;
	reasonKey: "review_required" | "suppress";
	targetKey: keyof Pick<RequiredDemoTargets, "reviewRequired" | "suppress">;
}

interface ScenarioOverviewCard {
	description: string;
	href?: string;
	key: DemoScenarioKey;
	mortgageId?: Id<"mortgages">;
	ready: boolean;
	title: string;
	tone: (typeof DEMO_SCENARIOS)[number]["tone"];
}

interface DemoMortgageWorkspaceCard {
	activeWorkoutPlanId?: Id<"workoutPlans">;
	address: string;
	attemptStatusCounts: Record<string, number>;
	city: string;
	mortgageId: Id<"mortgages">;
	mortgageStatus: Doc<"mortgages">["status"];
	obligationStatusCounts: Record<string, number>;
	planEntryStatusCounts: Record<string, number>;
	propertyLabel: string;
	scenarioKeys: DemoScenarioKey[];
}

interface WorkspaceOverviewResult {
	isSeeded: boolean;
	missingScenarioAddresses: string[];
	mortgages: DemoMortgageWorkspaceCard[];
	scenarios: ScenarioOverviewCard[];
	workspaceStats: {
		attemptCount: number;
		mortgageCount: number;
		planEntryCount: number;
		readyScenarioCount: number;
	};
}

interface MortgageWorkspaceResult {
	mortgage: {
		city: string;
		firstPaymentDate: string;
		interestRate: number;
		label: string;
		maturityDate: string;
		mortgageId: Id<"mortgages">;
		paymentAmount: number;
		paymentFrequency: Doc<"mortgages">["paymentFrequency"];
		principal: number;
		status: Doc<"mortgages">["status"];
		streetAddress: string;
	};
	obligations: {
		amount: number;
		amountSettled: number;
		dueDate: number;
		gracePeriodEnd?: number;
		obligationId: Id<"obligations">;
		paymentNumber: number;
		settledAt?: number;
		sourceObligationId?: Id<"obligations">;
		status: Doc<"obligations">["status"];
		type: Doc<"obligations">["type"];
	}[];
	scenarioKeys: DemoScenarioKey[];
}

function uniqueIds<T extends string>(values: T[]) {
	return [...new Set(values)];
}

function buildDemoSignalIdempotencyKey(args: {
	borrowerId: Id<"borrowers">;
	mortgageId: Id<"mortgages">;
	reasonKey: "review_required" | "suppress";
}) {
	return `demo-amps:${args.reasonKey}:${args.mortgageId}:${args.borrowerId}`;
}

function buildDemoRetryExecutionIdempotencyKey(
	planEntryId: Id<"collectionPlanEntries">
) {
	return `demo-amps:retry:${planEntryId}`;
}

const DEMO_DECISION_SCENARIOS: readonly DemoDecisionScenarioDefinition[] = [
	{
		idempotencyPrefix: "demo-amps:review",
		readyDecision: "require_operator_review",
		reason: "Prepare AMPS demo review-required scenario",
		reasonKey: "review_required",
		targetKey: "reviewRequired",
	},
	{
		idempotencyPrefix: "demo-amps:suppress",
		readyDecision: "suppress",
		reason: "Prepare AMPS demo suppress scenario",
		reasonKey: "suppress",
		targetKey: "suppress",
	},
] as const;

type RetryScenarioSeedResult =
	| {
			outcome: "already_seeded";
			retryPlanEntryId?: Id<"collectionPlanEntries">;
	  }
	| {
			attemptId: Id<"collectionAttempts">;
			outcome: "seeded";
	  };

function sumCounts(counts: Record<string, number>) {
	return Object.values(counts).reduce((total, value) => total + value, 0);
}

function createMortgageLabel(property: {
	city: string;
	streetAddress: string;
	unit?: string;
}) {
	return property.unit
		? `${property.streetAddress}, Unit ${property.unit} · ${property.city}`
		: `${property.streetAddress} · ${property.city}`;
}

function getScenarioHref(
	key: DemoScenarioKey,
	mortgageId: Id<"mortgages"> | undefined
) {
	if (!mortgageId) {
		return undefined;
	}

	switch (key) {
		case "healthy":
		case "failed_retry":
		case "overdue":
		case "review_required":
		case "suppressed":
		case "workout_backed":
			return `/demo/amps/mortgages/${mortgageId}/payments`;
		default:
			return undefined;
	}
}

function buildScenarioReadiness(args: {
	scenarioKey: DemoScenarioKey;
	target?: DemoScenarioTargetRecord;
}) {
	const target = args.target;
	if (!target) {
		return false;
	}

	switch (args.scenarioKey) {
		case "healthy":
			return (
				(target.planEntryStatusCounts.planned ?? 0) > 0 &&
				(target.recentAttemptStatusCounts.confirmed ?? 0) === 0 &&
				target.activeWorkoutPlanId === undefined
			);
		case "overdue":
			return (target.obligationStatusCounts.overdue ?? 0) > 0;
		case "failed_retry":
			return (
				(target.recentAttemptStatusCounts.permanent_fail ?? 0) > 0 &&
				(target.planEntryStatusCounts.planned ?? 0) > 0
			);
		case "review_required":
			return (
				(target.planEntryIdsByDecision.require_operator_review?.length ?? 0) > 0
			);
		case "workout_backed":
			return target.activeWorkoutPlanId !== undefined;
		case "suppressed":
			return (target.planEntryIdsByDecision.suppress?.length ?? 0) > 0;
		default:
			return false;
	}
}

async function loadDemoScenarioTargets(ctx: Pick<QueryCtx, "db">) {
	const mortgages = await ctx.db.query("mortgages").collect();
	const propertyIds = uniqueIds(
		mortgages.map((mortgage) => `${mortgage.propertyId}`)
	);
	const properties = await Promise.all(
		propertyIds.map((propertyId) => ctx.db.get(propertyId as Id<"properties">))
	);
	const propertyById = new Map(
		properties
			.filter(
				(property): property is NonNullable<typeof property> =>
					property !== null
			)
			.map((property) => [`${property._id}`, property] as const)
	);

	const allPlanEntries = await ctx.db.query("collectionPlanEntries").collect();
	const allAttempts = await ctx.db.query("collectionAttempts").collect();
	const allWorkoutPlans = await ctx.db.query("workoutPlans").collect();

	const targets = new Map<string, DemoScenarioTargetRecord>();
	for (const mortgage of mortgages) {
		const property = propertyById.get(`${mortgage.propertyId}`);
		if (!property) {
			continue;
		}

		const isDemoMortgage = DEMO_SCENARIOS.some(
			(scenario) => scenario.streetAddress === property.streetAddress
		);
		if (!isDemoMortgage) {
			continue;
		}

		const borrowerLink =
			(await ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
				.first()) ?? null;
		if (!borrowerLink) {
			continue;
		}

		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
			.collect();
		const planEntries = allPlanEntries.filter(
			(entry) => entry.mortgageId === mortgage._id
		);
		const attempts = allAttempts.filter(
			(attempt) => attempt.mortgageId === mortgage._id
		);
		const workoutPlans = allWorkoutPlans.filter(
			(plan) => plan.mortgageId === mortgage._id
		);
		const planEntryIdsByDecision: DemoScenarioTargetRecord["planEntryIdsByDecision"] =
			{};
		for (const entry of planEntries) {
			if (!entry.balancePreCheckDecision) {
				continue;
			}
			const existing =
				planEntryIdsByDecision[entry.balancePreCheckDecision] ?? [];
			planEntryIdsByDecision[entry.balancePreCheckDecision] = [
				...existing,
				entry._id,
			];
		}

		const plannedEntries = planEntries
			.filter((entry) => entry.status === "planned")
			.sort((left, right) => left.scheduledDate - right.scheduledDate);
		const upcomingObligationIds = obligations
			.filter((obligation) => obligation.status === "upcoming")
			.sort((left, right) => left.dueDate - right.dueDate)
			.map((obligation) => obligation._id);
		const collectibleObligationIds = obligations
			.filter(
				(obligation) =>
					obligation.status === "upcoming" ||
					obligation.status === "due" ||
					obligation.status === "overdue" ||
					obligation.status === "partially_settled"
			)
			.map((obligation) => obligation._id);

		targets.set(property.streetAddress, {
			address: property.streetAddress,
			availableDraftWorkoutPlanId: workoutPlans
				.filter((plan) => plan.status === "draft")
				.sort((left, right) => right.updatedAt - left.updatedAt)[0]?._id,
			borrowerId: borrowerLink.borrowerId,
			city: property.city,
			collectibleObligationIds,
			mortgageId: mortgage._id,
			mortgageStatus: mortgage.status,
			nextPlannedEntry: plannedEntries[0]
				? {
						amount: plannedEntries[0].amount,
						method: plannedEntries[0].method,
						obligationIds: plannedEntries[0].obligationIds,
						planEntryId: plannedEntries[0]._id,
						scheduledDate: plannedEntries[0].scheduledDate,
					}
				: undefined,
			obligationStatusCounts: obligations.reduce<Record<string, number>>(
				(counts, obligation) => {
					counts[obligation.status] = (counts[obligation.status] ?? 0) + 1;
					return counts;
				},
				{}
			),
			paymentAmount: mortgage.paymentAmount,
			planEntryIdsByDecision,
			planEntryStatusCounts: planEntries.reduce<Record<string, number>>(
				(counts, entry) => {
					counts[entry.status] = (counts[entry.status] ?? 0) + 1;
					return counts;
				},
				{}
			),
			propertyLabel: createMortgageLabel(property),
			recentAttemptStatusCounts: attempts.reduce<Record<string, number>>(
				(counts, attempt) => {
					counts[attempt.status] = (counts[attempt.status] ?? 0) + 1;
					return counts;
				},
				{}
			),
			upcomingObligationIds,
			activeWorkoutPlanId: workoutPlans.find((plan) => plan.status === "active")
				?._id,
		});
	}

	return targets;
}

function buildWorkspaceOverviewResult(
	targets: Map<string, DemoScenarioTargetRecord>
): WorkspaceOverviewResult {
	const missingScenarioAddresses = DEMO_SCENARIOS.filter(
		(scenario) => !targets.has(scenario.streetAddress)
	).map((scenario) => scenario.streetAddress);

	const mortgages = uniqueIds(
		DEMO_SCENARIOS.map((scenario) => scenario.streetAddress)
	)
		.map((streetAddress) => targets.get(streetAddress))
		.filter(
			(target): target is DemoScenarioTargetRecord => target !== undefined
		)
		.map<DemoMortgageWorkspaceCard>((target) => ({
			activeWorkoutPlanId: target.activeWorkoutPlanId,
			address: target.address,
			attemptStatusCounts: target.recentAttemptStatusCounts,
			city: target.city,
			mortgageId: target.mortgageId,
			mortgageStatus: target.mortgageStatus,
			obligationStatusCounts: target.obligationStatusCounts,
			planEntryStatusCounts: target.planEntryStatusCounts,
			propertyLabel: target.propertyLabel,
			scenarioKeys: DEMO_SCENARIOS.filter(
				(scenario) => scenario.streetAddress === target.address
			).map((scenario) => scenario.key),
		}));

	const scenarios = DEMO_SCENARIOS.map<ScenarioOverviewCard>((scenario) => {
		const target = targets.get(scenario.streetAddress);
		return {
			description: scenario.description,
			href: getScenarioHref(scenario.key, target?.mortgageId),
			key: scenario.key,
			mortgageId: target?.mortgageId,
			ready: buildScenarioReadiness({
				scenarioKey: scenario.key,
				target,
			}),
			title: scenario.title,
			tone: scenario.tone,
		};
	});

	return {
		isSeeded: missingScenarioAddresses.length === 0,
		missingScenarioAddresses,
		mortgages,
		scenarios,
		workspaceStats: {
			mortgageCount: mortgages.length,
			planEntryCount: mortgages.reduce(
				(total, mortgage) => total + sumCounts(mortgage.planEntryStatusCounts),
				0
			),
			attemptCount: mortgages.reduce(
				(total, mortgage) => total + sumCounts(mortgage.attemptStatusCounts),
				0
			),
			readyScenarioCount: scenarios.filter((scenario) => scenario.ready).length,
		},
	};
}

export const getWorkspaceOverviewInternal = convex
	.query()
	.input({})
	.handler(async (ctx): Promise<WorkspaceOverviewResult> => {
		const targets = await loadDemoScenarioTargets(ctx);
		return buildWorkspaceOverviewResult(targets);
	})
	.internal();

async function upsertBalanceRule(args: {
	blockingDecision: "require_operator_review" | "suppress";
	code: string;
	ctx: MutationCtx;
	description: string;
	displayName: string;
	mortgageId: Id<"mortgages">;
	priority: number;
}) {
	return upsertCollectionRuleByCode({
		actorId: DEMO_SOURCE.actorId,
		code: args.code,
		config:
			args.blockingDecision === "suppress"
				? {
						kind: "balance_pre_check",
						signalSource: "recent_transfer_failures",
						lookbackDays: 21,
						failureCountThreshold: 1,
						blockingDecision: "suppress",
					}
				: {
						kind: "balance_pre_check",
						signalSource: "recent_transfer_failures",
						lookbackDays: 21,
						failureCountThreshold: 1,
						blockingDecision: "require_operator_review",
					},
		ctx: args.ctx,
		description: args.description,
		displayName: args.displayName,
		kind: "balance_pre_check",
		priority: args.priority,
		scope: {
			scopeType: "mortgage",
			mortgageId: args.mortgageId,
		},
		status: "active",
	});
}

export const ensureDemoRulesInternal = convex
	.mutation()
	.input({
		reviewMortgageId: v.id("mortgages"),
		suppressMortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const reviewRuleId = await upsertBalanceRule({
			blockingDecision: "require_operator_review",
			code: "demo_review_required_rule",
			ctx,
			description:
				"Demo-only mortgage-scoped rule that escalates collection to operator review.",
			displayName: "Demo operator review",
			mortgageId: args.reviewMortgageId,
			priority: 12,
		});
		const suppressRuleId = await upsertBalanceRule({
			blockingDecision: "suppress",
			code: "demo_suppress_rule",
			ctx,
			description:
				"Demo-only mortgage-scoped rule that suppresses execution when recent balance-risk signals are present.",
			displayName: "Demo suppress execution",
			mortgageId: args.suppressMortgageId,
			priority: 13,
		});

		return { reviewRuleId, suppressRuleId };
	})
	.internal();

export const seedFailedInboundSignalInternal = convex
	.mutation()
	.input({
		borrowerId: v.id("borrowers"),
		mortgageId: v.id("mortgages"),
		reasonKey: v.union(v.literal("review_required"), v.literal("suppress")),
	})
	.handler(async (ctx, args) => {
		const idempotencyKey = buildDemoSignalIdempotencyKey(args);
		const existing = await ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", idempotencyKey)
			)
			.first();
		if (existing?.status === "failed") {
			return existing._id;
		}

		const transferId =
			existing?._id ??
			(await createTransferRequestRecord(ctx, {
				amount: 1,
				borrowerId: args.borrowerId,
				counterpartyId: `${args.borrowerId}`,
				counterpartyType: "borrower",
				direction: "inbound",
				idempotencyKey,
				mortgageId: args.mortgageId,
				providerCode: "manual",
				source: DEMO_SOURCE,
				transferType: "borrower_interest_collection",
			}));

		const transfer = await ctx.db.get(transferId);
		if (!transfer) {
			throw new ConvexError(`Signal transfer not found: ${transferId}`);
		}

		if (transfer.status === "initiated") {
			await executeTransition(ctx, {
				entityType: "transfer",
				entityId: `${transferId}`,
				eventType: "PROVIDER_INITIATED",
				payload: {
					providerRef: `demo_signal_${args.reasonKey}_${args.borrowerId}`,
				},
				source: DEMO_SOURCE,
			});
		}

		if (transfer.status !== "failed") {
			await executeTransition(ctx, {
				entityType: "transfer",
				entityId: `${transferId}`,
				eventType: "TRANSFER_FAILED",
				payload: {
					errorCode: "NSF",
					reason: "insufficient_funds",
				},
				source: DEMO_SOURCE,
			});
		}

		return transferId;
	})
	.internal();

export const getRetryScenarioSeedContextInternal = convex
	.query()
	.input({
		planEntryId: v.id("collectionPlanEntries"),
	})
	.handler(async (ctx, args) => {
		const [existingRetryEntry, existingAttempts, planEntry] = await Promise.all(
			[
				ctx.db
					.query("collectionPlanEntries")
					.withIndex("by_retry_of", (q) =>
						q.eq("retryOfId", args.planEntryId).eq("source", "retry_rule")
					)
					.first(),
				ctx.db
					.query("collectionAttempts")
					.withIndex("by_plan_entry", (q) =>
						q.eq("planEntryId", args.planEntryId)
					)
					.collect(),
				ctx.db.get(args.planEntryId),
			]
		);

		if (!planEntry) {
			return null;
		}

		const primaryObligationId = planEntry.obligationIds[0];
		const primaryObligation = primaryObligationId
			? await ctx.db.get(primaryObligationId)
			: null;

		return {
			existingAttemptCount: existingAttempts.length,
			existingRetryPlanEntryId: existingRetryEntry?._id,
			planEntry: {
				amount: planEntry.amount,
				method: planEntry.method,
				mortgageId: planEntry.mortgageId,
				obligationIds: planEntry.obligationIds,
				planEntryId: planEntry._id,
			},
			primaryObligation: primaryObligation
				? {
						borrowerId: primaryObligation.borrowerId,
						obligationId: primaryObligation._id,
						type: primaryObligation.type,
					}
				: null,
		};
	})
	.internal();

export const seedRetryScenarioInternal = convex
	.action()
	.input({
		planEntryId: v.id("collectionPlanEntries"),
	})
	.handler(async (ctx, args): Promise<RetryScenarioSeedResult> => {
		const seedContext = await ctx.runQuery(
			getRetryScenarioSeedContextQueryRef,
			{
				planEntryId: args.planEntryId,
			}
		);
		if (!seedContext) {
			throw new ConvexError(`Plan entry not found: ${args.planEntryId}`);
		}

		if (seedContext.existingRetryPlanEntryId) {
			return {
				outcome: "already_seeded" as const,
				retryPlanEntryId: seedContext.existingRetryPlanEntryId,
			};
		}

		if (seedContext.existingAttemptCount > 0) {
			return {
				outcome: "already_seeded" as const,
			};
		}

		if (!seedContext.primaryObligation?.borrowerId) {
			throw new ConvexError(
				`Retry demo obligation for ${args.planEntryId} is missing borrower context`
			);
		}

		const executionResult = await ctx.runAction(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId: args.planEntryId,
				triggerSource: "migration_backfill",
				requestedAt: Date.now(),
				idempotencyKey: buildDemoRetryExecutionIdempotencyKey(args.planEntryId),
				requestedByActorType: "system",
				requestedByActorId: DEMO_SOURCE.actorId,
				reason: "Demo-seeded failure and retry scenario",
			}
		);

		if (
			(executionResult.outcome !== "attempt_created" &&
				executionResult.outcome !== "already_executed") ||
			!("transferRequestId" in executionResult) ||
			!executionResult.transferRequestId
		) {
			throw new ConvexError(
				`Retry scenario could not create a canonical transfer for ${args.planEntryId}.`
			);
		}

		await ctx.runMutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "transfer",
				entityId: executionResult.transferRequestId,
				eventType: "TRANSFER_FAILED",
				payload: {
					errorCode: "NSF",
					reason: "Insufficient funds",
				},
				source: DEMO_SOURCE,
			}
		);

		return {
			attemptId: executionResult.collectionAttemptId,
			outcome: "seeded" as const,
		};
	})
	.internal();

function buildWorkoutInstallments(target: DemoScenarioTargetRecord): {
	installments: {
		amount?: number;
		method: string;
		obligationIds: Id<"obligations">[];
		scheduledDate: number;
	}[];
} | null {
	const coveredObligationIds =
		target.upcomingObligationIds.length > 0
			? target.upcomingObligationIds
			: target.collectibleObligationIds;

	if (coveredObligationIds.length === 0) {
		return null;
	}

	const [first, ...rest] = coveredObligationIds;
	const baseDate = Date.now();

	const installments = [
		{
			obligationIds: [first],
			method: "manual",
			scheduledDate: baseDate + 7 * MS_PER_DAY,
		},
	];

	if (rest.length > 0) {
		installments.push({
			obligationIds: rest,
			method: "manual",
			scheduledDate: baseDate + 21 * MS_PER_DAY,
		});
	}

	return { installments };
}

async function loadRequiredDemoTargets(
	ctx: Pick<DemoWorkspaceActionCtx, "runQuery">
): Promise<RequiredDemoTargets> {
	const [reviewRequired, suppress, retry] = await Promise.all([
		ctx.runQuery(internal.demo.amps.getDemoTargetByAddressInternal, {
			streetAddress: "12 Garden Ave",
		}),
		ctx.runQuery(internal.demo.amps.getDemoTargetByAddressInternal, {
			streetAddress: "18 Maple Grove Rd",
		}),
		ctx.runQuery(internal.demo.amps.getDemoTargetByAddressInternal, {
			streetAddress: "44 Front St E",
		}),
	]);

	if (!(reviewRequired && suppress && retry)) {
		throw new ConvexError(
			"AMPS demo mortgages are missing. Run seedAll and verify the canonical seed fixtures are present."
		);
	}

	return { retry, reviewRequired, suppress };
}

async function ensureDemoDecisionScenario(
	ctx: DemoWorkspaceActionCtx,
	definition: DemoDecisionScenarioDefinition,
	target: DemoScenarioTargetRecord
) {
	const isReady =
		(target.planEntryIdsByDecision[definition.readyDecision]?.length ?? 0) > 0;
	if (isReady) {
		return;
	}

	await ctx.runMutation(internal.demo.amps.seedFailedInboundSignalInternal, {
		borrowerId: target.borrowerId,
		mortgageId: target.mortgageId,
		reasonKey: definition.reasonKey,
	});

	const planEntry = target.nextPlannedEntry;
	if (!planEntry) {
		return;
	}

	await ctx.runAction(
		internal.payments.collectionPlan.execution.executePlanEntry,
		{
			planEntryId: planEntry.planEntryId,
			triggerSource: "admin_manual",
			requestedAt: Date.now(),
			idempotencyKey: `${definition.idempotencyPrefix}:${planEntry.planEntryId}`,
			requestedByActorType: "admin",
			requestedByActorId: ctx.viewer.authId,
			reason: definition.reason,
		}
	);
}

async function ensureDemoRetryScenario(
	ctx: Pick<DemoWorkspaceActionCtx, "runAction">,
	target: DemoScenarioTargetRecord
) {
	const retryEntryCount = target.planEntryStatusCounts.planned ?? 0;
	const permanentFailCount =
		target.recentAttemptStatusCounts.permanent_fail ?? 0;
	if (permanentFailCount > 0 && retryEntryCount > 0) {
		return;
	}

	const planEntry = target.nextPlannedEntry;
	if (!planEntry) {
		return;
	}

	await ctx.runAction(internal.demo.amps.seedRetryScenarioInternal, {
		planEntryId: planEntry.planEntryId,
	});
	await ctx.runAction(internal.payments.collectionPlan.engine.evaluateRules, {
		trigger: "event",
		mortgageId: target.mortgageId,
		eventType: "COLLECTION_FAILED",
		eventPayload: {
			amount: planEntry.amount,
			method: planEntry.method,
			obligationIds: planEntry.obligationIds,
			planEntryId: planEntry.planEntryId,
			retryCount: 1,
		},
	});
}

async function ensureDemoWorkoutScenario(
	ctx: DemoWorkspaceActionCtx,
	target: DemoScenarioTargetRecord
) {
	if (target.activeWorkoutPlanId !== undefined) {
		return;
	}

	if (target.availableDraftWorkoutPlanId) {
		await ctx.runAction(api.payments.collectionPlan.admin.activateWorkoutPlan, {
			workoutPlanId: target.availableDraftWorkoutPlanId,
		});
		return;
	}

	const workoutStrategy = buildWorkoutInstallments(target);
	if (!workoutStrategy) {
		return;
	}

	const created = await ctx.runAction(
		api.payments.collectionPlan.admin.createWorkoutPlan,
		{
			mortgageId: target.mortgageId,
			name: "Demo hardship extension",
			rationale:
				"Demo-only workout that shows strategy supersession without mutating obligation truth.",
			installments: workoutStrategy.installments,
		}
	);
	if (created.outcome !== "created") {
		return;
	}

	await ctx.runAction(api.payments.collectionPlan.admin.activateWorkoutPlan, {
		workoutPlanId: created.workoutPlanId,
	});
}

async function ensureDemoWorkspaceScenarios(
	ctx: DemoWorkspaceActionCtx,
	targets: RequiredDemoTargets
) {
	await ctx.runMutation(internal.demo.amps.ensureDemoRulesInternal, {
		reviewMortgageId: targets.reviewRequired.mortgageId,
		suppressMortgageId: targets.suppress.mortgageId,
	});

	for (const definition of DEMO_DECISION_SCENARIOS) {
		await ensureDemoDecisionScenario(
			ctx,
			definition,
			targets[definition.targetKey]
		);
	}

	await ensureDemoRetryScenario(ctx, targets.retry);
	await ensureDemoWorkoutScenario(ctx, targets.reviewRequired);
}

export const prepareWorkspace = adminAction
	.input({})
	.handler(async (ctx): Promise<WorkspaceOverviewResult> => {
		await ctx.runAction(seedAllActionRef, {});
		const targets = await loadRequiredDemoTargets(ctx);
		await ensureDemoWorkspaceScenarios(ctx, targets);

		return ctx.runQuery(internal.demo.amps.getWorkspaceOverviewInternal, {});
	})
	.public();

export const getDemoTargetByAddressInternal = convex
	.query()
	.input({
		streetAddress: v.string(),
	})
	.handler(async (ctx, args): Promise<DemoScenarioTargetRecord | undefined> => {
		const targets = await loadDemoScenarioTargets(ctx);
		return targets.get(args.streetAddress);
	})
	.internal();

export const getWorkspaceOverview = adminQuery
	.input({})
	.handler(async (ctx): Promise<WorkspaceOverviewResult> => {
		const targets = await loadDemoScenarioTargets(ctx);
		return buildWorkspaceOverviewResult(targets);
	})
	.public();

export const getMortgageWorkspace = adminQuery
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args): Promise<MortgageWorkspaceResult | null> => {
		const mortgage = await ctx.db.get(args.mortgageId);
		if (!mortgage) {
			return null;
		}

		const property = await ctx.db.get(mortgage.propertyId);
		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
		const scenarioKeys = DEMO_SCENARIOS.filter(
			(scenario) => scenario.streetAddress === property?.streetAddress
		).map((scenario) => scenario.key);

		return {
			mortgage: {
				city: property?.city ?? "Unknown city",
				firstPaymentDate: mortgage.firstPaymentDate,
				interestRate: mortgage.interestRate,
				label: property
					? createMortgageLabel(property)
					: `Mortgage ${String(mortgage._id)}`,
				maturityDate: mortgage.maturityDate,
				mortgageId: mortgage._id,
				paymentAmount: mortgage.paymentAmount,
				paymentFrequency: mortgage.paymentFrequency,
				principal: mortgage.principal,
				status: mortgage.status,
				streetAddress: property?.streetAddress ?? "Unknown address",
			},
			obligations: obligations
				.sort((left, right) => left.paymentNumber - right.paymentNumber)
				.map((obligation) => ({
					amount: obligation.amount,
					amountSettled: obligation.amountSettled ?? 0,
					dueDate: obligation.dueDate,
					gracePeriodEnd: obligation.gracePeriodEnd,
					obligationId: obligation._id,
					paymentNumber: obligation.paymentNumber,
					settledAt: obligation.settledAt,
					sourceObligationId: obligation.sourceObligationId,
					status: obligation.status,
					type: obligation.type,
				})),
			scenarioKeys,
		};
	})
	.public();
