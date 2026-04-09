import { vi } from "vitest";

interface SchedulableTestRuntime {
	finishAllScheduledFunctions(callback: () => void): Promise<void>;
}

export async function drainScheduledWork(
	t: SchedulableTestRuntime,
	options?: { flushMicrotasks?: boolean }
) {
	await t.finishAllScheduledFunctions(() => vi.runAllTimers());
	if (options?.flushMicrotasks) {
		await Promise.resolve();
	}
}
