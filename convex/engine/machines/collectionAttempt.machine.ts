import { assign, setup } from "xstate";

export const COLLECTION_ATTEMPT_MACHINE_VERSION = "1.2.0";

export const collectionAttemptMachine = setup({
	types: {
		context: {} as {
			attemptId: string;
			retryCount: number;
			maxRetries: number;
		},
		events: {} as
			| { type: "DRAW_INITIATED" }
			| { type: "PROVIDER_ACKNOWLEDGED" }
			| { type: "FUNDS_SETTLED"; settledAt: number }
			| { type: "DRAW_FAILED"; reason: string; code: string }
			| { type: "RETRY_ELIGIBLE" }
			| { type: "MAX_RETRIES_EXCEEDED" }
			| { type: "RETRY_INITIATED" }
			| { type: "ATTEMPT_CANCELLED"; reason: string }
			| { type: "PAYMENT_REVERSED"; reason: string },
	},
	guards: {
		canRetry: ({ context }) => context.retryCount < context.maxRetries,
	},
	actions: {
		emitPaymentReceived: () => {
			/* resolved by GT effect registry */
		},
		incrementRetryCount: assign({
			retryCount: ({ context }) => context.retryCount + 1,
		}),
		scheduleRetryEntry: () => {
			/* resolved by GT effect registry */
		},
		emitCollectionFailed: () => {
			/* resolved by GT effect registry */
		},
		notifyAdmin: () => {
			/* resolved by GT effect registry */
		},
		emitPaymentReversed: () => {
			/* resolved by GT effect registry */
		},
		recordSettlementObserved: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "collectionAttempt",
	version: COLLECTION_ATTEMPT_MACHINE_VERSION,
	initial: "initiated",
	context: {
		attemptId: "",
		retryCount: 0,
		maxRetries: 3,
	},
	states: {
		initiated: {
			on: {
				DRAW_INITIATED: {
					target: "pending",
				},
				DRAW_FAILED: {
					target: "failed",
					actions: ["incrementRetryCount"],
				},
				DRAW_FAILED: {
					target: "failed",
					actions: ["incrementRetryCount"],
				},
				FUNDS_SETTLED: {
					target: "confirmed",
					actions: ["emitPaymentReceived"],
				},
				ATTEMPT_CANCELLED: {
					target: "cancelled",
				},
			},
		},
		pending: {
			on: {
				FUNDS_SETTLED: {
					target: "confirmed",
					actions: ["emitPaymentReceived"],
				},
				DRAW_FAILED: {
					target: "failed",
					actions: ["incrementRetryCount"],
				},
			},
		},
		failed: {
			on: {
				RETRY_ELIGIBLE: {
					target: "retry_scheduled",
					guard: "canRetry",
					actions: ["scheduleRetryEntry"],
				},
				MAX_RETRIES_EXCEEDED: {
					target: "permanent_fail",
					actions: ["emitCollectionFailed", "notifyAdmin"],
				},
			},
		},
		retry_scheduled: {
			on: {
				RETRY_INITIATED: {
					target: "pending",
				},
			},
		},
		confirmed: {
			on: {
				FUNDS_SETTLED: {
					actions: ["recordSettlementObserved"],
				},
				PAYMENT_REVERSED: {
					target: "reversed",
					actions: ["emitPaymentReversed"],
				},
			},
		},
		reversed: { type: "final" },
		permanent_fail: { type: "final" },
		cancelled: { type: "final" },
	},
});
