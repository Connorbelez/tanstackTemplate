
# SPEC HEADER

- **Spec number:** 1
- **Exact title:** Origination case scaffold and UI skeleton
- **Recommended filename:** `phase-01-origination-case-scaffold-ui-skeleton.md`
- **Primary objective:** Create the admin origination workspace, draft persistence, validation, step navigation, and review shell without committing any canonical borrower, property, mortgage, listing, payment, or document domain rows.
- **Why this phase exists:** Every later phase depends on a stable staging aggregate and a stable seven-step UI shell. If the draft model, route contract, and autosave semantics are not locked first, later worktrees will collide on route shape, field naming, and per-step persistence.
- **Why this phase is separately parallelizable:** This phase owns only the backoffice staging layer and the base admin UI shell. It does not implement borrower provisioning, mortgage creation, listing projection, payment bootstrap, Rotessa activation, deal packages, or signing.

# PHASE OWNERSHIP

## What this phase owns

- The `adminOriginationCases` staging aggregate.
- The existence of the `originationCaseDocumentDrafts` table as an empty, non-semantic placeholder that later phases can populate.
- `/admin/originations`, `/admin/originations/new`, and `/admin/originations/$caseId` route registration and shell structure.
- The seven-step workflow shell:
  1. Participants
  2. Property + valuation
  3. Mortgage terms
  4. Collections
  5. Documents
  6. Listing curation
  7. Review + commit
- Step-local autosave, case loading, case updates, validation plumbing, and review-summary rendering.
- The base `mortgage:originate` authorization gate for the origination workflow route family.

## What this phase may touch but does not own

- Admin-shell route registration and entity-shell integration points.
- Shared page chrome that later phases extend on mortgage detail, listing detail, and deal pages.
- The case schema in the central Convex schema file, but only for fields needed by draft persistence.
- The collections and documents draft subdocuments only as storage placeholders; phase 5 owns collection-status semantics and phase 6 owns document-authoring semantics.

## What this phase must not redesign

- The canonical mortgage constructor boundary owned by phase 2.
- Listing projection semantics owned by phase 3.
- Payment bootstrap semantics owned by phase 4.
- Immediate provider-managed activation semantics owned by phase 5.
- Mortgage document blueprint semantics owned by phase 6.
- Deal package, signature, or archive semantics owned by phases 7–9.

## Upstream prerequisites

- None beyond the existing repo, current admin-shell migration direction, and current permission catalog.

## Downstream dependents

- Phase 2 depends on the case payload shape and commit-entry surface.
- Phase 5 depends on stable collections-draft storage.
- Phase 6 depends on stable document-draft storage and documents-step shell.
- Every later phase depends on stable route paths, step names, and case identifiers.

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

This phase is the implementation of the master spec’s “Phase 1 — Origination case scaffold and UI skeleton.” The master spec is explicit that the workflow shell must exist before commit logic, that step navigation must be persistent, that draft data must autosave to `adminOriginationCases`, and that refreshing the page must restore the draft exactly. The master spec also explicitly says that this phase must create **zero canonical domain rows**. The route family and the step ordering are already dictated by the spec and must not be reinterpreted.

One conservative ambiguity resolution is necessary here. The retrieved master-spec snippets described the behavior of `adminOriginationCases` in detail but did not expose a single full interface block for the table. This spec therefore defines the **minimum** persisted case shape implied by the master spec. That is an additive resolution, not an architectural change.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Add `adminOriginationCases`.
- Add CRUD/query mutations and queries for case drafts.
- Add per-step validation plumbing and autosave.
- Add an empty `originationCaseDocumentDrafts` table that only establishes the relationship to `adminOriginationCases`; later phases own the semantic fields and attachment rules.
- Add the route family:
  - `/admin/originations`
  - `/admin/originations/new`
  - `/admin/originations/$caseId`
- Render the seven-step workflow shell.
- Persist each step’s data to the case record.
- Render a review page that summarizes the staged data currently stored on the case.
- Preserve unknown/additive fields during case patching so later phases can extend the case without phase 1 overwriting their data.
- Gate the route family behind `mortgage:originate`.
- Prefer the registry-driven admin shell / specialized operational-screen direction over the legacy `listEntityRows` path.
- Provide a reliable refresh/reload experience. A conservative implementation choice is to allocate the case record immediately when the user enters `/admin/originations/new`, then redirect to `/admin/originations/$caseId` so refresh and deep linking are stable.

