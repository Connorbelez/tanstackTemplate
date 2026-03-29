import type { Id } from "../_generated/dataModel";
import { FAIRLEND_BROKERAGE_ORG_ID } from "../constants";
import { adminMutation } from "../fluent";
import {
	ensureOrganization,
	ensureUserByEmail,
	findBrokerByLicenseId,
	SEED_SOURCE,
	type SeedOrganizationFixture,
	type SeedUserFixture,
	seedAuthIdFromEmail,
	seedTimestamp,
	writeCreationJournalEntry,
} from "./seedHelpers";

interface BrokerSeedFixture {
	brokerageName: string;
	licenseId: string;
	organization: SeedOrganizationFixture;
	user: SeedUserFixture;
}

const BROKER_FIXTURES: readonly BrokerSeedFixture[] = [
	{
		licenseId: "M08001234",
		brokerageName: "FairLend Capital",
		organization: {
			workosId: FAIRLEND_BROKERAGE_ORG_ID,
			name: "FairLend Capital",
			allowProfilesOutsideOrganization: true,
			externalId: "seed_fairlend_capital",
		},
		user: {
			authId: seedAuthIdFromEmail("amelia.chan+broker@fairlend.ca"),
			email: "amelia.chan+broker@fairlend.ca",
			firstName: "Amelia",
			lastName: "Chan",
			phoneNumber: "+1-416-555-0101",
			address: {
				streetAddress: "120 King St W",
				unit: "Suite 800",
				city: "Toronto",
				postalCode: "M5H1J9",
			},
		},
	},
	{
		licenseId: "M09005678",
		brokerageName: "North Harbor Mortgage Group",
		organization: {
			workosId: "org_seed_north_harbor_mortgage_group",
			name: "North Harbor Mortgage Group",
			allowProfilesOutsideOrganization: true,
			externalId: "seed_north_harbor",
		},
		user: {
			authId: seedAuthIdFromEmail("david.singh+broker@northharbor.ca"),
			email: "david.singh+broker@northharbor.ca",
			firstName: "David",
			lastName: "Singh",
			phoneNumber: "+1-905-555-0137",
			address: {
				streetAddress: "456 Lakeshore Rd E",
				city: "Oakville",
				postalCode: "L6J1J2",
			},
		},
	},
];

export const seedBroker = adminMutation
	.input({})
	.handler(async (ctx) => {
		const brokerIds: Id<"brokers">[] = [];
		let createdBrokers = 0;
		let createdOrganizations = 0;
		let createdUsers = 0;
		let reusedBrokers = 0;
		let reusedOrganizations = 0;
		let reusedUsers = 0;

		for (let index = 0; index < BROKER_FIXTURES.length; index += 1) {
			const fixture = BROKER_FIXTURES[index];
			const { wasCreated: organizationCreated } = await ensureOrganization(
				ctx,
				fixture.organization
			);
			if (organizationCreated) {
				createdOrganizations += 1;
			} else {
				reusedOrganizations += 1;
			}

			const { userId, wasCreated: userCreated } = await ensureUserByEmail(
				ctx,
				fixture.user
			);
			if (userCreated) {
				createdUsers += 1;
			} else {
				reusedUsers += 1;
			}

			const existingBroker = await findBrokerByLicenseId(
				ctx,
				fixture.licenseId
			);
			if (existingBroker) {
				if (!existingBroker.orgId) {
					await ctx.db.patch(existingBroker._id, {
						orgId: fixture.organization.workosId,
					});
				}
				reusedBrokers += 1;
				brokerIds.push(existingBroker._id);
				continue;
			}

			const createdAt = seedTimestamp(index * 3_600_000);
			const onboardedAt = createdAt + 300_000;
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId,
				licenseId: fixture.licenseId,
				licenseProvince: "ON",
				brokerageName: fixture.brokerageName,
				orgId: fixture.organization.workosId,
				onboardedAt,
				createdAt,
			});

			await writeCreationJournalEntry(ctx, {
				entityType: "broker",
				entityId: brokerId,
				initialState: "active",
				source: SEED_SOURCE,
				timestamp: createdAt,
				organizationId: fixture.organization.workosId,
				payload: {
					licenseId: fixture.licenseId,
					userId,
					orgId: fixture.organization.workosId,
				},
			});

			createdBrokers += 1;
			brokerIds.push(brokerId);
		}

		return {
			brokerIds,
			created: {
				brokers: createdBrokers,
				users: createdUsers,
				organizations: createdOrganizations,
			},
			reused: {
				brokers: reusedBrokers,
				users: reusedUsers,
				organizations: reusedOrganizations,
			},
		};
	})
	.public();
