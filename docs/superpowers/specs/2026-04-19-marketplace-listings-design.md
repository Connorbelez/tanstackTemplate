# Marketplace Listings Production Surface

Date: 2026-04-19
Status: Approved for implementation planning

## Summary

Implement a production-grade marketplace listings experience at `/listings` and `/listings/$listingId` by promoting the polished UI currently living under `src/components/demo/listings` into the canonical production listings module. The new surface is authenticated from day one and gated by `listing:view`, with existing admin override and FairLend staff admin behavior preserved through the current permission helpers.

The existing `listings` table remains the canonical read projection. This design does not introduce a second marketplace read store. Instead, it extends the listing query layer, improves frontend adapters, and upgrades the route/component architecture so the production marketplace uses the denormalized listing projection the way it was intended: as the primary lender-facing read model.

## Goals

- Ship a premium production `/listings` experience that matches or exceeds the current demo polish.
- Add a production `/listings/$listingId` route based on the demo detail surface, adapted to a read-only first release.
- Move listings UI ownership out of `src/components/demo/listings` and into `src/components/listings`.
- Keep the `listings` table as the source of truth for marketplace reads.
- Extend backend filters and read models so the production filter bar and map experience are fully backed by real data.
- Gate route and backend access with `listing:view`, not lender-only route namespaces.
- Preserve shareable URLs and predictable browser navigation by making `/listings` search params canonical.

## Non-Goals

- Do not implement fraction locking, reservation, checkout, or investment workflow mutations.
- Do not implement lawyer selection or any transaction-time control surfaces.
- Do not create a new read table or alternate marketplace projection outside the existing `listings` table.
- Do not block this work on subdomain routing. The route lives at `/listings` for now.
- Do not keep dead production buttons or inert workflow controls that imply unsupported actions.

## Product Decisions

- Route shape:
  - `/listings`
  - `/listings/$listingId`
- Access:
  - authenticated only
  - authorized by `listing:view`
  - existing admin override and FairLend staff admin semantics continue through current permission helpers
- Audience:
  - lender-facing marketplace surface
  - not nested under `/lender` because future entry will be subdomain-driven
- Scope:
  - day-one includes list, filters, responsive map, and premium read-only detail page
  - detail page keeps accurate available fractions and investment context, but no locking controls

## Existing State

Today the codebase has three relevant surfaces:

- `src/components/demo/listings`
  - Contains the polished listings and detail UI.
- `src/components/listings`
  - Contains placeholder production components that throw.
- `convex/listings/*`
  - Contains the canonical denormalized listing projection and several listing queries already backed by real data.

The implementation should converge these into one production-owned listings system instead of maintaining separate demo and production variants.

## Route And Authorization Design

### Frontend route ownership

Create production listings routes outside role-prefixed route namespaces:

- `src/routes/listings.tsx`
  - Marketplace index route for `/listings`
- `src/routes/listings.$listingId.tsx`
  - Marketplace detail route for `/listings/$listingId`

Deprecate the existing lender-specific listing routes over time:

- `src/routes/lender.listings.tsx`
- `src/routes/lender.listings.$listingId.tsx`

They can be removed or redirected after the new production routes are live and adopted.

### Route guard

Add a dedicated route authorization rule for listings in the existing auth helper system:

- key: `listings`
- requirement: `listing:view`

The `/listings` routes should use the same permission-driven pattern already used elsewhere in the app so route access stays structural and reusable.

### Backend query auth

Backend listing reads for the marketplace must align to the same permission contract as the route:

- use `authedQuery.use(requirePermission("listing:view"))` or an equivalent shared builder
- do not keep lender-only marketplace reads that reject other authorized viewers such as admins with `listing:view`

This is especially important for listing public document reads, which are currently lender-scoped and should be aligned to the marketplace permission contract.

## Component And Module Architecture

`src/components/listings` becomes the canonical production home for marketplace UI. The demo directory stops owning the real implementation.

### Canonical production module

Move and reorganize the promoted listings UI into `src/components/listings` with three layers:

- `ui`
  - Pure presentational pieces promoted from the demo implementation.
- `model`
  - Types, mapping functions, formatting helpers, and DTO adapters from Convex query responses into UI view models.
- `features`
  - Page orchestration, route-aware hooks, search-param synchronization, and data-loading composition.

Suggested structure:

```text
src/components/listings/
  cards/
  detail/
  filters/
  map/
  model/
  hooks/
  index.ts
```

Exact folder names can vary, but the production module must own:

