import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import {
	FAIRLEND_BROKERAGE_ORG_ID,
	FAIRLEND_LAWYERS_ORG_ID,
	FAIRLEND_STAFF_ORG_ID,
	REQUESTABLE_ROLES,
	type RequestableRole,
} from "../constants";
import { appendAuditJournalEntry } from "../engine/auditJournal";
import { transitionEntity } from "../engine/transition";
import { adminMutation, authedMutation, requirePermission } from "../fluent";
import { referralSourceValidator, requestedRoleValidator } from "./validators";

// ── Org Assignment Rules ───────────────────────────────────────────
function computeTargetOrg(
	requestedRole: RequestableRole,
	referralSource: "self_signup" | "broker_invite",
	invitingBrokerOrgId?: string
): string | undefined {
	// biome-ignore lint/style/useDefaultSwitchClause: requestedRole is an exhaustive union here.
	switch (requestedRole) {
		case "lender":
			return referralSource === "broker_invite"
				? invitingBrokerOrgId
				: FAIRLEND_BROKERAGE_ORG_ID;
		case "broker":
			// New org provisioned at approval time
			return undefined;
		case "lawyer":
			return FAIRLEND_LAWYERS_ORG_ID;
		case "jr_underwriter":
		case "underwriter":
		case "sr_underwriter":
		case "admin":
			return FAIRLEND_STAFF_ORG_ID;
	}
}

/** Request a role — any authenticated user (no permission required for first role request). */
export const requestRole = authedMutation
	.input({
		requestedRole: requestedRoleValidator,
		referralSource: referralSourceValidator,
		invitedByBrokerId: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const requestedRole = args.requestedRole as RequestableRole;

		// Validate role is requestable
		if (!(REQUESTABLE_ROLES as readonly string[]).includes(requestedRole)) {
			throw new ConvexError(
				`Role "${requestedRole}" is not available for request`
			);
		}

		// Validate broker invite has invitedByBrokerId
		if (args.referralSource === "broker_invite" && !args.invitedByBrokerId) {
			throw new ConvexError(
				"broker_invite referral requires invitedByBrokerId"
			);
		}

		// Look up user
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", ctx.viewer.authId))
			.unique();
		if (!user) {
			throw new ConvexError("User not found in database");
		}

		// Check for duplicate pending request
		const existingRequests = await ctx.db
			.query("onboardingRequests")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		const hasPending = existingRequests.some(
			(r) => r.status === "pending_review" || r.status === "approved"
		);
		if (hasPending) {
			throw new ConvexError("You already have a pending role request");
		}

		// For broker invite lenders, look up the inviting broker's org
		let invitingBrokerOrgId: string | undefined;
		const { invitedByBrokerId } = args;
		if (args.referralSource === "broker_invite" && invitedByBrokerId) {
			const brokerMemberships = await ctx.db
				.query("organizationMemberships")
				.withIndex("byUser", (q) => q.eq("userWorkosId", invitedByBrokerId))
				.collect();
			const brokerMembership = brokerMemberships.find(
				(membership) =>
					membership.status === "active" &&
					(membership.roleSlug === "broker" ||
						membership.roleSlugs?.includes("broker"))
			);
			if (!brokerMembership) {
				throw new ConvexError(
					`Inviting broker "${invitedByBrokerId}" is not an active broker`
				);
			}
			invitingBrokerOrgId = brokerMembership.organizationWorkosId;
		}

		// Compute target org
		const targetOrganizationId = computeTargetOrg(
			requestedRole,
			args.referralSource,
			invitingBrokerOrgId
		);
		const createdAt = Date.now();

		// Create entity
		const requestId = await ctx.db.insert("onboardingRequests", {
			userId: user._id,
			requestedRole,
			status: "pending_review",
			referralSource: args.referralSource,
			invitedByBrokerId: args.invitedByBrokerId,
			targetOrganizationId,
			createdAt,
		});
		const journalEntryId = await appendAuditJournalEntry(ctx, {
			actorId: ctx.viewer.authId,
			actorType: "member",
			channel: "onboarding_portal",
			entityId: requestId,
			entityType: "onboardingRequest",
			eventType: "CREATED",
			payload: {
				requestedRole,
				referralSource: args.referralSource,
				targetOrganizationId,
				invitedByBrokerId: args.invitedByBrokerId,
			},
			previousState: "none",
			newState: "pending_review",
			outcome: "transitioned",
			timestamp: createdAt,
		});

		await auditLog.log(ctx, {
			action: "transition.onboardingRequest.created",
			actorId: ctx.viewer.authId,
			resourceType: "onboardingRequests",
			resourceId: requestId,
			severity: "info",
			metadata: {
				entityType: "onboardingRequest",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				journalEntryId,
				requestedRole,
				referralSource: args.referralSource,
				targetOrganizationId,
				invitedByBrokerId: args.invitedByBrokerId,
				source: {
					channel: "onboarding_portal",
					actorId: ctx.viewer.authId,
					actorType: "member",
				},
			},
		});

		return requestId;
	})
	.public();

/** Approve a pending onboarding request. Admin with onboarding:review only. */
export const approveRequest = adminMutation
	.use(requirePermission("onboarding:review"))
	.input({ requestId: v.id("onboardingRequests") })
	.handler(async (ctx, args) => {
		// Call transition engine
		const result = await transitionEntity(
			ctx,
			"onboardingRequest",
			args.requestId,
			"APPROVE",
			{},
			{
				channel: "admin_dashboard",
				actorId: ctx.viewer.authId,
				actorType: "admin",
			}
		);

		if (!result.success) {
			throw new ConvexError(result.reason ?? "Transition failed");
		}

		await ctx.db.patch(args.requestId, {
			reviewedBy: ctx.viewer.authId,
			reviewedAt: Date.now(),
		});

		await auditLog.log(ctx, {
			action: "onboarding.request_approved",
			actorId: ctx.viewer.authId,
			resourceType: "onboardingRequests",
			resourceId: args.requestId,
			severity: "info",
			metadata: {
				previousState: result.previousState,
				newState: result.newState,
			},
		});

		return result;
	})
	.public();

/** Reject a pending onboarding request with a reason. Admin with onboarding:review only. */
export const rejectRequest = adminMutation
	.use(requirePermission("onboarding:review"))
	.input({
		requestId: v.id("onboardingRequests"),
		rejectionReason: v.string(),
	})
	.handler(async (ctx, args) => {
		// Call transition engine
		const result = await transitionEntity(
			ctx,
			"onboardingRequest",
			args.requestId,
			"REJECT",
			{ reason: args.rejectionReason },
			{
				channel: "admin_dashboard",
				actorId: ctx.viewer.authId,
				actorType: "admin",
			}
		);

		if (!result.success) {
			throw new ConvexError(result.reason ?? "Transition failed");
		}

		await ctx.db.patch(args.requestId, {
			reviewedBy: ctx.viewer.authId,
			reviewedAt: Date.now(),
			rejectionReason: args.rejectionReason,
		});

		await auditLog.log(ctx, {
			action: "onboarding.request_rejected",
			actorId: ctx.viewer.authId,
			resourceType: "onboardingRequests",
			resourceId: args.requestId,
			severity: "info",
			metadata: {
				rejectionReason: args.rejectionReason,
				previousState: result.previousState,
				newState: result.newState,
			},
		});

		return result;
	})
	.public();
