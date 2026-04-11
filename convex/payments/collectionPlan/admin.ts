import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { auditLog } from "../../auditLog";
import { adminAction, adminMutation, adminQuery } from "../../fluent";
import type { ExecutePlanEntryResult } from "./executionContract";
import {
	buildCollectionAttemptRow,
	buildCollectionPlanEntryRow,
	buildCollectionRuleRow,
	type CollectionAttemptRow,
	type CollectionPlanEntryRow,
	type CollectionRuleRow,
} from "./readModels";
import type { ReschedulePlanEntryResult } from "./reschedule";
import {
	type CollectionRuleKind,
	type CollectionRuleStatus,
	collectionRuleConfigValidator,
	collectionRuleKindValidator,
	collectionRuleStatusValidator,
	compareCollectionRules,
	matchesCollectionRuleScope,
} from "./ruleContract";
import type {
	ActivateWorkoutPlanResult,
	CancelWorkoutPlanResult,
	CompleteWorkoutPlanResult,
	CreateWorkoutPlanResult,
} from "./workout";
import { workoutPlanInstallmentInputValidator } from "./workoutContract";

const collectionPlanEntryStatusValidator = v.union(
	v.literal("planned"),
	v.literal("provider_scheduled"),
	v.literal("executing"),
	v.literal("completed"),
	v.literal("cancelled"),
	v.literal("rescheduled")
);

const collectionPlanEntrySourceValidator = v.union(
	v.literal("default_schedule"),
	v.literal("retry_rule"),
	v.literal("late_fee_rule"),
	v.literal("admin"),
	v.literal("admin_reschedule"),
	v.literal("admin_workout")
);

const ruleScopeInputValidator = v.optional(
	v.union(
		v.object({
			scopeType: v.literal("global"),
		}),
		v.object({
			scopeType: v.literal("mortgage"),
			mortgageId: v.id("mortgages"),
		})
	)
);

type RuleMutationReasonCode =
	| "config_kind_mismatch"
	| "duplicate_rule_code"
	| "invalid_code"
	| "invalid_description"
	| "invalid_display_name"
	| "invalid_effective_window"
	| "invalid_priority"
	| "rule_not_found";

type CreateCollectionRuleResult =
	| {
			outcome: "created";
			requestedAt: number;
			ruleId: Id<"collectionRules">;
			statusAfter: CollectionRuleStatus;
	  }
	| {
			outcome: "rejected";
			reasonCode: RuleMutationReasonCode;
			reasonDetail: string;
			requestedAt: number;
	  };

type UpdateCollectionRuleResult =
	| {
			outcome: "updated";
			requestedAt: number;
			ruleId: Id<"collectionRules">;
			statusAfter: CollectionRuleStatus;
	  }
	| {
			outcome: "rejected";
			reasonCode: RuleMutationReasonCode;
			reasonDetail: string;
			requestedAt: number;
			ruleId: Id<"collectionRules">;
	  };

function boundedLimit(limit: number | undefined, fallback = 25, max = 100) {
	return Math.max(1, Math.min(limit ?? fallback, max));
}

