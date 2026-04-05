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
	balancePreCheckRuleId: Id<"collectionRules">;
	scheduleRuleId: Id<"collectionRules">;
	retryRuleId: Id<"collectionRules">;
	lateFeeRuleId: Id<"collectionRules">;
}

/**
 * Seeds the canonical collection rules:
 * - balance_pre_check_rule (trigger="event", priority=15)
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

	const getCanonicalRuleId = (ruleCode: string) => {
		const matches = rules.filter(
			(rule) => (rule.code ?? rule.name) === ruleCode
		);
		if (matches.length !== 1) {
			throw new Error(
				`Expected exactly one canonical ${ruleCode} rule, found ${matches.length}`
			);
		}
		return matches[0]._id;
	};

	const scheduleRuleId = getCanonicalRuleId("schedule_rule");
	const balancePreCheckRuleId = getCanonicalRuleId("balance_pre_check_rule");
	const retryRuleId = getCanonicalRuleId("retry_rule");
	const lateFeeRuleId = getCanonicalRuleId("late_fee_rule");

	return {
		balancePreCheckRuleId,
		scheduleRuleId,
		retryRuleId,
		lateFeeRuleId,
	};
}

export async function seedBalancePreCheckRule(
	t: GovernedTestConvex,
	options?: {
		blockingDecision?: "defer" | "suppress" | "require_operator_review";
		deferDays?: number;
		failureCountThreshold?: number;
		lookbackDays?: number;
	}
): Promise<Id<"collectionRules">> {
	return t.run(async (ctx) =>
		ctx.db.insert("collectionRules", {
			kind: "balance_pre_check",
			code: `balance_pre_check_${options?.blockingDecision ?? "defer"}`,
			displayName: "Balance pre-check",
			description:
				"Blocks or defers collection when recent failed inbound transfer history indicates insufficient funds risk.",
			trigger: "event",
			status: "active",
			scope: { scopeType: "global" },
			config: {
				kind: "balance_pre_check",
				signalSource: "recent_transfer_failures",
				lookbackDays: options?.lookbackDays ?? 14,
				failureCountThreshold: options?.failureCountThreshold ?? 1,
				blockingDecision: options?.blockingDecision ?? "defer",
				deferDays:
					options?.blockingDecision === "defer"
						? (options?.deferDays ?? 3)
						: undefined,
			},
			version: 1,
			createdByActorId: "test",
			updatedByActorId: "test",
			name: "balance_pre_check_rule",
			action: "balance_pre_check",
			parameters: {},
			priority: 15,
			enabled: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

export async function seedRecentFailedInboundTransfer(
	t: GovernedTestConvex,
	args: {
		borrowerId: Id<"borrowers">;
		mortgageId: Id<"mortgages">;
		createdAt?: number;
		failureCode?: string;
		failureReason?: string;
	}
): Promise<Id<"transferRequests">> {
	const createdAt = args.createdAt ?? Date.now() - 60_000;
	return t.run(async (ctx) =>
		ctx.db.insert("transferRequests", {
			status: "failed",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 300_000,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: `${args.borrowerId}`,
			providerCode: "manual",
			idempotencyKey: `balance-pre-check:${args.borrowerId}:${createdAt}`,
			source: { channel: "scheduler", actorType: "system" },
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			createdAt,
			lastTransitionAt: createdAt,
			failedAt: createdAt,
			failureCode: args.failureCode ?? "NSF",
			failureReason: args.failureReason ?? "insufficient_funds",
		}),
	);
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
	source?:
		| "default_schedule"
		| "retry_rule"
		| "late_fee_rule"
		| "admin"
		| "admin_reschedule";
	ruleId?: Id<"collectionRules">;
	rescheduleReason?: string;
	rescheduleRequestedAt?: number;
	rescheduleRequestedByActorId?: string;
	rescheduleRequestedByActorType?:
		| "admin"
		| "borrower"
		| "broker"
		| "member"
		| "system";
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
			rescheduleReason: opts.rescheduleReason,
			rescheduleRequestedAt: opts.rescheduleRequestedAt,
			rescheduleRequestedByActorId: opts.rescheduleRequestedByActorId,
			rescheduleRequestedByActorType: opts.rescheduleRequestedByActorType,
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
