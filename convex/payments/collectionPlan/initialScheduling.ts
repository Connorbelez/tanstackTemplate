import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	compareCollectionRules,
	DEFAULT_SCHEDULE_RULE_CONFIG,
	getCollectionRuleKind,
	isCollectionRuleActive,
	isCollectionRuleEffectiveAt,
	matchesCollectionRuleScope,
} from "./ruleContract";

const MS_PER_DAY = 86_400_000;

const LIVE_COVERING_PLAN_ENTRY_STATUSES = ["planned", "executing"] as const;

const DEFAULT_SCHEDULABLE_OBLIGATION_STATUSES = new Set<
	Doc<"obligations">["status"]
>(["upcoming", "due", "overdue", "partially_settled"]);

export type CollectionPlanEntrySource =
	| "default_schedule"
	| "retry_rule"
	| "late_fee_rule"
	| "admin"
	| "admin_reschedule"
	| "admin_workout";

export interface CreateCollectionPlanEntryArgs {
	amount: number;
	createdByRuleId?: Id<"collectionRules">;
	method: string;
	obligationIds: Id<"obligations">[];
	rescheduledFromId?: Id<"collectionPlanEntries">;
	rescheduleReason?: string;
	rescheduleRequestedAt?: number;
	rescheduleRequestedByActorId?: string;
	rescheduleRequestedByActorType?:
		| "admin"
		| "borrower"
		| "broker"
		| "member"
		| "system";
	retryOfId?: Id<"collectionPlanEntries">;
	scheduledDate: number;
	source: CollectionPlanEntrySource;
	status: "planned" | "executing" | "completed" | "cancelled" | "rescheduled";
	workoutPlanId?: Id<"workoutPlans">;
}

export interface ScheduleInitialEntriesArgs {
	createdByRuleId?: Id<"collectionRules">;
	delayDays: number;
	mortgageId?: Id<"mortgages">;
	nowMs?: number;
}

export interface ScheduleInitialEntriesResult {
	created: number;
	createdPlanEntryIds: Id<"collectionPlanEntries">[];
	obligationIds: Id<"obligations">[];
	reused: number;
	reusedPlanEntryIds: Id<"collectionPlanEntries">[];
}

export interface EnsureDefaultEntriesForObligationsArgs {
	createdByRuleId?: Id<"collectionRules">;
	delayDays?: number;
	mortgageId?: Id<"mortgages">;
	nowMs?: number;
	obligations: Pick<
		Doc<"obligations">,
		"_id" | "amount" | "amountSettled" | "dueDate" | "mortgageId" | "status"
	>[];
}

export interface EnsureDefaultEntriesForObligationsResult
	extends ScheduleInitialEntriesResult {
	scheduleRuleMissing: boolean;
}

export async function createEntryImpl(
	ctx: Pick<MutationCtx, "db">,
	args: CreateCollectionPlanEntryArgs
): Promise<Id<"collectionPlanEntries">> {
	const [firstObligationId] = args.obligationIds;
	if (!firstObligationId) {
		throw new ConvexError(
			"Collection plan entries require at least one obligation"
		);
	}

	const firstObligation = await ctx.db.get(firstObligationId);
	if (!firstObligation) {
		throw new ConvexError(
			`Collection plan entry obligation not found: ${String(firstObligationId)}`
		);
	}

	for (const obligationId of args.obligationIds.slice(1)) {
		const obligation = await ctx.db.get(obligationId);
		if (!obligation) {
			throw new ConvexError(
				`Collection plan entry obligation not found: ${String(obligationId)}`
			);
		}
		if (obligation.mortgageId !== firstObligation.mortgageId) {
			throw new ConvexError(
				"Collection plan entry obligations must all belong to the same mortgage"
			);
		}
	}

	return await ctx.db.insert("collectionPlanEntries", {
		mortgageId: firstObligation.mortgageId,
		obligationIds: args.obligationIds,
		amount: args.amount,
		method: args.method,
		scheduledDate: args.scheduledDate,
		status: args.status,
		source: args.source,
		createdByRuleId: args.createdByRuleId,
		retryOfId: args.retryOfId,
		workoutPlanId: args.workoutPlanId,
		rescheduledFromId: args.rescheduledFromId,
		rescheduleReason: args.rescheduleReason,
		rescheduleRequestedAt: args.rescheduleRequestedAt,
		rescheduleRequestedByActorId: args.rescheduleRequestedByActorId,
		rescheduleRequestedByActorType: args.rescheduleRequestedByActorType,
		createdAt: Date.now(),
	});
}

async function getUpcomingObligationsInWindow(
	ctx: Pick<MutationCtx, "db">,
	args: { dueBefore: number; mortgageId?: Id<"mortgages"> }
) {
	if (args.mortgageId) {
		const mortgageId = args.mortgageId;
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_date", (q) =>
				q.eq("mortgageId", mortgageId).lte("dueDate", args.dueBefore)
			)
			.filter((q) => q.eq(q.field("status"), "upcoming"))
			.collect();
	}

	return await ctx.db
		.query("obligations")
		.withIndex("by_due_date", (q) =>
			q.eq("status", "upcoming").lte("dueDate", args.dueBefore)
		)
		.collect();
}