function trimOptional(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function deriveRuleTrigger(kind: CollectionRuleKind): "event" | "schedule" {
	return kind === "schedule" ? "schedule" : "event";
}

function validateRulePriority(priority: number) {
	return (
		Number.isFinite(priority) && Number.isInteger(priority) && priority >= 0
	);
}

function validateRuleWindow(args: {
	effectiveFrom?: number;
	effectiveTo?: number;
}) {
	if (
		args.effectiveFrom !== undefined &&
		!(
			Number.isFinite(args.effectiveFrom) &&
			Number.isInteger(args.effectiveFrom)
		)
	) {
		return {
			reasonCode: "invalid_effective_window" as const,
			reasonDetail: "effectiveFrom must be an integer timestamp when provided.",
		};
	}

	if (
		args.effectiveTo !== undefined &&
		!(Number.isFinite(args.effectiveTo) && Number.isInteger(args.effectiveTo))
	) {
		return {
			reasonCode: "invalid_effective_window" as const,
			reasonDetail: "effectiveTo must be an integer timestamp when provided.",
		};
	}

	if (
		args.effectiveFrom !== undefined &&
		args.effectiveTo !== undefined &&
		args.effectiveTo < args.effectiveFrom
	) {
		return {
			reasonCode: "invalid_effective_window" as const,
			reasonDetail:
				"effectiveTo must be greater than or equal to effectiveFrom.",
		};
	}

	return null;
}

async function logCollectionRuleAudit(args: {
	action: "collection_rule.created" | "collection_rule.updated";
	actorId: string;
	ctx: Parameters<typeof auditLog.log>[0];
	metadata: Record<string, unknown>;
	ruleId: Id<"collectionRules">;
	severity: "info" | "warning";
}) {
	await auditLog.log(args.ctx, {
		action: args.action,
		actorId: args.actorId,
		resourceType: "collectionRules",
		resourceId: `${args.ruleId}`,
		severity: args.severity,
		metadata: args.metadata,
	});
}

export const listCollectionRules = adminQuery
	.input({
		kind: v.optional(collectionRuleKindValidator),
		limit: v.optional(v.number()),
		mortgageId: v.optional(v.id("mortgages")),
		status: v.optional(collectionRuleStatusValidator),
	})
	.handler(async (ctx, args): Promise<CollectionRuleRow[]> => {
		const rules = await ctx.db.query("collectionRules").collect();
		const limit = boundedLimit(args.limit, 50, 200);

		return rules
			.filter((rule) => (args.kind ? rule.kind === args.kind : true))
			.filter((rule) => (args.status ? rule.status === args.status : true))
			.filter((rule) =>
				args.mortgageId
					? matchesCollectionRuleScope(rule, args.mortgageId)
					: true
			)
			.sort(compareCollectionRules)
			.slice(0, limit)
			.map((rule) => buildCollectionRuleRow(rule));
	})
	.public();

export const getCollectionRule = adminQuery
	.input({
		ruleId: v.id("collectionRules"),
	})
	.handler(async (ctx, args) => {
		const rule = await ctx.db.get(args.ruleId);
		if (!rule) {
			return null;
		}

		const [relatedPlanEntries, auditEvents] = await Promise.all([
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_created_by_rule", (q) =>
					q.eq("createdByRuleId", args.ruleId)
				)
				.collect(),
			auditLog.queryByResource(ctx, {
				resourceType: "collectionRules",
				resourceId: `${args.ruleId}`,
				limit: 25,
			}),
		]);

		const sortedRelatedPlanEntries = relatedPlanEntries.sort(
			(left, right) => right.createdAt - left.createdAt
		);

		return {
			rule: buildCollectionRuleRow(rule),
			relatedPlanEntryCount: relatedPlanEntries.length,
			relatedPlanEntries: await Promise.all(
				sortedRelatedPlanEntries
					.slice(0, 25)
					.map((entry) => buildCollectionPlanEntryRow(ctx, entry))
			),
			auditEvents,
		};
	})
	.public();

export const listCollectionPlanEntries = adminQuery
	.input({
		includeSuperseded: v.optional(v.boolean()),
		limit: v.optional(v.number()),
		mortgageId: v.optional(v.id("mortgages")),
		source: v.optional(collectionPlanEntrySourceValidator),
		status: v.optional(collectionPlanEntryStatusValidator),
		workoutPlanId: v.optional(v.id("workoutPlans")),
	})
	.handler(async (ctx, args): Promise<CollectionPlanEntryRow[]> => {
		const limit = boundedLimit(args.limit, 50, 200);
		let entries: Doc<"collectionPlanEntries">[] = [];

		if (args.mortgageId && args.status) {
			const mortgageId = args.mortgageId;
			const status = args.status;
			entries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (q) =>
					q.eq("mortgageId", mortgageId).eq("status", status)
				)
				.collect();
		} else if (args.status) {
			const status = args.status;
			entries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect();
		} else {
			entries = await ctx.db.query("collectionPlanEntries").collect();
		}

		return await Promise.all(
			entries
				.filter((entry) =>
					args.mortgageId ? entry.mortgageId === args.mortgageId : true
				)
				.filter((entry) => (args.source ? entry.source === args.source : true))
				.filter((entry) =>
					args.workoutPlanId ? entry.workoutPlanId === args.workoutPlanId : true
				)
				.filter((entry) =>
					args.includeSuperseded === false
						? entry.supersededByWorkoutPlanId === undefined
						: true
				)
				.sort((left, right) => right.scheduledDate - left.scheduledDate)
				.slice(0, limit)
				.map((entry) => buildCollectionPlanEntryRow(ctx, entry))
		);
	})
	.public();

