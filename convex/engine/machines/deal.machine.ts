import { setup } from "xstate";

export const DEAL_MACHINE_VERSION = "1.0.0";

const noopAction = () => {
	// Effect-marker stub for XState action typing.
};

export interface DealMachineContext {
	dealId: string;
	reservationId?: string;
}

/**
 * Sequential compound state machine governing the deal closing lifecycle.
 *
 * Three nested phases with structural phase gates (type: "final" + onDone):
 *   initiated → lawyerOnboarding → documentReview → fundsTransfer → confirmed
 *
 * DEAL_CANCELLED on each non-terminal state targets "failed" structurally.
 * (Root-level `on` is NOT used because XState v5 fires root handlers even from
 * `type: "final"` states, which would violate the terminal-state lockdown.)
 *
 * Pure data — zero Convex imports, zero I/O, zero database references.
 * Effects are declared as string names, resolved at runtime by the Effect Registry.
 */
export const dealMachine = setup({
	types: {
		context: {} as DealMachineContext,
		events: {} as
			| { type: "DEAL_LOCKED"; closingDate: number }
			| { type: "LAWYER_VERIFIED"; verificationId: string }
			| { type: "REPRESENTATION_CONFIRMED" }
			| { type: "LAWYER_APPROVED_DOCUMENTS" }
			| { type: "ALL_PARTIES_SIGNED" }
			| { type: "FUNDS_RECEIVED"; method: "vopay" | "wire_receipt" | "manual" }
			| { type: "DEAL_CANCELLED"; reason: string },
	},
	// Effect-marker actions — no-op stubs that satisfy XState v5's type system.
	// The actual side effects are resolved at runtime by the Effect Registry
	// via the Transition Engine's extractScheduledEffects + scheduleEffects pipeline.
	actions: {
		reserveShares: noopAction,
		notifyAllParties: noopAction,
		createDocumentPackage: noopAction,
		createDealAccess: noopAction,
		archiveSignedDocuments: noopAction,
		confirmFundsReceipt: noopAction,
		commitReservation: noopAction,
		prorateAccrualBetweenOwners: noopAction,
		updatePaymentSchedule: noopAction,
		voidReservation: noopAction,
		notifyCancellation: noopAction,
		revokeAllDealAccess: noopAction,
		revokeLawyerAccess: noopAction,
	},
}).createMachine({
	id: "deal",
	initial: "initiated",
	context: {
		dealId: "",
	},
	states: {
		initiated: {
			on: {
				DEAL_LOCKED: {
					target: "lawyerOnboarding",
					actions: [
						"reserveShares",
						"notifyAllParties",
						"createDocumentPackage",
					],
				},
				DEAL_CANCELLED: {
					target: "failed",
					actions: [
						"voidReservation",
						"notifyCancellation",
						"revokeAllDealAccess",
					],
				},
			},
		},
		lawyerOnboarding: {
			initial: "pending",
			states: {
				pending: {
					on: {
						LAWYER_VERIFIED: {
							target: "verified",
							actions: ["createDealAccess"],
						},
					},
				},
				verified: {
					on: {
						REPRESENTATION_CONFIRMED: {
							target: "complete",
						},
					},
				},
				complete: { type: "final" },
			},
			on: {
				DEAL_CANCELLED: {
					target: "#deal.failed",
					actions: [
						"voidReservation",
						"notifyCancellation",
						"revokeAllDealAccess",
					],
				},
			},
			onDone: { target: "documentReview" },
		},
		documentReview: {
			initial: "pending",
			states: {
				pending: {
					on: {
						LAWYER_APPROVED_DOCUMENTS: {
							target: "signed",
						},
					},
				},
				signed: {
					on: {
						ALL_PARTIES_SIGNED: {
							target: "complete",
							actions: ["archiveSignedDocuments"],
						},
					},
				},
				complete: { type: "final" },
			},
			on: {
				DEAL_CANCELLED: {
					target: "#deal.failed",
					actions: [
						"voidReservation",
						"notifyCancellation",
						"revokeAllDealAccess",
					],
				},
			},
			onDone: { target: "fundsTransfer" },
		},
		fundsTransfer: {
			initial: "pending",
			states: {
				pending: {
					on: {
						FUNDS_RECEIVED: {
							target: "complete",
							actions: ["confirmFundsReceipt"],
						},
					},
				},
				complete: { type: "final" },
			},
			on: {
				DEAL_CANCELLED: {
					target: "#deal.failed",
					actions: [
						"voidReservation",
						"notifyCancellation",
						"revokeAllDealAccess",
					],
				},
			},
			onDone: {
				target: "confirmed",
				actions: [
					"commitReservation",
					"prorateAccrualBetweenOwners",
					"updatePaymentSchedule",
					"revokeLawyerAccess",
				],
			},
		},
		confirmed: { type: "final" },
		failed: { type: "final" },
	},
});
