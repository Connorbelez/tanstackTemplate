# Admin origination parallelizable implementation-spec package

This combined markdown file contains all four required deliverables in the required order. The nine standalone phase specs are also emitted as separate markdown files in the same package directory for isolated handoff to parallel implementation agents.


# DELIVERABLE 1 — Phase decomposition overview

## Decomposition strategy

This decomposition preserves the master spec’s original nine-phase shape, but it is not a blind transcription of the uploaded `adminOrigination.md`. The package intentionally corrects audited production-safety gaps while keeping the same filenames, high-level phase boundaries, and architectural stance. The package is intentionally repetitive: every phase spec repeats the canonical constructor boundary, the listing-projection rules, the Active Mortgage Payment System constraints, the document blueprint → package → instance model, the provider-managed Rotessa restrictions, the RBAC direction, and the explicit anti-patterns that the master spec rejects. The only conservative ambiguity resolutions in this package are the minimum persisted shape of `adminOriginationCases`, the persisted collections-draft status blob, and the exact storage choice for deferred signable blueprint snapshots; those additions are marked as additive, conservative, and non-architectural. The combined package and the standalone phase files are a synchronized set and must be updated together whenever ownership, invariants, or contracts move.

## Exact 9 target specs

| Phase | Exact title | Recommended filename | One-sentence objective |
| --- | --- | --- | --- |
| 1 | Origination case scaffold and UI skeleton | `phase-01-origination-case-scaffold-ui-skeleton.md` | Create the admin origination workspace, draft persistence, validation, step navigation, and review shell without committing canonical domain rows. |
| 2 | Canonical borrower/property/mortgage activation without payments or docs | `phase-02-canonical-borrower-property-mortgage-activation-without-payments-or-docs.md` | Implement borrower resolution and the core canonical activation constructor so a case can commit into real borrower, property, valuation, mortgage, and `mortgageBorrowers` rows. |
| 3 | Listing projection and public-doc compatibility projection | `phase-03-listing-projection-and-public-doc-compatibility-projection.md` | Implement the internal-only mortgage-backed listing projector and preserve listing-curated fields while overwriting projection-owned fields. |
| 4 | Payment bootstrap integration | `phase-04-payment-bootstrap-integration.md` | Bootstrap obligations and app-owned collection plan entries through the existing payment architecture during origination. |
| 5 | Immediate Rotessa activation | `phase-05-immediate-rotessa-activation.md` | Reuse the existing recurring-schedule activation flow to optionally convert future app-owned entries into provider-managed Rotessa schedules immediately after commit. |
| 6 | Mortgage document blueprints and public/private static docs | `phase-06-mortgage-document-blueprints-and-public-private-static-docs.md` | Implement document assets, origination-time document authoring, mortgage-owned blueprint creation, and public listing document reads. |
| 7 | Deal-time package materialization for private static + non-signable templated docs | `phase-07-deal-time-package-materialization-for-private-static-and-non-signable-templated-docs.md` | Create immutable deal document packages on `DEAL_LOCKED` and materialize private static plus non-signable generated docs onto the deal. |
| 8 | Signable docs, Documenso envelopes, and embedded signing | `phase-08-signable-docs-documenso-envelopes-and-embedded-signing.md` | Materialize deferred signable docs after `LAWYER_VERIFIED` or admin reconcile, create Documenso envelopes through a backend provider seam, and expose embedded signing only to authorized matching recipients. |
| 9 | Signed archive, broker deal visibility, and demo hardening | `phase-09-signed-archive-broker-deal-visibility-and-demo-hardening.md` | Archive signed artifacts back into platform storage, harden and verify the explicit participant-scoped deal access model, and remove remaining demo-only production footguns. |

## Dependency graph / dependency list

### Phase 1
- Requires: only the existing repo shell, admin-shell registry direction, and current permission catalog.
- Produces: `adminOriginationCases`, base `originationCaseDocumentDrafts`, `/admin/originations/*` routes, step shell, autosave, validators, and a stable draft data model.
- Consumed by: all later phases, especially phase 2 commit orchestration, phase 5 collection status persistence, and phase 6 document draft authoring.

### Phase 2
- Requires: phase 1 draft persistence and UI shell.
- Produces: `resolveOrProvisionBorrowersForOrigination`, borrower provenance, mortgage provenance, `mortgageValuationSnapshots`, the core `activateMortgageAggregate` constructor contract, idempotent workflow-source lookup, `mortgageBorrowers`, ownership-ledger genesis call, and origination audit.
- Consumed by: phase 3 listing projection hook, phase 4 payment bootstrap hook, phase 5 post-commit collection activation, phase 6 blueprint creation on commit, phase 7 participant and variable resolution, and the final end-to-end demo.

### Phase 3
- Requires: phase 2 canonical constructor and valuation snapshots.
- Produces: `upsertMortgageListingProjection`, `syncListingPublicDocumentsProjection`, internal-only mortgage-backed listing creation, projection field overwrite/preserve rules, and listing-curation admin surfaces.
- Consumed by: phase 6 public-doc blueprint compatibility sync, phase 9 demo hardening, and every later surface that relies on `mortgage_pipeline` listing uniqueness.

### Phase 4
- Requires: phase 2 canonical constructor and phase 2 primary-borrower resolution.
- Produces: `generateInitialMortgageObligations`, the collection-plan bootstrap wrapper, `createdObligationIds`, `createdPlanEntryIds`, `scheduleRuleMissing`, and payment/admin read surfaces for obligations and plan entries.
- Consumed by: phase 5 immediate Rotessa activation, phase 9 end-to-end tests, and the global acceptance criteria around payment bootstrap.

### Phase 5
- Requires: phase 1 collections draft shape, phase 2 commit path, and phase 4 payment bootstrap output.
- Produces: post-commit recurring schedule activation, persisted retryable collection setup state, retry actions, and UI statuses for pending / activating / active / failed.
- Consumed by: phase 9 end-to-end hardening and the final investor demo flow.

### Phase 6
- Requires: phase 1 document-draft table and route shell, phase 2 constructor hook, and phase 3 listing public-doc compatibility sync.
- Produces: `documentAssets`, `mortgageDocumentBlueprints`, full origination document authoring for all four document classes, `document:review`-guarded template attachment surfaces, public listing document reads, and blueprint archival/edit behavior.
- Consumed by: phase 7 deal package creation, phase 8 signable package creation, phase 9 archived signed artifact display, and the listing public-doc acceptance criteria.

### Phase 7
- Requires: phase 6 blueprints, phase 2 canonical mortgage/property/borrower data, and deal machine `createDocumentPackage` seam.
- Produces: `dealDocumentPackages`, `dealDocumentInstances`, `resolveDealParticipantSnapshot`, `resolveDealDocumentVariables`, `createDocumentPackage` for package headers plus private static / non-signable docs, and deferred signable blueprint snapshots captured at `DEAL_LOCKED`.
- Consumed by: phase 8 deferred signable materialization and embedded signing surfaces, phase 9 archive and broker access hardening, and the immutable-snapshot guarantees.

### Phase 8
- Requires: phase 7 package tables and resolver contracts, plus phase 6 signable blueprints.
- Produces: `signatureEnvelopes`, `signatureRecipients`, the `SignatureProvider` seam, Documenso implementation, explicit participant-scoped `dealAccess` grant/revoke lifecycle, deferred signable materialization after `LAWYER_VERIFIED`, embedded signing session creation, and webhook/status sync.
- Consumed by: phase 9 `archiveSignedDocuments`, participant-access hardening, and the end-to-end signing demo.

### Phase 9
- Requires: phase 7 package tables, phase 8 completed envelope lifecycle, and the earlier-phase admin/listing/payment/document surfaces.
- Produces: `archiveSignedDocuments`, hardened/verified deal-private access with no implicit broker backdoor, archived signed-file access surfaces, production gating for deprecated paths, smoke/integration coverage, and final stakeholder-demo hardening.
- Consumed by: no later phase; this is the feature-completion and merge-hardening phase.

## Shared contracts and likely merge hotspots

| Shared surface / hotspot | Why it is shared | Designated owner phase | Later phases may do | Later phases MUST NOT do |
| --- | --- | --- | --- | --- |
| `adminOriginationCases` schema and base CRUD | Every phase reads or patches case draft or commit state | Phase 1 | Add additive fields, especially collection-status fields and commit references | Rename draft subdocuments, change route step identity, or repurpose the table into canonical business truth |
| `originationCaseDocumentDrafts` schema | Phase 1 creates the table; phase 6 defines semantics and uses all four classes | Phase 1 for table existence, phase 6 for semantic ownership | Add additive validation fields or queries | Change class names, switch to live mutable template-group refs, or bypass the table during origination |
| `convex/mortgages/activateMortgageAggregate.ts` | Phases 2, 3, 4, and 6 all need ordered hooks inside the canonical constructor | Phase 2 | Add helper calls in the exact master-spec order: blueprints (phase 6), payment bootstrap (phase 4), listing projection + public-doc sync (phase 3) | Redesign the constructor contract, reorder earlier core steps, or convert creation into a fake GT transition |
| `ActivateMortgageAggregateInput` / `ActivateMortgageAggregateResult` | Phases 2, 3, 4, and 6 must converge on one constructor signature | Phase 2 | Extend only additively where the master spec explicitly requires it | Rename fields, weaken provenance semantics, or fork a second constructor |
| `upsertMortgageListingProjection` / `syncListingPublicDocumentsProjection` | Phase 3 owns projection logic; phase 6 must trigger public-doc sync when blueprints change | Phase 3 | Call the helpers, add permissioned compatibility reads, preserve curated-field editing | Treat listings as independently authored mortgage objects, use `listings.publicDocumentIds` as authoring truth, or expose public docs through raw storage IDs / generic auth |
| `payments/origination/bootstrap.ts` or equivalent | Phase 4 owns obligations + plan-entry bootstrap; phase 5 depends on its output | Phase 4 | Call it from the constructor; use its output for activation preconditions | Create bespoke payment rows, create attempts/transfers during origination, or add admin-only obligation types |
| Immediate collection activation state on the origination case | Phase 5 must persist retryable non-transactional failures; phase 1 owns the table | Phase 5 | Add additive fields inside the case’s collections blob | Store provider truth outside canonical mortgage/payment rows or roll back origination on failure |
| `documents/mortgageBlueprints.ts` | Phase 6 owns blueprint creation; phases 7 and 8 consume blueprints as immutable inputs | Phase 6 | Read active blueprints, archive prior rows, insert new rows | Mutate blueprint rows in place or let deal packages follow live blueprint changes |
| `documents/dealPackages.ts` / `createDocumentPackage` | Phase 7 owns package orchestration and `DEAL_LOCKED` snapshotting; phase 8 consumes deferred signable snapshots | Phase 7 | Materialize signable snapshots in phase 8, add archive reads in phase 9 | Redesign package/idempotency semantics, consult live mortgage blueprints after lock, or make the portal infer its own document surface ad hoc |
| `resolveDealParticipantSnapshot` / `resolveDealDocumentVariables` | Phase 7 owns canonical participant + variable sourcing; phase 8 consumes them | Phase 7 | Add signatory resolver usage and package-generation calls | Source signatories or variables from portal form state, omit WorkOS `authId` from participant identity where access/signing needs it, or use untyped read-model strings |
| `documents/signature/*` provider seam | Phase 8 owns Documenso integration; phase 9 consumes completed artifacts | Phase 8 | Download completed artifacts in phase 9, surface statuses, retry sync | Let the frontend talk directly to Documenso or expose provider admin URLs |
| explicit participant-scoped `dealAccess` model | Signable docs and broker/private-doc visibility depend on explicit participant access keyed by WorkOS identity | Phase 8 | Consume the explicit grants, harden and verify them in phase 9 | Grant broker access via admin bypass, hidden backdoor reads, or ad hoc portal exceptions |
| Admin origination route shell | Phase 1 owns the shell; phases 2, 5, and 6 extend steps | Phase 1 | Add commit UX, collection UX, and document UX inside the existing shell | Fork the workflow into multiple authoring routes |
| Mortgage detail page sections | Phase 2 owns the base tabs; phases 3, 4, and 6 extend them | Phase 2 | Add listing/payment/document sections | Replace the page with a second mortgage authoring surface |
| Deal portal package page | Phase 7 owns private static + non-signable sections; phase 8 adds signable; phase 9 adds archived-signed and broker visibility | Phase 7 for base package surface; phase 8 for signable section; phase 9 for archive and broker visibility | Extend with owned sections | Reconstruct package state from raw storage IDs or bypass `dealDocumentInstances` |
| `convex/listings/create.ts` and other demo-only entrypoints | Several phases narrow or verify these paths | Phase 3 for mortgage_pipeline gating; phase 9 for final cleanup verification | Gate demo-only paths for non-mortgage use if needed | Leave mortgage-backed listing create as a production entrypoint |



