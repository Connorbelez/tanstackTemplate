import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { executeTransition } from "../engine/transition";
import { adminAction, adminQuery, convex } from "../fluent";
import {
	obligationTypeToTransferType,
	PROVIDER_CODES,
	type ProviderCode,
} from "../payments/transfers/types";

const MS_PER_DAY = 86_400_000;

function mapMethodToProviderCode(method: string): ProviderCode {
	return (PROVIDER_CODES as readonly string[]).includes(method)
		? (method as ProviderCode)
		: "manual";
}

const seedAllActionRef = makeFunctionReference<"action">(
	"seed/seedAll:seedAll"
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
	const existing = await args.ctx.db
		.query("collectionRules")
		.withIndex("by_code", (q) => q.eq("code", args.code))
		.first();

	const now = Date.now();
	const patch = {
		kind: "balance_pre_check" as const,
		code: args.code,
		displayName: args.displayName,
		description: args.description,
		trigger: "event" as const,
		status: "active" as const,
		scope: {
			scopeType: "mortgage" as const,
			mortgageId: args.mortgageId,
		},
		config:
			args.blockingDecision === "suppress"
				? {
						kind: "balance_pre_check" as const,
						signalSource: "recent_transfer_failures" as const,
						lookbackDays: 21,
						failureCountThreshold: 1,
						blockingDecision: "suppress" as const,
					}
				: {
						kind: "balance_pre_check" as const,
						signalSource: "recent_transfer_failures" as const,
						lookbackDays: 21,
						failureCountThreshold: 1,
						blockingDecision: "require_operator_review" as const,
					},
		version: 1,
		priority: args.priority,
		updatedAt: now,
		updatedByActorId: "system:demo-amps",
	};

	if (existing) {
		await args.ctx.db.patch(existing._id, patch);
		return existing._id;
	}

	return args.ctx.db.insert("collectionRules", {
		...patch,
		createdAt: now,
		createdByActorId: "system:demo-amps",
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
		const existing = await ctx.db
			.query("transferRequests")
			.withIndex("by_counterparty_status", (q) =>
				q
					.eq("counterpartyType", "borrower")
					.eq("counterpartyId", `${args.borrowerId}`)
					.eq("status", "failed")
			)
			.collect();

		const matching = existing.find(
			(transfer) =>
				transfer.direction === "inbound" &&
				transfer.mortgageId === args.mortgageId &&
				transfer.idempotencyKey ===
					`demo-amps:${args.reasonKey}:${args.mortgageId}:${args.borrowerId}`
		);
		if (matching) {
			return matching._id;
		}

		const createdAt = Date.now();
		return ctx.db.insert("transferRequests", {
			status: "failed",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 1,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: `${args.borrowerId}`,
			providerCode: "manual",
			idempotencyKey: `demo-amps:${args.reasonKey}:${args.mortgageId}:${args.borrowerId}`,
			source: { channel: "scheduler", actorType: "system" },
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			createdAt,
			lastTransitionAt: createdAt,
			failedAt: createdAt,
			failureCode: "NSF",
			failureReason: "insufficient_funds",
		});
	})
	.internal();

export const seedRetryScenarioInternal = convex
	.mutation()
	.input({
		planEntryId: v.id("collectionPlanEntries"),
	})
	.handler(async (ctx, args) => {
		const existingRetryEntry = await ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_retry_of", (q) =>
				q.eq("retryOfId", args.planEntryId).eq("source", "retry_rule")
			)
			.first();
		if (existingRetryEntry) {
			return {
				outcome: "already_seeded" as const,
				retryPlanEntryId: existingRetryEntry._id,
			};
		}

		const existingAttempts = await ctx.db
			.query("collectionAttempts")
			.withIndex("by_plan_entry", (q) => q.eq("planEntryId", args.planEntryId))
			.collect();
		if (existingAttempts.length > 0) {
			return {
				outcome: "already_seeded" as const,
			};
		}

		const planEntry = await ctx.db.get(args.planEntryId);
		if (!planEntry) {
			throw new ConvexError(`Plan entry not found: ${args.planEntryId}`);
		}
		const primaryObligationId = planEntry.obligationIds[0];
		if (!primaryObligationId) {
			throw new ConvexError(
				`Retry demo plan entry ${args.planEntryId} has no obligations`
			);
		}
		const primaryObligation = await ctx.db.get(primaryObligationId);
		if (!primaryObligation?.borrowerId) {
			throw new ConvexError(
				`Retry demo obligation ${primaryObligationId} is missing borrower context`
			);
		}

		const attemptId = await ctx.db.insert("collectionAttempts", {
			status: "initiated",
			machineContext: {
				attemptId: "",
				retryCount: 0,
				maxRetries: 3,
			},
			planEntryId: planEntry._id,
			mortgageId: planEntry.mortgageId,
			obligationIds: planEntry.obligationIds,
			method: planEntry.method,
			amount: planEntry.amount,
			triggerSource: "migration_backfill",
			executionRequestedAt: Date.now(),
			executionIdempotencyKey: `demo-amps:retry:${planEntry._id}`,
			requestedByActorType: "system",
			requestedByActorId: "system:demo-amps",
			executionReason: "Demo-seeded failure and retry scenario",
			initiatedAt: Date.now(),
		});
		await ctx.db.patch(attemptId, {
			machineContext: {
				attemptId: `${attemptId}`,
				retryCount: 3,
				maxRetries: 3,
			},
		});
		const transferId = await ctx.db.insert("transferRequests", {
			status: "initiated",
			direction: "inbound",
			transferType: obligationTypeToTransferType(primaryObligation.type),
			amount: planEntry.amount,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: `${primaryObligation.borrowerId}`,
			providerCode: mapMethodToProviderCode(planEntry.method),
			idempotencyKey: `demo-amps:retry-transfer:${planEntry._id}`,
			source: { channel: "scheduler", actorType: "system" },
			mortgageId: planEntry.mortgageId,
			obligationId: primaryObligationId,
			planEntryId: planEntry._id,
			collectionAttemptId: attemptId,
			borrowerId: primaryObligation.borrowerId,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		});
		await ctx.db.patch(attemptId, {
			transferRequestId: transferId,
		});
		await ctx.db.patch(planEntry._id, {
			status: "executing",
			collectionAttemptId: attemptId,
			executedAt: Date.now(),
			executionIdempotencyKey: `demo-amps:retry:${planEntry._id}`,
		});

		const source = {
			actorType: "system" as const,
			channel: "scheduler" as const,
		};
		await executeTransition(ctx, {
			entityType: "transfer",
			entityId: `${transferId}`,
			eventType: "PROVIDER_INITIATED",
			payload: {
				providerRef: `demo_retry_${attemptId}`,
			},
			source,
		});
		await executeTransition(ctx, {
			entityType: "transfer",
			entityId: `${transferId}`,
			eventType: "TRANSFER_FAILED",
			payload: {
				reason: "Insufficient funds",
				errorCode: "NSF",
			},
			source,
		});

		return {
			attemptId,
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

export const prepareWorkspace = adminAction
	.input({})
	.handler(async (ctx): Promise<WorkspaceOverviewResult> => {
		await ctx.runAction(seedAllActionRef, {});

		const reviewTarget = await ctx.runQuery(
			internal.demo.amps.getDemoTargetByAddressInternal,
			{
				streetAddress: "12 Garden Ave",
			}
		);
		const suppressTarget = await ctx.runQuery(
			internal.demo.amps.getDemoTargetByAddressInternal,
			{
				streetAddress: "18 Maple Grove Rd",
			}
		);
		const retryTarget = await ctx.runQuery(
			internal.demo.amps.getDemoTargetByAddressInternal,
			{
				streetAddress: "44 Front St E",
			}
		);

		if (!(reviewTarget && suppressTarget && retryTarget)) {
			throw new ConvexError(
				"AMPS demo mortgages are missing. Run seedAll and verify the canonical seed fixtures are present."
			);
		}

		await ctx.runMutation(internal.demo.amps.ensureDemoRulesInternal, {
			reviewMortgageId: reviewTarget.mortgageId,
			suppressMortgageId: suppressTarget.mortgageId,
		});

		const reviewReady =
			(reviewTarget.planEntryIdsByDecision.require_operator_review?.length ??
				0) > 0;
		if (!reviewReady) {
			await ctx.runMutation(
				internal.demo.amps.seedFailedInboundSignalInternal,
				{
					borrowerId: reviewTarget.borrowerId,
					mortgageId: reviewTarget.mortgageId,
					reasonKey: "review_required",
				}
			);
			const planEntry = reviewTarget.nextPlannedEntry;
			if (planEntry) {
				await ctx.runAction(
					internal.payments.collectionPlan.execution.executePlanEntry,
					{
						planEntryId: planEntry.planEntryId,
						triggerSource: "admin_manual",
						requestedAt: Date.now(),
						idempotencyKey: `demo-amps:review:${planEntry.planEntryId}`,
						requestedByActorType: "admin",
						requestedByActorId: ctx.viewer.authId,
						reason: "Prepare AMPS demo review-required scenario",
					}
				);
			}
		}

		const suppressReady =
			(suppressTarget.planEntryIdsByDecision.suppress?.length ?? 0) > 0;
		if (!suppressReady) {
			await ctx.runMutation(
				internal.demo.amps.seedFailedInboundSignalInternal,
				{
					borrowerId: suppressTarget.borrowerId,
					mortgageId: suppressTarget.mortgageId,
					reasonKey: "suppress",
				}
			);
			const planEntry = suppressTarget.nextPlannedEntry;
			if (planEntry) {
				await ctx.runAction(
					internal.payments.collectionPlan.execution.executePlanEntry,
					{
						planEntryId: planEntry.planEntryId,
						triggerSource: "admin_manual",
						requestedAt: Date.now(),
						idempotencyKey: `demo-amps:suppress:${planEntry.planEntryId}`,
						requestedByActorType: "admin",
						requestedByActorId: ctx.viewer.authId,
						reason: "Prepare AMPS demo suppress scenario",
					}
				);
			}
		}

		const retryEntryCount = retryTarget.planEntryStatusCounts.planned ?? 0;
		const permanentFailCount =
			retryTarget.recentAttemptStatusCounts.permanent_fail ?? 0;
		if (permanentFailCount === 0 || retryEntryCount === 0) {
			const planEntry = retryTarget.nextPlannedEntry;
			if (planEntry) {
				await ctx.runMutation(internal.demo.amps.seedRetryScenarioInternal, {
					planEntryId: planEntry.planEntryId,
				});
				await ctx.runAction(
					internal.payments.collectionPlan.engine.evaluateRules,
					{
						trigger: "event",
						mortgageId: retryTarget.mortgageId,
						eventType: "COLLECTION_FAILED",
						eventPayload: {
							amount: planEntry.amount,
							method: planEntry.method,
							obligationIds: planEntry.obligationIds,
							planEntryId: planEntry.planEntryId,
							retryCount: 1,
						},
					}
				);
			}
		}

		if (reviewTarget.activeWorkoutPlanId === undefined) {
			if (reviewTarget.availableDraftWorkoutPlanId) {
				await ctx.runAction(
					api.payments.collectionPlan.admin.activateWorkoutPlan,
					{
						workoutPlanId: reviewTarget.availableDraftWorkoutPlanId,
					}
				);
			} else {
				const workoutStrategy = buildWorkoutInstallments(reviewTarget);
				if (workoutStrategy) {
					const created = await ctx.runAction(
						api.payments.collectionPlan.admin.createWorkoutPlan,
						{
							mortgageId: reviewTarget.mortgageId,
							name: "Demo hardship extension",
							rationale:
								"Demo-only workout that shows strategy supersession without mutating obligation truth.",
							installments: workoutStrategy.installments,
						}
					);
					if (created.outcome === "created") {
						await ctx.runAction(
							api.payments.collectionPlan.admin.activateWorkoutPlan,
							{
								workoutPlanId: created.workoutPlanId,
							}
						);
					}
				}
			}
		}

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
