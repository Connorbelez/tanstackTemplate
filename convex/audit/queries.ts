import { v } from "convex/values";
import { auditLog } from "../auditLog";
import { adminQuery, requirePermission } from "../fluent";

/** Query auth-related audit events for a specific user. */
export const getAuthEventsByActor = adminQuery
	.use(requirePermission("platform:view_audit"))
	.input({ actorId: v.string(), limit: v.optional(v.number()) })
	.handler(async (ctx, args) => {
		return auditLog.queryByActor(ctx, {
			actorId: args.actorId,
			limit: args.limit ?? 50,
		});
	})
	.public();

/** Query audit events for a specific onboarding request. */
export const getAuditTrailForRequest = adminQuery
	.use(requirePermission("platform:view_audit"))
	.input({ requestId: v.string() })
	.handler(async (ctx, args) => {
		return auditLog.queryByResource(ctx, {
			resourceType: "onboardingRequests",
			resourceId: args.requestId,
			limit: 50,
		});
	})
	.public();

/** Watch critical auth events in realtime (security dashboard). */
export const watchCriticalAuthEvents = adminQuery
	.use(requirePermission("platform:view_audit"))
	.handler(async (ctx) => {
		return auditLog.watchCritical(ctx, {
			severity: ["warning", "error", "critical"],
			limit: 20,
		});
	})
	.public();
