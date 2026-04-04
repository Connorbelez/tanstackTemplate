/**
 * Shared seeding helpers for cross-entity payment chain integration tests.
 *
 * Provides entity creation for collection rules, plan entries, collection
 * attempts, and convenience wrappers around the transition mutation and
 * effect invocation so payment chain tests stay concise and consistent.
 */

import { vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { EntityType } from "../../../../convex/engine/types";
import {
	seedBorrowerProfile,
	seedBrokerProfile,
	seedMortgage,
	seedObligation,
} from "../engine/helpers";
import {
	createGovernedTestConvex,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";

export type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

// Re-export foundation helpers for convenience
export {
	createGovernedTestConvex,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";
export {
	seedBorrowerProfile,
	seedBrokerProfile,
	seedMortgage,
	seedObligation,
} from "../engine/helpers";

// ── Collection Rules Seeding ────────────────────────────────────────

export interface SeededRules {
	scheduleRuleId: Id<"collectionRules">;
	retryRuleId: Id<"collectionRules">;
	lateFeeRuleId: Id<"collectionRules">;
}

/**
 * Seeds the three standard collection rules:
 * - schedule_rule (trigger="schedule", priority=10)
 * - retry_rule (trigger="event", priority=20)
 * - late_fee_rule (trigger="event", priority=30)
 */
export async function seedCollectionRules(
	t: GovernedTestConvex,
): Promise<SeededRules> {
	await t.mutation(internal.payments.collectionPlan.seed.seedCollectionRules, {});

	const rules = await t.run(async (ctx) =>
		ctx.db.query("collectionRules").collect()
	);

	const scheduleRuleId = rules.find(
		(rule) => (rule.code ?? rule.name) === "schedule_rule"
	)?._id;
	const retryRuleId = rules.find(
		(rule) => (rule.code ?? rule.name) === "retry_rule"
	)?._id;
	const lateFeeRuleId = rules.find(
		(rule) => (rule.code ?? rule.name) === "late_fee_rule"
	)?._id;

	if (!scheduleRuleId || !retryRuleId || !lateFeeRuleId) {
		throw new Error("Expected canonical collection rules to be seeded");
	}

	return { scheduleRuleId, retryRuleId, lateFeeRuleId };
}

// ── Plan Entry Seeding ──────────────────────────────────────────────

interface SeedPlanEntryOptions {
	obligationIds: Id<"obligations">[];
	amount: number;
	method: string;
	scheduledDate?: number;
	status?:
		| "planned"
		| "executing"
		| "completed"
		| "cancelled"
		| "rescheduled";
	source?: "default_schedule" | "retry_rule" | "late_fee_rule" | "admin";
	ruleId?: Id<"collectionRules">;
	rescheduledFromId?: Id<"collectionPlanEntries">;
}

/**
 * Seeds a collection plan entry with sensible defaults.
 */
export async function seedPlanEntry(
	t: GovernedTestConvex,
	opts: SeedPlanEntryOptions,
): Promise<Id<"collectionPlanEntries">> {
	return t.run(async (ctx) =>
		ctx.db.insert("collectionPlanEntries", {
			obligationIds: opts.obligationIds,
			amount: opts.amount,
			method: opts.method,
			scheduledDate: opts.scheduledDate ?? Date.now(),
			status: opts.status ?? "planned",
			source: opts.source ?? "default_schedule",
			ruleId: opts.ruleId,
			rescheduledFromId: opts.rescheduledFromId,
			createdAt: Date.now(),
		}),
	);
}

// ── Collection Attempt Seeding ──────────────────────────────────────

interface SeedCollectionAttemptOptions {
	planEntryId: Id<"collectionPlanEntries">;
	method: string;
	amount: number;
	status?: string;
	machineContext?: Record<string, unknown>;
	providerRef?: string;
}

/**
 * Seeds a collection attempt entity with sensible defaults.
 */
export async function seedCollectionAttempt(
	t: GovernedTestConvex,
	opts: SeedCollectionAttemptOptions,
): Promise<Id<"collectionAttempts">> {
	return t.run(async (ctx) =>
		ctx.db.insert("collectionAttempts", {
			status: opts.status ?? "initiated",
			machineContext: opts.machineContext ?? {
				attemptId: "",
				retryCount: 0,
				maxRetries: 3,
			},
			planEntryId: opts.planEntryId,
			method: opts.method,
			amount: opts.amount,
			providerRef: opts.providerRef,
			initiatedAt: Date.now(),
		}),
	);
}

// ── Transition Wrapper ──────────────────────────────────────────────

/**
 * Fires a governed transition via the transitionMutation internal mutation.
 * Returns the full TransitionResult from the engine.
 */
export function fireTransition(
	t: GovernedTestConvex,
	entityType: EntityType,
	entityId: string,
	eventType: string,
	payload?: Record<string, unknown>,
) {
	return t.mutation(internal.engine.transitionMutation.transitionMutation, {
		entityType,
		entityId,
		eventType,
		payload: payload ?? {},
		source: { actorType: "system", channel: "scheduler" },
	});
}

// ── Effect Invocation Args Builder ──────────────────────────────────

/**
 * Builds the argument object for manually invoking an effect mutation.
 * Uses `entityType` defaulting to the most common case in payment chain tests.
 */
export function buildEffectArgs(
	entityId: string,
	entityType: EntityType = "obligation",
	effectName: string,
	payload?: Record<string, unknown>,
) {
	return {
		entityId,
		entityType,
		eventType: "TEST",
		journalEntryId: `test-${effectName}`,
		effectName,
		payload,
		source: { actorType: "system" as const, channel: "scheduler" as const },
	};
}

// ── Drain Scheduled Work ────────────────────────────────────────────

/**
 * Drains all scheduled functions by running fake timers.
 * Re-exported from onboarding helpers for convenience.
 */
export async function drainScheduledWork(t: GovernedTestConvex) {
	await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}
