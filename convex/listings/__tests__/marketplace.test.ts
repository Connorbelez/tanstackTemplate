import { anyApi } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";
import { deriveMarketplacePropertyType } from "../marketplaceShared";

const modules = convexModules;
const listingApi = anyApi.listings.marketplace;
const publicDocumentsApi = anyApi.listings.publicDocuments;

function createHarness() {
	return convexTest(schema, modules);
}

function listingViewer(t: ReturnType<typeof createHarness>) {
	return t.withIdentity({
		subject: "listing-viewer",
		issuer: "https://api.workos.com",
		org_id: "org_listing_viewer",
		role: "lender",
		roles: JSON.stringify(["lender"]),
		permissions: JSON.stringify(["listing:view"]),
		user_email: "listing-viewer@fairlend.ca",
		user_first_name: "Listing",
		user_last_name: "Viewer",
	});
}

async function insertMortgageFixture(t: ReturnType<typeof createHarness>) {
	return await t.run(async (ctx) => {
		const timestamp = Date.now();
		const userId = await ctx.db.insert("users", {
			authId: `marketplace_broker_${timestamp}`,
			email: `marketplace-broker-${timestamp}@test.fairlend.ca`,
			firstName: "Marketplace",
			lastName: "Broker",
		});

		const brokerId = await ctx.db.insert("brokers", {
			createdAt: Date.now(),
			lastTransitionAt: undefined,
			status: "active",
			userId,
		});

		const propertyId = await ctx.db.insert("properties", {
			city: "Toronto",
			createdAt: Date.now(),
			propertyType: "residential",
			province: "ON",
			postalCode: "M5V1E3",
			streetAddress: "123 King St W",
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			amortizationMonths: 240,
			assignedBrokerId: undefined,
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
			firstPaymentDate: "2026-02-01",
			fundedAt: undefined,
			interestAdjustmentDate: "2026-01-01",
			interestRate: 8.5,
			isRenewal: undefined,
			lastTransitionAt: undefined,
			lienPosition: 1,
			loanType: "conventional",
			machineContext: undefined,
			maturityDate: "2027-01-01",
			orgId: undefined,
			paymentAmount: 1200,
			paymentFrequency: "monthly",
			principal: 250_000,
			priorMortgageId: undefined,
			propertyId,
			rateType: "fixed",
			simulationId: undefined,
			status: "active",
			termMonths: 12,
			termStartDate: "2026-01-01",
		});

		return { mortgageId, propertyId };
	});
}

function buildListingDoc(
	overrides: Partial<Omit<Doc<"listings">, "_creationTime" | "_id">> = {}
): Omit<Doc<"listings">, "_creationTime" | "_id"> {
	const propertyType = overrides.propertyType ?? "residential";
	const marketplacePropertyType =
		overrides.marketplacePropertyType ??
		deriveMarketplacePropertyType(propertyType);

	return {
		adminNotes: undefined,
		approximateLatitude: 43.6532,
		approximateLongitude: -79.3832,
		borrowerSignal: undefined,
		city: "Toronto",
		createdAt: 1_710_000_000_000,
		dataSource: "mortgage_pipeline",
		delistReason: undefined,
		delistedAt: undefined,
		description: "Listing description",
		displayOrder: undefined,
		featured: false,
		heroImages: [],
		interestRate: 8.5,
		lastTransitionAt: undefined,
		lienPosition: 1,
		loanType: "conventional",
		ltvRatio: 0.65,
		machineContext: undefined,
		marketplaceCopy: "Marketplace copy",
		maturityDate: "2027-01-01",
		monthlyPayment: 1250,
		mortgageId: undefined,
		paymentFrequency: "monthly",
		paymentHistory: undefined,
		principal: 250_000,
		propertyId: undefined,
		propertyType,
		marketplacePropertyType,
		province: "ON",
		publicDocumentIds: [],
		publishedAt: 1_710_000_000_000,
		rateType: "fixed",
		seoSlug: undefined,
		status: "published",
		termMonths: 12,
		title: "Toronto Income Property",
		updatedAt: 1_710_000_000_000,
		viewCount: 10,
		...overrides,
	};
}

