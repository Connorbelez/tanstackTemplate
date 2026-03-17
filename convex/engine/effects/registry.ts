import type { FunctionReference } from "convex/server";
import { internal } from "../../_generated/api";

/**
 * Maps action names declared in XState machines to Convex internal function references.
 * Future effects (notifications, scheduling, workflow routing) are added as single-line entries.
 */
export const effectRegistry: Record<
	string,
	FunctionReference<"mutation" | "action", "internal">
> = {
	assignRole: internal.engine.effects.onboarding.assignRole,
	notifyApplicantApproved:
		internal.engine.effects.onboarding.notifyApplicantApproved,
	notifyApplicantRejected:
		internal.engine.effects.onboarding.notifyApplicantRejected,
	notifyAdminNewRequest:
		internal.engine.effects.onboarding.notifyAdminNewRequest,
	emitObligationOverdue:
		internal.engine.effects.obligation.emitObligationOverdue,
	emitObligationSettled:
		internal.engine.effects.obligation.emitObligationSettled,
	// Deal Closing — placeholders until ENG-49/50/53 implement real handlers
	reserveShares: internal.engine.effects.dealClosingPlaceholder.placeholder,
	commitReservation: internal.engine.effects.dealClosingPlaceholder.placeholder,
	voidReservation: internal.engine.effects.dealClosingPlaceholder.placeholder,
	prorateAccrualBetweenOwners:
		internal.engine.effects.dealClosingPlaceholder.placeholder,
	updatePaymentSchedule:
		internal.engine.effects.dealClosingPlaceholder.placeholder,
	notifyAllParties: internal.engine.effects.dealClosingPlaceholder.placeholder,
	notifyCancellation:
		internal.engine.effects.dealClosingPlaceholder.placeholder,
	createDocumentPackage:
		internal.engine.effects.dealClosingPlaceholder.placeholder,
	archiveSignedDocuments:
		internal.engine.effects.dealClosingPlaceholder.placeholder,
	confirmFundsReceipt:
		internal.engine.effects.dealClosingPlaceholder.placeholder,

	// Deal Access (ENG-48 — real implementations)
	createDealAccess: internal.engine.effects.dealAccess.createDealAccess,
	revokeAllDealAccess: internal.engine.effects.dealAccess.revokeAllDealAccess,
	revokeLawyerAccess: internal.engine.effects.dealAccess.revokeLawyerAccess,
};
