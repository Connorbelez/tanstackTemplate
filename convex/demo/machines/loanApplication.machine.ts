// convex/demo/machines/loanApplication.machine.ts
import { setup } from "xstate";

export const loanApplicationMachine = setup({
	types: {
		context: {} as {
			entityId: string;
			data?: {
				applicantName?: string;
				loanAmount?: number;
			};
		},
		input: {} as {
			entityId: string;
			data?: {
				applicantName?: string;
				loanAmount?: number;
			};
		},
		events: {} as
			| { type: "SUBMIT" }
			| { type: "ASSIGN_REVIEWER" }
			| { type: "APPROVE" }
			| { type: "REJECT" }
			| { type: "REQUEST_INFO" }
			| { type: "RESUBMIT" }
			| { type: "REOPEN" }
			| { type: "FUND" }
			| { type: "CLOSE" },
	},
	actions: {
		// Marker actions — the transition engine reads these names from the
		// machine config and schedules real Convex side-effects server-side.
		// They are intentionally no-ops inside the pure machine definition.
		notifyReviewer: () => {
			/* no-op marker */
		},
		notifyApplicant: () => {
			/* no-op marker */
		},
		scheduleFunding: () => {
			/* no-op marker */
		},
		generateDocuments: () => {
			/* no-op marker */
		},
	},
	guards: {
		hasCompleteData: ({ context }) => {
			const data = context.data;
			return (
				data != null &&
				typeof data.applicantName === "string" &&
				data.applicantName.length > 0 &&
				typeof data.loanAmount === "number" &&
				data.loanAmount > 0
			);
		},
	},
}).createMachine({
	id: "loanApplication",
	context: ({ input }) => ({
		entityId: input.entityId,
		data: input.data,
	}),
	initial: "draft",
	states: {
		draft: {
			on: {
				SUBMIT: {
					target: "submitted",
					guard: "hasCompleteData",
					actions: ["notifyReviewer"],
				},
			},
		},
		submitted: {
			on: {
				ASSIGN_REVIEWER: {
					target: "under_review",
				},
			},
		},
		under_review: {
			on: {
				APPROVE: {
					target: "approved",
					actions: ["notifyApplicant"],
				},
				REJECT: {
					target: "rejected",
					actions: ["notifyApplicant"],
				},
				REQUEST_INFO: {
					target: "needs_info",
					actions: ["notifyApplicant"],
				},
			},
		},
		needs_info: {
			on: {
				RESUBMIT: {
					target: "under_review",
					actions: ["notifyReviewer"],
				},
			},
		},
		approved: {
			on: {
				FUND: {
					target: "funded",
					actions: ["scheduleFunding", "generateDocuments"],
				},
			},
		},
		rejected: {
			on: {
				REOPEN: {
					target: "draft",
				},
			},
		},
		funded: {
			on: {
				CLOSE: {
					target: "closed",
				},
			},
		},
		closed: { type: "final" },
	},
});
