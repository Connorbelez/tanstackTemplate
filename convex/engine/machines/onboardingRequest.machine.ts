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
		notifyAdminNewRequest: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "onboardingRequest",
	initial: "pending_review",
	context: {},
	states: {
		pending_review: {
			// Entry action: notifies admins when a new request arrives.
			// Note: the GT engine currently schedules transition actions only (not entry/exit).
			// For Phase 1, this effect is triggered explicitly from creation mutations.
			// Future: extend extractScheduledEffects to handle entry/exit actions.
			entry: ["notifyAdminNewRequest"],
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
