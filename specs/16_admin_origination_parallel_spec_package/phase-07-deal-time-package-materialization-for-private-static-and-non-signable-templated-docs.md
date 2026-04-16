
# SPEC HEADER

- **Spec number:** 7
- **Exact title:** Deal-time package materialization for private static + non-signable templated docs
- **Recommended filename:** `phase-07-deal-time-package-materialization-for-private-static-and-non-signable-templated-docs.md`
- **Primary objective:** Create immutable deal document packages on `DEAL_LOCKED` and materialize private static plus private templated non-signable document instances onto the deal.
- **Why this phase exists:** The master spec rejects mortgage-level deal-private docs that remain visible forever. Deal-private documents must be snapshotted into deal packages when a deal locks, and existing deals must never change when mortgage blueprints change later.
- **Why this phase is separately parallelizable:** This phase owns the package/instance data model, participant/variable resolution, and the static/non-signable branches of package creation. It does not own Documenso envelopes, embedded signing, or signed archive behavior.

# PHASE OWNERSHIP

## What this phase owns

- `dealDocumentPackages`.
- `dealDocumentInstances`.
- `resolveDealParticipantSnapshot(dealId)`.
- `resolveDealDocumentVariables(dealId)`.
- The authoritative `createDocumentPackage` effect on `DEAL_LOCKED` for:
  - `private_static`,
  - `private_templated_non_signable`.
- Package status transitions: `pending`, `ready`, `partial_failure`, `failed`, `archived` (with `archived` later completed in phase 9 when signed artifacts are archived).
- Deal portal/admin package surfaces for:
  - private static docs,
  - generated read-only docs,
  - package status,
  - retry controls for failed static/non-signable generation.

## What this phase may touch but does not own

- The deal machine effect registration point that already names `createDocumentPackage`.
- Mortgage blueprints owned by phase 6, only as read inputs.
- The signable branch contract of `createDocumentPackage`, but phase 8 owns the actual signable implementation and signature rows.
- Broker visibility behavior, which phase 9 finalizes through `dealAccess` role expansion.

## What this phase must not redesign

- The mortgage-owned blueprint truth model from phase 6.
- The provider seam / Documenso integration from phase 8.
- The signed archive effect from phase 9.
- The listing public-doc surface from phase 6.

## Upstream prerequisites

- Phase 6 blueprint infrastructure.
- Phase 2 canonical mortgage/property/borrower records and participant joins.
- Existing deal machine seam that triggers `createDocumentPackage` on `DEAL_LOCKED`.

## Downstream dependents

- Phase 8 extends `createDocumentPackage` with the signable branch and consumes `resolveDealParticipantSnapshot` / `resolveDealDocumentVariables`.
- Phase 9 consumes package rows and instance rows for archive and broker hardening.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec defines this phase very tightly:

- The existing deal machine already declares `createDocumentPackage` on `DEAL_LOCKED` and `archiveSignedDocuments` on `ALL_PARTIES_SIGNED`. This feature must fill those seams rather than invent a parallel workflow.
- `createDocumentPackage` is authoritative on `DEAL_LOCKED`.
- Package creation is idempotent on `dealId`.
- The package generator MUST load active non-public mortgage document blueprints.
- It MUST resolve a canonical participant snapshot and a canonical variable bag from domain truth, not from portal form state.
- One document failure MUST NOT roll back the entire deal lock.
- The package row must surface `partial_failure` or `failed`.
- Each failed instance must surface its own failure state.
- The deal portal MUST query `dealDocumentInstances`; it must not infer its document surface ad hoc from raw storage IDs, generated docs, and blueprints.
- Existing deals are immutable snapshots of blueprint membership and template versions at lock time.
- The signable branch exists conceptually in the master spec’s package materialization section, but phase 8 owns its real implementation. This phase must therefore structure `createDocumentPackage` so phase 8 can extend it without redesigning package semantics.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Add `dealDocumentPackages`.
- Add `dealDocumentInstances`.
- Implement `resolveDealParticipantSnapshot`.
- Implement `resolveDealDocumentVariables`.
- Implement `createDocumentPackage` for:
  - `private_static`,
  - `private_templated_non_signable`.
- Snapshot blueprint metadata into `sourceBlueprintSnapshot`.
- Create `generatedDocuments` rows for non-signable generated deal docs.
- Surface package status and retry behavior in admin/deal portal.
- Keep signable blueprints out of this phase’s finished behavior while reserving a stable seam for phase 8.

# OUT-OF-SCOPE

