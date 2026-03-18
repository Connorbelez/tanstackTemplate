import { setup } from "xstate";

/**
 * Placeholder collection attempt machine — defines the initial state only.
 * ENG-62 will replace this with the full state × event matrix:
 * 7 states (initiated, pending, failed, retry_scheduled, confirmed, permanent_fail, cancelled)
 * × 8 events.
 */
export const COLLECTION_ATTEMPT_MACHINE_VERSION = "0.1.0";

export const collectionAttemptMachine = setup({
	types: {
		context: {} as Record<string, never>,
		events: {} as { type: "PLACEHOLDER" },
	},
}).createMachine({
	id: "collectionAttempt",
	version: COLLECTION_ATTEMPT_MACHINE_VERSION,
	initial: "initiated",
	context: {},
	states: {
		initiated: {},
	},
});
