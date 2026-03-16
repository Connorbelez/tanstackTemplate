import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminMutation } from "../fluent";
import {
	addDaysToDateString,
	findObligationByMortgageAndPaymentNumber,
	resolveBorrowerIds,
	SEED_SOURCE,
	seedTimestamp,
	writeCreationJournalEntry,
	writeSyntheticJournalTrail,
} from "./seedHelpers";

type ObligationState = "due" | "overdue" | "settled" | "upcoming";

interface MortgageBorrowerPair {
	borrowerId: Id<"borrowers">;
	mortgageId: Id<"mortgages">;
}

const OBLIGATION_STATE_MATRIX: readonly (readonly ObligationState[])[] = [
	["upcoming", "due", "overdue"],
	["settled", "upcoming", "due"],
	["overdue", "settled", "upcoming"],
	["due", "settled", "overdue"],
	["upcoming", "settled", "due"],
];

const OBLIGATION_EVENT_MAP: Readonly<Record<string, string>> = {
	"upcoming->due": "DUE_DATE_REACHED",
	"due->overdue": "GRACE_PERIOD_EXPIRED",
	"due->settled": "PAYMENT_APPLIED",
	"overdue->settled": "PAYMENT_APPLIED",
};

async function resolveMortgageBorrowerPairs(
	ctx: Pick<MutationCtx, "db">,
	providedPairs?: readonly MortgageBorrowerPair[],
	providedBorrowerIds?: readonly Id<"borrowers">[]
): Promise<MortgageBorrowerPair[]> {
	if (providedPairs && providedPairs.length > 0) {
		return [...providedPairs];
	}

	const borrowerPool = await resolveBorrowerIds(
		ctx,
		providedBorrowerIds ? [...providedBorrowerIds] : undefined
	);
	const mortgages = await ctx.db.query("mortgages").collect();
	if (mortgages.length === 0) {
		throw new ConvexError(
			"No mortgages available. Seed mortgages first or pass mortgageBorrowers."
		);
	}

	const pairs: MortgageBorrowerPair[] = [];
	for (let index = 0; index < mortgages.length; index += 1) {
		const mortgage = mortgages[index];
		const existingLinks = await ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
			.collect();
		const primaryLink =
			existingLinks.find((link) => link.role === "primary") ?? existingLinks[0];
		if (primaryLink) {
			pairs.push({
				mortgageId: mortgage._id,
				borrowerId: primaryLink.borrowerId,
			});
			continue;
		}

		const borrowerId = borrowerPool[index % borrowerPool.length];
		await ctx.db.insert("mortgageBorrowers", {
			mortgageId: mortgage._id,
			borrowerId,
			role: "primary",
			addedAt: seedTimestamp(43_200_000 + index * 90_000),
		});
		pairs.push({
			mortgageId: mortgage._id,
			borrowerId,
		});
	}

	return pairs;
}

function buildStatePath(state: ObligationState): readonly string[] {
	switch (state) {
		case "upcoming":
			return ["upcoming"];
		case "due":
			return ["upcoming", "due"];
		case "overdue":
			return ["upcoming", "due", "overdue"];
		case "settled":
			return ["upcoming", "due", "settled"];
		default:
			throw new ConvexError(`Unsupported obligation seed state: ${state as string}`);
	}
}

function obligationDates(
	baseDate: string,
	state: ObligationState
): Pick<
	Doc<"obligations">,
	| "dueDate"
	| "gracePeriodEndDate"
	| "settledAt"
	| "settledAmount"
	| "settledDate"
> {
	switch (state) {
		case "upcoming": {
			const dueDate = addDaysToDateString(baseDate, 30);
			return {
				dueDate,
				gracePeriodEndDate: addDaysToDateString(dueDate, 10),
			};
		}
		case "due": {
			const dueDate = addDaysToDateString(baseDate, -5);
			return {
				dueDate,
				gracePeriodEndDate: addDaysToDateString(dueDate, 10),
			};
		}
		case "overdue": {
			const dueDate = addDaysToDateString(baseDate, -40);
			return {
				dueDate,
				gracePeriodEndDate: addDaysToDateString(dueDate, 15),
			};
		}
		case "settled": {
			const dueDate = addDaysToDateString(baseDate, -20);
			const settledDate = addDaysToDateString(dueDate, 12);
			return {
				dueDate,
				gracePeriodEndDate: addDaysToDateString(dueDate, 15),
				settledDate,
				settledAt: new Date(`${settledDate}T12:00:00.000Z`).getTime(),
			};
		}
		default:
			throw new ConvexError(`Unsupported obligation date state: ${state as string}`);
	}
}

