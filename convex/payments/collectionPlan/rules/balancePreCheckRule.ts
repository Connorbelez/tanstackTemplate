import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";

/**
 * Balance pre-check is execution-owned.
 *
 * The canonical evaluation seam runs inside executePlanEntry before attempt
 * creation. The rules engine still sees the seeded event-trigger rule, so this
 * no-op handler makes that ownership explicit and avoids misleading warnings.
 */
export const balancePreCheckRuleHandler: RuleHandler = {
	async evaluate(_ctx: ActionCtx, _evalCtx: RuleEvalContext): Promise<void> {
		// Execution-owned rule; intentionally no-op inside the generic rules engine.
	},
};
