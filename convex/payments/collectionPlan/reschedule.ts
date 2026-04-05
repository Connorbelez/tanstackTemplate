import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { auditLog } from "../../auditLog";
import { buildSource } from "../../engine/commands";
import { paymentMutation } from "../../fluent";

const reschedulePlanEntryReasonCodeValues = [
	"invalid_reason",
	"invalid_scheduled_date",
	"plan_entry_not_found",
	"plan_entry_already_rescheduled",
	"plan_entry_due_for_execution",
	"plan_entry_has_execution_state",
	"plan_entry_not_reschedulable_state",
] as const;

type ReschedulePlanEntryReasonCode =
	(typeof reschedulePlanEntryReasonCodeValues)[number];

type ReschedulePlanEntryResult =
	| {
			originalPlanEntryId: Id<"collectionPlanEntries">;
			originalPlanEntryStatusAfter: "rescheduled";
			outcome: "rescheduled";
			replacementPlanEntryId: Id<"collectionPlanEntries">;
			replacementPlanEntryStatusAfter: "planned";
			replacementScheduledDate: number;
			requestedAt: number;
	  }
	| {
			outcome: "rejected";
			planEntryId: Id<"collectionPlanEntries">;
			reasonCode: ReschedulePlanEntryReasonCode;
			reasonDetail: string;
			requestedAt: number;
	  };

