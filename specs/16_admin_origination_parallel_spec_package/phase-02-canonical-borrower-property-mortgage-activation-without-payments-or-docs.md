
# SPEC HEADER

- **Spec number:** 2
- **Exact title:** Canonical borrower/property/mortgage activation without payments or docs
- **Recommended filename:** `phase-02-canonical-borrower-property-mortgage-activation-without-payments-or-docs.md`
- **Primary objective:** Implement the canonical borrower resolution path and the core mortgage activation constructor so an origination case can commit into real borrower, property, mortgage, valuation, and `mortgageBorrowers` rows.
- **Why this phase exists:** The master spec’s most important hard rule is that there MUST be one canonical mortgage activation constructor shared by admin origination now and application-package handoff later. This phase establishes that constructor and the WorkOS-backed borrower-resolution path before payments, listing projection, and documents plug into it.
- **Why this phase is separately parallelizable:** This phase owns the aggregate-construction boundary, provenance, idempotency, and borrower/property/mortgage writes. It does not own payment bootstrap, provider-managed activation, listing projection semantics, blueprint authoring semantics, package materialization, or Documenso.

# PHASE OWNERSHIP

## What this phase owns

- `resolveOrProvisionBorrowersForOrigination(caseId)` and the canonical borrower-resolution algorithm.
- Borrower provenance field additions.
- Mortgage provenance field additions and the workflow-source idempotency index.
- `mortgageValuationSnapshots`.
- The core `activateMortgageAggregate` constructor contract and implementation steps:
  - source/idempotency validation,
  - property create/reuse,
  - valuation snapshot insertion,
  - mortgage insertion in canonical initial servicing shape,
  - `mortgageBorrowers` insertion,
  - ownership-ledger genesis primitive invocation,
  - origination audit.
- The base commit mutation that turns an `adminOriginationCase` into canonical rows.
- Commit progress UX and post-commit redirect to mortgage detail.

## What this phase may touch but does not own

- The phase 1 case schema and route shell.
- The `activateMortgageAggregate` file region where later phases add:
  - blueprint creation (phase 6),
  - payment bootstrap (phase 4),
  - listing projection and listing public-doc sync (phase 3).
- Mortgage detail page sections that later phases extend.
- The documents and collections draft subdocuments only insofar as the commit mutation reads them and passes IDs/options to later-owned hooks.

## What this phase must not redesign

- Listing projection contract owned by phase 3.
- Payment bootstrap semantics owned by phase 4.
- Immediate provider-managed activation semantics owned by phase 5.
- Mortgage blueprint / document package / signature semantics owned by phases 6–9.
- The one-workflow shell owned by phase 1.

## Upstream prerequisites

- Phase 1 case persistence, route shell, and step payloads.

## Downstream dependents

- Phase 3 extends the constructor with listing projection calls.
- Phase 4 extends the constructor with payment bootstrap calls.
- Phase 5 depends on the commit path and primary-borrower identity.
- Phase 6 extends the constructor with blueprint creation.
- Phase 7 depends on canonical borrower/mortgage/property data, valuation snapshots, and broker/participant associations.
- Phase 9 depends on this phase for the core “normal canonical mortgage row” acceptance criterion.

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

This phase implements the master spec’s canonical borrower-resolution path and canonical mortgage activation constructor. The master spec is explicit about the following:

- Borrower handling MUST resolve/provision WorkOS-backed identity first and MUST NOT write `users` rows directly in Convex.
- Cross-org borrower reuse MUST fail closed.
- Duplicate borrower rows for the same `userId` in the same org are forbidden.
- The mortgage constructor MUST be idempotent by workflow source.
- The mortgage MUST be inserted directly in `active` with the canonical servicing snapshot:
  - `status = "active"`
  - `machineContext = { missedPayments: 0, lastPaymentAt: 0 }`
  - `lastTransitionAt = createdAt`
  - `collectionExecutionMode = "app_owned"`
  - `collectionExecutionProviderCode = undefined`
  - `activeExternalCollectionScheduleId = undefined`
  - `collectionExecutionUpdatedAt = createdAt`
