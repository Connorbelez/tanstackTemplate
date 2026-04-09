import { vi } from "vitest";

interface SchedulableTestRuntime {
	finishAllScheduledFunctions(
		callback: () => void,
		maxIterations?: number
	): Promise<void>;
	finishInProgressScheduledFunctions(): Promise<void>;
	run<T>(
		handler: (ctx: {
			db: {
				system: {
					query: (
						tableName: "_scheduled_functions"
					) => {
						collect(): Promise<
							Array<{
								state: { kind: string };
							}>
						>;
					};
				};
			};
		}) => Promise<T> | T
	): Promise<T>;
}

async function getRemainingScheduledJobCount(t: SchedulableTestRuntime) {
	return t.run(async (ctx) => {
		const jobs = await ctx.db.system.query("_scheduled_functions").collect();
		return jobs.filter(
			(job) => job.state.kind === "pending" || job.state.kind === "inProgress"
		).length;
	});
}

export async function drainScheduledWork(
	t: SchedulableTestRuntime,
	options?: { flushMicrotasks?: boolean; maxIterations?: number }
) {
	const maxIterations = options?.maxIterations ?? 100;

	for (let iteration = 0; iteration < maxIterations; iteration += 1) {
		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		if (options?.flushMicrotasks) {
			await Promise.resolve();
		}

		const remainingJobs = await getRemainingScheduledJobCount(t);
		if (remainingJobs > 0) {
			continue;
		}

		// Convex-test schedules zero-delay follow-up jobs by first inserting a
		// pending job and only then starting it on the next timer tick. Re-run
		// timers and re-check so we only return once the queue stabilizes at zero.
		vi.runAllTimers();
		if (options?.flushMicrotasks) {
			await Promise.resolve();
		}

		const stabilizedJobs = await getRemainingScheduledJobCount(t);
		if (stabilizedJobs === 0) {
			return;
		}
	}

	throw new Error(
		"drainScheduledWork: too many iterations while waiting for scheduled jobs to settle"
	);
}
