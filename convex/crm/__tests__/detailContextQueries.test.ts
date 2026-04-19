import { describe, expect, it } from "vitest";
import {
	createMockViewer,
	createTestConvex,
} from "../../../src/test/auth/helpers";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestHarness = ReturnType<typeof createTestConvex>;

async function seedListingDetailFixture(
	t: TestHarness,
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
	it("returns compatibility public document refs for org-owned listings", async () => {
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
		expect(result.publicDocuments).toEqual(
			fixture.publicDocumentIds.map((fileRef) => ({
				assetId: null,
				fileRef,
				name: null,
			}))
		);
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
