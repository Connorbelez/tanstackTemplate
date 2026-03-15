import { v } from "convex/values";

export const channelValidator = v.union(
	v.literal("borrower_portal"),
	v.literal("broker_portal"),
	v.literal("admin_dashboard"),
	v.literal("api_webhook"),
	v.literal("scheduler")
);

export const actorTypeValidator = v.union(
	v.literal("borrower"),
	v.literal("broker"),
	v.literal("admin"),
	v.literal("system")
);

export const entityTypeValidator = v.union(
	v.literal("onboardingRequest"),
	v.literal("mortgage"),
	v.literal("obligation")
);

export const sourceValidator = v.object({
	channel: channelValidator,
	actorId: v.optional(v.string()),
	actorType: v.optional(actorTypeValidator),
	ip: v.optional(v.string()),
	sessionId: v.optional(v.string()),
});

export const commandArgsValidator = {
	entityType: entityTypeValidator,
	entityId: v.string(),
	eventType: v.string(),
	payload: v.optional(v.any()),
	source: sourceValidator,
};
