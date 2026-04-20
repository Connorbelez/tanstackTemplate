# Marketplace Listings Production Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production `/listings` and `/listings/$listingId` marketplace surfaces using the canonical denormalized `listings` projection, promoted production-owned UI, and `listing:view` authorization.

**Architecture:** Keep the existing `listings` table as the read model, add marketplace-specific Convex query DTOs on top of it, and move the polished list/map/detail UI out of `src/components/demo/listings` into `src/components/listings`. The `/listings` index uses validated URL search params plus React Query preloading, while the detail route renders a read-only adaptation of the demo detail page backed by a composed marketplace detail query.

**Tech Stack:** TanStack Router, TanStack Query + `@convex-dev/react-query`, Convex + fluent-convex, WorkOS auth helpers, Tailwind CSS, ShadCN UI, Mapbox GL, Vitest, React Testing Library, Bun, Biome.

---

## File Structure

### Backend auth and marketplace query files

- Modify: `src/lib/auth.ts`
  - Add the new `listings` route authorization key mapped to `listing:view`.
- Modify: `convex/fluent.ts`
  - Add a reusable `listingQuery` builder for `listing:view`.
- Create: `convex/listings/marketplace.ts`
  - Own the new marketplace list/detail queries used by `/listings`.
- Create: `convex/listings/marketplaceShared.ts`
  - Hold shared filter parsing, availability formatting, image URL mapping, and related DTO helpers extracted from listing query logic.
- Modify: `convex/listings/publicDocuments.ts`
  - Replace lender-only read access with `listing:view`-scoped access and return the DTO shape used by the detail page.
- Modify: `convex/listings/validators.ts`
  - Add marketplace-facing property classification validators.
- Modify: `convex/schema.ts`
  - Add the new listing projection field plus any supporting index for marketplace property type filtering.
- Modify: `convex/listings/projection.ts`
  - Populate `marketplacePropertyType` by projection-time mapping from the canonical property/mortgage inputs.

### Backend tests

- Create: `convex/listings/__tests__/marketplace.test.ts`
  - Cover `listing:view` access, marketplace filters, curated sorting, DTO shaping, and detail payload composition.
- Modify: `src/test/auth/route-guards.test.ts`
  - Assert the new `listings` route auth registry entry.

### Frontend route and search files

- Create: `src/routes/listings.tsx`
  - Own route guard, validated search params, query preloading, and search updates for the index page.
- Create: `src/routes/listings.$listingId.tsx`
  - Own route guard, detail preload, and polished not-found handling.
- Create: `src/components/listings/search.ts`
  - Parse and normalize `/listings` search params.
- Create: `src/components/listings/query-options.ts`
  - Centralize `convexQuery(...)` definitions for the index/detail routes.
- Create: `src/components/listings/marketplace-types.ts`
  - Typed search state and UI DTO contracts.
- Create: `src/components/listings/marketplace-adapters.ts`
  - Map backend DTOs to UI-facing props.

### Frontend production listings UI

- Move / Create under `src/components/listings/`:
  - `ListingGridShell.tsx`
  - `ListingMap.tsx`
  - `filter-bar.tsx`
  - `filter-modal.tsx`
  - `date-picker.tsx`
  - `range-slider-with-histogram.tsx`
  - `listing-card-horizontal.tsx`
  - `listing-map-popup.tsx`
  - `mobile-listing-scroller.tsx`
  - `OwnershipBar.tsx`
  - `ListingsGridSkeleton.tsx`
  - `listing-detail-types.ts`
  - `types/listing-filters.ts`
  - `hooks/use-filtered-listings.ts`
  - `filter-bar.tsx` becomes a controlled toolbar driven by route search state
  - `filter-modal.tsx` stays presentational and receives filters + histogram inputs via props
  - `ListingGridShell.tsx` becomes a pure layout shell with map viewport state only
- Create: `src/components/listings/MarketplaceListingsPage.tsx`
  - Compose the promoted list/map/filter UI around real data and route-owned search state.
- Create: `src/components/listings/ListingDetailPage.tsx`
  - Move the demo detail presentational shell here and strip transactional controls.
- Create: `src/components/listings/MarketplaceListingDetailPage.tsx`
  - Adapt the detail DTO into the promoted read-only detail shell.
- Modify: `src/components/listings/index.ts`
  - Export the real production listings surfaces instead of the placeholder components.

### Frontend demo wrappers and tests

- Modify: `src/routes/demo/listings/$listingid.tsx`
  - Point demo detail rendering at the canonical `src/components/listings/ListingDetailPage`.
- Create: `src/test/listings/marketplace-listings-page.test.tsx`
  - Cover loading, empty, and filter/search-param behaviors.
- Create: `src/test/listings/marketplace-listing-detail-page.test.tsx`
  - Cover read-only detail rendering, public docs, and not-found behavior.

## Task 1: Add `listing:view` Route And Backend Authorization Primitives

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `convex/fluent.ts`
- Modify: `src/test/auth/route-guards.test.ts`

- [ ] **Step 1: Write the failing auth helper test for the new route registry entry**

```ts
it("grants marketplace route access through listing:view", () => {
	expect(
		canAccessRoute("listings", {
			orgId: "org_lender",
			permissions: ["listing:view"],
			role: "lender",
			roles: ["lender"],
		})
	).toBe(true);

	expect(
		canAccessRoute("listings", {
			orgId: "org_member",
			permissions: [],
			role: "member",
			roles: ["member"],
		})
	).toBe(false);

	expect(
		canAccessRoute("listings", {
			orgId: "org_admin",
			permissions: ["admin:access"],
			role: "admin",
			roles: ["admin"],
		})
	).toBe(true);
});
```

- [ ] **Step 2: Run the auth helper test to verify it fails**

Run: `bun run test src/test/auth/route-guards.test.ts`

Expected: FAIL with a type or runtime error because `"listings"` is not yet a registered `RouteAuthorizationKey`.

- [ ] **Step 3: Add the route authorization rule and reusable Convex query builder**

```ts
// src/lib/auth.ts
export const ROUTE_AUTHORIZATION_RULES = {
	adminDocumentEngine: {
		kind: "fairLendAdminWithPermission",
		permission: "document:review",
	},
	adminOriginations: {
		kind: "operationalAdminPermission",
		permission: "mortgage:originate",
	},
	adminRotessaReconciliation: {
		kind: "operationalAdminPermission",
		permission: "payment:manage",
	},
	adminUnderwriting: {
		kind: "anyPermission",
		options: { allowAdminOverride: true },
		permissions: ["admin:access", "underwriter:access"],
	},
	listings: {
		kind: "permission",
		permission: "listing:view",
	},
	borrower: {
		kind: "permission",
		permission: "borrower:access",
	},
	broker: {
		kind: "permission",
		permission: "broker:access",
	},
	lawyer: {
		kind: "permission",
		permission: "lawyer:access",
	},
	lender: {
		kind: "permission",
		permission: "lender:access",
	},
	onboarding: {
		kind: "permission",
		permission: "onboarding:access",
	},
} as const satisfies Record<string, AuthorizationRequirement>;
```

```ts
// convex/fluent.ts
export const listingQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("listing:view"));
```

- [ ] **Step 4: Re-run the auth helper test**

Run: `bun run test src/test/auth/route-guards.test.ts`

Expected: PASS, including the new `listing:view` access assertions.

- [ ] **Step 5: Record the change**

```bash
gt create -am "feat: add marketplace listings auth"
```

## Task 2: Add Marketplace Projection Fields And Shared Backend Helpers

**Files:**
- Modify: `convex/listings/validators.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/listings/projection.ts`
- Create: `convex/listings/marketplaceShared.ts`
- Create: `convex/listings/__tests__/marketplace.test.ts`

- [ ] **Step 1: Write the failing projection + filter test for marketplace property classification**

```ts
it("projects a marketplace property type and filters by it", async () => {
	const t = createHarness();
	const auth = t.withIdentity({
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

	await t.run(async (ctx) => {
		await ctx.db.insert(
			"listings",
			buildListingDoc({
				marketplacePropertyType: "Townhouse",
				propertyType: "residential",
				title: "Townhouse Listing",
			})
		);
	});

	const result = await auth.query(anyApi.listings.marketplace.listMarketplaceListings, {
		cursor: null,
		numItems: 20,
		filters: {
			propertyTypes: ["Townhouse"],
		},
	});

	expect(result.page).toHaveLength(1);
	expect(result.page[0]?.propertyTypeLabel).toBe("Townhouse");
});
```

- [ ] **Step 2: Run the new marketplace backend test to verify it fails**

Run: `bun run test convex/listings/__tests__/marketplace.test.ts`

Expected: FAIL because `marketplacePropertyType` and `listMarketplaceListings` do not exist yet.

- [ ] **Step 3: Add the new validator, schema field, and projection default**

