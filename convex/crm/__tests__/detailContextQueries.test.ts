import { beforeEach, describe, expect, it } from "vitest";
import {
	createMockViewer,
	createTestConvex,
} from "../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN } from "../../../src/test/auth/identities";
import {
	type CrmTestHarness,
	createCrmTestHarness,
} from "../../../src/test/convex/crm/helpers";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type ListingHarness = ReturnType<typeof createTestConvex>;

async function seedListingDetailFixture(
	t: ListingHarness,
	options?: {
		includeMortgage?: boolean;
		mortgageOrgId?: string;
		publicDocumentCount?: number;
	}
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const brokerUserId = await ctx.db.insert("users", {
			authId: `crm_detail_broker_${now}`,
			email: `crm-detail-broker-${now}@fairlend.test`,
			firstName: "CRM",
			lastName: "Broker",
		});
		const brokerOfRecordId = await ctx.db.insert("brokers", {
			createdAt: now,
			lastTransitionAt: now,
			orgId: options?.mortgageOrgId,
			status: "active",
			userId: brokerUserId,
		});
		const propertyId = await ctx.db.insert("properties", {
			city: "Toronto",
			createdAt: now,
			postalCode: "M5H 1J9",
			propertyType: "residential",
			province: "ON",
			streetAddress: "123 King St W",
		});
		const publicDocumentIds = await Promise.all(
			Array.from({ length: options?.publicDocumentCount ?? 0 }, (_, index) =>
				(
					ctx.storage as unknown as {
						store: (blob: Blob) => Promise<Id<"_storage">>;
					}
				).store(new Blob([`listing detail public document ${index}`]))
			)
		);
		const mortgageId =
			options?.includeMortgage === false
				? undefined
				: await ctx.db.insert("mortgages", {
						amortizationMonths: 300,
						brokerOfRecordId,
						collectionExecutionMode: "app_owned",
						collectionExecutionUpdatedAt: now,
						createdAt: now,
						firstPaymentDate: "2026-06-01",
						interestAdjustmentDate: "2026-05-01",
						interestRate: 9.5,
						lienPosition: 1,
						loanType: "conventional",
						machineContext: { lastPaymentAt: 0, missedPayments: 0 },
						maturityDate: "2027-04-30",
						orgId: options?.mortgageOrgId,
						paymentAmount: 2450,
						paymentFrequency: "monthly",
						principal: 250_000,
						propertyId,
						rateType: "fixed",
						status: "active",
						termMonths: 12,
						termStartDate: "2026-05-01",
					});
		const listingId = await ctx.db.insert("listings", {
			adminNotes: "Curated admin note",
			approximateLatitude: 43.6532,
			approximateLongitude: -79.3832,
			borrowerSignal: undefined,
			city: "Toronto",
			createdAt: now,
			dataSource: "mortgage_pipeline",
			delistedAt: undefined,
			delistReason: undefined,
			description: "Curated description",
			displayOrder: undefined,
			featured: false,
			heroImages: [],
			interestRate: 9.5,
			lastTransitionAt: now,
			latestAppraisalDate: undefined,
			latestAppraisalValueAsIs: undefined,
			lienPosition: 1,
			loanType: "conventional",
			ltvRatio: 0.65,
			machineContext: undefined,
			marketplaceCopy: undefined,
			maturityDate: "2027-04-30",
			monthlyPayment: 2450,
			mortgageId,
			paymentFrequency: "monthly",
			paymentHistory: undefined,
			principal: 250_000,
			propertyId,
			propertyType: "residential",
			province: "ON",
			publicDocumentIds,
			publishedAt: undefined,
			rateType: "fixed",
			seoSlug: undefined,
			status: "draft",
			termMonths: 12,
			title: "CRM detail listing",
			updatedAt: now,
			viewCount: 0,
		});

		return { listingId, publicDocumentIds };
	});
}

