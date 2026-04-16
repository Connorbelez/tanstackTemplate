
# SPEC HEADER

- **Spec number:** 6
- **Exact title:** Mortgage document blueprints and public/private static docs
- **Recommended filename:** `phase-06-mortgage-document-blueprints-and-public-private-static-docs.md`
- **Primary objective:** Implement document assets, origination-time document draft authoring, mortgage-owned blueprint creation, blueprint archival/edit behavior, and authoritative lender-facing reads for public static listing docs.
- **Why this phase exists:** The master spec rejects listing-owned documents, live mutable template-group refs, and mortgage-level deal-private docs visible forever. Mortgage origination documents must be authored as mortgage-owned blueprints that later materialize into deal-scoped packages. This phase establishes that truth model.
- **Why this phase is separately parallelizable:** This phase owns document assets, draft authoring rules, blueprint tables, and listing-facing public document reads. It does not own deal package materialization, signature envelopes, embedded signing, or signed archive behavior.

# PHASE OWNERSHIP

## What this phase owns

- `documentAssets`.
- The semantic ownership of `originationCaseDocumentDrafts`.
- Origination-time document authoring rules for all four document classes:
  - `public_static`
  - `private_static`
  - `private_templated_non_signable`
  - `private_templated_signable`
- Template version pinning and template-group expansion semantics.
- Validation of attached templates against the future deal-closing variable/signatory constraints.
- `mortgageDocumentBlueprints`.
- Blueprint creation during canonical origination commit.
- Blueprint archival/edit behavior after origination.
- Public listing document reads driven from mortgage-owned public blueprints and document assets.
- Mortgage detail documents tab.

## What this phase may touch but does not own

- `activateMortgageAggregate.ts` owned by phase 2, only to fill constructor step `10.7`.
- `syncListingPublicDocumentsProjection` owned by phase 3, because this phase must trigger compatibility sync after public blueprint changes.
- Deal-package generation files owned by phase 7; phase 6 may only create skeleton hooks, not the real package materialization.
- Signable package / Documenso / archive files owned by phases 8 and 9.

## What this phase must not redesign

- The blueprint → package → instance architecture.
- Deal-time package materialization on `DEAL_LOCKED`.
- Documenso / embedded signing.
- Signed archive behavior.
- Listing projection overwrite/preserve semantics owned by phase 3.

## Upstream prerequisites

- Phase 1 case table and documents-step shell.
- Phase 2 canonical constructor.
- Phase 3 listing public-doc compatibility sync.

## Downstream dependents

- Phase 7 consumes active non-public blueprints for package creation.
- Phase 8 consumes active signable blueprints.
- Phase 9 consumes blueprint immutability and public/private visibility rules during final hardening.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec introduces four exact mortgage-origination document classes:

1. **Public static docs**
   - admin-uploaded immutable PDFs,
   - shown on listing detail,
   - visible to authenticated lender-facing listing viewers,
   - mortgage-owned blueprint, listing-projected visibility.

2. **Private static docs**
   - read-only non-signable PDFs,
   - only visible after a deal exists,
   - mortgage-owned blueprint, materialized into a deal instance on `DEAL_LOCKED`.

3. **Private templated non-signable docs**
   - selected during origination,
   - pinned to a template version,
   - interpolated/generated when the deal locks,
   - not signable,
   - generated output attaches to the deal, not the mortgage.

4. **Private templated signable docs**
   - selected during origination,
   - pinned to a template version,
   - interpolated/generated when the deal locks,
   - signable through Documenso-backed embedded signing,
   - generated output attaches to the deal, not the mortgage.

The master spec also sets hard rules for authoring:

- Static PDF upload must store into `_storage`, create `documentAssets`, and create/update the corresponding `originationCaseDocumentDraft`.
- Selecting a template must resolve the current published version and pin `templateVersion`.
- Selecting a template group must expand immediately into one draft row per template reference; group metadata is UI-only.
- Non-signable template attachment must validate supported variable keys and reject signable fields.
- Signable template attachment must validate supported variable keys, supported signatory platform roles, and presence of signable fields.
- Allowed signatory platform roles are fixed for v1:
  - `lender_primary`
  - `borrower_primary`
  - `borrower_co_1`
  - `borrower_co_2`
  - `broker_of_record`
  - `assigned_broker`
  - `lawyer_primary`
