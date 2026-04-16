
# SPEC HEADER

- **Spec number:** 9
- **Exact title:** Signed archive, broker deal visibility, and demo hardening
- **Recommended filename:** `phase-09-signed-archive-broker-deal-visibility-and-demo-hardening.md`
- **Primary objective:** Archive completed signed artifacts back into platform-controlled storage, harden and verify participant-scoped deal visibility, remove remaining demo-only footguns, and verify the full stakeholder-demo flow end to end.
- **Why this phase exists:** The master spec is not complete until signed artifacts are archived back into the platform, the explicit participant-scoped `dealAccess` model introduced earlier has no implicit backdoors, and the old demo-only creation paths are no longer primary production entrypoints.
- **Why this phase is separately parallelizable:** This phase consumes normalized outputs from phases 3, 5, 6, 7, and 8. It owns final archive semantics, broker visibility hardening, production-path cleanup verification, smoke/integration coverage, and stakeholder-demo polish.

# PHASE OWNERSHIP

## What this phase owns

- `archiveSignedDocuments` on `ALL_PARTIES_SIGNED`.
- Final hardening and verification of the participant-scoped `dealAccess` model already introduced in phase 8, including broker-facing deal-private document visibility rules.
- Archived signed-artifact display in deal portal/admin surfaces.
- Final cleanup / gating of deprecated demo-only production footguns.
- Smoke/integration tests across origination -> deal lock -> signing.
- Final stakeholder-demo polish and verification.

## What this phase may touch but does not own

- Provider `downloadCompletedArtifacts` contract from phase 8, only as a consumer.
- Package/instance tables from phase 7, only as a consumer/updater.
- Listing projection path narrowing from phase 3, only to verify and harden final blocking/gating.
- Existing permission catalog and deal-access checks.

## What this phase must not redesign

- The canonical constructor from phase 2.
- The listing projector from phase 3.
- Payment bootstrap from phase 4.
- Immediate provider-managed activation semantics from phase 5.
- Blueprint truth model from phase 6.
- Package/envelope generation semantics from phases 7 and 8.

## Upstream prerequisites

- Phase 7 package and instance tables.
- Phase 8 normalized envelopes, recipients, and provider seam.
- Earlier-phase listing/payment/document/admin surfaces.

## Downstream dependents

- None. This is the final feature-completion and hardening phase.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec’s final hardening requirements are explicit:

- On `ALL_PARTIES_SIGNED`, signed artifacts must be archived back into platform-controlled storage.
- Documenso is the signing provider, not the long-term document store.
- Existing deals do not change if mortgage document blueprints are edited later.
- Brokers involved in a deal can access deal-private docs only through explicit deal access, not admin bypass.
- The generic mortgage-backed listing create path is no longer a production authoring entrypoint.
- The legacy empty-listing admin query path is not the authoritative UI for this workflow.
- The final end-to-end stakeholder demo must work:
  1. admin originates,
  2. listing is projected,
  3. public docs show on listing,
  4. deal locks,
  5. package materializes,
  6. participants sign,
  7. signed artifacts are archived,
  8. payment setup is coherent and provider-managed recurring setup is active when selected.

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

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Implement `archiveSignedDocuments`.
- Download completed signed PDFs and optional completion certificates through the provider seam.
- Upload archived artifacts back into platform storage.
- Patch `generatedDocuments.finalPdfStorageId`.
- Patch `generatedDocuments.completionCertificateStorageId` where applicable.
- Patch `generatedDocuments.signingCompletedAt`.
- Update `dealDocumentInstances.status` to `signed` / `archived` as appropriate.
- Mark packages `archived` when archive conditions are met.
- Harden and verify broker deal-private document visibility only where the broker is explicitly part of the deal through the explicit phase-8 participant access model.
- Verify or complete final gating/removal for deprecated production footguns:
  - generic mortgage-backed listing create path,
  - seed/demo mortgage construction,
  - direct mortgage insert bypassing constructor,
  - direct listing document authoring as truth,
  - admin draft states in `mortgage.machine.ts`,
  - generic recurring `pad_rotessa` recurring transfer initiation,
  - live mutable template-group refs as mortgage truth.
