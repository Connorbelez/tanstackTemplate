import { internalMutation } from "../../_generated/server";
import { seedCollectionRulesImpl } from "./defaultRules";

/**
 * Seeds the collectionRules table with canonical typed default rules.
 * Idempotent across both typed rows and legacy default rows keyed by code/name.
 */
export const seedCollectionRules = internalMutation({
	args: {},
	handler: async (ctx) => seedCollectionRulesImpl(ctx),
});
