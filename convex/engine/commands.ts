import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Viewer } from "../fluent";
import { adminMutation, authedMutation, requirePermission } from "../fluent";
import { executeTransition } from "./transition";
import type { CommandSource } from "./types";
import { sourceValidator } from "./validators";

/** Build CommandSource from the authenticated viewer context. */
export function buildSource(
	viewer: Viewer,
	channel: CommandSource["channel"]
): CommandSource {
	return {
		actorId: viewer.authId,
		actorType: viewer.isFairLendAdmin ? "admin" : undefined,
		channel,
		// ip and sessionId can be added later from request headers
	};
}

/**
 * Shared args validator for typed command wrappers.
 * entityType is omitted — each wrapper fixes it at the type level.
 */
export const transitionCommandArgs = {
	entityId: v.string(),
	eventType: v.string(),
	payload: v.optional(v.any()),
	source: v.optional(sourceValidator),
};

// ── Typed Command Wrappers ──────────────────────────────────────────

/**
 * Admin-gated transition for onboarding requests.
 * Requires FairLend admin role (enforced by adminMutation).
 */
export const transitionOnboardingRequest = adminMutation
	.input(transitionCommandArgs)
	.handler(async (ctx, args) => {
		const source =
			(args.source as CommandSource | undefined) ??
			buildSource(ctx.viewer, "admin_dashboard");
		return executeTransition(ctx, {
			entityType: "onboardingRequest",
			entityId: args.entityId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source,
		});
	})
	.public();

/**
 * Authed transition for mortgages.
 * Requires authentication + `mortgage:transition` permission.
 */
export const transitionMortgage = authedMutation
	.use(requirePermission("mortgage:transition"))
	.input(transitionCommandArgs)
	.handler(async (ctx, args) => {
		const source =
			(args.source as CommandSource | undefined) ??
			buildSource(ctx.viewer, "borrower_portal");
		return executeTransition(ctx, {
			entityType: "mortgage",
			entityId: args.entityId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source,
		});
	})
	.public();

/**
 * Internal-only transition for obligations.
 * No auth — intended for scheduler/effects use only.
 */
export const transitionObligation = internalMutation({
	args: transitionCommandArgs,
	handler: async (ctx, args) => {
		const source = (args.source as CommandSource | undefined) ?? {
			channel: "scheduler" as const,
		};
		return executeTransition(ctx, {
			entityType: "obligation",
			entityId: args.entityId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source,
		});
	},
});
