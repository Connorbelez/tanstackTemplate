import { v } from "convex/values";
import { REQUESTABLE_ROLES } from "../constants";

export const requestedRoleValidator = v.union(
	...REQUESTABLE_ROLES.map((role) => v.literal(role))
);

export const referralSourceValidator = v.union(
	v.literal("self_signup"),
	v.literal("broker_invite")
);
