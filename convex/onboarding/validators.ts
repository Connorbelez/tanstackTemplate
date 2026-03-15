import { v } from "convex/values";

export const requestedRoleValidator = v.union(
	v.literal("broker"),
	v.literal("lender"),
	v.literal("lawyer"),
	v.literal("admin"),
	v.literal("jr_underwriter"),
	v.literal("underwriter"),
	v.literal("sr_underwriter")
);

export const referralSourceValidator = v.union(
	v.literal("self_signup"),
	v.literal("broker_invite")
);
