import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import { createTestConvex, ensureSeededIdentity } from "../../auth/helpers";
import { FAIRLEND_ADMIN } from "../../auth/identities";

async function seedMortgageBlueprintFixture(
	t: ReturnType<typeof createTestConvex>
) {
	await ensureSeededIdentity(t, FAIRLEND_ADMIN);

	return t.run(async (ctx) => {
		const adminUser = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", FAIRLEND_ADMIN.subject))
			.unique();
		if (!adminUser) {
			throw new Error("Admin user not found");
		}

		const brokerUserId = await ctx.db.insert("users", {
			authId: "mortgage_blueprint_broker",
			email: "mortgage-blueprint-broker@test.fairlend.ca",
			firstName: "Morgan",
			lastName: "Broker",
		});
		const brokerOfRecordId = await ctx.db.insert("brokers", {
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
			onboardedAt: Date.now(),
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId: brokerUserId,
		});
		const propertyId = await ctx.db.insert("properties", {
			city: "Toronto",
			createdAt: Date.now(),
			postalCode: "M5H 1J9",
			propertyType: "residential",
			province: "ON",
			streetAddress: "123 King St W",
		});
		const mortgageId = await ctx.db.insert("mortgages", {
			amortizationMonths: 300,
			brokerOfRecordId,
			collectionExecutionMode: "app_owned",
			collectionExecutionUpdatedAt: Date.now(),
			createdAt: Date.now(),
			firstPaymentDate: "2026-06-01",
			interestAdjustmentDate: "2026-05-01",
			interestRate: 9.5,
			lienPosition: 1,
			loanType: "conventional",
			machineContext: { lastPaymentAt: 0, missedPayments: 0 },
			maturityDate: "2027-04-30",
			orgId: FAIRLEND_STAFF_ORG_ID,
			paymentAmount: 2_450,
			paymentFrequency: "monthly",
			principal: 250_000,
			propertyId,
			rateType: "fixed",
			status: "active",
			termMonths: 12,
			termStartDate: "2026-05-01",
		});
		const assetId = await ctx.db.insert("documentAssets", {
			description: "Mortgage public doc",
			fileHash: `mortgage-blueprint-${Date.now()}`,
			fileRef: await (
				ctx.storage as unknown as {
					store: (blob: Blob) => Promise<Id<"_storage">>;
				}
			).store(new Blob(["mortgage blueprint public doc"])),
			fileSize: 120,
			mimeType: "application/pdf",
			name: "Mortgage summary",
			originalFilename: "mortgage-summary.pdf",
			pageCount: 1,
			source: "admin_upload",
			uploadedAt: Date.now(),
			uploadedByUserId: adminUser._id,
		});
		const heroStorageId = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob(["listing hero image"]));
		const blueprintId = await ctx.db.insert("mortgageDocumentBlueprints", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId,
			category: "public",
			class: "public_static",
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			description: "Shown on listing detail",
			displayName: "Mortgage summary",
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
			adminNotes: undefined,
			approximateLatitude: undefined,
			approximateLongitude: undefined,
			borrowerSignal: { stale: true },
			city: "Toronto",
			createdAt: Date.now(),
			dataSource: "mortgage_pipeline",
			delistedAt: undefined,
			delistReason: undefined,
			description: "Projected mortgage listing",
			displayOrder: 0,
			featured: false,
			heroImages: [{ storageId: heroStorageId }],
			interestRate: 9.5,
			lastTransitionAt: undefined,
			latestAppraisalDate: "2026-05-01",
			latestAppraisalValueAsIs: 425_000,
			lienPosition: 1,
			loanType: "conventional",
			ltvRatio: 58,
			machineContext: undefined,
			marketplaceCopy: undefined,
			maturityDate: "2027-04-30",
			monthlyPayment: 2_450,
			mortgageId,
			paymentFrequency: "monthly",
			paymentHistory: { stale: true },
			principal: 250_000,
			propertyId,
			propertyType: "residential",
			province: "ON",
			publicDocumentIds: [(await ctx.db.get(assetId))?.fileRef ?? heroStorageId],
			publishedAt: undefined,
			rateType: "fixed",
			seoSlug: "mortgage-summary",
			status: "draft",
			termMonths: 12,
			title: "Mortgage summary listing",
			updatedAt: Date.now(),
			viewCount: 0,
		});

		return { blueprintId, listingId, mortgageId };
	});
}

