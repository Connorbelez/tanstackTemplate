Below is the single handoff spec I would give an implementation agent.

One honesty note before the spec itself: I cannot execute your paired local shell from here, so I could not inspect unpublished local-only changes on your machine. I grounded this against the public repo, current `main`, and the active public branch/PR stack that matches your local `04-14-broker-portal-demo` branch: PR #397 is from that branch, and PRs #367, #395, and #396 are the active admin-shell migration path. The public Notion link for the deal portal did not resolve from here, so the deal-portal portions below are grounded in the current code plus your requirements, not the Notion page itself. ([GitHub][1])

# SPEC: Admin Direct Mortgage Origination, Listing Projection, Active Mortgage Payment Bootstrap, and Deal-Time Document Package / Embedded Signing

## 1. Executive decision

This feature MUST be implemented as a single admin origination workflow that stages input in backoffice, then commits once into the canonical borrower/property/mortgage path, auto-derives the listing projection, bootstraps the Active Mortgage Payment System, and records a mortgage-owned document blueprint set that later materializes into deal-scoped document packages when a listing is locked into a deal.

This feature MUST NOT be implemented as:

* three disconnected CRUD forms that directly insert `borrowers`, `mortgages`, and `listings`;
* a special admin-only mortgage type;
* pre-active origination states added into `mortgage.machine.ts`;
* direct business-logic calls to Rotessa for recurring collections;
* direct listing ownership of mortgage origination documents;
* live template-group references stored on mortgages;
* deal documents generated lazily in the client portal.

The current codebase strongly supports that shape. The mortgage machine starts at `active` and only models post-activation servicing states; `transitionMutation` is a wrapper over `executeTransition`, and `executeTransition` loads an already-existing entity, derives the next snapshot, patches `status` and `machineContext`, journals the transition, and schedules effects. That means mortgage creation is outside the current GT transition boundary and should remain a canonical aggregate-construction path, not a new mortgage-machine state. ([GitHub][2])

The schema already contains the canonical domain pieces this spec should compose rather than bypass: `borrowers` require `userId`, `mortgages` already hold the servicing and collection-execution shape, `mortgageBorrowers` is the participant join table, `listings` are denormalized mortgage/property projections with a 1:1 mortgage index, and the payment stack already has `obligations`, `collectionPlanEntries`, `collectionAttempts`, `transferRequests`, and `bankAccounts`. The generic listing create path already enforces a unique listing per mortgage for `dataSource: "mortgage_pipeline"`. ([GitHub][3])

The Active Mortgage Payment System already has the correct three-layer boundaries. Initial collection-plan scheduling creates app-owned planned entries, avoids duplicate live plan coverage, and later the execution pipeline stages collection attempts and hands off to transfer initiation. The recurring-schedule activation flow already converts eligible future app-owned plan entries into provider-managed schedules and patches the mortgage into `provider_managed`, while the Rotessa transfer provider explicitly rejects app-owned recurring `initiateTransfer` in v1. ([GitHub][4])

The document layer is also already close to the right architecture. The repo already has base PDFs, templates, immutable template versions, template groups, generated documents, signatory validation, and Documenso-oriented output configuration. Template publishing creates immutable version snapshots; template groups enforce signatory homogeneity; generated documents already support `entityType`, `entityId`, `sensitivityTier`, `signingStatus`, and `documensoEnvelopeId`. The deal machine already exposes `createDocumentPackage` on `DEAL_LOCKED` and `archiveSignedDocuments` on `ALL_PARTIES_SIGNED`. ([GitHub][3])

The admin shell is mid-migration toward a registry-driven entity shell and normalized detail surfaces, while the legacy admin query layer still only covers a subset of entities and returns empty rows for listings. The public branch stack already points toward specialized operational screens on top of the new shell, and the current permissions set already includes `mortgage:originate`, `payment:manage`, `document:upload`, `document:review`, and `document:generate`. This feature should plug into that direction instead of extending the legacy list-query scaffolding. ([GitHub][5])

---

## 2. Architecture decision matrix

| Decision point                | Reject                                                          | Choose                                                                               |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Admin creation entrypoint     | Three direct CRUD forms                                         | One admin origination case workflow                                                  |
| Mortgage creation semantics   | Admin-only mortgage type or admin-only state machine            | Same canonical mortgage aggregate, explicit provenance                               |
| GT boundary                   | Create mortgage by faking a transition on a non-existent entity | Create mortgage canonically, then use GT for all later transitions                   |
| Borrower identity             | Insert `users` directly in Convex                               | Resolve/provision WorkOS-backed identity first, then borrower                        |
| Listing creation              | Generic mortgage-backed listing create form                     | Internal mortgage listing projection/upsert only                                     |
| Payment bootstrap             | Bespoke mortgage-specific collection rows                       | Shared obligations + collection plan bootstrap through existing payment architecture |
| Rotessa recurring collections | Generic direct `pad_rotessa` app-owned initiateTransfer         | Existing provider-managed recurring schedule activation flow                         |
| Mortgage docs                 | Listing-owned docs or ad hoc arrays on mortgage                 | Mortgage-owned document blueprints                                                   |
| Template attachment           | Live mutable group refs                                         | Pinned template-version blueprints                                                   |
| Private deal docs             | Mortgage-level docs visible forever                             | Deal-time materialization on `DEAL_LOCKED`                                           |
| Signable docs                 | Frontend talks to Documenso directly                            | Server-side signature provider seam, Documenso implementation                        |
| Deal access                   | Keep broker out and rely on admin bypass                        | Explicit broker deal access role(s) plus participant-scoped access                   |

---

## 3. Product boundary and non-goals

### In scope

This spec covers:

* admin-direct origination of borrowers, property, mortgage, listing draft, payment bootstrap, and mortgage document blueprints;
* one canonical activation path shared by admin origination now and application-package handoff later;
* listing projection as a mortgage-derived read model;
* integration into the Active Mortgage Payment System;
* immediate optional provider-managed Rotessa schedule activation;
* public listing docs;
* private static docs for deals;
* private templated non-signable deal docs;
* private templated signable deal docs with Documenso-backed embedded signing;
* deal-time package creation and signed-document archival;
* admin-shell integration and RBAC.

### Explicitly out of scope

This spec does **not** require:

* completing the borrower application pipeline;
* completing underwriting or application-package assembly;
* redesigning the mortgage servicing state machine;
* implementing a generic one-time Rotessa retry/make-up abstraction across all payment surfaces;
* building a full custom CRM for documents;
* solving every future deal-closing portal concern outside the document package and signing surfaces described here.

---

## 4. Authoritative architectural rules

These rules are normative.

### 4.1 One origination workflow

There MUST be one admin origination workflow. It stages data in a backoffice workspace and commits once.

There MUST NOT be:

* a standalone production “Create Borrower” button that bypasses origination for mortgage-backed flows;
* a production “Create Listing” path for mortgage-backed listings;
* a second mortgage constructor separate from the canonical one described below.

### 4.2 One canonical mortgage path

There MUST be one canonical mortgage activation constructor.

Both of these future sources must call the same internal constructor:

* `adminOriginationCase -> Mortgage`
* `ApplicationPackage -> Mortgage`

They differ only in provenance, not in aggregate shape.

### 4.3 Listing is a projection

A mortgage-backed listing is a projection/read model of a mortgage plus property plus valuation plus mortgage-owned public document blueprints.

It is not an independently authored business object.

Marketplace curation remains listing-owned:

* title
* description
* marketplace copy
* hero images
* featured
* display order
* SEO slug
* publish/delist lifecycle

Mortgage economics, property facts, valuation summary, public origination docs, and payment history signals are projection-owned.

### 4.4 Active Mortgage Payment System remains canonical

The mortgage origination flow MUST integrate with the existing three-layer payment model:

* obligations = what is owed;
* collection plan entries = how the system intends to collect;
* collection attempts + transfer requests + external schedules = execution reality.

Origination MUST bootstrap obligations and collection plan entries.
Origination MUST NOT create bespoke payment rows outside that model.

### 4.5 Rotessa is a rail, not the economic source of truth

Economic truth lives in Convex domain tables:

* obligations
* collectionPlanEntries
* collectionAttempts
* transferRequests
* externalCollectionSchedules
* mortgages collection-execution fields

Rotessa is only an execution provider behind the provider-managed recurring schedule adapter. That is consistent with the current code and with Rotessa’s own schedule-centric model for recurring and one-time payments. Rotessa schedules require future process dates and frequencies, and changes to process date/frequency generally require delete-and-recreate; make-up payments for declined items are new one-time schedules rather than automatic replay of the original recurring schedule. ([Rotessa][6])