export const getCollectionPlanEntry = adminQuery
	.input({
		planEntryId: v.id("collectionPlanEntries"),
	})
	.handler(async (ctx, args) => {
		const planEntry = await ctx.db.get(args.planEntryId);
		if (!planEntry) {
			return null;
		}

		const [
			auditEvents,
			retryChildren,
			rescheduleChildren,
			supersedingWorkoutPlan,
		] = await Promise.all([
			auditLog.queryByResource(ctx, {
				resourceType: "collectionPlanEntries",
				resourceId: `${args.planEntryId}`,
				limit: 25,
			}),
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_retry_of", (q) =>
					q.eq("retryOfId", args.planEntryId).eq("source", "retry_rule")
				)
				.collect(),
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_rescheduled_from", (q) =>
					q.eq("rescheduledFromId", args.planEntryId)
				)
				.collect(),
			planEntry.supersededByWorkoutPlanId
				? ctx.db.get(planEntry.supersededByWorkoutPlanId)
				: null,
		]);

		return {
			planEntry: await buildCollectionPlanEntryRow(ctx, planEntry),
			retryChildren: await Promise.all(
				retryChildren.map((entry) => buildCollectionPlanEntryRow(ctx, entry))
			),
			rescheduleChildren: await Promise.all(
				rescheduleChildren.map((entry) =>
					buildCollectionPlanEntryRow(ctx, entry)
				)
			),
			supersedingWorkoutPlan: supersedingWorkoutPlan
				? {
						workoutPlanId: supersedingWorkoutPlan._id,
						name: supersedingWorkoutPlan.name,
						status: supersedingWorkoutPlan.status,
						activatedAt: supersedingWorkoutPlan.activatedAt,
					}
				: null,
			auditEvents,
		};
	})
	.public();

export const listCollectionAttempts = adminQuery
	.input({
		limit: v.optional(v.number()),
		mortgageId: v.optional(v.id("mortgages")),
		planEntryId: v.optional(v.id("collectionPlanEntries")),
		status: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<CollectionAttemptRow[]> => {
		const limit = boundedLimit(args.limit, 50, 200);
		let attempts: Doc<"collectionAttempts">[] = [];

		if (args.planEntryId) {
			const planEntryId = args.planEntryId;
			attempts = await ctx.db
				.query("collectionAttempts")
				.withIndex("by_plan_entry", (q) => q.eq("planEntryId", planEntryId))
				.collect();
		} else if (args.mortgageId && args.status) {
			const mortgageId = args.mortgageId;
			const status = args.status;
			attempts = await ctx.db
				.query("collectionAttempts")
				.withIndex("by_mortgage_status", (q) =>
					q.eq("mortgageId", mortgageId).eq("status", status)
				)
				.collect();
		} else if (args.status) {
			const status = args.status;
			attempts = await ctx.db
				.query("collectionAttempts")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect();
		} else {
			attempts = await ctx.db.query("collectionAttempts").collect();
		}

		return await Promise.all(
			attempts
				.filter((attempt) =>
					args.mortgageId ? attempt.mortgageId === args.mortgageId : true
				)
				.sort((left, right) => right.initiatedAt - left.initiatedAt)
				.slice(0, limit)
				.map((attempt) => buildCollectionAttemptRow(ctx, attempt))
		);
	})
	.public();

export const getCollectionAttempt = adminQuery
	.input({
		attemptId: v.id("collectionAttempts"),
	})
	.handler(async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) {
			return null;
		}

		const [planEntry, auditEvents, transitionJournal] = await Promise.all([
			ctx.db.get(attempt.planEntryId),
			auditLog.queryByResource(ctx, {
				resourceType: "collectionAttempts",
				resourceId: `${args.attemptId}`,
				limit: 25,
			}),
			ctx.db
				.query("auditJournal")
				.withIndex("by_entity", (q) =>
					q
						.eq("entityType", "collectionAttempt")
						.eq("entityId", `${args.attemptId}`)
				)
				.collect(),
		]);

		return {
			attempt: await buildCollectionAttemptRow(ctx, attempt),
			planEntry: planEntry
				? await buildCollectionPlanEntryRow(ctx, planEntry)
				: null,
			transitionJournal: transitionJournal.sort(
				(left, right) => right.timestamp - left.timestamp
			),
			auditEvents,
		};
	})
	.public();