```ts
// convex/listings/validators.ts
export const marketplaceListingPropertyTypeValidator = v.union(
	v.literal("Detached Home"),
	v.literal("Duplex"),
	v.literal("Triplex"),
	v.literal("Apartment"),
	v.literal("Condo"),
	v.literal("Cottage"),
	v.literal("Townhouse"),
	v.literal("Commercial"),
	v.literal("Mixed-Use"),
	v.literal("Other")
);

export const listingCreateInputFields = {
	mortgageId: v.optional(v.id("mortgages")),
	propertyId: v.optional(v.id("properties")),
	dataSource: listingDataSourceValidator,
	principal: v.number(),
	interestRate: v.number(),
	ltvRatio: v.number(),
	termMonths: v.number(),
	maturityDate: v.string(),
	monthlyPayment: v.number(),
	rateType: listingRateTypeValidator,
	paymentFrequency: listingPaymentFrequencyValidator,
	loanType: listingLoanTypeValidator,
	lienPosition: v.number(),
	propertyType: listingPropertyTypeValidator,
	marketplacePropertyType: marketplaceListingPropertyTypeValidator,
	city: v.string(),
	province: v.string(),
	approximateLatitude: v.optional(v.number()),
	approximateLongitude: v.optional(v.number()),
	latestAppraisalValueAsIs: v.optional(v.number()),
	latestAppraisalDate: v.optional(v.string()),
	borrowerSignal: v.optional(v.any()),
	paymentHistory: v.optional(v.any()),
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	marketplaceCopy: v.optional(v.string()),
	heroImages: v.array(listingHeroImageValidator),
	featured: v.boolean(),
	displayOrder: v.optional(v.number()),
	adminNotes: v.optional(v.string()),
	publicDocumentIds: v.array(v.id("_storage")),
	seoSlug: v.optional(v.string()),
};

export const listingProjectionOwnedUpdateFields = {
	principal: v.optional(v.number()),
	interestRate: v.optional(v.number()),
	ltvRatio: v.optional(v.number()),
	termMonths: v.optional(v.number()),
	maturityDate: v.optional(v.string()),
	monthlyPayment: v.optional(v.number()),
	rateType: v.optional(listingRateTypeValidator),
	paymentFrequency: v.optional(listingPaymentFrequencyValidator),
	loanType: v.optional(listingLoanTypeValidator),
	lienPosition: v.optional(v.number()),
	propertyType: v.optional(listingPropertyTypeValidator),
	marketplacePropertyType: v.optional(marketplaceListingPropertyTypeValidator),
	city: v.optional(v.string()),
	province: v.optional(v.string()),
	approximateLatitude: v.optional(v.number()),
	approximateLongitude: v.optional(v.number()),
	latestAppraisalValueAsIs: v.optional(v.number()),
	latestAppraisalDate: v.optional(v.string()),
	borrowerSignal: v.optional(v.any()),
	paymentHistory: v.optional(v.any()),
	publicDocumentIds: v.optional(v.array(v.id("_storage"))),
};
```

```ts
// convex/schema.ts
import {
	listingDataSourceValidator,
	listingDelistReasonValidator,
	listingHeroImageValidator,
	listingLoanTypeValidator,
	marketplaceListingPropertyTypeValidator,
	listingPaymentFrequencyValidator,
	listingPropertyTypeValidator,
	listingRateTypeValidator,
	listingStatusValidator,
} from "./listings/validators";

listings: defineTable({
	principal: v.number(),
	interestRate: v.number(),
	ltvRatio: v.number(),
	termMonths: v.number(),
	maturityDate: v.string(),
	monthlyPayment: v.number(),
	rateType: listingRateTypeValidator,
	paymentFrequency: listingPaymentFrequencyValidator,
	loanType: listingLoanTypeValidator,
	lienPosition: v.number(),
	propertyType: listingPropertyTypeValidator,
	marketplacePropertyType: marketplaceListingPropertyTypeValidator,
	city: v.string(),
	province: v.string(),
	approximateLatitude: v.optional(v.number()),
	approximateLongitude: v.optional(v.number()),
	latestAppraisalValueAsIs: v.optional(v.number()),
	latestAppraisalDate: v.optional(v.string()),
	borrowerSignal: v.optional(v.any()),
	paymentHistory: v.optional(v.any()),
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	marketplaceCopy: v.optional(v.string()),
	heroImages: v.array(listingHeroImageValidator),
	featured: v.boolean(),
	displayOrder: v.optional(v.number()),
	adminNotes: v.optional(v.string()),
	publicDocumentIds: v.array(v.id("_storage")),
	seoSlug: v.optional(v.string()),
	viewCount: v.number(),
	publishedAt: v.optional(v.number()),
	delistedAt: v.optional(v.number()),
	delistReason: v.optional(listingDelistReasonValidator),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_mortgage", ["mortgageId"])
	.index("by_status", ["status"])
	.index("by_status_and_featured", ["status", "featured"])
	.index("by_status_and_view_count", ["status", "viewCount"])
	.index("by_property_type_and_status", ["propertyType", "status"])
	.index("by_marketplace_property_type_and_status", [
		"marketplacePropertyType",
		"status",
	])
	.index("by_province_and_status", ["province", "status"])
	.index("by_city_and_status", ["city", "status"])
	.index("by_lien_position_and_status", ["lienPosition", "status"])
	.index("by_interest_rate", ["status", "interestRate"])
	.index("by_ltv", ["status", "ltvRatio"])
	.index("by_principal", ["status", "principal"])
	.index("by_published_at", ["status", "publishedAt"]);
```

```ts
// convex/listings/projection.ts
function deriveMarketplacePropertyType(propertyType: ListingDoc["propertyType"]) {
	switch (propertyType) {
		case "condo":
			return "Condo";
		case "multi_unit":
			return "Duplex";
		case "commercial":
			return "Commercial";
		case "residential":
		default:
			return "Detached Home";
	}
}

function buildProjectionPatch(args: {
	inputs: Awaited<ReturnType<typeof loadProjectionInputs>>;
	now: number;
}) {
	const { latestValuationSnapshot, mortgage, obligations, property } =
		args.inputs;
	const latestAppraisalValueAsIs = latestValuationSnapshot?.valueAsIs;
	const ltvRatio =
		typeof latestAppraisalValueAsIs === "number" && latestAppraisalValueAsIs > 0
			? roundToTwoDecimals(
					(mortgage.principal / latestAppraisalValueAsIs) * 100
				)
			: 0;

	return {
		approximateLatitude: property.latitude,
		approximateLongitude: property.longitude,
		borrowerSignal: buildBorrowerSignal({
			borrowers: args.inputs.borrowers,
		}),
		city: property.city,
		dataSource: "mortgage_pipeline" as const,
		interestRate: mortgage.interestRate,
		latestAppraisalDate: latestValuationSnapshot?.valuationDate,
		latestAppraisalValueAsIs,
		lienPosition: mortgage.lienPosition,
		loanType: mortgage.loanType,
		ltvRatio,
		marketplacePropertyType: deriveMarketplacePropertyType(
			property.propertyType
		),
		maturityDate: mortgage.maturityDate,
		monthlyPayment: mortgage.paymentAmount,
		mortgageId: mortgage._id,
		paymentFrequency: mortgage.paymentFrequency,
		paymentHistory: buildPaymentHistory({ obligations }),
		principal: mortgage.principal,
		propertyId: property._id,
		propertyType: property.propertyType,
		province: property.province,
		rateType: mortgage.rateType,
		termMonths: mortgage.termMonths,
		updatedAt: args.now,
	};
}
```

- [ ] **Step 4: Extract shared backend helpers for DTO building**

```ts
// convex/listings/marketplaceShared.ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export interface MarketplaceAvailabilitySummary {
	availableFractions: number;
	investorCount: number;
	lockedPercent: number;
	soldPercent: number;
	totalFractions: number;
}

export function lienPositionToMortgageType(
	lienPosition: number
): "First" | "Second" | "Other" {
	if (lienPosition === 1) return "First";
	if (lienPosition === 2) return "Second";
	return "Other";
}

export async function getHeroImageUrl(
	ctx: Pick<QueryCtx, "storage">,
	heroImage: Doc<"listings">["heroImages"][number] | undefined
) {
	if (!heroImage) return null;
	return await ctx.storage.getUrl(heroImage.storageId);
}

export function buildLocationLabel(listing: Doc<"listings">) {
	return [listing.city, listing.province].filter(Boolean).join(", ");
}
```

- [ ] **Step 5: Re-run the marketplace backend test**

Run: `bun run test convex/listings/__tests__/marketplace.test.ts`

Expected: Still FAIL, but now for the missing marketplace query implementation rather than the schema/projection field.

- [ ] **Step 6: Record the change**

```bash
gt modify -am "feat: add marketplace listing projection fields"
```

## Task 3: Implement The Marketplace Convex List Query And Align Public Docs Access

**Files:**
- Create: `convex/listings/marketplace.ts`
- Modify: `convex/listings/publicDocuments.ts`
- Modify: `convex/listings/__tests__/marketplace.test.ts`

- [ ] **Step 1: Write the failing list query tests for auth, search, mortgage type, and curated sort**