### 4.6 Documents follow a blueprint -> package -> instance model

Mortgage origination documents are authored as **mortgage-owned blueprints**.

They later materialize as:

* public docs projected onto listings;
* deal-private static document instances;
* deal-private generated non-signable document instances;
* deal-private signable document instances and signature envelopes.

### 4.7 Deal documents are immutable snapshots

Once a deal locks and its document package is created:

* that deal’s document package is frozen to the blueprint snapshots used at lock time;
* later edits to mortgage blueprints affect only future deals;
* existing deals do not retroactively change document membership or template versions.

### 4.8 Signable documents require typed participant resolution

Template interpolation and signatory mapping MUST use canonical typed domain references, not free-form display strings from read models.

The current deal read-model shape exposes `buyerId`, `sellerId`, and `lawyerId` as strings in one query surface, which is not a safe long-term contract for document generation or signing. The implementation MUST add or expose a typed participant-resolution contract before signable documents ship. ([GitHub][7])

---

## 5. High-level domain model

This spec introduces seven new first-class concepts:

1. `adminOriginationCases`
   Backoffice staging aggregate. Incomplete admin-entered data lives here.

2. `documentAssets`
   Immutable stored PDFs uploaded by admins or archived back from a signature provider.

3. `originationCaseDocumentDrafts`
   Staged document attachments selected during admin origination before commit.

4. `mortgageDocumentBlueprints`
   Mortgage-owned canonical document plan created at origination commit.

5. `mortgageValuationSnapshots`
   Canonical valuation snapshot(s) used by listing projection.

6. `dealDocumentPackages`
   One header row per deal package, created on `DEAL_LOCKED`.

7. `dealDocumentInstances`
   The unified deal-facing document surface for static, generated, and signable docs.

This spec also adds:

8. `signatureEnvelopes`
   Provider lifecycle rows for signable generated documents.

9. `signatureRecipients`
   Per-envelope recipient rows for embedded signing and status tracking.

And it extends existing entities with new provenance/access fields:

* `mortgages`
* `borrowers`
* `deals` or an equivalent typed participant resolver
* `dealAccess`

---

## 6. Schema changes

The following schema changes are required.

## 6.1 `adminOriginationCases`

This is the authoritative staging aggregate for admin-direct origination.

```ts
type AdminOriginationCaseStatus =
  | "draft"
  | "awaiting_identity_sync"
  | "ready_to_commit"
  | "committing"
  | "committed"
  | "failed"
  | "cancelled";

type RequestedCollectionMode = "none" | "manual" | "provider_managed";

type CollectionSetupStatus =
  | "not_requested"
  | "pending"
  | "activating"
  | "active"
  | "failed";

interface AdminOriginationCase {
  status: AdminOriginationCaseStatus;

  createdByUserId: Id<"users">;
  updatedByUserId: Id<"users">;

  orgId?: string;

  brokerOfRecordId: Id<"brokers">;
  assignedBrokerId?: Id<"brokers">;

  participants: Array<{
    participantKey: string; // stable local key for UI and draft references
    role: "primary" | "co_borrower" | "guarantor";

    existingBorrowerId?: Id<"borrowers">;
    existingUserId?: Id<"users">;
    resolvedBorrowerId?: Id<"borrowers">;

    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;

    identityMode: "reuse_existing" | "provision_workos_user";
  }>;

  property: {
    existingPropertyId?: Id<"properties">;
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
    latestAppraisalValueAsIs: number; // cents
    latestAppraisalDate: string; // YYYY-MM-DD
  };

  mortgage: {
    principal: number; // cents
    interestRate: number; // decimal fraction or percent, MUST match current canonical convention
    rateType: "fixed" | "variable";
    termMonths: number;
    amortizationMonths: number;
    paymentAmount: number; // cents
    paymentFrequency: "monthly" | "bi_weekly" | "accelerated_bi_weekly" | "weekly";
    loanType: "conventional" | "insured" | "high_ratio";
    lienPosition: number;

    annualServicingRate?: number;

    interestAdjustmentDate: string;
    termStartDate: string;
    maturityDate?: string; // derive if omitted
    firstPaymentDate: string;
    fundedAt?: number;

    priorMortgageId?: Id<"mortgages">;
    isRenewal?: boolean;
  };

  collections: {
    requestedMode: RequestedCollectionMode;
    providerCode?: "pad_rotessa";
    bankAccountId?: Id<"bankAccounts">;
    activateImmediately: boolean;
    status: CollectionSetupStatus;
    lastError?: string;
  };

  listingOverrides: {
    title?: string;
    description?: string;
    marketplaceCopy?: string;
    heroImages?: Doc<"listings">["heroImages"];
    featured?: boolean;
    displayOrder?: number;
    adminNotes?: string;
    seoSlug?: string;
  };

  validationErrors?: Array<{
    path: string;
    code: string;
    message: string;
  }>;

  result?: {
    borrowerIds: Id<"borrowers">[];
    primaryBorrowerId: Id<"borrowers">;
    propertyId: Id<"properties">;
    valuationSnapshotId: Id<"mortgageValuationSnapshots">;
    mortgageId: Id<"mortgages">;
    listingId: Id<"listings">;
    dealBlueprintCount: number;
    externalCollectionScheduleId?: Id<"externalCollectionSchedules">;
  };

  commitIdempotencyKey: string;

  createdAt: number;
  updatedAt: number;
  committedAt?: number;
}
```

### Hard rule

Incomplete origination data MUST live here and in the companion document draft table below, not in `borrowers`, `mortgages`, `listings`, or `generatedDocuments`.

---

## 6.2 `documentAssets`

This is the immutable stored-file layer for uploaded/admin-imported/archived PDFs.

```ts
type DocumentAssetSource =
  | "admin_upload"
  | "external_import"
  | "signature_archive";

interface DocumentAsset {
  name: string;
  description?: string;
  originalFilename: string;
  mimeType: "application/pdf";
  fileRef: Id<"_storage">;
  fileHash: string;
  fileSize: number;
  pageCount?: number;

  uploadedByUserId: Id<"users">;
  uploadedAt: number;
  source: DocumentAssetSource;
}
```

### Hard rule

Do not repurpose `documentBasePdfs` for this. `documentBasePdfs` are reusable template inputs inside the document engine. `documentAssets` are end-user-facing immutable artifacts. The current schema already distinguishes base PDFs, templates, template versions, template groups, and generated documents, so this new table should preserve that separation. ([GitHub][3])

---

## 6.3 `originationCaseDocumentDrafts`

This stages document selections before origination commit.

```ts
type DraftDocClass =
  | "public_static"
  | "private_static"
  | "private_templated_non_signable"
  | "private_templated_signable";

type DraftDocSourceKind = "asset" | "template_version";

interface OriginationCaseDocumentDraft {
  originationCaseId: Id<"adminOriginationCases">;

  class: DraftDocClass;
  sourceKind: DraftDocSourceKind;

  displayName: string;
  description?: string;
  category?: string;
  displayOrder: number;

  // asset-backed
  assetId?: Id<"documentAssets">;

  // template-backed
  templateId?: Id<"documentTemplates">;
  templateVersion?: number;

  // optional grouping metadata for UI presentation only
  packageKey?: string;
  packageLabel?: string;
  selectedFromGroupId?: Id<"documentTemplateGroups">;

  // validation snapshots
  requiredVariableKeys?: string[];
  requiredPlatformRoles?: string[];
  unsupportedVariableKeys?: string[];
  unsupportedPlatformRoles?: string[];
  containsSignableFields?: boolean;

  createdByUserId: Id<"users">;
  createdAt: number;
  updatedAt: number;
}
```

### Hard rules

* A selected template group MUST be expanded immediately into one draft row per template version.
* `templateVersion` MUST always be pinned at attachment time.
* A `private_templated_non_signable` draft MUST NOT contain signable fields.
* A `private_templated_signable` draft MUST contain at least one signable field and at least one signatory role.

The current document engine already has immutable template versions, template groups with optional pinned versions, signatory validation, and field-level signable metadata, so the implementation should reuse those primitives rather than introducing a second templating system. ([GitHub][8])

---

## 6.4 `mortgageValuationSnapshots`

This closes the canonical-valuation gap cleanly.

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

### Hard rule

Listing projection MUST derive appraisal summary from the latest valuation snapshot, not from manually edited listing fields.

---

## 6.5 `mortgageDocumentBlueprints`

This is the canonical mortgage-owned document plan.

