import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { buildSource } from "../../engine/commands";
import { paymentMutation, paymentQuery } from "../../fluent";
import {
	createEntryImpl,
	ensureDefaultEntriesForObligationsImpl,
} from "./initialScheduling";
import {
	findLinkedCollectionAttemptId,
	isPlanEntryDueForExecution,
} from "./planEntrySafety";
import type {
	WorkoutPlanActorType,
	WorkoutPlanInstallment,
	WorkoutPlanInstallmentInput,
} from "./workoutContract";
import {
	workoutPlanActorTypeValidator,
	workoutPlanInstallmentInputValidator,
} from "./workoutContract";

const NON_CANCELLED_PLAN_ENTRY_STATUSES = [
	"planned",
	"executing",
	"completed",
	"rescheduled",
] as const;

const createWorkoutPlanReasonCodeValues = [
	"duplicate_obligation",
	"invalid_amount",
	"invalid_installments",
	"invalid_method",
	"invalid_name",
	"invalid_rationale",
	"invalid_scheduled_date",
	"mortgage_not_found",
	"obligation_mismatch",
	"obligation_not_collectible",
	"obligation_not_found",
] as const;

export type CreateWorkoutPlanReasonCode =
	(typeof createWorkoutPlanReasonCodeValues)[number];

export type CreateWorkoutPlanResult =
	| {
			coveredObligationIds: Id<"obligations">[];
			installmentCount: number;
			outcome: "created";
			requestedAt: number;
			statusAfter: "draft";
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			mortgageId: Id<"mortgages">;
			outcome: "rejected";
			reasonCode: CreateWorkoutPlanReasonCode;
			reasonDetail: string;
			requestedAt: number;
	  };

const activateWorkoutPlanReasonCodeValues = [
	"active_workout_plan_exists",
	"blocking_plan_entry_due_for_execution",
	"blocking_plan_entry_execution_state",
	"blocking_plan_entry_non_planned_state",
	"blocking_plan_entry_partial_coverage",
	"workout_plan_not_activatable_state",
	"workout_plan_not_found",
	"workout_plan_obligation_mismatch",
	"workout_plan_obligation_not_collectible",
	"workout_plan_obligation_not_found",
] as const;

export type ActivateWorkoutPlanReasonCode =
	(typeof activateWorkoutPlanReasonCodeValues)[number];

export type ActivateWorkoutPlanResult =
	| {
			activatedPlanEntryIds: Id<"collectionPlanEntries">[];
			outcome: "activated";
			requestedAt: number;
			statusAfter: "active";
			supersededPlanEntryIds: Id<"collectionPlanEntries">[];
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			outcome: "already_active";
			requestedAt: number;
			statusAfter: "active";
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			blockingPlanEntryId?: Id<"collectionPlanEntries">;
			outcome: "rejected";
			reasonCode: ActivateWorkoutPlanReasonCode;
			reasonDetail: string;
			requestedAt: number;
			workoutPlanId: Id<"workoutPlans">;
	  };

const workoutExitReasonCodeValues = [
	"blocking_plan_entry_due_for_execution",
	"blocking_plan_entry_execution_state",
	"workout_plan_not_exitable_state",
	"workout_plan_not_found",
] as const;

export type WorkoutExitReasonCode =
	(typeof workoutExitReasonCodeValues)[number];

export type CompleteWorkoutPlanResult =
	| {
			cancelledPlanEntryIds: Id<"collectionPlanEntries">[];
			outcome: "completed";
			requestedAt: number;
			restoredPlanEntryIds: Id<"collectionPlanEntries">[];
			scheduleRuleMissing: boolean;
			statusAfter: "completed";
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			outcome: "already_completed";
			requestedAt: number;
			statusAfter: "completed";
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			blockingPlanEntryId?: Id<"collectionPlanEntries">;
			outcome: "rejected";
			reasonCode: WorkoutExitReasonCode;
			reasonDetail: string;
			requestedAt: number;
			workoutPlanId: Id<"workoutPlans">;
	  };

export type CancelWorkoutPlanResult =
	| {
			cancelReason?: string;
			cancelledPlanEntryIds: Id<"collectionPlanEntries">[];
			outcome: "cancelled";
			requestedAt: number;
			restoredPlanEntryIds: Id<"collectionPlanEntries">[];
			scheduleRuleMissing: boolean;
			statusAfter: "cancelled";
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			outcome: "already_cancelled";
			requestedAt: number;
			statusAfter: "cancelled";
			workoutPlanId: Id<"workoutPlans">;
	  }
	| {
			blockingPlanEntryId?: Id<"collectionPlanEntries">;
			outcome: "rejected";
			reasonCode: WorkoutExitReasonCode;
			reasonDetail: string;
			requestedAt: number;
			workoutPlanId: Id<"workoutPlans">;
	  };

