import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../fluent";
import { seedCollectionRulesImpl } from "../payments/collectionPlan/defaultRules";
import { scheduleInitialEntriesImpl } from "../payments/collectionPlan/initialScheduling";
import { generateObligationsImpl } from "../payments/obligations/generateImpl";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

interface SeedPaymentDataResult {
	generated: { obligations: number; planEntries: number };
	obligationIds: Id<"obligations">[];
	planEntryIds: Id<"collectionPlanEntries">[];
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
	args: { mortgageId: Id<"mortgages"> }
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
			`No borrower found for mortgage: ${mortgageId as string}`
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

	// 4. Ensure canonical collection rules exist before initial scheduling runs
	const rules = await seedCollectionRulesImpl(ctx);
	const scheduleRule = await ctx.db.get(rules.ruleIdsByName.schedule_rule);
	const scheduleRuleParameters = scheduleRule?.parameters as
		| { delayDays?: number }
		| undefined;

	// 5. Generate initial plan entries through canonical schedule-rule semantics
	const schedulingResult = await scheduleInitialEntriesImpl(ctx, {
		mortgageId,
		delayDays: scheduleRuleParameters?.delayDays ?? 5,
		ruleId: rules.ruleIdsByName.schedule_rule,
	});

	return {
		obligationIds,
		planEntryIds: schedulingResult.createdPlanEntryIds,
		generated: {
			obligations: generatedObligations,
			planEntries: schedulingResult.created,
		},
		reused: {
			obligations: reusedObligations,
			planEntries: schedulingResult.reused,
			planEntryIds: schedulingResult.reusedPlanEntryIds,
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
		})
	)
	.public();