# DELIVERABLE 2 — Coverage and traceability matrix

## Traceability convention

- **Owns** means the phase is the source-of-truth implementation owner and decides the module, schema, and behavioral contract.
- **Consumes** means the phase depends on the contract and may call it or render it, but must not redesign it.
- **Verifies / hardens** means the phase does not own first implementation but must enforce the master spec’s final production shape or prevent regressions.

## A. Major requirement classes → target specs

| Requirement class from the master spec | Primary owner phase(s) | Consuming / dependent phase(s) | Notes |
| --- | --- | --- | --- |
| Executive decision / architectural stance | 1, 2 | 3, 4, 5, 6, 7, 8, 9 | Every spec repeats the same architectural stance; phases 1 and 2 enforce the single-workflow / single-constructor shape. |
| Architecture decision matrix items | 1, 2, 3, 4, 5, 6, 7, 8, 9 | All | Each row of the matrix is assigned below in sections B–E. |
| In-scope / out-of-scope boundaries | All | All | Repeated in every standalone spec; phase-specific out-of-scope sections preserve the non-goals. |
| Authoritative architectural rules | 1, 2 | 3, 4, 5, 6, 7, 8, 9 | Phase 1 owns the one-workflow surface; phase 2 owns the one-constructor boundary. |
| High-level domain model additions | 1, 2, 6, 7, 8, 9 | 3, 4, 5 | Tables/entities are owned where first introduced below. |
| Schema changes | 1, 2, 6, 7, 8, 9 | All later phases | Tables and field additions are explicitly mapped in section C. |
| Canonical origination flow | 1, 2, 5, 6, 3 | 4, 7, 8, 9 | Phase 1 owns the 7-step shell; phase 2 owns commit; phase 5 owns collections specifics; phase 6 owns documents step semantics; phase 3 owns listing-curation semantics. |
| Borrower resolution path | 2 | 1, 5, 7, 8, 9 | `resolveOrProvisionBorrowersForOrigination` is owned by phase 2. |
| Mortgage activation constructor | 2 | 3, 4, 6, 5 | Phase 2 owns the constructor contract and core steps; phases 3, 4, and 6 extend it via owned helper calls. |
| Activation algorithm | 2 core; 3, 4, 6 extension steps | 5, 9 | Steps 10.1–10.6 and 10.11 belong to phase 2; 10.7 belongs to phase 6; 10.8 belongs to phase 4; 10.9–10.10 belong to phase 3. |
| Listing projection contract | 3 | 2, 6, 9 | Includes overwrite vs preserve rules, `monthlyPayment` rule, and internal-only creation path. |
| Payment bootstrap integration | 4 | 2, 5, 9 | Includes obligations generation, schedule bootstrap, and `scheduleRuleMissing`. |
| Rotessa activation rules | 5 | 4, 9 | Includes bank-account preconditions, frequency mapping, uniform-amount rule, failure semantics, and retry. |
| Document ownership model | 6 | 3, 7, 8, 9 | Mortgage-owned blueprints are authoritative; listing docs are projection-only; deal docs are package materializations. |
| Document authoring rules | 6 | 7, 8 | Includes static uploads, template attachment, version pinning, group expansion, validation, and signatory registry. |
| Deal-time package materialization | 7, 8 | 9 | Phase 7 owns `DEAL_LOCKED` package headers/static/non-signable materialization and signable snapshotting; phase 8 owns deferred signable materialization after `LAWYER_VERIFIED` or admin reconcile. |
| Signature provider seam | 8 | 9 | `SignatureProvider` and Documenso implementation. |
| Signed archive behavior | 9 | 8 | `archiveSignedDocuments` on `ALL_PARTIES_SIGNED`. |
| Access control | 6 for listing public docs; 7 for package visibility baseline; 8 for explicit participant-scoped deal access and signing gate; 9 for hardening/verification | All UI phases | Access-control rules are split by surface; implementation ownership shifts to phase 8 and phase 9 verifies there is no implicit broker backdoor. |
| RBAC | 1, 3, 5, 6, 7, 8, 9 | All | Existing permission names are reused; no renames are allowed. |
| Admin UI specification | 1 primary shell; 2, 3, 4, 5, 6 extend | 7, 8, 9 for linked surfaces | Phase 1 owns `/admin/originations/*` shell and stepper. |
| Deprecated / narrowed code paths | 3 and 9 primary; 2, 5, 6 also enforce local bans | All | Generic listing create is phase 3 + 9; seed/demo/direct-insert footguns are phase 9 hardening plus local phase bans. |
| Implementation module layout | 1–9 | All | File ownership is repeated in every spec and mirrors the master spec’s recommended layout. |
| Global acceptance criteria | Distributed across all 9 phases | 9 verifies end-to-end | Full mapping appears in section F. |
| Phase-specific manual checkpoints and definitions of done | Matching phase owner | 9 verifies full story | Every phase spec carries forward its checkpoint and DoD. |
| Stakeholder-demo flow | 9 | All prior phases enable it | Phase 9 owns final demo hardening and verification; the flow depends on all prior phases. |

## B. Hard rules and forbidden implementation paths → target specs

| Hard rule / forbidden path | Owner phase(s) | Consuming / verifying phase(s) |
| --- | --- | --- |
| There MUST be one admin origination workflow that stages in backoffice and commits once. | 1 | 2–9 |
| There MUST NOT be a standalone production “Create Borrower” button that bypasses origination for mortgage-backed flows. | 1 | 2, 9 |
| There MUST NOT be a production “Create Listing” path for mortgage-backed listings. | 3 | 1, 9 |
| There MUST NOT be a second mortgage constructor separate from the canonical one. | 2 | 3, 4, 6, 9 |
| Both `adminOriginationCase -> Mortgage` and `ApplicationPackage -> Mortgage` MUST call the same internal constructor. | 2 | 9 |
| Mortgage-backed listings are a projection/read model, not an independently authored mortgage business object. | 3 | 1, 6, 9 |
| Marketplace curation remains listing-owned; mortgage economics/property facts/valuation/public docs/payment history are projection-owned. | 3 | 1, 6 |
| Origination MUST integrate with the existing three-layer payment model and MUST NOT create bespoke payment rows. | 4 | 2, 5, 9 |
| Rotessa is a rail, not the economic source of truth. | 5 | 4, 9 |
| Documents MUST follow the blueprint → package → instance model. | 6, 7 | 8, 9 |
| Deal documents are immutable snapshots after `DEAL_LOCKED`. | 7 | 6, 8, 9 |
| Signable docs MUST use canonical typed participant resolution, not free-form read-model strings. | 7, 8 | 9 |
| Borrower resolution MUST NOT write `users` rows directly in Convex. | 2 | 1, 9 |
| Borrower resolution MUST fail closed on cross-org borrower reuse. | 2 | 9 |
| Borrower resolution MUST NOT create duplicate borrower rows for the same `userId` within the same org. | 2 | 9 |
| `borrowers.userId` MUST remain the auth link. | 2 | 9 |
| The mortgage MUST be inserted directly in `active`; do NOT add admin draft states into `mortgage.machine.ts`. | 2 | 9 |
| Do NOT fake a GT transition for a non-existent mortgage; write origination audit instead. | 2 | 9 |
| The constructor MUST call the existing ownership-ledger genesis primitive. | 2 | 9 |
| Origination MUST stop at obligations + collection plan entries; it MUST NOT create collection attempts, transfer requests, or direct provider transfers. | 4 | 5, 9 |
| Do NOT create a special “admin mortgage obligation” type. | 4 | 9 |
| Plan entries MUST start as `executionMode = "app_owned"` and `status = "planned"`. | 4 | 5, 9 |
| Use existing schedule-rule resolution; do NOT invent admin-only scheduling math. | 4 | 9 |
| If no active schedule rule exists, bootstrap with the existing default config and surface `scheduleRuleMissing = true`. | 4 | 5, 9 |
| Do NOT call generic `pad_rotessa` direct transfer initiation for recurring mortgage collections. | 5 | 9 |
| Do NOT introduce a generic one-off Rotessa make-up abstraction in this feature. | 5 | 9 |
| `documentBasePdfs` MUST NOT be repurposed for user-facing uploaded/archived files. | 6 | 9 |
| Selected template groups MUST be expanded immediately into one pinned draft row per template reference. | 6 | 7, 8 |
| `templateVersion` MUST always be pinned at attachment time. | 6 | 7, 8, 9 |
| `private_templated_non_signable` drafts MUST NOT contain signable fields. | 6 | 7, 8 |
| `private_templated_signable` drafts MUST contain signable fields and signatory roles. | 6 | 8 |
| Only the allowed signatory platform-role registry may be used for mortgage-attached signable blueprints. | 6 | 8, 9 |
| Blueprint rows are immutable except for archival; edits archive old rows and insert new rows. | 6 | 7, 8, 9 |
| Existing deal packages MUST NEVER change when blueprints change later. | 7 | 6, 8, 9 |
| Package creation MUST be idempotent on `dealId`. | 7 | 8, 9 |
| The deal portal MUST query `dealDocumentInstances`, not infer docs ad hoc from mixed sources. | 7 | 8, 9 |
| One document failure MUST NOT roll back the entire deal lock; package status must surface partial failure. | 7 | 8, 9 |
| The portal MUST never talk directly to Documenso. | 8 | 9 |
| The portal MUST never receive a provider admin URL. | 8 | 9 |
| Embedded signing sessions MUST be issued from the backend only after explicit participant `dealAccess` exists for the viewer’s WorkOS identity and the user matches a `signatureRecipient`. | 8 | 9 |
| Signed artifacts MUST be stored back in platform-controlled storage. | 9 | 8 |
| Raw `_storage` IDs MUST NOT be the long-term client contract for public document access. | 6, 9 | 8 |
| Broker visibility MUST be explicit through `dealAccess`, never through admin bypass or hidden reads. | 8 | 9 |
| `listing:create` MUST NOT remain the production authority for mortgage-backed listing creation. | 3 | 9 |
| Demo-only / deprecated paths (`seedMortgage`, direct mortgage inserts, live mutable template-group refs, etc.) MUST be removed, narrowed, or explicitly gated. | 9 with local enforcement in 2, 3, 5, 6 | All |

