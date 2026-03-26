import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { appendAuditJournalEntry } from "../../engine/auditJournal";
import type { CommandSource } from "../../engine/types";
import { sourceValidator } from "../../engine/validators";
import { postObligationAccrued } from "../cashLedger/integrations";

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Creates a corrective obligation after a payment reversal.
 *
 * The original obligation stays in `settled` status (XState final state).
 * This mutation creates a NEW obligation linked via `sourceObligationId`
 * to re-establish the receivable in the domain layer.
 */
export const createCorrectiveObligation = internalMutation({
	args: {
		originalObligationId: v.id("obligations"),
		reversedAmount: v.number(),
		reason: v.string(),
		postingGroupId: v.string(),
		source: sourceValidator,
	},
	handler: async (ctx, args) => {
		// 1. Load and validate original obligation
		const original = await ctx.db.get(args.originalObligationId);
		if (!original) {
			throw new ConvexError(
				`Original obligation not found: ${args.originalObligationId as string}`
			);
		}

		if (original.status !== "settled") {
			throw new ConvexError({
				code: "INVALID_STATUS" as const,
				message: `Original obligation must be in 'settled' status, got '${original.status}'`,
				obligationId: args.originalObligationId as string,
				currentStatus: original.status,
			});
		}

		// 2. Validate reversedAmount is a positive safe integer (cents)
		if (
			!Number.isSafeInteger(args.reversedAmount) ||
			args.reversedAmount <= 0
		) {
			throw new ConvexError({
				code: "INVALID_AMOUNT" as const,
				message: "reversedAmount must be a positive safe integer (cents)",
				reversedAmount: args.reversedAmount,
			});
		}

		// 3. Idempotency check via by_type_and_source index
		const existingCorrectives = await ctx.db
			.query("obligations")
			.withIndex("by_type_and_source", (q) =>
				q
					.eq("type", original.type)
					.eq("sourceObligationId", args.originalObligationId)
			)
			.collect();

		// Filter out the original itself (relevant when original.type is "late_fee")
		const existingCorrective = existingCorrectives.find(
			(o) => o._id !== args.originalObligationId
		);

		if (existingCorrective) {
			console.info(
				"[createCorrectiveObligation] Idempotency: corrective already exists " +
					`(existing=${existingCorrective._id as string}, original=${args.originalObligationId as string})`
			);
			return {
				obligationId: existingCorrective._id,
				created: false,
			};
		}

		// 4. Create the corrective obligation with GT fields
		const now = Date.now();
		const correctiveId = await ctx.db.insert("obligations", {
			status: "upcoming",
			lastTransitionAt: now,
			machineContext: undefined,
			mortgageId: original.mortgageId,
			borrowerId: original.borrowerId,
			paymentNumber: original.paymentNumber,
			type: original.type,
			amount: args.reversedAmount,
			amountSettled: 0,
			dueDate: now,
			gracePeriodEnd: now + FIFTEEN_DAYS_MS,
			sourceObligationId: args.originalObligationId,
			settledAt: undefined,
			createdAt: now,
		});

		// 5. Audit journal entry (Layer 1 — hash-chained)
		const source = args.source as CommandSource;
		const journalEntryId = await appendAuditJournalEntry(ctx, {
			actorId: source.actorId ?? "system",
			actorType: source.actorType ?? "system",
			channel: source.channel,
			entityId: correctiveId,
			entityType: "obligation",
			eventType: "CREATED",
			payload: {
				type: original.type,
				amount: args.reversedAmount,
				mortgageId: original.mortgageId,
				borrowerId: original.borrowerId,
				paymentNumber: original.paymentNumber,
				dueDate: now,
				sourceObligationId: args.originalObligationId,
				reason: args.reason,
				postingGroupId: args.postingGroupId,
				correctiveOf: args.originalObligationId,
			},
			previousState: "none",
			newState: "upcoming",
			outcome: "transitioned",
			timestamp: now,
		});

		// 6. Component audit log (Layer 2)
		await auditLog.log(ctx, {
			action: "transition.obligation.corrective_created",
			actorId: source.actorId ?? "system",
			resourceType: "obligations",
			resourceId: correctiveId,
			severity: "info",
			metadata: {
				entityType: "obligation",
				eventType: "CREATED",
				previousState: "none",
				newState: "upcoming",
				outcome: "transitioned",
				journalEntryId,
				type: original.type,
				amount: args.reversedAmount,
				mortgageId: original.mortgageId,
				borrowerId: original.borrowerId,
				sourceObligationId: args.originalObligationId,
				reason: args.reason,
				postingGroupId: args.postingGroupId,
				source: {
					channel: source.channel,
					actorId: source.actorId,
					actorType: source.actorType,
				},
			},
		});

		// 7. Post accrual ledger entries (BORROWER_RECEIVABLE + CONTROL:ACCRUAL)
		// Corrective obligations are always immediately due, so always accrue.
		try {
			await postObligationAccrued(ctx, {
				obligationId: correctiveId,
				source,
			});
		} catch (error) {
			console.error(
				"[createCorrectiveObligation] CRITICAL: Failed to post accrual for " +
					`corrective=${correctiveId as string}, original=${args.originalObligationId as string}. ` +
					"Transaction will roll back.",
				error
			);
			throw error;
		}

		console.info(
			`[createCorrectiveObligation] Created corrective=${correctiveId as string} ` +
				`for original=${args.originalObligationId as string}, amount=${args.reversedAmount}, ` +
				`postingGroupId=${args.postingGroupId}`
		);

		return {
			obligationId: correctiveId,
			created: true,
		};
	},
});