export const getMortgageCollectionOperationsSummary = adminQuery
	.input({
		mortgageId: v.id("mortgages"),
		recentAttemptLimit: v.optional(v.number()),
		upcomingEntryLimit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const [rules, workoutPlans, planEntries, attempts] = await Promise.all([
			ctx.db.query("collectionRules").collect(),
			ctx.db
				.query("workoutPlans")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
				.collect(),
			ctx.db.query("collectionPlanEntries").collect(),
			ctx.db.query("collectionAttempts").collect(),
		]);

		const mortgagePlanEntries = planEntries.filter(
			(entry) => entry.mortgageId === args.mortgageId
		);
		const mortgageAttempts = attempts.filter(
			(attempt) => attempt.mortgageId === args.mortgageId
		);
		const applicableRules = rules
			.filter((rule) => matchesCollectionRuleScope(rule, args.mortgageId))
			.sort(compareCollectionRules);
		const activeWorkoutPlan =
			workoutPlans.find((plan) => plan.status === "active") ?? null;
		const draftWorkoutPlans = workoutPlans.filter(
			(plan) => plan.status === "draft"
		);
		const upcomingEntryLimit = boundedLimit(args.upcomingEntryLimit, 10, 50);
		const recentAttemptLimit = boundedLimit(args.recentAttemptLimit, 10, 50);

		const upcomingEntries = mortgagePlanEntries
			.filter((entry) => entry.status === "planned")
			.sort((left, right) => left.scheduledDate - right.scheduledDate)
			.slice(0, upcomingEntryLimit);
		const recentAttempts = mortgageAttempts
			.sort((left, right) => right.initiatedAt - left.initiatedAt)
			.slice(0, recentAttemptLimit);

		const planEntryStats = mortgagePlanEntries.reduce<Record<string, number>>(
			(stats, entry) => {
				stats[entry.status] = (stats[entry.status] ?? 0) + 1;
				if (
					entry.balancePreCheckDecision === "defer" ||
					entry.balancePreCheckDecision === "suppress" ||
					entry.balancePreCheckDecision === "require_operator_review"
				) {
					stats.balanceBlocked = (stats.balanceBlocked ?? 0) + 1;
				}
				if (entry.supersededByWorkoutPlanId) {
					stats.workoutSuperseded = (stats.workoutSuperseded ?? 0) + 1;
				}
				return stats;
			},
			{}
		);
		const attemptStats = mortgageAttempts.reduce<Record<string, number>>(
			(stats, attempt) => {
				stats[attempt.status] = (stats[attempt.status] ?? 0) + 1;
				return stats;
			},
			{}
		);

		return {
			mortgageId: args.mortgageId,
			ruleCount: applicableRules.length,
			applicableRules: applicableRules.map((rule) =>
				buildCollectionRuleRow(rule)
			),
			planEntryStats,
			attemptStats,
			upcomingEntries: await Promise.all(
				upcomingEntries.map((entry) => buildCollectionPlanEntryRow(ctx, entry))
			),
			recentAttempts: await Promise.all(
				recentAttempts.map((attempt) => buildCollectionAttemptRow(ctx, attempt))
			),
			activeWorkoutPlan: activeWorkoutPlan
				? {
						workoutPlanId: activeWorkoutPlan._id,
						name: activeWorkoutPlan.name,
						status: activeWorkoutPlan.status,
						activatedAt: activeWorkoutPlan.activatedAt,
						updatedAt: activeWorkoutPlan.updatedAt,
					}
				: null,
			draftWorkoutPlans: draftWorkoutPlans
				.sort((left, right) => right.createdAt - left.createdAt)
				.map((plan) => ({
					workoutPlanId: plan._id,
					name: plan.name,
					status: plan.status,
					createdAt: plan.createdAt,
					updatedAt: plan.updatedAt,
				})),
			historicalWorkoutPlans: workoutPlans
				.filter(
					(plan) => plan.status === "completed" || plan.status === "cancelled"
				)
				.sort((left, right) => right.updatedAt - left.updatedAt)
				.map((plan) => ({
					workoutPlanId: plan._id,
					name: plan.name,
					status: plan.status,
					completedAt: plan.completedAt,
					cancelledAt: plan.cancelledAt,
					updatedAt: plan.updatedAt,
				})),
		};
	})
	.public();