```ts
type MortgageDocumentBlueprintClass =
  | "public_static"
  | "private_static"
  | "private_templated_non_signable"
  | "private_templated_signable";

type MortgageDocumentBlueprintSourceKind = "asset" | "template_version";

type MortgageDocumentBlueprintStatus = "active" | "archived";

interface MortgageDocumentBlueprint {
  mortgageId: Id<"mortgages">;

  class: MortgageDocumentBlueprintClass;
  sourceKind: MortgageDocumentBlueprintSourceKind;
  status: MortgageDocumentBlueprintStatus;

  displayName: string;
  description?: string;
  category?: string;
  displayOrder: number;

  packageKey?: string;
  packageLabel?: string;

  // asset-backed
  assetId?: Id<"documentAssets">;

  // template-backed
  templateId?: Id<"documentTemplates">;
  templateVersion?: number;

  // audit / validation snapshot
  templateSnapshotMeta?: {
    templateName: string;
    sourceGroupId?: Id<"documentTemplateGroups">;
    sourceGroupName?: string;
    requiredPlatformRoles: string[];
    requiredVariableKeys: string[];
    containsSignableFields: boolean;
  };

  createdByUserId: Id<"users">;
  createdAt: number;
  archivedAt?: number;
}
```

### Hard rules

* These rows are mortgage-owned truth.
* They are immutable except for archival.
* Editing mortgage documents after origination archives prior blueprint rows and inserts new ones.
* Existing deal packages never change.

---

## 6.6 `dealDocumentPackages`

One header row per deal document package.

```ts
type DealDocumentPackageStatus =
  | "pending"
  | "ready"
  | "partial_failure"
  | "failed"
  | "archived";

interface DealDocumentPackage {
  dealId: Id<"deals">;
  mortgageId: Id<"mortgages">;

  status: DealDocumentPackageStatus;
  lastError?: string;
  retryCount: number;

  createdAt: number;
  updatedAt: number;
  readyAt?: number;
  archivedAt?: number;
}
```

### Hard rule

Package creation is idempotent on `dealId`.

---

## 6.7 `dealDocumentInstances`

This is the deal portal’s unified document surface.

```ts
type DealDocumentInstanceKind = "static_reference" | "generated";

type DealDocumentInstanceStatus =
  | "available"
  | "generation_failed"
  | "signature_pending_recipient_resolution"
  | "signature_draft"
  | "signature_sent"
  | "signature_partially_signed"
  | "signed"
  | "archived";

interface DealDocumentInstance {
  packageId: Id<"dealDocumentPackages">;
  dealId: Id<"deals">;
  mortgageId: Id<"mortgages">;

  sourceBlueprintId?: Id<"mortgageDocumentBlueprints">;

  sourceBlueprintSnapshot: {
    class: MortgageDocumentBlueprintClass;
    displayName: string;
    description?: string;
    category?: string;
    displayOrder: number;
    packageKey?: string;
    packageLabel?: string;
    templateId?: Id<"documentTemplates">;
    templateVersion?: number;
  };

  kind: DealDocumentInstanceKind;
  status: DealDocumentInstanceStatus;

  // exactly one of these is populated
  assetId?: Id<"documentAssets">;
  generatedDocumentId?: Id<"generatedDocuments">;

  createdAt: number;
  updatedAt: number;
}
```

### Hard rule

The deal portal MUST query this table, not infer its document surface by mixing blueprint rows, raw generated documents, and storage IDs ad hoc.

---

## 6.8 `signatureEnvelopes` and `signatureRecipients`

These normalize signable-document lifecycle.

```ts
type SignatureProviderCode = "documenso";

type SignatureEnvelopeStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "completed"
  | "declined"
  | "voided"
  | "provider_error";

interface SignatureEnvelope {
  generatedDocumentId: Id<"generatedDocuments">;
  dealId: Id<"deals">;

  providerCode: SignatureProviderCode;
  providerEnvelopeId: string;

  status: SignatureEnvelopeStatus;
  lastProviderSyncAt?: number;
  lastError?: string;

  createdAt: number;
  updatedAt: number;
}

type SignatureRecipientStatus =
  | "pending"
  | "opened"
  | "signed"
  | "declined";

interface SignatureRecipient {
  envelopeId: Id<"signatureEnvelopes">;

  platformRole: string;
  providerRole: "SIGNER" | "APPROVER" | "VIEWER";

  name: string;
  email: string;
  signingOrder: number;

  providerRecipientId?: string;
  status: SignatureRecipientStatus;

  openedAt?: number;
  signedAt?: number;
  declinedAt?: number;

  createdAt: number;
  updatedAt: number;
}
```

Also extend `generatedDocuments` with:

```ts
finalPdfStorageId?: Id<"_storage">;
completionCertificateStorageId?: Id<"_storage">;
signingCompletedAt?: number;
```

The current schema already anticipates `documensoEnvelopeId`, `signingStatus`, and polymorphic linkage for `generatedDocuments`, so these new tables are additive normalization rather than a replacement. ([GitHub][3])

---

## 6.9 `mortgages` provenance fields

Add:

```ts
type CreationSource = "application" | "admin" | "import" | "api" | "seed";
type OriginationPath = "standard" | "admin_direct" | "legacy_import" | "api" | "seed";
type OriginatingWorkflowType = "applicationPackage" | "adminOriginationCase" | "importJob" | "seed";
```

Fields:

* `creationSource?: CreationSource`
* `originationPath?: OriginationPath`
* `originatingWorkflowType?: OriginatingWorkflowType`
* `originatingWorkflowId?: string`
* `originatedByUserId?: Id<"users">`

Add an index supporting idempotent constructor lookup by workflow source.

### Hard rule

This is the explicit admin entry mode into the existing mortgage aggregate.

---

## 6.10 `borrowers` provenance fields

Add:

* `creationSource?: CreationSource`
* `originatingWorkflowType?: OriginatingWorkflowType`
* `originatingWorkflowId?: string`

No direct `users` writes are permitted. The borrower row remains linked to a WorkOS-synced `users` row because the current schema requires `borrowers.userId`. ([GitHub][3])

---

## 6.11 `deals` participant normalization requirement

Before signable documents ship, the implementation MUST expose canonical typed participant resolution for:

* lender
* borrower(s)
* broker of record
* assigned broker, if present
* selected lawyer

The implementation may satisfy this either by:

1. adding typed fields to `deals`, or
2. adding a `dealParticipants` table, or
3. exposing an internal resolver that composes canonical typed IDs from existing deal and related entities.

### Hard rule

The document package generator MUST NOT rely on display strings like `buyerId: string`, `sellerId: string`, or `lawyerId: string` from read models as the canonical signatory source.

---

## 6.12 `dealAccess` role expansion

Current deal access checks grant admin bypass or require an active `dealAccess` row, and the coded roles are currently lender/borrower/lawyer only. This spec requires expanding deal access to include explicit broker roles for private-document and portal visibility. ([GitHub][9])

Add:

* `broker_of_record`
* `assigned_broker`

These roles are required for:

* private doc visibility where the broker is involved in the deal;
* broker-side deal portal previews/review;
* signable document workflows that include broker signatories.

---

## 7. Canonical origination flow

The origination flow has seven steps.

## 7.1 Step 1: Participants

The admin selects or creates:

* exactly one primary borrower;
* zero or more co-borrowers;
* zero or more guarantors;
* broker of record;
* optional assigned broker.

### Rules

* Exactly one participant MUST be `primary`.
* For v1, the primary borrower is the canonical servicing borrower for obligations and borrower-side collection ownership.
* Co-borrowers and guarantors exist for participant, document, and access purposes, but current payment rows continue to anchor on the primary borrower for compatibility with the existing schema.

## 7.2 Step 2: Property and valuation

The admin either selects an existing property or creates a new one.

The admin enters:

* appraisal/valuation amount;
* valuation date;
* optional linked appraisal asset as a public or private doc, depending business choice.

On commit, a canonical valuation snapshot row is created.

## 7.3 Step 3: Mortgage terms

The admin enters:

* principal
* rate
* rate type
* term
* amortization
* payment amount
* payment frequency
* loan type
* lien position
* servicing rate
* term start
* first payment date
* maturity date or maturity derivation inputs
* optional funded-at timestamp
* optional prior mortgage for renewal chaining

## 7.4 Step 4: Collections

The admin chooses:

* no collection setup
* manual/app-owned collection setup only
* provider-managed collection activation now

For provider-managed activation:

