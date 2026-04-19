import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { businessDateToUnixMs } from "../../lib/businessDates";

function validateCount(name: string, value: number): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(
			`${name} must be a non-negative safe integer, received: ${value}`
		);
	}
}

export const recordBatchOverflowMetrics = internalMutation({
	args: {
		jobName: v.string(),
		businessDate: v.string(),
		batchSize: v.number(),
		newlyDueCount: v.number(),
		pastGraceCount: v.number(),
	},
	handler: async (ctx, args) => {
		try {
			businessDateToUnixMs(args.businessDate);
		} catch (e) {
			throw new Error(
				`Invalid businessDate for monitoring: ${args.businessDate} — ${e instanceof Error ? e.message : String(e)}`
			);
		}

		validateCount("batchSize", args.batchSize);
		validateCount("newlyDueCount", args.newlyDueCount);
		validateCount("pastGraceCount", args.pastGraceCount);

		const existing = await ctx.db
			.query("obligationCronMonitoring")
			.withIndex("by_job_name", (q) => q.eq("jobName", args.jobName))
			.first();

		const newlyDueOverflow = args.newlyDueCount > args.batchSize;
		const pastGraceOverflow = args.pastGraceCount > args.batchSize;
		const updatedAt = Date.now();

		if (existing?.lastRunBusinessDate === args.businessDate) {
			await ctx.db.patch(existing._id, {
				lastNewlyDueCount: Math.max(
					existing.lastNewlyDueCount,
					args.newlyDueCount
				),
				lastPastGraceCount: Math.max(
					existing.lastPastGraceCount,
					args.pastGraceCount
				),
				updatedAt,
			});

			return {
				isSameBusinessDate: true,
				newlyDueOverflow,
				pastGraceOverflow,
				newlyDueOverflowStreak: existing.newlyDueOverflowStreak,
				pastGraceOverflowStreak: existing.pastGraceOverflowStreak,
			};
		}

		const nextNewlyDueOverflowStreak = newlyDueOverflow
			? (existing?.newlyDueOverflowStreak ?? 0) + 1
			: 0;
		const nextPastGraceOverflowStreak = pastGraceOverflow
			? (existing?.pastGraceOverflowStreak ?? 0) + 1
			: 0;

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastRunBusinessDate: args.businessDate,
				newlyDueOverflowStreak: nextNewlyDueOverflowStreak,
				pastGraceOverflowStreak: nextPastGraceOverflowStreak,
				lastNewlyDueCount: args.newlyDueCount,
				lastPastGraceCount: args.pastGraceCount,
				updatedAt,
			});
		} else {
			await ctx.db.insert("obligationCronMonitoring", {
				jobName: args.jobName,
				lastRunBusinessDate: args.businessDate,
				newlyDueOverflowStreak: nextNewlyDueOverflowStreak,
				pastGraceOverflowStreak: nextPastGraceOverflowStreak,
				lastNewlyDueCount: args.newlyDueCount,
				lastPastGraceCount: args.pastGraceCount,
				updatedAt,
			});
		}

		return {
			isSameBusinessDate: false,
			newlyDueOverflow,
			pastGraceOverflow,
			newlyDueOverflowStreak: nextNewlyDueOverflowStreak,
			pastGraceOverflowStreak: nextPastGraceOverflowStreak,
		};
	},
});

export const getBatchOverflowMetrics = internalQuery({
	args: {
		jobName: v.string(),
	},
	handler: async (ctx, args) => {
		return ctx.db
			.query("obligationCronMonitoring")
			.withIndex("by_job_name", (q) => q.eq("jobName", args.jobName))
			.first();
	},
});