- The constructor MUST insert `mortgageBorrowers` with exactly one primary borrower.
- The constructor MUST call the existing ownership-ledger genesis primitive.
- The constructor MUST write an origination audit record instead of faking a GT transition.

The master spec’s full end-state `ActivateMortgageAggregateResult` also includes fields that later phases populate (`listingId`, obligation/plan-entry IDs, schedule-rule warning, blueprint counts). This phase owns the canonical constructor contract and therefore MUST lock those names now even though phases 3, 4, and 6 fill some of them later.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Implement `resolveOrProvisionBorrowersForOrigination`.
- Extend `borrowers` with provenance fields.
- Extend `mortgages` with provenance fields and a workflow-source idempotency index.
- Add `mortgageValuationSnapshots`.
- Define `MortgageActivationSource`, `ActivateMortgageAggregateInput`, and `ActivateMortgageAggregateResult`.
- Implement the core `activateMortgageAggregate` constructor.
- Resolve or create the property row.
- Insert the valuation snapshot.
- Insert the mortgage row directly in canonical initial servicing shape.
- Insert `mortgageBorrowers`.
- Invoke the ownership-ledger genesis primitive required by the marketplace/ownership domain.
- Write origination audit.
- Enable real Commit in the admin workflow.
- Add commit progress states and redirect to a real mortgage detail page.
- Expose linked borrower/property identities on the success surface.
- Introduce the `awaiting_identity_sync` stop condition when WorkOS provisioning has been initiated but the synced `users` row does not yet exist.

# OUT-OF-SCOPE

- Listing projection implementation or listing create-path gating.
- Public-doc compatibility sync.
- Obligation generation or collection-plan bootstrap.
- Any collection attempt, transfer request, or provider activation behavior.
- Document asset upload, template selection, blueprint creation, deal package creation, signature envelopes, embedded signing, or signed archive.
- Final broker deal-access expansion.
- Final deprecated-path cleanup beyond local constructor-specific bans.

# AUTHORITATIVE RULES AND INVARIANTS

- There MUST be one canonical mortgage activation constructor.
- `adminOriginationCase -> Mortgage` and `ApplicationPackage -> Mortgage` MUST converge on the same constructor contract.
- Borrower resolution MUST:
  - look up `users` by email,
  - provision/invite via WorkOS when needed,
  - stop at `awaiting_identity_sync` if provisioning has not yet materialized a synced `users` row,
  - reuse an existing borrower for the same `userId` and org when present,
  - create a borrower only after a real `users` row exists.
- The implementation MUST NOT write `users` rows directly in Convex.
- The implementation MUST fail closed on cross-org borrower reuse.
- The implementation MUST NOT create duplicate borrower rows for the same `userId` within the same org.
- The mortgage MUST be inserted directly in `active`.
- The implementation MUST NOT add admin draft states into `mortgage.machine.ts`.
- The implementation MUST NOT fake a GT transition on a non-existent mortgage.
- The constructor MUST be idempotent by workflow source.
- The constructor MUST call the ownership-ledger genesis primitive.
- This phase MUST preserve extension seams for phases 3, 4, and 6 instead of forcing later phases to rewrite the constructor from scratch.

# DOMAIN / DATA / CONTRACT CHANGES

## Borrower provenance fields

```ts
type CreationSource = "application" | "admin" | "import" | "api" | "seed";
type OriginatingWorkflowType = "applicationPackage" | "adminOriginationCase" | "importJob" | "seed";

extend borrowers with:
- creationSource?: CreationSource
- originatingWorkflowType?: OriginatingWorkflowType
- originatingWorkflowId?: string
```

## Mortgage provenance fields and idempotency index

