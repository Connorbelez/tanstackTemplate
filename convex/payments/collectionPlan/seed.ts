import { internalMutation } from "../../_generated/server";
import { seedCollectionRulesImpl } from "./defaultRules";

/**
 * Seeds the collectionRules table with default rules.
 * Idempotent: skips any rule whose `name` already exists.
 */
export const seedCollectionRules = internalMutation({
	args: {},
	handler: async (ctx) => seedCollectionRulesImpl(ctx),
});