- `signatureEnvelopes`.
- `signatureRecipients`.
- `resolveDealDocumentSignatories` final implementation.
- Provider envelope creation.
- Embedded signing sessions.
- Provider webhooks / status sync.
- Signed artifact archive.
- Final broker `dealAccess` role expansion.

# AUTHORITATIVE RULES AND INVARIANTS

- `createDocumentPackage` on `DEAL_LOCKED` is authoritative.
- Package creation MUST be idempotent on `dealId`.
- Blueprint membership and pinned versions MUST be snapshotted at deal lock time.
- Existing deals MUST NEVER change when mortgage blueprints change later.
- The variable resolver MUST source values from canonical domain records, not portal form state.
- The participant resolver MUST expose typed canonical participants, not read-model strings.
- The deal portal MUST read `dealDocumentInstances`, not infer documents ad hoc.
- One document failure MUST NOT roll back the deal lock.
- Listing pages must continue showing only public docs; deal-private docs belong on the deal package surface.

# DOMAIN / DATA / CONTRACT CHANGES

## `dealDocumentPackages`

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

## `dealDocumentInstances`

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

  assetId?: Id<"documentAssets">;
  generatedDocumentId?: Id<"generatedDocuments">;

  createdAt: number;
  updatedAt: number;
}
```

## Canonical participant snapshot resolver

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

## Canonical variable resolver

```ts
resolveDealDocumentVariables(dealId: Id<"deals">): Record<string, string>
```

At minimum it must provide:

- lender full name and email,
- primary borrower full name and email,
- co-borrower names/emails where present,
- broker of record full name and email,
- assigned broker full name and email where present,
- lawyer full name and email,
- property address fields,
- mortgage economic fields,
- mortgage dates,
- listing/public-facing copy fields where templates need them.

## Reserved signatory resolver seam for phase 8

This phase must reserve a stable place for:

```ts
resolveDealDocumentSignatories(dealId: Id<"deals">): Array<{
  platformRole: string;
  name: string;
  email: string;
}>
```

Phase 8 owns actual signable-doc consumption of that resolver.

# BACKEND WORK

## 1. Add package tables

- Add `convex/documents/dealPackages.ts` or equivalent owner module.
- Add schema definitions for `dealDocumentPackages` and `dealDocumentInstances`.

## 2. Implement participant resolver

- Resolve canonical typed participant identities from domain truth.
- Do not rely on display-string read-model placeholders such as `buyerId: string`, `sellerId: string`, or `lawyerId: string`.
- The exact storage mechanism is flexible (typed fields on `deals`, `dealParticipants` table, or composed internal resolution), but the exported resolver contract is mandatory.

## 3. Implement variable resolver

- Build the interpolation bag exclusively from canonical domain records.
- Keep this resolver authoritative so phase 6 template-attachment validation can depend on the supported variable-key set.

## 4. Implement `createDocumentPackage`

On `DEAL_LOCKED`, the effect MUST:

1. Idempotently create or reuse the package header row.
2. Load all active **non-public** mortgage document blueprints for the mortgage.
3. Resolve the participant snapshot.
4. Resolve the variable bag.
5. Dispatch by blueprint class.

### `private_static` branch

For each private-static blueprint:

- create one `dealDocumentInstance`,
- set `kind = "static_reference"`,
- point to the original `documentAssets` row,
- copy blueprint metadata into `sourceBlueprintSnapshot`,
- set `status = "available"`.

### `private_templated_non_signable` branch

For each non-signable template blueprint:

- call the existing document generation engine with pinned `templateId + templateVersion`,
- pass `variables` from `resolveDealDocumentVariables`,
- persist a `generatedDocuments` row with:
  - `entityType = "deal"`
  - `entityId = String(dealId)`
  - `signingStatus = "not_applicable"`
- create the `dealDocumentInstance`,
- set `kind = "generated"`,
- set `status = "available"`.

### Reserved `private_templated_signable` branch for phase 8

This phase MUST structure class dispatch so phase 8 can add the signable branch without redesigning package headers, instance snapshots, or failure semantics. This phase MUST NOT create fake envelopes or mark signable docs available.

## 5. Package failure semantics

- If one document fails, do not rollback the deal lock.
- Set package `status = "partial_failure"` or `status = "failed"` as appropriate.
- Surface per-instance failure states.
- Record package `lastError` and increment `retryCount` as appropriate.
- Provide admin retry entrypoints for failed generation.

# FRONTEND / UI WORK

- Extend deal portal/admin deal page with package status.
- Show private static docs section.
- Show generated read-only docs section.
- Show admin retry controls for failed generation.
- Keep signable-doc UI placeholders or section framing stable so phase 8 can extend in place.
- Ensure listing detail pages still show only public docs.

# ADDITIVE UI / UX DESIGN, CORE FLOWS, AND ASCII MOCKUPS

## Dashboard-shell integration requirements for this phase

This phase adds package/document visibility to deal surfaces. The admin-facing deal screen MUST remain inside the existing dashboard shell:

- global sidebar unchanged,
- breadcrumb header in the normal shell header,
- package status and document sections rendered as standard dashboard cards/tables.

If the repo also has a participant-facing deal portal outside the dashboard shell, it MAY reuse the same document-section components/content ordering, but the admin dashboard layout defined here is the canonical implementation reference.

Recommended breadcrumb pattern:

- `Admin / Deals / {dealId}`

## Deal-page information architecture for document packages

The deal page SHOULD gain a dedicated `Documents` area with three consistent layers:

1. **Package overview / status**
2. **Private static documents**
3. **Generated read-only documents**
4. **Reserved signable section placeholder**

This ordering mirrors the phase ownership and leaves a stable insertion point for phase 8.

ASCII mockup:

```text
┌────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Admin              │ Breadcrumbs: Admin / Deals / D-8801                                    │
│ Mortgages          │ Deal D-8801              [Locked] [Package ready]                      │
│ Listings           │ 12 King St opportunity                                                 │
│ Deals              │ ───────────────────────────────────────────────────────────────────────│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Package: ready · Created 2026-04-15 · Retries: 0                    ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Private static — Name / Source / Status / Open                      ││
│                    │ │ Appraisal PDF      blueprint  available  View                       ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Generated read-only — Commitment letter v12 · View                  ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Signable (reserved) — runtime in phase 8                            ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

