
# SPEC HEADER

- **Spec number:** 3
- **Exact title:** Listing projection and public-doc compatibility projection
- **Recommended filename:** `phase-03-listing-projection-and-public-doc-compatibility-projection.md`
- **Primary objective:** Implement the internal-only mortgage-backed listing projector and preserve listing-curated fields while overwriting projection-owned fields from canonical mortgage, property, valuation, and public-blueprint data.
- **Why this phase exists:** The master spec is explicit that a mortgage-backed listing is not an independently authored mortgage business object. The listing must be created and refreshed through a projector from the canonical mortgage aggregate, and the generic mortgage-backed listing create path must stop being a production entrypoint.
- **Why this phase is separately parallelizable:** This phase owns only listing projection semantics, internal-only creation path rules, projection-vs-curation overwrite behavior, and the compatibility cache for public docs. It does not own borrower resolution, payment bootstrap, provider-managed activation, blueprint authoring, package generation, or signing.

# PHASE OWNERSHIP

## What this phase owns

- `upsertMortgageListingProjection(mortgageId, overrides?)`.
- `syncListingPublicDocumentsProjection`.
- The overwrite/preserve contract for `listings`.
- The rule that mortgage-backed listing creation is internal-only and projector-driven.
- The narrowing/gating of `convex/listings/create.ts` for `mortgage_pipeline`.
- Listing-curation admin surfaces after projection.
- Mortgage-detail and listing-detail surfaces related to projected economics, property facts, appraisal summary, and curated fields.

## What this phase may touch but does not own

- The canonical constructor file owned by phase 2, only to append the listing projector and public-doc sync steps in the ordered extension region.
- The listing detail page’s public-doc section shell, which phase 6 later makes authoritative through blueprint-driven queries.
- The mortgage detail page shell owned by phase 2.

## What this phase must not redesign

- The core constructor source/provenance/idempotency semantics owned by phase 2.
- Payment bootstrap owned by phase 4.
- Document blueprint truth owned by phase 6.
- Deal-private document or signing behavior owned by phases 7–9.

## Upstream prerequisites

- Phase 2 canonical constructor and valuation snapshot table.

## Downstream dependents

- Phase 6 depends on the public-doc compatibility sync and listing linkage.
- Phase 9 depends on this phase for the “generic mortgage-backed listing create path is no longer a production authoring entrypoint” hardening requirement.
- All final UI surfaces depend on the projector to preserve curated fields correctly.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec explicitly rejects all of the following implementation shapes, and this phase MUST NOT accidentally reintroduce them:
- three disconnected CRUD forms that directly insert `borrowers`, `mortgages`, and `listings`;
- any standalone production “Create Borrower” path that bypasses origination for mortgage-backed flows;
- any production “Create Listing” path for mortgage-backed listings;
- any second mortgage constructor, admin-only mortgage type, or admin-only mortgage state machine;
- any attempt to extend `mortgage.machine.ts` with admin draft states;
- any direct recurring collection initiation through generic `pad_rotessa` transfer initiation;
- any direct listing ownership of mortgage origination documents;
- any live mutable template-group reference stored as the mortgage-side truth;
- any portal implementation that talks directly to Documenso;
- any lazy client-side generation of deal documents;
- any long-term document surface that mixes blueprint rows, raw generated docs, and raw storage IDs ad hoc instead of using the normalized package/instance model.

The master spec’s listing rules are highly specific:

- Mortgage-backed listings MUST be created and updated through:
  `upsertMortgageListingProjection(mortgageId: Id<"mortgages">, overrides?: ListingOverrides)`
- `listings.monthlyPayment` MUST be populated with `mortgage.paymentAmount` unchanged, despite the misleading legacy field name.
- UI rendering MUST always pair `monthlyPayment` with `paymentFrequency`.
- The projector MUST overwrite projection-owned fields every refresh.
- The projector MUST preserve curated listing-owned fields unless explicitly edited.
- The latest valuation summary MUST come from `mortgageValuationSnapshots`, not manually edited listing fields.
- `listings.publicDocumentIds` remains only a projection compatibility field until the listing detail page fully moves to blueprint-driven reads.
- `convex/listings/create.ts` MUST no longer be a production entrypoint for mortgage-backed listings.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Implement `upsertMortgageListingProjection`.
- Implement `syncListingPublicDocumentsProjection`.
- Create or update the listing row as a `dataSource = "mortgage_pipeline"` projection.
- Enforce one mortgage-backed listing per mortgage.
- Overwrite projection-owned fields on every refresh.
- Preserve curated fields on refresh unless the admin explicitly changes them.
- Source appraisal summary from the latest `mortgageValuationSnapshots` row.
- Populate the legacy `monthlyPayment` field exactly as `mortgage.paymentAmount` unchanged.
- Add the constructor hook that creates the draft listing projection during origination commit.
- Add the constructor hook that syncs `publicDocumentIds` compatibility values.
- Narrow or explicitly gate the generic listing create mutation so mortgage-backed production creation is internal-only.
- Add listing projection/admin display surfaces:
  - mortgage detail page shows linked listing,
  - listing detail/admin view renders projected economics/property/appraisal data,
  - listing-curated fields remain editable by admin after projection.

