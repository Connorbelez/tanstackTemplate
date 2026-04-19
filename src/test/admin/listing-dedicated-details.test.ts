import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { shouldHydrateListingCurationForm } from "#/components/admin/shell/dedicated-detail-panels";

describe("listing dedicated details", () => {
	it("skips re-hydration for live refreshes of the same listing", () => {
		expect(
			shouldHydrateListingCurationForm("listing_1" as Id<"listings">, {
				listingId: "listing_1" as Id<"listings">,
			})
		).toBe(false);
		expect(
			shouldHydrateListingCurationForm("listing_1" as Id<"listings">, undefined)
		).toBe(false);
	});

	it("re-hydrates when the viewed listing changes", () => {
		expect(
			shouldHydrateListingCurationForm(null, {
				listingId: "listing_1" as Id<"listings">,
			})
		).toBe(true);
		expect(
			shouldHydrateListingCurationForm("listing_1" as Id<"listings">, {
				listingId: "listing_2" as Id<"listings">,
			})
		).toBe(true);
	});
});