## Package overview card design

The package overview card SHOULD display:

- package status chip,
- created/updated timestamps,
- retry count,
- high-level error summary when `partial_failure` or `failed`,
- source summary such as `Generated from active mortgage document blueprints at deal lock`.

Recommended status visual mapping:

- `pending` → neutral/in-progress,
- `ready` → success,
- `partial_failure` → warning,
- `failed` → destructive,
- `archived` → muted/history.

This card SHOULD own the retry CTA for admin operators when package generation is not fully successful.

## Document-instance section design

### Private static section

Rows SHOULD expose:

- document display name,
- category/package label if present,
- source type `Static reference`,
- availability status,
- open action.

### Generated read-only section

Rows SHOULD expose:

- document display name,
- pinned template version,
- package label/category,
- status,
- open action,
- failure details if generation failed.

The UI MUST read from `dealDocumentInstances`, not from raw blueprint rows or raw generated-document tables. That design rule should be visible in the component structure: one normalized document table/list consumes instances.

## Failure and retry UX

One document failure must not erase the rest of the package surface. Therefore the UI should separate:

- package-level status,
- per-instance status.

Recommended behavior:

- package overview card shows warning/error banner,
- failed rows show inline status and failure detail,
- successful rows remain openable,
- `Retry package generation` is available only to admins and only when status is `partial_failure` or `failed`.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Package issue                                                                               │
│ Status: partial_failure — 1 of 5 docs failed; others available.                             │
│ Last error: unsupported variable key `closing_lawyer_phone`                                 │
│                                    [Retry generation]                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Portal parity / reuse guidance

If the repo has both admin and participant deal views, reuse the same normalized section order:

- package overview,
- private static,
- generated read-only,
- signable.

The admin version may expose retry controls and more metadata; the participant-facing version may omit operational controls. The information architecture SHOULD still line up so screenshots and support guidance match.

## Core user flows the UI MUST support

### Flow A — package auto-appears on deal lock

1. Deal is locked.
2. Operator opens the deal page.
3. `Documents` area shows package overview.
4. Private static and generated read-only instances are listed from normalized package rows.

### Flow B — partial failure without rollback

1. Deal locks.
2. One generated document fails.
3. Deal page shows `partial_failure`.
4. Successful documents remain openable.
5. Operator uses retry without losing visibility into the rest of the package.

### Flow C — immutable snapshot comprehension

1. Operator changes mortgage blueprints after a deal already exists.
2. Opens existing deal.
3. The page continues to show the package snapshot created at lock time, not the newly edited mortgage blueprint set.

The UI SHOULD support that mental model with copy such as `Snapshotted at deal lock`.

## Interaction and visual-behavior rules