describe("marketplace listings", () => {
	it("requires listing:view for marketplace reads", async () => {
		const t = createHarness();
		const viewerWithoutListingView = t.withIdentity({
			subject: "member-user",
			issuer: "https://api.workos.com",
			org_id: "org_member",
			role: "member",
			roles: JSON.stringify(["member"]),
			permissions: JSON.stringify([]),
			user_email: "member@fairlend.ca",
			user_first_name: "Member",
			user_last_name: "Viewer",
		});

		await expect(
			viewerWithoutListingView.query(listingApi.listMarketplaceListings, {
				cursor: null,
				numItems: 20,
			})
		).rejects.toThrow('permission "listing:view" required');
	});

	it("filters by the stored marketplace property type", async () => {
		const t = createHarness();
		const auth = listingViewer(t);

		await t.run(async (ctx) => {
			await ctx.db.insert(
				"listings",
				buildListingDoc({
					propertyType: "multi_unit",
					title: "Duplex Listing",
				})
			);
		});

		const result = await auth.query(listingApi.listMarketplaceListings, {
			cursor: null,
			filters: {
				propertyTypes: ["Duplex"],
			},
			numItems: 20,
		});

		expect(result.page).toHaveLength(1);
		expect(result.page[0]?.propertyTypeLabel).toBe("Duplex");
	});

	it("searches, filters by mortgage type, and keeps featured rows first", async () => {
		const t = createHarness();
		const auth = listingViewer(t);

		await t.run(async (ctx) => {
			await ctx.db.insert(
				"listings",
				buildListingDoc({
					city: "Toronto",
					displayOrder: 1,
					featured: true,
					lienPosition: 1,
					propertyType: "multi_unit",
					title: "Featured Toronto First",
				})
			);
			await ctx.db.insert(
				"listings",
				buildListingDoc({
					city: "Toronto",
					displayOrder: 99,
					featured: false,
					lienPosition: 2,
					propertyType: "multi_unit",
					title: "Standard Toronto Second",
				})
			);
		});

		const result = await auth.query(listingApi.listMarketplaceListings, {
			cursor: null,
			filters: {
				mortgageTypes: ["First", "Second"],
				propertyTypes: ["Duplex"],
				searchQuery: "Toronto",
			},
			numItems: 20,
		});

		expect(result.page.map((listing) => listing.title)).toEqual([
			"Featured Toronto First",
			"Standard Toronto Second",
		]);
		expect(result.page[0]?.mortgageTypeLabel).toBe("First");
		expect(result.page[1]?.mortgageTypeLabel).toBe("Second");
	});

	it("paginates marketplace listings with a stable cursor", async () => {
		const t = createHarness();
		const auth = listingViewer(t);

		await t.run(async (ctx) => {
			await ctx.db.insert(
				"listings",
				buildListingDoc({
					displayOrder: 1,
					featured: true,
					title: "First Listing",
				})
			);
			await ctx.db.insert(
				"listings",
				buildListingDoc({
					displayOrder: 2,
					featured: false,
					title: "Second Listing",
				})
			);
			await ctx.db.insert(
				"listings",
				buildListingDoc({
					displayOrder: 3,
					featured: false,
					title: "Third Listing",
				})
			);
		});

		const firstPage = await auth.query(listingApi.listMarketplaceListings, {
			cursor: null,
			numItems: 2,
		});
		const secondPage = await auth.query(listingApi.listMarketplaceListings, {
			cursor: firstPage.continueCursor,
			numItems: 2,
		});

		expect(firstPage.page.map((listing) => listing.title)).toEqual([
			"First Listing",
			"Second Listing",
		]);
		expect(firstPage.isDone).toBe(false);
		expect(secondPage.page.map((listing) => listing.title)).toEqual([
			"Third Listing",
		]);
		expect(secondPage.isDone).toBe(true);
	});

	it("does not expose public documents for unpublished listings", async () => {
		const t = createHarness();
		const auth = listingViewer(t);

		let listingId!: Doc<"listings">["_id"];
		await t.run(async (ctx) => {
			listingId = await ctx.db.insert(
				"listings",
				buildListingDoc({
					status: "draft",
				})
			);
		});

		await expect(
			auth.query(publicDocumentsApi.listForListing, {
				listingId,
			})
		).rejects.toThrow("Listing not found");
	});

	it("returns a read-only marketplace detail payload", async () => {
		const t = createHarness();
		const auth = listingViewer(t);
		const { mortgageId, propertyId } = await insertMortgageFixture(t);

		let listingId!: Doc<"listings">["_id"];
		await t.run(async (ctx) => {
			listingId = await ctx.db.insert(
				"listings",
				buildListingDoc({
					description: "Projected lender-facing mortgage listing.",
					marketplaceCopy: "Well-located first mortgage opportunity.",
					mortgageId,
					propertyId,
					title: "King West Bridge Opportunity",
				})
			);
		});

		const result = await auth.query(listingApi.getMarketplaceListingDetail, {
			listingId,
		});

		expect(result?.listing.id).toBe(String(listingId));
		expect(result?.listing.readOnly).toBe(true);
		expect(result?.documents).toBeDefined();
		expect(result?.investment.availableFractions).toBeTypeOf("number");
	});

	it("returns null for unpublished marketplace detail", async () => {
		const t = createHarness();
		const auth = listingViewer(t);

		let listingId!: Doc<"listings">["_id"];
		await t.run(async (ctx) => {
			listingId = await ctx.db.insert(
				"listings",
				buildListingDoc({
					status: "draft",
					title: "Draft Listing",
				})
			);
		});

		const result = await auth.query(listingApi.getMarketplaceListingDetail, {
			listingId,
		});

		expect(result).toBeNull();
	});
});