```ts
type CreationSource = "application" | "admin" | "import" | "api" | "seed";
type OriginationPath = "standard" | "admin_direct" | "legacy_import" | "api" | "seed";
type OriginatingWorkflowType = "applicationPackage" | "adminOriginationCase" | "importJob" | "seed";

extend mortgages with:
- creationSource?: CreationSource
- originationPath?: OriginationPath
- originatingWorkflowType?: OriginatingWorkflowType
- originatingWorkflowId?: string
- originatedByUserId?: Id<"users">
```

Add an index that makes the constructor idempotent on workflow source.

## `mortgageValuationSnapshots`

```ts
interface MortgageValuationSnapshot {
  mortgageId: Id<"mortgages">;
  source: "admin_origination" | "underwriting" | "appraisal_import";
  valueAsIs: number; // cents
  valuationDate: string; // YYYY-MM-DD
  relatedDocumentAssetId?: Id<"documentAssets">;
  createdByUserId: Id<"users">;
  createdAt: number;
}
```

## Canonical activation source / input / result contract

```ts
interface MortgageActivationSource {
  creationSource: "application" | "admin" | "import" | "api";
  originationPath: "standard" | "admin_direct" | "legacy_import" | "api";
  originatingWorkflowType: "applicationPackage" | "adminOriginationCase" | "importJob";
  originatingWorkflowId: string;
  actorUserId?: Id<"users">;
}

interface ActivateMortgageAggregateInput {
  source: MortgageActivationSource;

  orgId?: string;

  brokerOfRecordId: Id<"brokers">;
  assignedBrokerId?: Id<"brokers">;

  participants: Array<{
    borrowerId: Id<"borrowers">;
    role: "primary" | "co_borrower" | "guarantor";
  }>;

  property: {
    propertyId?: Id<"properties">;
    create?: {
      streetAddress: string;
      unit?: string;
      city: string;
      province: string;
      postalCode: string;
      propertyType: "residential" | "commercial" | "multi_unit" | "condo";
      approximateLatitude?: number;
      approximateLongitude?: number;
    };
  };

  valuation: {
    valueAsIs: number;
    valuationDate: string;
    relatedDocumentAssetId?: Id<"documentAssets">;
  };

  mortgage: {
    principal: number;
    interestRate: number;
    rateType: "fixed" | "variable";
    termMonths: number;
    amortizationMonths: number;
    paymentAmount: number;
    paymentFrequency: "monthly" | "bi_weekly" | "accelerated_bi_weekly" | "weekly";
    loanType: "conventional" | "insured" | "high_ratio";
    lienPosition: number;
    annualServicingRate?: number;
    interestAdjustmentDate: string;
    termStartDate: string;
    maturityDate: string;
    firstPaymentDate: string;
    fundedAt?: number;
    priorMortgageId?: Id<"mortgages">;
    isRenewal?: boolean;
  };

  listingOverrides: AdminOriginationCase["listingOverrides"];

  documentDraftIds: Id<"originationCaseDocumentDrafts">[];
}

interface ActivateMortgageAggregateResult {
  borrowerIds: Id<"borrowers">[];
  primaryBorrowerId: Id<"borrowers">;
  propertyId: Id<"properties">;
  valuationSnapshotId: Id<"mortgageValuationSnapshots">;
  mortgageId: Id<"mortgages">;
  listingId: Id<"listings">;
  createdObligationIds: Id<"obligations">[];
  createdPlanEntryIds: Id<"collectionPlanEntries">[];
  scheduleRuleMissing: boolean;
  publicBlueprintCount: number;
  dealBlueprintCount: number;
}
```

### Important constructor-contract note for isolated parallel worktrees

The final merged contract above is authoritative. Phase 2 owns the contract names and the core constructor. Phases 3, 4, and 6 later fill `listingId`, `createdObligationIds`, `createdPlanEntryIds`, `scheduleRuleMissing`, `publicBlueprintCount`, and `dealBlueprintCount` through owned helper calls. Phase 2 MUST lock those names now and structure the file so later phases can add their owned calls without redefining the constructor.

# BACKEND WORK

## 1. Borrower resolution helper