describe("crm/detailContextQueries.getListingDetailContext", () => {
	it("returns mortgage-backed listings and uses blueprint-derived public documents", async () => {
		const viewerOrgId = "org_crm_detail_access";
		const viewer = createMockViewer({
			orgId: viewerOrgId,
			orgName: "CRM Detail Org",
			roles: ["admin"],
			subject: "user_crm_detail_admin",
		});
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedListingDetailFixture(t, {
			includeMortgage: true,
			mortgageOrgId: viewerOrgId,
			publicDocumentCount: 2,
		});

		const result = await t
			.withIdentity(viewer)
			.query(api.crm.detailContextQueries.getListingDetailContext, {
				listingId: fixture.listingId,
			});

		expect(result.mortgage).not.toBeNull();
		expect(result.listing.publicDocumentIds).toEqual(fixture.publicDocumentIds);
		expect(result.publicDocuments).toEqual([]);
	});

	it("rejects listings without a mortgage-backed org boundary", async () => {
		const viewerOrgId = "org_crm_detail_access";
		const viewer = createMockViewer({
			orgId: viewerOrgId,
			orgName: "CRM Detail Org",
			roles: ["admin"],
			subject: "user_crm_detail_boundary_admin",
		});
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixtureWithoutMortgage = await seedListingDetailFixture(t, {
			includeMortgage: false,
			publicDocumentCount: 1,
		});
		const fixtureWithoutMortgageOrg = await seedListingDetailFixture(t, {
			includeMortgage: true,
			publicDocumentCount: 1,
		});

		await expect(
			t
				.withIdentity(viewer)
				.query(api.crm.detailContextQueries.getListingDetailContext, {
					listingId: fixtureWithoutMortgage.listingId,
				})
		).rejects.toThrow("Listing not found or access denied");
		await expect(
			t
				.withIdentity(viewer)
				.query(api.crm.detailContextQueries.getListingDetailContext, {
					listingId: fixtureWithoutMortgageOrg.listingId,
				})
		).rejects.toThrow("Listing not found or access denied");
	});
});

