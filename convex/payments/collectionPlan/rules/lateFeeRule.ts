import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";

const MS_PER_DAY = 86_400_000;

interface ObligationOverduePayload {
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
}

/**
 * LateFeeRule: on an OBLIGATION_OVERDUE event, creates a late_fee obligation
 * linked to the overdue source obligation. Idempotent — skips if a late fee
 * already exists for the source obligation.
 */
export const lateFeeRuleHandler: RuleHandler = {
	async evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void> {
		if (evalCtx.eventType !== "OBLIGATION_OVERDUE") {
			return;
		}

		const params = evalCtx.rule.parameters as
			| { feeAmountCents?: number; dueDays?: number; graceDays?: number }
			| undefined;
		const feeAmountCents = params?.feeAmountCents ?? 5000;
		const dueDays = params?.dueDays ?? 30;
		const graceDays = params?.graceDays ?? 45;

		const payload = evalCtx.eventPayload as
			| ObligationOverduePayload
			| undefined;
		if (!payload) {
			console.warn(
				"[late-fee-rule] Missing eventPayload for OBLIGATION_OVERDUE"
			);
			return;
		}

		const { obligationId, mortgageId } = payload;

		// Idempotency: skip if a late fee already exists for this obligation
		const existingLateFee = await ctx.runQuery(
			internal.obligations.queries.getLateFeeForObligation,
			{ sourceObligationId: obligationId }
		);

		if (existingLateFee) {
			return;
		}

		// Load source obligation to get borrowerId
		const sourceObligation = await ctx.runQuery(
			internal.obligations.queries.getById,
			{ id: obligationId }
		);

		if (!sourceObligation) {
			console.warn(
				`[late-fee-rule] Source obligation not found: ${obligationId}`
			);
			return;
		}

		const now = Date.now();

		await ctx.runMutation(internal.obligations.mutations.createObligation, {
			mortgageId,
			borrowerId: sourceObligation.borrowerId,
			paymentNumber: 0,
			type: "late_fee",
			amount: feeAmountCents,
			amountSettled: 0,
			dueDate: now + dueDays * MS_PER_DAY,
			gracePeriodEnd: now + graceDays * MS_PER_DAY,
			sourceObligationId: obligationId,
			status: "upcoming",
		});
	},
};