# OUT-OF-SCOPE

- Creating or resolving `borrowers`.
- Looking up or provisioning `users` through WorkOS.
- Creating or reusing `properties`.
- Creating `mortgages`, `mortgageBorrowers`, `mortgageValuationSnapshots`, or any origination audit rows.
- Creating `listings`.
- Creating `obligations`, `collectionPlanEntries`, `collectionAttempts`, `transferRequests`, or external schedules.
- Any Rotessa API or recurring-schedule activation behavior.
- Any static document upload, template selection, blueprint creation, package creation, signature workflow, or signed artifact archive behavior.
- Any deal portal changes.
- Any broker deal-access expansion.
- Any final stakeholder-demo hardening.

# AUTHORITATIVE RULES AND INVARIANTS

- There MUST be one admin origination workflow.
- That workflow MUST stage data in backoffice and commit once.
- This phase MUST NOT create a side-channel “Create Borrower” button or “Create Listing” button for mortgage-backed flows.
- This phase MUST NOT create fake canonical rows just to make the UI feel complete.
- This phase MUST NOT create placeholder `borrowers`, `properties`, `mortgages`, `listings`, `obligations`, or `collectionPlanEntries`.
- This phase MUST NOT introduce a second route family that later phases would need to support.
- This phase MUST keep the step order fixed to the master spec’s seven steps.
- Draft updates MUST preserve additive unknown fields so later phases can merge safely.
- The workflow shell MUST target the new admin-shell direction, not the legacy empty-listing admin query path.
- The route family MUST be merge-safe for later phases to extend in place.
- V1 participant scope in this workflow is exactly one primary borrower plus up to two co-borrowers. Guarantors are out of scope and MUST be rejected by draft validation rather than staged optimistically.

# DOMAIN / DATA / CONTRACT CHANGES

## `adminOriginationCases` — conservative minimum persisted shape

The exact full type block was not visible in the retrieved snippets, so this phase MUST create at least the following persisted shape and MUST allow later phases to add fields additively without renaming these keys.

```ts
type AdminOriginationCaseStatus =
  | "draft"
  | "awaiting_identity_sync"
  | "committed";

interface AdminOriginationCase {
  createdByUserId: Id<"users">;
  updatedByUserId?: Id<"users">;

  orgId?: string;

  status: AdminOriginationCaseStatus;

  participants?: Array<{
    participantKey: "borrower_primary" | "borrower_co_1" | "borrower_co_2";
    role: "primary" | "co_borrower";
    coBorrowerOrdinal?: 1 | 2;
    existingBorrowerId?: Id<"borrowers">;
    fullName?: string;
    email?: string;
    phone?: string;
  }>;

  brokerOfRecordId?: Id<"brokers">;
  assignedBrokerId?: Id<"brokers">;

  propertyDraft?: {
    propertyId?: Id<"properties">;
    create?: {
      streetAddress?: string;
      unit?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      propertyType?: "residential" | "commercial" | "multi_unit" | "condo";
      approximateLatitude?: number;
      approximateLongitude?: number;
    };
  };

  valuationDraft?: {
    valueAsIs?: number;
    valuationDate?: string;
    relatedDocumentAssetId?: Id<"documentAssets">;
    visibilityHint?: "public" | "private";
  };

  mortgageDraft?: {
    principal?: number;
    interestRate?: number;
    rateType?: "fixed" | "variable";
    termMonths?: number;
    amortizationMonths?: number;
    paymentAmount?: number;
    paymentFrequency?: "monthly" | "bi_weekly" | "accelerated_bi_weekly" | "weekly";
    loanType?: "conventional" | "insured" | "high_ratio";
    lienPosition?: number;
    annualServicingRate?: number;
    interestAdjustmentDate?: string;
    termStartDate?: string;
    maturityDate?: string;
    firstPaymentDate?: string;
    fundedAt?: number;
    priorMortgageId?: Id<"mortgages">;
    isRenewal?: boolean;
  };

  collectionsDraft?: {
    mode?: "none" | "app_owned_only" | "provider_managed_now";
    providerCode?: "pad_rotessa";
    selectedBankAccountId?: Id<"bankAccounts">;
    // phase 5 extends this subdocument with activation status / error fields
  };

  listingOverrides?: {
    title?: string;
    description?: string;
    marketplaceCopy?: string;
    heroImages?: string[];
    featured?: boolean;
    displayOrder?: number;
    seoSlug?: string;
    adminNotes?: string;
  };

  validationSnapshot?: {
    stepErrors?: Record<string, string[]>;
    reviewWarnings?: string[];
  };

  committedMortgageId?: Id<"mortgages">;
  committedListingId?: Id<"listings">;
  committedAt?: number;

  createdAt: number;
  updatedAt: number;
}
```