## C. Named tables / entities / field additions → owner phases

| Named table / entity / field set | Owner phase | Consuming phase(s) | Notes |
| --- | --- | --- | --- |
| `adminOriginationCases` | 1 | 2, 5, 6 | Conservative additive shape defined in phase 1 because the retrieved snippets did not expose a full type block. |
| `originationCaseDocumentDrafts` table existence | 1 | 6 | Semantic ownership of draft classes and validations moves to phase 6. |
| `borrowers.creationSource`, `borrowers.originatingWorkflowType`, `borrowers.originatingWorkflowId` | 2 | 7, 8, 9 | Borrower provenance fields. |
| `mortgages.creationSource`, `originationPath`, `originatingWorkflowType`, `originatingWorkflowId`, `originatedByUserId` | 2 | 3, 4, 5, 6, 7, 8, 9 | Includes workflow-source idempotency index. |
| `users.by_email` | 2 | 7, 8, 9 | Required indexed identity lookup for borrower resolution. |
| `borrowers.by_user_and_org` | 2 | 7, 8, 9 | Required indexed borrower reuse lookup. |
| `mortgageValuationSnapshots` | 2 | 3, 6, 7 | Canonical valuation summary source. |
| `mortgageBorrowers` rows for all participants | 2 | 4, 5, 7, 8, 9 | Existing table, new origination writer. |
| `listings` `mortgage_pipeline` projection row | 3 | 6, 9 | Existing table, phase 3 owns creation/update path. |
| `listings.publicDocumentIds` compatibility cache | 3 | 6 | Projection/cache only, never authoring truth. |
| Existing `obligations` rows created at origination | 4 | 5, 9 | Existing table, phase 4 owns generation path. |
| Existing `collectionPlanEntries` rows created at origination | 4 | 5, 9 | Existing table, phase 4 owns generation path. |
| `documentAssets` | 6 | 7, 8, 9 | Immutable admin-uploaded or signature-archived PDFs with `orgId` denormalization and direct-query indexing for admin/audit reads. |
| `mortgageDocumentBlueprints` | 6 | 3, 7, 8, 9 | Mortgage-owned document truth with `orgId` denormalization and direct-query indexing for active/admin/audit reads. |
| Existing `generatedDocuments` deal rows for package generation | 7 for non-signable use; 8 for signable use; 9 for archive fields population | 9 | Existing table reused, not replaced. |
| `dealDocumentPackages` | 7 | 8, 9 | Package header, idempotent on `dealId`, with `orgId` denormalization and direct-query indexing. |
| `dealDocumentInstances` | 7 | 8, 9 | Unified deal portal document surface with `orgId` denormalization and direct-query indexing. |
| `signatureEnvelopes` | 8 | 9 | Normalized envelope lifecycle. |
| `signatureRecipients` | 8 | 9 | Recipient-level signing state. |
| `generatedDocuments.finalPdfStorageId`, `completionCertificateStorageId`, `signingCompletedAt` | 8 schema-additive, 9 behavioral population | 9 | Phase 8 may add them so phase 9 can populate them. |
| explicit participant-scoped `dealAccess` rows, including `broker_of_record` and `assigned_broker` | 8 | 9 | Explicit access model for deal-private docs, broker portal participation, and signing prerequisites. |
| Typed deal participant surface (`deals` typed fields, `dealParticipants`, or resolver composition) | 7 | 8, 9 | Exact storage mechanism is repo-specific; typed resolution contract is mandatory. |

## D. Named helpers / mutations / actions / projectors / seams → owner phases

| Named helper / contract / seam | Owner phase | Consuming phase(s) | Master-spec role |
| --- | --- | --- | --- |
| `resolveOrProvisionBorrowersForOrigination(caseId)` | 2 | 1, 5, 9 | Canonical borrower resolution and WorkOS provisioning gate. |
| Dedicated WorkOS identity lookup / invite seam | 2 | 1, 7, 8, 9 | Indexed identity discovery + invite/provision path; never direct Convex `users` writes. |
| `MortgageActivationSource` | 2 | 3, 4, 6 | Provenance contract for the canonical constructor. |
| `ActivateMortgageAggregateInput` | 2 | 3, 4, 6 | Canonical constructor input. |
| `ActivateMortgageAggregateResult` | 2 | 3, 4, 5, 6 | Canonical constructor result shape; later phases fill their owned fields. |
| `activateMortgageAggregate` / `activateMortgageAggregate.ts` | 2 | 3, 4, 6 | Core canonical mortgage activation constructor. |
| Ownership-ledger genesis primitive (exact repo name intentionally repo-specific) | 2 | 9 | Mandatory call inside the constructor. |
| `upsertMortgageListingProjection(mortgageId, overrides?)` | 3 | 2, 6, 9 | Authoritative listing projector. |
| `syncListingPublicDocumentsProjection` | 3 | 6 | Compatibility patch for `listings.publicDocumentIds`. |
| `generateInitialMortgageObligations(input)` | 4 | 5, 9 | Shared obligations generator. |
| Wrapper around `ensureDefaultEntriesForObligationsImpl` or `scheduleInitialEntriesImpl` | 4 | 5, 9 | Shared initial scheduling seam. |
| Existing `payments/recurringSchedules/activation.ts` action | 5 | 9 | Reused provider-managed recurring schedule activation. |
| Retry mutation/action for failed immediate activation | 5 | 9 | Retryable post-commit activation failure handling. |
| Static upload mutation creating `_storage` + `documentAssets` + draft row | 6 | 1, 7, 8 | Static upload rule. |
| Template attach mutation resolving current published version and pinning `templateVersion` | 6 | 7, 8 | Template attachment rule. |
| Group expansion logic for template groups | 6 | 7, 8 | Immediate group expansion rule. |
| Blueprint archival / replacement mutation | 6 | 7, 8, 9 | Mortgage-side blueprint edit model. |
| Listing public-doc query (`listingId -> mortgageId -> public blueprints -> assets -> signed URL`) | 6 | 9 | Authoritative lender-facing public-doc read path. |
| `resolveDealParticipantSnapshot(dealId)` | 7 | 8, 9 | Canonical typed participant resolver. |
| `resolveDealDocumentVariables(dealId)` | 7 | 8 | Canonical interpolation value resolver. |
| `createDocumentPackage` effect | 7 | 8, 9 | Authoritative package/snapshot seam on `DEAL_LOCKED` for private static, non-signable, and deferred signable blueprint snapshots. |
| `resolveDealDocumentSignatories(dealId)` | 8 | 7, 9 | Canonical signatory resolver for signable docs. |
| Participant-scoped `dealAccess` reconciliation helper | 8 | 9 | Explicit grant/revoke lifecycle for lender, borrower, broker, and lawyer participants. |
| `SignatureProvider` | 8 | 9 | Provider seam for Documenso-backed signing. |
| `createEnvelope` / `createEmbeddedSigningSession` / `syncEnvelope` / `downloadCompletedArtifacts` | 8 | 9 | Provider contract methods. |
| Documenso provider implementation | 8 | 9 | v1 provider implementation behind the seam. |
| Provider webhook ingestion and envelope-sync jobs | 8 | 9 | Normalized status updates. |
| `assertDealAccess(user, dealId)` in signing session path | 8 | 9 | Mandatory access check before embedded signing. |
| `archiveSignedDocuments` effect | 9 | 8 | Authoritative archive behavior on `ALL_PARTIES_SIGNED`. |
| Smoke/integration test harness for origination → deal lock → signing | 9 | All | Final production hardening. |

## E. Roles, permissions, access roles, and signatory registries → owner phases

| Name | Owner phase | Consuming phase(s) | Notes |
| --- | --- | --- | --- |
| `mortgage:originate` | 1 route shell, 2 commit/constructor surfaces | 5, 6 | Used for create/update/commit origination cases and blueprint editing. |
| `payment:manage` | 5 | 9 | Used for activation/retry of provider-managed setup. |
| `document:upload` | 6 | 9 | Used for static origination-doc upload. |
| `document:review` | 6 | 7, 8, 9 | Required for template/group/version/system-variable browsing and attachment-time validation. |
| `document:generate` | 7 and 8 | 9 | Used for generation/regeneration and retry flows, not for browsing template authoring inputs. |
| `listing:manage` | 3 | 9 | Used for curate/publish listing after projection. |
| `listing:view` | 3 and 6 | 9 | Required for lender-facing/admin-preview public-doc surfaces and signed-URL access. |
| `deal:view` | 7 | 8, 9 | Used for package status and deal-private docs. |
| `deal:manage` | 7 admin retry surfaces, 8 admin envelope view, 9 final archive/admin override surfaces | 9 | Admin-only deal-document retries/overrides. |
| `broker_of_record` deal-access role | 8 | 9 | Explicit broker participant visibility. |
| `assigned_broker` deal-access role | 8 | 9 | Explicit broker participant visibility. |
| Allowed signatory platform roles: `lender_primary`, `borrower_primary`, `borrower_co_1`, `borrower_co_2`, `broker_of_record`, `assigned_broker`, `lawyer_primary` | 6 | 8, 9 | This registry is fixed for v1 and MUST NOT be expanded casually. |

## F. Global acceptance criteria, phase checkpoints, and definition-of-done mapping