function isFiniteTimestamp(value: number) {
	return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isPlanEntryDueForExecution(
	planEntry: {
		balancePreCheckDecision?: string;
		balancePreCheckNextEvaluationAt?: number;
		scheduledDate: number;
	},
	requestedAt: number
) {
	if (planEntry.scheduledDate > requestedAt) {
		return false;
	}

	if (
		planEntry.balancePreCheckDecision === "suppress" ||
		planEntry.balancePreCheckDecision === "require_operator_review"
	) {
		return false;
	}

	if (planEntry.balancePreCheckDecision === "defer") {
		return (
			planEntry.balancePreCheckNextEvaluationAt === undefined ||
			planEntry.balancePreCheckNextEvaluationAt <= requestedAt
		);
	}

	return true;
}

async function logRescheduleAudit(args: {
	action: "collection_plan.reschedule_plan_entry";
	actorId: string;
	ctx: Parameters<typeof auditLog.log>[0];
	metadata: Record<string, unknown>;
	resourceId: string;
	severity: "info" | "warning";
}) {
	await auditLog.log(args.ctx, {
		action: args.action,
		actorId: args.actorId,
		resourceType: "collectionPlanEntries",
		resourceId: args.resourceId,
		severity: args.severity,
		metadata: args.metadata,
	});
}

export const reschedulePlanEntry = paymentMutation
	.input({
		newScheduledDate: v.number(),
		planEntryId: v.id("collectionPlanEntries"),
		reason: v.string(),
	})
	.handler(async (ctx, args): Promise<ReschedulePlanEntryResult> => {
		const requestedAt = Date.now();
		const reason = args.reason.trim();
		const actor = buildSource(ctx.viewer, "admin_dashboard");
		const actorId = ctx.viewer.authId;

		if (reason.length === 0) {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: args.planEntryId,
				reasonCode: "invalid_reason",
				reasonDetail: "Reschedule reason must be a non-empty string.",
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
				},
				resourceId: `${args.planEntryId}`,
				severity: "warning",
			});
			return result;
		}

		if (
			!isFiniteTimestamp(args.newScheduledDate) ||
			args.newScheduledDate <= requestedAt
		) {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: args.planEntryId,
				reasonCode: "invalid_scheduled_date",
				reasonDetail:
					"Replacement scheduled date must be a future integer timestamp.",
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
					requestedReason: reason,
				},
				resourceId: `${args.planEntryId}`,
				severity: "warning",
			});
			return result;
		}

		const planEntry = await ctx.db.get(args.planEntryId);
		if (!planEntry) {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: args.planEntryId,
				reasonCode: "plan_entry_not_found",
				reasonDetail: `Collection plan entry ${args.planEntryId} was not found.`,
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
					requestedReason: reason,
				},
				resourceId: `${args.planEntryId}`,
				severity: "warning",
			});
			return result;
		}

		const replacementEntries = await ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_rescheduled_from", (q) =>
				q.eq("rescheduledFromId", args.planEntryId)
			)
			.collect();

		if (planEntry.status === "rescheduled" || replacementEntries.length > 0) {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: planEntry._id,
				reasonCode: "plan_entry_already_rescheduled",
				reasonDetail:
					"Collection plan entry already has a replacement strategy entry.",
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
					existingReplacementIds: replacementEntries.map(
						(entry) => `${entry._id}`
					),
					requestedReason: reason,
				},
				resourceId: `${planEntry._id}`,
				severity: "warning",
			});
			return result;
		}

		if (planEntry.status !== "planned") {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: planEntry._id,
				reasonCode: "plan_entry_not_reschedulable_state",
				reasonDetail: `Plan entry is in status "${planEntry.status}" and cannot be rescheduled.`,
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
					requestedReason: reason,
				},
				resourceId: `${planEntry._id}`,
				severity: "warning",
			});
			return result;
		}

		const existingAttempt =
			planEntry.collectionAttemptId ??
			(
				await ctx.db
					.query("collectionAttempts")
					.withIndex("by_plan_entry", (q) =>
						q.eq("planEntryId", args.planEntryId)
					)
					.first()
			)?._id;

		if (
			existingAttempt ||
			planEntry.executedAt !== undefined ||
			planEntry.executionIdempotencyKey !== undefined
		) {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: planEntry._id,
				reasonCode: "plan_entry_has_execution_state",
				reasonDetail:
					"Plan entry already has execution linkage and can no longer be rescheduled safely.",
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
					existingAttemptId: existingAttempt ? `${existingAttempt}` : undefined,
					requestedReason: reason,
				},
				resourceId: `${planEntry._id}`,
				severity: "warning",
			});
			return result;
		}

		if (isPlanEntryDueForExecution(planEntry, requestedAt)) {
			const result: ReschedulePlanEntryResult = {
				outcome: "rejected",
				planEntryId: planEntry._id,
				reasonCode: "plan_entry_due_for_execution",
				reasonDetail:
					"Plan entry is currently eligible for scheduler execution and cannot be rescheduled safely.",
				requestedAt,
			};
			await logRescheduleAudit({
				action: "collection_plan.reschedule_plan_entry",
				actorId,
				ctx,
				metadata: {
					...result,
					requestedReason: reason,
				},
				resourceId: `${planEntry._id}`,
				severity: "warning",
			});
			return result;
		}

		const replacementPlanEntryId = await ctx.db.insert(
			"collectionPlanEntries",
			{
				obligationIds: planEntry.obligationIds,
				amount: planEntry.amount,
				method: planEntry.method,
				scheduledDate: args.newScheduledDate,
				status: "planned",
				source: "admin_reschedule",
				rescheduledFromId: planEntry._id,
				rescheduleReason: reason,
				rescheduleRequestedAt: requestedAt,
				rescheduleRequestedByActorId: actorId,
				rescheduleRequestedByActorType: actor.actorType ?? "admin",
				createdAt: requestedAt,
			}
		);

		await ctx.db.patch(planEntry._id, {
			status: "rescheduled",
			rescheduleReason: reason,
			rescheduleRequestedAt: requestedAt,
			rescheduleRequestedByActorId: actorId,
			rescheduleRequestedByActorType: actor.actorType ?? "admin",
		});

		const result: ReschedulePlanEntryResult = {
			outcome: "rescheduled",
			originalPlanEntryId: planEntry._id,
			originalPlanEntryStatusAfter: "rescheduled",
			replacementPlanEntryId,
			replacementPlanEntryStatusAfter: "planned",
			replacementScheduledDate: args.newScheduledDate,
			requestedAt,
		};

		await logRescheduleAudit({
			action: "collection_plan.reschedule_plan_entry",
			actorId,
			ctx,
			metadata: {
				...result,
				newScheduledDate: args.newScheduledDate,
				previousScheduledDate: planEntry.scheduledDate,
				reason,
				requestedByActorType: actor.actorType ?? "admin",
			},
			resourceId: `${planEntry._id}`,
			severity: "info",
		});

		return result;
	})
	.public();
