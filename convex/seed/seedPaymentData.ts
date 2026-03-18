import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../fluent";
import { generateObligationsImpl, MS_PER_DAY } from "../payments/obligations/generateImpl";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How far ahead (in ms) to schedule plan entries from "now" */
const SCHEDULING_WINDOW_DAYS = 5;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

interface SeedPaymentDataResult {
	obligationIds: Id<"obligations">[];
	planEntryIds: Id<"collectionPlanEntries">[];
	generated: { obligations: number; planEntries: number };
	reused: {
		obligations: number;
		planEntries: number;
		planEntryIds: Id<"collectionPlanEntries">[];
	};
}

// ---------------------------------------------------------------------------
// Shared implementation
// ---------------------------------------------------------------------------

async function seedPaymentDataImpl(
	ctx: MutationCtx,
	args: { mortgageId: Id<"mortgages"> },
): Promise<SeedPaymentDataResult> {
	const { mortgageId } = args;

	// 1. Load mortgage
	const mortgage = await ctx.db.get(mortgageId);
	if (!mortgage) {
		throw new ConvexError(`Mortgage not found: ${mortgageId as string}`);
	}

	// 2. Resolve borrower from mortgageBorrowers join table
	const borrowerLink = await ctx.db
		.query("mortgageBorrowers")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.first();

	if (!borrowerLink) {
		throw new ConvexError(
			`No borrower found for mortgage: ${mortgageId as string}`,
		);
	}

	const borrowerId = borrowerLink.borrowerId;

	// 3. Idempotency check: if obligations already exist, collect IDs but skip generation
	let obligationIds: Id<"obligations">[];
	let generatedObligations = 0;
	let reusedObligations = 0;

	const existingObligation = await ctx.db
		.query("obligations")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.first();

	if (existingObligation) {
		// Obligations already exist — collect all IDs
		const allObligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
			.collect();
		obligationIds = allObligations.map((o) => o._id);
		reusedObligations = obligationIds.length;
	} else {
		// Generate obligations
		const result = await generateObligationsImpl(ctx, {
			mortgageId,
			borrowerId,
			interestRate: mortgage.interestRate,
			principal: mortgage.principal,
			paymentFrequency: mortgage.paymentFrequency,
			firstPaymentDate: mortgage.firstPaymentDate,
			maturityDate: mortgage.maturityDate,
		});
		obligationIds = result.obligations;
		generatedObligations = result.generated;
	}

	// 4. Load obligations due within the scheduling window
	const now = Date.now();
	const schedulingCutoff = now + SCHEDULING_WINDOW_DAYS * MS_PER_DAY;

	const dueSoonObligations = await ctx.db
		.query("obligations")
		.withIndex("by_mortgage_and_date", (q) =>
			q
				.eq("mortgageId", mortgageId)
				.gte("dueDate", now)
				.lte("dueDate", schedulingCutoff),
		)
		.collect();

	// 5. Create plan entries for obligations that don't already have one
	const planEntryIds: Id<"collectionPlanEntries">[] = [];
	const reusedPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	let generatedPlanEntries = 0;
	let reusedPlanEntries = 0;

	// Load existing non-cancelled plan entries to check for duplicates
	// (obligationIds is an array field — no index available, must scan)
	const nonCancelledStatuses = ["planned", "executing", "completed", "rescheduled"] as const;
	const existingPlanEntries = (
		await Promise.all(
			nonCancelledStatuses.map((status) =>
				ctx.db
					.query("collectionPlanEntries")
					.withIndex("by_status", (q) => q.eq("status", status))
					.collect(),
			),
		)
	).flat();

	for (const obligation of dueSoonObligations) {
		// Check if this obligation already has a non-cancelled plan entry
		const existingEntry = existingPlanEntries.find(
			(entry) =>
				entry.status !== "cancelled" &&
				entry.obligationIds.includes(obligation._id),
		);

		if (existingEntry) {
			reusedPlanEntries++;
			reusedPlanEntryIds.push(existingEntry._id);
			continue;
		}

		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: [obligation._id],
			amount: obligation.amount,
			method: "manual",
			scheduledDate: obligation.dueDate,
			status: "planned",
			source: "default_schedule",
			createdAt: now,
		});

		planEntryIds.push(planEntryId);
		generatedPlanEntries++;
	}

	return {
		obligationIds,
		planEntryIds,
		generated: {
			obligations: generatedObligations,
			planEntries: generatedPlanEntries,
		},
		reused: {
			obligations: reusedObligations,
			planEntries: reusedPlanEntries,
			planEntryIds: reusedPlanEntryIds,
		},
	};
}

// ---------------------------------------------------------------------------
// Internal mutation (for seedAll orchestrator)
// ---------------------------------------------------------------------------

export const seedPaymentDataInternal = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
	},
	handler: async (ctx, args) => seedPaymentDataImpl(ctx, args),
});

// ---------------------------------------------------------------------------
// Admin mutation (for dashboard)
// ---------------------------------------------------------------------------

export const seedPaymentData = adminMutation
	.input({ mortgageId: v.id("mortgages") })
	.handler(async (ctx, args) =>
		seedPaymentDataImpl(ctx as unknown as MutationCtx, {
			mortgageId: args.mortgageId,
		}),
	)
	.public();
