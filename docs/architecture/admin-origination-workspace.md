# Admin Origination Workspace

## Purpose

Phase 1 introduces a single backoffice origination workspace under `/admin/originations`. The route family stages draft data in `adminOriginationCases` and intentionally creates zero canonical borrower, property, mortgage, listing, payment, or document rows.

## Route Contract

- `/admin/originations`
  - Draft queue for existing origination cases.
- `/admin/originations/new`
  - Bootstrap-only route. Creates a durable case and immediately redirects to the canonical case URL.
- `/admin/originations/$caseId`
  - Seven-step workflow shell backed by a single `adminOriginationCases` row.

All three routes are guarded by `mortgage:originate` for non-admin operators. FairLend staff admins still retain structural admin access through the shared admin shell.

## Persisted Aggregate

`adminOriginationCases` is the only authoritative source for the phase-1 workspace. The case record stores:

- `participantsDraft`
- `propertyDraft`
- `valuationDraft`
- `mortgageDraft`
- `collectionsDraft`
- `listingOverrides`
- `validationSnapshot`
- `currentStep`
- status and metadata fields

Phase 1 also creates `originationCaseDocumentDrafts` as an empty placeholder table keyed by `caseId`. Later document phases extend that table in place.

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
- The review screen renders the same saved validation warnings and keeps commit disabled.

The browser treats the saved case as the source of truth for validation, while still showing local unsaved edits immediately in the form controls.

## Step Ownership

Phase 1 owns the fixed seven-step shell:

1. Participants
2. Property + valuation
3. Mortgage terms
4. Collections
5. Documents
6. Listing curation
7. Review + commit

Collections and Documents are deliberately shells in this phase. Their route position, step names, and persisted draft anchors are now stable so later phases can extend them without redesigning the workflow.

## Extension Rules

Later phases may:

- add fields inside existing draft subdocuments
- extend `originationCaseDocumentDrafts`
- enrich the review screen
- enable real commit behavior

Later phases must not:

- add a second origination route family
- rename the seven steps
- bypass `adminOriginationCases` with direct canonical-row creation flows
- replace additive patching with wholesale draft replacement