* provider code is `pad_rotessa`
* a borrower-owned bank account must be selected
* for v1, it must belong to the primary borrower

## 7.5 Step 5: Documents

The admin attaches documents in four separate sections:

1. Public static listing docs
2. Private static deal docs
3. Private templated non-signable deal docs
4. Private templated signable deal docs

Details are specified in the document sections below.

## 7.6 Step 6: Listing curation

The admin enters listing-owned curated fields:

* title
* description
* marketplace copy
* hero images
* featured flag
* display order
* SEO slug
* admin notes

The listing still starts as `draft`.

## 7.7 Step 7: Review and commit

The review screen MUST show:

* participants and identity-resolution mode
* property
* valuation
* mortgage economic terms
* collections mode and bank account
* public doc count
* private static doc count
* templated non-signable doc count
* templated signable doc count
* listing overrides
* warnings, including schedule-rule/configuration warnings

On commit, the system performs the canonical activation sequence.

---

## 8. Canonical borrower resolution path

Borrower handling MUST use a single helper, for example:

```ts
resolveOrProvisionBorrowersForOrigination(caseId: Id<"adminOriginationCases">)
```

### Algorithm

For each participant:

1. If `existingBorrowerId` is provided:

   * load the borrower;
   * validate org/broker compatibility;
   * reuse it.

2. Else:

   * look up `users` by email;
   * if no user exists, provision or invite via WorkOS;
   * do **not** write a `users` row directly in Convex.

3. If provisioning was initiated but the synced `users` row is not yet present:

   * update case status to `awaiting_identity_sync`;
   * stop the commit path before any canonical mortgage creation.

4. Once a `users` row exists:

   * look for an existing borrower by `userId`;
   * if found, reuse it;
   * else create a borrower row linked to that `userId`, scoped to the correct org, with the borrower domain status that is valid for immediate mortgage origination.

### Hard rules

* The implementation MUST fail closed on cross-org borrower reuse.
* The implementation MUST preserve `borrowers.userId` as the auth link because the current schema requires it. ([GitHub][3])
* The implementation MUST NOT create duplicate borrower rows for the same `userId` within the same org.

---

## 9. Canonical mortgage activation constructor

This is the core abstraction for the feature.

Create one internal mutation, for example:

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
```

Return:

```ts
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

### Idempotency

This function MUST be idempotent by workflow source. Double-submitting the same origination case must return the same mortgage result.

---

## 10. Mortgage activation algorithm

The canonical activation mutation MUST perform the following steps atomically.

## 10.1 Validate source and idempotency

* Check the workflow-source uniqueness index.
* If a mortgage already exists for this workflow, return its existing aggregate result.

## 10.2 Resolve or create property

* If `propertyId` is provided, validate existence.
* Else create the property row.

## 10.3 Persist valuation snapshot

* Insert a `mortgageValuationSnapshot`.

## 10.4 Insert the mortgage row in the canonical initial servicing snapshot

Insert the mortgage directly with:

* `status = "active"`
* `machineContext = { missedPayments: 0, lastPaymentAt: 0 }`
* `lastTransitionAt = createdAt`
* `collectionExecutionMode = "app_owned"`
* `collectionExecutionProviderCode = undefined`
* `activeExternalCollectionScheduleId = undefined`
* `collectionExecutionUpdatedAt = createdAt`
* all canonical dates and terms
* provenance fields from `source`

This is the explicit admin entry mode into the existing mortgage aggregate.

### Hard rule

Do **not** add admin draft states into `mortgage.machine.ts`. The current machine starts at `active` and is servicing-only. ([GitHub][2])

## 10.5 Insert `mortgageBorrowers`

* Insert one row per participant.
* Enforce exactly one primary borrower.

## 10.6 Initialize ownership-side marketplace prerequisites

The constructor MUST call the existing ownership-ledger genesis primitive required for:

* a valid mortgage record in the ownership domain;
* future fraction availability reads;
* later locking / reservation / transfer flows.

This spec intentionally leaves the exact primitive name repo-specific, but this call is mandatory.

## 10.7 Create origination document blueprints

* Load all `originationCaseDocumentDrafts`.
* Insert `mortgageDocumentBlueprints`.
* Public docs become `public_static` active blueprints.
* Private static docs become `private_static` active blueprints.
* Templated non-signable docs become `private_templated_non_signable` active blueprints.
* Templated signable docs become `private_templated_signable` active blueprints.

## 10.8 Bootstrap servicing artifacts

This is defined in the payment section below, but the canonical mutation MUST:

* create initial obligations;
* create initial collection plan entries;
* leave execution to the existing payment runner.

## 10.9 Upsert the listing projection

Create a `draft` listing projection for the mortgage.

## 10.10 Sync listing public-doc projection

For backward compatibility with the current listing schema, patch `listings.publicDocumentIds` to match the ordered active public blueprints. The listing row is **not** the authoring truth; this is a projection/cache layer. The current listing schema still exposes `publicDocumentIds`, so this compatibility bridge is required until the listing detail page is fully moved to blueprint-driven queries. ([GitHub][10])

## 10.11 Write origination audit

Write an audit record including:

* source workflow
* actor user
* borrower IDs
* property ID
* mortgage ID
* listing ID
* initial status `active`
* origin path `admin_direct`

### Hard rule

Do not try to fake a GT transition for a non-existent mortgage. Use a creation/origination audit record.

---

## 11. Listing projection contract

Mortgage-backed listings MUST be created and updated through:

```ts
upsertMortgageListingProjection(mortgageId: Id<"mortgages">, overrides?: ListingOverrides)
```

### 11.1 Derived fields that MUST be overwritten on refresh

These fields are projection-owned and must be regenerated every time:

* `mortgageId`
* `propertyId`
* `dataSource = "mortgage_pipeline"`
* `principal`
* `interestRate`
* `ltvRatio`
* `termMonths`
* `maturityDate`
* `monthlyPayment` = `mortgage.paymentAmount` unchanged
* `rateType`
* `paymentFrequency`
* `loanType`
* `lienPosition`
* `propertyType`
* `city`
* `province`
* `approximateLatitude`
* `approximateLongitude`
* `latestAppraisalValueAsIs`
* `latestAppraisalDate`
* `borrowerSignal`
* `paymentHistory`
* `publicDocumentIds` (projection compatibility field)
* `updatedAt`

### 11.2 Curated fields that MUST be preserved unless explicitly edited by admin

* `title`
* `description`
* `marketplaceCopy`
* `heroImages`
* `featured`
* `displayOrder`
* `adminNotes`
* `seoSlug`
* `status`
* `publishedAt`
* `delistedAt`
* `delistReason`
* `viewCount`

### 11.3 `monthlyPayment` rule

The current listing contract keeps the legacy field name `monthlyPayment` even though the mortgage source contract uses `paymentAmount` plus `paymentFrequency`. For this feature, `listings.monthlyPayment` MUST be populated with `mortgage.paymentAmount` unchanged, and any UI rendering MUST always pair it with `paymentFrequency`. Do not try to derive a synthetic monthly equivalent inside the projector. The schema itself already documents this naming mismatch. ([GitHub][10])

### 11.4 Creation path rule

`convex/listings/create.ts` must no longer be a production entrypoint for mortgage-backed listings. It can remain for demo or other listing types only if explicitly gated.

The current file already enforces the 1:1 mortgage invariant and requires `mortgageId` for `mortgage_pipeline` rows; this feature should move mortgage-backed creation behind the projector/internal path rather than broaden the generic create mutation. ([GitHub][11])

---

## 12. Integration with the Active Mortgage Payment System

This section is mandatory and authoritative.

## 12.1 Origination MUST stop at obligations + collection plan entries

At origination commit, the system MUST:

* create obligations;
* create app-owned collection plan entries.

It MUST NOT:

* create collection attempts;
* create transfer requests;
* directly initiate provider transfers.

The existing collection-plan execution pipeline later stages attempts and requires a transfer handoff path; origination should not bypass or duplicate that runtime behavior. ([GitHub][12])

## 12.2 Initial obligation generation

Create a shared helper, for example:

```ts
generateInitialMortgageObligations(input): {
  primaryBorrowerId: Id<"borrowers">;
  obligationIds: Id<"obligations">[];
}
```

### Rules

* The primary borrower is the servicing borrower for v1.
* Generate recurring scheduled obligations from `firstPaymentDate` through `maturityDate`.
* Use `type = "regular_interest"` for recurring scheduled obligations.
* If principal is contractually due at maturity, generate one `type = "principal_repayment"` obligation at maturity.
* Do not generate arrears or late-fee obligations at origination.
* Set `amountSettled = 0`.
* Set `paymentNumber` monotonically.
* Set `status` based on due date relative to current time using the same canonical convention the obligation machine expects.

