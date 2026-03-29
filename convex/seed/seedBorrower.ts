import type { Id } from "../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../constants";
import { adminMutation } from "../fluent";
import {
	ensureUserByEmail,
	findBorrowerByUserId,
	SEED_SOURCE,
	type SeedUserFixture,
	seedAuthIdFromEmail,
	seedTimestamp,
	writeCreationJournalEntry,
} from "./seedHelpers";

interface BorrowerFinancialProfile {
	annualIncomeCents: number;
	creditScore: number;
	debtServiceRatioBps: number;
	downPaymentCents: number;
	employmentType: "contract" | "retired" | "salaried" | "self_employed";
	liquidAssetsCents: number;
	monthlyDebtObligationsCents: number;
	targetLoanAmountCents: number;
}

interface BorrowerSeedFixture {
	borrower: {
		financialProfile: BorrowerFinancialProfile;
		idvStatus?: string;
		onboardedAtOffsetMs?: number;
		personaInquiryId?: string;
		status: string;
	};
	user: SeedUserFixture;
}

const BORROWER_FIXTURES: readonly BorrowerSeedFixture[] = [
	{
		user: {
			authId: seedAuthIdFromEmail("noah.martin+borrower@fairlend.ca"),
			email: "noah.martin+borrower@fairlend.ca",
			firstName: "Noah",
			lastName: "Martin",
			phoneNumber: "+1-416-555-0171",
			address: {
				streetAddress: "88 Queens Quay W",
				unit: "1204",
				city: "Toronto",
				postalCode: "M5J0B8",
			},
		},
		borrower: {
			status: "active",
			idvStatus: "verified",
			personaInquiryId: "inq_seed_borrower_001",
			onboardedAtOffsetMs: 900_000,
			financialProfile: {
				employmentType: "salaried",
				annualIncomeCents: 13_800_000,
				creditScore: 772,
				downPaymentCents: 16_500_000,
				liquidAssetsCents: 21_000_000,
				monthlyDebtObligationsCents: 125_000,
				debtServiceRatioBps: 2150,
				targetLoanAmountCents: 68_000_000,
			},
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("sophia.nguyen+borrower@fairlend.ca"),
			email: "sophia.nguyen+borrower@fairlend.ca",
			firstName: "Sophia",
			lastName: "Nguyen",
			phoneNumber: "+1-647-555-0165",
			address: {
				streetAddress: "3024 Dundas St W",
				city: "Toronto",
				postalCode: "M6P1Z2",
			},
		},
		borrower: {
			status: "active",
			idvStatus: "verified",
			personaInquiryId: "inq_seed_borrower_002",
			onboardedAtOffsetMs: 600_000,
			financialProfile: {
				employmentType: "self_employed",
				annualIncomeCents: 19_200_000,
				creditScore: 745,
				downPaymentCents: 24_500_000,
				liquidAssetsCents: 32_000_000,
				monthlyDebtObligationsCents: 285_000,
				debtServiceRatioBps: 2670,
				targetLoanAmountCents: 95_000_000,
			},
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("liam.brown+borrower@fairlend.ca"),
			email: "liam.brown+borrower@fairlend.ca",
			firstName: "Liam",
			lastName: "Brown",
			phoneNumber: "+1-613-555-0127",
			address: {
				streetAddress: "151 Bank St",
				unit: "17B",
				city: "Ottawa",
				postalCode: "K1P5N7",
			},
		},
		borrower: {
			status: "active",
			idvStatus: "pending_review",
			personaInquiryId: "inq_seed_borrower_003",
			financialProfile: {
				employmentType: "contract",
				annualIncomeCents: 10_900_000,
				creditScore: 708,
				downPaymentCents: 10_800_000,
				liquidAssetsCents: 9_400_000,
				monthlyDebtObligationsCents: 190_000,
				debtServiceRatioBps: 3110,
				targetLoanAmountCents: 53_000_000,
			},
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("olivia.patel+borrower@fairlend.ca"),
			email: "olivia.patel+borrower@fairlend.ca",
			firstName: "Olivia",
			lastName: "Patel",
			phoneNumber: "+1-905-555-0114",
			address: {
				streetAddress: "42 Main St",
				unit: "11",
				city: "Markham",
				postalCode: "L3R4M9",
			},
		},
		borrower: {
			status: "active",
			idvStatus: "verified",
			personaInquiryId: "inq_seed_borrower_004",
			onboardedAtOffsetMs: 300_000,
			financialProfile: {
				employmentType: "salaried",
				annualIncomeCents: 11_600_000,
				creditScore: 734,
				downPaymentCents: 8_400_000,
				liquidAssetsCents: 14_700_000,
				monthlyDebtObligationsCents: 98_000,
				debtServiceRatioBps: 2380,
				targetLoanAmountCents: 44_000_000,
			},
		},
	},
	{
		user: {
			authId: seedAuthIdFromEmail("ethan.tremblay+borrower@fairlend.ca"),
			email: "ethan.tremblay+borrower@fairlend.ca",
			firstName: "Ethan",
			lastName: "Tremblay",
			phoneNumber: "+1-519-555-0144",
			address: {
				streetAddress: "73 King St S",
				city: "Waterloo",
				postalCode: "N2J1P2",
			},
			dateOfBirth: "1983-04-18",
		},
		borrower: {
			status: "active",
			idvStatus: "manual_review_required",
			personaInquiryId: "inq_seed_borrower_005",
			financialProfile: {
				employmentType: "retired",
				annualIncomeCents: 8_200_000,
				creditScore: 701,
				downPaymentCents: 18_000_000,
				liquidAssetsCents: 37_500_000,
				monthlyDebtObligationsCents: 110_000,
				debtServiceRatioBps: 1940,
				targetLoanAmountCents: 35_500_000,
			},
		},
	},
];

