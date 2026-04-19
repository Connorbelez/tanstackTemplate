# Admin Origination Workspace

## Purpose

The admin origination workspace lives under `/admin/originations` and stages every draft input in `adminOriginationCases`. The review step now activates canonical borrower, property, `mortgageValuationSnapshots`, compatibility `appraisals`, mortgage, mortgageBorrower, canonical obligations, planned app-owned `collectionPlanEntries`, the mortgage-backed listing projection, ledger-genesis, and audit rows from one persisted case.

When the collections step chooses `provider_managed_now`, canonical commit still finishes first and the same action immediately follows with Rotessa recurring-schedule activation against the staged primary borrower bank account. Phase 6 extends the same workflow with immutable staged document assets, pinned origination document drafts, mortgage-owned blueprint rows, and listing-facing public static document projection. Phase 7 consumes those mortgage blueprints at deal lock and materializes immutable deal-time packages for private static and private templated non-signable documents.

## Route Contract

- `/admin/originations`
  - Draft queue for existing origination cases.
- `/admin/originations/new`
  - Bootstrap-only route. Creates a durable case and immediately redirects to the canonical case URL.
- `/admin/originations/$caseId`
  - Seven-step workflow shell backed by a single `adminOriginationCases` row.

All three routes are guarded by `mortgage:originate` for non-admin operators. FairLend staff admins still retain structural admin access through the shared admin shell.

## Persisted Aggregate

`adminOriginationCases` is the authoritative source for the workspace before commit. The case record stores:

- `participantsDraft`
- `propertyDraft`
- `valuationDraft`
- `mortgageDraft`
- `collectionsDraft`
- `listingOverrides`
- `validationSnapshot`
- `currentStep`
- `lastCommitError`
- `failedAt`
- `committedValuationSnapshotId`
- status and metadata fields

Document staging is now split across three persisted surfaces:

- `documentAssets`
  - Immutable uploaded files with `fileRef`, file metadata, and signed-read access.
- `originationCaseDocumentDrafts`
  - Case-scoped staged inputs keyed by `caseId`. Each row stores class, source kind, display metadata, pinned template version or static asset linkage, optional package/group provenance, validation snapshot, and archive state.
- `mortgageDocumentBlueprints`
  - Canonical mortgage-owned rows created during commit from active case document drafts. Public static blueprint rows are later projected onto listing reads; private rows remain mortgage-owned.

## Autosave Rules

- The workspace maintains local form state per case route.
- Field edits debounce into `api.admin.origination.cases.patchCase`.
- Step changes save immediately.
- The backend merges draft patches additively and recomputes `validationSnapshot` on every write.
- Refresh safety comes from rehydrating the page directly from the saved case query.

This means downstream phases can add fields to the case subdocuments without rewriting the transport contract or risking whole-object overwrite behavior.

## Validation Model

Validation is persisted, not inferred only in the browser.

- Each save recomputes `validationSnapshot.stepErrors`.
- The stepper surfaces saved validation status per step.
- The review screen renders the same saved validation warnings and only commits the persisted case payload.

Commit blockers are limited to the participant, property, and mortgage surfaces that are required to activate a canonical mortgage. Collections and listing curation remain staged-but-non-blocking so provider-managed-now can surface early preflight errors without preventing canonical commit.

Document staging is intentionally non-blocking in phase 6. Operators can commit without staged docs, but when they do stage them the review step and post-commit surfaces read the persisted rows rather than optimistic browser state.

The browser still shows local unsaved edits in form controls, but the review screen is intentionally persisted-data-first so commit behavior and validation share the same backend source of truth.

## Commit Contract

The review step calls a single public action: `api.admin.origination.commit.commitCase`.

That action:

- re-reads the saved case and rejects stale or incomplete drafts
- resolves staged borrower emails through Convex `users`
- provisions missing WorkOS users without writing `users` rows directly
- stops safely at `awaiting_identity_sync` if WorkOS provisioning succeeded but Convex identity sync has not landed yet
- marks the case `committing` immediately before canonical writes begin
- records durable `failed` state with `lastCommitError` and `failedAt` when canonical activation aborts
- reuses same-org borrowers and properties when possible
- creates the canonical mortgage directly in `active`
- bootstraps canonical obligations through the shared origination payment helper
- creates planned app-owned `collectionPlanEntries` through `collectionPlan/initialScheduling`
- persists `paymentBootstrapScheduleRuleMissing` on the mortgage when no active schedule rule matched and the default delay was used
- leaves the mortgage committed even if the follow-up provider activation fails
- creates the canonical `mortgageValuationSnapshots` row with `source`, `valuationDate`, `createdByUserId`, and optional `documentAssets` linkage, plus a compatibility `appraisals` projection
- materializes one active `mortgageDocumentBlueprints` row for every active staged document draft, preserving class, source kind, display order, package metadata, template pins, and static asset linkage
- upserts exactly one `mortgage_pipeline` listing through `upsertMortgageListingProjection`
- preserves curated listing fields while overwriting projection-owned economics, property facts, appraisal summary, and public static document compatibility values
- refreshes `publicDocumentIds` as a compatibility cache from active public static blueprint assets so existing lender-facing listing reads keep working until blueprint-native listing surfaces fully replace the cache
- mints the ownership-ledger genesis entry through the existing ledger primitive
- writes an origination audit journal entry
- patches the case to `committed` with `committedMortgageId`, `committedListingId`, `committedValuationSnapshotId`, and `committedAt`
- persists collections activation state on `collectionsDraft` as `pending`, `activating`, `active`, or `failed`, plus `lastError`, `retryCount`, and `lastAttemptAt`
- immediately calls the recurring-schedule activation seam for `provider_managed_now`
- exposes retry from the mortgage detail payment setup screen through `payment:manage`

