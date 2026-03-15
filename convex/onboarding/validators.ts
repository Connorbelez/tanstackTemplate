import { v } from "convex/values";
import { REQUESTABLE_ROLES } from "../constants";

const [
	brokerRole,
	lenderRole,
	lawyerRole,
	adminRole,
	jrUnderwriterRole,
	underwriterRole,
	srUnderwriterRole,
] = REQUESTABLE_ROLES;

export const requestedRoleValidator = v.union(
	v.literal(brokerRole),
	v.literal(lenderRole),
	v.literal(lawyerRole),
	v.literal(adminRole),
	v.literal(jrUnderwriterRole),
	v.literal(underwriterRole),
	v.literal(srUnderwriterRole)
);

export const referralSourceValidator = v.union(
	v.literal("self_signup"),
	v.literal("broker_invite")
);