Implement `convex/borrowers/resolveOrProvisionForOrigination.ts` with this algorithm:

1. For each participant in the case:
   - if `existingBorrowerId` is present:
     - load the borrower,
     - validate org compatibility,
     - validate any broker/org constraints the repo already enforces,
     - reuse it.
2. Otherwise:
   - look up `users` by email,
   - if no `users` row exists, provision/invite via WorkOS,
   - do **not** insert into `users` directly.
3. If provisioning has been initiated but the synced `users` row is still absent:
   - patch the case to `status = "awaiting_identity_sync"`,
   - stop before any property, mortgage, payment, listing, or document canonical writes occur.
4. Once a `users` row exists:
   - look for an existing borrower by `userId` and org,
   - if found, reuse it,
   - else create a borrower row linked to that `userId` in the correct org with a borrower-domain status valid for immediate mortgage origination.

## 2. Canonical activation constructor

Create `convex/mortgages/activateMortgageAggregate.ts` and implement these steps atomically:

1. Validate source and idempotency.
   - Check the workflow-source uniqueness index.
   - If the workflow already produced a mortgage, return the existing aggregate result.
2. Resolve or create property.
3. Insert `mortgageValuationSnapshot`.
4. Insert the mortgage row directly in canonical initial servicing shape.
5. Insert `mortgageBorrowers` with exactly one primary borrower.
6. Invoke the ownership-ledger genesis primitive required by the ownership domain.
7. Reserve extension seams for later phases in this exact order:
   - phase 6 blueprint creation,
   - phase 4 payment bootstrap,
   - phase 3 listing projection,
   - phase 3 listing public-doc compatibility sync.
8. Write origination audit.

### Mortgage row initialization requirements

The inserted mortgage row MUST include:

- `status = "active"`
- `machineContext = { missedPayments: 0, lastPaymentAt: 0 }`
- `lastTransitionAt = createdAt`
- `collectionExecutionMode = "app_owned"`
- `collectionExecutionProviderCode = undefined`
- `activeExternalCollectionScheduleId = undefined`
- `collectionExecutionUpdatedAt = createdAt`
- all canonical terms and dates from `ActivateMortgageAggregateInput.mortgage`
- provenance fields from `source`

## 3. Commit mutation

Create `convex/admin/origination/commit.ts` (or equivalent owner file) that:

- loads the case,
- validates the case is sufficiently complete for commit,
- calls `resolveOrProvisionBorrowersForOrigination`,
- stops cleanly at `awaiting_identity_sync` if user provisioning has not yet materialized,
- builds the constructor input from the case,
- calls `activateMortgageAggregate`,
- patches the case to `committed`,
- records `committedMortgageId`,
- redirects the UI to mortgage detail on success.

Do not create side-channel write paths that bypass the constructor.

## 4. Origination audit

Use the repo’s existing audit/journal conventions to record:

- source workflow,
- actor user,
- borrower IDs,
- property ID,
- mortgage ID,
- listing ID when later phases add it,
- initial status `active`,
- origin path `admin_direct`.

The exact table name is repo-specific; the behavioral requirement is not.

# FRONTEND / UI WORK

- Enable the Commit action in the phase 1 workflow.
- Surface commit progress states:
  - validating,
  - awaiting identity sync,
  - committing,
  - committed,
  - failed.
- On success, redirect to the real mortgage detail page.
- Show the linked borrower and property identities on the success surface / destination page.
- Add explicit “identity pending” UX if the commit was stopped because WorkOS provisioning was initiated but the synced user has not yet landed.
- Extend the mortgage detail page with at least the base sections this phase owns or enables:
  - Summary
  - Borrowers
  - Audit
  - placeholders for Payment setup / Listing projection / Documents that later phases extend

# ADDITIVE UI / UX DESIGN, CORE FLOWS, AND ASCII MOCKUPS

## Dashboard-shell integration requirements for this phase

All admin-facing surfaces added or modified by this phase MUST stay inside the existing dashboard shell:

- global sidebar remains unchanged,
- top header row contains breadcrumbs,
- page-specific title, status, and actions live in the shell header region,
- commit progress, pending-identity states, and mortgage detail sections appear inside the content area.

This phase MUST NOT open a parallel standalone post-commit app. The mortgage detail page should feel like a normal dashboard entity screen, not like a special origination-only destination.

Recommended breadcrumb patterns:

- review/commit screen: `Admin / Originations / Case {caseId} / Review`
- mortgage detail: `Admin / Mortgages / {mortgageId}`

## UI surfaces owned or materially changed by this phase

### 1. Review-step commit surface

Phase 1 already created the review page shape. This phase enables the real primary action. The review screen SHOULD keep the same shell and add a commit control block near the top-right or bottom-right of the review body.

Required visible states:

- `validating`
- `awaiting_identity_sync`
- `committing`
- `committed`
- `failed`

The UI MUST make these states legible to an operator and MUST NOT collapse everything into a single generic spinner.

Recommended commit panel layout:

- primary action: `Commit origination`,
- secondary explanatory copy,
- compact status timeline or step chips,
- failure banner region,
- last attempt timestamp and retry guidance if relevant.

ASCII mockup:

```text
┌────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Admin              │ Breadcrumbs: Admin / Originations / Case ORG-1042 / Review             │
│ Mortgages          │ Review and commit                      [Commit origination]            │
│ Listings           │ [Draft] [Saved]                                                        │
│ Deals              │ ───────────────────────────────────────────────────────────────────────│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Checklist          Status                                           ││
│                    │ │ Participants   ✓   validating                                       ││
│                    │ │ Property       ✓   resolving                                        ││
│                    │ │ Terms          ✓   committing                                       ││
│                    │ │ Collections    ✓/optional                                           ││
│                    │ │ Documents      shell/optional                                       ││
│                    │ │ Listing        ✓                                                    ││
│                    │ │ (failure banner area if needed)                                     ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │                                                                        │
│                    │                        [Back]  [Commit origination]                    │
└────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

### 2. Identity-pending stop state

If WorkOS provisioning has been initiated but the synced `users` row is not yet present, the operator MUST remain in the origination shell and receive a clear non-destructive state.

This is not a generic failure. It is a specific stop condition.

Recommended treatment:

- page header chip changes from `Draft` to `Awaiting identity sync`,
- full-width informational banner above the review summary,
- precise explanation that no canonical borrower/property/mortgage/listing/payment/document writes have occurred yet,
- `Refresh status` or `Retry commit` action,
- optional read-only preview of which participant emails are still waiting on identity sync.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Awaiting identity sync                                                                      │
│ Invitations/provisioning have been initiated, but one or more synced user                   │
│ records do not exist yet. Canonical mortgage creation has not started.                      │
│                                    [Refresh status]  [Retry commit]                         │
│ Missing identities:                                                                         │
│ - jane@example.com (primary borrower)                                                       │
│ - coborrower@example.com (co-borrower)                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

The language MUST explicitly reassure the operator that the system stopped before canonical writes.

### 3. Mortgage detail destination

On successful commit, redirect to a real mortgage detail screen in the dashboard shell. This phase owns the minimum information architecture of that screen. Later phases extend it, but should not redesign its top-level structure.

Recommended header content:

- breadcrumbs,
- page title (`Mortgage {shortId}` or existing repo title format),
- status chip `Active`,
- optional provenance chip such as `Originated via admin`,
- quick metadata row:
  - property address,
  - principal,
  - rate,
  - maturity date,
  - primary borrower.

Recommended body structure:

- Summary card,
- Borrowers card/table,
- Audit card/timeline,
- placeholder cards for:
  - Payment setup,
  - Listing,
  - Documents.

ASCII mockup:

```text
┌────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Admin              │ Breadcrumbs: Admin / Mortgages / M-2031                                │
│ Mortgages          │ Mortgage M-2031        [Active] [Admin origin]                         │
│ Listings           │ 12 King St, Toronto • $850k • 11.5% • matures 2027-06-01               │
│ Deals              │ ───────────────────────────────────────────────────────────────────────│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Summary: principal $850k; payment $8,500/mo                         ││
│                    │ │ Borrowers: Jane Doe (primary), Alex Doe (co)                        ││
│                    │ │ Audit: created via admin · actor ops@…                              ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Payment setup — placeholder (phase 4)                               ││
│                    │ │ Listing — placeholder (phase 3)                                     ││
│                    │ │ Documents — placeholder (phase 6)                                   ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