The obligation schema already supports `regular_interest`, `arrears_cure`, `late_fee`, and `principal_repayment`. ([GitHub][10])

### Hard rule

Do not create a special “admin mortgage obligation” type.

## 12.3 Initial collection-plan bootstrap

After obligations are created, the constructor MUST call a shared wrapper over the current initial-scheduling logic.

The existing `collectionPlan/initialScheduling.ts` is already the right seam:

* it creates app-owned default-schedule plan entries;
* it avoids duplicating live coverage;
* it knows eligible statuses;
* it carries source metadata;
* it can surface whether the schedule rule was missing. ([GitHub][4])

Use one of these strategies:

* preferred: call a new internal wrapper around `ensureDefaultEntriesForObligationsImpl`
* acceptable: call a wrapper around `scheduleInitialEntriesImpl` if the obligation generator itself is already persisted and queryable

### Rules

* Plan entries MUST start as `executionMode = "app_owned"`.
* Plan entries MUST start as `status = "planned"`.
* Use the existing default schedule rule resolution; do not invent admin-only scheduling math.
* If no active schedule rule exists, use the existing default schedule config and surface `scheduleRuleMissing = true` in the origination result so admin sees the warning. The current initial-scheduling code already exposes that concept. ([GitHub][4])

## 12.4 Mortgage execution ownership fields at creation

The mortgage row MUST be initialized as:

* `collectionExecutionMode = "app_owned"`
* `collectionExecutionProviderCode = undefined`
* `activeExternalCollectionScheduleId = undefined`

This is important because the current recurring-schedule activation flow later patches the mortgage into `provider_managed` when it succeeds. The mortgage schema already has those fields. ([GitHub][3])

## 12.5 Immediate provider-managed schedule activation

If the admin chose immediate provider-managed activation:

1. The canonical mutation commits first.
2. A follow-up action calls the existing recurring-schedule activation flow.

Use the existing public/internal action shape already present in `payments/recurringSchedules/activation.ts`. That action:

* requires eligible future app-owned plan entries;
* requires a borrower-owned bank account;
* validates the bank-account record;
* requires Rotessa customer identifiers in bank-account metadata;
* maps mortgage cadence to Rotessa frequency;
* rejects concurrent live schedules;
* commits plan entries to `provider_scheduled`;
* patches the mortgage to `provider_managed` and sets `activeExternalCollectionScheduleId`. ([GitHub][13])

### Preconditions

The selected bank account MUST:

* belong to the primary borrower in v1;
* have `status = "validated"`;
* have `mandateStatus = "active"` for PAD providers;
* pass institution/transit format validation;
* contain one of:

  * `metadata.rotessaCustomerId`
  * `metadata.rotessaCustomerCustomIdentifier`
  * `metadata.rotessaCustomIdentifier`

The existing bank-account validation code enforces validated status, active mandate for PAD providers, and Canadian institution/transit format checks. The recurring schedule activation logic also explicitly requires a borrower-owned bank account and a Rotessa customer reference in metadata. ([GitHub][14])

### Frequency mapping

The activation flow currently maps:

* `monthly -> Monthly`
* `bi_weekly` and `accelerated_bi_weekly -> Every Other Week`
* `weekly -> Weekly`

Unsupported frequencies must fail fast. ([GitHub][13])

### Uniform-amount rule

The current Rotessa recurring adapter validates uniform installments across the selected plan entries. Therefore immediate schedule activation in v1 is only valid when the covered future entries have equal amounts. ([GitHub][13])

### Failure semantics

If provider-managed activation fails:

* the mortgage remains created;
* obligations remain created;
* app-owned plan entries remain created;
* the case is still `committed`;
* `collections.status = "failed"` and `collections.lastError` are populated;
* the UI must expose a retry action.

### Hard rule

Do **not** call generic `pad_rotessa` direct transfer initiation for recurring mortgage collections. The current provider explicitly rejects that path in v1. ([GitHub][15])

## 12.6 One-off irregular collections

This feature does **not** introduce a generic one-off Rotessa collection abstraction for arrears cures, late fees, or manual make-up payments.

For now:

* recurring scheduled installments use provider-managed recurring schedules;
* irregular one-offs remain on the existing manual/app-owned path until a dedicated one-time schedule adapter is intentionally built.

That boundary is consistent with Rotessa’s schedule-centric model and its make-up-payment guidance. ([Rotessa][6])

---

## 13. Document classes and ownership model

The system MUST support exactly these four mortgage-origination document classes.

## 13.1 Public static docs

Definition:

* admin-uploaded immutable PDFs
* sourced from the mortgage origination process
* shown on the listing detail page
* visible to authenticated lender-facing listing viewers
* previewable by admin/broker in backoffice

Ownership:

* mortgage-owned blueprint
* listing-projected visibility

Storage:

* `documentAssets`
* `mortgageDocumentBlueprints.class = "public_static"`

Rendering:

* listing detail page reads from mortgage blueprints, not from ad hoc listing authoring
* `publicDocumentIds` on listing is a projection compatibility field only

## 13.2 Private static docs

Definition:

* read-only, non-signable, non-template PDFs
* often off-platform origination docs
* only visible after a deal exists
* visible only to deal participants and staff

Ownership:

* mortgage-owned blueprint
* materialized into a deal document instance on `DEAL_LOCKED`

Storage:

* source PDF in `documentAssets`
* blueprint in `mortgageDocumentBlueprints.class = "private_static"`
* deal surface row in `dealDocumentInstances.kind = "static_reference"`

## 13.3 Private templated non-signable docs

Definition:

* selected from the document engine during origination
* interpolable values
* generated when the deal locks
* output is attached to the deal, not the mortgage
* not signable

Ownership:

* mortgage-owned blueprint of a pinned template version
* deal-time generated output

Storage:

* blueprint in `mortgageDocumentBlueprints.class = "private_templated_non_signable"`
* generated output in `generatedDocuments.entityType = "deal"`
* deal surface row in `dealDocumentInstances.kind = "generated"`

## 13.4 Private templated signable docs

Definition:

* selected during origination
* interpolated when a deal locks
* signable
* include lender, borrower, broker, and lawyer identity fields
* hosted/signature-managed through Documenso
* surfaced through embedded signing in the deal portal
* generated output is attached to the deal, not the mortgage

Ownership:

* mortgage-owned blueprint of a pinned template version
* deal-time generated output + signature envelope lifecycle

Storage:

* blueprint in `mortgageDocumentBlueprints.class = "private_templated_signable"`
* generated output in `generatedDocuments.entityType = "deal"`
* envelope in `signatureEnvelopes`
* recipients in `signatureRecipients`
* deal surface row in `dealDocumentInstances.kind = "generated"`

---

## 14. Document authoring rules during admin origination

The origination workflow MUST include a dedicated **Documents** step.

That step MUST have four sections:

1. Public static docs
2. Private static docs
3. Private templated non-signable docs
4. Private templated signable docs

### 14.1 Static upload rules

When the admin uploads a static PDF:

* store the file in `_storage`;
* create a `documentAssets` row;
* create or update the corresponding `originationCaseDocumentDraft`.

### 14.2 Template attachment rules

When the admin selects a single template:

* resolve the template’s current published version;
* create a draft row with pinned `templateVersion`.

When the admin selects a template group:

* expand the group immediately into one draft row per template reference;
* if the group reference has `pinnedVersion`, use it;
* else pin the current published version at selection time;
* keep group metadata only for UI grouping.

### 14.3 Validation rules for non-signable templates

At attach time:

* resolve required variable keys from the pinned template version;
* validate that all required keys are supported by the deal-closing variable resolver;
* validate that the template has no signable fields;
* reject the selection otherwise.

### 14.4 Validation rules for signable templates

At attach time:

* resolve required variable keys;
* resolve required signatory platform roles;
* validate all required variable keys are supported;
* validate all platform roles belong to the allowed deal-closing role registry;
* validate the template contains signable fields;
* reject the selection otherwise.

### 14.5 Supported signatory role registry

For v1, the allowed platform roles for signable deal documents are:

* `lender_primary`
* `borrower_primary`
* `borrower_co_1`
* `borrower_co_2`
* `broker_of_record`
* `assigned_broker`
* `lawyer_primary`

No other signatory platform roles are allowed in mortgage-attached signable blueprints for this feature.