| Global acceptance criterion / checkpoint | Owner phase(s) | Verifying phase |
| --- | --- | --- |
| Admin can create and save an origination case draft from the admin shell. | 1 | 9 |
| Admin can commit a case into canonical borrower/property/mortgage/listing rows from one workflow. | 2 and 3 | 9 |
| Created mortgage is canonical and all later transitions continue through GT. | 2 | 9 |
| Created listing is a unique `mortgage_pipeline` projection per mortgage. | 3 | 9 |
| Borrowers are created/resolved through WorkOS-backed identity and never by fabricating `users` directly. | 2 | 9 |
| Mortgage has `mortgageBorrowers` rows for all participants. | 2 | 9 |
| Mortgage has initial obligations and collection plan entries visible in payment/admin surfaces. | 4 | 9 |
| No collection attempts or transfer requests are created during origination commit. | 4 | 9 |
| Immediate Rotessa activation success converts entries to `provider_scheduled` and patches the mortgage to `provider_managed`. | 5 | 9 |
| Immediate Rotessa activation failure leaves the mortgage intact and shows a retryable collection setup error. | 5 | 9 |
| Public static docs appear on listing detail for authenticated lender-facing viewers. | 6 | 9 |
| Private static docs do not appear on listing; they appear only after deal lock and only in the deal portal. | 6 and 7 | 9 |
| Templated non-signable docs are generated onto the deal package on `DEAL_LOCKED`. | 7 | 9 |
| Templated signable docs are materialized from deferred package snapshots after `LAWYER_VERIFIED` or admin reconcile, create envelopes, and are signable in the deal portal. | 8 | 9 |
| Signed artifacts are archived back into platform storage on `ALL_PARTIES_SIGNED`. | 9 | 9 |
| Existing deals do not change if mortgage document blueprints are edited later. | 6 and 7 | 9 |
| Brokers involved in a deal can access deal-private docs only through explicit deal access, not admin bypass. | 8 and 9 | 9 |
| Generic mortgage-backed listing create path is no longer a production authoring entrypoint. | 3 and 9 | 9 |
| Legacy empty-listing admin query path is not the authoritative UI for this workflow. | 1 and 9 | 9 |
| Phase 1 manual checkpoint and DoD | 1 | 9 |
| Phase 2 manual checkpoint and DoD | 2 | 9 |
| Phase 3 manual checkpoint and DoD | 3 | 9 |
| Phase 4 manual checkpoint and DoD | 4 | 9 |
| Phase 5 manual checkpoint and DoD | 5 | 9 |
| Phase 6 manual checkpoint and DoD | 6 | 9 |
| Phase 7 manual checkpoint and DoD | 7 | 9 |
| Phase 8 manual checkpoint and DoD | 8 | 9 |
| Phase 9 manual checkpoint, DoD, and stakeholder-demo script | 9 | 9 |

## G. Conservative ambiguity resolutions that this package makes explicit

| Ambiguous or intentionally repo-specific point in the retrieved master-spec snippets | Resolution in this package | Why it is conservative |
| --- | --- | --- |
| The retrieved snippets described `adminOriginationCases` behavior but did not expose a single full table/interface block. | Phase 1 defines the minimum persisted shape required by the master spec: staged participant/property/valuation/mortgage/collections/listing subdocuments, case status, validation snapshot, commit references, timestamps, and additive extension room. | It adds only the fields required to preserve the master spec’s described workflow; it does not change architecture or add product scope. |
| The exact name of the ownership-ledger genesis primitive was intentionally left repo-specific. | Phase 2 preserves that repo-specific seam as a mandatory constructor call and forbids omission or replacement. | It keeps the master spec’s intentional abstraction instead of inventing a new ownership model. |
| The exact existing audit table / journal primitive name was not visible in the retrieved snippets. | Phase 2 requires use of the repo’s existing audit/journal conventions for origination audit and explicitly forbids faking a GT transition. | It preserves behavior without inventing a conflicting audit subsystem. |
| The exact typed storage mechanism for canonical deal participants (`deals` typed fields vs `dealParticipants` table vs resolver composition) was intentionally left open. | Phase 7 owns the mandatory typed participant-resolution contract and may satisfy it by typed fields, `dealParticipants`, or internal composition, but the exported resolver signature is fixed. | It preserves the master spec’s “typed contract required, storage mechanism flexible” instruction. |


# DELIVERABLE 3 — The 9 standalone specs


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
- V1 participant scope for origination is exactly one primary borrower plus up to two co-borrowers. Guarantors are out of scope and MUST be rejected before any canonical writes.
- Borrower resolution MUST:
  - use an indexed `users.by_email` lookup or an equivalent dedicated identity lookup seam,
  - provision/invite via a dedicated WorkOS identity seam when needed,
  - stop at `awaiting_identity_sync` if provisioning has not yet materialized a synced `users` row,
  - reuse an existing borrower for the same user and org through `borrowers.by_user_and_org`,
  - create a borrower only after a real `users` row exists.
- The implementation MUST NOT write `users` rows directly in Convex.
- The implementation MUST fail closed on cross-org borrower reuse.
- The implementation MUST NOT create duplicate borrower rows for the same `userId` within the same org.
- The implementation MUST persist stable borrower participant ordering metadata for downstream signatory and access resolution.
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

## Required identity indexes and WorkOS seam

This phase MUST add or formalize the following repo-level seams rather than relying on table scans or direct Convex writes:

- `users.by_email`
- `borrowers.by_user_and_org`
- a dedicated WorkOS identity lookup / invite seam that can:
  - check whether an email already maps to a WorkOS identity,
  - trigger invite / provisioning when needed,
  - wait for the synced Convex `users` row instead of fabricating one locally

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

## Persisted borrower ordering metadata

`mortgageBorrowers` insertion in this phase MUST preserve the borrower ordering contract that later signatory/access flows consume:

- `participantKey = "borrower_primary" | "borrower_co_1" | "borrower_co_2"`
- `role = "primary" | "co_borrower"`
- `coBorrowerOrdinal?: 1 | 2`

The exact storage shape may be additive fields on `mortgageBorrowers` or an equivalent typed participant join, but the ordering contract itself is mandatory.

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
    participantKey: "borrower_primary" | "borrower_co_1" | "borrower_co_2";
    borrowerId: Id<"borrowers">;
    borrowerUserId: Id<"users">;
    borrowerAuthId: string;
    role: "primary" | "co_borrower";
    coBorrowerOrdinal?: 1 | 2;
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
   - normalize the email and query `users.by_email` or the dedicated identity lookup seam,
   - if no synced `users` row exists, trigger the dedicated WorkOS invite/provision seam,
   - do **not** insert into `users` directly.
3. If provisioning has been initiated but the synced `users` row is still absent:
   - patch the case to `status = "awaiting_identity_sync"`,
   - stop before any property, mortgage, payment, listing, or document canonical writes occur.
4. Once a `users` row exists:
   - look for an existing borrower by `borrowers.by_user_and_org`,
   - if found, reuse it,
   - else create a borrower row linked to that `userId` in the correct org with a borrower-domain status valid for immediate mortgage origination.
5. Return a typed resolved participant list carrying:
   - `participantKey`,
   - `role`,
   - `coBorrowerOrdinal`,
   - `borrowerId`,
   - `userRecordId`,
   - `authId`.

## 2. Canonical activation constructor

Create `convex/mortgages/activateMortgageAggregate.ts` and implement these steps atomically:

1. Validate source and idempotency.
   - Check the workflow-source uniqueness index.
   - If the workflow already produced a mortgage, return the existing aggregate result.
2. Resolve or create property.
3. Insert `mortgageValuationSnapshot`.
4. Insert the mortgage row directly in canonical initial servicing shape.
5. Insert `mortgageBorrowers` with exactly one primary borrower, zero to two ordered co-borrowers, and persisted participant ordering metadata.
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

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Stable case payloads from phase 1.
- Existing broker, borrower, property, mortgage, and ownership-domain infrastructure in the repo.
- A dedicated WorkOS identity lookup / invitation seam and synced `users` rows discoverable through `users.by_email`.
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
- Primary/co-borrower resolution and ordering are correct within the supported v1 scope.
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
6. Confirm any co-borrowers were persisted with stable `participantKey` / ordinal ordering.
7. Double-submit the same case and confirm no duplicate mortgage is created.
8. Trigger a brand-new borrower email path and confirm the case halts at `awaiting_identity_sync` before any mortgage is created.

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



# SPEC HEADER

- **Spec number:** 4
- **Exact title:** Payment bootstrap integration
- **Recommended filename:** `phase-04-payment-bootstrap-integration.md`
- **Primary objective:** Bootstrap obligations and app-owned collection plan entries through the existing Active Mortgage Payment System during canonical origination.
- **Why this phase exists:** The master spec makes the payment architecture a hard constraint. Origination must create economic truth in `obligations` and collection intent in `collectionPlanEntries`, but it must stop before execution reality such as attempts, transfers, or external schedules.
- **Why this phase is separately parallelizable:** This phase touches the canonical constructor only through the payment-bootstrap seam. It does not own the constructor’s source/provenance semantics, listing projection, document authoring, or provider-managed recurring activation.

# PHASE OWNERSHIP

## What this phase owns

- `generateInitialMortgageObligations(input)` or equivalent helper.
- The initial collection-plan bootstrap wrapper around the existing scheduling seam.
- The constructor’s payment-bootstrap step (`10.8` in the master spec).
- `createdObligationIds`, `createdPlanEntryIds`, and `scheduleRuleMissing` in the constructor result.
- Mortgage/admin payment setup read surfaces:
  - obligations list,
  - collection plan entries list,
  - schedule-rule warning display.

## What this phase may touch but does not own

- `activateMortgageAggregate.ts` owned by phase 2, but only in the reserved payment-bootstrap seam.
- The collections step UI shell owned by phase 1 and later extended by phase 5.
- Existing payment modules such as `collectionPlan/initialScheduling.ts` and the obligation machine conventions.

## What this phase must not redesign

- The core constructor boundary owned by phase 2.
- Provider-managed recurring activation owned by phase 5.
- The listing projector owned by phase 3.
- Blueprint/document package/signature behavior owned by phases 6–9.

## Upstream prerequisites

- Phase 2 canonical constructor and primary-borrower resolution.

## Downstream dependents

- Phase 5 consumes the app-owned future plan entries and execution-mode defaults that this phase creates.
- Phase 9 end-to-end tests verify that origination stops at obligations + plan entries and creates no attempts or transfer requests.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec’s payment section is mandatory and authoritative:

- At origination commit, the system MUST create obligations and app-owned collection plan entries.
- It MUST NOT create collection attempts, transfer requests, or directly initiate provider transfers.
- The primary borrower is the servicing borrower for v1.
- Recurring scheduled obligations use `type = "regular_interest"`.
- If principal is contractually due at maturity, create one `type = "principal_repayment"` obligation at maturity.
- Do not create arrears or late-fee obligations at origination.
- `amountSettled` starts at `0`.
- `paymentNumber` is monotonic.
- Obligations must enter through the canonical inserted state expected by the existing payment model. If any obligation should already be due or overdue at origination time, the implementation MUST replay the canonical governed transition events after insert rather than patching governed status fields directly.
- Plan entries MUST start at `executionMode = "app_owned"` and `status = "planned"`.
- Use the existing schedule-rule resolution and default schedule config. Do not invent admin-only scheduling math.
- If no active schedule rule exists, still bootstrap using existing defaults and return `scheduleRuleMissing = true`.

This phase also preserves a later hard rule: provider-managed recurring setup must build on top of these app-owned planned entries instead of inventing a second payment model.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Implement the shared initial obligations generator.
- Implement the wrapper around the existing initial scheduling seam.
- Patch the canonical constructor to call payment bootstrap at the correct ordered step.
- Ensure the mortgage begins with:
  - `collectionExecutionMode = "app_owned"`
  - `collectionExecutionProviderCode = undefined`
  - `activeExternalCollectionScheduleId = undefined`
- Surface `scheduleRuleMissing`.
- Add mortgage/admin payment setup reads:
  - obligations list,
  - collection plan entries list,
  - warning chip/banner when schedule rule was missing.

# OUT-OF-SCOPE

- Immediate provider-managed recurring activation. That is phase 5.
- Any collection attempt creation.
- Any transfer request creation.
- Any direct provider transfer initiation.
- Any one-time Rotessa abstraction for arrears cures, late fees, or manual make-up payments.
- Any blueprint or document work.
- Any deal package or signing behavior.

# AUTHORITATIVE RULES AND INVARIANTS

- Origination MUST stop at obligations + collection plan entries.
- Origination MUST NOT create collection attempts.
- Origination MUST NOT create transfer requests.
- Origination MUST NOT directly initiate provider transfers.
- Do NOT create a special “admin mortgage obligation” type.
- Use the existing obligation machine / governed-transition path for any due-or-overdue progression; do NOT patch governed obligation statuses directly during origination.
- Use the existing initial scheduling logic and existing schedule-rule resolution.
- Do NOT invent admin-only scheduling math.
- Plan entries MUST start as app-owned planned entries.
- The primary borrower is the servicing borrower for v1.
- This phase MUST preserve phase 5’s later ability to convert eligible future app-owned entries into provider-managed recurring schedules.

# DOMAIN / DATA / CONTRACT CHANGES

## Shared obligations generator

```ts
generateInitialMortgageObligations(input): {
  primaryBorrowerId: Id<"borrowers">;
  obligationIds: Id<"obligations">[];
}
```

### Obligation-generation rules

- Use the primary borrower as the servicing borrower for v1.
- Generate recurring scheduled obligations from `firstPaymentDate` through `maturityDate`.
- Use `type = "regular_interest"` for recurring scheduled obligations.
- If principal is due at maturity, generate one `type = "principal_repayment"` obligation at maturity.
- Do not generate `arrears_cure` or `late_fee` at origination.
- Set `amountSettled = 0`.
- Set `paymentNumber` monotonically.
- Insert obligations in the canonical initial state expected by the existing generator/writer path.
- If `firstPaymentDate` or another origination input means an obligation should already be due or overdue, immediately replay the canonical transition events (for example `BECAME_DUE` and, where appropriate, `GRACE_PERIOD_EXPIRED`) after insert instead of writing `due` / `overdue` directly.

## Shared initial collection-plan bootstrap wrapper

Preferred seam:
- wrapper around `ensureDefaultEntriesForObligationsImpl`

Acceptable fallback if the generated obligations are already persisted and queryable:
- wrapper around `scheduleInitialEntriesImpl`

### Collection-plan rules

- New entries MUST begin at `executionMode = "app_owned"`.
- New entries MUST begin at `status = "planned"`.
- Existing default schedule-rule resolution MUST be reused.
- If the active schedule rule is missing, reuse the existing default schedule config and return `scheduleRuleMissing = true`.

## Constructor outputs this phase owns

- `createdObligationIds`
- `createdPlanEntryIds`
- `scheduleRuleMissing`

# BACKEND WORK

- Add `convex/payments/origination/bootstrap.ts`.
- Implement the obligations generator with canonical recurring + maturity principal logic.
- Reuse the existing obligation machine’s transition conventions instead of inventing new statuses or writing governed terminal states directly.
- Implement the initial plan-entry bootstrap wrapper around existing scheduling code.
- Modify `activateMortgageAggregate` in the reserved seam so that after the later phase-6 blueprint hook and before the later phase-3 listing hook, it:
  1. generates obligations,
  2. bootstraps plan entries,
  3. replays any immediately required canonical due / overdue transitions,
  4. returns created IDs and `scheduleRuleMissing`.
- Ensure no attempts or transfer requests are created.
- Ensure no provider APIs are called here.

# FRONTEND / UI WORK

- Extend mortgage detail/admin surfaces with payment setup summary.
- Add obligations list visibility from mortgage/admin.
- Add collection plan entries visibility from mortgage/admin.
- Show a schedule-rule warning chip/banner if `scheduleRuleMissing = true`.
- Make sure the UI clearly shows app-owned planned entries rather than implying provider-managed status.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Canonical mortgage row, participants, and primary borrower from phase 2.
- Existing payment tables and the current `collectionPlan/initialScheduling.ts` seam.
- Existing obligation-machine status conventions.

## Outputs this phase guarantees

- Real canonical `obligations`.
- Real canonical app-owned planned `collectionPlanEntries`.
- Mortgage execution fields left in app-owned mode.
- A surfaced `scheduleRuleMissing` warning.

## Contracts exported for later phases

- `generateInitialMortgageObligations`
- the bootstrap wrapper result containing obligation IDs, plan-entry IDs, and `scheduleRuleMissing`
- stable app-owned / planned plan-entry preconditions for phase 5

## Temporary compatibility bridges

- Nothing in this phase should pretend provider activation has happened; that remains phase 5.
- If schedule-rule configuration is missing, the system still bootstraps with the existing default config and surfaces the warning rather than blocking origination.

## Idempotency / retry / failure semantics

- Constructor-level idempotency remains owned by phase 2.
- The bootstrap helper itself must avoid duplicate live coverage by reusing the existing scheduling seam correctly.
- Re-running bootstrap through the constructor on the same workflow source must not create duplicate live plan coverage.
- The absence of a schedule rule is a warning, not a reason to create bespoke scheduling logic.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/payments/origination/bootstrap.ts`
  - payment/admin UI surfaces for obligations and collection plan entries
- **Shared but not owned**
  - `convex/mortgages/activateMortgageAggregate.ts`
  - `collectionPlan/initialScheduling.ts`
  - existing obligation / collection-plan tables and machines
- **Later phases may extend but not redesign**
  - payment setup summary UI
  - the constructor result fields consumed by phase 5

# ACCEPTANCE CRITERIA

- Committing a mortgage creates real obligations and real app-owned planned plan entries.
- No collection attempts exist immediately after origination commit.
- No transfer requests exist immediately after origination commit.
- No side-channel payment tables are introduced.
- `scheduleRuleMissing` is surfaced when appropriate.
- Mortgage/admin surfaces can inspect the resulting obligations and plan entries.
- This phase satisfies global acceptance criteria 7 and 8 and enables criteria 9 and 10.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Commit a mortgage.
2. Open obligations and see scheduled obligations.
3. Open collection plan entries and see `planned` entries in `app_owned` mode.
4. Verify no collection attempts exist yet.
5. Verify no transfer requests exist yet.
6. Test a missing-schedule-rule environment and see the warning surfaced while the plan still bootstraps.

# RISKS / EDGE CASES / FAILURE MODES

- The most common bug is accidentally creating attempts or transfer requests during origination because the execution pipeline already exists. Do not bypass the architecture boundary.
- The second common bug is inventing a mortgage-specific schedule calculator instead of reusing the existing scheduling seam.
- Be careful about due-date status computation for obligations; it must match the existing obligation machine.
- If principal is due at maturity, ensure exactly one maturity principal-repayment obligation is created.
- Keep future phase 5 in mind: its provider-managed recurring activation assumes there are eligible future app-owned plan entries to convert.

# MERGE CONTRACT

After this phase is merged:

- Canonical origination creates obligations and app-owned planned collection plan entries.
- The mortgage stays in app-owned execution mode until a later phase intentionally changes it.
- Later phase 5 can build directly on the created future app-owned entries without inventing another collection model.
- No later phase may reinterpret origination as an execution-time transfer or provider-initiation workflow.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not create collection attempts.
- Do not create transfer requests.
- Do not call provider APIs directly.
- Do not invent admin-only obligation types.
- Do not invent admin-only scheduling math.
- Do not skip `scheduleRuleMissing` warning propagation.



# SPEC HEADER

- **Spec number:** 5
- **Exact title:** Immediate Rotessa activation
- **Recommended filename:** `phase-05-immediate-rotessa-activation.md`
- **Primary objective:** Optionally activate provider-managed recurring collections immediately after origination commit by reusing the existing recurring-schedule activation flow and preserving non-transactional failure semantics.
- **Why this phase exists:** The master spec explicitly wants optional immediate provider-managed recurring setup at origination time, but only by reusing the existing recurring-schedule activation path. The mortgage, obligations, and app-owned plan entries must remain canonical even if provider activation fails.
- **Why this phase is separately parallelizable:** This phase owns only the post-commit provider-managed activation decision, validation, status persistence, retry behavior, and UI. It does not own obligation generation, generic payment modeling, or provider-independent one-off collection abstractions.

# PHASE OWNERSHIP

## What this phase owns

- The collections-step semantics for:
  - no collection setup,
  - manual/app-owned only,
  - provider-managed now.
- Validation of bank-account and cadence preconditions for immediate provider-managed activation.
- The post-commit follow-up action that calls the existing recurring-schedule activation flow.
- Retryable persisted activation status and last-error state.
- Retry mutation/action.
- Payment/admin UI status badges and retry affordances for immediate activation.

## What this phase may touch but does not own

- `adminOriginationCases.collectionsDraft` / equivalent case collections subdocument created in phase 1.
- `activateMortgageAggregate` commit orchestration from phase 2 only to enqueue the follow-up activation action.
- Payment surfaces from phase 4 only to read the created app-owned plan entries and mortgage execution fields.

## What this phase must not redesign

- Phase 4’s obligation and plan-entry bootstrap rules.
- The existing recurring-schedule activation adapter contract in `payments/recurringSchedules/activation.ts`.
- The canonical mortgage/payment economic truth tables.
- Any one-off or irregular collection behavior for arrears cures, late fees, or make-up payments.

## Upstream prerequisites

- Phase 1 collections step shell and persisted collections draft.
- Phase 2 canonical commit path and primary borrower resolution.
- Phase 4 payment bootstrap output.

## Downstream dependents

- Phase 9 end-to-end smoke coverage and stakeholder-demo flow.
- Any future servicing work that assumes the mortgage is either app-owned or provider-managed according to the existing fields.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec is very specific here:

- If the admin chooses immediate provider-managed activation, the canonical mutation commits first and a follow-up action calls the existing recurring-schedule activation flow.
- The existing action in `payments/recurringSchedules/activation.ts` already:
  - requires eligible future app-owned plan entries,
  - requires a borrower-owned bank account,
  - validates the bank-account record,
  - requires Rotessa customer identifiers in metadata,
  - maps mortgage cadence to Rotessa frequency,
  - rejects concurrent live schedules,
  - converts plan entries to `provider_scheduled`,
  - patches the mortgage to `provider_managed`,
  - sets `activeExternalCollectionScheduleId`.
- Bank-account preconditions are hard requirements:
  - the account MUST belong to the primary borrower in v1,
  - `status = "validated"`,
  - `mandateStatus = "active"` for PAD providers,
  - valid institution/transit format,
  - one of the Rotessa metadata identifiers must exist.
- Supported cadence mapping is:
  - `monthly -> Monthly`
  - `bi_weekly` and `accelerated_bi_weekly -> Every Other Week`
  - `weekly -> Weekly`
- Unsupported frequencies must fail fast.
- The current Rotessa recurring adapter requires uniform installment amounts across the selected entries.
- If provider-managed activation fails:
  - the mortgage still exists,
  - obligations still exist,
  - app-owned plan entries still exist,
  - the case is still committed,
  - the collections status is failed and retryable.
- The master spec explicitly forbids direct recurring `pad_rotessa` transfer initiation for mortgages.
- The feature explicitly does **not** introduce a generic one-off Rotessa abstraction for irregular collections.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Extend the collections-step draft model with concrete activation semantics.
- Allow the admin to choose among:
  - no collection setup,
  - manual/app-owned only,
  - provider-managed now.
- Allow bank-account selection for provider-managed now.
- Validate primary-borrower ownership and existing bank-account/provider prerequisites.
- Trigger the existing recurring-schedule activation flow **after** canonical origination commit.
- Persist activation status:
  - pending,
  - activating,
  - active,
  - failed.
- Persist `lastError` and retry count/state.
- Add retry mutation/action and UI retry affordance.
- Show clear post-commit failure banners without rolling back canonical origination.

# OUT-OF-SCOPE

- Generating obligations or plan entries. That belongs to phase 4.
- Creating any one-off Rotessa abstraction for late fees, arrears cures, or make-up payments.
- Calling generic direct transfer initiation for recurring mortgage collections.
- Redesigning the existing recurring-schedule activation flow.
- Any document, package, signature, or archive behavior.

# AUTHORITATIVE RULES AND INVARIANTS

- The canonical origination mutation MUST commit first.
- Immediate provider-managed activation MUST happen afterward as a follow-up action.
- The selected bank account MUST belong to the primary borrower in v1.
- The selected bank account MUST be validated.
- PAD mandates MUST be active where applicable.
- Institution/transit validation MUST pass.
- One of the required Rotessa metadata identifiers MUST exist.
- Unsupported mortgage cadences MUST fail fast for provider-managed activation.
- Uniform installment amounts across the covered future entries are required.
- Provider-activation failure MUST NOT roll back canonical origination.
- The mortgage’s economic truth remains in canonical domain tables, not in Rotessa.
- This phase assumes phase 4 already created future app-owned planned entries and MUST operate on those entries rather than rebuilding collection intent from raw mortgage terms.
- Do NOT call generic recurring `pad_rotessa` transfer initiation.
- Do NOT introduce a generic one-off Rotessa abstraction in this feature.

# DOMAIN / DATA / CONTRACT CHANGES

## Collections draft / persisted activation state

Phase 1 created the shell field; this phase owns its semantics. The minimum required persisted shape is:

```ts
interface AdminOriginationCollectionsDraft {
  mode: "none" | "app_owned_only" | "provider_managed_now";
  providerCode?: "pad_rotessa";
  selectedBankAccountId?: Id<"bankAccounts">;