### Rules for the case shape

- The field groups above MUST exist or be equivalently representable.
- Later phases MAY add fields inside those draft subdocuments, but they MUST NOT rename or repurpose them.
- The case record is a staging aggregate only. It is not canonical business truth.
- `participants` is an ordered draft list, not a nested role blob. The stable `participantKey` values are the v1 signatory/access contract for borrower participants.
- The workflow MUST enforce exactly one `borrower_primary`, zero to two co-borrowers, and no guarantors in v1.
- `status = "awaiting_identity_sync"` is reserved for phase 2’s borrower provisioning stop condition.
- `status = "committed"` is reserved for the post-commit state; the mortgage itself remains the canonical truth after commit.

## `originationCaseDocumentDrafts`

This phase only owns table existence, foreign-key relationship, timestamps, and any schema plumbing needed so phase 6 can safely extend it. This phase MUST NOT impose semantic document-class behavior yet.

# BACKEND WORK

- Add `convex/admin/origination/cases.ts`.
- Add case create/list/read/update/delete or archive-as-draft-safe mutations/queries.
- Add `convex/admin/origination/validators.ts`.
- Define stable case patch/update shapes so per-step autosave does not require later phases to rewrite the transport contract.
- Add the `adminOriginationCases` schema definition and any pragmatic indexes needed for route load and admin list view.
- Add the empty/base `originationCaseDocumentDrafts` schema definition.
- Implement route-safe case bootstrap:
  - entering `/admin/originations/new` MUST create a case or otherwise allocate a persistent case identity immediately;
  - the UI MUST then be able to reload from `/admin/originations/$caseId` without losing the draft.
- Preserve additive unknown fields when updating a case. Do not implement “replace whole case object” writes that would later erase collection/document subfields added by other phases.
- Store per-step validation output in a form the frontend can render per step and on the final review screen.

# FRONTEND / UI WORK

- Add `src/routes/admin/originations/route.tsx`, `new.tsx`, and `$caseId.tsx`.
- Add the shell components listed by the master spec’s recommended layout:
  - `OriginationStepper.tsx`
  - `ParticipantsStep.tsx`
  - `PropertyStep.tsx`
  - `MortgageTermsStep.tsx`
  - `CollectionsStep.tsx`
  - `DocumentsStep.tsx`
  - `ListingCurationStep.tsx`
  - `ReviewStep.tsx`
- Render a persistent stepper/sidebar that reflects current step, validation state, and save state.
- Autosave each step into the case record.
- Hydrate the page entirely from the case query so refresh restores the exact draft.
- Surface validation errors both in-step and in the final review summary.
- Render the documents step as an empty shell with the four future sections visible but non-functional if needed:
  1. Public static docs
  2. Private static docs
  3. Private templated non-signable docs
  4. Private templated signable docs
- Render the collections step as a draft-only UI shell. Phase 5 later owns actual activation-status semantics.
- Do not enable real commit logic yet.
- Do not fake linked borrower/property/mortgage/listing detail rows yet.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Existing admin-shell registry direction.
- Existing user/session auth and permission-check infrastructure.
- Existing broker, borrower, property, and mortgage types in the repo so the draft model can reference their IDs where needed.

## Outputs this phase guarantees

- A stable case ID and route shape.
- Stable draft subdocument keys: `participants`, `propertyDraft`, `valuationDraft`, `mortgageDraft`, `collectionsDraft`, and `listingOverrides`.
- A stable step identity and order.
- Stable autosave and validation APIs.
- A case status field that later phases can move to `awaiting_identity_sync` and `committed`.