export const executeCollectionPlanEntry = adminAction
	.input({
		dryRun: v.optional(v.boolean()),
		idempotencyKey: v.optional(v.string()),
		planEntryId: v.id("collectionPlanEntries"),
		reason: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<ExecutePlanEntryResult> => {
		const requestedAt = Date.now();
		const trimmedReason = trimOptional(args.reason);
		const idempotencyKey =
			trimOptional(args.idempotencyKey) ??
			`admin-manual:${args.planEntryId}:${ctx.viewer.authId}:${requestedAt}`;

		return ctx.runAction(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId: args.planEntryId,
				triggerSource: "admin_manual",
				requestedAt,
				idempotencyKey,
				requestedByActorType: "admin",
				requestedByActorId: ctx.viewer.authId,
				reason: trimmedReason,
				dryRun: args.dryRun,
			}
		);
	})
	.public();

export const rescheduleCollectionPlanEntry = adminAction
	.input({
		newScheduledDate: v.number(),
		planEntryId: v.id("collectionPlanEntries"),
		reason: v.string(),
	})
	.handler(async (ctx, args): Promise<ReschedulePlanEntryResult> => {
		return ctx.runMutation(
			internal.payments.collectionPlan.reschedule.reschedulePlanEntryInternal,
			{
				...args,
				actorId: ctx.viewer.authId,
				actorType: "admin",
				requestedAt: Date.now(),
			}
		);
	})
	.public();

export const createWorkoutPlan = adminAction
	.input({
		installments: v.array(workoutPlanInstallmentInputValidator),
		mortgageId: v.id("mortgages"),
		name: v.string(),
		rationale: v.string(),
	})
	.handler(async (ctx, args): Promise<CreateWorkoutPlanResult> => {
		return ctx.runMutation(
			internal.payments.collectionPlan.workout.createWorkoutPlanInternal,
			{
				...args,
				actorId: ctx.viewer.authId,
				actorType: "admin",
				requestedAt: Date.now(),
			}
		);
	})
	.public();

export const activateWorkoutPlan = adminAction
	.input({
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args): Promise<ActivateWorkoutPlanResult> => {
		return ctx.runMutation(
			internal.payments.collectionPlan.workout.activateWorkoutPlanInternal,
			{
				...args,
				actorId: ctx.viewer.authId,
				actorType: "admin",
				requestedAt: Date.now(),
			}
		);
	})
	.public();

export const completeWorkoutPlan = adminAction
	.input({
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args): Promise<CompleteWorkoutPlanResult> => {
		return ctx.runMutation(
			internal.payments.collectionPlan.workout.completeWorkoutPlanInternal,
			{
				...args,
				actorId: ctx.viewer.authId,
				actorType: "admin",
				requestedAt: Date.now(),
			}
		);
	})
	.public();