  activationStatus?:
    | "not_requested"
    | "pending"
    | "activating"
    | "active"
    | "failed";

  lastError?: string;
  retryCount?: number;
  lastAttemptAt?: number;
}
```

### Rules

- `mode = "provider_managed_now"` means “attempt provider-managed setup immediately after canonical commit,” not “block canonical commit until provider activation succeeds.”
- `activationStatus = "failed"` means the mortgage and phase-4 payment artifacts already exist and remain canonical.
- `lastError` must be human-inspectable from admin surfaces.

## Existing recurring activation seam consumed

- `payments/recurringSchedules/activation.ts` remains the only acceptable recurring activation path.
- This phase may wrap it, validate inputs before calling it, and persist UI-facing status around it.
- This phase MUST NOT replace it with a second adapter.

# BACKEND WORK

- Add `convex/payments/origination/activateCollections.ts` or equivalent owner module.
- Read the committed case / mortgage / created plan entries and selected bank account.
- Validate preconditions before invoking the provider-managed activation action:
  - primary-borrower ownership,
  - bank account validated,
  - active PAD mandate where applicable,
  - institution/transit format,
  - Rotessa customer metadata presence,
  - supported cadence,
  - equal covered future-entry amounts,
  - no concurrent live schedules.
- After commit, enqueue a follow-up activation action when `mode = "provider_managed_now"`.
- Persist status transitions:
  - `pending` when canonical commit finishes and activation is queued,
  - `activating` while the action is running,
  - `active` on success,
  - `failed` on failure.
- Persist `lastError` and increment `retryCount`.
- Implement a retry mutation/action that reuses the same validation and the same recurring activation seam.

### Failure semantics

If provider activation fails:

- leave the mortgage row intact,
- leave obligations intact,
- leave app-owned planned entries intact,
- do not rollback the case’s committed state,
- do not hide the failure,
- make the failure retryable.

### Preflight vs source-of-truth validation

Where a failure can be determined from existing local state before commit (for example missing bank-account metadata or unsupported cadence), the UI SHOULD surface that early. However, the follow-up action remains the source-of-truth execution attempt, and the non-transactional failure semantics still apply if the UI did not block or if external state changed between review and action time.

# FRONTEND / UI WORK

- Extend `CollectionsStep.tsx` with the three modes:
  - none,
  - manual/app-owned only,
  - provider-managed now.
- When provider-managed now is selected:
  - require a bank-account selection,
  - display that provider code is `pad_rotessa`,
  - indicate that v1 requires the primary borrower’s bank account.
- Render activation status badges:
  - pending,
  - activating,
  - active,
  - failed.
- Render an explicit “collection setup failed” banner after commit if activation fails.
- Add retry button on failure.
- On mortgage detail / payment setup screens, reflect whether the mortgage remained app-owned or became provider-managed.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Canonical mortgage row from phase 2.
- App-owned planned plan entries from phase 4.
- Existing recurring activation flow in `payments/recurringSchedules/activation.ts`.
- Existing bank-account validation logic and bank-account schema.

## Outputs this phase guarantees

- A persisted admin-visible activation status and error state.
- A follow-up activation action that either:
  - succeeds and lets the existing adapter patch plan entries + mortgage fields, or
  - fails without rolling back canonical origination.

## Contracts exported for later phases

- Retry mutation/action for failed setup.
- A stable persisted activation-status model on the case or equivalent admin state record.
- UI state contracts for mortgage/payment screens.

## Temporary compatibility bridges

- Before the follow-up action runs, the mortgage remains app-owned by definition.
- If activation succeeds, the existing adapter becomes the source of truth for `provider_scheduled` entries and mortgage `provider_managed` state.
- If activation fails, app-owned plan entries remain canonical and executable through existing non-provider-managed paths until a human retries or changes strategy.

## Idempotency / retry / failure semantics

- Repeated retries must not create concurrent live schedules.
- The underlying recurring activation action already rejects concurrent live schedules; preserve that behavior.
- This phase MUST not mark activation active unless the underlying adapter succeeded.
- The UI must survive refresh while statuses change asynchronously.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/payments/origination/activateCollections.ts`
  - collections-step provider-managed-now UX
  - retry action / mutation
  - status banner / badge UI
- **Shared but not owned**
  - `convex/admin/origination/commit.ts`
  - `payments/recurringSchedules/activation.ts`
  - bank-account validation logic
  - mortgage detail payment section
- **Later phases may extend but not redesign**
  - none; this is the owner phase for immediate activation semantics

# ACCEPTANCE CRITERIA

- A user can choose provider-managed now during origination.
- With a valid primary-borrower bank account and valid future entries, the existing recurring adapter is invoked after canonical commit and plan entries become `provider_scheduled`.
- The mortgage moves to `provider_managed` only through the existing adapter.
- Invalid setup or provider failure does not roll back canonical origination.
- The failure is visible and retryable.
- No direct recurring `initiateTransfer` path is added.
- This phase satisfies global acceptance criteria 9 and 10.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Choose a valid primary-borrower bank account.
2. Commit a mortgage with provider-managed now selected.
3. See plan entries convert to `provider_scheduled`.
4. See the mortgage execution mode become `provider_managed`.
5. Repeat with an invalid or incomplete setup and confirm:
   - the mortgage still exists,
   - obligations still exist,
   - app-owned planned entries still exist,
   - the UI shows failed setup with a retry action.

# RISKS / EDGE CASES / FAILURE MODES

- Uniform-amount validation is easy to miss because it depends on the created future plan entries rather than only the raw mortgage terms.
- Bank-account ownership must be primary-borrower-only in v1; do not silently accept co-borrower accounts and do not imply guarantor support exists in this workflow.
- Asynchronous follow-up status can race with redirect and refresh. Persist state; do not keep it only in local UI memory.
- Unsupported cadences must fail fast.
- External provider failures must not tempt the implementation into rolling back canonical origination.
- Do not accidentally convert this phase into a general-purpose one-time-collection framework.

# MERGE CONTRACT

After this phase is merged:

- Immediate provider-managed recurring setup is available as an optional post-commit action.
- The system still treats the mortgage + obligations + plan entries as canonical truth even when provider activation fails.
- The existing recurring adapter remains the only recurring provider activation path.
- Later phases may rely on clear activation status and retry behavior during demo and operational flows.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not call generic recurring `pad_rotessa` direct transfer initiation.
- Do not roll back origination on provider failure.
- Do not support non-primary-borrower bank accounts in v1.
- Do not add one-off Rotessa abstraction in this feature.
- Do not mark provider activation successful without the underlying adapter succeeding.



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
- V1 participant scope is fixed to exactly one primary borrower plus up to two co-borrowers. Guarantors are out of scope, and blueprint attachment must reject any origination case or template expectation that requires additional borrower/guarantor roles.
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
- Require `document:review` for template/group/version/system-variable browsing and attachment-time validation surfaces.
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
- Template/group/version/system-variable browsing and attachment validation require `document:review`. `document:generate` remains the action permission for later generation/regeneration flows in phases 7 and 8.
- Only the allowed signatory registry may be used.
- Signable-blueprint authoring MUST reject unsupported participant scopes rather than inventing extra borrower or guarantor roles.
- Blueprint rows are immutable except for archival.
- Blueprint edits MUST archive old rows and insert new rows.
- Existing deals MUST NEVER change when blueprints change later.
- Public listing docs are visible only on the lender-facing listing detail path or equivalent `listing:view` / admin-preview guarded surfaces and must use signed URLs or equivalent ephemeral access, not raw `_storage` IDs.
- Private docs MUST NOT appear on the listing page.

# DOMAIN / DATA / CONTRACT CHANGES

## `documentAssets`

```ts
type DocumentAssetSource =
  | "admin_upload"
  | "external_import"
  | "signature_archive";

interface DocumentAsset {
  orgId?: string;
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

`documentAssets` is a long-lived operational table. Denormalize `orgId` and add direct-query indexes that support admin review, audit, and signed-archive lookup without cross-table scans.

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
  orgId?: string;
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

`mortgageDocumentBlueprints` is also a long-lived operational table. Denormalize `orgId` and add direct-query indexes for at least active-by-mortgage, active-public-by-mortgage, and audit/admin listing flows.

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

All template/group/version/system-variable reads used to build the attachment UI or perform attach-time validation MUST require `document:review`.

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
- validate the originating case is still within the supported v1 participant scope (exactly one primary borrower and up to two co-borrowers),
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
- requires a lender-facing or `listing:view` / admin-preview permissioned surface,
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
- Unsupported participant scope for v1 signable docs is rejected at attach time.
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

- Phase 8 extends `createDocumentPackage` with the signable branch and consumes `resolveDealParticipantSnapshot` / `resolveDealDocumentVariables`.
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



# SPEC HEADER

- **Spec number:** 8
- **Exact title:** Signable docs, Documenso envelopes, and embedded signing
- **Recommended filename:** `phase-08-signable-docs-documenso-envelopes-and-embedded-signing.md`
- **Primary objective:** Materialize deferred signable deal documents after `LAWYER_VERIFIED` or explicit admin reconcile / retry, create and sync Documenso envelopes through a backend provider seam, and expose embedded signing only to authorized matching recipients.
- **Why this phase exists:** The master spec explicitly rejects direct frontend-to-Documenso coupling. Signable docs must be generated from pinned mortgage-side blueprints, enveloped through a backend provider seam, surfaced through normalized envelope/recipient rows, and launched via backend-issued embedded sessions only after deal access and recipient matching are confirmed.
- **Why this phase is separately parallelizable:** This phase owns only the signable branch of package creation, normalized signature lifecycle tables, the provider seam, Documenso implementation, embedded signing sessions, and webhook/status sync. It does not own mortgage-side blueprint authoring, non-signable package generation, or archive behavior.

# PHASE OWNERSHIP

## What this phase owns

- `signatureEnvelopes`.
- `signatureRecipients`.
- `resolveDealDocumentSignatories(dealId)`.
- Explicit participant-scoped `dealAccess` grant / revoke lifecycle for signable-document participants.
- `SignatureProvider`.
- The Documenso implementation of `SignatureProvider`.
- Deferred signable materialization from the package snapshots created in phase 7.
- Embedded-signing session creation.
- Provider webhook ingestion and provider-status normalization.
- UI for signable docs, recipient status chips, embedded signing launch, and admin envelope status/retry.

## What this phase may touch but does not own

- Package/snapshot orchestration owned by phase 7, only to consume the reserved signable snapshot branch.
- `resolveDealParticipantSnapshot` and `resolveDealDocumentVariables` from phase 7, only as inputs.
- `generatedDocuments` existing schema/module, only to set signable generation metadata and provider linkage.
- Signed artifact archive behavior, which phase 9 owns.

## What this phase must not redesign

- The blueprint truth model from phase 6.
- The package header / instance snapshot model from phase 7.
- The archive behavior from phase 9.
- The access-control requirement that broker visibility be explicit through `dealAccess`.

## Upstream prerequisites

- Phase 6 signable blueprints and allowed signatory role registry.
- Phase 7 package tables, participant resolver, variable resolver, and package creation dispatch seam.

## Downstream dependents

- Phase 9 consumes completed envelopes for `archiveSignedDocuments`.
- Final stakeholder-demo flow depends on this phase for real embedded signing.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec is explicit about the signable-document path:

- Signable mortgage-attached blueprints are selected during origination and pinned to immutable template versions.
- Signable blueprint membership is snapshotted on `DEAL_LOCKED`, but final signable document materialization must happen on `LAWYER_VERIFIED` or an explicit admin reconcile / retry path once lawyer/recipient identity is resolvable.
- The implementation MUST add a typed signatory resolution contract.
- The signable-doc path MUST use a backend `SignatureProvider` seam.
- v1 provider is `documenso`.
- The portal MUST never talk directly to Documenso.
- The portal MUST never receive a provider admin URL.
- The signable-doc path MUST rely on explicit participant-scoped `dealAccess` rows, not implicit broker access or mortgage ownership.
- Embedded signing sessions MUST only be issued after:
  - explicit `dealAccess` has been granted to the viewer’s WorkOS `authId`, and
  - the viewer matches the intended `signatureRecipient` by recipient identity.
- Signatory platform roles are restricted to the master spec’s allowed registry.
- Provider statuses must be normalized into canonical envelope/recipient rows and reflected onto `generatedDocuments.signingStatus` and `dealDocumentInstances.status`.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Add `signatureEnvelopes`.
- Add `signatureRecipients`.
- Add or finalize signable-related additive fields on `generatedDocuments` as required by the provider lifecycle.
- Implement `resolveDealDocumentSignatories(dealId)`.
- Implement participant-scoped `dealAccess` grant/revoke reconciliation for lender, borrower, broker, and lawyer participants who should see deal-private signing surfaces.
- Implement `SignatureProvider`.
- Implement Documenso-backed `SignatureProvider`.
- Implement deferred signable materialization so phase-7 signable blueprint snapshots:
  - generate pinned-version PDFs,
  - resolve variables,
  - resolve signatories,
  - create envelopes,
  - create normalized recipient rows,
  - create or upgrade `dealDocumentInstances` with signable statuses.
- Implement embedded-signing session issuance from the backend.
- Implement provider webhook ingestion / sync.
- Map provider statuses into normalized rows and surfaced UI state.

# OUT-OF-SCOPE

- Mortgage-side blueprint authoring.
- Public/private static blueprint behavior.
- Non-signable package generation.
- Signed archive download/upload/storage completion. That belongs to phase 9.
- Archive-time hardening owned by phase 9.

# AUTHORITATIVE RULES AND INVARIANTS

- The portal MUST never talk directly to Documenso.
- The portal MUST never receive a provider admin URL.
- Signable docs MUST be materialized from the signable blueprint snapshots captured at deal lock time; they MUST NOT be lazily generated in the client and MUST NOT re-read live mortgage blueprints later.
- Signatory resolution MUST use canonical typed participant identities, not read-model strings.
- Participant-scoped `dealAccess` for signable/private-doc participants MUST be explicit and keyed by the participant’s WorkOS `authId`.
- Embedded signing session issuance MUST require both valid explicit participant `dealAccess` and matching `signatureRecipient`.
- Only intended recipients may sign.
- The system MUST persist normalized envelope and recipient state across refresh, reconnect, and repeated portal visits.
- Provider status must be normalized into canonical rows.
- This phase MUST not use the provider as long-term storage for signed artifacts; phase 9 archives them back into platform storage.

# DOMAIN / DATA / CONTRACT CHANGES

## `signatureEnvelopes`

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
```

## `signatureRecipients`