- listings index shell
- filter bar and filter modal
- listing cards
- responsive map integration
- detail page sections
- supporting hooks and types

### Demo integration after migration

The demo routes may continue to exist, but they should become thin wrappers around the canonical production listings UI plus mock adapters. The demo directory should only keep mock data or demo-only route wrappers if still needed.

### Placeholder removal

Replace the placeholder exports in `src/components/listings` rather than leaving two parallel systems in the repo. There should be one canonical listings UI path after this migration.

## Canonical Data Model Positioning

The `listings` table remains the canonical marketplace read projection.

This table is already denormalized for read-heavy listing surfaces and already includes most of the domain information the marketplace needs:

- title and description
- curated `marketplaceCopy`
- hero images
- mortgage economics
- location fields and approximate coordinates
- appraisal summary fields
- projected borrower and payment summary blobs
- public document cache
- lifecycle state
- engagement fields such as `viewCount`

The design therefore adds:

- better queries
- better typed DTOs
- better frontend adapters

It does not add a second read store.

## Backend Query And DTO Design

The production marketplace should not bind React directly to raw `Doc<"listings">` records. Instead, the backend should expose marketplace-specific DTOs derived from the existing denormalized listing projection.

### Required queries

Create or refactor toward a dedicated marketplace query surface:

- `listMarketplaceListings`
  - paginated card/map query for `/listings`
- `getMarketplaceListingDetail`
  - detail query for `/listings/$listingId`
- `listMarketplaceDocuments`
  - if kept separate, align it to the same `listing:view` permission contract

Existing lower-level listing queries can remain as implementation helpers if useful.

### Marketplace list DTO

Each listing row returned to `/listings` should already be UI-ready:

- listing id
- slug if available
- title
- summary excerpt
- curated marketplace copy excerpt when appropriate
- primary hero image URL
- privacy-safe location label
- approximate map coordinates
- principal
- interest rate
- LTV
- maturity date
- property display label
- mortgage display label derived from `lienPosition`
- availability snapshot
- ownership bar percentages for available, locked, and sold display
- featured and display-order metadata if the client needs it

The client should not be responsible for reconstructing business-facing listing semantics from raw storage ids and low-level projection fields.

### Marketplace detail DTO

The detail query should return a read-only, section-oriented payload built on top of the canonical listing projection plus supporting related reads:

- header information
- hero image gallery URLs and captions
- executive summary
- at-a-glance metrics
- key financials
- investment snapshot with accurate available fractions
- appraisal and comparables
- borrower signal summary
- payment history summary
- public documents
- similar listings
- map display copy

This can be implemented as either one composed detail query or one primary detail query plus a very small number of supporting reads. The contract should feel cohesive to the page layer.

## Filter And Sort Design

The production page must support the richer filter bar from the promoted UI. The backend should own the authoritative filter semantics.

### Filters

Support at minimum:

- `searchQuery`
- `ltv` range
- `interestRate` range
- `principalAmount` range
- `maturityDate` range or end date cut-off
- `mortgageTypes[]`
- `propertyTypes[]`

The current backend already supports part of this set. It should be extended to cover the full production filter surface rather than trimming the UI back down.

### Search

Search should be listing-oriented and match at least:

- title
- city/province or location label
- curated marketplace copy where sensible

If a fully indexed text search is not available in the first pass, bounded filtering against the existing projection is acceptable so long as the query remains explicit about scan limits and failure modes.

### Mortgage type filter

The UI-level mortgage type filter should map from listing lien position:

- `First` -> `lienPosition = 1`
- `Second` -> `lienPosition = 2`
- `Other` -> `lienPosition >= 3`

This should be implemented as query semantics, not rederived separately in multiple client components.

### Property type filter

The current canonical `propertyType` field is intentionally coarse and should remain so for core domain logic. To support the richer marketplace filter surface without abusing the core property taxonomy, add a marketplace-facing classification layer on the existing listing projection.

Recommended shape:

- add a listing-level marketplace classification field such as `marketplacePropertyType`
- keep canonical coarse `propertyType` unchanged for the core mortgage/property domain
- allow origination curation or projection-time mapping to populate the marketplace-facing classification

This gives the marketplace room for labels such as:

- Detached Home
- Townhouse
- Condo
- Duplex
- Triplex
- Mixed-Use
- Commercial
- Other

without forcing those values into the underlying mortgage/property schema.

### Sorting

Default sort should be curated rather than purely chronological:

- featured first
- then explicit display order
- then recency or another deterministic fallback

User-selectable sort options should include the existing meaningful numeric fields where useful:

- newest / recently published
- interest rate
- LTV
- principal amount
- popularity or view count if retained

## URL State And Page Data Flow

For `/listings`, URL search params are the canonical representation of user intent.

### Search params should own

- search query
- selected filters
- selected sort
- map/list presentation mode where appropriate

### Benefits

- shareable filtered URLs
- browser back/forward correctness
- clean subdomain portability later
- predictable hydration and page reload behavior

### Ownership split

Backend owns:

- authoritative filtering
- authoritative sorting
- pagination
- availability payload shaping
- detail DTO composition

Frontend owns:

- search-param synchronization
- responsive layout state
- map drawer state
- local viewport-only filtering of already loaded items for map bounds

Viewport filtering is presentation-only and may remain client-side as a secondary refinement over already loaded results.

## List Page Experience

The production `/listings` page should preserve the high-end demo feel while using real data:

- polished filter bar
- responsive map integration
- premium card layout
- ownership and availability presentation
- mobile scroller behavior where it improves the experience

The map is a day-one feature, not an optional follow-up.

### Map requirements

- use the promoted Mapbox-based listings map
- support marker popups
- support responsive drawer behavior on mobile
- fail soft if the map token is absent by degrading to a list-first experience instead of breaking the page

### Empty state

When filters yield zero results:

- show a polished empty state
- offer clear-filter behavior
- do not render a blank or broken map/list shell

## Detail Page Experience

The production detail route should promote the demo detail experience into a premium read-only listing detail page.

### Keep

- hero image gallery
- map panel
- executive summary
- at-a-glance metrics
- key financials
- appraisal and comparables
- borrower and payment signal summaries
- public documents
- similar listings
- accurate available-fractions display

### Remove or replace

Remove the action-heavy checkout assumptions from the demo detail implementation:

- lawyer selection
- fraction quantity input
- lock CTA
- any copy implying immediate checkout or reservation

Replace the action area with a read-only investment snapshot card that presents:

- available fractions
- total fractions
- percentage sold
- investor count
- projected yield or equivalent read metric if supported

The page must not show fake buttons or dead controls.

### Not found

Missing or inaccessible listing ids should render a polished not-found state at `/listings/$listingId`.

## Error Handling And Resilience

The production surface should fail cleanly:

- unauthorized viewers are blocked at the route guard before page rendering
- missing map token degrades gracefully
- missing hero images fall back to placeholders
- public document URL failures degrade without collapsing the page
- missing listing ids render a not-found state
- empty search/filter combinations show an intentional empty state

## Frontend Migration Plan

### Move ownership

Promote the real listings UI out of:

- `src/components/demo/listings`

and into:

- `src/components/listings`

### Replace placeholders

Replace or delete the current placeholder production listings components:

- `ListingCard`
- `ListingGrid`
- `ListingFilters`
- `ListingMap`

The production surface should not keep duplicate placeholder and promoted implementations side by side.

### Keep demo routes thin

If demo routes remain, they should depend on the canonical production listings components plus mock data instead of owning a second implementation.

## Testing Strategy

This work requires more than a visual smoke test.

### Convex tests

Add or expand tests for:

- `listing:view` authorization behavior
- filter combinations
- mortgage-type mapping
- marketplace property-type behavior
- curated default sort
- pagination
- detail DTO composition
- availability derivation from ledger positions
- listing public document reads aligned to `listing:view`

### Frontend tests

Add route and component coverage for:

- `/listings` loading state
- `/listings` unauthorized state
- `/listings` empty-filter state
- filter to search-param synchronization
- `/listings/$listingId` loading state
- `/listings/$listingId` not-found state
- read-only detail rendering without workflow controls

### Adapter tests

Add focused tests around projection-to-UI mapping:

- hero image fallbacks
- property and mortgage display labels
- availability summary formatting
- similar listing DTO mapping

## Migration Discipline And Guardrails

The implementation should follow these constraints:

- no second marketplace read table
- no production route importing its core implementation from a `demo` directory
- no fake or inert production transaction controls
- no duplicate listings UI systems left to drift
- no ad hoc client-side business filtering that diverges from backend semantics

## Expected Outcome

After implementation, FairLend will have:

- a production marketplace index at `/listings`
- a production read-only detail page at `/listings/$listingId`
- listings UI owned by `src/components/listings`
- real backend-backed filters, map, and detail composition
- access controlled by `listing:view`
- continued reliance on the denormalized `listings` projection as the marketplace read model

This provides the correct foundation for future subdomain-based entry, later investment workflows, and further marketplace merchandising without requiring a second architectural reset.
