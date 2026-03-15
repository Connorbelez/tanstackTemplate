import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import { auditLog } from "../auditLog";
import type { Viewer } from "../fluent";

export function isMutationContext(
	ctx: unknown
): ctx is GenericMutationCtx<GenericDataModel> {
	return typeof ctx === "object" && ctx !== null && "runMutation" in ctx;
}

export async function auditAuthFailure(
	ctx: unknown,
	viewer: Partial<Viewer> | undefined,
	details: {
		middleware: string;
		required?: string;
		reason: string;
	}
): Promise<void> {
	if (!isMutationContext(ctx)) {
		return;
	}

	try {
		await auditLog.log(ctx, {
			action: `auth.${details.middleware}_denied`,
			actorId: viewer?.authId ?? "anonymous",
			resourceType: "auth_check",
			resourceId: details.middleware,
			severity: "warning",
			metadata: {
				middleware: details.middleware,
				required: details.required,
				reason: details.reason,
				userRoles: viewer?.roles ? [...viewer.roles] : [],
				userPermissions: viewer?.permissions ? [...viewer.permissions] : [],
				orgId: viewer?.orgId,
			},
		});
	} catch (e) {
		console.error("[auditAuthFailure] Failed to write audit log:", e);
	}
}