async function getCoveredPlanEntriesForObligations(
	ctx: Pick<MutationCtx, "db">,
	obligationIds: readonly Id<"obligations">[],
	scheduledBefore?: number
): Promise<Record<string, Id<"collectionPlanEntries">>> {
	if (obligationIds.length === 0) {
		return {};
	}

	const lookupSet = new Set(obligationIds);
	const existingEntries = (
		await Promise.all(
			LIVE_COVERING_PLAN_ENTRY_STATUSES.map((status) =>
				scheduledBefore === undefined
					? ctx.db
							.query("collectionPlanEntries")
							.withIndex("by_status", (q) => q.eq("status", status))
							.collect()
					: ctx.db
							.query("collectionPlanEntries")
							.withIndex("by_status_scheduled_date", (q) =>
								q.eq("status", status).lte("scheduledDate", scheduledBefore)
							)
							.collect()
			)
		)
	).flat();

	const result: Record<string, Id<"collectionPlanEntries">> = {};

	for (const entry of existingEntries) {
		for (const obligationId of entry.obligationIds) {
			if (lookupSet.has(obligationId) && !(obligationId in result)) {
				result[obligationId] = entry._id;
			}
		}
	}

	return result;
}

function getCollectibleOutstandingAmount(
	obligation: Pick<Doc<"obligations">, "amount" | "amountSettled">
) {
	return Math.max(0, obligation.amount - (obligation.amountSettled ?? 0));
}

async function resolveApplicableScheduleRule(
	ctx: Pick<MutationCtx, "db">,
	args: {
		asOfMs: number;
		mortgageId?: Id<"mortgages">;
	}
) {
	const candidates = await ctx.db
		.query("collectionRules")
		.withIndex("by_trigger", (q) =>
			q.eq("trigger", "schedule").eq("status", "active")
		)
		.collect();

	return (
		candidates
			.filter((rule) => getCollectionRuleKind(rule) === "schedule")
			.filter((rule) => isCollectionRuleActive(rule))
			.filter((rule) => isCollectionRuleEffectiveAt(rule, args.asOfMs))
			.filter((rule) => matchesCollectionRuleScope(rule, args.mortgageId))
			.sort(compareCollectionRules)[0] ?? null
	);
}

export async function ensureDefaultEntriesForObligationsImpl(
	ctx: Pick<MutationCtx, "db">,
	args: EnsureDefaultEntriesForObligationsArgs
): Promise<EnsureDefaultEntriesForObligationsResult> {
	const now = args.nowMs ?? Date.now();
	const eligibleObligations = args.obligations.filter(
		(obligation) =>
			DEFAULT_SCHEDULABLE_OBLIGATION_STATUSES.has(obligation.status) &&
			getCollectibleOutstandingAmount(obligation) > 0
	);

	if (eligibleObligations.length === 0) {
		return {
			created: 0,
			createdPlanEntryIds: [],
			obligationIds: [],
			reused: 0,
			reusedPlanEntryIds: [],
			scheduleRuleMissing: false,
		};
	}

	const scheduleRule =
		args.delayDays === undefined
			? await resolveApplicableScheduleRule(ctx, {
					asOfMs: now,
					mortgageId: args.mortgageId ?? eligibleObligations[0]?.mortgageId,
				})
			: null;
	const delayDays =
		args.delayDays ??
		(scheduleRule?.config.kind === "schedule"
			? scheduleRule.config.delayDays
			: DEFAULT_SCHEDULE_RULE_CONFIG.delayDays);
	const createdByRuleId =
		args.createdByRuleId ??
		(scheduleRule?.config.kind === "schedule" ? scheduleRule._id : undefined);
	const scheduleRuleMissing =
		args.delayDays === undefined && scheduleRule === null;
	const scheduledBeforeForCoverage =
		args.delayDays === undefined ? undefined : now + delayDays * MS_PER_DAY;

	const coveredObligations = await getCoveredPlanEntriesForObligations(
		ctx,
		eligibleObligations.map((obligation) => obligation._id),
		scheduledBeforeForCoverage
	);

	const createdPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	const reusedPlanEntryIds: Id<"collectionPlanEntries">[] = [];

	for (const obligation of eligibleObligations) {
		const existingEntryId = coveredObligations[obligation._id];
		if (existingEntryId) {
			reusedPlanEntryIds.push(existingEntryId);
			continue;
		}

		const scheduledDate =
			obligation.status === "upcoming"
				? obligation.dueDate - delayDays * MS_PER_DAY
				: now;
		const entryId = await createEntryImpl(ctx, {
			obligationIds: [obligation._id],
			amount: getCollectibleOutstandingAmount(obligation),
			method: "manual",
			scheduledDate,
			status: "planned",
			source: "default_schedule",
			createdByRuleId,
		});
		createdPlanEntryIds.push(entryId);
	}

	return {
		created: createdPlanEntryIds.length,
		createdPlanEntryIds,
		obligationIds: eligibleObligations.map((obligation) => obligation._id),
		reused: reusedPlanEntryIds.length,
		reusedPlanEntryIds,
		scheduleRuleMissing,
	};
}

export async function scheduleInitialEntriesImpl(
	ctx: Pick<MutationCtx, "db">,
	args: ScheduleInitialEntriesArgs
): Promise<ScheduleInitialEntriesResult> {
	if (!Number.isFinite(args.delayDays) || args.delayDays < 0) {
		throw new ConvexError(
			`delayDays must be a non-negative finite number, received ${args.delayDays}`
		);
	}

	const now = args.nowMs ?? Date.now();
	const dueBefore = now + args.delayDays * MS_PER_DAY;
	const obligations = await getUpcomingObligationsInWindow(ctx, {
		mortgageId: args.mortgageId,
		dueBefore,
	});
	const result = await ensureDefaultEntriesForObligationsImpl(ctx, {
		obligations,
		mortgageId: args.mortgageId,
		nowMs: now,
		delayDays: args.delayDays,
		createdByRuleId: args.createdByRuleId,
	});

	return {
		created: result.created,
		createdPlanEntryIds: result.createdPlanEntryIds,
		obligationIds: result.obligationIds,
		reused: result.reused,
		reusedPlanEntryIds: result.reusedPlanEntryIds,
	};
}
