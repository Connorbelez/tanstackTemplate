import { setup } from "xstate";

export const obligationMachine = setup({
	types: {
		context: {} as Record<string, never>,
		events: {} as
			| { type: "DUE_DATE_REACHED" }
			| { type: "GRACE_PERIOD_EXPIRED" }
			| { type: "PAYMENT_APPLIED"; amount: number; paidAt: number },
	},
	actions: {
		// No-op stubs: the Transition Engine reads action names from the machine
		// config and schedules the matching effect from the Effect Registry.
		emitObligationOverdue: () => {
			/* resolved by GT effect registry */
		},
		emitObligationSettled: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "obligation",
	initial: "upcoming",
	context: {},
	states: {
		upcoming: {
			on: {
				DUE_DATE_REACHED: {
					target: "due",
				},
			},
		},
		due: {
			on: {
				GRACE_PERIOD_EXPIRED: {
					target: "overdue",
					actions: ["emitObligationOverdue"],
				},
				PAYMENT_APPLIED: {
					target: "settled",
					actions: ["emitObligationSettled"],
				},
			},
		},
		overdue: {
			on: {
				PAYMENT_APPLIED: {
					target: "settled",
					actions: ["emitObligationSettled"],
				},
			},
		},
		settled: { type: "final" },
	},
});
