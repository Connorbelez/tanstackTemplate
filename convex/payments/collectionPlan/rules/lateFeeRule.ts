import { makeFunctionReference } from "convex/server";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";
import { getLateFeeRuleConfig } from "../ruleContract";

const MS_PER_DAY = 86_400_000;

interface ObligationOverduePayload {
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
}

const getActiveMortgageFeeReference = makeFunctionReference<
	"query",
	{
		mortgageId: Id<"mortgages">;
		code: "late_fee";
		surface: "borrower_charge";
		asOfDate: string;
	},
	{
		_id: Id<"mortgageFees">;
		calculationType: "annual_rate_principal" | "fixed_amount_cents";
		parameters: {
			fixedAmountCents?: number;
			dueDays?: number;
			graceDays?: number;
		};
	} | null
>("fees/queries:getActiveMortgageFee");

function toIsoDateString(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
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

		const config = getLateFeeRuleConfig(evalCtx.rule);
		if (!config) {
			console.warn(
				`[late-fee-rule] Missing typed config for rule ${String(evalCtx.rule._id)}`
			);
			return;
		}

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
			{ sourceObligationId: obligationId, feeCode: "late_fee" }
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
		const mortgageFee = await ctx.runQuery(getActiveMortgageFeeReference, {
			mortgageId,
			code: config.feeCode,
			surface: config.feeSurface,
			asOfDate: toIsoDateString(now),
		});
		if (!mortgageFee) {
			return;
		}
		if (mortgageFee.calculationType !== "fixed_amount_cents") {
			console.warn(
				`[late-fee-rule] Unsupported calculationType ${mortgageFee.calculationType} for mortgageFee=${mortgageFee._id}`
			);
			return;
		}

		const feeAmountCents = mortgageFee.parameters.fixedAmountCents;
		if (
			feeAmountCents === undefined ||
			!Number.isSafeInteger(feeAmountCents) ||
			feeAmountCents < 0
		) {
			console.warn(
				`[late-fee-rule] Missing or invalid fixedAmountCents for mortgageFee=${mortgageFee._id}`
			);
			return;
		}

		const dueDays = mortgageFee.parameters.dueDays ?? 30;
		const graceDays = mortgageFee.parameters.graceDays ?? 45;

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
			feeCode: config.feeCode,
			mortgageFeeId: mortgageFee._id,
			status: "upcoming",
		});
	},
};