## Mortgage detail information-architecture rules

- Summary fields owned by this phase MUST be read-only and sourced from canonical rows.
- Borrowers section SHOULD distinguish primary borrower from co-borrowers and guarantors.
- Audit section SHOULD expose origination source and actor in a way operators can inspect without digging through raw logs.
- Payment, Listing, and Documents sections SHOULD exist as stable anchors/cards even before later phases fill them. This preserves merge safety and reduces layout churn across branches.

## Core UI flows the implementation MUST support

### Flow A — successful commit

1. Operator completes the review step.
2. Clicks `Commit origination`.
3. UI shows `validating`, then `committing`.
4. On success, the review screen transitions immediately to redirect state.
5. User lands on the mortgage detail page and sees canonical summary/borrower/audit data.

### Flow B — identity-pending stop

1. Operator clicks `Commit origination`.
2. Backend initiates identity provisioning but cannot yet resolve one or more synced `users` rows.
3. UI lands in `awaiting_identity_sync`.
4. Review data remains intact.
5. Operator can safely refresh or retry later without duplicate canonical rows.

### Flow C — commit failure after canonical writes start

1. Operator clicks `Commit origination`.
2. Commit progresses into canonical write territory.
3. Failure occurs.
4. UI surfaces explicit failure state and MUST NOT claim the mortgage was definitely not created.
5. Failure region SHOULD include the known canonical mortgage ID when available, or at minimum instruct the operator to inspect audit/details rather than re-enter all data blindly.

## UX and interaction rules

- Keep commit affordance singular. There should be one obvious primary button, not multiple competing submit buttons.
- Do not hide `awaiting_identity_sync` inside a generic toast only. It deserves a durable inline state.
- Do not represent the mortgage detail screen as a confirmation modal. Use a normal entity page route.
- During `committing`, disable repeat commit actions and step-editing actions that would create ambiguity about the in-flight payload.
- Preserve the ability to navigate back to the origination case when commit fails or awaits identity sync.
- The audit card SHOULD use operator-friendly labels (`Created from admin origination case`, `Actor`, `Source workflow`) instead of raw enum dumps where possible.

## Merge-safe UI ownership notes

Later phases extend the surface areas established here:

- phase 3 enriches the `Listing` section,
- phases 4 and 5 enrich the `Payment setup` section,
- phase 6 enriches the `Documents` section.

This phase therefore SHOULD establish stable card anchors, route names, and header structure now.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Stable case payloads from phase 1.
- Existing broker, borrower, property, mortgage, and ownership-domain infrastructure in the repo.
- Existing WorkOS provisioning/invitation path or equivalent identity-sync mechanism.
- Existing GT transition system for post-creation servicing transitions.

## Outputs this phase guarantees

- A canonical borrower-resolution helper.
- A canonical activation constructor and stable source/input/result contract.
- Real borrower/property/mortgage/valuation/`mortgageBorrowers` rows.
- Mortgage provenance fields and idempotent workflow-source lookup.
- A real mortgage detail destination.

## Contracts exported for later phases

- `ActivateMortgageAggregateInput`
- `ActivateMortgageAggregateResult`
- `MortgageActivationSource`
- `activateMortgageAggregate`
- `resolveOrProvisionBorrowersForOrigination`
- `mortgageValuationSnapshots`
- mortgage provenance field set
- borrower provenance field set

## Temporary compatibility bridges

