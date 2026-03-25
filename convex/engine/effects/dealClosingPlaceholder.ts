import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

/**
 * Temporary placeholder for all 12 deal closing effects.
 * Replaced by real implementations in ENG-49, ENG-50, ENG-53.
 */
export const placeholder = internalMutation({
	args: effectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[Deal Effect Placeholder] ${args.effectName} fired for entity ${args.entityId} — no-op until real handler is implemented`
		);
	},
});