```ts
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
		viewerWithoutListingView.query(anyApi.listings.marketplace.listMarketplaceListings, {
			cursor: null,
			numItems: 20,
		})
	).rejects.toThrow('permission "listing:view" required');
});

it("searches, filters by mortgage type, and keeps featured rows first", async () => {
	const t = createHarness();
	const auth = listingViewer(t);

	await t.run(async (ctx) => {
		await ctx.db.insert(
			"listings",
			buildListingDoc({
				title: "Featured Toronto First",
				city: "Toronto",
				featured: true,
				displayOrder: 1,
				lienPosition: 1,
				marketplacePropertyType: "Townhouse",
			})
		);
		await ctx.db.insert(
			"listings",
			buildListingDoc({
				title: "Standard Toronto Second",
				city: "Toronto",
				featured: false,
				displayOrder: 99,
				lienPosition: 2,
				marketplacePropertyType: "Townhouse",
			})
		);
	});

	const result = await auth.query(anyApi.listings.marketplace.listMarketplaceListings, {
		cursor: null,
		numItems: 20,
		filters: {
			searchQuery: "Toronto",
			mortgageTypes: ["First", "Second"],
			propertyTypes: ["Townhouse"],
		},
	});

	expect(result.page.map((listing) => listing.title)).toEqual([
		"Featured Toronto First",
		"Standard Toronto Second",
	]);
	expect(result.page[0]?.mortgageTypeLabel).toBe("First");
	expect(result.page[1]?.mortgageTypeLabel).toBe("Second");
});
```

- [ ] **Step 2: Run the marketplace backend test to verify it fails**

Run: `bun run test convex/listings/__tests__/marketplace.test.ts`

Expected: FAIL because the marketplace query and `listing:view` access path do not exist yet.

- [ ] **Step 3: Implement the marketplace query with curated defaults**

```ts
// convex/listings/marketplace.ts
import { ConvexError, v } from "convex/values";
import { listingQuery } from "../fluent";
import type { Doc } from "../_generated/dataModel";
import {
	attachAvailabilityToListings,
	getHeroImageUrl,
	buildLocationLabel,
	lienPositionToMortgageType,
} from "./marketplaceShared";
import { marketplaceListingPropertyTypeValidator } from "./validators";

function matchesMarketplaceFilters(
	listing: Doc<"listings">,
	filters: MarketplaceFilters | undefined
) {
	if (!filters) return true;
	const searchQuery = filters.searchQuery?.trim().toLowerCase();
	const mortgageType = lienPositionToMortgageType(listing.lienPosition);

	return [
		!searchQuery ||
			listing.title?.toLowerCase().includes(searchQuery) ||
			listing.city.toLowerCase().includes(searchQuery) ||
			listing.province.toLowerCase().includes(searchQuery) ||
			listing.marketplaceCopy?.toLowerCase().includes(searchQuery),
		!filters.mortgageTypes?.length ||
			filters.mortgageTypes.includes(mortgageType),
		!filters.propertyTypes?.length ||
			filters.propertyTypes.includes(listing.marketplacePropertyType),
		filters.ltv?.min === undefined || listing.ltvRatio >= filters.ltv.min,
		filters.ltv?.max === undefined || listing.ltvRatio <= filters.ltv.max,
		filters.interestRate?.min === undefined ||
			listing.interestRate >= filters.interestRate.min,
		filters.interestRate?.max === undefined ||
			listing.interestRate <= filters.interestRate.max,
		filters.principalAmount?.min === undefined ||
			listing.principal >= filters.principalAmount.min,
		filters.principalAmount?.max === undefined ||
			listing.principal <= filters.principalAmount.max,
		filters.maturityDate?.end === undefined ||
			listing.maturityDate <= filters.maturityDate.end,
	].every(Boolean);
}

function compareMarketplaceListings(left: Doc<"listings">, right: Doc<"listings">) {
	if (left.featured !== right.featured) return left.featured ? -1 : 1;
	const leftDisplay = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
	const rightDisplay = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
	if (leftDisplay !== rightDisplay) return leftDisplay - rightDisplay;
	const leftPublished = left.publishedAt ?? 0;
	const rightPublished = right.publishedAt ?? 0;
	if (leftPublished !== rightPublished) return rightPublished - leftPublished;
	return String(left._id).localeCompare(String(right._id));
}

export const listMarketplaceListings = listingQuery
	.input({
		cursor: v.optional(v.union(v.string(), v.null())),
		numItems: v.optional(v.number()),
		filters: v.optional(
			v.object({
				searchQuery: v.optional(v.string()),
				mortgageTypes: v.optional(
					v.array(
						v.union(v.literal("First"), v.literal("Second"), v.literal("Other"))
					)
				),
				propertyTypes: v.optional(v.array(marketplaceListingPropertyTypeValidator)),
				ltv: v.optional(v.object({ min: v.optional(v.number()), max: v.optional(v.number()) })),
				interestRate: v.optional(
					v.object({ min: v.optional(v.number()), max: v.optional(v.number()) })
				),
				principalAmount: v.optional(
					v.object({ min: v.optional(v.number()), max: v.optional(v.number()) })
				),
				maturityDate: v.optional(v.object({ end: v.optional(v.string()) })),
			})
		),
	})
	.handler(async (ctx, args) => {
		const listings = await ctx.db
			.query("listings")
			.withIndex("by_status", (q) => q.eq("status", "published"))
			.take(251);

		if (listings.length > 250) {
			throw new ConvexError("Marketplace listing query is too broad; add filters or pagination support");
		}

		const filtered = listings
			.filter((listing) => matchesMarketplaceFilters(listing, args.filters))
			.sort(compareMarketplaceListings);

		const offset = Number.parseInt((args.cursor ?? "offset:0").replace("offset:", ""), 10) || 0;
		const pageSize = Math.min(args.numItems ?? 24, 50);
		const page = filtered.slice(offset, offset + pageSize);
		const availabilityPage = await attachAvailabilityToListings(ctx, page);

		return {
			isDone: offset + page.length >= filtered.length,
			continueCursor:
				offset + page.length >= filtered.length ? null : `offset:${String(offset + page.length)}`,
			page: await Promise.all(
				availabilityPage.map(async ({ availability, listing }) => ({
					id: String(listing._id),
					title: listing.title ?? "Mortgage Listing",
					locationLabel: buildLocationLabel(listing),
					heroImageUrl: await getHeroImageUrl(ctx, listing.heroImages[0]),
					marketplaceCopy: listing.marketplaceCopy ?? listing.description ?? "",
					principal: listing.principal,
					interestRate: listing.interestRate,
					ltvRatio: listing.ltvRatio,
					maturityDate: listing.maturityDate,
					mortgageTypeLabel: lienPositionToMortgageType(listing.lienPosition),
					propertyTypeLabel: listing.marketplacePropertyType,
					featured: listing.featured,
					displayOrder: listing.displayOrder ?? null,
					availability,
					approximateLatitude: listing.approximateLatitude ?? null,
					approximateLongitude: listing.approximateLongitude ?? null,
				}))
			),
		};
	})
	.public();
```

- [ ] **Step 4: Align listing public document reads to `listing:view`**

```ts
// convex/listings/publicDocuments.ts
import { listingQuery } from "../fluent";

export const listForListing = listingQuery
	.input({
		listingId: v.id("listings"),
	})
	.handler(async (ctx, args) => {
		const listing = await ctx.db.get(args.listingId);
		if (!listing) {
			throw new ConvexError("Listing not found");
		}

		return await readListingPublicDocuments(ctx, args.listingId);
	})
	.public();
```

- [ ] **Step 5: Re-run the marketplace backend test**

Run: `bun run test convex/listings/__tests__/marketplace.test.ts`

Expected: PASS for auth, search, mortgage-type mapping, and curated ordering.

- [ ] **Step 6: Record the change**

```bash
gt modify -am "feat: add marketplace list queries"
```

## Task 4: Implement The Marketplace Detail Query And Read-Only DTO

**Files:**
- Modify: `convex/listings/marketplace.ts`
- Modify: `convex/listings/__tests__/marketplace.test.ts`

- [ ] **Step 1: Write the failing detail query test**

```ts
it("returns a read-only marketplace detail payload", async () => {
	const t = createHarness();
	const auth = listingViewer(t);

	let listingId!: Id<"listings">;
	await t.run(async (ctx) => {
		listingId = await ctx.db.insert(
			"listings",
			buildListingDoc({
				title: "King West Bridge Opportunity",
				description: "Projected lender-facing mortgage listing.",
				marketplaceCopy: "Well-located first mortgage opportunity.",
				marketplacePropertyType: "Townhouse",
			})
		);
	});

	const result = await auth.query(anyApi.listings.marketplace.getMarketplaceListingDetail, {
		listingId,
	});

	expect(result?.listing.id).toBe(String(listingId));
	expect(result?.listing.readOnly).toBe(true);
	expect(result?.documents).toBeDefined();
	expect(result?.investment.availableFractions).toBeTypeOf("number");
});
```

- [ ] **Step 2: Run the detail query test to verify it fails**

Run: `bun run test convex/listings/__tests__/marketplace.test.ts -t "returns a read-only marketplace detail payload"`

Expected: FAIL because `getMarketplaceListingDetail` does not exist.

- [ ] **Step 3: Implement the composed marketplace detail query**

