# Admin Origination Workspace

## Purpose

The admin origination workspace lives under `/admin/originations` and stages every draft input in `adminOriginationCases`. Phase 2 keeps that staging aggregate as the source of truth, but the review step can now activate canonical borrower, property, `mortgageValuationSnapshots`, compatibility `appraisals`, mortgage, mortgageBorrower, ledger-genesis, and audit rows.

Listings, payment automation, provider-managed collections, and document projection are still future seams.

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

`originationCaseDocumentDrafts` remains the placeholder document table keyed by `caseId`. Later document phases extend that table in place.

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

Phase 2 commit blockers are limited to the participant, property, and mortgage surfaces that are required to activate a canonical mortgage. Collections and listing curation remain staged-but-non-blocking in this phase.

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
- creates the canonical `mortgageValuationSnapshots` row with `source`, `valuationDate`, `createdByUserId`, and optional `documentAssets` linkage, plus a compatibility `appraisals` projection
- mints the ownership-ledger genesis entry through the existing ledger primitive
- writes an origination audit journal entry
- patches the case to `committed` with `committedMortgageId`, `committedValuationSnapshotId`, and `committedAt`

The commit path is idempotent by workflow source. Mortgages and canonical borrowers store provenance fields so retries can detect previously committed work instead of creating duplicates.

The persisted case status model is:

- `draft`
- `ready_to_commit`
- `awaiting_identity_sync`
- `committing`
- `failed`
- `committed`

Autosave recomputes `draft` versus `ready_to_commit` from the saved validation snapshot. `awaiting_identity_sync` and `committed` are preserved until the operator retries or reaches the canonical mortgage.

## Step Ownership

The workspace owns a fixed seven-step shell:

1. Participants
2. Property + valuation
3. Mortgage terms
4. Collections
5. Documents
6. Listing curation
7. Review + commit

Collections and Documents are still staged shells in this phase. Their route position, step names, and persisted draft anchors are stable so later phases can extend them without redesigning the workflow.

## Extension Rules

Later phases may:

- add fields inside existing draft subdocuments
- extend `originationCaseDocumentDrafts`
- enrich the review screen
- project listings and document outputs from committed mortgages
- add payment/bootstrap automation after mortgage activation

Later phases must not:

- add a second origination route family
- rename the seven steps
- bypass `adminOriginationCases` with alternate canonical activation flows
- replace additive patching with wholesale draft replacement