The current document engine already validates caller-supplied signatory mappings and signable field metadata, so the origination attachment layer should constrain template selection to this registry rather than weakening the engine. ([GitHub][16])

---

## 15. Deal-time package materialization

The current deal machine already declares `createDocumentPackage` as the effect on `DEAL_LOCKED` and `archiveSignedDocuments` on `ALL_PARTIES_SIGNED`. This feature fills in those seams instead of inventing a parallel workflow. ([GitHub][17])

## 15.1 `createDocumentPackage` becomes authoritative

On `DEAL_LOCKED`, `createDocumentPackage` MUST:

1. Idempotently create `dealDocumentPackages` for the deal.
2. Load all active non-public mortgage document blueprints for the mortgage.
3. Resolve the canonical participant snapshot.
4. Resolve the canonical variable bag.
5. Resolve the canonical signatory map.
6. Materialize document instances by class.
7. Mark the package ready, partial failure, or failed.

## 15.2 Participant snapshot resolver

Create one internal query:

```ts
resolveDealParticipantSnapshot(dealId: Id<"deals">): {
  lender: { lenderId: Id<"lenders">; userId: Id<"users">; fullName: string; email: string };
  borrowers: Array<{ borrowerId: Id<"borrowers">; userId: Id<"users">; role: string; fullName: string; email: string }>;
  brokerOfRecord: { brokerId: Id<"brokers">; userId: Id<"users">; fullName: string; email: string };
  assignedBroker?: { brokerId: Id<"brokers">; userId: Id<"users">; fullName: string; email: string };
  lawyerPrimary?: { userId?: Id<"users">; fullName: string; email: string; lawyerType: "platform_lawyer" | "guest_lawyer" };
  mortgage: Doc<"mortgages">;
  property: Doc<"properties">;
  listing?: Doc<"listings">;
}
```

### Hard rule

This resolver is mandatory before signable docs ship.

## 15.3 Variable resolver

Create:

```ts
resolveDealDocumentVariables(dealId: Id<"deals">): Record<string, string>
```

This function is the only source of interpolation values for deal-time template generation.

It MUST source values from canonical domain records, not portal form state.

At minimum it must provide:

* lender full name and email
* primary borrower full name and email
* co-borrower names/emails where present
* broker of record full name and email
* assigned broker full name and email where present
* lawyer full name and email
* property address fields
* mortgage economic fields
* mortgage dates
* listing/public-facing copy fields where templates need them

## 15.4 Signatory resolver

Create:

```ts
resolveDealDocumentSignatories(dealId: Id<"deals">): Array<{
  platformRole: string;
  name: string;
  email: string;
}>
```

This function MUST map the supported registry roles to real participant identities.

## 15.5 Package materialization by document class

### For `private_static`

* create one `dealDocumentInstance` per blueprint
* set `kind = "static_reference"`
* point to the original `documentAssets` row
* copy blueprint metadata into `sourceBlueprintSnapshot`
* set status `available`

### For `private_templated_non_signable`

* call the existing document generation engine with pinned `templateId + version`
* pass `variables` from `resolveDealDocumentVariables`
* persist a `generatedDocuments` row with:

  * `entityType = "deal"`
  * `entityId = String(dealId)`
  * `signingStatus = "not_applicable"`
* create a `dealDocumentInstance`
* set status `available`

### For `private_templated_signable`

* call the document generation engine with pinned `templateId + version`
* pass both variables and signatory mappings
* persist `generatedDocuments`
* create a provider envelope through the signature provider seam
* persist `signatureEnvelopes` and `signatureRecipients`
* set `generatedDocuments.documensoEnvelopeId`
* set `generatedDocuments.signingStatus` to `draft` or `sent` based on provider outcome
* create a `dealDocumentInstance`
* set status accordingly

### Failure semantics

* One document failure MUST NOT roll back the entire deal lock.
* The package row MUST surface partial failure.
* Each failed instance MUST surface its own status and error.
* The portal and admin UI MUST expose retry controls for failed generation or envelope creation.

---

## 16. Signature provider and Documenso contract

Implement a provider seam, not direct portal calls to Documenso.

```ts
interface SignatureProvider {
  createEnvelope(input: {
    generatedDocumentId: Id<"generatedDocuments">;
    dealId: Id<"deals">;
    pdfStorageId: Id<"_storage">;
    title: string;
    recipients: Array<{
      platformRole: string;
      name: string;
      email: string;
      providerRole: "SIGNER" | "APPROVER" | "VIEWER";
      signingOrder: number;
    }>;
    metadata?: Record<string, string>;
  }): Promise<{
    providerEnvelopeId: string;
    status: "draft" | "sent";
    recipients: Array<{
      platformRole: string;
      providerRecipientId?: string;
    }>;
  }>;

  createEmbeddedSigningSession(input: {
    providerEnvelopeId: string;
    providerRecipientId: string;
  }): Promise<{
    url: string;
    expiresAt: number;
  }>;

  syncEnvelope(input: {
    providerEnvelopeId: string;
  }): Promise<{
    envelopeStatus: SignatureEnvelopeStatus;
    recipients: Array<{
      providerRecipientId: string;
      status: SignatureRecipientStatus;
      openedAt?: number;
      signedAt?: number;
      declinedAt?: number;
    }>;
  }>;

  downloadCompletedArtifacts(input: {
    providerEnvelopeId: string;
  }): Promise<{
    finalPdfBytes: ArrayBuffer;
    completionCertificateBytes?: ArrayBuffer;
  }>;
}
```

### v1 provider

* `documenso`

### Hard rules

* The portal MUST never talk directly to Documenso.
* The portal MUST never receive a provider admin URL.
* Embedded signing sessions MUST be requested from the backend only after:

  * `assertDealAccess(user, dealId)` passes;
  * the user matches a `signatureRecipient`.

---

## 17. `archiveSignedDocuments` effect

On `ALL_PARTIES_SIGNED`, `archiveSignedDocuments` MUST:

1. Find all signable generated documents for the deal.

2. For each completed envelope:

   * download the final signed PDF;
   * upload it into `_storage`;
   * optionally upload the completion certificate;
   * patch `generatedDocuments.finalPdfStorageId`;
   * patch `generatedDocuments.completionCertificateStorageId` if present;
   * patch `generatedDocuments.signingCompletedAt`;
   * patch `dealDocumentInstances.status = "signed"` or `archived`.

3. Mark the package `archived` once all signable instances are archived.

### Hard rule

Signed artifacts MUST be stored back in platform-controlled storage. Documenso remains the signing provider, not the long-term document store.

---

## 18. Access control

## 18.1 Listing public docs

Public static docs are visible on the listing detail page to authenticated lender-facing viewers of that listing.

Access path:

* `listingId -> mortgageId -> active public_static blueprints -> documentAssets -> signed URL`

### Hard rules

* Do not expose raw `_storage` IDs directly as the long-term client contract.
* Use signed URLs or equivalent ephemeral file access.
* Admin and broker preview is allowed through admin authorization, but the primary surface is the authenticated lender listing detail page.

## 18.2 Deal-private docs

Private static docs and all deal-generated templated docs are visible only to:

* active deal participants via `dealAccess`
* FairLend staff/admin via existing admin bypass

This includes:

* lender
* borrower
* lawyer
* broker of record
* assigned broker

### Hard rule

Broker visibility must be explicit via `dealAccess`, not implied through backdoor reads.

## 18.3 Embedded signing

A user may access embedded signing only when both are true:

* the user has valid deal access;
* the user corresponds to a `signatureRecipient`.

---

## 19. RBAC

This feature MUST use the role/permission direction already emerging on `04-14-broker-portal-demo`.

### Required permissions

* `mortgage:originate`

  * create/update/commit origination cases
  * edit mortgage-owned blueprints
* `payment:manage`

  * activate/retry provider-managed collection setup
  * fix collection setup failures
* `document:upload`

  * upload static origination docs
* `document:generate`

  * attach templated blueprints and trigger package regeneration/retries
* `listing:manage`

  * curate/publish listing after projection
* `deal:view`

  * read package status and deal-private docs where participant-scoped
* `deal:manage`

  * admin-only deal-document retries/overrides

### Hard rule

`listing:create` must no longer be the authority that creates mortgage-backed listings in production. Mortgage-backed listing creation becomes an internal effect of canonical mortgage activation.

The current permissions catalog already includes `mortgage:originate`, `payment:manage`, `document:upload`, `document:review`, `document:generate`, `deal:view`, `deal:manage`, `listing:create`, and `listing:manage`. ([GitHub][18])

---

## 20. Admin UI specification