function isFiniteTimestamp(value: number) {
	return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isPositiveAmount(value: number) {
	return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function trimOrEmpty(value: string) {
	return value.trim();
}

function intersectsObligations(
	entry: Pick<Doc<"collectionPlanEntries">, "obligationIds">,
	obligationLookup: ReadonlySet<string>
) {
	return entry.obligationIds.some((obligationId) =>
		obligationLookup.has(`${obligationId}`)
	);
}

function coversOnlyWorkoutObligations(
	entry: Pick<Doc<"collectionPlanEntries">, "obligationIds">,
	obligationLookup: ReadonlySet<string>
) {
	return entry.obligationIds.every((obligationId) =>
		obligationLookup.has(`${obligationId}`)
	);
}

function getOutstandingObligationAmount(
	obligation: Pick<Doc<"obligations">, "amount" | "amountSettled" | "status">
) {
	if (obligation.status === "settled") {
		return 0;
	}

	return Math.max(0, obligation.amount - (obligation.amountSettled ?? 0));
}

type WorkoutMutationContext = Parameters<typeof auditLog.log>[0] & {
	db: MutationCtx["db"];
};

async function logWorkoutAudit(args: {
	action:
		| "collection_plan.create_workout_plan"
		| "collection_plan.activate_workout_plan"
		| "collection_plan.complete_workout_plan"
		| "collection_plan.cancel_workout_plan";
	actorId: string;
	ctx: Parameters<typeof auditLog.log>[0];
	metadata: Record<string, unknown>;
	resourceId: string;
	severity: "info" | "warning";
}) {
	await auditLog.log(args.ctx, {
		action: args.action,
		actorId: args.actorId,
		resourceType: "workoutPlans",
		resourceId: args.resourceId,
		severity: args.severity,
		metadata: args.metadata,
	});
}

async function resolveWorkoutInstallments(
	ctx: Pick<MutationCtx, "db">,
	args: {
		installments: WorkoutPlanInstallmentInput[];
		mortgageId: Id<"mortgages">;
	}
): Promise<
	| {
			coveredObligationIds: Id<"obligations">[];
			installments: WorkoutPlanInstallment[];
	  }
	| {
			reasonCode: CreateWorkoutPlanReasonCode;
			reasonDetail: string;
	  }
> {
	if (args.installments.length === 0) {
		return {
			reasonCode: "invalid_installments",
			reasonDetail: "Workout plans require at least one installment.",
		};
	}

	const coveredObligationIds: Id<"obligations">[] = [];
	const obligationLookup = new Set<string>();
	const normalized: WorkoutPlanInstallment[] = [];

	for (const installment of args.installments) {
		if (installment.obligationIds.length === 0) {
			return {
				reasonCode: "invalid_installments",
				reasonDetail:
					"Each workout installment must include at least one obligation.",
			};
		}

		if (!isFiniteTimestamp(installment.scheduledDate)) {
			return {
				reasonCode: "invalid_scheduled_date",
				reasonDetail:
					"Each workout installment scheduledDate must be a positive integer timestamp.",
			};
		}

		const method = trimOrEmpty(installment.method);
		if (method.length === 0) {
			return {
				reasonCode: "invalid_method",
				reasonDetail:
					"Each workout installment must specify a non-empty collection method.",
			};
		}

		let outstandingTotal = 0;
		for (const obligationId of installment.obligationIds) {
			if (obligationLookup.has(`${obligationId}`)) {
				return {
					reasonCode: "duplicate_obligation",
					reasonDetail:
						"Each obligation may appear only once across a workout plan strategy.",
				};
			}

			const obligation = await ctx.db.get(obligationId);
			if (!obligation) {
				return {
					reasonCode: "obligation_not_found",
					reasonDetail: `Obligation ${obligationId} was not found.`,
				};
			}

			if (obligation.mortgageId !== args.mortgageId) {
				return {
					reasonCode: "obligation_mismatch",
					reasonDetail:
						"Workout installment obligations must all belong to the target mortgage.",
				};
			}

			const outstanding = getOutstandingObligationAmount(obligation);
			if (outstanding <= 0) {
				return {
					reasonCode: "obligation_not_collectible",
					reasonDetail:
						"Workout installment obligations must still have collectible outstanding balance.",
				};
			}

			obligationLookup.add(`${obligationId}`);
			coveredObligationIds.push(obligationId);
			outstandingTotal += outstanding;
		}

		const amount =
			installment.amount === undefined ? outstandingTotal : installment.amount;
		if (!isPositiveAmount(amount) || amount > outstandingTotal) {
			return {
				reasonCode: "invalid_amount",
				reasonDetail:
					"Workout installment amount must be a positive integer and may not exceed the covered outstanding balance.",
			};
		}

		normalized.push({
			amount,
			method,
			obligationIds: installment.obligationIds,
			scheduledDate: installment.scheduledDate,
		});
	}

	normalized.sort((left, right) => {
		if (left.scheduledDate !== right.scheduledDate) {
			return left.scheduledDate - right.scheduledDate;
		}

		return left.obligationIds
			.map((id) => `${id}`)
			.join(",")
			.localeCompare(right.obligationIds.map((id) => `${id}`).join(","));
	});

	return {
		coveredObligationIds,
		installments: normalized,
	};
}

async function loadNonCancelledPlanEntriesForObligations(
	ctx: Pick<MutationCtx, "db">,
	mortgageId: Id<"mortgages">,
	obligationIds: readonly Id<"obligations">[]
) {
	const obligationLookup = new Set(
		obligationIds.map((obligationId) => `${obligationId}`)
	);
	const entries = (
		await Promise.all(
			NON_CANCELLED_PLAN_ENTRY_STATUSES.map((status) =>
				ctx.db
					.query("collectionPlanEntries")
					.withIndex("by_mortgage_status_scheduled", (q) =>
						q.eq("mortgageId", mortgageId).eq("status", status)
					)
					.collect()
			)
		)
	).flat();

	const deduped = new Map<string, Doc<"collectionPlanEntries">>();
	for (const entry of entries) {
		if (intersectsObligations(entry, obligationLookup)) {
			deduped.set(`${entry._id}`, entry);
		}
	}

	return [...deduped.values()];
}

function getWorkoutPlanCoveredObligationIds(
	workoutPlan: Pick<Doc<"workoutPlans">, "strategy">
) {
	const obligationIds: Id<"obligations">[] = [];
	const obligationLookup = new Set<string>();

	for (const installment of workoutPlan.strategy.installments) {
		for (const obligationId of installment.obligationIds) {
			const obligationKey = `${obligationId}`;
			if (obligationLookup.has(obligationKey)) {
				continue;
			}
			obligationLookup.add(obligationKey);
			obligationIds.push(obligationId);
		}
	}

	return obligationIds;
}

type WorkoutExitKind = "cancel" | "complete";
interface WorkoutExitArgs {
	cancelReason?: string;
	requestedAt: number;
	workoutPlanId: Id<"workoutPlans">;
}

interface WorkoutExitOptions {
	actorId: string;
	actorType: WorkoutPlanActorType;
	kind: WorkoutExitKind;
}

async function exitWorkoutPlanImpl(
	ctx: WorkoutMutationContext,
	args: WorkoutExitArgs,
	options: WorkoutExitOptions & { kind: "complete" }
): Promise<CompleteWorkoutPlanResult>;
async function exitWorkoutPlanImpl(
	ctx: WorkoutMutationContext,
	args: WorkoutExitArgs,
	options: WorkoutExitOptions & { kind: "cancel" }
): Promise<CancelWorkoutPlanResult>;
async function exitWorkoutPlanImpl(
	ctx: WorkoutMutationContext,
	args: WorkoutExitArgs,
	options: WorkoutExitOptions
): Promise<CompleteWorkoutPlanResult | CancelWorkoutPlanResult> {
	const workoutPlan = await ctx.db.get(args.workoutPlanId);
	if (!workoutPlan) {
		return {
			outcome: "rejected",
			reasonCode: "workout_plan_not_found",
			reasonDetail: `Workout plan ${args.workoutPlanId} was not found.`,
			requestedAt: args.requestedAt,
			workoutPlanId: args.workoutPlanId,
		};
	}

	if (options.kind === "complete") {
		if (workoutPlan.status === "completed") {
			return {
				outcome: "already_completed",
				requestedAt: args.requestedAt,
				statusAfter: "completed",
				workoutPlanId: workoutPlan._id,
			};
		}
		if (workoutPlan.status !== "active") {
			return {
				outcome: "rejected",
				reasonCode: "workout_plan_not_exitable_state",
				reasonDetail: `Workout plan is in status "${workoutPlan.status}" and cannot be completed.`,
				requestedAt: args.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
		}
	}

	if (options.kind === "cancel") {
		if (workoutPlan.status === "cancelled") {
			return {
				outcome: "already_cancelled",
				requestedAt: args.requestedAt,
				statusAfter: "cancelled",
				workoutPlanId: workoutPlan._id,
			};
		}
		if (workoutPlan.status !== "draft" && workoutPlan.status !== "active") {
			return {
				outcome: "rejected",
				reasonCode: "workout_plan_not_exitable_state",
				reasonDetail: `Workout plan is in status "${workoutPlan.status}" and cannot be cancelled.`,
				requestedAt: args.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
		}
	}

	const ownedPlanEntries =
		workoutPlan.status === "active"
			? await ctx.db
					.query("collectionPlanEntries")
					.withIndex("by_workout_plan", (q) =>
						q.eq("workoutPlanId", workoutPlan._id)
					)
					.collect()
			: [];
	const liveOwnedPlanEntries = ownedPlanEntries.filter(
		(entry) =>
			entry.status !== "cancelled" &&
			entry.status !== "completed" &&
			entry.status !== "rescheduled"
	);

	for (const entry of liveOwnedPlanEntries) {
		if (entry.status === "executing") {
			return {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_execution_state",
				reasonDetail:
					"Workout exit cannot proceed while a workout-owned collection entry is already executing.",
				requestedAt: args.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
		}

		const existingAttempt = await findLinkedCollectionAttemptId(ctx, entry);
		if (
			existingAttempt ||
			entry.executedAt !== undefined ||
			entry.executionIdempotencyKey !== undefined
		) {
			return {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_execution_state",
				reasonDetail:
					"Workout exit cannot proceed once a workout-owned collection entry has execution linkage.",
				requestedAt: args.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
		}

		if (isPlanEntryDueForExecution(entry, args.requestedAt)) {
			return {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_due_for_execution",
				reasonDetail:
					"Workout exit cannot supersede a workout-owned collection entry that is already due for execution.",
				requestedAt: args.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
		}
	}

	const cancelledPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	for (const entry of liveOwnedPlanEntries) {
		if (entry.status !== "planned") {
			continue;
		}
		await ctx.db.patch(entry._id, {
			status: "cancelled",
			cancelledAt: args.requestedAt,
		});
		cancelledPlanEntryIds.push(entry._id);
	}

	let restoredPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	let scheduleRuleMissing = false;

	if (workoutPlan.status === "active") {
		const coveredObligationIds =
			getWorkoutPlanCoveredObligationIds(workoutPlan);
		const coveredObligations = (
			await Promise.all(
				coveredObligationIds.map((obligationId) => ctx.db.get(obligationId))
			)
		).filter(
			(obligation): obligation is Doc<"obligations"> => obligation !== null
		);

		const restoration = await ensureDefaultEntriesForObligationsImpl(ctx, {
			mortgageId: workoutPlan.mortgageId,
			nowMs: args.requestedAt,
			obligations: coveredObligations,
		});
		restoredPlanEntryIds = restoration.createdPlanEntryIds;
		scheduleRuleMissing = restoration.scheduleRuleMissing;
	}

	if (options.kind === "complete") {
		await ctx.db.patch(workoutPlan._id, {
			status: "completed",
			completedAt: args.requestedAt,
			updatedAt: args.requestedAt,
		});

		return {
			cancelledPlanEntryIds,
			outcome: "completed",
			requestedAt: args.requestedAt,
			restoredPlanEntryIds,
			scheduleRuleMissing,
			statusAfter: "completed",
			workoutPlanId: workoutPlan._id,
		};
	}

	await ctx.db.patch(workoutPlan._id, {
		status: "cancelled",
		cancelledAt: args.requestedAt,
		cancelledByActorId: options.actorId,
		cancelledByActorType: options.actorType,
		cancelReason: args.cancelReason,
		updatedAt: args.requestedAt,
	});

	return {
		cancelReason: args.cancelReason,
		cancelledPlanEntryIds,
		outcome: "cancelled",
		requestedAt: args.requestedAt,
		restoredPlanEntryIds,
		scheduleRuleMissing,
		statusAfter: "cancelled",
		workoutPlanId: workoutPlan._id,
	};
}

interface CreateWorkoutPlanArgs {
	installments: WorkoutPlanInstallmentInput[];
	mortgageId: Id<"mortgages">;
	name: string;
	rationale: string;
}

interface WorkoutMutationActorOptions {
	actorId: string;
	actorType: WorkoutPlanActorType;
	requestedAt: number;
}

async function createWorkoutPlanImpl(
	ctx: WorkoutMutationContext,
	args: CreateWorkoutPlanArgs,
	options: WorkoutMutationActorOptions
): Promise<CreateWorkoutPlanResult> {
	const name = trimOrEmpty(args.name);
	const rationale = trimOrEmpty(args.rationale);

	if (name.length === 0) {
		const result: CreateWorkoutPlanResult = {
			mortgageId: args.mortgageId,
			outcome: "rejected",
			reasonCode: "invalid_name",
			reasonDetail: "Workout plan name must be a non-empty string.",
			requestedAt: options.requestedAt,
		};
		await logWorkoutAudit({
			action: "collection_plan.create_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${args.mortgageId}:draft`,
			severity: "warning",
		});
		return result;
	}

	if (rationale.length === 0) {
		const result: CreateWorkoutPlanResult = {
			mortgageId: args.mortgageId,
			outcome: "rejected",
			reasonCode: "invalid_rationale",
			reasonDetail: "Workout plan rationale must be a non-empty string.",
			requestedAt: options.requestedAt,
		};
		await logWorkoutAudit({
			action: "collection_plan.create_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${args.mortgageId}:draft`,
			severity: "warning",
		});
		return result;
	}

	const mortgage = await ctx.db.get(args.mortgageId);
	if (!mortgage) {
		const result: CreateWorkoutPlanResult = {
			mortgageId: args.mortgageId,
			outcome: "rejected",
			reasonCode: "mortgage_not_found",
			reasonDetail: `Mortgage ${args.mortgageId} was not found.`,
			requestedAt: options.requestedAt,
		};
		await logWorkoutAudit({
			action: "collection_plan.create_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${args.mortgageId}:draft`,
			severity: "warning",
		});
		return result;
	}

	const resolvedInstallments = await resolveWorkoutInstallments(ctx, {
		installments: args.installments,
		mortgageId: args.mortgageId,
	});
	if ("reasonCode" in resolvedInstallments) {
		const result: CreateWorkoutPlanResult = {
			mortgageId: args.mortgageId,
			outcome: "rejected",
			reasonCode: resolvedInstallments.reasonCode,
			reasonDetail: resolvedInstallments.reasonDetail,
			requestedAt: options.requestedAt,
		};
		await logWorkoutAudit({
			action: "collection_plan.create_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${args.mortgageId}:draft`,
			severity: "warning",
		});
		return result;
	}

	const workoutPlanId = await ctx.db.insert("workoutPlans", {
		mortgageId: args.mortgageId,
		name,
		rationale,
		status: "draft",
		strategy: {
			kind: "custom_schedule",
			installments: resolvedInstallments.installments,
		},
		createdByActorId: options.actorId,
		createdByActorType: options.actorType,
		createdAt: options.requestedAt,
		updatedAt: options.requestedAt,
	});

	const result: CreateWorkoutPlanResult = {
		coveredObligationIds: resolvedInstallments.coveredObligationIds,
		installmentCount: resolvedInstallments.installments.length,
		outcome: "created",
		requestedAt: options.requestedAt,
		statusAfter: "draft",
		workoutPlanId,
	};
	await logWorkoutAudit({
		action: "collection_plan.create_workout_plan",
		actorId: options.actorId,
		ctx,
		metadata: result,
		resourceId: `${workoutPlanId}`,
		severity: "info",
	});
	return result;
}

interface ActivateWorkoutPlanArgs {
	workoutPlanId: Id<"workoutPlans">;
}

async function activateWorkoutPlanImpl(
	ctx: WorkoutMutationContext,
	args: ActivateWorkoutPlanArgs,
	options: WorkoutMutationActorOptions
): Promise<ActivateWorkoutPlanResult> {
	const workoutPlan = await ctx.db.get(args.workoutPlanId);
	if (!workoutPlan) {
		const result: ActivateWorkoutPlanResult = {
			outcome: "rejected",
			reasonCode: "workout_plan_not_found",
			reasonDetail: `Workout plan ${args.workoutPlanId} was not found.`,
			requestedAt: options.requestedAt,
			workoutPlanId: args.workoutPlanId,
		};
		await logWorkoutAudit({
			action: "collection_plan.activate_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${args.workoutPlanId}`,
			severity: "warning",
		});
		return result;
	}

	if (workoutPlan.status === "active") {
		const result: ActivateWorkoutPlanResult = {
			outcome: "already_active",
			requestedAt: options.requestedAt,
			statusAfter: "active",
			workoutPlanId: workoutPlan._id,
		};
		await logWorkoutAudit({
			action: "collection_plan.activate_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${workoutPlan._id}`,
			severity: "info",
		});
		return result;
	}

	if (workoutPlan.status !== "draft") {
		const result: ActivateWorkoutPlanResult = {
			outcome: "rejected",
			reasonCode: "workout_plan_not_activatable_state",
			reasonDetail: `Workout plan is in status "${workoutPlan.status}" and cannot be activated.`,
			requestedAt: options.requestedAt,
			workoutPlanId: workoutPlan._id,
		};
		await logWorkoutAudit({
			action: "collection_plan.activate_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${workoutPlan._id}`,
			severity: "warning",
		});
		return result;
	}

	const existingActiveWorkoutPlan = await ctx.db
		.query("workoutPlans")
		.withIndex("by_mortgage_status", (q) =>
			q.eq("mortgageId", workoutPlan.mortgageId).eq("status", "active")
		)
		.first();
	if (
		existingActiveWorkoutPlan &&
		existingActiveWorkoutPlan._id !== workoutPlan._id
	) {
		const result: ActivateWorkoutPlanResult = {
			outcome: "rejected",
			reasonCode: "active_workout_plan_exists",
			reasonDetail:
				"Another active workout plan already exists for this mortgage.",
			requestedAt: options.requestedAt,
			workoutPlanId: workoutPlan._id,
		};
		await logWorkoutAudit({
			action: "collection_plan.activate_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: {
				...result,
				activeWorkoutPlanId: `${existingActiveWorkoutPlan._id}`,
			},
			resourceId: `${workoutPlan._id}`,
			severity: "warning",
		});
		return result;
	}

	const resolvedInstallments = await resolveWorkoutInstallments(ctx, {
		installments: workoutPlan.strategy.installments,
		mortgageId: workoutPlan.mortgageId,
	});
	if ("reasonCode" in resolvedInstallments) {
		const reasonCodeMap: Record<
			CreateWorkoutPlanReasonCode,
			ActivateWorkoutPlanReasonCode
		> = {
			duplicate_obligation: "workout_plan_obligation_mismatch",
			invalid_amount: "workout_plan_obligation_not_collectible",
			invalid_installments: "workout_plan_obligation_mismatch",
			invalid_method: "workout_plan_obligation_mismatch",
			invalid_name: "workout_plan_obligation_mismatch",
			invalid_rationale: "workout_plan_obligation_mismatch",
			invalid_scheduled_date: "workout_plan_obligation_mismatch",
			mortgage_not_found: "workout_plan_obligation_mismatch",
			obligation_mismatch: "workout_plan_obligation_mismatch",
			obligation_not_collectible: "workout_plan_obligation_not_collectible",
			obligation_not_found: "workout_plan_obligation_not_found",
		};
		const result: ActivateWorkoutPlanResult = {
			outcome: "rejected",
			reasonCode: reasonCodeMap[resolvedInstallments.reasonCode],
			reasonDetail: resolvedInstallments.reasonDetail,
			requestedAt: options.requestedAt,
			workoutPlanId: workoutPlan._id,
		};
		await logWorkoutAudit({
			action: "collection_plan.activate_workout_plan",
			actorId: options.actorId,
			ctx,
			metadata: result,
			resourceId: `${workoutPlan._id}`,
			severity: "warning",
		});
		return result;
	}

	const existingEntries = await loadNonCancelledPlanEntriesForObligations(
		ctx,
		workoutPlan.mortgageId,
		resolvedInstallments.coveredObligationIds
	);
	const coveredObligations = new Set(
		resolvedInstallments.coveredObligationIds.map(
			(obligationId) => `${obligationId}`
		)
	);

	for (const entry of existingEntries) {
		if (!coversOnlyWorkoutObligations(entry, coveredObligations)) {
			const result: ActivateWorkoutPlanResult = {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_partial_coverage",
				reasonDetail:
					"Workout activation cannot partially supersede a shared collection plan entry.",
				requestedAt: options.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
			await logWorkoutAudit({
				action: "collection_plan.activate_workout_plan",
				actorId: options.actorId,
				ctx,
				metadata: result,
				resourceId: `${workoutPlan._id}`,
				severity: "warning",
			});
			return result;
		}

		if (entry.status !== "planned") {
			const result: ActivateWorkoutPlanResult = {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_non_planned_state",
				reasonDetail:
					"Workout activation may only supersede still-planned collection entries.",
				requestedAt: options.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
			await logWorkoutAudit({
				action: "collection_plan.activate_workout_plan",
				actorId: options.actorId,
				ctx,
				metadata: result,
				resourceId: `${workoutPlan._id}`,
				severity: "warning",
			});
			return result;
		}

		const existingAttempt = await findLinkedCollectionAttemptId(ctx, entry);
		if (
			existingAttempt ||
			entry.executedAt !== undefined ||
			entry.executionIdempotencyKey !== undefined
		) {
			const result: ActivateWorkoutPlanResult = {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_execution_state",
				reasonDetail:
					"Workout activation cannot supersede a collection entry that already has execution linkage.",
				requestedAt: options.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
			await logWorkoutAudit({
				action: "collection_plan.activate_workout_plan",
				actorId: options.actorId,
				ctx,
				metadata: {
					...result,
					existingAttemptId: existingAttempt ? `${existingAttempt}` : undefined,
				},
				resourceId: `${workoutPlan._id}`,
				severity: "warning",
			});
			return result;
		}

		if (isPlanEntryDueForExecution(entry, options.requestedAt)) {
			const result: ActivateWorkoutPlanResult = {
				blockingPlanEntryId: entry._id,
				outcome: "rejected",
				reasonCode: "blocking_plan_entry_due_for_execution",
				reasonDetail:
					"Workout activation cannot supersede a collection entry that is already due for execution.",
				requestedAt: options.requestedAt,
				workoutPlanId: workoutPlan._id,
			};
			await logWorkoutAudit({
				action: "collection_plan.activate_workout_plan",
				actorId: options.actorId,
				ctx,
				metadata: result,
				resourceId: `${workoutPlan._id}`,
				severity: "warning",
			});
			return result;
		}
	}

	const activatedPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	for (const installment of resolvedInstallments.installments) {
		const entryId = await createEntryImpl(ctx, {
			obligationIds: installment.obligationIds,
			amount: installment.amount,
			method: installment.method,
			scheduledDate: installment.scheduledDate,
			status: "planned",
			source: "admin_workout",
			workoutPlanId: workoutPlan._id,
		});
		activatedPlanEntryIds.push(entryId);
	}

	const supersededPlanEntryIds = existingEntries.map((entry) => entry._id);
	for (const entry of existingEntries) {
		await ctx.db.patch(entry._id, {
			status: "cancelled",
			cancelledAt: options.requestedAt,
			supersededAt: options.requestedAt,
			supersededByWorkoutPlanId: workoutPlan._id,
		});
	}

	await ctx.db.patch(workoutPlan._id, {
		status: "active",
		activatedAt: options.requestedAt,
		activatedByActorId: options.actorId,
		activatedByActorType: options.actorType,
		updatedAt: options.requestedAt,
	});

	const result: ActivateWorkoutPlanResult = {
		activatedPlanEntryIds,
		outcome: "activated",
		requestedAt: options.requestedAt,
		statusAfter: "active",
		supersededPlanEntryIds,
		workoutPlanId: workoutPlan._id,
	};
	await logWorkoutAudit({
		action: "collection_plan.activate_workout_plan",
		actorId: options.actorId,
		ctx,
		metadata: result,
		resourceId: `${workoutPlan._id}`,
		severity: "info",
	});
	return result;
}

export const createWorkoutPlan = paymentMutation
	.input({
		installments: v.array(workoutPlanInstallmentInputValidator),
		mortgageId: v.id("mortgages"),
		name: v.string(),
		rationale: v.string(),
	})
	.handler(async (ctx, args): Promise<CreateWorkoutPlanResult> => {
		const actor = buildSource(ctx.viewer, "admin_dashboard");
		return createWorkoutPlanImpl(ctx, args, {
			actorId: ctx.viewer.authId,
			actorType: actor.actorType ?? "admin",
			requestedAt: Date.now(),
		});
	})
	.public();

export const createWorkoutPlanInternal = internalMutation({
	args: {
		actorId: v.string(),
		actorType: workoutPlanActorTypeValidator,
		installments: v.array(workoutPlanInstallmentInputValidator),
		mortgageId: v.id("mortgages"),
		name: v.string(),
		rationale: v.string(),
		requestedAt: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<CreateWorkoutPlanResult> =>
		createWorkoutPlanImpl(
			ctx,
			{
				installments: args.installments,
				mortgageId: args.mortgageId,
				name: args.name,
				rationale: args.rationale,
			},
			{
				actorId: args.actorId,
				actorType: args.actorType,
				requestedAt: args.requestedAt ?? Date.now(),
			}
		),
});

export const activateWorkoutPlan = paymentMutation
	.input({
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args): Promise<ActivateWorkoutPlanResult> => {
		// Page 14 boundary lock: workout activation only rewrites future
		// collection strategy. Obligations, mortgage lifecycle, and cash meaning
		// still move through their own governed seams later.
		const actor = buildSource(ctx.viewer, "admin_dashboard");
		return activateWorkoutPlanImpl(ctx, args, {
			actorId: ctx.viewer.authId,
			actorType: actor.actorType ?? "admin",
			requestedAt: Date.now(),
		});
	})
	.public();

export const activateWorkoutPlanInternal = internalMutation({
	args: {
		actorId: v.string(),
		actorType: workoutPlanActorTypeValidator,
		requestedAt: v.optional(v.number()),
		workoutPlanId: v.id("workoutPlans"),
	},
	handler: async (ctx, args): Promise<ActivateWorkoutPlanResult> =>
		activateWorkoutPlanImpl(
			ctx,
			{
				workoutPlanId: args.workoutPlanId,
			},
			{
				actorId: args.actorId,
				actorType: args.actorType,
				requestedAt: args.requestedAt ?? Date.now(),
			}
		),
});

export const completeWorkoutPlan = paymentMutation
	.input({
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args): Promise<CompleteWorkoutPlanResult> => {
		const requestedAt = Date.now();
		const actor = buildSource(ctx.viewer, "admin_dashboard");
		const actorId = ctx.viewer.authId;
		const result = await exitWorkoutPlanImpl(
			ctx,
			{
				workoutPlanId: args.workoutPlanId,
				requestedAt,
			},
			{
				actorId,
				actorType: actor.actorType ?? "admin",
				kind: "complete",
			}
		);

		await logWorkoutAudit({
			action: "collection_plan.complete_workout_plan",
			actorId,
			ctx,
			metadata: { ...result },
			resourceId: `${args.workoutPlanId}`,
			severity: result.outcome === "rejected" ? "warning" : "info",
		});

		return result;
	})
	.public();

export const completeWorkoutPlanInternal = internalMutation({
	args: {
		actorId: v.string(),
		actorType: workoutPlanActorTypeValidator,
		requestedAt: v.optional(v.number()),
		workoutPlanId: v.id("workoutPlans"),
	},
	handler: async (ctx, args): Promise<CompleteWorkoutPlanResult> => {
		const requestedAt = args.requestedAt ?? Date.now();
		const result = await exitWorkoutPlanImpl(
			ctx,
			{
				workoutPlanId: args.workoutPlanId,
				requestedAt,
			},
			{
				actorId: args.actorId,
				actorType: args.actorType,
				kind: "complete",
			}
		);

		await logWorkoutAudit({
			action: "collection_plan.complete_workout_plan",
			actorId: args.actorId,
			ctx,
			metadata: { ...result },
			resourceId: `${args.workoutPlanId}`,
			severity: result.outcome === "rejected" ? "warning" : "info",
		});

		return result;
	},
});

export const cancelWorkoutPlan = paymentMutation
	.input({
		reason: v.optional(v.string()),
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args): Promise<CancelWorkoutPlanResult> => {
		const requestedAt = Date.now();
		const actor = buildSource(ctx.viewer, "admin_dashboard");
		const actorId = ctx.viewer.authId;
		const cancelReason = trimOrEmpty(args.reason ?? "") || undefined;
		const result = await exitWorkoutPlanImpl(
			ctx,
			{
				cancelReason,
				workoutPlanId: args.workoutPlanId,
				requestedAt,
			},
			{
				actorId,
				actorType: actor.actorType ?? "admin",
				kind: "cancel",
			}
		);

		await logWorkoutAudit({
			action: "collection_plan.cancel_workout_plan",
			actorId,
			ctx,
			metadata: { ...result },
			resourceId: `${args.workoutPlanId}`,
			severity: result.outcome === "rejected" ? "warning" : "info",
		});

		return result;
	})
	.public();

export const cancelWorkoutPlanInternal = internalMutation({
	args: {
		actorId: v.string(),
		actorType: workoutPlanActorTypeValidator,
		reason: v.optional(v.string()),
		requestedAt: v.optional(v.number()),
		workoutPlanId: v.id("workoutPlans"),
	},
	handler: async (ctx, args): Promise<CancelWorkoutPlanResult> => {
		const requestedAt = args.requestedAt ?? Date.now();
		const cancelReason = trimOrEmpty(args.reason ?? "") || undefined;
		const result = await exitWorkoutPlanImpl(
			ctx,
			{
				cancelReason,
				workoutPlanId: args.workoutPlanId,
				requestedAt,
			},
			{
				actorId: args.actorId,
				actorType: args.actorType,
				kind: "cancel",
			}
		);

		await logWorkoutAudit({
			action: "collection_plan.cancel_workout_plan",
			actorId: args.actorId,
			ctx,
			metadata: { ...result },
			resourceId: `${args.workoutPlanId}`,
			severity: result.outcome === "rejected" ? "warning" : "info",
		});

		return result;
	},
});

export const getWorkoutPlan = paymentQuery
	.input({
		workoutPlanId: v.id("workoutPlans"),
	})
	.handler(async (ctx, args) => {
		const workoutPlan = await ctx.db.get(args.workoutPlanId);
		if (!workoutPlan) {
			return null;
		}

		const [ownedPlanEntries, supersededPlanEntries] = await Promise.all([
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_workout_plan", (q) =>
					q.eq("workoutPlanId", args.workoutPlanId)
				)
				.collect(),
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_workout_supersession", (q) =>
					q.eq("supersededByWorkoutPlanId", args.workoutPlanId)
				)
				.collect(),
		]);

		return {
			workoutPlan,
			ownedPlanEntries,
			supersededPlanEntries,
		};
	})
	.public();

export const listWorkoutPlansByMortgage = paymentQuery
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const plans = await ctx.db
			.query("workoutPlans")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		return plans.sort((left, right) => right.createdAt - left.createdAt);
	})
	.public();
