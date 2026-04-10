/**
 * Shared seeding helpers for cross-entity payment chain integration tests.
 *
 * Provides entity creation for collection rules, plan entries, collection
 * attempts, and convenience wrappers around the transition mutation and
 * effect invocation so payment chain tests stay concise and consistent.
 */

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
import { drainScheduledWork as drainScheduledRuntime } from "../runtime";

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
			priority: 15,
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
		| "admin_reschedule"
		| "admin_workout";
	createdByRuleId?: Id<"collectionRules">;
	retryOfId?: Id<"collectionPlanEntries">;
	workoutPlanId?: Id<"workoutPlans">;
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
	return t.run(async (ctx) => {
		if (opts.obligationIds.length === 0) {
			throw new Error("seedPlanEntry requires at least one obligation");
		}

		const firstObligation = await ctx.db.get(opts.obligationIds[0]);
		if (!firstObligation) {
			throw new Error("seedPlanEntry could not load the first obligation");
		}

		for (const obligationId of opts.obligationIds.slice(1)) {
			const obligation = await ctx.db.get(obligationId);
			if (!obligation) {
				throw new Error("seedPlanEntry could not load an obligation");
			}
			if (obligation.mortgageId !== firstObligation.mortgageId) {
				throw new Error(
					"seedPlanEntry expects all obligations to belong to the same mortgage"
				);
			}
		}

		return ctx.db.insert("collectionPlanEntries", {
			mortgageId: firstObligation.mortgageId,
			obligationIds: opts.obligationIds,
			amount: opts.amount,
			method: opts.method,
			scheduledDate: opts.scheduledDate ?? Date.now(),
			status: opts.status ?? "planned",
			source: opts.source ?? "default_schedule",
			createdByRuleId: opts.createdByRuleId,
			retryOfId: opts.retryOfId,
			workoutPlanId: opts.workoutPlanId,
			rescheduledFromId: opts.rescheduledFromId,
			rescheduleReason: opts.rescheduleReason,
			rescheduleRequestedAt: opts.rescheduleRequestedAt,
			rescheduleRequestedByActorId: opts.rescheduleRequestedByActorId,
			rescheduleRequestedByActorType: opts.rescheduleRequestedByActorType,
			createdAt: Date.now(),
		});
	});
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
	return t.run(async (ctx) => {
		const planEntry = await ctx.db.get(opts.planEntryId);
		if (!planEntry) {
			throw new Error("seedCollectionAttempt requires an existing plan entry");
		}

		return ctx.db.insert("collectionAttempts", {
			status: opts.status ?? "initiated",
			machineContext: opts.machineContext ?? {
				attemptId: "",
				retryCount: 0,
				maxRetries: 3,
			},
			planEntryId: opts.planEntryId,
			mortgageId: planEntry.mortgageId,
			obligationIds: planEntry.obligationIds,
			method: opts.method,
			amount: opts.amount,
			providerRef: opts.providerRef,
			initiatedAt: Date.now(),
		});
	});
}

// ── Settlement / Dispersal Prerequisites ───────────────────────────

export async function ensureBorrowerReceivableAccount(
	t: GovernedTestConvex,
	args: {
		initialDebitBalance?: bigint;
		obligationId: Id<"obligations">;
	}
): Promise<Id<"cash_ledger_accounts">> {
	return t.run(async (ctx) => {
		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation) {
			throw new Error(
				"ensureBorrowerReceivableAccount requires an existing obligation"
			);
		}

		const existing = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_family_and_obligation", (q) =>
				q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", args.obligationId)
			)
			.first();
		if (existing) {
			return existing._id;
		}

		return ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: obligation.mortgageId,
			obligationId: args.obligationId,
			borrowerId: obligation.borrowerId,
			cumulativeDebits:
				args.initialDebitBalance ?? BigInt(obligation.amount),
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});
	});
}

export async function ensureActivePositionForMortgage(
	t: GovernedTestConvex,
	args: {
		mortgageId: Id<"mortgages">;
		units?: bigint;
	}
): Promise<{
	accountId: Id<"ledger_accounts">;
	lenderAuthId: string;
	lenderId: Id<"lenders">;
}> {
	const brokerId = await seedBrokerProfile(t);
	return t.run(async (ctx) => {
		const lenderAuthId = `test-active-position-${args.mortgageId}`;
		const existingAccount = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage_and_lender", (q) =>
				q.eq("mortgageId", String(args.mortgageId)).eq("lenderId", lenderAuthId)
			)
			.first();

		let lenderId =
			(
				await ctx.db
					.query("lenders")
					.filter((q) => q.eq(q.field("onboardingEntryPath"), lenderAuthId))
					.first()
			)?._id ?? null;

		if (!lenderId) {
			const userId = await ctx.db.insert("users", {
				authId: lenderAuthId,
				email: `${lenderAuthId}@fairlend.test`,
				firstName: "Active",
				lastName: "Position",
			});
			lenderId = await ctx.db.insert("lenders", {
				userId,
				brokerId,
				accreditationStatus: "accredited",
				onboardingEntryPath: lenderAuthId,
				status: "active",
				createdAt: Date.now(),
			});
		}

		if (existingAccount) {
			return {
				accountId: existingAccount._id,
				lenderAuthId,
				lenderId,
			};
		}

		const accountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId: String(args.mortgageId),
			lenderId: lenderAuthId,
			cumulativeDebits: args.units ?? 10_000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: Date.now(),
		});

		return { accountId, lenderAuthId, lenderId };
	});
}

export async function seedCollectionSettlementPrereqs(
	t: GovernedTestConvex,
	args: {
		mortgageId: Id<"mortgages">;
		obligationId: Id<"obligations">;
		initialReceivableBalance?: bigint;
		positionUnits?: bigint;
	}
) {
	const borrowerReceivableAccountId = await ensureBorrowerReceivableAccount(t, {
		obligationId: args.obligationId,
		initialDebitBalance: args.initialReceivableBalance,
	});
	const activePosition = await ensureActivePositionForMortgage(t, {
		mortgageId: args.mortgageId,
		units: args.positionUnits,
	});

	return {
		activePosition,
		borrowerReceivableAccountId,
	};
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
	await drainScheduledRuntime(t);
}
