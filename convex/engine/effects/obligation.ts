import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { executeTransition } from "../transition";
import type { CommandSource, TransitionResult } from "../types";
import { effectPayloadValidator } from "../validators";

const obligationEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("obligations"),
	entityType: v.literal("obligation"),
};

interface ObligationEffectArgs {
	effectName: string;
	entityId: Id<"obligations">;
	entityType: "obligation";
	eventType: string;
	journalEntryId: string;
	payload?: Record<string, unknown>;
	source: CommandSource;
}

type ObligationRecord = Doc<"obligations">;

function getTransitionFailureReason(result: TransitionResult) {
	return result.reason ?? "unknown reason";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function toIsoDateString(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

async function loadObligationOrThrow(
	ctx: MutationCtx,
	args: ObligationEffectArgs,
	effectLabel: string
): Promise<ObligationRecord> {
	const obligation = await ctx.db.get(args.entityId);
	if (!obligation) {
		throw new Error(`[${effectLabel}] Obligation not found: ${args.entityId}`);
	}

	return obligation;
}

function buildPaymentConfirmedPayload(
	args: ObligationEffectArgs,
	obligation: ObligationRecord
) {
	const amountFromEvent = args.payload?.amount;

	const amount = isFiniteNumber(amountFromEvent)
		? amountFromEvent
		: (obligation.amountSettled ?? obligation.amount);

	// SPEC 1.5: PAYMENT_APPLIED no longer carries paidAt — it carries attemptId instead.
	// Resolve paidAt with fallback chain:
	//   1. Legacy paidAt from event payload (backward compat with old journal entries)
	//   2. obligation.settledAt (patched by transition persist step)
	//   3. Date.now() (effect runs immediately after transition, so current time is reasonable)
	const paidAtFromEvent = args.payload?.paidAt;
	let paidAt: number;
	if (isFiniteNumber(paidAtFromEvent)) {
		paidAt = paidAtFromEvent;
	} else if (isFiniteNumber(obligation.settledAt)) {
		paidAt = obligation.settledAt;
	} else {
		paidAt = Date.now();
	}

	return {
		obligationId: args.entityId,
		amount,
		paidAt,
	};
}

async function forwardObligationEventToMortgage(
	ctx: MutationCtx,
	args: ObligationEffectArgs,
	config: {
		buildPayload: (
			args: ObligationEffectArgs,
			obligation: ObligationRecord
		) => Record<string, unknown>;
		effectLabel: "emitObligationOverdue" | "emitObligationSettled";
		eventType: "OBLIGATION_OVERDUE" | "PAYMENT_CONFIRMED";
	}
): Promise<ObligationRecord> {
	const obligation = await loadObligationOrThrow(ctx, args, config.effectLabel);
	const result = await executeTransition(ctx, {
		entityType: "mortgage",
		entityId: obligation.mortgageId,
		eventType: config.eventType,
		payload: config.buildPayload(args, obligation),
		source: args.source,
	});

	if (!result.success) {
		console.warn(
			`[${config.effectLabel}] Skipping ${config.eventType} for mortgage=${obligation.mortgageId} from obligation=${args.entityId}: ${getTransitionFailureReason(result)} (state=${result.previousState})`
		);
		return obligation;
	}

	console.info(
		`[${config.effectLabel}] obligation=${args.entityId} -> mortgage=${obligation.mortgageId}: ${result.previousState} -> ${result.newState}`
	);

	return obligation;
}

export const obligationEffectTestHelpers = {
	buildPaymentConfirmedPayload,
	forwardObligationEventToMortgage,
};

/**
 * Cross-entity effect: fires OBLIGATION_OVERDUE at the parent mortgage.
 * Triggered when an obligation transitions due → overdue via GRACE_PERIOD_EXPIRED.
 */
export const emitObligationOverdue = internalMutation({
	args: obligationEffectPayloadValidator,
	handler: async (ctx, args) => {
		const obligation = await forwardObligationEventToMortgage(ctx, args, {
			effectLabel: "emitObligationOverdue",
			eventType: "OBLIGATION_OVERDUE",
			buildPayload: ({ entityId }) => ({
				obligationId: entityId,
			}),
		});

		// Trigger rules engine for late fee evaluation (SPEC 1.5 §8.2)
		await ctx.scheduler.runAfter(
			0,
			internal.payments.collectionPlan.engine.evaluateRules,
			{
				trigger: "event" as const,
				mortgageId: obligation.mortgageId,
				eventType: "OBLIGATION_OVERDUE",
				eventPayload: {
					obligationId: args.entityId,
					mortgageId: obligation.mortgageId,
				},
			}
		);
	},
});

/**
 * Cross-entity effect: fires PAYMENT_CONFIRMED at the parent mortgage.
 * Triggered when an obligation transitions due → settled or overdue → settled via PAYMENT_APPLIED.
 */
export const emitObligationSettled = internalMutation({
	args: obligationEffectPayloadValidator,
	handler: async (ctx, args) => {
		const obligation = await forwardObligationEventToMortgage(ctx, args, {
			effectLabel: "emitObligationSettled",
			eventType: "PAYMENT_CONFIRMED",
			buildPayload: buildPaymentConfirmedPayload,
		});

		const settledAt = isFiniteNumber(obligation.settledAt)
			? obligation.settledAt
			: Date.now();
		const settledDate = toIsoDateString(settledAt);
		const settledAmount = obligation.amount;

		// Schedule dispersal entry creation (WS6 / ENG-68)
		await ctx.scheduler.runAfter(
			0,
			internal.dispersal.createDispersalEntries.createDispersalEntries,
			{
				mortgageId: obligation.mortgageId,
				obligationId: args.entityId,
				settledAmount,
				settledDate,
				idempotencyKey: `dispersal:${args.entityId}`,
				source: args.source,
			}
		);
	},
});
