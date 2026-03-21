import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { auditLog } from "../auditLog";
import { appendAuditJournalEntry } from "../engine/auditJournal";
import { postObligationAccrued } from "../payments/cashLedger/integrations";

/**
 * Valid initial states for obligation creation.
 * Only states that the obligation state machine can start in are allowed.
 * Post-transition states (due, overdue, partially_settled, settled, waived)
 * must be reached via Governed Transitions.
 */
const VALID_INITIAL_STATUSES = ["upcoming"] as const;
type ValidInitialStatus = (typeof VALID_INITIAL_STATUSES)[number];

/**
 * Creates a new obligation record.
 * Used by rules engine (e.g. LateFeeRule) and admin seeding to insert
 * obligations such as late fees or arrears cures.
 */
export const createObligation = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
		borrowerId: v.id("borrowers"),
		paymentNumber: v.number(),
		type: v.union(
			v.literal("regular_interest"),
			v.literal("arrears_cure"),
			v.literal("late_fee"),
			v.literal("principal_repayment")
		),
		amount: v.number(),
		amountSettled: v.number(),
		dueDate: v.number(),
		gracePeriodEnd: v.number(),
		sourceObligationId: v.optional(v.id("obligations")),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		// Validate initial status — only machine-initial states are allowed
		if (!VALID_INITIAL_STATUSES.includes(args.status as ValidInitialStatus)) {
			throw new ConvexError(
				`Invalid initial status "${args.status}". Obligations must be created in a valid initial state: ${VALID_INITIAL_STATUSES.join(", ")}. Post-transition states must be reached via Governed Transitions.`
			);
		}

		// Validate monetary invariants
		if (args.amount <= 0) {
			throw new ConvexError(
				`Invalid amount: ${args.amount}. Obligation amount must be greater than 0.`
			);
		}
		if (args.amountSettled < 0) {
			throw new ConvexError(
				`Invalid amountSettled: ${args.amountSettled}. amountSettled must be >= 0.`
			);
		}
		if (args.amountSettled > args.amount) {
			throw new ConvexError(
				`Invalid amountSettled: ${args.amountSettled} exceeds amount: ${args.amount}. amountSettled must be <= amount.`
			);
		}

		const createdAt = Date.now();

		const obligationId = await ctx.db.insert("obligations", {
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: args.paymentNumber,
			type: args.type,
			amount: args.amount,
			amountSettled: args.amountSettled,
			dueDate: args.dueDate,
			gracePeriodEnd: args.gracePeriodEnd,
			sourceObligationId: args.sourceObligationId,
			status: args.status,
			createdAt,
			lastTransitionAt: createdAt,
			machineContext: undefined,
			settledAt: undefined,
		});

		const journalEntryId = await appendAuditJournalEntry(ctx, {
			actorId: "system",
			actorType: "system",
			channel: "scheduler",
			entityId: obligationId,
			entityType: "obligation",
			eventType: "CREATED",
			payload: {
				type: args.type,
				amount: args.amount,
				mortgageId: args.mortgageId,
				borrowerId: args.borrowerId,
				paymentNumber: args.paymentNumber,
				dueDate: args.dueDate,
				sourceObligationId: args.sourceObligationId,
			},
			previousState: "none",
			newState: args.status,
			outcome: "transitioned",
			timestamp: createdAt,
		});

		await auditLog.log(ctx, {
			action: "transition.obligation.created",
			actorId: "system",
			resourceType: "obligations",
			resourceId: obligationId,
			severity: "info",
			metadata: {
				entityType: "obligation",
				eventType: "CREATED",
				previousState: "none",
				newState: args.status,
				outcome: "transitioned",
				journalEntryId,
				type: args.type,
				amount: args.amount,
				mortgageId: args.mortgageId,
				borrowerId: args.borrowerId,
				sourceObligationId: args.sourceObligationId,
				source: {
					channel: "scheduler",
					actorId: "system",
					actorType: "system",
				},
			},
		});

		// Only accrue the obligation immediately if it is already due at creation time.
		// Future-dated "upcoming" obligations will be accrued later when they become due.
		if (args.dueDate <= createdAt) {
			await postObligationAccrued(ctx, {
				obligationId,
				source: {
					channel: "scheduler",
					actorId: "system",
					actorType: "system",
				},
			});
		}

		return obligationId;
	},
});