```ts
// convex/listings/marketplace.ts
export const getMarketplaceListingDetail = listingQuery
	.input({ listingId: v.id("listings") })
	.handler(async (ctx, args) => {
		const listing = await ctx.db.get(args.listingId);
		if (!listing || listing.status !== "published") {
			return null;
		}

		const availability = await buildListingAvailability(ctx, listing.mortgageId);
		const heroImages = await Promise.all(
			listing.heroImages.map(async (image, index) => ({
				id: `${String(listing._id)}:${String(index)}`,
				url: await ctx.storage.getUrl(image.storageId),
				caption: image.caption ?? null,
			}))
		);
		const [documents, appraisals, encumbrances, similarListings] = await Promise.all([
			readListingPublicDocuments(ctx, args.listingId),
			listing.propertyId
				? getListingAppraisalsByProperty(ctx, listing.propertyId)
				: Promise.resolve([]),
			listing.propertyId
				? getListingEncumbrancesByProperty(ctx, listing.propertyId)
				: Promise.resolve([]),
			getSimilarMarketplaceListings(ctx, listing),
		]);

		return {
			listing: {
				id: String(listing._id),
				readOnly: true,
				title: listing.title ?? "Mortgage Listing",
				locationLabel: buildLocationLabel(listing),
				summary: listing.marketplaceCopy ?? listing.description ?? "",
				heroImages,
				propertyTypeLabel: listing.marketplacePropertyType,
				mortgageTypeLabel: lienPositionToMortgageType(listing.lienPosition),
				principal: listing.principal,
				interestRate: listing.interestRate,
				ltvRatio: listing.ltvRatio,
				termMonths: listing.termMonths,
				maturityDate: listing.maturityDate,
				paymentFrequency: listing.paymentFrequency,
				monthlyPayment: listing.monthlyPayment,
				borrowerSignal: listing.borrowerSignal ?? null,
				paymentHistory: listing.paymentHistory ?? null,
			},
			investment: {
				availableFractions: availability?.availableFractions ?? 0,
				totalFractions: availability?.totalFractions ?? 0,
				soldPercent: availability?.percentageSold ?? 0,
				investorCount: availability?.totalInvestors ?? 0,
			},
			documents,
			appraisals,
			encumbrances,
			similarListings,
		};
	})
	.public();
```

- [ ] **Step 4: Re-run the detail query test**

Run: `bun run test convex/listings/__tests__/marketplace.test.ts -t "returns a read-only marketplace detail payload"`

Expected: PASS with a non-null detail DTO and `readOnly: true`.

- [ ] **Step 5: Record the change**

```bash
gt modify -am "feat: add marketplace detail query"
```

## Task 5: Promote Shared Listings UI Into `src/components/listings` And Remove Demo-Only Filter State

**Files:**
- Move: `src/components/demo/listings/ListingGridShell.tsx` -> `src/components/listings/ListingGridShell.tsx`
- Move: `src/components/demo/listings/ListingMap.tsx` -> `src/components/listings/ListingMap.tsx`
- Move: `src/components/demo/listings/filter-bar.tsx` -> `src/components/listings/filter-bar.tsx`
- Move: `src/components/demo/listings/filter-modal.tsx` -> `src/components/listings/filter-modal.tsx`
- Move: `src/components/demo/listings/date-picker.tsx` -> `src/components/listings/date-picker.tsx`
- Move: `src/components/demo/listings/range-slider-with-histogram.tsx` -> `src/components/listings/range-slider-with-histogram.tsx`
- Move: `src/components/demo/listings/listing-card-horizontal.tsx` -> `src/components/listings/listing-card-horizontal.tsx`
- Move: `src/components/demo/listings/listing-map-popup.tsx` -> `src/components/listings/listing-map-popup.tsx`
- Move: `src/components/demo/listings/mobile-listing-scroller.tsx` -> `src/components/listings/mobile-listing-scroller.tsx`
- Move: `src/components/demo/listings/OwnershipBar.tsx` -> `src/components/listings/OwnershipBar.tsx`
- Move: `src/components/demo/listings/ListingsGridSkeleton.tsx` -> `src/components/listings/ListingsGridSkeleton.tsx`
- Move: `src/components/demo/listings/types/listing-filters.ts` -> `src/components/listings/types/listing-filters.ts`
- Move: `src/components/demo/listings/hooks/use-filtered-listings.ts` -> `src/components/listings/hooks/use-filtered-listings.ts`
- Modify: `src/components/listings/ListingGridShell.tsx`
- Modify: `src/components/listings/filter-bar.tsx`
- Modify: `src/components/listings/filter-modal.tsx`
- Modify: `src/components/listings/types/listing-filters.ts`
- Modify: `src/components/listings/index.ts`

- [ ] **Step 1: Move the reusable list/map/filter files into the production module**

```bash
git mv src/components/demo/listings/ListingGridShell.tsx src/components/listings/ListingGridShell.tsx
git mv src/components/demo/listings/ListingMap.tsx src/components/listings/ListingMap.tsx
git mv src/components/demo/listings/filter-bar.tsx src/components/listings/filter-bar.tsx
git mv src/components/demo/listings/filter-modal.tsx src/components/listings/filter-modal.tsx
git mv src/components/demo/listings/date-picker.tsx src/components/listings/date-picker.tsx
git mv src/components/demo/listings/range-slider-with-histogram.tsx src/components/listings/range-slider-with-histogram.tsx
git mv src/components/demo/listings/listing-card-horizontal.tsx src/components/listings/listing-card-horizontal.tsx
git mv src/components/demo/listings/listing-map-popup.tsx src/components/listings/listing-map-popup.tsx
git mv src/components/demo/listings/mobile-listing-scroller.tsx src/components/listings/mobile-listing-scroller.tsx
git mv src/components/demo/listings/OwnershipBar.tsx src/components/listings/OwnershipBar.tsx
git mv src/components/demo/listings/ListingsGridSkeleton.tsx src/components/listings/ListingsGridSkeleton.tsx
mkdir -p src/components/listings/types src/components/listings/hooks
git mv src/components/demo/listings/types/listing-filters.ts src/components/listings/types/listing-filters.ts
git mv src/components/demo/listings/hooks/use-filtered-listings.ts src/components/listings/hooks/use-filtered-listings.ts
```

- [ ] **Step 2: Refactor the promoted shell so it no longer owns user filters**

```tsx
// src/components/listings/ListingGridShell.tsx
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Map as MapIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "#/components/ui/drawer";
import ProgressiveBlur from "#/components/ui/progressive-blur";
import { ScrollArea } from "#/components/ui/scroll-area";
import { useIsMobile } from "#/hooks/use-mobile";
import {
	useViewportFilteredItems,
	type WithLatLng,
} from "./hooks/use-filtered-listings";
import {
	ListingMap,
	type ListingMapProps,
	type ViewportBounds,
} from "./ListingMap";
import {
	MobileListingScroller,
	type MobileListingSection,
} from "./mobile-listing-scroller";

export interface ListingGridShellProps<T extends WithLatLng> {
	classNames?: {
		container?: string;
		gridColumn?: string;
		mapColumn?: string;
		mapWrapper?: string;
	};
	groupItemsForMobile?: (items: readonly T[]) => MobileListingSection<T>[];
	items: readonly T[];
	mapProps?: Partial<
		Omit<ListingMapProps<T>, "items" | "renderPopup" | "onViewportChange">
	>;
	renderCard: (item: T) => ReactNode;
	renderMapPopup: ListingMapProps<T>["renderPopup"];
	toolbar?: ReactNode;
}

export function ListingGridShell<T extends WithLatLng>({
	items,
	renderCard,
	renderMapPopup,
	classNames,
	mapProps,
	groupItemsForMobile,
	toolbar,
}: ListingGridShellProps<T>) {
	const isMobile = useIsMobile();
	const [viewportBounds, setViewportBounds] = useState<
		ViewportBounds | undefined
	>(undefined);
	const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
	const filteredItems = useViewportFilteredItems(items, viewportBounds);
	const mobileSections = useMemo(() => {
		if (filteredItems.length === 0) {
			return [];
		}
		if (groupItemsForMobile) {
			const grouped = groupItemsForMobile(filteredItems);
			return grouped.length > 0
				? grouped
				: [{ title: "All Listings", items: filteredItems }];
		}
		return [{ title: "All Listings", items: filteredItems }];
	}, [filteredItems, groupItemsForMobile]);

	const handleViewportChange = useCallback((bounds: ViewportBounds) => {
		setViewportBounds(bounds);
	}, []);

	if (isMobile) {
		return (
			<div className={classNames?.container}>
				<div className="space-y-4 px-4">
					{toolbar}
					<div className={classNames?.gridColumn}>
						<MobileListingScroller
							renderCard={renderCard}
							sections={mobileSections}
						/>
					</div>

					<div className="fixed right-6 bottom-6 z-40">
						<Drawer onOpenChange={setIsMapDrawerOpen} open={isMapDrawerOpen}>
							<DrawerTrigger asChild>
								<Button
									aria-label="Open map view"
									className="h-14 w-14 rounded-full p-0 shadow-lg"
									size="lg"
								>
									<MapIcon aria-hidden="true" className="h-6 w-6" />
								</Button>
							</DrawerTrigger>
							<DrawerContent className="h-[85vh] rounded-t-2xl">
								<motion.div
									animate="visible"
									className="flex h-full flex-col"
									initial="hidden"
									variants={drawerVariants}
								>
									<motion.div variants={itemVariants}>
										<DrawerHeader>
											<DrawerTitle>Map View</DrawerTitle>
										</DrawerHeader>
									</motion.div>
									<motion.div
										className="min-h-0 flex-1 px-4 pb-4"
										variants={itemVariants}
									>
										<ListingMap
											className="h-full w-full rounded-lg"
											items={filteredItems}
											onViewportChange={handleViewportChange}
											renderPopup={renderMapPopup}
											{...mapProps}
										/>
									</motion.div>
								</motion.div>
							</DrawerContent>
						</Drawer>
					</div>
				</div>
			</div>
		);
	}

	return (
		<section
			className={
				classNames?.container ?? "grid w-full grid-cols-12 gap-x-4 pt-4"
			}
		>
			<div className={classNames?.gridColumn ?? "col-span-8"}>
				{toolbar ? <div className="mb-4 px-8">{toolbar}</div> : null}
				<ScrollArea className="relative h-[calc(100vh-7rem)]">
					<ProgressiveBlur />
					<div className="grid grid-cols-1 gap-3 px-4 pt-4 pb-32 min-[98rem]:grid-cols-2">
						<AnimatePresence mode="popLayout">
							{filteredItems.map((item, index) => {
								const key =
									(item as { id?: string | number }).id ?? `listing-${index}`;

								return (
									<motion.div
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, scale: 0.95 }}
										initial={{ opacity: 0, y: 20 }}
										key={key}
										layout
										transition={{ duration: 0.2 }}
									>
										{renderCard(item)}
									</motion.div>
								);
							})}
						</AnimatePresence>
					</div>
				</ScrollArea>
			</div>

			<div className={classNames?.mapColumn ?? "col-span-4 pr-4"}>
				<div
					className={
						classNames?.mapWrapper ?? "sticky top-24 h-[calc(100vh-8rem)]"
					}
				>
					<ListingMap
						className="mt-4 h-[calc(100vh-9rem)]"
						items={filteredItems}
						onViewportChange={handleViewportChange}
						renderPopup={renderMapPopup}
						{...mapProps}
					/>
				</div>
			</div>
		</section>
	);
}
```