The UI MUST be built as a specialized operational workflow inside the new admin shell.

### Routes

Recommended routes:

* `/admin/originations`
* `/admin/originations/new`
* `/admin/originations/$caseId`

### Shell integration

This should target the registry-driven admin shell / `AdminEntityViewPage` direction rather than extend the legacy `listEntityRows` query path. The current public PR stack is already moving there, while the old admin query still lacks borrower coverage and returns empty listings. ([GitHub][5])

### Workflow UI

The workflow MUST have:

1. Participants
2. Property + valuation
3. Mortgage terms
4. Collections
5. Documents
6. Listing curation
7. Review + commit

### Required UX behaviors

* Draft autosave to `adminOriginationCases`
* Persistent stepper/sidebar
* Validation surfaced per step and on final review
* Explicit “identity pending” state when WorkOS provisioning has been requested but not yet synced
* Explicit “collection setup failed” banner if Rotessa activation fails after commit
* Post-commit redirect to mortgage detail page
* Links from mortgage detail to listing detail and borrower detail rows

### Mortgage detail page enhancements

After commit, the mortgage detail view MUST expose at least these tabs/sections:

* Summary
* Borrowers
* Payment setup
* Listing projection
* Documents
* Audit

### Documents tab on mortgage detail

It MUST show:

* Public listing docs
* Private static deal docs
* Private templated non-signable blueprints
* Private templated signable blueprints
* Blueprint status and version info
* Edit/archive actions

### Listing detail page enhancement

The lender-facing listing detail page MUST show:

* public docs section driven by active mortgage public blueprints
* title, description, and other listing-curated fields from listing row
* no deal-private docs

### Deal portal enhancement

The deal portal MUST show:

* private static docs section
* generated read-only docs section
* signable docs section
* embedded-signing launch buttons/status per recipient
* package status and retry/errors for admins

---

## 21. Current code that must be deprecated or narrowed

The following paths are demo-only or wrong for production and must be removed, narrowed, or explicitly gated:

1. Generic mortgage-backed listing creation via the general listing create path
2. Any reliance on `seedMortgage` or other seed/demo mutations for production construction
3. Any direct mortgage insert path that bypasses the canonical activation constructor
4. Any direct listing document authoring on listing rows as long-term truth
5. Any attempt to extend `mortgage.machine.ts` with admin draft states
6. Any direct recurring collection initiation via generic `pad_rotessa` transfer provider
7. Any signable-doc implementation that binds the mortgage to live mutable template-group references

---

## 22. Implementation module layout

Recommended backend module layout:

```txt
convex/
  admin/origination/
    cases.ts
    caseDocuments.ts
    commit.ts
    validators.ts

  borrowers/
    resolveOrProvisionForOrigination.ts

  mortgages/
    activateMortgageAggregate.ts
    provenance.ts
    valuation.ts

  listings/
    projection.ts
    publicDocuments.ts

  documents/
    assets.ts
    mortgageBlueprints.ts
    dealPackages.ts
    signature/
      provider.ts
      documenso.ts
      sessions.ts
      webhooks.ts
      archive.ts

  payments/
    origination/
      bootstrap.ts
      activateCollections.ts
```

Recommended frontend layout:

```txt
src/routes/admin/originations/
  route.tsx
  new.tsx
  $caseId.tsx

src/components/admin/origination/
  OriginationStepper.tsx
  ParticipantsStep.tsx
  PropertyStep.tsx
  MortgageTermsStep.tsx
  CollectionsStep.tsx
  DocumentsStep.tsx
  ListingCurationStep.tsx
  ReviewStep.tsx
```

---

## 23. Global acceptance criteria

This feature is complete only when all of the following are true.

1. An admin can create and save an origination case draft from the admin shell.
2. An admin can commit a case into canonical borrower/property/mortgage/listing rows from one workflow.
3. The created mortgage is a normal mortgage row in the canonical servicing shape and all later transitions continue through GT. ([GitHub][2])
4. The created listing is a `mortgage_pipeline` projection and is unique per mortgage. ([GitHub][11])
5. Borrowers are created/resolved through WorkOS-backed identity, never by fabricating `users` directly.
6. The mortgage has `mortgageBorrowers` rows for all participants. ([GitHub][3])
7. The mortgage has initial obligations and collection plan entries visible in the payment/admin surfaces.
8. No collection attempts or transfer requests are created during origination commit.
9. If immediate Rotessa activation is selected and succeeds, plan entries become `provider_scheduled` and the mortgage is patched to `provider_managed`. ([GitHub][13])
10. If immediate Rotessa activation fails, the mortgage still exists and the UI shows a retryable collection setup error.
11. Public static docs authored in origination appear on the listing detail page for authenticated lender-facing viewers.
12. Private static docs do not appear on the listing; they appear only after a deal locks and only in the deal portal.
13. Templated non-signable docs are generated onto the deal package on `DEAL_LOCKED`.
14. Templated signable docs are generated onto the deal package on `DEAL_LOCKED`, create envelopes, and are signable in the deal portal.
15. Signed artifacts are archived back into platform storage on `ALL_PARTIES_SIGNED`.
16. Existing deals do not change if mortgage document blueprints are edited later.
17. Brokers involved in a deal can access deal-private docs only through explicit deal access, not admin bypass.
18. The generic mortgage-backed listing create path is no longer a production authoring entrypoint.
19. The legacy empty-listing admin query path is not the authoritative UI for this workflow. ([GitHub][19])

---

## 24. High-level implementation plan with manual checkpoints

This is the execution order I would use for the next two days.

## Phase 1 — Origination case scaffold and UI skeleton

### Goal

Create the admin origination workspace, draft persistence, and step navigation with zero domain commit logic yet.

### Backend work

* add `adminOriginationCases`
* add CRUD/query mutations and queries for case drafts
* add validation and autosave
* add empty `originationCaseDocumentDrafts` table

### UI work

* add `/admin/originations/new`
* render seven-step workflow shell
* each step saves draft data
* review page renders staged summary
* no commit button logic yet

### Manual checkpoint

A human can:

* open `/admin/originations/new`
* enter borrower/property/mortgage/listing draft data
* refresh the page
* see the draft restored exactly
* move between steps without losing data

### Definition of done

* case drafts persist
* validation errors render per-step
* stepper navigation works
* no fake data
* no domain rows are created yet

---

## Phase 2 — Canonical borrower/property/mortgage activation without payments or docs

### Goal

Commit an origination case into canonical borrower/property/mortgage rows and `mortgageBorrowers`.

### Backend work

* implement borrower resolve/provision helper
* implement canonical mortgage activation mutation
* add mortgage provenance fields
* add idempotency lookup
* create property row or reuse property
* create mortgage row in `active`
* create `mortgageBorrowers`
* create valuation snapshot
* write origination audit

### UI work

* enable Commit
* show commit progress states
* redirect to mortgage detail on success
* show linked borrower rows and property row

### Manual checkpoint

A human can:

* complete a draft case
* commit it
* land on a real mortgage detail page
* inspect borrower rows, property row, and mortgage row in admin
* confirm the mortgage status is `active`

### Definition of done

* no duplicate mortgages on double-submit
* mortgage is canonical, not demo-only
* primary borrower is resolved correctly
* provenance fields are populated

---

## Phase 3 — Listing projection and public-doc compatibility projection

### Goal

Auto-create the listing draft projection and wire listing public-doc projection compatibility.

### Backend work

* implement `upsertMortgageListingProjection`
* create listing draft on origination commit
* add `mortgageValuationSnapshots` read into projector
* add `syncListingPublicDocumentsProjection`
* narrow generic listing create path so `mortgage_pipeline` creation becomes internal-only

### UI work

* mortgage detail page shows linked listing
* listing detail/admin view renders projected mortgage/property fields
* listing curation fields editable from admin after projection

### Manual checkpoint

A human can:

* commit a mortgage
* open the linked listing
* see projected economics, property facts, appraisal summary, and curated listing fields
* confirm one mortgage creates exactly one listing

### Definition of done

* projector is idempotent
* curated fields survive projector refresh
* generic mortgage-backed create path is no longer the production path

---

## Phase 4 — Payment bootstrap integration

### Goal

Origination creates real obligations and collection plan entries through the existing Active Mortgage Payment System.

### Backend work

* implement shared initial obligation generator
* integrate with `collectionPlan/initialScheduling`
* initialize mortgage `collectionExecutionMode = "app_owned"`
* surface schedule-rule warning when missing
* do not create attempts or transfer requests

### UI work

