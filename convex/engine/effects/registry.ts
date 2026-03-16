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
};
