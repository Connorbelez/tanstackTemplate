import type { FunctionReference } from "convex/server";
import { api } from "../_generated/api";
import { adminAction } from "../fluent";

// These references resolve after `convex codegen` picks up the new seed files.
// Until then, cast through the api object to avoid TS errors.
const seedApi = api.seed as Record<
	string,
	Record<string, FunctionReference<"mutation", "public">>
>;

export const seedAll = adminAction
	.input({})
	.handler(async (ctx) => {
		// Bootstrap ledger singletons (WORLD account + sequence counter) before anything else
		const ledgerBootstrap = await ctx.runMutation(
			api.ledger.bootstrap.bootstrapLedger,
			{}
		);

		const brokers = await ctx.runMutation(api.seed.seedBroker.seedBroker, {});
		const borrowers = await ctx.runMutation(
			api.seed.seedBorrower.seedBorrower,
			{}
		);
		const lenders = await ctx.runMutation(api.seed.seedLender.seedLender, {
			brokerIds: brokers.brokerIds,
		});
		const mortgages = await ctx.runMutation(seedApi.seedMortgage.seedMortgage, {
			borrowerIds: borrowers.borrowerIds,
			brokerIds: brokers.brokerIds,
		});
		const obligations = await ctx.runMutation(
			seedApi.seedObligation.seedObligation,
			{
				borrowerIds: borrowers.borrowerIds,
				mortgageBorrowers: mortgages.mortgageBorrowers,
			}
		);
		const onboardingRequests = await ctx.runMutation(
			seedApi.seedOnboardingRequest.seedOnboardingRequest,
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
