import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/** Internal query to load a request by ID — used by effects. */
export const getRequestById = internalQuery({
	args: { id: v.id("onboardingRequests") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.id);
	},
});

/** Internal query to load a user by their Convex doc ID. */
export const getUserById = internalQuery({
	args: { id: v.id("users") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.id);
	},
});

/** Patch the targetOrganizationId on a request — used by broker org provisioning effect. */
export const patchTargetOrg = internalMutation({
	args: {
		requestId: v.id("onboardingRequests"),
		targetOrganizationId: v.string(),
	},
	handler: async (ctx, args) => {
		const targetOrganizationId = args.targetOrganizationId.trim();
		if (!targetOrganizationId) {
			throw new Error("targetOrganizationId cannot be empty");
		}
		await ctx.db.patch(args.requestId, {
			targetOrganizationId,
		});
	},
});

export const beginRoleAssignmentProcessing = internalMutation({
	args: {
		requestId: v.id("onboardingRequests"),
		journalEntryId: v.string(),
	},
	handler: async (ctx, args) => {
		const request = await ctx.db.get(args.requestId);
		if (!request) {
			throw new Error(`Request not found: ${args.requestId}`);
		}

		const processed = request.processedRoleAssignmentJournalIds ?? [];
		if (processed.includes(args.journalEntryId)) {
			return {
				status: "processed" as const,
				targetOrganizationId: request.targetOrganizationId,
			};
		}

		if (request.activeRoleAssignmentJournalId === args.journalEntryId) {
			return {
				status: "in_progress" as const,
				targetOrganizationId: request.targetOrganizationId,
			};
		}

		if (
			request.activeRoleAssignmentJournalId &&
			request.activeRoleAssignmentJournalId !== args.journalEntryId
		) {
			throw new Error(
				`Role assignment already in progress for request ${args.requestId}`
			);
		}

		await ctx.db.patch(args.requestId, {
			activeRoleAssignmentJournalId: args.journalEntryId,
		});

		return {
			status: "started" as const,
			targetOrganizationId: request.targetOrganizationId,
		};
	},
});

export const completeRoleAssignmentProcessing = internalMutation({
	args: {
		requestId: v.id("onboardingRequests"),
		journalEntryId: v.string(),
	},
	handler: async (ctx, args) => {
		const request = await ctx.db.get(args.requestId);
		if (!request) {
			throw new Error(`Request not found: ${args.requestId}`);
		}

		const processed = request.processedRoleAssignmentJournalIds ?? [];
		if (!processed.includes(args.journalEntryId)) {
			processed.push(args.journalEntryId);
		}

		await ctx.db.patch(args.requestId, {
			activeRoleAssignmentJournalId: undefined,
			processedRoleAssignmentJournalIds: processed,
		});
	},
});
