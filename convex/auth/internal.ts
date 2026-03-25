import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { auditLog } from "../auditLog";

export const recordAuthFailure = internalMutation({
	args: {
		action: v.string(),
		actorId: v.string(),
		middleware: v.string(),
		orgId: v.optional(v.string()),
		reason: v.string(),
		required: v.optional(v.string()),
		userPermissions: v.array(v.string()),
		userRoles: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		await auditLog.log(ctx, {
			action: args.action,
			actorId: args.actorId,
			resourceType: "auth_check",
			resourceId: args.middleware,
			severity: "warning",
			metadata: {
				middleware: args.middleware,
				required: args.required,
				reason: args.reason,
				userRoles: args.userRoles,
				userPermissions: args.userPermissions,
				orgId: args.orgId,
			},
		});
	},
});