## Contracts exported for later phases

- Case queries and mutations.
- Per-step update shapes.
- The documents-step shell and route space that phase 6 will extend.
- The collections-step shell and route space that phase 5 will extend.
- Review summary rendering that later phases will enrich with warnings and counts.

## Temporary compatibility bridges

- The empty `originationCaseDocumentDrafts` table exists now purely so phase 6 can extend it in place.
- The documents step can show placeholders, but must not imply uploaded assets or template selections exist yet.
- The collections step can store a selected mode, but must not attempt provider activation yet.

## Idempotency / retry / failure semantics

- Repeated autosave of the same step MUST be safe.
- Refresh during draft authoring MUST be safe.
- Concurrent browser tabs editing the same case should be last-write-wins unless the repo already has a conflict strategy; whatever strategy is chosen MUST preserve additive fields rather than wholesale replacement.
- Route bootstrap MUST be idempotent enough that refresh on `/admin/originations/new` does not leak duplicate abandoned cases uncontrollably.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/admin/origination/cases.ts`
  - `convex/admin/origination/validators.ts`
  - case-related schema definitions for `adminOriginationCases`
  - base schema definition for `originationCaseDocumentDrafts`
  - `src/routes/admin/originations/route.tsx`
  - `src/routes/admin/originations/new.tsx`
  - `src/routes/admin/originations/$caseId.tsx`
  - `src/components/admin/origination/OriginationStepper.tsx`
  - the seven step components as empty or draft-only shells
- **Shared but not owned**
  - central permission catalog
  - admin-shell registry files
  - central schema file where later phases add their own tables/fields
- **Later phases may extend but not redesign**
  - case draft subdocuments
  - review summary rendering
  - the documents and collections step bodies
  - the route-level shell and stepper

# ACCEPTANCE CRITERIA

- A user with `mortgage:originate` can open `/admin/originations/new`.
- A case record is created and can be revisited at `/admin/originations/$caseId`.
- Step navigation works across all seven steps.
- Draft data is autosaved per step.
- A full page refresh restores the exact stored draft.
- Validation errors render per step and on the review screen.
- No fake data or mock canonical domain rows are inserted.
- No real `borrowers`, `properties`, `mortgages`, `listings`, `obligations`, or plan entries exist merely because the user opened or edited a draft.
- This phase satisfies global acceptance criterion 1 and enables every later criterion.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Open `/admin/originations/new`.
2. Enter one primary borrower, optional co-borrowers, property, mortgage, collections, documents-shell, and listing draft data.
3. Refresh the page.
4. See the draft restored exactly.
5. Move between steps without losing data.
6. Confirm that no canonical borrower/property/mortgage/listing/payment rows have been created anywhere in admin.

# RISKS / EDGE CASES / FAILURE MODES

- Refresh loops or route bootstrap duplication can create abandoned draft cases. If immediate case creation on `/new` is used, make it easy to archive or ignore empty drafts later.
- Whole-object patch writes are a merge hazard because later phases add additive subfields. Use field-preserving updates.
- Validation schemas that over-constrain later-owned fields will block later phase integration. Keep phase 1 validation limited to fields actually rendered by phase 1.
- The documents step and collections step must be visually present but semantically inert enough that users are not misled into thinking real uploads or provider activation already exist.
- The shell must not bind itself to the legacy admin query path, or later listing/mortgage detail integration will conflict with the master spec.

# MERGE CONTRACT

After this phase is merged:

- The repo contains a stable `adminOriginationCases` staging aggregate and the `/admin/originations/*` route family.
- Later phase agents can safely assume that a case ID exists, the seven-step shell exists, and draft payloads are persisted.
- Later phase agents can extend `collectionsDraft`, `originationCaseDocumentDrafts`, and the review screen without renaming any route, step, or top-level case subdocument.
- No canonical domain writes happen yet.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not create canonical domain rows in this phase.
- Do not add a second origination route family.
- Do not invent a legacy-admin-query-driven implementation.
- Do not rename the seven steps.
- Do not implement fake commit success.
- Do not overwrite unknown later-phase fields during autosave.
