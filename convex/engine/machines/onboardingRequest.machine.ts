import { setup } from "xstate";

export const onboardingRequestMachine = setup({
	types: {
		context: {} as { requestId: string },
		events: {} as
			| { type: "APPROVE" }
			| { type: "REJECT" }
			| { type: "ASSIGN_ROLE" },
	},
	actions: {
		// No-op: the transition engine reads the action name from the machine config
		// and schedules the matching effect from the effect registry.
		assignRoleToUser: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "onboardingRequest",
	initial: "pending_review",
	context: { requestId: "" },
	states: {
		pending_review: {
			on: {
				APPROVE: {
					target: "approved",
					actions: ["assignRoleToUser"],
				},
				REJECT: { target: "rejected" },
			},
		},
		approved: {
			on: { ASSIGN_ROLE: { target: "role_assigned" } },
		},
		rejected: { type: "final" },
		role_assigned: { type: "final" },
	},
});
