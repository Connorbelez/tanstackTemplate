import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { FAIRLEND_BROKERAGE_ORG_ID, FAIRLEND_STAFF_ORG_ID } from "../constants";
import { adminMutation } from "../fluent";
import {
	ensureUserByEmail,
	findOnboardingRequestByUserAndRole,
	SEED_SOURCE,
	type SeedUserFixture,
	seedAuthIdFromEmail,
	seedTimestamp,
	writeCreationJournalEntry,
	writeSyntheticJournalTrail,
} from "./seedHelpers";

interface OnboardingRequestSeedFixture {
	request: {
		referralSource: Doc<"onboardingRequests">["referralSource"];
		rejectionReason?: string;
		requestedRole: Doc<"onboardingRequests">["requestedRole"];
		reviewedBy?: string;
		status: "approved" | "pending_review" | "rejected";
		targetOrganizationId?: string;
	};
	user: SeedUserFixture;
}

const ONBOARDING_EVENT_MAP: Readonly<Record<string, string>> = {
	"pending_review->approved": "APPROVE",
	"pending_review->rejected": "REJECT",
};

const ONBOARDING_FIXTURES: readonly OnboardingRequestSeedFixture[] = [
	{
		user: {
			authId: seedAuthIdFromEmail("pending.broker+onboarding@fairlend.ca"),
			email: "pending.broker+onboarding@fairlend.ca",
			firstName: "Pending",
			lastName: "Broker",
			phoneNumber: "+1-416-555-0221",
		},
		request: {
			requestedRole: "broker",
			status: "pending_review",
			referralSource: "self_signup",
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("approved.lender+onboarding@fairlend.ca"),
			email: "approved.lender+onboarding@fairlend.ca",
			firstName: "Approved",
			lastName: "Lender",
			phoneNumber: "+1-416-555-0222",
		},
		request: {
			requestedRole: "lender",
			status: "approved",
			referralSource: "self_signup",
			targetOrganizationId: FAIRLEND_BROKERAGE_ORG_ID,
			reviewedBy: SEED_SOURCE.actorId,
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("rejected.uw+onboarding@fairlend.ca"),
			email: "rejected.uw+onboarding@fairlend.ca",
			firstName: "Rejected",
			lastName: "Underwriter",
			phoneNumber: "+1-416-555-0223",
		},
		request: {
			requestedRole: "underwriter",
			status: "rejected",
			referralSource: "self_signup",
			targetOrganizationId: FAIRLEND_STAFF_ORG_ID,
			reviewedBy: SEED_SOURCE.actorId,
			rejectionReason: "Seeded rejection for admin review tooling",
		},
	},
];

function onboardingStatePath(
	status: OnboardingRequestSeedFixture["request"]["status"]
): readonly string[] {
	switch (status) {
		case "pending_review":
			return ["pending_review"];
		case "approved":
			return ["pending_review", "approved"];
		case "rejected":
			return ["pending_review", "rejected"];
		default:
			return ["pending_review"];
	}
}

export const seedOnboardingRequest = adminMutation
	.input({
		reviewerId: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const requestIds: Id<"onboardingRequests">[] = [];
		let createdRequests = 0;
		let createdUsers = 0;
		let reusedRequests = 0;
		let reusedUsers = 0;

		for (let index = 0; index < ONBOARDING_FIXTURES.length; index += 1) {
			const fixture = ONBOARDING_FIXTURES[index];
			const { userId, wasCreated: userCreated } = await ensureUserByEmail(
				ctx,
				fixture.user
			);
			if (userCreated) {
				createdUsers += 1;
			} else {
				reusedUsers += 1;
			}

			const existingRequest = await findOnboardingRequestByUserAndRole(ctx, {
				userId,
				requestedRole: fixture.request.requestedRole,
				status: fixture.request.status,
			});
			if (existingRequest) {
				reusedRequests += 1;
				requestIds.push(existingRequest._id);
				continue;
			}

			const createdAt = seedTimestamp(82_800_000 + index * 2_700_000);
			const statePath = onboardingStatePath(fixture.request.status);
			const reviewTimestamp =
				fixture.request.status === "pending_review"
					? undefined
					: createdAt + 60_000;
			const reviewedBy = reviewTimestamp
				? (fixture.request.reviewedBy ?? args.reviewerId)
				: undefined;
			const requestId = await ctx.db.insert("onboardingRequests", {
				userId,
				requestedRole: fixture.request.requestedRole,
				status: fixture.request.status,
				machineContext: undefined,
				lastTransitionAt: reviewTimestamp ?? createdAt,
				referralSource: fixture.request.referralSource,
				targetOrganizationId: fixture.request.targetOrganizationId,
				reviewedBy,
				reviewedAt: reviewTimestamp,
				rejectionReason: fixture.request.rejectionReason,
				createdAt,
			});

			await writeCreationJournalEntry(ctx, {
				entityType: "onboardingRequest",
				entityId: requestId,
				initialState: "pending_review",
				source: SEED_SOURCE,
				timestamp: createdAt,
				payload: {
					userId,
					requestedRole: fixture.request.requestedRole,
					referralSource: fixture.request.referralSource,
				},
			});
			await writeSyntheticJournalTrail(ctx, {
				entityType: "onboardingRequest",
				entityId: requestId,
				statePath,
				eventMap: ONBOARDING_EVENT_MAP,
				source: SEED_SOURCE,
				startTimestamp: createdAt + 60_000,
			});

			createdRequests += 1;
			requestIds.push(requestId);
		}

		return {
			requestIds,
			created: {
				onboardingRequests: createdRequests,
				users: createdUsers,
			},
			reused: {
				onboardingRequests: reusedRequests,
				users: reusedUsers,
			},
		};
	})
	.public();
