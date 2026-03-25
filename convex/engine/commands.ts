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
	let actorType: CommandSource["actorType"];
	if (viewer.isFairLendAdmin) {
		actorType = "admin";
	} else if (viewer.roles.has("broker")) {
		actorType = "broker";
	} else if (viewer.roles.has("borrower")) {
		actorType = "borrower";
	} else if (viewer.roles.has("member")) {
		actorType = "member";
	}
	return {
		actorId: viewer.authId,
		actorType,
		channel,
		// ip and sessionId can be added later from request headers
	};
}

/**
 * Shared args validator for typed command wrappers.
 * entityType is omitted — each wrapper fixes it at the type level.
 */
export const transitionCommandArgs = {
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
	.input({ ...transitionCommandArgs, entityId: v.id("onboardingRequests") })
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
	.input({ ...transitionCommandArgs, entityId: v.id("mortgages") })
	.handler(async (ctx, args) => {
		const source =
			(args.source as CommandSource | undefined) ??
			buildSource(ctx.viewer, "broker_portal");
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
	args: { ...transitionCommandArgs, entityId: v.id("obligations") },
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

/**
 * Internal-only transition for mortgages.
 * No auth — intended for cross-entity effects dispatched by the scheduler.
 */
export const transitionMortgageInternal = internalMutation({
	args: { ...transitionCommandArgs, entityId: v.id("mortgages") },
	handler: async (ctx, args) => {
		const source = (args.source as CommandSource | undefined) ?? {
			channel: "scheduler" as const,
			actorType: "system" as const,
		};
		return executeTransition(ctx, {
			entityType: "mortgage",
			entityId: args.entityId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source,
		});
	},
});

/**
 * Authed mutation for confirming obligation payments.
 * Requires authentication + `obligation:manage` permission.
 * Wraps PAYMENT_APPLIED transition for admin/broker use.
 */
export const confirmObligationPayment = authedMutation
	.use(requirePermission("obligation:manage"))
	.input({
		entityId: v.id("obligations"),
		amount: v.number(),
		paidAt: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const source = buildSource(ctx.viewer, "admin_dashboard");
		return executeTransition(ctx, {
			entityType: "obligation",
			entityId: args.entityId,
			eventType: "PAYMENT_APPLIED",
			payload: {
				amount: args.amount,
				paidAt: args.paidAt ?? Date.now(),
			},
			source,
		});
	})
	.public();
