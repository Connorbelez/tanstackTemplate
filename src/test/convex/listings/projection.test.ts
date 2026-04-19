import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import { createTestConvex, ensureSeededIdentity } from "../../auth/helpers";
import { FAIRLEND_ADMIN } from "../../auth/identities";

async function seedMortgageBackedListingFixture(
	t: ReturnType<typeof createTestConvex>
) {
	await ensureSeededIdentity(t, FAIRLEND_ADMIN);

	return t.run(async (ctx) => {
		const now = Date.now();
		const adminUser = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", FAIRLEND_ADMIN.subject))
			.unique();
		if (!adminUser) {
			throw new Error("Admin user was not seeded");
		}

		const brokerUserId = await ctx.db.insert("users", {
			authId: "listing_projection_broker",
			email: "listing-projection-broker@test.fairlend.ca",
			firstName: "Projection",
			lastName: "Broker",
		});
		const brokerOfRecordId = await ctx.db.insert("brokers", {
			createdAt: now,
			lastTransitionAt: now,
			onboardedAt: now,
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId: brokerUserId,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: "listing_projection_borrower",
			email: "listing-projection-borrower@test.fairlend.ca",
			firstName: "Ada",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			createdAt: now,
			creationSource: "admin_direct",
			lastTransitionAt: now,
			onboardedAt: now,
			orgId: FAIRLEND_STAFF_ORG_ID,
			originatingWorkflowId: "case_listing_projection",
			originatingWorkflowType: "admin_origination_case",
			status: "active",
			userId: borrowerUserId,
			workflowSourceId: "case_listing_projection",
			workflowSourceKey: "admin_origination_case:borrower:case_listing_projection:primary",
			workflowSourceType: "admin_origination_case",
		});

		const propertyId = await ctx.db.insert("properties", {
			city: "Toronto",
			createdAt: now,
			latitude: 43.6532,
			longitude: -79.3832,
			postalCode: "M5H 1J9",
			propertyType: "residential",
			province: "ON",
			streetAddress: "123 King St W",
		});
		const mortgageId = await ctx.db.insert("mortgages", {
			amortizationMonths: 300,
			brokerOfRecordId,
			collectionExecutionMode: "app_owned",
			collectionExecutionUpdatedAt: now,
			createdAt: now,
			creationSource: "admin_direct",
			firstPaymentDate: "2026-06-01",
			interestAdjustmentDate: "2026-05-01",
			interestRate: 9.5,
			lienPosition: 1,
			loanType: "conventional",
			machineContext: { lastPaymentAt: 0, missedPayments: 0 },
			maturityDate: "2027-04-30",
			orgId: FAIRLEND_STAFF_ORG_ID,
			originationPath: "admin_direct",
			originatedByUserId: String(adminUser._id),
			originatingWorkflowId: "case_listing_projection",
			originatingWorkflowType: "admin_origination_case",
			paymentAmount: 2_450,
			paymentFrequency: "monthly",
			principal: 250_000,
			propertyId,
			rateType: "fixed",
			status: "active",
			termMonths: 12,
			termStartDate: "2026-05-01",
			workflowSourceId: "case_listing_projection",
			workflowSourceKey: "admin_origination_case:mortgage:case_listing_projection",
			workflowSourceType: "admin_origination_case",
		});
		await ctx.db.insert("mortgageBorrowers", {
			addedAt: now,
			borrowerId,
			mortgageId,
			role: "primary",
		});
		await ctx.db.insert("obligations", {
			amount: 2_450,
			amountSettled: 0,
			borrowerId,
			createdAt: now,
			dueDate: now + 86_400_000,
			gracePeriodEnd: now + 172_800_000,
			mortgageId,
			orgId: FAIRLEND_STAFF_ORG_ID,
			paymentNumber: 1,
			status: "scheduled",
			type: "regular_interest",
		});
		const valuationSnapshotId = await ctx.db.insert(
			"mortgageValuationSnapshots",
			{
				createdAt: now,
				createdByUserId: adminUser._id,
				mortgageId,
				source: "admin_origination",
				valueAsIs: 425_000,
				valuationDate: "2026-05-01",
			}
		);
		const storageId = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob(["listing projection test asset"]));
		const publicDocumentFileRef = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob(["listing public doc"]));
		const publicDocumentAssetId = await ctx.db.insert("documentAssets", {
			description: "Visible on listing detail",
			fileHash: `listing-public-${now}`,
			fileRef: publicDocumentFileRef,
			fileSize: 128,
			mimeType: "application/pdf",
			name: "Listing public summary",
			originalFilename: "listing-public-summary.pdf",
			pageCount: 1,
			source: "admin_upload",
			uploadedAt: now,
			uploadedByUserId: adminUser._id,
		});
		await ctx.db.insert("mortgageDocumentBlueprints", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId: publicDocumentAssetId,
			category: "public",
			class: "public_static",
			createdAt: now,
			createdByUserId: adminUser._id,
			description: "Projected public summary",
			displayName: "Listing public summary",
			displayOrder: 0,
			mortgageId,
			packageKey: "public",
			packageLabel: "Public docs",
			sourceDraftId: undefined,
			sourceKind: "asset",
			status: "active",
			templateId: undefined,
			templateSnapshotMeta: undefined,
			templateVersion: undefined,
		});
		const listingId = await ctx.db.insert("listings", {
			adminNotes: "Curated admin note",
			approximateLatitude: undefined,
			approximateLongitude: undefined,
			borrowerSignal: { stale: true },
			city: "Old Toronto",
			createdAt: now - 1_000,
			dataSource: "mortgage_pipeline",
			delistedAt: undefined,
			delistReason: undefined,
			description: "Curated description",
			displayOrder: 12,
			featured: true,
			heroImages: [{ storageId }],
			interestRate: 1.1,
			lastTransitionAt: undefined,
			latestAppraisalDate: "2020-01-01",
			latestAppraisalValueAsIs: 100_000,
			lienPosition: 99,
			loanType: "high_ratio",
			ltvRatio: 9,
			machineContext: undefined,
			marketplaceCopy: "Curated marketplace copy",
			maturityDate: "2030-01-01",
			monthlyPayment: 111,
			mortgageId,
			paymentFrequency: "weekly",
			paymentHistory: { stale: true },
			principal: 1,
			propertyId,
			propertyType: "commercial",
			province: "QC",
			publicDocumentIds: [storageId],
			publishedAt: undefined,
			rateType: "variable",
			seoSlug: "curated-listing-slug",
			status: "draft",
			termMonths: 1,
			title: "Curated listing title",
			updatedAt: now - 1_000,
			viewCount: 5,
		});

		return {
			adminUserId: adminUser._id,
			listingId,
			mortgageId,
			publicDocumentAssetId,
			publicDocumentFileRef,
			propertyId,
			storageId,
			valuationSnapshotId,
		};
	});
}