- Avoid mixing package metadata into each row excessively; keep package-level context in the overview card.
- The page SHOULD group instances by document kind/class for readability.
- Reserve the signable section visibly even before phase 8 to prevent later layout churn.
- If there are no private static or generated docs because no active blueprints existed, show a meaningful empty state rather than a blank page.
- Open actions should clearly open the materialized deal document, not the mortgage blueprint source.

## Merge-safe UI ownership notes

Phase 8 will extend the reserved signable section in place and SHOULD reuse the same package overview card. Do not create a separate signable-only document area elsewhere on the deal page that would fragment the final information architecture.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Active mortgage blueprints from phase 6.
- Canonical borrower/mortgage/property/broker data from phase 2.
- Existing deal lock machine/effect seam.
- Existing document generation engine for templated PDFs.

## Outputs this phase guarantees

- Immutable deal package headers.
- Immutable document-instance snapshots of source blueprint metadata.
- A canonical participant snapshot contract.
- A canonical variable resolver contract.
- Deal-private static and non-signable generated docs visible through the normalized package surface.

## Contracts exported for later phases

- `dealDocumentPackages`
- `dealDocumentInstances`
- `resolveDealParticipantSnapshot`
- `resolveDealDocumentVariables`
- stable class-dispatch structure inside `createDocumentPackage`

## Temporary compatibility bridges

- This phase may leave the signable branch unimplemented or explicitly deferred, but it MUST reserve the dispatch seam and MUST NOT fake completed signable behavior.
- Access control can continue using the existing participant roles for lender/borrower/lawyer/staff until phase 9 expands broker roles; write the code so adding broker roles later is additive.

## Idempotency / retry / failure semantics

- `createDocumentPackage` must be idempotent on `dealId`.
- Retry must not create duplicate package headers.
- Retry may create replacement generated docs/instances only according to the package retry strategy the repo already uses; it MUST preserve snapshot truth and not mutate old instances in place without status history.
- If participant resolution is incomplete, fail explicitly and surface it instead of generating broken documents.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/documents/dealPackages.ts`
  - package and instance schema definitions
  - participant snapshot resolver
  - variable resolver
  - deal portal private-static/generated-read-only sections
- **Shared but not owned**
  - deal machine seam that triggers `createDocumentPackage`
  - blueprint tables from phase 6
  - `generatedDocuments` existing schema/module
- **Later phases may extend but not redesign**
  - `createDocumentPackage` class dispatch
  - deal portal document-package surface
  - package status model

# ACCEPTANCE CRITERIA

- Locking a deal creates or reuses exactly one package header for that deal.
- Private static blueprints materialize into `static_reference` instances.
- Non-signable template blueprints materialize into generated deal docs and `generated` instances.
- The deal portal/admin deal page reads from `dealDocumentInstances`.
- Package creation is idempotent on `dealId`.
- Existing deals preserve blueprint membership/version snapshots even if mortgage blueprints change later.
- Listing pages continue showing only public docs.
- This phase satisfies global acceptance criteria 12 and 13 and enables criterion 14.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Create a mortgage with private static and non-signable template blueprints.
2. Lock the listing into a deal.
3. Open the deal portal/admin deal page.
4. See the package rows appear automatically.
5. Open/read the private static docs.
6. Open/read the generated non-signable PDFs.
7. Re-trigger package creation and confirm package idempotency.

# RISKS / EDGE CASES / FAILURE MODES

- The typed participant resolver is mandatory before signable docs ship; do not cheat with read-model strings even for the non-signable path.
- Guest-lawyer handling may lack a `userId`; preserve the exact optionality shown by the master spec.
- Package retry logic must avoid duplicate headers and preserve snapshot semantics.
- Signable blueprints may already exist when this phase lands. Do not claim they are fully supported yet; leave a clear extension seam for phase 8.
- Do not let the portal infer documents ad hoc from blueprints and raw storage IDs.

# MERGE CONTRACT

After this phase is merged:

- `DEAL_LOCKED` can create immutable deal document packages for private static and non-signable generated docs.
- The deal portal has one normalized document surface: `dealDocumentInstances`.
- Phase 8 can add signable docs by extending the reserved signable branch, not by redesigning package semantics.
- No later phase may weaken the immutable-snapshot rule for existing deals.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not expose deal-private docs on listing pages.
- Do not infer the portal document surface ad hoc.
- Do not use read-model strings as canonical participant truth.
- Do not rollback the entire deal lock because one document failed.
- Do not fake signable-doc completion in this phase.