export const cancelWorkoutPlan = adminAction
	.input({
		reason: v.optional(v.string()),
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args): Promise<CancelWorkoutPlanResult> => {
		return ctx.runMutation(
			internal.payments.collectionPlan.workout.cancelWorkoutPlanInternal,
			{
				...args,
				actorId: ctx.viewer.authId,
				actorType: "admin",
				requestedAt: Date.now(),
			}
		);
	})
	.public();

export const createCollectionRule = adminMutation
	.input({
		code: v.string(),
		config: collectionRuleConfigValidator,
		description: v.string(),
		displayName: v.string(),
		effectiveFrom: v.optional(v.number()),
		effectiveTo: v.optional(v.number()),
		kind: collectionRuleKindValidator,
		priority: v.number(),
		scope: ruleScopeInputValidator,
		status: v.optional(collectionRuleStatusValidator),
	})
	.handler(async (ctx, args): Promise<CreateCollectionRuleResult> => {
		const requestedAt = Date.now();
		const code = trimOptional(args.code);
		const displayName = trimOptional(args.displayName);
		const description = trimOptional(args.description);
		const status = args.status ?? "draft";
		const scope = args.scope ?? { scopeType: "global" as const };

		if (!code) {
			return {
				outcome: "rejected",
				reasonCode: "invalid_code",
				reasonDetail: "Rule code must be a non-empty string.",
				requestedAt,
			};
		}

		if (!displayName) {
			return {
				outcome: "rejected",
				reasonCode: "invalid_display_name",
				reasonDetail: "Rule displayName must be a non-empty string.",
				requestedAt,
			};
		}

		if (!description) {
			return {
				outcome: "rejected",
				reasonCode: "invalid_description",
				reasonDetail: "Rule description must be a non-empty string.",
				requestedAt,
			};
		}

		if (args.kind !== args.config.kind) {
			return {
				outcome: "rejected",
				reasonCode: "config_kind_mismatch",
				reasonDetail:
					"Rule kind must match config.kind for typed collection rules.",
				requestedAt,
			};
		}

		if (!validateRulePriority(args.priority)) {
			return {
				outcome: "rejected",
				reasonCode: "invalid_priority",
				reasonDetail:
					"Rule priority must be a finite non-negative integer value.",
				requestedAt,
			};
		}

		const invalidWindow = validateRuleWindow(args);
		if (invalidWindow) {
			return {
				outcome: "rejected",
				reasonCode: invalidWindow.reasonCode,
				reasonDetail: invalidWindow.reasonDetail,
				requestedAt,
			};
		}

		const existing = await ctx.db
			.query("collectionRules")
			.withIndex("by_code", (q) => q.eq("code", code))
			.first();
		if (existing) {
			return {
				outcome: "rejected",
				reasonCode: "duplicate_rule_code",
				reasonDetail: `Collection rule code "${code}" already exists.`,
				requestedAt,
			};
		}

		const ruleId = await ctx.db.insert("collectionRules", {
			kind: args.kind,
			code,
			displayName,
			description,
			trigger: deriveRuleTrigger(args.kind),
			status,
			scope,
			config: args.config,
			version: 1,
			effectiveFrom: args.effectiveFrom,
			effectiveTo: args.effectiveTo,
			createdByActorId: ctx.viewer.authId,
			updatedByActorId: ctx.viewer.authId,
			priority: args.priority,
			createdAt: requestedAt,
			updatedAt: requestedAt,
		});

		await logCollectionRuleAudit({
			action: "collection_rule.created",
			actorId: ctx.viewer.authId,
			ctx,
			metadata: {
				kind: args.kind,
				code,
				statusAfter: status,
				scope,
				priority: args.priority,
			},
			ruleId,
			severity: "info",
		});

		return {
			outcome: "created",
			requestedAt,
			ruleId,
			statusAfter: status,
		};
	})
	.public();

