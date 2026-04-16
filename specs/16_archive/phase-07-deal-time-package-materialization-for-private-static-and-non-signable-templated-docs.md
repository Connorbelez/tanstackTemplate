
# SPEC HEADER

- **Spec number:** 7
- **Exact title:** Deal-time package materialization for private static + non-signable templated docs
- **Recommended filename:** `phase-07-deal-time-package-materialization-for-private-static-and-non-signable-templated-docs.md`
- **Primary objective:** Create immutable deal document packages on `DEAL_LOCKED`, materialize private static plus private templated non-signable document instances onto the deal, and snapshot deferred signable blueprint membership for later materialization.
- **Why this phase exists:** The master spec rejects mortgage-level deal-private docs that remain visible forever. Deal-private documents must be snapshotted into deal packages when a deal locks, and existing deals must never change when mortgage blueprints change later.
- **Why this phase is separately parallelizable:** This phase owns the package/instance data model, participant/variable resolution, and the static/non-signable branches of package creation. It does not own Documenso envelopes, embedded signing, or signed archive behavior.

# PHASE OWNERSHIP

## What this phase owns

- `dealDocumentPackages`.
- `dealDocumentInstances`.
- `resolveDealParticipantSnapshot(dealId)`.
- `resolveDealDocumentVariables(dealId)`.
- The authoritative `createDocumentPackage` effect on `DEAL_LOCKED` for:
  - package header creation,
  - `private_static`,
  - `private_templated_non_signable`,
  - snapshotting signable blueprint membership without creating envelopes yet.
- Package status transitions: `pending`, `ready`, `partial_failure`, `failed`, `archived` (with `archived` later completed in phase 9 when signed artifacts are archived).
- Deal portal/admin package surfaces for:
  - private static docs,
  - generated read-only docs,
  - package status,
  - retry controls for failed static/non-signable generation.

## What this phase may touch but does not own

- The deal machine effect registration point that already names `createDocumentPackage`.
- Mortgage blueprints owned by phase 6, only as read inputs.
- The deferred signable-materialization follow-up owned by phase 8, which consumes the snapshots created here.
- Participant-scoped `dealAccess` expansion owned by phase 8.

## What this phase must not redesign

- The mortgage-owned blueprint truth model from phase 6.
- The provider seam / Documenso integration and participant-scoped deal access lifecycle from phase 8.
- The signed archive effect from phase 9.
- The listing public-doc surface from phase 6.

## Upstream prerequisites

- Phase 6 blueprint infrastructure.
- Phase 2 canonical mortgage/property/borrower records and participant joins.
- Existing deal machine seam that triggers `createDocumentPackage` on `DEAL_LOCKED`.

## Downstream dependents

- Phase 8 consumes the signable blueprint snapshots created here and the `resolveDealParticipantSnapshot` / `resolveDealDocumentVariables` contracts.
- Phase 9 consumes package rows and instance rows for archive and broker hardening.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec defines this phase very tightly:

- The existing deal machine already declares `createDocumentPackage` on `DEAL_LOCKED` and `archiveSignedDocuments` on `ALL_PARTIES_SIGNED`. This feature must fill those seams rather than invent a parallel workflow.
- `createDocumentPackage` is authoritative on `DEAL_LOCKED` for package header creation, private static docs, private templated non-signable docs, and signable-blueprint snapshotting only.
- Package creation is idempotent on `dealId`.
- The package generator MUST load active non-public mortgage document blueprints.
- It MUST resolve a canonical participant snapshot and a canonical variable bag from domain truth, not from portal form state.
- One document failure MUST NOT roll back the entire deal lock.
- The package row must surface `partial_failure` or `failed`.
- Each failed instance must surface its own failure state.
- The deal portal MUST query `dealDocumentInstances`; it must not infer its document surface ad hoc from raw storage IDs, generated docs, and blueprints.
- Existing deals are immutable snapshots of blueprint membership and template versions at lock time.
- The signable branch exists conceptually in the master spec’s package materialization section, but final signable document materialization moves to phase 8 after `LAWYER_VERIFIED` or an explicit admin reconcile / retry path. This phase must therefore snapshot signable blueprint membership at `DEAL_LOCKED` without creating envelopes or relying on live mortgage blueprints later.

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
- Participant-scoped `dealAccess` expansion and grant lifecycle. Phase 8 owns that because signable-document access depends on it.

# AUTHORITATIVE RULES AND INVARIANTS

- `createDocumentPackage` on `DEAL_LOCKED` is authoritative only for package header creation, snapshotting blueprint membership, and materializing the non-signable/private-static branches.
- Package creation MUST be idempotent on `dealId`.
- Blueprint membership and pinned versions MUST be snapshotted at deal lock time.
- Existing deals MUST NEVER change when mortgage blueprints change later.
- The variable resolver MUST source values from canonical domain records, not portal form state.
- The participant resolver MUST expose typed canonical participants carrying domain IDs, user-record IDs, and WorkOS `authId` values where available, not read-model strings.
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
  orgId?: string;

  status: DealDocumentPackageStatus;
  lastError?: string;
  retryCount: number;

  createdAt: number;
  updatedAt: number;
  readyAt?: number;
  archivedAt?: number;
}
```

`dealDocumentPackages` is a long-lived operational table. Denormalize `orgId` and add direct-query indexes that support admin audit, package lookup by deal, and archived-package retrieval without cross-table scans.

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
  orgId?: string;

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

`dealDocumentInstances` is also a long-lived operational table. Denormalize `orgId` and add direct-query indexes for package membership, status filtering, and admin/deal portal document reads.

## Canonical participant snapshot resolver

```ts
resolveDealParticipantSnapshot(dealId: Id<"deals">): {
  lender: { lenderId: Id<"lenders">; userRecordId?: Id<"users">; authId?: string; fullName: string; email: string };
  borrowers: Array<{
    participantKey: "borrower_primary" | "borrower_co_1" | "borrower_co_2";
    borrowerId: Id<"borrowers">;
    userRecordId: Id<"users">;
    authId: string;
    role: "primary" | "co_borrower";
    coBorrowerOrdinal?: 1 | 2;
    fullName: string;
    email: string;
  }>;
  brokerOfRecord: { brokerId: Id<"brokers">; userRecordId?: Id<"users">; authId?: string; fullName: string; email: string };
  assignedBroker?: { brokerId: Id<"brokers">; userRecordId?: Id<"users">; authId?: string; fullName: string; email: string };
  lawyerPrimary?: { userRecordId?: Id<"users">; authId?: string; fullName: string; email: string; lawyerType: "platform_lawyer" | "guest_lawyer" };
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

This phase MUST structure class dispatch so phase 8 can materialize signable docs later without redesigning package headers, instance snapshots, or failure semantics. At `DEAL_LOCKED`, this phase MUST snapshot signable blueprint membership into package-owned storage (for example reserved instance rows or an additive package snapshot field) but MUST NOT create fake envelopes, final signable PDFs, or availability states.

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

- This phase may leave final signable materialization deferred, but it MUST snapshot signable blueprint membership at `DEAL_LOCKED` so phase 8 never has to consult live mortgage blueprints.
- Phase 8 owns explicit participant-scoped `dealAccess` grants for signing and broker/private-doc access. This phase should keep package surfaces compatible with that later access model instead of relying on implicit broker visibility.

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