describe("detailContextQueries", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	async function seedConnectedPortfolio(orgId: string) {
		return t.run(async (ctx) => {
			const brokerUserId = await ctx.db.insert("users", {
				authId: "detail-context-broker-connected",
				email: "broker.connected@test.ca",
				firstName: "Taylor",
				lastName: "Broker",
			});
			const borrowerUserId = await ctx.db.insert("users", {
				authId: "detail-context-borrower-connected",
				email: "borrower.connected@test.ca",
				firstName: "Jordan",
				lastName: "Borrower",
			});
			const lenderUserId = await ctx.db.insert("users", {
				authId: "detail-context-lender-connected",
				email: "lender.connected@test.ca",
				firstName: "Lena",
				lastName: "Lender",
			});
			const brokerId = await ctx.db.insert("brokers", {
				brokerageName: "Northline Capital",
				createdAt: Date.now(),
				licenseId: "LIC-042",
				orgId,
				status: "active",
				userId: brokerUserId,
			});
			const borrowerId = await ctx.db.insert("borrowers", {
				createdAt: Date.now(),
				idvStatus: "verified",
				onboardedAt: Date.now(),
				orgId,
				status: "active",
				userId: borrowerUserId,
			});
			const lenderId = await ctx.db.insert("lenders", {
				accreditationStatus: "accredited",
				activatedAt: Date.now(),
				brokerId,
				createdAt: Date.now(),
				onboardingEntryPath: "/invite",
				orgId,
				payoutFrequency: "monthly",
				status: "active",
				userId: lenderUserId,
			});
			const propertyId = await ctx.db.insert("properties", {
				city: "Toronto",
				createdAt: Date.now(),
				postalCode: "M5V1A1",
				propertyType: "residential",
				province: "ON",
				streetAddress: "123 Connected Street",
			});
			const mortgageId = await ctx.db.insert("mortgages", {
				amortizationMonths: 300,
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
				firstPaymentDate: "2026-08-01",
				interestAdjustmentDate: "2026-07-01",
				interestRate: 5.25,
				lienPosition: 1,
				loanType: "conventional",
				maturityDate: "2031-07-01",
				orgId,
				paymentAmount: 2875,
				paymentFrequency: "monthly",
				principal: 465_000,
				propertyId,
				rateType: "fixed",
				status: "active",
				termMonths: 60,
				termStartDate: "2026-07-01",
			});
			await ctx.db.insert("mortgageBorrowers", {
				addedAt: Date.now(),
				borrowerId,
				mortgageId,
				role: "primary",
			});
			const dealId = await ctx.db.insert("deals", {
				buyerId: "detail-context-lender-connected",
				createdAt: Date.now(),
				createdBy: "user_admin",
				fractionalShare: 2500,
				lenderId,
				mortgageId,
				orgId,
				sellerId: "seller.connected@test.ca",
				status: "active",
			});

			return {
				borrowerId,
				brokerId,
				dealId,
				lenderId,
				mortgageId,
			};
		});
	}

	it("allows FairLend admins to load mortgage detail context across orgs", async () => {
		const externalOrgId = "org_detail_context_external";

		const mortgageId = await t.run(async (ctx) => {
			const brokerUserId = await ctx.db.insert("users", {
				authId: "detail-context-broker",
				email: "detail-context-broker@test.ca",
				firstName: "Taylor",
				lastName: "Broker",
			});
			const borrowerUserId = await ctx.db.insert("users", {
				authId: "detail-context-borrower",
				email: "detail-context-borrower@test.ca",
				firstName: "Jordan",
				lastName: "Borrower",
			});
			const brokerId = await ctx.db.insert("brokers", {
				createdAt: Date.now(),
				orgId: externalOrgId,
				status: "active",
				userId: brokerUserId,
			});
			const borrowerId = await ctx.db.insert("borrowers", {
				createdAt: Date.now(),
				idvStatus: "verified",
				orgId: externalOrgId,
				status: "active",
				userId: borrowerUserId,
			});
			const propertyId = await ctx.db.insert("properties", {
				city: "Toronto",
				createdAt: Date.now(),
				postalCode: "M5V1A1",
				propertyType: "residential",
				province: "ON",
				streetAddress: "789 Context Street",
			});
			const mortgageId = await ctx.db.insert("mortgages", {
				amortizationMonths: 300,
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
				firstPaymentDate: "2026-08-01",
				interestAdjustmentDate: "2026-07-01",
				interestRate: 4.95,
				lienPosition: 1,
				loanType: "conventional",
				maturityDate: "2031-07-01",
				orgId: externalOrgId,
				paymentAmount: 2875,
				paymentFrequency: "monthly",
				principal: 465_000,
				propertyId,
				rateType: "fixed",
				status: "active",
				termMonths: 60,
				termStartDate: "2026-07-01",
			});

			await ctx.db.insert("mortgageBorrowers", {
				addedAt: Date.now(),
				borrowerId,
				mortgageId,
				role: "primary",
			});

			return mortgageId;
		});

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.crm.detailContextQueries.getMortgageDetailContext, {
				mortgageId,
			});

		expect(result.property).toMatchObject({
			city: "Toronto",
			streetAddress: "789 Context Street",
		});
		expect(result.borrowers).toEqual([
			expect.objectContaining({
				name: "Jordan Borrower",
				role: "primary",
				status: "active",
			}),
		]);
		expect(result.paymentSetup.obligations).toEqual([]);
		expect(result.paymentSetup.collectionPlanEntries).toEqual([]);
	});

	it("loads borrower connected brokers and deals", async () => {
		const ids = await seedConnectedPortfolio("org_detail_context_borrower");

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.crm.detailContextQueries.getBorrowerDetailContext, {
				borrowerId: ids.borrowerId,
			});

		expect(result.profile.name).toBe("Jordan Borrower");
		expect(result.mortgages).toEqual([
			expect.objectContaining({
				broker: expect.objectContaining({
					brokerId: ids.brokerId,
					brokerageName: "Northline Capital",
				}),
				mortgageId: ids.mortgageId,
			}),
		]);
		expect(result.brokers).toEqual([
			expect.objectContaining({
				brokerId: ids.brokerId,
				mortgageCount: 1,
			}),
		]);
		expect(result.deals).toEqual([
			expect.objectContaining({
				dealId: ids.dealId,
				lender: expect.objectContaining({
					lenderId: ids.lenderId,
					name: "Lena Lender",
				}),
			}),
		]);
	});

	it("loads lender connected broker, deals, and mortgages", async () => {
		const ids = await seedConnectedPortfolio("org_detail_context_lender");

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.crm.detailContextQueries.getLenderDetailContext, {
				lenderId: ids.lenderId,
			});

		expect(result.profile.name).toBe("Lena Lender");
		expect(result.broker).toMatchObject({
			brokerId: ids.brokerId,
			brokerageName: "Northline Capital",
		});
		expect(result.deals).toEqual([
			expect.objectContaining({
				dealId: ids.dealId,
				mortgage: expect.objectContaining({
					mortgageId: ids.mortgageId,
					property: expect.objectContaining({
						streetAddress: "123 Connected Street",
					}),
				}),
			}),
		]);
		expect(result.mortgages).toEqual([
			expect.objectContaining({
				mortgageId: ids.mortgageId,
			}),
		]);
	});

	it("loads broker connected lenders, mortgages, borrowers, and deals", async () => {
		const ids = await seedConnectedPortfolio("org_detail_context_broker");

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.crm.detailContextQueries.getBrokerDetailContext, {
				brokerId: ids.brokerId,
			});

		expect(result.profile.name).toBe("Taylor Broker");
		expect(result.lenders).toEqual([
			expect.objectContaining({
				lenderId: ids.lenderId,
				name: "Lena Lender",
			}),
		]);
		expect(result.mortgages).toEqual([
			expect.objectContaining({
				mortgageId: ids.mortgageId,
				relationshipRoles: ["broker_of_record"],
			}),
		]);
		expect(result.borrowers).toEqual([
			expect.objectContaining({
				borrowerId: ids.borrowerId,
				mortgageCount: 1,
			}),
		]);
		expect(result.deals).toEqual([
			expect.objectContaining({
				dealId: ids.dealId,
				lender: expect.objectContaining({
					lenderId: ids.lenderId,
				}),
			}),
		]);
	});
});