- [ ] **Step 3: Convert the filter bar and modal to controlled components**

```ts
// src/components/listings/types/listing-filters.ts
export interface FilterMetricItem {
	apr?: number;
	ltv?: number;
	principal?: number;
}
```

```tsx
// src/components/listings/filter-bar.tsx
import { Filter, Search, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import FilterModal from "./filter-modal";
import {
	DEFAULT_FILTERS,
	FILTER_BOUNDS,
	type FilterMetricItem,
	type FilterState,
} from "./types/listing-filters";

interface MarketplaceFilterBarProps {
	filters: FilterState;
	items?: readonly FilterMetricItem[];
	onFiltersChange: (filters: FilterState) => void;
}

export function MarketplaceFilterBar({
	filters,
	items = [],
	onFiltersChange,
}: MarketplaceFilterBarProps) {
	const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		onFiltersChange({
			...filters,
			searchQuery: event.target.value,
		});
	};

	const handleClearFilters = () => {
		onFiltersChange(DEFAULT_FILTERS);
	};

	const hasActiveFilters =
		filters.ltvRange[0] > FILTER_BOUNDS.ltvRange[0] ||
		filters.ltvRange[1] < FILTER_BOUNDS.ltvRange[1] ||
		filters.interestRateRange[0] > FILTER_BOUNDS.interestRateRange[0] ||
		filters.interestRateRange[1] < FILTER_BOUNDS.interestRateRange[1] ||
		filters.loanAmountRange[0] > FILTER_BOUNDS.loanAmountRange[0] ||
		filters.loanAmountRange[1] < FILTER_BOUNDS.loanAmountRange[1] ||
		filters.mortgageTypes.length > 0 ||
		filters.propertyTypes.length > 0 ||
		filters.maturityDate !== undefined ||
		filters.searchQuery.length > 0;

	return (
		<div className="z-10 flex flex-col justify-center gap-x-4">
			<div className="flex flex-nowrap items-center justify-start gap-2">
				<div className="relative md:w-64">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground" />
					<Input
						className="rounded-full border-input pl-10 shadow-md"
						onChange={handleSearchChange}
						placeholder="Search ..."
						type="text"
						value={filters.searchQuery}
					/>
				</div>

				<FilterModal
					filters={filters}
					items={items}
					onFiltersChange={onFiltersChange}
				/>

				{hasActiveFilters ? (
					<Button
						aria-label="Clear filters"
						className="px-2"
						onClick={handleClearFilters}
						size="sm"
						variant="destructive"
					>
						<X className="size-3.5" />
						<Filter className="size-3.5" />
					</Button>
				) : null}
			</div>
		</div>
	);
}
```

```tsx
// src/components/listings/filter-modal.tsx
import {
	DEFAULT_FILTERS,
	FILTER_BOUNDS,
	type FilterMetricItem,
	type FilterState,
	type MortgageType,
	type PropertyType,
} from "./types/listing-filters";

interface FilterModalProps {
	filters: FilterState;
	items?: readonly FilterMetricItem[];
	onFiltersChange: (filters: FilterState) => void;
}
```

- [ ] **Step 4: Update the production listings barrel exports**

```ts
// src/components/listings/index.ts
export * from "./ListingGridShell";
export * from "./ListingMap";
export * from "./ListingsGridSkeleton";
export * from "./OwnershipBar";
export * from "./filter-bar";
export * from "./listing-card-horizontal";
export * from "./listing-map-popup";
```

- [ ] **Step 5: Run a focused type check on the promoted listings module**

Run: `bun typecheck`

Expected: PASS for the moved listings files and updated exports.

- [ ] **Step 6: Record the change**

```bash
gt modify -am "refactor: promote listings ui to production module"
```

## Task 6: Build The `/listings` Route, Search Parsing, And Real Data Page

**Files:**
- Create: `src/components/listings/marketplace-types.ts`
- Create: `src/components/listings/search.ts`
- Create: `src/components/listings/query-options.ts`
- Create: `src/components/listings/marketplace-adapters.ts`
- Create: `src/components/listings/MarketplaceListingsPage.tsx`
- Create: `src/routes/listings.tsx`
- Create: `src/test/listings/marketplace-listings-page.test.tsx`

- [ ] **Step 1: Write the failing frontend test for search parsing and empty state rendering**

```tsx
/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseMarketplaceListingsSearch } from "#/components/listings/search";
import { MarketplaceListingsPage } from "#/components/listings/MarketplaceListingsPage";

describe("marketplace listings search", () => {
	it("normalizes search params into route state", () => {
		expect(
			parseMarketplaceListingsSearch({
				q: "toronto",
				mortgageTypes: "First,Second",
				propertyTypes: "Townhouse",
				sort: "featured",
			})
		).toMatchObject({
			q: "toronto",
			mortgageTypes: ["First", "Second"],
			propertyTypes: ["Townhouse"],
			sort: "featured",
		});
	});
});

describe("marketplace listings page", () => {
	it("renders the empty state when no listings match", () => {
		render(
			<MarketplaceListingsPage
				search={{}}
				setSearch={() => undefined}
				snapshot={{ continueCursor: null, isDone: true, page: [] }}
			/>
		);

		expect(screen.getByText("No listings match these filters")).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run the new frontend listings test to verify it fails**

Run: `bun run test src/test/listings/marketplace-listings-page.test.tsx`

Expected: FAIL because the parser and page component do not exist yet.

- [ ] **Step 3: Create the typed search parser, adapters, and query options**

```ts
// src/components/listings/marketplace-types.ts
import type { MortgageType, PropertyType } from "./types/listing-filters";

export type MarketplaceSortKey =
	| "featured"
	| "publishedAt"
	| "interestRate"
	| "ltv"
	| "principalAmount"
	| "viewCount";

export interface MarketplaceListingsSearchState {
	q?: string;
	sort?: MarketplaceSortKey;
	mortgageTypes?: MortgageType[];
	propertyTypes?: PropertyType[];
	ltvMin?: number;
	ltvMax?: number;
	rateMin?: number;
	rateMax?: number;
	principalMin?: number;
	principalMax?: number;
	maturityBefore?: string;
}
```

```ts
// src/components/listings/search.ts
import type { MarketplaceListingsSearchState } from "./marketplace-types";

function parseCsvEnum<T extends string>(
	value: unknown,
	allowed: readonly T[]
): T[] | undefined {
	if (typeof value !== "string" || value.trim().length === 0) return undefined;
	const allowedSet = new Set(allowed);
	const parsed = value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry): entry is T => allowedSet.has(entry as T));
	return parsed.length > 0 ? parsed : undefined;
}

