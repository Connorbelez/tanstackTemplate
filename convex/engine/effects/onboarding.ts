import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { type ActionCtx, internalAction } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { authKit } from "../../auth";

async function completeRoleAssignmentProcessing(
	ctx: ActionCtx,
	requestId: Id<"onboardingRequests">,
	journalEntryId: string
) {
	await ctx.runMutation(
		internal.onboarding.internal.completeRoleAssignmentProcessing,
		{
			requestId,
			journalEntryId,
		}
	);
}

async function resolveTargetOrganizationId(
	ctx: ActionCtx,
	requestId: Id<"onboardingRequests">,
	journalEntryId: string,
	requestedRole: string,
	user: { authId: string; firstName: string; lastName: string },
	processingStatus: "in_progress" | "started",
	targetOrganizationId: string | undefined
) {
	let resolvedTargetOrganizationId = targetOrganizationId;

	if (requestedRole === "broker" && !resolvedTargetOrganizationId) {
		const latestRequest = await ctx.runQuery(
			internal.onboarding.internal.getRequestById,
			{ id: requestId }
		);
		resolvedTargetOrganizationId = latestRequest?.targetOrganizationId;
	}

	if (requestedRole === "broker" && !resolvedTargetOrganizationId) {
		if (processingStatus === "in_progress") {
			throw new Error(
				`[assignRoleToUser] Broker provisioning already started for request ${requestId}`
			);
		}
		const orgName = `${user.firstName} ${user.lastName}'s Brokerage`;
		const newOrg = await authKit.workos.organizations.createOrganization({
			name: orgName,
		});
		resolvedTargetOrganizationId = newOrg.id;

		await ctx.runMutation(internal.onboarding.internal.patchTargetOrg, {
			requestId,
			targetOrganizationId: newOrg.id,
		});
	}

	if (!resolvedTargetOrganizationId) {
		throw new Error(
			`[assignRoleToUser] No target org for request ${requestId} (role: ${requestedRole}, journal: ${journalEntryId})`
		);
	}

	return resolvedTargetOrganizationId;
}

async function ensureOrganizationMembership(
	user: { authId: string },
	targetOrganizationId: string,
	requestedRole: string
) {
	try {
		await authKit.workos.userManagement.createOrganizationMembership({
			userId: user.authId,
			organizationId: targetOrganizationId,
			roleSlug: requestedRole,
		});
	} catch (membershipError) {
		const message =
			membershipError instanceof Error
				? membershipError.message
				: String(membershipError);
		if (
			!(
				message.includes("already exists") ||
				message.includes("already a member")
			)
		) {
			throw membershipError;
		}
		console.info(
			`[assignRoleToUser] Membership already exists for ${user.authId} in ${targetOrganizationId}`
		);
	}
}

/**
 * Side effect triggered by the APPROVE transition.
 * Calls WorkOS Management API to assign the requested role in the target org.
 * On success, sends ASSIGN_ROLE to complete the lifecycle.
 * On failure, request stays in `approved` — Convex retries automatically.
 */
export const assignRoleToUser = internalAction({
	args: {
		entityId: v.string(),
		journalEntryId: v.string(),
		effectName: v.string(),
		params: v.optional(v.object({})),
	},
	handler: async (ctx, args) => {
		// 1. Load the request
		const request = await ctx.runQuery(
			internal.onboarding.internal.getRequestById,
			{ id: args.entityId as Id<"onboardingRequests"> }
		);
		if (!request) {
			throw new Error(`[assignRoleToUser] Request not found: ${args.entityId}`);
		}

		// 2. Load the user
		const user = await ctx.runQuery(internal.onboarding.internal.getUserById, {
			id: request.userId,
		});
		if (!user) {
			throw new Error(
				`[assignRoleToUser] User not found for request ${args.entityId}: ${request.userId}`
			);
		}

		if (
			request.status === "role_assigned" &&
			request.activeRoleAssignmentJournalId === args.journalEntryId
		) {
			await completeRoleAssignmentProcessing(
				ctx,
				args.entityId as Id<"onboardingRequests">,
				args.journalEntryId
			);
			return;
		}

		const processing = await ctx.runMutation(
			internal.onboarding.internal.beginRoleAssignmentProcessing,
			{
				requestId: args.entityId as Id<"onboardingRequests">,
				journalEntryId: args.journalEntryId,
			}
		);

		if (processing.status === "processed") {
			return;
		}

		let targetOrgId =
			processing.targetOrganizationId ?? request.targetOrganizationId;

		try {
			targetOrgId = await resolveTargetOrganizationId(
				ctx,
				args.entityId as Id<"onboardingRequests">,
				args.journalEntryId,
				request.requestedRole,
				user,
				processing.status,
				targetOrgId
			);

			// 4. Create org membership with role in target org
			await ensureOrganizationMembership(
				user,
				targetOrgId,
				request.requestedRole
			);

			// 5. Audit log — role assigned
			await auditLog.log(ctx, {
				action: "onboarding.role_assigned",
				actorId: "system",
				resourceType: "onboardingRequests",
				resourceId: args.entityId,
				severity: "info",
				metadata: {
					userId: user.authId,
					requestedRole: request.requestedRole,
					targetOrganizationId: targetOrgId,
					brokerOrgProvisioned: request.requestedRole === "broker",
				},
			});

			// 6. On success — send ASSIGN_ROLE to complete lifecycle
			await ctx.runMutation(
				internal.engine.transitionMutation.transitionMutation,
				{
					entityType: "onboardingRequest",
					entityId: args.entityId,
					eventType: "ASSIGN_ROLE",
					source: { channel: "system", actorType: "system" },
				}
			);

			await completeRoleAssignmentProcessing(
				ctx,
				args.entityId as Id<"onboardingRequests">,
				args.journalEntryId
			);
			console.info(
				`[assignRoleToUser] Assigned ${request.requestedRole} to ${user.authId} in ${targetOrgId}`
			);
		} catch (error) {
			// On failure — log but do NOT transition.
			// Request stays in `approved`. Convex retries automatically.
			console.error(
				`[assignRoleToUser] Failed for request ${args.entityId}: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
			try {
				await auditLog.log(ctx, {
					action: "onboarding.role_assignment_failed",
					actorId: "system",
					resourceType: "onboardingRequests",
					resourceId: args.entityId,
					severity: "error",
					metadata: {
						userId: user?.authId,
						requestedRole: request?.requestedRole,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			} catch {
				// Best-effort — don't mask the original error
			}
			throw error; // Re-throw so Convex retries the action
		}
	},
});
