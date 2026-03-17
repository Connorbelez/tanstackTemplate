import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminMutation } from "../fluent";
import {
	DEFAULT_JOURNAL_TIME_STEP_MS,
	findDealByMortgageAndBuyer,
	SEED_SOURCE,
	seedAuthIdFromEmail,
	seedTimestamp,
	writeCreationJournalEntry,
	writeSyntheticJournalTrail,
} from "./seedHelpers";

interface DealMachineContext {
	dealId: string;
	reservationId?: string;
}

type DealSeedStatus =
	| "initiated"
	| "lawyerOnboarding.verified"
	| "documentReview.signed";

interface DealSeedFixture {
	buyerIndex: number;
	closingDateOffsetDays?: number;
	createdAtOffsetMs: number;
	fractionalShare: number;
	lawyerId?: string;
	lawyerType?: Doc<"deals">["lawyerType"];
	mortgageIndex: number;
	reservationId?: string;
	sellerIndex: number;
	statePath: readonly string[];
	status: DealSeedStatus;
	verificationId?: string;
}

const DEAL_EVENT_MAP: Readonly<Record<string, string>> = {
	"initiated->lawyerOnboarding.pending": "DEAL_LOCKED",
	"lawyerOnboarding.pending->lawyerOnboarding.verified": "LAWYER_VERIFIED",
	"lawyerOnboarding.verified->lawyerOnboarding.complete":
		"REPRESENTATION_CONFIRMED",
	"lawyerOnboarding.complete->documentReview.pending": "PHASE_COMPLETE",
	"documentReview.pending->documentReview.signed": "LAWYER_APPROVED_DOCUMENTS",
	"documentReview.signed->documentReview.complete": "ALL_PARTIES_SIGNED",
	"documentReview.complete->fundsTransfer.pending": "PHASE_COMPLETE",
};

const SEED_LENDER_AUTH_IDS: readonly string[] = [
	seedAuthIdFromEmail("grace.wilson+lender@fairlend.ca"),
	seedAuthIdFromEmail("summit.credit+lender@fairlend.ca"),
	seedAuthIdFromEmail("maple.mic+lender@fairlend.ca"),
];

const DEAL_FIXTURES: readonly DealSeedFixture[] = [
	{
		status: "initiated",
		statePath: ["initiated"],
		mortgageIndex: 0,
		buyerIndex: 0,
		sellerIndex: 1,
		fractionalShare: 3000,
		createdAtOffsetMs: 90_000_000,
	},
	{
		// Placeholder reservation IDs keep mid-phase states rehydratable for UI testing.
		status: "lawyerOnboarding.verified",
		statePath: [
			"initiated",
			"lawyerOnboarding.pending",
			"lawyerOnboarding.verified",
		],
		mortgageIndex: 1,
		buyerIndex: 1,
		sellerIndex: 0,
		fractionalShare: 5000,
		closingDateOffsetDays: 14,
		lawyerId: "seed-lawyer-platform-1",
		lawyerType: "platform_lawyer",
		createdAtOffsetMs: 92_400_000,
		verificationId: "seed-lawyer-verification-1",
		reservationId: "seed-reservation-1",
	},
	{
		status: "documentReview.signed",
		statePath: [
			"initiated",
			"lawyerOnboarding.pending",
			"lawyerOnboarding.verified",
			"lawyerOnboarding.complete",
			"documentReview.pending",
			"documentReview.signed",
		],
		mortgageIndex: 2,
		buyerIndex: 2,
		sellerIndex: 1,
		fractionalShare: 2000,
		closingDateOffsetDays: 7,
		lawyerId: "seed-lawyer-guest-2",
		lawyerType: "guest_lawyer",
		createdAtOffsetMs: 94_800_000,
		verificationId: "seed-lawyer-verification-2",
		reservationId: "seed-reservation-2",
	},
];

async function resolveMortgageIds(
	ctx: Pick<MutationCtx, "db">,
	provided?: readonly Id<"mortgages">[]
): Promise<Id<"mortgages">[]> {
	if (provided && provided.length > 0) {
		const uniqueMortgageIds: Id<"mortgages">[] = [];
		const seenMortgageIds = new Set<Id<"mortgages">>();

		for (const mortgageId of provided) {
			if (seenMortgageIds.has(mortgageId)) {
				continue;
			}
			const mortgage = await ctx.db.get(mortgageId);
			if (!mortgage) {
				throw new ConvexError(
					`Mortgage not found for deal seed input: ${mortgageId}`
				);
			}
			seenMortgageIds.add(mortgageId);
			uniqueMortgageIds.push(mortgageId);
		}
		return uniqueMortgageIds;
	}

	const mortgages = await ctx.db.query("mortgages").collect();
	if (mortgages.length === 0) {
		throw new ConvexError(
			"No mortgages available. Seed mortgages first or pass mortgageIds."
		);
	}
	return mortgages
		.sort((left, right) => left.createdAt - right.createdAt)
		.map((mortgage) => mortgage._id);
}