function parseNumber(value: unknown) {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMarketplaceListingsSearch(
	search: Record<string, unknown>
): MarketplaceListingsSearchState {
	return {
		q:
			typeof search.q === "string" && search.q.trim().length > 0
				? search.q.trim()
				: undefined,
		sort:
			search.sort === "featured" ||
			search.sort === "publishedAt" ||
			search.sort === "interestRate" ||
			search.sort === "ltv" ||
			search.sort === "principalAmount" ||
			search.sort === "viewCount"
				? search.sort
				: "featured",
		mortgageTypes: parseCsvEnum(search.mortgageTypes, [
			"First",
			"Second",
			"Other",
		]),
		propertyTypes: parseCsvEnum(search.propertyTypes, [
			"Detached Home",
			"Duplex",
			"Triplex",
			"Apartment",
			"Condo",
			"Cottage",
			"Townhouse",
			"Commercial",
			"Mixed-Use",
			"Other",
		]),
		ltvMin: parseNumber(search.ltvMin),
		ltvMax: parseNumber(search.ltvMax),
		rateMin: parseNumber(search.rateMin),
		rateMax: parseNumber(search.rateMax),
		principalMin: parseNumber(search.principalMin),
		principalMax: parseNumber(search.principalMax),
		maturityBefore:
			typeof search.maturityBefore === "string" &&
			search.maturityBefore.length > 0
				? search.maturityBefore
				: undefined,
	};
}
```

```ts
// src/components/listings/marketplace-adapters.ts
import type { MarketplaceListingsSearchState } from "./marketplace-types";
import {
	DEFAULT_FILTERS,
	type FilterMetricItem,
	type FilterState,
} from "./types/listing-filters";

export function searchStateToFilterState(
	search: MarketplaceListingsSearchState
): FilterState {
	return {
		...DEFAULT_FILTERS,
		searchQuery: search.q ?? "",
		mortgageTypes: search.mortgageTypes ?? [],
		propertyTypes: search.propertyTypes ?? [],
		ltvRange: [
			search.ltvMin ?? DEFAULT_FILTERS.ltvRange[0],
			search.ltvMax ?? DEFAULT_FILTERS.ltvRange[1],
		],
		interestRateRange: [
			search.rateMin ?? DEFAULT_FILTERS.interestRateRange[0],
			search.rateMax ?? DEFAULT_FILTERS.interestRateRange[1],
		],
		loanAmountRange: [
			search.principalMin ?? DEFAULT_FILTERS.loanAmountRange[0],
			search.principalMax ?? DEFAULT_FILTERS.loanAmountRange[1],
		],
		maturityDate: search.maturityBefore
			? new Date(search.maturityBefore)
			: undefined,
	};
}

export function filterStateToSearchState(
	filters: FilterState,
	currentSort: MarketplaceListingsSearchState["sort"]
): MarketplaceListingsSearchState {
	return {
		q: filters.searchQuery.trim() || undefined,
		sort: currentSort ?? "featured",
		mortgageTypes:
			filters.mortgageTypes.length > 0 ? filters.mortgageTypes : undefined,
		propertyTypes:
			filters.propertyTypes.length > 0 ? filters.propertyTypes : undefined,
		ltvMin:
			filters.ltvRange[0] !== DEFAULT_FILTERS.ltvRange[0]
				? filters.ltvRange[0]
				: undefined,
		ltvMax:
			filters.ltvRange[1] !== DEFAULT_FILTERS.ltvRange[1]
				? filters.ltvRange[1]
				: undefined,
		rateMin:
			filters.interestRateRange[0] !== DEFAULT_FILTERS.interestRateRange[0]
				? filters.interestRateRange[0]
				: undefined,
		rateMax:
			filters.interestRateRange[1] !== DEFAULT_FILTERS.interestRateRange[1]
				? filters.interestRateRange[1]
				: undefined,
		principalMin:
			filters.loanAmountRange[0] !== DEFAULT_FILTERS.loanAmountRange[0]
				? filters.loanAmountRange[0]
				: undefined,
		principalMax:
			filters.loanAmountRange[1] !== DEFAULT_FILTERS.loanAmountRange[1]
				? filters.loanAmountRange[1]
				: undefined,
		maturityBefore: filters.maturityDate?.toISOString().slice(0, 10),
	};
}

export function buildFilterMetricItems(
	page: Array<{
		interestRate: number;
		ltvRatio: number;
		principal: number;
	}>
): FilterMetricItem[] {
	return page.map((listing) => ({
		apr: listing.interestRate,
		ltv: listing.ltvRatio,
		principal: listing.principal,
	}));
}
```

```ts
// src/components/listings/query-options.ts
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MarketplaceListingsSearchState } from "./marketplace-types";

export function marketplaceListingsQueryOptions(
	search: MarketplaceListingsSearchState
) {
	return convexQuery(api.listings.marketplace.listMarketplaceListings, {
		cursor: null,
		numItems: 24,
		filters: {
			searchQuery: search.q,
			mortgageTypes: search.mortgageTypes,
			propertyTypes: search.propertyTypes,
			ltv:
				search.ltvMin !== undefined || search.ltvMax !== undefined
					? { min: search.ltvMin, max: search.ltvMax }
					: undefined,
			interestRate:
				search.rateMin !== undefined || search.rateMax !== undefined
					? { min: search.rateMin, max: search.rateMax }
					: undefined,
			principalAmount:
				search.principalMin !== undefined || search.principalMax !== undefined
					? { min: search.principalMin, max: search.principalMax }
					: undefined,
			maturityDate: search.maturityBefore
				? { end: search.maturityBefore }
				: undefined,
		},
	});
}

export function marketplaceListingDetailQueryOptions(listingId: string) {
	return convexQuery(api.listings.marketplace.getMarketplaceListingDetail, {
		listingId: listingId as Id<"listings">,
	});
}
```

- [ ] **Step 4: Implement the real page component and route**

```tsx
// src/components/listings/MarketplaceListingsPage.tsx
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ListingGridShell } from "./ListingGridShell";
import { MarketplaceFilterBar } from "./filter-bar";
import { Horizontal } from "./listing-card-horizontal";
import { ListingMapPopup } from "./listing-map-popup";
import type { MarketplaceListingsSearchState } from "./marketplace-types";
import {
	buildFilterMetricItems,
	filterStateToSearchState,
	searchStateToFilterState,
} from "./marketplace-adapters";

export function MarketplaceListingsPage({
	snapshot,
	search,
	setSearch,
}: {
	snapshot: {
		continueCursor: string | null;
		isDone: boolean;
		page: Array<{
			id: string;
			title: string;
			locationLabel: string;
			heroImageUrl: string | null;
			principal: number;
			interestRate: number;
			ltvRatio: number;
			maturityDate: string;
			propertyTypeLabel: string;
			mortgageTypeLabel: "First" | "Second" | "Other";
			availability: {
				availableFractions: number;
				percentageSold: number;
				totalFractions: number;
				totalInvestors: number;
			} | null;
			approximateLatitude: number | null;
			approximateLongitude: number | null;
		}>;
	};
	search: MarketplaceListingsSearchState;
	setSearch: (
		updater: (current: MarketplaceListingsSearchState) => MarketplaceListingsSearchState
	) => void;
}) {
	const filterState = searchStateToFilterState(search);
	const filterMetrics = useMemo(
		() => buildFilterMetricItems(snapshot.page),
		[snapshot.page]
	);
	const items = useMemo(
		() =>
			snapshot.page.map((listing) => ({
				id: listing.id,
				title: listing.title,
				address: listing.locationLabel,
				imageSrc: listing.heroImageUrl ?? undefined,
				lat: listing.approximateLatitude ?? 43.6532,
				lng: listing.approximateLongitude ?? -79.3832,
				ltv: listing.ltvRatio,
				apr: listing.interestRate,
				principal: listing.principal,
				mortgageType: listing.mortgageTypeLabel,
				propertyType: listing.propertyTypeLabel,
				maturityDate: new Date(listing.maturityDate),
				availablePercent: listing.availability
					? Math.round(
							(listing.availability.availableFractions /
								Math.max(listing.availability.totalFractions, 1)) *
								100
					  )
					: 0,
				lockedPercent: 0,
				soldPercent: Math.round(listing.availability?.percentageSold ?? 0),
			})),
		[snapshot.page]
	);

	const toolbar = (
		<MarketplaceFilterBar
			filters={filterState}
			items={filterMetrics}
			onFiltersChange={(nextFilters) =>
				setSearch(() => filterStateToSearchState(nextFilters, search.sort))
			}
		/>
	);

	if (snapshot.page.length === 0) {
		return (
			<section className="mx-auto flex min-h-[50vh] max-w-4xl flex-col items-center justify-center gap-4 px-6 py-16">
				{toolbar}
				<h1 className="font-semibold text-3xl tracking-tight">
					No listings match these filters
				</h1>
				<p className="max-w-xl text-center text-muted-foreground">
					Clear the current filters or widen the ranges to see more mortgage
					opportunities.
				</p>
				<button
					className="rounded-full border px-4 py-2 text-sm"
					onClick={() => setSearch(() => ({ sort: search.sort ?? "featured" }))}
					type="button"
				>
					Clear filters
				</button>
			</section>
		);
	}

	return (
		<ListingGridShell
			items={items}
			renderCard={(listing) => (
				<Link params={{ listingId: listing.id }} to="/listings/$listingId">
					<Horizontal
						address={listing.address}
						apr={listing.apr}
						availablePercent={listing.availablePercent}
						id={listing.id}
						imageSrc={listing.imageSrc}
						ltv={listing.ltv}
						maturityDate={listing.maturityDate.toLocaleDateString("en-CA")}
						principal={listing.principal}
						propertyType={listing.propertyType}
						soldPercent={listing.soldPercent}
						title={listing.title}
					/>
				</Link>
			)}
			renderMapPopup={(listing) => (
				<ListingMapPopup
					address={listing.address ?? ""}
					apr={listing.apr ?? 0}
					imageSrc={listing.imageSrc}
					principal={listing.principal ?? 0}
					title={listing.title ?? ""}
				/>
			)}
			toolbar={toolbar}
		/>
	);
}
```

```tsx
// src/routes/listings.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MarketplaceListingsPage } from "#/components/listings/MarketplaceListingsPage";
import { marketplaceListingsQueryOptions } from "#/components/listings/query-options";
import { parseMarketplaceListingsSearch } from "#/components/listings/search";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/listings")({
	beforeLoad: guardRouteAccess("listings"),
	validateSearch: (search) => parseMarketplaceListingsSearch(search),
	loaderDeps: ({ search }) => ({ search }),
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(
			marketplaceListingsQueryOptions(deps.search)
		);
	},
	component: ListingsRoutePage,
});

