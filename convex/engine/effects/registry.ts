import type { FunctionReference } from "convex/server";
import { internal } from "../../_generated/api";

/**
 * Maps action names declared in XState machines to Convex internal function references.
 * Future effects (notifications, scheduling, workflow routing) are added as single-line entries.
 */
export const effectRegistry: Record<
	string,
	FunctionReference<"action", "internal">
> = {
	assignRoleToUser: internal.engine.effects.onboarding.assignRoleToUser,
};