export const seedBorrower = adminMutation
	.input({})
	.handler(async (ctx) => {
		const borrowerIds: Id<"borrowers">[] = [];
		let createdBorrowers = 0;
		let createdUsers = 0;
		let reusedBorrowers = 0;
		let reusedUsers = 0;

		for (let index = 0; index < BORROWER_FIXTURES.length; index += 1) {
			const fixture = BORROWER_FIXTURES[index];
			const { userId, wasCreated: userCreated } = await ensureUserByEmail(
				ctx,
				fixture.user
			);
			if (userCreated) {
				createdUsers += 1;
			} else {
				reusedUsers += 1;
			}

			const existingBorrower = await findBorrowerByUserId(ctx, userId);
			if (existingBorrower) {
				reusedBorrowers += 1;
				borrowerIds.push(existingBorrower._id);
				continue;
			}

			const createdAt = seedTimestamp(7_200_000 + index * 3_600_000);
			const onboardedAt = fixture.borrower.onboardedAtOffsetMs
				? createdAt + fixture.borrower.onboardedAtOffsetMs
				: undefined;

			const borrowerId = await ctx.db.insert("borrowers", {
				orgId: FAIRLEND_STAFF_ORG_ID,
				status: fixture.borrower.status,
				userId,
				financialProfile: fixture.borrower.financialProfile,
				idvStatus: fixture.borrower.idvStatus,
				personaInquiryId: fixture.borrower.personaInquiryId,
				onboardedAt,
				createdAt,
			});

			await writeCreationJournalEntry(ctx, {
				entityType: "borrower",
				entityId: borrowerId,
				initialState: fixture.borrower.status,
				source: SEED_SOURCE,
				timestamp: createdAt,
				organizationId: FAIRLEND_STAFF_ORG_ID,
				payload: {
					userId,
					idvStatus: fixture.borrower.idvStatus,
				},
			});

			createdBorrowers += 1;
			borrowerIds.push(borrowerId);
		}

		return {
			borrowerIds,
			created: {
				borrowers: createdBorrowers,
				users: createdUsers,
			},
			reused: {
				borrowers: reusedBorrowers,
				users: reusedUsers,
			},
		};
	})
	.public();