export const updateCollectionRule = adminMutation
	.input({
		config: v.optional(collectionRuleConfigValidator),
		description: v.optional(v.string()),
		displayName: v.optional(v.string()),
		effectiveFrom: v.optional(v.number()),
		effectiveTo: v.optional(v.number()),
		priority: v.optional(v.number()),
		ruleId: v.id("collectionRules"),
		scope: ruleScopeInputValidator,
		status: v.optional(collectionRuleStatusValidator),
	})
	.handler(async (ctx, args): Promise<UpdateCollectionRuleResult> => {
		const requestedAt = Date.now();
		const existing = await ctx.db.get(args.ruleId);
		if (!existing) {
			return {
				outcome: "rejected",
				ruleId: args.ruleId,
				reasonCode: "rule_not_found",
				reasonDetail: `Collection rule ${args.ruleId} was not found.`,
				requestedAt,
			};
		}

		if (args.config && args.config.kind !== existing.kind) {
			return {
				outcome: "rejected",
				ruleId: args.ruleId,
				reasonCode: "config_kind_mismatch",
				reasonDetail:
					"Collection rule kind is immutable; config.kind must match the existing rule kind.",
				requestedAt,
			};
		}

		if (args.priority !== undefined && !validateRulePriority(args.priority)) {
			return {
				outcome: "rejected",
				ruleId: args.ruleId,
				reasonCode: "invalid_priority",
				reasonDetail:
					"Rule priority must be a finite non-negative integer value.",
				requestedAt,
			};
		}

		const displayName =
			args.displayName !== undefined
				? trimOptional(args.displayName)
				: undefined;
		if (args.displayName !== undefined && !displayName) {
			return {
				outcome: "rejected",
				ruleId: args.ruleId,
				reasonCode: "invalid_display_name",
				reasonDetail: "Rule displayName must be a non-empty string.",
				requestedAt,
			};
		}

		const description =
			args.description !== undefined
				? trimOptional(args.description)
				: undefined;
		if (args.description !== undefined && !description) {
			return {
				outcome: "rejected",
				ruleId: args.ruleId,
				reasonCode: "invalid_description",
				reasonDetail: "Rule description must be a non-empty string.",
				requestedAt,
			};
		}

		const invalidWindow = validateRuleWindow({
			effectiveFrom:
				args.effectiveFrom !== undefined
					? args.effectiveFrom
					: existing.effectiveFrom,
			effectiveTo:
				args.effectiveTo !== undefined
					? args.effectiveTo
					: existing.effectiveTo,
		});
		if (invalidWindow) {
			return {
				outcome: "rejected",
				ruleId: args.ruleId,
				reasonCode: invalidWindow.reasonCode,
				reasonDetail: invalidWindow.reasonDetail,
				requestedAt,
			};
		}

		const patch = {
			config: args.config ?? existing.config,
			description: description ?? existing.description,
			displayName: displayName ?? existing.displayName,
			effectiveFrom:
				args.effectiveFrom !== undefined
					? args.effectiveFrom
					: existing.effectiveFrom,
			effectiveTo:
				args.effectiveTo !== undefined
					? args.effectiveTo
					: existing.effectiveTo,
			priority: args.priority ?? existing.priority,
			scope: args.scope ?? existing.scope,
			status: args.status ?? existing.status,
			updatedAt: requestedAt,
			updatedByActorId: ctx.viewer.authId,
		};

		await ctx.db.patch(args.ruleId, patch);
		await logCollectionRuleAudit({
			action: "collection_rule.updated",
			actorId: ctx.viewer.authId,
			ctx,
			metadata: {
				statusAfter: patch.status,
				priorityAfter: patch.priority,
				scopeAfter: patch.scope,
				effectiveFromAfter: patch.effectiveFrom,
				effectiveToAfter: patch.effectiveTo,
			},
			ruleId: args.ruleId,
			severity: "info",
		});

		return {
			outcome: "updated",
			requestedAt,
			ruleId: args.ruleId,
			statusAfter: patch.status,
		};
	})
	.public();
