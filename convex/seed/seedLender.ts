import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminMutation } from "../fluent";
import {
	ensureUserByEmail,
	findLenderByUserId,
	SEED_SOURCE,
	type SeedUserFixture,
	seedAuthIdFromEmail,
	seedTimestamp,
	writeCreationJournalEntry,
} from "./seedHelpers";

interface LenderSeedFixture {
	lender: {
		accreditationStatus: Doc<"lenders">["accreditationStatus"];
		activatedAtOffsetMs?: number;
		idvStatus?: string;
		kycStatus?: string;
		onboardingEntryPath: string;
		personaInquiryId?: string;
		status: string;
	};
	user: SeedUserFixture;
}

const LENDER_FIXTURES: readonly LenderSeedFixture[] = [
	{
		user: {
			authId: seedAuthIdFromEmail("grace.wilson+lender@fairlend.ca"),
			email: "grace.wilson+lender@fairlend.ca",
			firstName: "Grace",
			lastName: "Wilson",
			phoneNumber: "+1-437-555-0168",
			address: {
				streetAddress: "175 Bloor St E",
				unit: "1402",
				city: "Toronto",
				postalCode: "M4W3R8",
			},
		},
		lender: {
			status: "active",
			accreditationStatus: "accredited",
			idvStatus: "verified",
			kycStatus: "approved",
			personaInquiryId: "inq_seed_lender_001",
			onboardingEntryPath: "self_signup",
			activatedAtOffsetMs: 900_000,
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("summit.credit+lender@fairlend.ca"),
			email: "summit.credit+lender@fairlend.ca",
			firstName: "Summit",
			lastName: "Credit",
			phoneNumber: "+1-416-555-0183",
			address: {
				streetAddress: "181 Bay St",
				unit: "2700",
				city: "Toronto",
				postalCode: "M5J2T3",
			},
		},
		lender: {
			status: "active",
			accreditationStatus: "exempt",
			idvStatus: "verified",
			kycStatus: "approved",
			personaInquiryId: "inq_seed_lender_002",
			onboardingEntryPath: "broker_invite",
			activatedAtOffsetMs: 600_000,
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("maple.mic+lender@fairlend.ca"),
			email: "maple.mic+lender@fairlend.ca",
			firstName: "Maple",
			lastName: "MIC",
			phoneNumber: "+1-905-555-0189",
			address: {
				streetAddress: "5500 North Service Rd",
				unit: "Suite 310",
				city: "Burlington",
				postalCode: "L7L6W6",
			},
		},
		lender: {
			status: "pending_activation",
			accreditationStatus: "pending",
			idvStatus: "pending_review",
			kycStatus: "in_progress",
			personaInquiryId: "inq_seed_lender_003",
			onboardingEntryPath: "admin_dashboard",
		},
	},
];

async function resolveBrokerPool(
	ctx: Pick<MutationCtx, "db">,
	requestedBrokerIds?: Id<"brokers">[]
): Promise<Id<"brokers">[]> {
	if (requestedBrokerIds && requestedBrokerIds.length > 0) {
		const uniqueBrokerIds: Id<"brokers">[] = [];
		const seenBrokerIds = new Set<string>();

		for (const brokerId of requestedBrokerIds) {
			if (seenBrokerIds.has(brokerId)) {
				continue;
			}
			const broker = await ctx.db.get(brokerId);
			if (!broker) {
				throw new ConvexError(`Broker not found for seed input: ${brokerId}`);
			}
			seenBrokerIds.add(brokerId);
			uniqueBrokerIds.push(brokerId);
		}
		return uniqueBrokerIds;
	}

	const activeBrokers = await ctx.db
		.query("brokers")
		.withIndex("by_status", (q) => q.eq("status", "active"))
		.collect();
	if (activeBrokers.length > 0) {
		return activeBrokers.map((broker) => broker._id);
	}

	const allBrokers = await ctx.db.query("brokers").collect();
	if (allBrokers.length === 0) {
		throw new ConvexError(
			"No brokers available. Seed brokers first or pass brokerIds."
		);
	}
	return allBrokers.map((broker) => broker._id);
}

export const seedLender = adminMutation
	.input({
		brokerIds: v.optional(v.array(v.id("brokers"))),
	})
	.handler(async (ctx, args) => {
		const brokerPool = await resolveBrokerPool(ctx, args.brokerIds);
		const lenderIds: Id<"lenders">[] = [];
		let createdLenders = 0;
		let createdUsers = 0;
		let reusedLenders = 0;
		let reusedUsers = 0;

		for (let index = 0; index < LENDER_FIXTURES.length; index += 1) {
			const fixture = LENDER_FIXTURES[index];
			const { userId, wasCreated: userCreated } = await ensureUserByEmail(
				ctx,
				fixture.user
			);
			if (userCreated) {
				createdUsers += 1;
			} else {
				reusedUsers += 1;
			}

			const existingLender = await findLenderByUserId(ctx, userId);
			if (existingLender) {
				reusedLenders += 1;
				lenderIds.push(existingLender._id);
				continue;
			}

			const brokerId = brokerPool[index % brokerPool.length];
			const createdAt = seedTimestamp(14_400_000 + index * 3_600_000);
			const activatedAt = fixture.lender.activatedAtOffsetMs
				? createdAt + fixture.lender.activatedAtOffsetMs
				: undefined;

			const lenderId = await ctx.db.insert("lenders", {
				userId,
				brokerId,
				accreditationStatus: fixture.lender.accreditationStatus,
				idvStatus: fixture.lender.idvStatus,
				kycStatus: fixture.lender.kycStatus,
				personaInquiryId: fixture.lender.personaInquiryId,
				onboardingEntryPath: fixture.lender.onboardingEntryPath,
				status: fixture.lender.status,
				activatedAt,
				createdAt,
			});

			await writeCreationJournalEntry(ctx, {
				entityType: "lender",
				entityId: lenderId,
				initialState: fixture.lender.status,
				source: SEED_SOURCE,
				timestamp: createdAt,
				payload: {
					userId,
					brokerId,
					accreditationStatus: fixture.lender.accreditationStatus,
				},
			});

			createdLenders += 1;
			lenderIds.push(lenderId);
		}

		return {
			brokerIds: brokerPool,
			lenderIds,
			created: {
				lenders: createdLenders,
				users: createdUsers,
			},
			reused: {
				lenders: reusedLenders,
				users: reusedUsers,
			},
		};
	})
	.public();
