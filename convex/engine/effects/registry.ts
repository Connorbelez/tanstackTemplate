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
	createLateFeeObligation:
		internal.engine.effects.obligationLateFee.createLateFeeObligation,
	applyPayment: internal.engine.effects.obligationPayment.applyPayment,
	recordWaiver: internal.engine.effects.obligationWaiver.recordWaiver,
	// Obligation accrual → cash ledger (ENG-158)
	accrueObligation: internal.engine.effects.obligationAccrual.accrueObligation,
	// Deal Closing — effects (ENG-53)
	notifyAllParties: internal.engine.effects.dealClosingEffects.notifyAllParties,
	notifyCancellation:
		internal.engine.effects.dealClosingEffects.notifyCancellation,
	createDocumentPackage:
		internal.engine.effects.dealClosingEffects.createDocumentPackage,
	archiveSignedDocuments:
		internal.engine.effects.dealClosingEffects.archiveSignedDocuments,
	confirmFundsReceipt:
		internal.engine.effects.dealClosingEffects.confirmFundsReceipt,
	// Deal Closing — reservations (ENG-49/50)
	reserveShares: internal.engine.effects.dealClosing.reserveShares,
	commitReservation: internal.engine.effects.dealClosing.commitReservation,
	voidReservation: internal.engine.effects.dealClosing.voidReservation,
	prorateAccrualBetweenOwners:
		internal.engine.effects.dealClosingProrate.prorateAccrualBetweenOwners,
	updatePaymentSchedule:
		internal.engine.effects.dealClosingPayments.updatePaymentSchedule,

	// Deal Access (ENG-48 — real implementations)
	createDealAccess: internal.engine.effects.dealAccess.createDealAccess,
	revokeAllDealAccess: internal.engine.effects.dealAccess.revokeAllDealAccess,
	revokeLawyerAccess: internal.engine.effects.dealAccess.revokeLawyerAccess,

	// Collection Attempt effects (ENG-64)
	emitPaymentReceived:
		internal.engine.effects.collectionAttempt.emitPaymentReceived,
	emitCollectionFailed:
		internal.engine.effects.collectionAttempt.emitCollectionFailed,
	recordProviderRef:
		internal.engine.effects.collectionAttempt.recordProviderRef,
	notifyAdmin: internal.engine.effects.collectionAttempt.notifyAdmin,
	// Collection Attempt reversal effect (ENG-173)
	emitPaymentReversed:
		internal.engine.effects.collectionAttempt.emitPaymentReversed,
};