- Blueprint rows are mortgage-owned truth and immutable except for archival.
- Editing mortgage documents after origination archives prior blueprint rows and inserts new rows.
- Existing deals never change when blueprints are edited later.
- `documentBasePdfs` MUST NOT be repurposed for end-user-facing artifacts.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Add `documentAssets`.
- Define the full semantic shape of `originationCaseDocumentDrafts`.
- Implement static PDF upload for public/private static docs.
- Implement template attachment for non-signable and signable docs, including immediate group expansion and version pinning.
- Validate attached templates against supported variable keys and allowed signatory roles.
- Add `mortgageDocumentBlueprints`.
- On canonical commit, convert all current case document drafts into mortgage-owned active blueprint rows.
- Add blueprint read, archive, and replacement behavior on mortgage detail.
- Add authoritative public listing document query:
  `listingId -> mortgageId -> active public blueprints -> documentAssets -> signed URL`
- Trigger the phase-3 compatibility sync for `listings.publicDocumentIds` after public blueprint changes.
- Show public listing docs on the listing detail page for authenticated lender-facing viewers.
- Keep private docs off the listing page.
- Provide enough skeleton wiring that phase 7 can later materialize private static docs into deal packages without redesigning the blueprint model.

# OUT-OF-SCOPE

- Real `DEAL_LOCKED` package creation.
- `dealDocumentPackages` and `dealDocumentInstances`.
- `signatureEnvelopes`, `signatureRecipients`, provider sessions, provider webhooks, or archive behavior.
- Embedded signing UI.
- Broker deal-access role expansion.
- Any lazy client-side document generation.

# AUTHORITATIVE RULES AND INVARIANTS

- Mortgage origination documents are authored as mortgage-owned blueprints.
- Listing rows are NOT the authoring truth for mortgage documents.
- `documentAssets` are immutable end-user-facing stored artifacts.
- `documentBasePdfs` remain reusable template inputs and MUST NOT be repurposed.
- Template groups MUST expand immediately into pinned per-template draft rows.
- Template versions MUST always be pinned at attachment time.
- `private_templated_non_signable` drafts MUST NOT contain signable fields.
- `private_templated_signable` drafts MUST contain signable fields and supported signatory roles.
- Only the allowed signatory registry may be used.
- Blueprint rows are immutable except for archival.
- Blueprint edits MUST archive old rows and insert new rows.
- Existing deals MUST NEVER change when blueprints change later.
- Public listing docs are visible only on the lender-facing listing detail path and must use signed URLs or equivalent ephemeral access, not raw `_storage` IDs.
- Private docs MUST NOT appear on the listing page.

# DOMAIN / DATA / CONTRACT CHANGES

## `documentAssets`

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

## `originationCaseDocumentDrafts`

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

  assetId?: Id<"documentAssets">;

  templateId?: Id<"documentTemplates">;
  templateVersion?: number;

  packageKey?: string;
  packageLabel?: string;
  selectedFromGroupId?: Id<"documentTemplateGroups">;

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

## `mortgageDocumentBlueprints`

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

  assetId?: Id<"documentAssets">;

  templateId?: Id<"documentTemplates">;
  templateVersion?: number;

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

## Allowed signatory platform-role registry

```ts
const ALLOWED_MORTGAGE_SIGNATORY_PLATFORM_ROLES = [
  "lender_primary",
  "borrower_primary",
  "borrower_co_1",
  "borrower_co_2",
  "broker_of_record",
  "assigned_broker",
  "lawyer_primary",
] as const;
```

This phase owns the registry constant and later phases MUST consume it rather than inventing a second list.

# BACKEND WORK

## 1. Add asset and blueprint modules

- Add `convex/documents/assets.ts`.
- Add `convex/documents/mortgageBlueprints.ts`.
- Add or extend `convex/admin/origination/caseDocuments.ts`.