- Add smoke/integration tests for the full flow.
- Add final UI polish:
  - clearer banners,
  - status chips,
  - audit breadcrumbs,
  - empty/loading states,
  - archived signed-artifact section.

# OUT-OF-SCOPE

- New product scope beyond the master spec.
- New document classes.
- New payment abstractions.
- Replacing Documenso.
- Replacing the package/instance model.

# AUTHORITATIVE RULES AND INVARIANTS

- Signed artifacts MUST be stored back in platform-controlled storage.
- Documenso remains the signing provider, not the long-term document store.
- Broker visibility MUST be explicit via `dealAccess`.
- Admin bypass MUST NOT be used as a substitute for broker access.
- Demo-only creation paths MUST NOT remain the primary production entrypoint.
- Archived signed documents are deal-level artifacts and must preserve the immutable-snapshot story established by earlier phases.
- End-to-end user-visible surfaces must remain coherent with the canonical domain truth established by earlier phases.

# DOMAIN / DATA / CONTRACT CHANGES

## `dealAccess` hardening and verification

Phase 8 is the implementation owner for explicit participant-scoped deal access, including broker roles such as `broker_of_record` and `assigned_broker`. This phase MUST verify that:

- no broker/private-doc path still relies on implicit mortgage association,
- no broker/private-doc path still relies on admin bypass,
- signing still requires both explicit deal access and recipient match,
- archived/signed document reads still flow through the normalized deal-package surfaces.

## `generatedDocuments` archive fields

If not already added in phase 8, ensure the following additive fields exist and are used:

```ts
finalPdfStorageId?: Id<"_storage">;
completionCertificateStorageId?: Id<"_storage">;
signingCompletedAt?: number;
```

## Optional `documentAssets` archive rows

The master spec requires platform-controlled storage and defines `DocumentAssetSource = "signature_archive"`. If the repo’s download surface benefits from asset metadata, phase 9 MAY also create `documentAssets` rows for archived signed PDFs/certificates with `source = "signature_archive"`. This is additive. It MUST NOT replace the required `generatedDocuments.*StorageId` fields.

# BACKEND WORK

## 1. Implement `archiveSignedDocuments`

On `ALL_PARTIES_SIGNED`, the effect MUST:

1. Find all signable generated documents for the deal.
2. For each completed envelope:
   - call `SignatureProvider.downloadCompletedArtifacts`,
   - upload the final signed PDF into `_storage`,
   - optionally upload the completion certificate,
   - patch `generatedDocuments.finalPdfStorageId`,
   - patch `generatedDocuments.completionCertificateStorageId` if present,
   - patch `generatedDocuments.signingCompletedAt`,
   - patch `dealDocumentInstances.status = "signed"` or `archived` as appropriate.
3. Mark the package `archived` when all relevant signable instances are archived.

### Archive idempotency expectations

- Re-running `archiveSignedDocuments` for the same completed envelope must not create inconsistent final state.
- If the repo keeps prior archive blobs, preserve them deterministically; do not oscillate state.
- If download fails, surface that failure clearly and retry later; do not silently mark the package archived.

## 2. Harden and verify participant-scoped deal access

- Audit every broker/private-doc read path and ensure it only accepts the explicit participant-scoped `dealAccess` model introduced in phase 8.
- Remove or block any remaining implicit broker visibility path.
- Verify signable-doc access remains recipient-specific; broker `dealAccess` alone is not enough to sign unless the broker also matches a `signatureRecipient`.

## 3. Final deprecated-path hardening

Verify and enforce the master spec’s deprecated/narrowed path list:

1. Generic mortgage-backed listing creation via the general listing create path must be gone or gated.
2. `seedMortgage` or other seed/demo construction mutations must not be production construction paths.
3. Any direct mortgage insert path bypassing the canonical constructor must be removed, gated, or clearly non-production.
4. Direct listing document authoring on listing rows must not remain long-term truth.
5. `mortgage.machine.ts` must not have admin draft states.
6. Generic recurring `pad_rotessa` transfer initiation must not be used for recurring mortgage collections.
7. Mortgage-side signable document truth must not be live mutable template-group refs.

## 4. End-to-end smoke/integration coverage

Add test coverage for:

- origination draft creation and restore,
- canonical commit,
- listing projection,
- payment bootstrap,
- optional immediate provider-managed activation success/failure,
- public listing docs,
- `DEAL_LOCKED` package generation,
- signable envelope creation,
- embedded signing authorization,
- `ALL_PARTIES_SIGNED` archive behavior,
- broker deal-private visibility only when broker is explicitly part of the deal.

# FRONTEND / UI WORK

- Add archived signed-artifact section to deal portal/admin pages.
- Allow archived final signed files to be opened from the platform surface.
- Add broker-facing deal view/private-doc visibility only where broker role membership exists.
- Add stakeholder-demo polish:
  - clearer banners,
  - status chips,
  - audit breadcrumbs,
  - empty/loading states.
- Ensure the old standalone mortgage-backed listing create path is absent, blocked, or clearly non-production from UI navigation.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Completed envelope/provider state from phase 8.
- Package and instance rows from phase 7.
- Public-doc and private-doc surfaces from phases 6 and 7.
- Listing projection and create-path narrowing from phase 3.
- Payment setup surfaces from phases 4 and 5.

## Outputs this phase guarantees

- Archived signed artifacts in platform-controlled storage.
- Hardened broker/private-document access with no implicit backdoor access.
- Final production-path hardening against the deprecated footguns.
- End-to-end verified stakeholder-demo path.

## Contracts exported for later consumers

- None. This is the final phase.

## Idempotency / retry / failure semantics

- Archive retries must be safe.
- Participant-scoped access hardening must remain additive and explicit.
- Smoke tests should cover both success and failure branches where the master spec demands retryable behavior.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/documents/signature/archive.ts`
  - `dealAccess` hardening / verification logic and tests
  - archived signed-artifact UI surfaces
  - end-to-end smoke/integration tests for this feature
- **Shared but not owned**
  - `SignatureProvider` implementation
  - package/instance tables
  - listing projection code
  - payment bootstrap and recurring activation modules
- **No later phase**
  - this is the terminal ownership phase

# ACCEPTANCE CRITERIA

- Completed signable deal flow archives final signed PDFs back into platform storage.
- Optional completion certificates are archived when present.
- Archived files are openable from platform surfaces.
- Broker-facing deal-private doc visibility exists only when the explicit participant-scoped access model grants it, and no implicit broker backdoor remains.
- The old standalone mortgage-backed listing create path is gone or blocked as a production path.
- End-to-end investor/stakeholder demo works.
- All four document classes behave correctly across origination, listing, deal lock, signing, and archive.
- Payment setup, listing projection, and deal portal are visibly coherent.
- This phase satisfies global acceptance criteria 15, 16, 17, 18, and 19 and verifies the full feature.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Complete a signable deal flow end to end.
2. See final signed PDFs archived.
3. Open the archived signed file from the platform.
4. If a completion certificate exists, open that too.
5. Verify broker visibility only where the broker is explicitly part of the deal.
6. Verify the old standalone mortgage-backed listing create path is gone or blocked.
7. Walk the full stakeholder-demo script without hitting a demo-only or conflicting path.

# RISKS / EDGE CASES / FAILURE MODES

- Provider artifact download can fail even after signing is complete. Keep retryable archive behavior explicit.
- Broker visibility is a privacy-sensitive path. Do not infer broker access from deal association or admin bypass.
- It is easy to harden the route/UI path while leaving a backend footgun callable. Gate or remove the backend production paths too.
- Archived artifact storage must not regress into “provider is the document store.”
- Smoke tests must cover both the happy path and the required failure/retry paths, especially immediate provider-managed activation failure and archive retry.

# MERGE CONTRACT

After this phase is merged:

- The full nine-phase feature is production-shaped and demo-safe.
- Signed artifacts are platform-archived.
- Broker deal-private visibility is explicit and participant-scoped.
- Deprecated demo-only construction paths are not the primary production entrypoint.
- The repo has end-to-end smoke coverage for the master spec’s intended workflow.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not leave completed signed artifacts only in Documenso.
- Do not grant brokers private-doc access through admin bypass.
- Do not leave the generic mortgage-backed listing create path active as production authoring.
- Do not skip end-to-end verification just because earlier phases compile.
- Do not weaken any earlier phase’s canonical-truth boundary to make the demo easier.
