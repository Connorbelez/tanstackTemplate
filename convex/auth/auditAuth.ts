import type {
	FunctionReference,
	GenericDataModel,
	GenericMutationCtx,
} from "convex/server";
import { internal } from "../_generated/api";
import { auditLog } from "../auditLog";
import type { Viewer } from "../fluent";

const recordAuthFailureReference = (
	internal as unknown as {
		auth: {
			internal: {
				recordAuthFailure: FunctionReference<"mutation", "internal">;
			};
		};
	}
).auth.internal.recordAuthFailure;

export function isMutationContext(
	ctx: unknown
): ctx is GenericMutationCtx<GenericDataModel> {
	return (
		typeof ctx === "object" &&
		ctx !== null &&
		"runMutation" in ctx &&
		"db" in ctx &&
		"scheduler" in ctx
	);
}

function hasRunMutation(ctx: unknown): ctx is {
	runMutation: (...args: [unknown, unknown?]) => Promise<unknown>;
} {
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
	const action = `auth.${details.middleware}_denied`;
	const actorId = viewer?.authId ?? "anonymous";
	const userRoles = viewer?.roles ? [...viewer.roles] : [];
	const userPermissions = viewer?.permissions ? [...viewer.permissions] : [];

	if (!isMutationContext(ctx)) {
		if (hasRunMutation(ctx)) {
			try {
				await ctx.runMutation(recordAuthFailureReference, {
					action,
					actorId,
					middleware: details.middleware,
					required: details.required,
					reason: details.reason,
					userRoles,
					userPermissions,
					orgId: viewer?.orgId,
				});
			} catch (error) {
				console.error("[auditAuthFailure] Failed to write audit log:", error);
			}
		}
		return;
	}

	try {
		await auditLog.log(ctx, {
			action,
			actorId,
			resourceType: "auth_check",
			resourceId: details.middleware,
			severity: "warning",
			metadata: {
				middleware: details.middleware,
				required: details.required,
				reason: details.reason,
				userRoles,
				userPermissions,
				orgId: viewer?.orgId,
			},
		});
	} catch (e) {
		console.error("[auditAuthFailure] Failed to write audit log:", e);
	}
}
