import type { Validator } from "convex/values";
import { v } from "convex/values";
import { REQUESTABLE_ROLES } from "../constants";

export const requestedRoleValidator = v.union(
	...(REQUESTABLE_ROLES.map((role) => v.literal(role)) as [
		Validator<string>,
		Validator<string>,
		...Validator<string>[],
	])
);

export const referralSourceValidator = v.union(
	v.literal("self_signup"),
	v.literal("broker_invite")
);