## 2. Static upload flow

When the admin uploads a static PDF:

1. Store the file in `_storage`.
2. Create a `documentAssets` row with `source = "admin_upload"`.
3. Create or update the matching `originationCaseDocumentDraft` row.

Apply this flow separately for public static and private static sections.

## 3. Template attachment flow

### Single template selection

- Resolve the current published version.
- Create a draft row with pinned `templateVersion`.

### Template group selection

- Expand immediately into one draft row per template reference.
- If the group reference has `pinnedVersion`, use it.
- Otherwise pin the current published version at selection time.
- Keep group metadata only for UI grouping and audit context.

## 4. Template validation

### For `private_templated_non_signable`

At attach time:

- resolve required variable keys from the pinned version,
- validate all required keys are supported by the deal-closing variable resolver contract,
- validate the template has no signable fields,
- reject otherwise.

### For `private_templated_signable`

At attach time:

- resolve required variable keys,
- resolve required signatory platform roles,
- validate all required variable keys are supported,
- validate every required platform role is in the allowed registry,
- validate the template contains signable fields,
- reject otherwise.

### Variable-support validation contract

Phase 7 owns the authoritative runtime variable resolver. This phase must not create a second independent resolver. The safest implementation is to centralize “supported variable keys” in a shared contract module that phase 7 later uses to build the actual resolver.

## 5. Blueprint creation on commit

Modify `activateMortgageAggregate` in the reserved seam so it:

1. loads all `originationCaseDocumentDrafts` for the case,
2. inserts `mortgageDocumentBlueprints`,
3. maps classes exactly:
   - public static draft -> `public_static` active blueprint,
   - private static draft -> `private_static` active blueprint,
   - non-signable template draft -> `private_templated_non_signable` active blueprint,
   - signable template draft -> `private_templated_signable` active blueprint,
4. returns `publicBlueprintCount` and `dealBlueprintCount`.

## 6. Blueprint archival / replacement

- Editing mortgage documents after origination MUST archive prior blueprint rows and insert new ones.
- Never mutate blueprint rows in place beyond archival metadata.
- Re-run phase-3 `syncListingPublicDocumentsProjection` whenever active public blueprints change.

## 7. Listing public-doc query

Implement an authoritative read path that:

- accepts `listingId`,
- resolves `mortgageId`,
- loads active `public_static` blueprints,
- resolves `documentAssets`,
- returns signed URLs or equivalent ephemeral access handles,
- does not expose raw `_storage` IDs as the long-term client contract.

# FRONTEND / UI WORK

- Extend `DocumentsStep.tsx` to contain four real sections:
  1. Public static docs
  2. Private static docs
  3. Private templated non-signable docs
  4. Private templated signable docs
- Support public/private static uploads.
- Support template and template-group attachment.
- Show pinned version info for attached templates.
- Show attach-time validation errors for unsupported variables/roles or wrong signable-field state.
- Extend mortgage detail documents tab so it shows:
  - public listing docs,
  - private static deal docs,
  - private templated non-signable blueprints,
  - private templated signable blueprints,
  - blueprint status and version info,
  - archive/edit actions.
- Extend the lender-facing listing detail page so it shows public docs from active public blueprints.
- Ensure the listing page shows **no** private docs.

# ADDITIVE UI / UX DESIGN, CORE FLOWS, AND ASCII MOCKUPS

## Dashboard-shell integration requirements for this phase

This phase materially changes three UI surfaces:

1. the origination `Documents` step inside the admin origination workflow,
2. the mortgage detail `Documents` tab/section inside the dashboard shell,
3. admin-facing listing detail public-document visibility.

All admin-facing versions of these surfaces MUST use the existing dashboard shell with:

- persistent global sidebar,
- breadcrumb header,
- page title/action row,
- card/table body composition.

Do not invent a separate document-management shell. The document authoring experience is part of origination and mortgage detail, not a parallel CMS.

