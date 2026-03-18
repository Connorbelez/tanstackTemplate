import { setup } from "xstate";

export const OBLIGATION_MACHINE_VERSION = "1.0.0";

type ObligationEvent =
	| { type: "BECAME_DUE" }
	| { type: "GRACE_PERIOD_EXPIRED" }
	| {
			type: "PAYMENT_APPLIED";
			amount: number;
			attemptId: string;
			currentAmountSettled: number;
			totalAmount: number;
	  }
	| { type: "OBLIGATION_WAIVED"; reason: string; approvedBy: string };

export const obligationMachine = setup({
	types: {
		context: {} as { obligationId: string; paymentsApplied: number },
		events: {} as ObligationEvent,
	},
	guards: {
		isFullySettled: ({ event }) => {
			const e = event as Extract<ObligationEvent, { type: "PAYMENT_APPLIED" }>;
			return e.currentAmountSettled + e.amount >= e.totalAmount;
		},
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
		createLateFeeObligation: () => {
			/* resolved by GT effect registry */
		},
		applyPayment: () => {
			/* resolved by GT effect registry */
		},
		recordWaiver: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "obligation",
	initial: "upcoming",
	context: { obligationId: "", paymentsApplied: 0 },
	states: {
		upcoming: {
			on: {
				BECAME_DUE: { target: "due" },
				OBLIGATION_WAIVED: {
					target: "waived",
					actions: ["recordWaiver"],
				},
			},
		},
		due: {
			on: {
				GRACE_PERIOD_EXPIRED: {
					target: "overdue",
					actions: ["emitObligationOverdue", "createLateFeeObligation"],
				},
				PAYMENT_APPLIED: [
					{
						target: "settled",
						guard: "isFullySettled",
						actions: ["applyPayment", "emitObligationSettled"],
					},
					{
						target: "partially_settled",
						actions: ["applyPayment"],
					},
				],
				OBLIGATION_WAIVED: {
					target: "waived",
					actions: ["recordWaiver"],
				},
			},
		},
		overdue: {
			on: {
				PAYMENT_APPLIED: [
					{
						target: "settled",
						guard: "isFullySettled",
						actions: ["applyPayment", "emitObligationSettled"],
					},
					{
						target: "partially_settled",
						actions: ["applyPayment"],
					},
				],
				OBLIGATION_WAIVED: {
					target: "waived",
					actions: ["recordWaiver"],
				},
			},
		},
		partially_settled: {
			on: {
				PAYMENT_APPLIED: [
					{
						target: "settled",
						guard: "isFullySettled",
						actions: ["applyPayment", "emitObligationSettled"],
					},
					{
						target: "partially_settled",
						actions: ["applyPayment"],
					},
				],
				GRACE_PERIOD_EXPIRED: {
					target: "overdue",
					actions: ["emitObligationOverdue"],
				},
				OBLIGATION_WAIVED: {
					target: "waived",
					actions: ["recordWaiver"],
				},
			},
		},
		settled: { type: "final" },
		waived: { type: "final" },
	},
});
