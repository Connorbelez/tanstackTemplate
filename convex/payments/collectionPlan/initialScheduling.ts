import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

const MS_PER_DAY = 86_400_000;

const NON_CANCELLED_PLAN_ENTRY_STATUSES = [
	"planned",
	"executing",
	"completed",
	"rescheduled",
] as const;

interface CreateCollectionPlanEntryArgs {
	amount: number;
	method: string;
	obligationIds: Id<"obligations">[];
	rescheduledFromId?: Id<"collectionPlanEntries">;
	ruleId?: Id<"collectionRules">;
	scheduledDate: number;
	source: "default_schedule" | "retry_rule" | "late_fee_rule" | "admin";
	status: "planned" | "executing" | "completed" | "cancelled" | "rescheduled";
}

export interface ScheduleInitialEntriesArgs {
	delayDays: number;
	mortgageId?: Id<"mortgages">;
	nowMs?: number;
	ruleId?: Id<"collectionRules">;
}

export interface ScheduleInitialEntriesResult {
	created: number;
	createdPlanEntryIds: Id<"collectionPlanEntries">[];
	obligationIds: Id<"obligations">[];
	reused: number;
	reusedPlanEntryIds: Id<"collectionPlanEntries">[];
}

async function createEntryImpl(
	ctx: Pick<MutationCtx, "db">,
	args: CreateCollectionPlanEntryArgs
): Promise<Id<"collectionPlanEntries">> {
	return await ctx.db.insert("collectionPlanEntries", {
		obligationIds: args.obligationIds,
		amount: args.amount,
		method: args.method,
		scheduledDate: args.scheduledDate,
		status: args.status,
		source: args.source,
		ruleId: args.ruleId,
		rescheduledFromId: args.rescheduledFromId,
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
	scheduledBefore: number
): Promise<Record<string, Id<"collectionPlanEntries">>> {
	if (obligationIds.length === 0) {
		return {};
	}

	const lookupSet = new Set(obligationIds);
	const existingEntries = (
		await Promise.all(
			NON_CANCELLED_PLAN_ENTRY_STATUSES.map((status) =>
				ctx.db
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

	if (obligations.length === 0) {
		return {
			created: 0,
			createdPlanEntryIds: [],
			obligationIds: [],
			reused: 0,
			reusedPlanEntryIds: [],
		};
	}

	const coveredObligations = await getCoveredPlanEntriesForObligations(
		ctx,
		obligations.map((obligation) => obligation._id),
		dueBefore
	);

	const createdPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	const reusedPlanEntryIds: Id<"collectionPlanEntries">[] = [];

	for (const obligation of obligations) {
		const existingEntryId = coveredObligations[obligation._id];
		if (existingEntryId) {
			reusedPlanEntryIds.push(existingEntryId);
			continue;
		}

		const entryId = await createEntryImpl(ctx, {
			obligationIds: [obligation._id],
			amount: obligation.amount,
			method: "manual",
			scheduledDate: obligation.dueDate - args.delayDays * MS_PER_DAY,
			status: "planned",
			source: "default_schedule",
			ruleId: args.ruleId,
		});
		createdPlanEntryIds.push(entryId);
	}

	return {
		created: createdPlanEntryIds.length,
		createdPlanEntryIds,
		obligationIds: obligations.map((obligation) => obligation._id),
		reused: reusedPlanEntryIds.length,
		reusedPlanEntryIds,
	};
}
