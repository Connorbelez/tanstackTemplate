import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";

export type WorkoutPlanStatus = "draft" | "active" | "completed" | "cancelled";
export type WorkoutPlanActorType =
	| "admin"
	| "borrower"
	| "broker"
	| "member"
	| "system";

export interface WorkoutPlanInstallment {
	amount: number;
	method: string;
	obligationIds: Doc<"collectionPlanEntries">["obligationIds"];
	scheduledDate: number;
}

export interface WorkoutPlanInstallmentInput {
	amount?: number;
	method: string;
	obligationIds: Doc<"collectionPlanEntries">["obligationIds"];
	scheduledDate: number;
}

export interface WorkoutPlanStrategy {
	installments: WorkoutPlanInstallment[];
	kind: "custom_schedule";
}

export const workoutPlanStatusValidator = v.union(
	v.literal("draft"),
	v.literal("active"),
	v.literal("completed"),
	v.literal("cancelled")
);

export const workoutPlanActorTypeValidator = v.union(
	v.literal("admin"),
	v.literal("borrower"),
	v.literal("broker"),
	v.literal("member"),
	v.literal("system")
);

export const workoutPlanInstallmentValidator = v.object({
	amount: v.number(),
	method: v.string(),
	obligationIds: v.array(v.id("obligations")),
	scheduledDate: v.number(),
});

export const workoutPlanInstallmentInputValidator = v.object({
	amount: v.optional(v.number()),
	method: v.string(),
	obligationIds: v.array(v.id("obligations")),
	scheduledDate: v.number(),
});

export const workoutPlanStrategyValidator = v.object({
	kind: v.literal("custom_schedule"),
	installments: v.array(workoutPlanInstallmentValidator),
});

export function getWorkoutPlanCoveredObligationIds(workoutPlan: {
	strategy: WorkoutPlanStrategy;
}) {
	const ids = new Set<string>();
	for (const installment of workoutPlan.strategy.installments) {
		for (const obligationId of installment.obligationIds) {
			ids.add(`${obligationId}`);
		}
	}
	return [...ids];
}