function ListingsRoutePage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const { data } = useSuspenseQuery(marketplaceListingsQueryOptions(search));

	return (
		<MarketplaceListingsPage
			search={search}
			setSearch={(updater) =>
				void navigate({
					to: "/listings",
					search: (current) => updater(current),
				})
			}
			snapshot={data}
		/>
	);
}
```

- [ ] **Step 5: Re-run the new listings frontend test**

Run: `bun run test src/test/listings/marketplace-listings-page.test.tsx`

Expected: PASS, including normalized search state and the empty-state rendering.

- [ ] **Step 6: Record the change**

```bash
gt modify -am "feat: add marketplace listings page"
```

## Task 7: Build The Read-Only Production Detail Route And UI

**Files:**
- Create: `src/components/listings/ListingDetailPage.tsx`
- Create: `src/components/listings/MarketplaceListingDetailPage.tsx`
- Create: `src/components/listings/listing-detail-types.ts`
- Create: `src/routes/listings.$listingId.tsx`
- Modify: `src/routes/demo/listings/$listingid.tsx`
- Create: `src/test/listings/marketplace-listing-detail-page.test.tsx`

- [ ] **Step 1: Write the failing read-only detail page test**

```tsx
/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketplaceListingDetailPage } from "#/components/listings/MarketplaceListingDetailPage";

describe("marketplace listing detail page", () => {
	it("renders a read-only investment snapshot without locking controls", () => {
		render(
			<MarketplaceListingDetailPage
				detail={{
					listing: {
						id: "listing_1",
						readOnly: true,
						title: "King West Bridge Opportunity",
						locationLabel: "Toronto, ON",
						summary: "Projected lender-facing mortgage listing.",
						heroImages: [],
						propertyTypeLabel: "Townhouse",
						mortgageTypeLabel: "First",
						principal: 250000,
						interestRate: 9.5,
						ltvRatio: 62,
						termMonths: 12,
						maturityDate: "2027-04-30",
						paymentFrequency: "monthly",
						monthlyPayment: 2450,
						borrowerSignal: null,
						paymentHistory: null,
					},
					investment: {
						availableFractions: 42,
						totalFractions: 100,
						soldPercent: 58,
						investorCount: 8,
					},
					documents: [],
					appraisals: [],
					encumbrances: [],
					similarListings: [],
				}}
			/>
		);

		expect(screen.getByText("King West Bridge Opportunity")).toBeTruthy();
		expect(screen.getByText("Available Fractions")).toBeTruthy();
		expect(screen.queryByText(/Lock .* Fractions/)).toBeNull();
		expect(screen.queryByText(/I have my own lawyer/)).toBeNull();
	});
});
```

- [ ] **Step 2: Run the detail page test to verify it fails**

Run: `bun run test src/test/listings/marketplace-listing-detail-page.test.tsx`

Expected: FAIL because the production detail components do not exist.

- [ ] **Step 3: Move the demo detail shell into production and add a real read-only mode**

```bash
git mv src/components/demo/listings/ListingDetailPage.tsx src/components/listings/ListingDetailPage.tsx
git mv src/components/demo/listings/listing-detail-types.ts src/components/listings/listing-detail-types.ts
```

```tsx
// src/components/listings/listing-detail-types.ts
export interface ListingCheckoutConfig {
	cardCtaLabel: string;
	defaultFractions: number;
	lawyers: ListingLawyerOption[];
	lockFee: string;
	minimumFractions: number;
	perFractionAmount: number;
	poweredBy: string;
}

export interface ListingDetailModel {
	appraisal: {
		asIf: ListingAppraisalRecord;
		asIs: ListingAppraisalRecord;
	};
	atAGlance: ListingAtAGlanceItem[];
	badges: ListingBadge[];
	borrowerSignals: {
		grade: string;
		items: ListingBorrowerSignal[];
		note: string;
		score: string;
		subtitle: string;
	};
	checkout?: ListingCheckoutConfig;
	comparables: {
		asIf: ListingComparable[];
		asIs: ListingComparable[];
	};
	documents: ListingDocumentItem[];
	heroImages: ListingHeroImage[];
	id: string;
	investment: {
		availabilityLabel: string;
		availabilityValue: number;
		availableFractions: number;
		investorCountLabel: string;
		projectedYield: string;
		totalFractions: number;
	};
	keyFinancials: ListingKeyFinancialItem[];
	listedLabel: string;
	map: {
		label: string;
		locationText: string;
	};
	mlsId: string;
	paymentHistory: {
		lateCount: number;
		missedCount: number;
		months: ListingPaymentHistoryMonth[];
		onTimeRate: string;
	};
	similarListings: ListingSimilarCard[];
	summary: string;
	title: string;
}
```

```tsx
// src/components/listings/ListingDetailPage.tsx
interface ListingDetailPageProps {
	listing: ListingDetailModel;
	mode?: "interactive" | "readOnly";
}

export function ListingDetailPage({
	listing,
	mode = listing.checkout ? "interactive" : "readOnly",
}: ListingDetailPageProps) {
	const [selectedLawyerId, setSelectedLawyerId] = useState<string | undefined>(
		listing.checkout?.lawyers[0]?.id
	);
	const [fractionInput, setFractionInput] = useState(
		String(listing.checkout?.defaultFractions ?? listing.investment.availableFractions)
	);
}
```

```tsx
// src/components/listings/ListingDetailPage.tsx
<InvestmentSummaryCard className="mx-16 mt-10" listing={listing} />