The commit path is idempotent by workflow source. Mortgages and canonical borrowers store provenance fields so retries can detect previously committed work instead of creating duplicates.

The persisted case status model is:

- `draft`
- `ready_to_commit`
- `awaiting_identity_sync`
- `committing`
- `failed`
- `committed`

Autosave recomputes `draft` versus `ready_to_commit` from the saved validation snapshot. `awaiting_identity_sync` and `committed` are preserved until the operator retries or reaches the canonical mortgage.

## Document Blueprint Contract

Phase 6 owns the origination-to-mortgage document handoff.

- Static uploads always enter through `documentAssets`, then stage onto `originationCaseDocumentDrafts` with `sourceKind = "asset"`.
- Templated docs always pin a concrete published template version at attach time; group attachment expands into one draft row per published template in that group.
- Template-backed draft rows snapshot variable/role validation results at attach time so later phases can surface the pinned contract without reinterpreting the live template definition.
- Draft rows are append-and-archive, not mutable-in-place replacements of prior canonical mortgage blueprint rows.
- Commit copies only active case draft rows into `mortgageDocumentBlueprints`.
- Active public static blueprints project onto listing reads and the `publicDocumentIds` compatibility cache.
- Private static and templated blueprint rows remain mortgage-owned and are only surfaced through admin mortgage detail screens in this phase.
- Blueprint rows can be archived from the mortgage detail page without mutating the underlying immutable `documentAssets` row.

## Deal Package Contract

Phase 7 owns the mortgage-to-deal package materialization seam.

- `DEAL_LOCKED` now triggers `createDocumentPackage` through the deal closing effect registry.
- `dealDocumentPackages` stores one immutable package header per `dealId`.
- `dealDocumentInstances` stores immutable package members linked back to the source mortgage blueprint snapshot used at generation time.
- `private_static` blueprints become `static_reference` package instances that point at the original `documentAssets` row.
- `private_templated_non_signable` blueprints generate a new `generatedDocuments` row plus a `generated` package instance.
- `private_templated_signable` blueprints do not fake-complete generation in this phase. They materialize placeholder package instances with `signature_pending_recipient_resolution` so phase 8 can extend the same immutable package surface.
- Package retries never mutate old instance rows in place. Failed instances are archived and replaced by successor rows.
- Package summary status is derived from immutable instance rows:
  - `pending`
  - `ready`
  - `partial_failure`
  - `failed`
- Public listing reads continue to ignore deal packages entirely. Deal packages are private deal-time surfaces only.

## Deal Portal Surface

Phase 7 introduces a lender-facing authenticated deal detail route under `/lender/deals/$dealId`.

- Access is enforced through the existing deal resource check.
- The portal only exposes package instances whose status is `available` and have a resolvable signed URL.
- Signable placeholders and failed instances remain admin-visible on the deal detail surface but are not presented as downloadable lender documents.
- The admin deal detail page now shows the immutable package header, package instances, and retry controls for `failed` and `partial_failure` packages.

## Step Ownership

The workspace owns a fixed seven-step shell:

1. Participants
2. Property + valuation
3. Mortgage terms
4. Collections
5. Documents
6. Listing curation
7. Review + commit

Documents now own real staged blueprint authoring in this phase:

- Public static docs
- Private static docs
- Private templated non-signable docs
- Private templated signable docs

The route position, step names, and persisted draft anchors remain stable so later deal-package phases can extend them without redesigning the workflow.

## Extension Rules

Later phases may:

- add fields inside existing draft subdocuments
- extend `originationCaseDocumentDrafts`
- add new mortgage blueprint classes or later package metadata to `mortgageDocumentBlueprints`
- add richer participant snapshots and package metadata to `dealDocumentPackages` / `dealDocumentInstances`
- enrich the review screen
- extend the listing projection and eventually replace `publicDocumentIds` with blueprint-native listing reads
- project document outputs from committed mortgages and locked deals
- extend provider-managed collection activation beyond the immediate Rotessa bootstrap
- materialize signable envelopes from the existing placeholder package rows

Later phases must not:

- add a second origination route family
- rename the seven steps
- bypass `adminOriginationCases` with alternate canonical activation flows
- replace additive patching with wholesale draft replacement
- treat deal package retries as in-place mutation of previously materialized package rows
