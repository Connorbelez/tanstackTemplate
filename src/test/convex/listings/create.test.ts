import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { assertUniqueMortgageListing, insertListing } from "../../../../convex/listings/create";
import type { MutationCtx } from "../../../../convex/_generated/server";

describe("listing creation invariants", () => {
	it("allows demo listings without a mortgage link", async () => {
		const unique = vi.fn();
		const query = vi.fn();
		const ctx = {
			db: {
				query,
			},
		} as unknown as Pick<MutationCtx, "db">;

		await expect(assertUniqueMortgageListing(ctx, undefined)).resolves.toBeUndefined();
		expect(query).not.toHaveBeenCalled();
		expect(unique).not.toHaveBeenCalled();
	});

	it("rejects creating a second listing for the same mortgage", async () => {
		const unique = vi.fn().mockResolvedValue({ _id: "listings:existing" });
		const withIndex = vi.fn().mockReturnValue({ unique });
		const query = vi.fn().mockReturnValue({ withIndex });
		const ctx = {
			db: {
				query,
			},
		} as unknown as Pick<MutationCtx, "db">;

		await expect(
			assertUniqueMortgageListing(
				ctx,
				"mortgages:duplicate" as Id<"mortgages">
			)
		).rejects.toThrow(ConvexError);
		expect(query).toHaveBeenCalledWith("listings");
		expect(withIndex).toHaveBeenCalledWith("by_mortgage", expect.any(Function));
		expect(unique).toHaveBeenCalled();
	});

	it("inserts a listing after passing the uniqueness guard", async () => {
		const unique = vi.fn().mockResolvedValue(null);
		const withIndex = vi.fn().mockReturnValue({ unique });
		const query = vi.fn().mockReturnValue({ withIndex });
		const insert = vi.fn().mockResolvedValue("listings:new");
		const ctx = {
			db: {
				query,
				insert,
			},
		} as unknown as MutationCtx;

		const listing = {
			mortgageId: "mortgages:m1",
			propertyId: undefined,
			dataSource: "mortgage_pipeline",
			status: "draft",
			machineContext: undefined,
			lastTransitionAt: undefined,
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
			title: "Demo",
			description: "Description",
			marketplaceCopy: undefined,
			heroImages: [],
			featured: false,
			displayOrder: undefined,
			adminNotes: undefined,
			publicDocumentIds: [],
			seoSlug: undefined,
			viewCount: 0,
			publishedAt: undefined,
			delistedAt: undefined,
			delistReason: undefined,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		} as const;

		await expect(insertListing(ctx, listing)).resolves.toBe("listings:new");
		expect(query).toHaveBeenCalledWith("listings");
		expect(insert).toHaveBeenCalledWith("listings", listing);
	});
});