* mortgage detail page shows payment setup summary
* obligations list visible from mortgage/admin
* collection plan entries visible from mortgage/admin
* show schedule-rule warning chip if applicable

### Manual checkpoint

A human can:

* commit a mortgage
* open obligations and see scheduled obligations
* open collection plan entries and see `planned` entries
* verify no collection attempts exist yet

### Definition of done

* payment bootstrap is canonical and repeatable
* no side-channel payment tables are introduced
* obligations and plan entries are created inside the same business path as future mortgages

---

## Phase 5 — Immediate Rotessa activation

### Goal

Allow the admin to activate provider-managed recurring collections at origination time.

### Backend work

* wire the post-commit action into the existing recurring-schedule activation action
* require primary-borrower-owned validated bank account with active mandate
* handle failures non-transactionally
* persist retryable case error state
* add retry mutation/action

### UI work

* collections step supports:

  * none
  * manual/app-owned only
  * provider-managed now
* show status badges:

  * pending
  * activating
  * active
  * failed
* show retry button on failure

### Manual checkpoint

A human can:

* choose a valid borrower bank account
* commit a mortgage
* see plan entries convert to `provider_scheduled`
* see mortgage execution mode become `provider_managed`
* also test an invalid setup and see the mortgage still commit while collections show failed

### Definition of done

* successful activation uses existing recurring adapter
* failed activation does not roll back origination
* no direct recurring `initiateTransfer` path is added

---

## Phase 6 — Mortgage document blueprints and public/private static docs

### Goal

Author static docs during origination and create mortgage-owned blueprints.

### Backend work

* add `documentAssets`
* add `mortgageDocumentBlueprints`
* convert `originationCaseDocumentDrafts` into blueprints on commit
* add public-doc listing query
* add deal-private static-doc materialization logic skeleton

### UI work

* Documents step supports static uploads in public/private sections
* mortgage detail documents tab shows blueprints
* listing detail page shows public docs section for authenticated lender-facing reads

### Manual checkpoint

A human can:

* upload one public static doc and one private static doc during origination
* commit the mortgage
* see both blueprint rows on mortgage detail
* open listing detail and see only the public doc
* confirm the private doc is not present on listing detail

### Definition of done

* blueprint ownership is mortgage-side
* listing doc visibility is projection-driven
* static private docs are stored but not yet deal-visible until phase 7

---

## Phase 7 — Deal-time package materialization for private static + non-signable templated docs

### Goal

Create deal document packages on `DEAL_LOCKED` and materialize private static plus non-signable generated docs.

### Backend work

* add `dealDocumentPackages`
* add `dealDocumentInstances`
* implement `resolveDealParticipantSnapshot`
* implement `resolveDealDocumentVariables`
* implement `createDocumentPackage` effect
* materialize private static docs
* generate non-signable templated docs onto the deal

### UI work

* deal portal/admin deal page shows package status
* deal portal shows:

  * private static docs
  * generated read-only docs
* admin shows retry controls for failed generation

### Manual checkpoint

A human can:

* create a mortgage with private static and non-signable template blueprints
* lock the listing into a deal
* open the deal portal/admin deal page
* see the package rows appear automatically
* open/read the private docs and generated non-signable PDFs

### Definition of done

* package creation is idempotent on `dealId`
* existing deals snapshot blueprint membership at lock time
* listing page still shows only public docs

---

## Phase 8 — Signable docs, Documenso envelopes, and embedded signing

### Goal

Generate signable docs on deal lock and expose embedded signing in the deal portal.

### Backend work

* add `signatureEnvelopes`
* add `signatureRecipients`
* implement Documenso provider
* create signable envelopes in `createDocumentPackage`
* implement embedded-signing session creation
* implement provider webhook ingestion
* map provider statuses into normalized rows and `generatedDocuments.signingStatus`

### UI work

* deal portal signable-doc section
* “Start signing” buttons for matching recipients
* embedded signing modal/frame
* recipient status chips
* admin envelope status/retry view

### Manual checkpoint

A human can:

* lock a listing with signable blueprints
* open the deal portal as an eligible participant
* launch embedded signing
* complete at least one signature
* see statuses update in real time

### Definition of done

* no direct frontend-to-provider coupling
* only intended recipients can sign
* statuses persist across refresh and portal sessions

---

## Phase 9 — Signed archive, broker deal visibility, and demo hardening

### Goal

Archive signed artifacts back into platform storage, finalize broker access, and remove remaining demo-only footguns.

### Backend work

* implement `archiveSignedDocuments`
* extend `dealAccess` roles for broker visibility
* archive final signed PDFs and completion certificates
* patch `generatedDocuments.finalPdfStorageId`
* remove or gate deprecated mortgage-backed listing-create entrypoints
* add smoke/integration tests across origination -> deal lock -> signing

### UI work

* deal portal/admin page shows archived signed artifacts
* broker-facing deal view can read deal-private docs if broker is involved
* final stakeholder-demo polish:

  * clearer banners
  * status chips
  * audit breadcrumbs
  * empty/loading states

### Manual checkpoint

A human can:

* complete a signable deal flow end-to-end
* see signed PDFs archived
* open the final archived file from the platform
* verify broker visibility only where broker is explicitly part of the deal
* verify the old standalone mortgage-backed listing create path is gone or blocked

### Definition of done

* end-to-end stakeholder demo works
* all four document classes behave correctly
* payment setup, listing projection, and deal portal are visibly coherent
* no demo-only creation path remains as the primary production entrypoint

---

## 25. Stakeholder-demo script this plan unlocks

By the end of phases 1 through 9, the investor/stakeholder demo path is:

1. Admin opens one origination workflow.
2. Admin creates borrower(s), property, mortgage terms, payment setup, and document blueprints.
3. Admin commits and lands on a real mortgage detail page.
4. Listing draft is auto-created from the mortgage.
5. Admin publishes/curates the listing.
6. Authenticated lender sees public origination docs on the listing detail page.
7. Lender locks the listing and a deal is created.
8. Deal package materializes automatically:

   * private static docs appear;
   * non-signable templated docs appear;
   * signable docs are ready in embedded signing.
9. Participants sign.
10. Signed artifacts are archived back into platform storage.
11. Mortgage collections are already wired to the existing payment architecture and, if selected, provider-managed recurring Rotessa setup is active.

That is the clean production shape, and it is also the cleanest demo shape.

[1]: https://github.com/Connorbelez/tanstackTemplate/pull/397?utm_source=chatgpt.com "auth fix by Connorbelez · Pull Request #397 · Connorbelez/tanstackTemplate · GitHub"
[2]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/engine/machines/mortgage.machine.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/engine/machines/mortgage.machine.ts"
[3]: https://raw.githubusercontent.com/Connorbelez/tanstackTemplate/main/convex/schema.ts "https://raw.githubusercontent.com/Connorbelez/tanstackTemplate/main/convex/schema.ts"
[4]: https://raw.githubusercontent.com/Connorbelez/tanstackTemplate/main/convex/payments/collectionPlan/initialScheduling.ts "https://raw.githubusercontent.com/Connorbelez/tanstackTemplate/main/convex/payments/collectionPlan/initialScheduling.ts"
[5]: https://github.com/Connorbelez/tanstackTemplate/pull/367 "https://github.com/Connorbelez/tanstackTemplate/pull/367"
[6]: https://rotessa.com/docs/ "https://rotessa.com/docs/"
[7]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/deals/queries.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/deals/queries.ts"
[8]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/documentEngine/templates.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/documentEngine/templates.ts"
[9]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/deals/accessCheck.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/deals/accessCheck.ts"
[10]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/schema.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/schema.ts"
[11]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/listings/create.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/listings/create.ts"
[12]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/collectionPlan/execution.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/collectionPlan/execution.ts"
[13]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/recurringSchedules/activation.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/recurringSchedules/activation.ts"
[14]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/bankAccounts/validation.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/bankAccounts/validation.ts"
[15]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/transfers/providers/rotessa.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/payments/transfers/providers/rotessa.ts"
[16]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/documentEngine/generation.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/documentEngine/generation.ts"
[17]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/engine/machines/deal.machine.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/engine/machines/deal.machine.ts"
[18]: https://github.com/Connorbelez/tanstackTemplate/blob/04-14-broker-portal-demo/src/test/auth/permissions.ts "https://github.com/Connorbelez/tanstackTemplate/blob/04-14-broker-portal-demo/src/test/auth/permissions.ts"
[19]: https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/admin/queries.ts "https://github.com/Connorbelez/tanstackTemplate/blob/main/convex/admin/queries.ts"
