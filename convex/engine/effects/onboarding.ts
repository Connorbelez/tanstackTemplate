import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { authKit } from "../../auth";

/**
 * Side effect triggered by the APPROVE transition.
 * Calls WorkOS Management API to assign the requested role in the target org.
 * On success, sends ASSIGN_ROLE to complete the lifecycle.
 * On failure, request stays in `approved` — Convex retries automatically.
 */
export const assignRoleToUser = internalAction({
	args: {
		entityId: v.string(),
		journalEntryId: v.id("auditJournal"),
		effectName: v.string(),
	},
	handler: async (ctx, args) => {
		// 1. Load the request
		const request = await ctx.runQuery(
			internal.onboarding.internal.getRequestById,
			{ id: args.entityId as Id<"onboardingRequests"> }
		);
		if (!request) {
			console.error(`[assignRoleToUser] Request not found: ${args.entityId}`);
			return;
		}

		// 2. Load the user
		const user = await ctx.runQuery(internal.onboarding.internal.getUserById, {
			id: request.userId,
		});
		if (!user) {
			console.error(`[assignRoleToUser] User not found: ${request.userId}`);
			return;
		}

		let targetOrgId = request.targetOrganizationId;

		try {
			// 3. For brokers — provision new org
			if (request.requestedRole === "broker" && !targetOrgId) {
				const orgName = `${user.firstName} ${user.lastName}'s Brokerage`;
				const newOrg = await authKit.workos.organizations.createOrganization({
					name: orgName,
				});
				targetOrgId = newOrg.id;

				// Patch the target org back onto the request
				await ctx.runMutation(internal.onboarding.internal.patchTargetOrg, {
					requestId: args.entityId as Id<"onboardingRequests">,
					targetOrganizationId: newOrg.id,
				});
			}

			if (!targetOrgId) {
				console.error(
					`[assignRoleToUser] No target org for request ${args.entityId}`
				);
				return;
			}

			// 4. Create org membership with role in target org
			await authKit.workos.userManagement.createOrganizationMembership({
				userId: user.authId,
				organizationId: targetOrgId,
				roleSlug: request.requestedRole,
			});

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

			console.log(
				`[assignRoleToUser] Successfully assigned role "${request.requestedRole}" to user ${user.authId} in org ${targetOrgId}`
			);
		} catch (error) {
			// On failure — log but do NOT transition.
			// Request stays in `approved`. Convex retries automatically.
			console.error(
				`[assignRoleToUser] Failed for request ${args.entityId}:`,
				error
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