describe("listings/projection.refreshListingProjection", () => {
	it("preserves curated fields while overwriting projection-owned fields and stays idempotent", async () => {
		const t = createTestConvex();
		const fixture = await seedMortgageBackedListingFixture(t);

		const firstRefresh = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.listings.projection.refreshListingProjection,
			{
				listingId: fixture.listingId,
			}
		);

		const afterFirstRefresh = await t.run(async (ctx) => {
			const listing = await ctx.db.get(fixture.listingId);
			const listings = await ctx.db
				.query("listings")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", fixture.mortgageId)
				)
				.collect();
			return { listing, listings };
		});

		expect(firstRefresh.listingId).toBe(fixture.listingId);
		expect(afterFirstRefresh.listings).toHaveLength(1);
		expect(afterFirstRefresh.listing).toMatchObject({
			adminNotes: "Curated admin note",
			city: "Toronto",
			description: "Curated description",
			displayOrder: 12,
			featured: true,
			interestRate: 9.5,
			latestAppraisalDate: "2026-05-01",
			latestAppraisalValueAsIs: 425_000,
			lienPosition: 1,
			loanType: "conventional",
			marketplaceCopy: "Curated marketplace copy",
			maturityDate: "2027-04-30",
			monthlyPayment: 2_450,
			paymentFrequency: "monthly",
			principal: 250_000,
			propertyType: "residential",
			province: "ON",
			publicDocumentIds: [fixture.publicDocumentFileRef],
			rateType: "fixed",
			seoSlug: "curated-listing-slug",
			title: "Curated listing title",
		});
		expect(afterFirstRefresh.listing?.ltvRatio).toBeCloseTo(58.82, 2);
		expect(afterFirstRefresh.listing?.heroImages).toEqual([
			{ storageId: fixture.storageId },
		]);

		await t.run(async (ctx) => {
			await ctx.db.patch(fixture.mortgageId, {
				interestRate: 10.25,
				paymentAmount: 2_900,
				principal: 275_000,
			});
			await ctx.db.patch(fixture.propertyId, {
				city: "Mississauga",
				province: "ON",
				streetAddress: "500 Lakeshore Blvd",
			});
			await ctx.db.insert("mortgageValuationSnapshots", {
				createdAt: Date.now() + 1_000,
				createdByUserId: fixture.adminUserId,
				mortgageId: fixture.mortgageId,
				source: "appraisal_import",
				valueAsIs: 500_000,
				valuationDate: "2026-06-01",
			});
		});

		const secondRefresh = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.listings.projection.refreshListingProjection,
			{
				listingId: fixture.listingId,
			}
		);

		const afterSecondRefresh = await t.run(async (ctx) => {
			const listing = await ctx.db.get(fixture.listingId);
			const listings = await ctx.db
				.query("listings")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", fixture.mortgageId)
				)
				.collect();
			return { listing, listings };
		});

		expect(secondRefresh.listingId).toBe(fixture.listingId);
		expect(afterSecondRefresh.listings).toHaveLength(1);
		expect(afterSecondRefresh.listing).toMatchObject({
			adminNotes: "Curated admin note",
			city: "Mississauga",
			description: "Curated description",
			featured: true,
			interestRate: 10.25,
			latestAppraisalDate: "2026-06-01",
			latestAppraisalValueAsIs: 500_000,
			monthlyPayment: 2_900,
			principal: 275_000,
			seoSlug: "curated-listing-slug",
			title: "Curated listing title",
		});
		expect(afterSecondRefresh.listing?.ltvRatio).toBe(55);
	});
});