# OUT-OF-SCOPE

- Public blueprint query and signed-URL file access implementation; phase 6 owns the authoritative public-doc read path.
- Static or templated blueprint authoring.
- Obligation generation and collection-plan bootstrap.
- Provider-managed collection activation.
- Deal package generation.
- Signature provider, Documenso, embedded signing, or archive behavior.
- Broker deal-access expansion.

# AUTHORITATIVE RULES AND INVARIANTS

- Mortgage-backed listings are a projection/read model, not an independently authored mortgage business object.
- Marketplace curation remains listing-owned:
  - `title`
  - `description`
  - `marketplaceCopy`
  - `heroImages`
  - `featured`
  - `displayOrder`
  - `seoSlug`
  - publish/delist lifecycle and related curation fields
- Mortgage economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned.
- The projector MUST overwrite projection-owned fields every refresh.
- The projector MUST preserve curated fields unless explicitly edited by admin.
- The projector MUST use the latest valuation snapshot as appraisal truth.
- The projector MUST NOT derive a synthetic monthly-equivalent payment.
- `convex/listings/create.ts` MUST NOT remain the production creation path for mortgage-backed listings.
- `listings.publicDocumentIds` is compatibility cache only, not authoring truth.
- `listings.publicDocumentIds` MUST NEVER become the long-term client-facing file-access contract.
- Any public-doc compatibility reads that exist before phase 6 finishes the authoritative blueprint-driven path MUST run through lender-facing or `listing:view` / admin-preview guarded surfaces and return signed URLs or equivalent ephemeral handles, never raw `_storage` IDs.

# DOMAIN / DATA / CONTRACT CHANGES

## `upsertMortgageListingProjection`

```ts
upsertMortgageListingProjection(mortgageId: Id<"mortgages">, overrides?: ListingOverrides)
```

## Projection-owned fields that MUST be overwritten on refresh

- `mortgageId`
- `propertyId`
- `dataSource = "mortgage_pipeline"`
- `principal`
- `interestRate`
- `ltvRatio`
- `termMonths`
- `maturityDate`
- `monthlyPayment = mortgage.paymentAmount` unchanged
- `rateType`
- `paymentFrequency`
- `loanType`
- `lienPosition`
- `propertyType`
- `city`
- `province`
- `approximateLatitude`
- `approximateLongitude`
- `latestAppraisalValueAsIs`
- `latestAppraisalDate`
- `borrowerSignal`
- `paymentHistory`
- `publicDocumentIds`
- `updatedAt`

## Curated fields that MUST be preserved unless explicitly edited

- `title`
- `description`
- `marketplaceCopy`
- `heroImages`
- `featured`
- `displayOrder`
- `adminNotes`
- `seoSlug`
- `status`
- `publishedAt`
- `delistedAt`
- `delistReason`
- `viewCount`

## `monthlyPayment` rule

The legacy field name stays. This phase MUST populate `listings.monthlyPayment` with `mortgage.paymentAmount` unchanged. Every UI that displays it MUST also display the actual `paymentFrequency`. Do not normalize to a synthetic monthly number.

## `syncListingPublicDocumentsProjection`

This helper MUST patch `listings.publicDocumentIds` to the ordered active public blueprint IDs / asset IDs used by the current compatibility strategy. The listing row is not the authoring truth; this is a cache bridge for compatibility.

# BACKEND WORK

- Add `convex/listings/projection.ts`.
- Implement listing upsert logic that:
  - creates the listing row if it does not yet exist for the mortgage,
  - reuses and updates the existing row if it already exists,
  - preserves curated fields,
  - refreshes projection-owned fields from canonical mortgage/property/valuation records.
- Read the latest `mortgageValuationSnapshots` row when deriving appraisal summary.
- Append the projector call into `activateMortgageAggregate` after later-owned blueprint/payment hooks and before origination audit, preserving the master spec’s ordered step list.
- Append `syncListingPublicDocumentsProjection` after the projector or as part of the projector flow while keeping it conceptually separate as a compatibility bridge.
- Narrow or gate `convex/listings/create.ts` so `dataSource = "mortgage_pipeline"` mortgage-backed creation is no longer a production entrypoint.
- If this phase exposes any temporary public-doc compatibility read before phase 6 lands, keep it behind a lender-facing or `listing:view` / admin-preview guarded query surface and return only signed URLs / ephemeral handles.
- Keep the 1:1 mortgage invariant intact.

# FRONTEND / UI WORK

