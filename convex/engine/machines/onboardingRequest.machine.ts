import { setup } from "xstate";

export const onboardingRequestMachine = setup({
	types: {
		context: {} as Record<string, never>,
		events: {} as
			| { type: "APPROVE" }
			| { type: "REJECT" }
			| { type: "ASSIGN_ROLE" },
	},
	actions: {
		// No-op: the transition engine reads the action name from the machine config
		// and schedules the matching effect from the effect registry.
		notifyApplicantApproved: () => {
			/* resolved by GT effect registry */
		},
		notifyApplicantRejected: () => {
			/* resolved by GT effect registry */
		},
		assignRole: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "onboardingRequest",
	initial: "pending_review",
	context: {},
	states: {
		pending_review: {
			on: {
				APPROVE: {
					target: "approved",
					actions: ["notifyApplicantApproved"],
				},
				REJECT: {
					target: "rejected",
					actions: ["notifyApplicantRejected"],
				},
			},
		},
		approved: {
			on: {
				ASSIGN_ROLE: {
					target: "role_assigned",
					actions: ["assignRole"],
				},
			},
		},
		rejected: { type: "final" },
		role_assigned: { type: "final" },
	},
});