{mode === "interactive" && listing.checkout ? (
	<section className="flex gap-6 px-16 pt-6">
		<WhiteSurface className="flex-1 px-7 py-7">
			<h2 className="font-semibold text-[20px]">Select Your Investment</h2>
			<div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4">
				<div className="space-y-2">
					<label
						className="font-medium text-[#6B6B68] text-[13px]"
						htmlFor="desktop-fractions-input"
					>
						Number of fractions
					</label>
					<Input
						aria-label="Number of fractions"
						className="h-12 rounded-xl border-[#E7E5E4] bg-[#FBFAF8] text-base"
						id="desktop-fractions-input"
						onBlur={handleFractionBlur}
						onChange={(event) => handleFractionChange(event.target.value)}
						value={fractionInput}
					/>
				</div>
				<div className="rounded-xl bg-[#E7F6EA] px-5 py-3 font-semibold text-[#2E7D4F] text-xl">
					= {formatCurrency(calculatedInvestment)}
				</div>
			</div>

			<div className="mt-6 space-y-3">
				<p className="font-medium text-[#6B6B68] text-[13px]">
					Select your lawyer
				</p>
				{listing.checkout.lawyers.length > 0 ? (
					listing.checkout.lawyers.map((lawyer) => (
						<LawyerOptionCard
							isSelected={lawyer.id === selectedLawyerId}
							key={lawyer.id}
							lawyer={lawyer}
							onSelect={setSelectedLawyerId}
						/>
					))
				) : (
					<EmptySelectionState message="No lawyers are configured for this listing yet." />
				)}
			</div>
		</WhiteSurface>

		<CheckoutCard
			calculatedInvestment={calculatedInvestment}
			ctaLabel={ctaLabel}
			fractions={effectiveFractions}
			listing={listing}
			selectedLawyerLabel={
				listing.checkout.lawyers.find((lawyer) => lawyer.id === selectedLawyerId)
					?.label
			}
		/>
	</section>
) : (
	<WhiteSurface className="mx-16 mt-6 px-7 py-6">
		<h2 className="font-semibold text-[20px]">Investment Snapshot</h2>
		<p className="mt-2 text-[#6B6B68] text-sm">
			This marketplace release is read-only. Fraction selection, lawyer
			selection, and locking controls are intentionally hidden.
		</p>
		<div className="mt-5 grid gap-3 sm:grid-cols-3">
			<ValueStat
				label="Available Fractions"
				value={String(listing.investment.availableFractions)}
			/>
			<ValueStat
				label="Total Fractions"
				value={String(listing.investment.totalFractions)}
			/>
			<ValueStat
				label="Investors"
				value={listing.investment.investorCountLabel}
			/>
		</div>
	</WhiteSurface>
)
```

```tsx
// src/components/listings/MarketplaceListingDetailPage.tsx
import { ListingDetailPage } from "./ListingDetailPage";

interface MarketplaceListingDetailData {
	appraisals: Array<{
		date?: string;
		label: string;
		note: string;
		secondaryLabel?: string;
		secondaryValue?: string;
		value: string;
	}>;
	documents: Array<{
		blueprintId: string;
		description?: string | null;
		displayName: string;
		url?: string | null;
	}>;
	encumbrances: Array<{
		id: string;
		label: string;
		note: string;
		value: string;
	}>;
	investment: {
		availableFractions: number;
		investorCount: number;
		soldPercent: number;
		totalFractions: number;
	};
	listing: {
		borrowerSignal: {
			borrowerCount: number;
			hasGuarantor: boolean;
			participants: Array<{
				borrowerId: string;
				idvStatus: string | null;
				name: string;
				role: string;
				status: string;
			}>;
			primaryBorrowerId: string | null;
			primaryBorrowerName: string | null;
		} | null;
		heroImages: Array<{
			caption: string | null;
			id: string;
			url: string | null;
		}>;
		id: string;
		interestRate: number;
		locationLabel: string;
		ltvRatio: number;
		maturityDate: string;
		monthlyPayment: number;
		mortgageTypeLabel: string;
		paymentFrequency: string;
		paymentHistory: {
			byStatus: Record<string, number>;
			lastDueDate: number | null;
			totalObligations: number;
			totalOutstanding: number;
		} | null;
		principal: number;
		propertyTypeLabel: string;
		readOnly: true;
		summary: string;
		termMonths: number;
		title: string;
	};
	similarListings: Array<{
		id: string;
		metrics: string[];
		price: string;
		title: string;
	}>;
}

export function MarketplaceListingDetailPage({
	detail,
}: {
	detail: MarketplaceListingDetailData;
}) {
	return (
		<ListingDetailPage
			mode="readOnly"
			listing={{
				id: detail.listing.id,
				title: detail.listing.title,
				listedLabel: "Published mortgage opportunity",
				mlsId: detail.listing.id,
				badges: [
					{
						id: "mortgage-type",
						label: detail.listing.mortgageTypeLabel,
						tone: "dark",
					},
					{
						id: "property-type",
						label: detail.listing.propertyTypeLabel,
						tone: "outline",
					},
				],
				heroImages: detail.listing.heroImages.map((image) => ({
					id: image.id,
					label: image.caption ?? "Listing image",
					alt: image.caption ?? "Listing image",
					tone: "stone",
					src: image.url ?? undefined,
				})),
				map: {
					label: "Approximate location",
					locationText: detail.listing.locationLabel,
				},
				summary: detail.listing.summary,
				atAGlance: [
					{
						label: "Principal",
						value: `$${detail.listing.principal.toLocaleString()}`,
					},
					{
						label: "Interest Rate",
						value: `${detail.listing.interestRate}%`,
					},
					{ label: "LTV", value: `${detail.listing.ltvRatio}%` },
					{ label: "Term", value: `${detail.listing.termMonths} months` },
				],
				keyFinancials: [
					{
						label: "Monthly Payment",
						value: `$${detail.listing.monthlyPayment.toLocaleString()}`,
						note: detail.listing.paymentFrequency,
					},
				],
				appraisal: {
					asIs: {
						label: "Current valuation",
						value: "Use listing appraisal data",
						note: "Projected from canonical listing sources",
					},
					asIf: {
						label: "Upside case",
						value: "Read only",
						note: "No transaction controls in this release",
					},
				},
				comparables: { asIs: [], asIf: [] },
				borrowerSignals: {
					grade: "Read only",
					score: "N/A",
					subtitle: "Projected borrower signal summary",
					note: "No interactive underwriting actions on this page",
					items: [],
				},
				paymentHistory: {
					onTimeRate: "N/A",
					lateCount: 0,
					missedCount: 0,
					months: [],
				},
				documents: detail.documents.map((document) => ({
					id: String(document.blueprintId),
					label: document.displayName,
					meta: document.description ?? "Public listing document",
					pageLabel: document.url ?? "Unavailable",
				})),
				investment: {
					availabilityLabel: "Available Fractions",
					availabilityValue: detail.investment.availableFractions,
					availableFractions: detail.investment.availableFractions,
					investorCountLabel: `${detail.investment.investorCount} investors`,
					projectedYield: `${detail.listing.interestRate}%`,
					totalFractions: detail.investment.totalFractions,
				},
				similarListings: [],
			}}
		/>
	);
}
```

- [ ] **Step 4: Add the production detail route with polished not-found handling**

```tsx
// src/routes/listings.$listingId.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { MarketplaceListingDetailPage } from "#/components/listings/MarketplaceListingDetailPage";
import { marketplaceListingDetailQueryOptions } from "#/components/listings/query-options";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/listings/$listingId")({
	beforeLoad: guardRouteAccess("listings"),
	loaderDeps: ({ params }) => ({ listingId: params.listingId }),
	loader: async ({ context, deps }) => {
		const detail = await context.queryClient.ensureQueryData(
			marketplaceListingDetailQueryOptions(deps.listingId)
		);
		if (!detail) {
			throw notFound();
		}
	},
	component: MarketplaceListingDetailRoute,
	notFoundComponent: MarketplaceListingNotFound,
});

function MarketplaceListingDetailRoute() {
	const { listingId } = Route.useParams();
	const { data } = useSuspenseQuery(
		marketplaceListingDetailQueryOptions(listingId)
	);

	if (!data) {
		throw notFound();
	}

	return <MarketplaceListingDetailPage detail={data} />;
}

function MarketplaceListingNotFound() {
	return (
		<div className="min-h-screen bg-[#FAFAF8] px-4 py-16 text-[#1F1F1B] sm:px-6">
			<div className="mx-auto max-w-2xl rounded-3xl border border-[#E7E5E4] bg-white px-8 py-10 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-full bg-[#F8EAEA] text-[#B42318]">
						<AlertCircle className="size-5" />
					</div>
					<div>
						<h1 className="font-semibold text-2xl tracking-tight">
							Unable to load listing
						</h1>
						<p className="mt-1 text-[#6B6B68] text-sm">
							We could not find a published marketplace listing for this id.
						</p>
					</div>
				</div>
				<Link
					className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E7E5E4] px-4 py-2 font-medium text-sm hover:bg-[#FBFAF8]"
					to="/listings"
				>
					<ArrowLeft className="size-4" />
					Back to Listings
				</Link>
			</div>
		</div>
	);
}
```

- [ ] **Step 5: Re-run the detail page test**

Run: `bun run test src/test/listings/marketplace-listing-detail-page.test.tsx`

Expected: PASS, with the detail page showing read-only investment information and no locking CTA or lawyer selector.

- [ ] **Step 6: Record the change**

```bash
gt modify -am "feat: add marketplace listing detail route"
```

## Task 8: Repoint Demo Wrappers, Add Verification Coverage, And Run The Final Sweep

**Files:**
- Modify: `src/routes/demo/listings/$listingid.tsx`
- Modify: `src/components/listings/index.ts`
- Modify: `convex/listings/publicDocuments.ts`
- Modify: `convex/listings/__tests__/marketplace.test.ts`
- Create: `src/test/listings/marketplace-listings-page.test.tsx`
- Create: `src/test/listings/marketplace-listing-detail-page.test.tsx`

- [ ] **Step 1: Repoint the demo detail route at the canonical detail shell**

```tsx
// src/routes/demo/listings/$listingid.tsx
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { ListingDetailPage } from "#/components/listings/ListingDetailPage";
import { getListingDetailMock } from "#/components/demo/listings/listing-detail-mock-data";
```

- [ ] **Step 2: Add the final backend regression assertions for public docs and read access**

```ts
it("allows any listing:view user to read public listing documents", async () => {
	const t = createHarness();
	const auth = listingViewer(t);
	const { listingId } = await seedListingWithPublicDocument(t);

	const documents = await auth.query(anyApi.listings.publicDocuments.listForListing, {
		listingId,
	});

	expect(documents).toHaveLength(1);
	expect(documents[0]?.displayName).toBe("Investor Summary");
});
```

- [ ] **Step 3: Run the focused test suite**

Run:

```bash
bun run test src/test/auth/route-guards.test.ts
bun run test convex/listings/__tests__/marketplace.test.ts
bun run test src/test/listings/marketplace-listings-page.test.tsx
bun run test src/test/listings/marketplace-listing-detail-page.test.tsx
```

Expected: PASS across route auth, backend marketplace queries, list page rendering, and read-only detail rendering.

- [ ] **Step 4: Run repository verification**

Run:

```bash
bun check
bun typecheck
bunx convex codegen
```

Expected:

- `bun check`: PASS with Biome formatting/linting clean
- `bun typecheck`: PASS with no TS errors
- `bunx convex codegen`: PASS with generated API/types updated

- [ ] **Step 5: Record the change**

```bash
gt modify -am "test: verify marketplace listings production surface"
```

## Self-Review

### Spec coverage

- `/listings` production route: covered in Tasks 1, 5, and 6.
- `/listings/$listingId` production detail route: covered in Tasks 4 and 7.
- `listing:view` route/backend authorization: covered in Tasks 1 and 3.
- Canonical `listings` read projection retained: covered in Tasks 2, 3, and 4.
- Demo UI promotion into `src/components/listings`: covered in Task 5.
- Rich backend-backed filter bar: covered in Tasks 2 and 3.
- Read-only detail page with accurate fraction availability and no transaction controls: covered in Task 7.
- Testing, typecheck, and codegen requirements: covered in Task 8.

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” markers remain.
- Every task names exact files.
- Every code-changing step includes a concrete code block or move command.
- Every verification step includes an exact command and expected result.

### Type consistency

- Route auth key is consistently named `listings`.
- Backend permission is consistently `listing:view`.
- Marketplace property classification is consistently `marketplacePropertyType`.
- Frontend search parser and query options both use `MarketplaceListingsSearchState`.
- Detail route and detail DTO both use `getMarketplaceListingDetail`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-marketplace-listings-production-surface.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