function resolveLenderAuthIds(provided?: readonly string[]): string[] {
	const source =
		provided && provided.length > 0 ? provided : SEED_LENDER_AUTH_IDS;
	const uniqueAuthIds: string[] = [];
	const seenAuthIds = new Set<string>();

	for (const authId of source) {
		if (!authId || seenAuthIds.has(authId)) {
			continue;
		}
		seenAuthIds.add(authId);
		uniqueAuthIds.push(authId);
	}

	return uniqueAuthIds;
}

export const seedDeal = adminMutation
	.input({
		mortgageIds: v.optional(v.array(v.id("mortgages"))),
		lenderAuthIds: v.optional(v.array(v.string())),
	})
	.handler(async (ctx, args) => {
		const mortgageIds = await resolveMortgageIds(ctx, args.mortgageIds);
		const lenderAuthIds = resolveLenderAuthIds(args.lenderAuthIds);

		if (mortgageIds.length < DEAL_FIXTURES.length) {
			throw new ConvexError(
				`Need at least ${DEAL_FIXTURES.length} mortgages to seed deals.`
			);
		}
		if (lenderAuthIds.length < SEED_LENDER_AUTH_IDS.length) {
			throw new ConvexError(
				`Need at least ${SEED_LENDER_AUTH_IDS.length} lender auth IDs to seed deals.`
			);
		}

		const dealIds: Id<"deals">[] = [];
		let createdDeals = 0;
		let reusedDeals = 0;

		for (const fixture of DEAL_FIXTURES) {
			const mortgageId = mortgageIds[fixture.mortgageIndex];
			const buyerId = lenderAuthIds[fixture.buyerIndex];
			const sellerId = lenderAuthIds[fixture.sellerIndex];
			const existingDeal = await findDealByMortgageAndBuyer(ctx, {
				mortgageId,
				buyerId,
			});

			if (existingDeal) {
				reusedDeals += 1;
				dealIds.push(existingDeal._id);
				continue;
			}

			const createdAt = seedTimestamp(fixture.createdAtOffsetMs);
			const closingDate =
				fixture.closingDateOffsetDays === undefined
					? undefined
					: createdAt + fixture.closingDateOffsetDays * 86_400_000;
			const transitionCount = Math.max(0, fixture.statePath.length - 1);
			const finalTransitionAt =
				createdAt + transitionCount * DEFAULT_JOURNAL_TIME_STEP_MS;

			const dealId = await ctx.db.insert("deals", {
				status: fixture.status,
				machineContext: undefined,
				lastTransitionAt: transitionCount === 0 ? createdAt : finalTransitionAt,
				mortgageId,
				buyerId,
				sellerId,
				fractionalShare: fixture.fractionalShare,
				closingDate,
				lawyerId: fixture.lawyerId,
				lawyerType: fixture.lawyerType,
				createdAt,
				createdBy: SEED_SOURCE.actorId ?? "seed",
			});

			const machineContext: DealMachineContext = {
				dealId,
				reservationId: fixture.reservationId,
			};
			await ctx.db.patch(dealId, { machineContext });

			await writeCreationJournalEntry(ctx, {
				entityType: "deal",
				entityId: dealId,
				initialState: "initiated",
				source: SEED_SOURCE,
				timestamp: createdAt,
				payload: {
					mortgageId,
					buyerId,
					sellerId,
					fractionalShare: fixture.fractionalShare,
				},
			});

			const payloadByTransition: Readonly<
				Record<string, Record<string, unknown>>
			> = {
				"initiated->lawyerOnboarding.pending":
					closingDate === undefined ? {} : { closingDate },
				"lawyerOnboarding.pending->lawyerOnboarding.verified":
					fixture.verificationId === undefined
						? {}
						: { verificationId: fixture.verificationId },
			};

			await writeSyntheticJournalTrail(ctx, {
				entityType: "deal",
				entityId: dealId,
				statePath: fixture.statePath,
				eventMap: DEAL_EVENT_MAP,
				payloadByTransition,
				source: SEED_SOURCE,
				startTimestamp: createdAt + DEFAULT_JOURNAL_TIME_STEP_MS,
			});

			createdDeals += 1;
			dealIds.push(dealId);
		}

		return {
			dealIds,
			created: {
				deals: createdDeals,
			},
			reused: {
				deals: reusedDeals,
			},
		};
	})
	.public();