- The constructor file MUST be written so later phases can add helper calls in the exact master-spec order without reworking the file.
- The final result contract names MUST exist now even when later phases fill some fields.
- If branch-local implementation needs temporary placeholder values for later-owned fields, that looseness MUST remain internal and MUST NOT rename the final shared contract fields.

## Idempotency / retry / failure semantics

- Double-submitting the same origination case MUST return the same mortgage result.
- If borrower provisioning has not yet synced a `users` row, the commit path MUST stop before any canonical writes and set `awaiting_identity_sync`.
- Commit failures after canonical writes start MUST surface clearly; do not hide partial canonical writes.
- This phase does not own provider-managed collection retry semantics; phase 5 adds them later.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/borrowers/resolveOrProvisionForOrigination.ts`
  - `convex/mortgages/activateMortgageAggregate.ts`
  - `convex/mortgages/provenance.ts`
  - `convex/mortgages/valuation.ts`
  - `convex/admin/origination/commit.ts`
  - borrower provenance schema additions
  - mortgage provenance schema additions
  - `mortgageValuationSnapshots` schema definition
- **Shared but not owned**
  - `convex/admin/origination/cases.ts`
  - mortgage detail page shell
  - central schema file
  - audit/journal infrastructure
- **Later phases may extend but not redesign**
  - `activateMortgageAggregate` orchestrator
  - `ActivateMortgageAggregateResult`
  - mortgage detail page sections
  - case `status` / commit result fields

# ACCEPTANCE CRITERIA

- A completed origination case can be committed into real canonical rows.
- Double-submit is idempotent by workflow source.
- Primary borrower resolution is correct.
- Cross-org borrower reuse fails closed.
- No duplicate borrower rows are created for the same `userId` within the same org.
- The created mortgage is a normal canonical mortgage row in `active`, not a demo row and not an admin-only type.
- `mortgageBorrowers` exists for every participant and exactly one row is primary.
- Mortgage provenance fields are populated.
- The commit path writes origination audit instead of a fake GT transition.
- This phase satisfies global acceptance criteria 2, 3, 5, and 6, and it enables phases 3, 4, and 6.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Complete a draft case.
2. Commit it.
3. Land on a real mortgage detail page.
4. Inspect borrower rows, property row, valuation snapshot, and mortgage row in admin.
5. Confirm the mortgage status is `active`.
6. Double-submit the same case and confirm no duplicate mortgage is created.
7. Trigger a brand-new borrower email path and confirm the case halts at `awaiting_identity_sync` before any mortgage is created.

# RISKS / EDGE CASES / FAILURE MODES

- Identity-sync latency is the main pre-commit footgun. The commit path must stop before canonical writes if the `users` row is not present yet.
- The exact ownership-ledger genesis function name is repo-specific. Do not skip it merely because the symbol name differs from expectation.
- Constructor idempotency is easy to break if the workflow-source index is not correctly scoped.
- Do not let the constructor drift into a monolith that later phases need to rewrite entirely. Create explicit helper-call seams in the step order defined by the master spec.
- If the repo’s borrower domain has required status fields, choose the existing status valid for immediate origination; do not invent a new borrower state.
- Be careful not to accidentally create a listing, obligations, or blueprints in this phase; those are later-owned.

# MERGE CONTRACT

After this phase is merged:

- The repo has one canonical borrower-resolution path and one canonical mortgage activation constructor.
- The constructor is idempotent by workflow source.
- The mortgage row enters the existing servicing system directly in `active`.
- Later phases can safely add:
  - blueprint creation,
  - payment bootstrap,
  - listing projection / public-doc sync
  without redefining source/provenance semantics or creation order.
- The admin origination UI can commit to a real mortgage detail page even before listing/payment/document enhancements land.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not create or modify `users` directly in Convex.
- Do not add admin draft states into `mortgage.machine.ts`.
- Do not create a second mortgage constructor.
- Do not fake a GT transition for creation.
- Do not skip the ownership-ledger genesis primitive.
- Do not let later-phase helper calls force a redesign of the constructor contract.