describe("documents/mortgageBlueprints", () => {
	it("lists active mortgage blueprints and archives them", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedMortgageBlueprintFixture(t);

		const before = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.mortgageBlueprints.listForMortgage,
			{ mortgageId: fixture.mortgageId }
		);
		expect(before).toHaveLength(1);
		expect(before[0]).toMatchObject({
			class: "public_static",
			displayName: "Mortgage summary",
			status: "active",
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.documents.mortgageBlueprints.archiveBlueprint,
			{ blueprintId: fixture.blueprintId }
		);
		const activeAfter = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.mortgageBlueprints.listForMortgage,
			{ mortgageId: fixture.mortgageId }
		);
		const allAfter = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.mortgageBlueprints.listForMortgage,
			{ includeArchived: true, mortgageId: fixture.mortgageId }
		);
		const listingAfter = await t.run((ctx) => ctx.db.get(fixture.listingId));

		expect(result.archived).toBe(true);
		expect(activeAfter).toHaveLength(0);
		expect(allAfter[0]).toMatchObject({
			blueprintId: fixture.blueprintId,
			status: "archived",
		});
		expect(listingAfter?.publicDocumentIds).toEqual([]);
	});

	it("replaces a public static blueprint and refreshes listing public docs", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedMortgageBlueprintFixture(t);
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);

		const replacementAssetId = await t.run(async (ctx) => {
			const adminUser = await ctx.db
				.query("users")
				.withIndex("authId", (query) => query.eq("authId", FAIRLEND_ADMIN.subject))
				.unique();
			if (!adminUser) {
				throw new Error("Admin user not found");
			}

			const fileRef = await (
				ctx.storage as unknown as {
					store: (blob: Blob) => Promise<Id<"_storage">>;
				}
			).store(new Blob(["replacement public doc"]));

			return ctx.db.insert("documentAssets", {
				description: "Replacement public doc",
				fileHash: `replacement-${Date.now()}`,
				fileRef,
				fileSize: 128,
				mimeType: "application/pdf",
				name: "Replacement Summary",
				originalFilename: "replacement-summary.pdf",
				pageCount: 1,
				source: "admin_upload",
				uploadedAt: Date.now(),
				uploadedByUserId: adminUser._id,
			});
		});

		const replaced = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.documents.mortgageBlueprints.replaceStaticBlueprint,
			{
				assetId: replacementAssetId,
				blueprintId: fixture.blueprintId,
				description: "Replacement listing document",
				displayName: "Replacement Summary",
			}
		);
		const activeAfter = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.mortgageBlueprints.listForMortgage,
			{ mortgageId: fixture.mortgageId }
		);
		const allAfter = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.mortgageBlueprints.listForMortgage,
			{ includeArchived: true, mortgageId: fixture.mortgageId }
		);
		const listingAfter = await t.run((ctx) => ctx.db.get(fixture.listingId));
		const replacementAsset = await t.run((ctx) => ctx.db.get(replacementAssetId));

		expect(replaced.displayName).toBe("Replacement Summary");
		expect(activeAfter).toHaveLength(1);
		expect(activeAfter[0]).toMatchObject({
			blueprintId: replaced.blueprintId,
			displayName: "Replacement Summary",
			status: "active",
		});
		expect(
			allAfter.some(
				(blueprint) =>
					blueprint.blueprintId === fixture.blueprintId &&
					blueprint.status === "archived"
			)
		).toBe(true);
		expect(listingAfter?.publicDocumentIds).toEqual([
			replacementAsset?.fileRef ?? null,
		]);
	});
});
