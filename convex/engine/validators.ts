import { v } from "convex/values";

export const channelValidator = v.union(
	v.literal("borrower_portal"),
	v.literal("broker_portal"),
	v.literal("onboarding_portal"),
	v.literal("admin_dashboard"),
	v.literal("api_webhook"),
	v.literal("scheduler"),
	v.literal("simulation")
);

export const actorTypeValidator = v.union(
	v.literal("borrower"),
	v.literal("broker"),
	v.literal("member"),
	v.literal("admin"),
	v.literal("system")
);

export const entityTypeValidator = v.union(
	v.literal("onboardingRequest"),
	v.literal("mortgage"),
	v.literal("obligation"),
	v.literal("collectionAttempt"),
	v.literal("deal"),
	v.literal("provisionalApplication"),
	v.literal("applicationPackage"),
	v.literal("broker"),
	v.literal("borrower"),
	v.literal("lender"),
	v.literal("lenderOnboarding"),
	v.literal("provisionalOffer"),
	v.literal("offerCondition"),
	v.literal("lenderRenewalIntent")
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

export const effectPayloadValidator = {
	entityId: v.string(),
	entityType: entityTypeValidator,
	eventType: v.string(),
	journalEntryId: v.string(),
	effectName: v.string(),
	payload: v.optional(v.any()),
	source: sourceValidator,
};
