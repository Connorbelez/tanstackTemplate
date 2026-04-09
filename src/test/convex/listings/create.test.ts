import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ListingCreateInput } from "../../../../convex/listings/validators";
import schema from "../../../../convex/schema";
import { registerAuditLogComponent } from "../../../../convex/test/registerAuditLogComponent";
import { BROKER, FAIRLEND_ADMIN } from "../../auth/identities";

const modules = {
	...import.meta.glob("../../../../convex/_generated/**/*.*s"),
	...import.meta.glob("../../../../convex/audit/**/*.*s"),
	...import.meta.glob("../../../../convex/auth/**/*.*s"),
	...import.meta.glob("../../../../convex/listings/**/*.*s"),
	...import.meta.glob("../../../../convex/auditLog.ts"),
	...import.meta.glob("../../../../convex/constants.ts"),
	...import.meta.glob("../../../../convex/fluent.ts"),
};

function createHarness() {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	return t;
}

function buildListingInput(
	overrides: Partial<ListingCreateInput> = {}
): ListingCreateInput {
	return {
		mortgageId: undefined,
		propertyId: undefined,
		dataSource: "mortgage_pipeline",
		principal: 100_000,
		interestRate: 9.5,
		ltvRatio: 0.65,
		termMonths: 12,
		maturityDate: "2027-01-01",
		monthlyPayment: 900,
		rateType: "fixed",
		paymentFrequency: "monthly",
		loanType: "conventional",
		lienPosition: 1,
		propertyType: "residential",
		city: "Toronto",
		province: "ON",
		approximateLatitude: undefined,
		approximateLongitude: undefined,
		latestAppraisalValueAsIs: undefined,
		latestAppraisalDate: undefined,
		borrowerSignal: undefined,
		paymentHistory: undefined,
		title: "Demo listing",
		description: "Description",
		marketplaceCopy: undefined,
		heroImages: [],
		featured: false,
		displayOrder: undefined,
		adminNotes: undefined,
		publicDocumentIds: [],
		seoSlug: undefined,
		...overrides,
	};
}

async function seedMortgage(t: ReturnType<typeof createHarness>) {
	const now = Date.now();

	return await t.run(async (ctx) => {
		const brokerUserId = await ctx.db.insert("users", {
			authId: "seed_broker_auth_id",
			email: "seed-broker@fairlend.ca",
			firstName: "Seed",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			lastTransitionAt: undefined,
			userId: brokerUserId,
			licenseId: undefined,
			licenseProvince: undefined,
			brokerageName: "Seed Brokerage",
			orgId: "org_seed_brokerage",
			onboardedAt: now,
			createdAt: now,
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 King St W",
			unit: undefined,
			city: "Toronto",
			province: "ON",
			postalCode: "M5H 1J9",
			googlePlaceData: undefined,
			latitude: undefined,
			longitude: undefined,
			legalDescription: undefined,
			pin: undefined,
			lroNumber: undefined,
			propertyType: "residential",
			createdAt: now,
		});

		return await ctx.db.insert("mortgages", {
			orgId: "org_seed_brokerage",
			status: "active",
			machineContext: undefined,
			lastTransitionAt: undefined,
			propertyId,
			principal: 100_000,
			interestRate: 9.5,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 300,
			paymentAmount: 900,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: undefined,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2027-01-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			assignedBrokerId: undefined,
			priorMortgageId: undefined,
			isRenewal: undefined,
			simulationId: undefined,
			fundedAt: undefined,
			createdAt: now,
		});
	});
}

describe("listings/create.create", () => {
	it("creates a draft listing behind the fluent admin + permission chain", async () => {
		const t = createHarness();
		const mortgageId = await seedMortgage(t);

		const listingId = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.listings.create.create, buildListingInput({ mortgageId }));

		const created = await t.run(async (ctx) => await ctx.db.get(listingId));
		expect(created).toBeTruthy();
		expect(created?.status).toBe("draft");
		expect(created?.viewCount).toBe(0);
		expect(created?.publishedAt).toBeUndefined();
		expect(created?.mortgageId).toBe(mortgageId);
	});

	it("rejects unauthenticated callers", async () => {
		const t = createHarness();

		await expect(
			t.mutation(
				api.listings.create.create,
				buildListingInput({ dataSource: "demo" })
			)
		).rejects.toThrow("Unauthorized: sign in required");
	});

	it("rejects non-FairLend admins even if they have listing permissions", async () => {
		const t = createHarness();

		await expect(
			t.withIdentity(BROKER).mutation(
				api.listings.create.create,
				buildListingInput({ dataSource: "demo" })
			)
		).rejects.toThrow("Forbidden: fair lend admin role required");
	});

	it("rejects duplicate listings for the same mortgage", async () => {
		const t = createHarness();
		const auth = t.withIdentity(FAIRLEND_ADMIN);
		const mortgageId = await seedMortgage(t);

		await auth.mutation(
			api.listings.create.create,
			buildListingInput({ mortgageId })
		);

		await expect(
			auth.mutation(
				api.listings.create.create,
				buildListingInput({ mortgageId })
			)
		).rejects.toThrow(`Listing already exists for mortgage ${String(mortgageId)}`);
	});

	it("allows demo listings without a mortgage link", async () => {
		const t = createHarness();

		const listingId = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(
				api.listings.create.create,
				buildListingInput({
					dataSource: "demo",
					mortgageId: undefined,
				})
			);

		const created = await t.run(async (ctx) => await ctx.db.get(listingId));
		expect(created?.dataSource).toBe("demo");
		expect(created?.mortgageId).toBeUndefined();
	});

	it("rejects a demo listing with a mortgage link", async () => {
		const t = createHarness();
		const mortgageId = await seedMortgage(t);

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(
				api.listings.create.create,
				buildListingInput({ dataSource: "demo", mortgageId })
			)
		).rejects.toThrow("Demo listings must not include a mortgageId");
	});

	it("rejects a mortgage-backed listing without a mortgage link", async () => {
		const t = createHarness();

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(
				api.listings.create.create,
				buildListingInput({ mortgageId: undefined })
			)
		).rejects.toThrow("Mortgage-backed listings require a mortgageId");
	});
});
