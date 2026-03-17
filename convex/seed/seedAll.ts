import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { adminAction } from "../fluent";

interface LedgerBootstrapResult {
	sequenceCounterId: Id<"ledger_sequence_counters">;
	worldAccountId: Id<"ledger_accounts">;
}

interface SeedBrokerResult {
	brokerIds: Id<"brokers">[];
	created: { brokers: number; organizations: number; users: number };
	reused: { brokers: number; organizations: number; users: number };
}

interface SeedBorrowerResult {
	borrowerIds: Id<"borrowers">[];
	created: { borrowers: number; users: number };
	reused: { borrowers: number; users: number };
}

interface SeedLenderResult {
	created: { lenders: number };
	lenderIds: Id<"lenders">[];
	reused: { lenders: number };
}

interface SeedMortgageBorrowerLink {
	borrowerId: Id<"borrowers">;
	mortgageId: Id<"mortgages">;
}

interface SeedMortgageResult {
	created: { mortgages: number; properties: number };
	mortgageBorrowers: SeedMortgageBorrowerLink[];
	reused: { mortgages: number; properties: number };
}

interface SeedObligationResult {
	created: { obligations: number };
	obligationIds: Id<"obligations">[];
	reused: { obligations: number };
}

interface SeedOnboardingRequestResult {
	created: { onboardingRequests: number };
	requestIds: Id<"onboardingRequests">[];
	reused: { onboardingRequests: number };
}

const bootstrapLedgerRef = makeFunctionReference<
	"mutation",
	Record<string, never>,
	LedgerBootstrapResult
>("ledger/bootstrap:bootstrapLedger");

const seedBrokerRef = makeFunctionReference<
	"mutation",
	Record<string, never>,
	SeedBrokerResult
>("seed/seedBroker:seedBroker");

const seedBorrowerRef = makeFunctionReference<
	"mutation",
	Record<string, never>,
	SeedBorrowerResult
>("seed/seedBorrower:seedBorrower");

const seedLenderRef = makeFunctionReference<
	"mutation",
	{ brokerIds?: Id<"brokers">[] },
	SeedLenderResult
>("seed/seedLender:seedLender");

const seedMortgageRef = makeFunctionReference<
	"mutation",
	{ borrowerIds?: Id<"borrowers">[]; brokerIds?: Id<"brokers">[] },
	SeedMortgageResult
>("seed/seedMortgage:seedMortgage");

const seedObligationRef = makeFunctionReference<
	"mutation",
	{
		borrowerIds?: Id<"borrowers">[];
		mortgageBorrowers?: SeedMortgageBorrowerLink[];
	},
	SeedObligationResult
>("seed/seedObligation:seedObligation");

const seedOnboardingRequestRef = makeFunctionReference<
	"mutation",
	{ reviewerId?: string },
	SeedOnboardingRequestResult
>("seed/seedOnboardingRequest:seedOnboardingRequest");

export const seedAll = adminAction
	.input({})
	.handler(async (ctx) => {
		// Bootstrap ledger singletons (WORLD account + sequence counter) before anything else
		const ledgerBootstrap = await ctx.runMutation(bootstrapLedgerRef, {});

		const brokers = await ctx.runMutation(seedBrokerRef, {});
		const borrowers = await ctx.runMutation(seedBorrowerRef, {});
		const lenders = await ctx.runMutation(seedLenderRef, {
			brokerIds: brokers.brokerIds,
		});
		const mortgages = await ctx.runMutation(seedMortgageRef, {
			borrowerIds: borrowers.borrowerIds,
			brokerIds: brokers.brokerIds,
		});
		const obligations = await ctx.runMutation(seedObligationRef, {
			borrowerIds: borrowers.borrowerIds,
			mortgageBorrowers: mortgages.mortgageBorrowers,
		});
		const onboardingRequests = await ctx.runMutation(
			seedOnboardingRequestRef,
			{}
		);

		return {
			ledgerBootstrap,
			brokers,
			borrowers,
			lenders,
			mortgages,
			obligations,
			onboardingRequests,
			summary: {
				ledgerBootstrap: {
					worldAccountId: ledgerBootstrap.worldAccountId,
					sequenceCounterId: ledgerBootstrap.sequenceCounterId,
				},
				created: {
					brokers: brokers.created.brokers,
					borrowers: borrowers.created.borrowers,
					lenders: lenders.created.lenders,
					properties: mortgages.created.properties,
					mortgages: mortgages.created.mortgages,
					obligations: obligations.created.obligations,
					onboardingRequests: onboardingRequests.created.onboardingRequests,
				},
				reused: {
					brokers: brokers.reused.brokers,
					borrowers: borrowers.reused.borrowers,
					lenders: lenders.reused.lenders,
					properties: mortgages.reused.properties,
					mortgages: mortgages.reused.mortgages,
					obligations: obligations.reused.obligations,
					onboardingRequests: onboardingRequests.reused.onboardingRequests,
				},
			},
		};
	})
	.public();