```ts
type SignatureRecipientStatus =
  | "pending"
  | "opened"
  | "signed"
  | "declined";

interface SignatureRecipient {
  envelopeId: Id<"signatureEnvelopes">;

  platformRole: string;
  userRecordId?: Id<"users">;
  authId?: string;
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

## Signatory resolver

```ts
resolveDealDocumentSignatories(dealId: Id<"deals">): Array<{
  platformRole: string;
  userRecordId?: Id<"users">;
  authId?: string;
  name: string;
  email: string;
}>
```

This resolver MUST map the allowed platform-role registry to real participant identities derived from canonical domain records.

## Provider seam

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

## Additive `generatedDocuments` fields used by later archive behavior

If not already present in the repo, add the following additive fields now because phase 9 will populate them:

```ts
finalPdfStorageId?: Id<"_storage">;
completionCertificateStorageId?: Id<"_storage">;
signingCompletedAt?: number;
```

# BACKEND WORK

## 1. Implement explicit participant-scoped `dealAccess`

- Add or extend a reconciliation helper that computes explicit deal-private access for the package participants that need it:
  - lender participant,
  - borrower participants,
  - broker of record,
  - assigned broker,
  - lawyer participant where present.
- Use WorkOS `authId` as the access principal for these grants because the runtime access checks and signature session authorization key off that identity.
- Grant/revoke access on `LAWYER_VERIFIED` and on explicit admin reconcile / retry so signable materialization and embedded signing do not depend on hidden access backdoors.

## 2. Implement signatory resolution

- Consume phase 7’s canonical participant snapshot.
- Map required platform roles from the pinned template version to actual participant identities.
- If a required role cannot be resolved, do **not** fake a recipient. Surface the problem explicitly.

A conservative and useful behavior is:
- create the `dealDocumentInstance`,
- mark it `signature_pending_recipient_resolution`,
- set package status `partial_failure`,
- expose admin retry once data is fixed.

## 3. Materialize deferred signable snapshots after `LAWYER_VERIFIED`

For each deferred signable blueprint snapshot once the deal reaches `LAWYER_VERIFIED` or an admin retry/reconcile explicitly requests materialization:

1. Generate the PDF using pinned `templateId + templateVersion`.
2. Pass variables from `resolveDealDocumentVariables`.
3. Pass signatory mappings from `resolveDealDocumentSignatories`.
4. Persist a `generatedDocuments` row for the deal.
5. Create a provider envelope via `SignatureProvider.createEnvelope`.
6. Persist `signatureEnvelopes` and `signatureRecipients`.
7. Set `generatedDocuments.documensoEnvelopeId`.
8. Set `generatedDocuments.signingStatus` to `draft` or `sent` based on provider outcome.
9. Create `dealDocumentInstance` and set the appropriate signable status:
   - `signature_draft`
   - `signature_sent`
   - `signature_pending_recipient_resolution`
   - `generation_failed` or provider-error-adjacent state as appropriate.

## 4. Embedded signing session issuance

- Add backend session issuance endpoint/module, e.g. `documents/signature/sessions.ts`.
- Enforce:
  1. explicit participant `dealAccess` exists for the viewer’s `authId`,
  2. the viewer maps to the intended `signatureRecipient` by `authId` (or equivalent canonical recipient identity),
  3. the target recipient has a provider recipient ID,
  4. the envelope is in a signable state.
- Return only the embedded signing URL and expiration metadata required by the portal.

## 5. Provider webhook / status sync

- Add webhook ingestion and/or periodic sync flows.
- Normalize provider status into:
  - `SignatureEnvelope.status`
  - `SignatureRecipient.status`
  - relevant timestamps (`openedAt`, `signedAt`, `declinedAt`)
- Reflect normalized state into:
  - `generatedDocuments.signingStatus`
  - `dealDocumentInstances.status`

## 6. Admin retry / recovery surface

- Allow retry when envelope creation failed or recipient resolution became fixable.
- Do not create duplicate live envelopes without understanding the provider and instance state.
- Preserve auditability of provider errors through `lastError` and updated timestamps.

# FRONTEND / UI WORK

- Extend the deal portal with a signable-doc section.
- Show one row/card per signable document instance.
- Show recipient status chips.
- Show “Start signing” only for the currently authenticated user when that user is a matching `signatureRecipient`.
- Launch embedded signing in a modal/frame or equivalent contained experience.
- Refresh or live-update statuses after signing actions and provider syncs.
- Add admin envelope status/retry surfaces that expose normalized state, not provider admin URLs.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Phase 6 signable blueprints and allowed signatory registry.
- Phase 7 package/instance tables and resolver contracts.
- Existing document generation engine.
- Existing auth and the phase-owned explicit participant-scoped `dealAccess` grant / revoke lifecycle.

## Outputs this phase guarantees

- Normalized envelope and recipient rows.
- Signable deal document instances with accurate status.
- Backend-issued embedded signing sessions.
- Provider status synchronization into canonical rows.

## Contracts exported for later phases

- `signatureEnvelopes`
- `signatureRecipients`
- `resolveDealDocumentSignatories`
- `SignatureProvider`
- Documenso provider implementation
- embedded signing session issuance contract

## Temporary compatibility bridges

- The archive fields on `generatedDocuments` may exist before phase 9 populates them.
- Completed envelopes remain provider-complete until phase 9 archives signed artifacts back into platform storage.
- Phase 9 consumes `downloadCompletedArtifacts` from the provider seam and must not bypass it.

## Idempotency / retry / failure semantics

- Retrying signable document package creation must avoid duplicate envelopes unless the previous envelope state truly requires replacement.
- Provider webhook re-delivery must be idempotent.
- Embedded signing session issuance must be safe to re-request when a prior session expires.
- Missing recipient resolution is a real failure state, not a reason to manufacture a fake recipient.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/documents/signature/provider.ts`
  - `convex/documents/signature/documenso.ts`
  - `convex/documents/signature/sessions.ts`
  - `convex/documents/signature/webhooks.ts`
  - signature schema definitions
  - signable deal portal/admin UI
- **Shared but not owned**
  - `convex/documents/dealPackages.ts`
  - `resolveDealParticipantSnapshot`
  - `resolveDealDocumentVariables`
  - `generatedDocuments` existing module/schema
- **Later phases may extend but not redesign**
  - envelope archive consumption via `downloadCompletedArtifacts` in phase 9

# ACCEPTANCE CRITERIA

- Once `LAWYER_VERIFIED` (or an admin reconcile / retry) runs for a deal with deferred signable blueprint snapshots, signable deal docs are generated and envelopes are created.
- Only matching intended recipients can launch embedded signing.
- The portal never talks directly to Documenso.
- Statuses persist across refresh and portal sessions.
- Provider status is normalized into canonical rows and UI state.
- This phase satisfies global acceptance criterion 14 and enables criterion 15.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Lock a listing with signable blueprints and advance the deal to `LAWYER_VERIFIED`.
2. Open the deal portal as an eligible participant.
3. See signable docs and recipient statuses.
4. Launch embedded signing.
5. Complete at least one signature.
6. Refresh and confirm statuses persist and update correctly.
7. Confirm that a non-recipient user with deal access still cannot sign the document.

# RISKS / EDGE CASES / FAILURE MODES

- Recipient resolution is the highest-risk edge case. Do not hide unresolved roles.
- Webhook ordering and duplicate delivery are common provider-integration hazards; normalize idempotently.
- Provider recipient IDs may be missing immediately after envelope creation; handle that before issuing sessions.
- Do not leak provider admin URLs into the portal or admin UI.
- Multi-recipient signing order needs to remain stable and explicit.
- Completed envelopes are not the same thing as archived final artifacts; phase 9 still must do the archive work.

# MERGE CONTRACT

After this phase is merged:

- Signable deal docs are generated through the normalized package model.
- Documenso is behind a backend provider seam.
- Embedded signing is available only to matching authorized recipients.
- Phase 9 can archive final signed artifacts by consuming the normalized envelope/provider contract instead of adding a parallel integration.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not let the frontend talk directly to Documenso.
- Do not expose provider admin URLs.
- Do not create fake signatory identities from read-model strings.
- Do not allow signing without both explicit participant `dealAccess` and `signatureRecipient` match.
- Do not conflate provider completion with archived platform storage completion.



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



# DELIVERABLE 4 — Final audit

## 1. No major requirement from the master spec was dropped

This package preserves:

- the executive decision that there is one admin origination workflow and one canonical mortgage activation constructor;
- the decision-matrix choices rejecting direct CRUD, admin-only mortgage types, generic mortgage-backed listing creation, generic recurring `pad_rotessa` transfer initiation, listing-owned mortgage docs, live mutable template-group refs, frontend-to-Documenso coupling, and broker visibility through admin bypass;
- the full product boundary and explicit non-goals;
- the authoritative architectural rules for listing projection, payment truth, Rotessa-as-rail, blueprint → package → instance, immutable deal snapshots, and typed participant resolution;
- all named new concepts: `adminOriginationCases`, `documentAssets`, `originationCaseDocumentDrafts`, `mortgageDocumentBlueprints`, `mortgageValuationSnapshots`, `dealDocumentPackages`, `dealDocumentInstances`, `signatureEnvelopes`, `signatureRecipients`;
- the canonical origination flow, borrower resolution path, canonical mortgage activation constructor, payment bootstrap contract, listing projection contract, document authoring rules, deal-package materialization rules, signature provider seam, access-control model, RBAC model, deprecated-path list, implementation module layout, global acceptance criteria, manual checkpoints, and stakeholder-demo script.

## 2. No hard rule was weakened

Every MUST / MUST NOT recovered from the master spec was carried forward into at least one standalone implementation spec and into the traceability matrix. In particular, this package preserves all of the following as non-negotiable:

- no second mortgage constructor,
- no admin draft states in `mortgage.machine.ts`,
- no direct `users` writes in Convex,
- no special admin obligation type,
- no bespoke payment rows outside the existing payment architecture,
- no direct recurring `pad_rotessa` initiation,
- no live mutable template-group refs as mortgage truth,
- no direct frontend-to-Documenso coupling,
- no broker private-doc access through admin bypass,
- no raw `_storage` IDs as the long-term public-doc client contract,
- no lazy client-side deal-doc generation,
- no production mortgage-backed listing creation through the generic create mutation.

## 3. No acceptance criterion is orphaned

All nineteen global acceptance criteria are explicitly mapped in Deliverable 2, section F, and each criterion has an owner phase plus phase 9 as final verifier. Every phase-specific manual checkpoint and definition-of-done item from the master spec is preserved inside that phase’s standalone spec.

## 4. Every introduced schema/component/contract has an owning phase

Ownership is explicit for:

- each new table,
- each field addition,
- each helper / mutation / resolver / projector / provider seam,
- each route family,
- each admin or deal-portal surface,
- each compatibility bridge,
- each package/envelope/archive surface,
- each deprecated-path cleanup obligation.

Where the master spec intentionally left a symbol repo-specific (ownership-ledger genesis primitive, exact audit table name, exact typed deal-participant storage strategy), this package preserves that intentional flexibility while still assigning behavioral ownership.

## 5. Every later-phase dependency has an upstream owner

The main dependency chains are fully assigned:

- phase 1 owns the case shell that phases 2, 5, and 6 consume;
- phase 2 owns the constructor that phases 3, 4, and 6 extend;
- phase 3 owns listing projection that phases 6 and 9 consume;
- phase 4 owns payment bootstrap that phase 5 consumes;
- phase 6 owns blueprints that phases 7 and 8 consume;
- phase 7 owns package tables and non-signable package creation that phase 8 extends and phase 9 archives/hardens;
- phase 8 owns normalized signature state that phase 9 archives.

## 6. Every deprecated / narrowed path from the master spec is explicitly accounted for

The full deprecated/narrowed list is carried into the traceability matrix and phase specs:

1. generic mortgage-backed listing creation via the general listing create path,
2. reliance on `seedMortgage` or other seed/demo construction,
3. direct mortgage insert bypassing the canonical constructor,
4. direct listing document authoring on listing rows as long-term truth,
5. admin draft states inside `mortgage.machine.ts`,
6. direct recurring collection initiation via generic `pad_rotessa`,
7. signable-doc implementations that bind mortgages to live mutable template-group refs.

Phase 3 and phase 9 jointly own the listing-create cleanup; phase 2 owns constructor-only creation; phase 5 owns the recurring-activation prohibition; phase 6 owns the blueprint/live-template prohibition; phase 9 verifies final production hardening across all of them.

## 7. The 9 specs, taken together, are sufficient for faithful full implementation

Taken together, these specs are sufficient for nine isolated implementation agents because:

- each phase spec is self-contained and repeats the critical architecture, invariants, rejected alternatives, and integration contracts needed to implement safely in isolation;
- shared hotspots and ownership boundaries are explicit;
- later phases are told exactly what upstream contracts to consume and what they may extend but not redesign;
- merge contracts explain what must be true after each phase lands;
- the combined package preserves the master spec’s original nine-phase execution order instead of collapsing or reinterpreting it.

## Final conclusion

This package preserves the master spec faithfully, keeps the original phase boundaries intact, assigns explicit ownership for every schema/module/contract, and is structured for parallel worktree implementation without silently weakening any architectural invariant.