- Extend mortgage detail to show the linked listing.
- Extend listing detail/admin views so they render:
  - projected economics,
  - projected property facts,
  - appraisal summary from the latest valuation snapshot,
  - curated listing-owned fields.
- Provide admin editing for curated fields only.
- Do not let admin edit projection-owned economics/property/appraisal fields directly on the listing surface.
- Keep the listing in `draft` after origination unless a later explicit publish action changes it.
- Show clearly that the listing is linked to a mortgage-backed source.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Canonical mortgage row and property row from phase 2.
- `mortgageValuationSnapshots` from phase 2.
- `listingOverrides` from `adminOriginationCases`.

## Outputs this phase guarantees

- A mortgage-linked `mortgage_pipeline` listing row.
- A projector that can be rerun idempotently.
- A compatibility cache field `publicDocumentIds`.
- Internal-only creation semantics for mortgage-backed listings.

## Contracts exported for later phases

- `upsertMortgageListingProjection`
- `syncListingPublicDocumentsProjection`
- A stable overwrite/preserve field contract
- A listing detail/admin surface that later phases can enrich with authoritative public-doc reads

## Temporary compatibility bridges

- Until phase 6 lands, the public-doc section may still rely on `publicDocumentIds` compatibility data.
- Even during that temporary bridge, the UI must obtain files through permissioned query surfaces that return signed URLs or equivalent ephemeral handles rather than raw storage IDs.
- Phase 6 later becomes the authoritative blueprint-driven public-doc read path; this phase must not prevent that migration.
- If no public blueprints exist yet, `publicDocumentIds` MUST sync to empty, not stale values.

## Idempotency / retry / failure semantics

- The projector MUST be idempotent.
- Re-running projection MUST NOT duplicate listings.
- Re-running projection MUST NOT wipe curated fields.
- If projection fails, it must fail transparently; do not create a second listing to “recover.”

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/listings/projection.ts`
  - mortgage-backed create-path narrowing inside `convex/listings/create.ts`
  - listing-projection/admin UI surfaces
- **Shared but not owned**
  - `convex/mortgages/activateMortgageAggregate.ts`
  - listing detail public-doc file-access layer (phase 6 owns authoritative reads)
  - mortgage detail page shell
- **Later phases may extend but not redesign**
  - the listing detail page public-doc section
  - calls to `syncListingPublicDocumentsProjection`
  - mortgage detail linkage UI

# ACCEPTANCE CRITERIA

- Committing a mortgage produces exactly one linked `mortgage_pipeline` listing.
- The projector is idempotent.
- Projector refresh preserves curated fields.
- Projector refresh overwrites projection-owned fields from canonical rows.
- `monthlyPayment` equals `mortgage.paymentAmount` unchanged.
- Listing detail/admin surfaces render projected economics/property/appraisal data correctly.
- The generic mortgage-backed listing create path is no longer the production entrypoint.
- This phase satisfies global acceptance criterion 4 and a major part of criterion 18.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Commit a mortgage.
2. Open the linked listing.
3. See projected economics, property facts, appraisal summary, and curated listing fields.
4. Edit a curated field such as title or description.
5. Re-run projection indirectly (for example by refreshing or invoking the projector path after a related update).
6. Confirm that curated fields survive while projection-owned fields stay canonical.
7. Confirm that one mortgage still maps to exactly one listing.

# RISKS / EDGE CASES / FAILURE MODES

- The largest footgun is accidentally wiping curated fields on refresh. Preserve them explicitly.
- The second major footgun is accidentally treating `publicDocumentIds` as authoring truth. Keep it clearly as cache/compatibility only.
- The third major footgun is quietly reintroducing generic authenticated file access. Temporary public-doc compatibility reads still need explicit lender/admin permissions and signed URLs.
- The misleading `monthlyPayment` field name can lead developers to derive synthetic monthly values. Do not do that.
- If the generic listing create path remains open for mortgage-backed rows, the feature will violate a top-level acceptance criterion and invite duplicate-listing bugs.
- Appraisal data must come from the latest valuation snapshot, not from stale listing fields.

# MERGE CONTRACT

After this phase is merged:

- Mortgage-backed listing creation is projector-driven and internal-only.
- The repo has a stable `upsertMortgageListingProjection` contract that later phases can call without reinterpretation.
- The 1:1 mortgage-to-listing invariant remains intact.
- The compatibility bridge for `publicDocumentIds` exists and can later be fed by mortgage-owned public blueprints.
- No phase may revert mortgage-backed listing creation to the generic production authoring path.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not author mortgage economics directly on the listing.
- Do not derive a fake monthly-equivalent payment.
- Do not let `convex/listings/create.ts` stay the production path for mortgage-backed listings.
- Do not treat `publicDocumentIds` as long-term authoring truth.
- Do not expose listing public docs through a generic `authedQuery`-style surface or raw storage identifiers.
- Do not create duplicate listings for the same mortgage.