export const seedObligation = adminMutation
	.input({
		borrowerIds: v.optional(v.array(v.id("borrowers"))),
		mortgageBorrowers: v.optional(
			v.array(
				v.object({
					borrowerId: v.id("borrowers"),
					mortgageId: v.id("mortgages"),
				})
			)
		),
	})
	.handler(async (ctx, args) => {
		const mortgageBorrowerPairs = await resolveMortgageBorrowerPairs(
			ctx,
			args.mortgageBorrowers,
			args.borrowerIds
		);
		const obligationIds: Id<"obligations">[] = [];
		let createdObligations = 0;
		let reusedObligations = 0;

		for (
			let mortgageIndex = 0;
			mortgageIndex < mortgageBorrowerPairs.length;
			mortgageIndex += 1
		) {
			const pair = mortgageBorrowerPairs[mortgageIndex];
			const mortgage = await ctx.db.get(pair.mortgageId);
			if (!mortgage) {
				throw new ConvexError(
					`Mortgage not found for obligation seed: ${pair.mortgageId}`
				);
			}

			const states =
				OBLIGATION_STATE_MATRIX[mortgageIndex % OBLIGATION_STATE_MATRIX.length];
			for (
				let paymentIndex = 0;
				paymentIndex < states.length;
				paymentIndex += 1
			) {
				const state = states[paymentIndex];
				const paymentNumber = paymentIndex + 1;
				const existingObligation =
					await findObligationByMortgageAndPaymentNumber(ctx, {
						mortgageId: pair.mortgageId,
						paymentNumber,
					});
				if (existingObligation) {
					reusedObligations += 1;
					obligationIds.push(existingObligation._id);
					continue;
				}

				const createdAt = seedTimestamp(
					46_800_000 + mortgageIndex * 7_200_000 + paymentIndex * 1_200_000
				);
				const statePath = buildStatePath(state);
				const transitionCount = Math.max(0, statePath.length - 1);
				const finalTransitionAt = createdAt + transitionCount * 60_000;
				const amount = mortgage.paymentAmount;
				const interestPortion = Math.round(amount * 0.34);
				const principalPortion = amount - interestPortion;
				const dateFields = obligationDates(mortgage.firstPaymentDate, state);
				const payloadByTransition =
					state === "settled"
						? {
								"due->settled": {
									amount,
									paidAt: dateFields.settledAt,
								},
							}
						: undefined;

				const obligationId = await ctx.db.insert("obligations", {
					status: state,
					machineContext: undefined,
					lastTransitionAt:
						state === "upcoming" ? createdAt : finalTransitionAt,
					mortgageId: pair.mortgageId,
					borrowerId: pair.borrowerId,
					paymentNumber,
					amount,
					principalPortion,
					interestPortion,
					dueDate: dateFields.dueDate,
					gracePeriodEndDate: dateFields.gracePeriodEndDate,
					settledAmount: state === "settled" ? amount : undefined,
					settledDate: dateFields.settledDate,
					settledAt: dateFields.settledAt,
					createdAt,
				});

				await writeCreationJournalEntry(ctx, {
					entityType: "obligation",
					entityId: obligationId,
					initialState: "upcoming",
					source: SEED_SOURCE,
					timestamp: createdAt,
					payload: {
						mortgageId: pair.mortgageId,
						borrowerId: pair.borrowerId,
						paymentNumber,
					},
				});
				await writeSyntheticJournalTrail(ctx, {
					entityType: "obligation",
					entityId: obligationId,
					statePath,
					eventMap: OBLIGATION_EVENT_MAP,
					payloadByTransition,
					source: SEED_SOURCE,
					startTimestamp: createdAt + 60_000,
				});

				createdObligations += 1;
				obligationIds.push(obligationId);
			}
		}

		return {
			obligationIds,
			created: {
				obligations: createdObligations,
			},
			reused: {
				obligations: reusedObligations,
			},
		};
	})
	.public();