Where the repo also has a lender-facing/public listing page outside the admin shell, preserve that page’s existing outer chrome. The dashboard-shell requirement applies to the admin-facing authoring and inspection surfaces.

Recommended breadcrumb patterns:

- origination docs step: `Admin / Originations / Case {caseId}`
- mortgage detail docs: `Admin / Mortgages / {mortgageId} / Documents`
- listing detail admin view: `Admin / Listings / {listingId}`

## Origination `Documents` step information architecture

The documents step SHOULD become a document-authoring workspace with four stable section cards, in this exact order:

1. Public static docs
2. Private static docs
3. Private templated non-signable docs
4. Private templated signable docs

Each section SHOULD share the same internal pattern:

- section header,
- one-line explanation of visibility/materialization behavior,
- primary action,
- draft rows table/list,
- validation/error region.

ASCII mockup:

```text
┌────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Admin              │ Breadcrumbs: Admin / Originations / Case ORG-1042                      │
│ Mortgages          │ Origination case ORG-1042 → Documents                                  │
│ Listings           │ ───────────────────────────────────────────────────────────────────────│
│ Deals              │ ┌─────────────────────────────────────────────────────────────────────┐│
│ ...                │ │ Public static — immutable PDFs on listing [Upload PDF]              ││
│                    │ │ Appraisal Summary  appraisal  upload  Preview…                      ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Private static — materialize on deal lock [Upload]                  ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Private templated non-signable [Attach]                             ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Private templated signable [Attach]                                 ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

### Static-upload sections

`Public static` and `Private static` SHOULD use an upload card pattern with:

- drag/drop zone or standard file picker,
- immediate row creation after upload succeeds,
- row fields:
  - display name,
  - description/category,
  - original filename,
  - page count if available,
  - uploaded-at timestamp,
  - actions: preview, replace/remove-from-draft.

The UI MUST make class meaning obvious:

- public static → visible on listing,
- private static → only visible after a deal exists.

### Template-attachment sections

`Private templated non-signable` and `Private templated signable` SHOULD use an attach flow rather than file upload. Recommended primary-action label:

- `Attach template`
- optionally split-button or dropdown `Attach template` / `Attach template group`

When a template or template group is selected, the UI MUST show pinned-version information immediately on the created draft row. Group selection metadata may be shown as a badge (`From group: Closing package`), but the actual rows must appear individually because the authoritative truth is one draft per template version.

Recommended row fields:

- display name,
- template name,
- pinned version,
- package label/package key,
- required variables count,
- signable/signatory summary (for signable class),
- validation state,
- actions.

## Attachment drawer / picker behavior

Use a right-side drawer or modal picker that still feels like a normal dashboard subflow, not a separate page. Recommended drawer sections:

- `Templates`
- `Groups`

When a group is selected, show an inline preview of which templates will expand into rows.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Attach document template                                                                    │
│ [Templates] [Groups]                                                                        │
│                                                                                             │
│ Search: [___________________________]                                                       │
│                                                                                             │
│ Template/group     Ver.   Signable  Vars / roles                                            │
│ Loan commitment    v12    no        8 vars                                                  │
│ Investor direction v7     yes       lender_primary…                                         │
│ Closing pkg group  mixed  mixed     expands to 4                                            │
│                                                                                             │
│ Selected: Closing package group                                                             │
│ Will create:                                                                                │
│ - Investor direction (v7)                                                                   │
│ - Borrower certificate (v3)                                                                 │
│ - Lawyer undertaking (v11)                                                                  │
│ [Cancel]                          [Attach selected]                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Attach-time validation UX

Validation MUST be visible at attach time, not deferred silently to commit.

Recommended patterns:

- inline row-level error badge,
- expandable error details,
- drawer-level blocking error summary if selection cannot be attached.

Examples:

- unsupported variable keys,
- signable fields present in non-signable class,
- no signable fields present in signable class,
- unsupported signatory roles.

A failed attachment SHOULD NOT create a misleading draft row that looks valid.

## Mortgage detail `Documents` tab design

The mortgage detail page gains a real documents tab/section. It SHOULD group rows by class and status.

Recommended top controls:

- filter toggle: `Active` / `Archived`,
- optional class filter chips,
- action buttons such as `Add document`, `Replace`, `Archive` when the operator has permission.

Recommended layout:

- overview strip with counts:
  - public listing docs,
  - private static blueprints,
  - non-signable template blueprints,
  - signable template blueprints,
- grouped tables beneath.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Mortgage documents                                                                          │
│ Active: 7  Archived: 2  Public on listing: 2                                                │
│ [Active] [Archived]                          [Add]                                          │
│├───────────────────────────────────────────────────────────────────────────────────────────┤│
│ Public static                                                                               │
│ Name              Category   Status  Source        Actions                                  │
│ Appraisal summary appraisal  active  asset upload  Preview Archive                          │
│                                                                                             │
│ Private templated signable                                                                  │
│ Name               Ver  Roles           Status  Actions                                     │
│ Investor direction v7   lender_primary  active  Preview…                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Blueprint edit/replace UX

Because blueprint rows are immutable except for archival, the UI SHOULD make replacement feel like `Archive + add replacement`, not like inline destructive overwrite.

Recommended pattern:

- `Replace` action opens a guided flow,
- existing row remains visible with status `active`,
- after replacement completes, old row becomes `archived`, new row is inserted as `active`,
- the UI shows both in history.

Do not present inline freeform editing that suggests in-place mutation.

## Listing-detail public-doc section

Admin listing detail SHOULD show a `Public documents` card that is clearly read-only and projection-driven. Later phase 6 backend logic provides signed URLs.

Recommended row fields:

- document display name,
- category,
- source badge `Mortgage blueprint`,
- action `Open`.

The UI MUST show no private docs on the listing surface.

If there are no public docs, show an empty state that explains where they are authored:

```text
No public listing documents are currently projected.
Public listing docs are authored from the mortgage’s public document blueprints.
```

## Core user flows the UI MUST support

### Flow A — upload a public static document

1. Operator opens the origination documents step.
2. Uses `Upload PDF` in `Public static docs`.
3. Upload succeeds and a draft row appears immediately.
4. Operator sees the draft row with file metadata.
5. Later commit will transform it into a public static blueprint.

### Flow B — attach a template group

1. Operator opens `Private templated non-signable docs` or `Private templated signable docs`.
2. Clicks `Attach template` and chooses a group.
3. Drawer previews the expansion.
4. UI creates one row per template reference with pinned versions.
5. Validation state is shown on each row.

### Flow C — inspect and replace blueprints post-origination

1. Operator opens mortgage detail → Documents.
2. Sees active blueprints grouped by class.
3. Clicks `Replace` or `Archive`.
4. Old blueprint remains in history as archived; new active row appears.
5. Existing deals are not presented as if they were live-bound to the replacement.

## Interaction and visual-behavior rules

- The documents step SHOULD feel like a structured operational authoring screen, not a freeform file bucket.
- Keep section order fixed to the four document classes; that order reinforces the architecture.
- Use badges for `Public`, `Private`, `Templated`, `Signable`, `Version pinned`.
- Template-version information SHOULD be visible without opening a details modal.
- Archive history SHOULD be easy to inspect, because immutability is a core rule.
- Never show raw `_storage` IDs to users. Use names, metadata, and preview/open actions.
- Do not let the listing page surface private document classes even in admin mode unless a separate admin-only mortgage/deal screen is used.

## Merge-safe UI ownership notes

Later phases build directly on the surfaces introduced here:

- phase 7 materializes private static + non-signable deal docs from these blueprints,
- phase 8 adds signable-envelope/runtime status downstream from signable blueprints,
- phase 9 archives final signed artifacts.

Therefore the UI should stabilize the class grouping, row metadata, and mortgage-documents tab layout now.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Phase 1 case and documents step shell.
- Phase 2 canonical constructor.
- Existing document engine primitives:
  - `documentTemplates`,
  - immutable template versions,
  - template groups,
  - generated documents,
  - signable field metadata / signatory validation.

## Outputs this phase guarantees

- Immutable uploaded assets.
- Stable origination case document drafts.
- Mortgage-owned active blueprint rows.
- Stable blueprint archival model.
- Public listing document reads from mortgage-owned blueprints.
- Trigger points for phase 3 compatibility sync.

## Contracts exported for later phases

- `documentAssets`
- `originationCaseDocumentDrafts`
- `mortgageDocumentBlueprints`
- allowed signatory registry constant
- blueprint query and archive semantics
- authoritative public-doc read path

## Temporary compatibility bridges

- `listings.publicDocumentIds` remains a compatibility cache until every listing surface is fully blueprint-driven.
- Phase 7 will materialize private static docs onto deals; phase 6 must not shortcut that by exposing mortgage-level private docs on listings.
- Phase 8 will materialize signable docs; phase 6 must not create fake envelopes or fake deal instances.

## Idempotency / retry / failure semantics

- Re-uploading or reattaching a document should update or replace the staged draft safely without multiplying accidental duplicate draft rows.
- Group expansion must be deterministic and idempotent relative to the selected group/version set.
- Blueprint archival must preserve old blueprint rows rather than destructively rewriting them.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/documents/assets.ts`
  - `convex/documents/mortgageBlueprints.ts`
  - `convex/admin/origination/caseDocuments.ts`
  - listing public-doc query module
  - documents-step UI
  - mortgage detail documents tab
