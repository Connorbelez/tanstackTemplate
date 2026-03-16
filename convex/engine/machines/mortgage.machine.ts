import { assign, setup } from "xstate";

export interface MortgageMachineContext {
	lastPaymentAt: number;
	missedPayments: number;
}

export const mortgageMachine = setup({
	types: {
		context: {} as MortgageMachineContext,
		events: {} as
			| { type: "OBLIGATION_OVERDUE"; obligationId: string }
			| {
					type: "PAYMENT_CONFIRMED";
					obligationId: string;
					amount: number;
					paidAt: number;
			  }
			| { type: "DEFAULT_THRESHOLD_REACHED" }
			| { type: "COLLECTIONS_INITIATED" }
			| { type: "WRITE_OFF_APPROVED" }
			| { type: "MATURED" },
	},
	guards: {
		// Cure condition: transitions delinquent -> active when overdue payments are settled.
		// Uses <= 1 (not <= 0) because XState v5 evaluates guards BEFORE executing
		// assign actions. When PAYMENT_CONFIRMED arrives, the decrement hasn't happened
		// yet, so the guard sees the pre-decrement value.
		allOverduePaid: ({ context }) => context.missedPayments <= 1,
		// Default threshold: 3+ missed payments triggers default.
		gracePeriodExpired: ({ context }) => context.missedPayments >= 3,
	},
	actions: {
		incrementMissedPayments: assign({
			missedPayments: ({ context }) => context.missedPayments + 1,
		}),
		decrementMissedPayments: assign({
			missedPayments: ({ context }) => Math.max(0, context.missedPayments - 1),
		}),
		recordPayment: assign({
			lastPaymentAt: ({ event }) => {
				if ("paidAt" in event) {
					return event.paidAt;
				}
				return Date.now();
			},
			missedPayments: ({ context }) => Math.max(0, context.missedPayments - 1),
		}),
	},
}).createMachine({
	id: "mortgage",
	initial: "active",
	context: {
		missedPayments: 0,
		lastPaymentAt: 0,
	},
	states: {
		active: {
			on: {
				OBLIGATION_OVERDUE: {
					target: "delinquent",
					actions: ["incrementMissedPayments"],
				},
				PAYMENT_CONFIRMED: {
					target: "active",
					actions: ["recordPayment"],
				},
				MATURED: {
					target: "matured",
				},
			},
		},
		delinquent: {
			on: {
				PAYMENT_CONFIRMED: [
					{
						target: "active",
						guard: "allOverduePaid",
						actions: ["recordPayment"],
					},
					{
						target: "delinquent",
						actions: ["recordPayment"],
					},
				],
				OBLIGATION_OVERDUE: {
					target: "delinquent",
					actions: ["incrementMissedPayments"],
				},
				DEFAULT_THRESHOLD_REACHED: {
					target: "defaulted",
					guard: "gracePeriodExpired",
				},
			},
		},
		defaulted: {
			on: {
				COLLECTIONS_INITIATED: {
					target: "collections",
				},
			},
		},
		collections: {
			on: {
				WRITE_OFF_APPROVED: {
					target: "written_off",
				},
			},
		},
		written_off: { type: "final" },
		matured: { type: "final" },
	},
});