- **Shared but not owned**
  - `convex/mortgages/activateMortgageAggregate.ts`
  - `convex/listings/projection.ts` / public-doc compatibility sync
  - template engine core modules
- **Later phases may extend but not redesign**
  - public-doc listing query usage
  - blueprint consumption inside package generation
  - signable blueprint downstream materialization

# ACCEPTANCE CRITERIA

- Static PDF upload creates `_storage` + `documentAssets` + staged draft row.
- Template selection pins a version immediately.
- Template group selection expands immediately into pinned per-template draft rows.
- Unsupported variable keys or signatory roles are rejected at attach time.
- Public/private static and templated draft rows are converted into mortgage-owned blueprint rows on commit.
- Listing detail shows public docs only.
- Private docs are absent from the listing.
- Mortgage detail documents tab shows blueprint classes, statuses, and version info.
- Blueprint edits archive old rows and create new rows.
- Existing deal packages would remain unaffected by later blueprint changes.
- This phase satisfies global acceptance criterion 11 and enables criteria 12–16.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Upload one public static PDF and one private static PDF during origination.
2. Attach at least one non-signable template and one signable template, seeing version pins and validation behavior.
3. Commit the mortgage.
4. Open mortgage detail and see blueprint rows for all attached classes.
5. Open listing detail and see only the public document(s).
6. Confirm the private static document is not visible on the listing.
7. Archive or replace a public blueprint and confirm the old row is archived rather than overwritten.

# RISKS / EDGE CASES / FAILURE MODES

- Template groups are a major merge hazard if expanded lazily. Expand immediately at attachment time.
- It is easy to accidentally validate templates against a second, divergent variable/signatory registry. Do not create parallel registries.
- Blueprints must be immutable except archival. In-place edits will break the deal-snapshot guarantee.
- Listing surfaces must not expose raw `_storage` IDs or private docs.
- Do not treat `documentAssets` as reusable template base PDFs; that would collapse two distinct layers the master spec keeps separate.
- If public-blueprint changes do not re-trigger compatibility sync, `listings.publicDocumentIds` will drift.

# MERGE CONTRACT

After this phase is merged:

- Mortgage-side document truth exists as immutable blueprints.
- The admin origination workflow can attach all four document classes during origination.
- Public listing docs are visible from mortgage-owned public blueprints.
- Private docs remain off the listing and are ready for phase-7 materialization onto deals.
- Later phases must consume blueprints rather than inventing a second document-truth model.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not repurpose `documentBasePdfs`.
- Do not store live mutable template-group refs as mortgage truth.
- Do not author mortgage docs on listing rows.
- Do not mutate blueprint rows in place.
- Do not expose private docs on the listing page.
- Do not create fake deal-package rows in this phase.
