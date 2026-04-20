# Origination Collections + Rotessa

## Purpose

The collections step in `/admin/originations/$caseId` now models two distinct servicing outcomes explicitly:

- `App managed via manual`
  - Canonical mortgage commit still creates app-owned collection plan intent, but the staged execution strategy is explicitly `manual`.
  - This is the supported path for cash, cheque, wire, and other non-API collection handling.
- `Provider managed via Rotessa payment schedule`
  - Canonical mortgage commit still happens first.
  - The origination case stages canonical borrower linkage, Rotessa schedule selection or creation, PAD authorization evidence, and provider activation metadata before commit.

The UI no longer treats `app_owned_only` as an implicit rail choice. Instead, the case draft separates:

- `executionIntent`
  - `app_owned`
  - `provider_managed_now`
- `executionStrategy`
  - currently only `manual` for app-owned servicing
- `providerManagedActivationStatus`
  - `pending`
  - `activating`
  - `active`
  - `failed`

## Case Draft Contract

`collectionsDraft` now carries the provider-managed activation surface required for Rotessa:

- `executionIntent`
- `executionStrategy`
- `borrowerSource`
- `scheduleSource`
- `selectedBorrowerId`
- `selectedBankAccountId`
- `selectedProviderScheduleId`
- `selectedExistingExternalScheduleId`
- `padAuthorizationSource`
- `padAuthorizationAssetId`
- `padAuthorizationOverrideReason`
- `providerManagedActivationStatus`
- compatibility fields such as `mode`, `providerCode`, `activationStatus`

Validation rules enforce:

- app-owned servicing requires an explicit `executionStrategy`
- provider-managed servicing requires borrower source and schedule source
- provider-managed servicing requires a selected borrower when using the Rotessa path
- provider-managed servicing requires PAD authorization evidence or an audited override

## Supported Rotessa Tracks

Provider-managed Rotessa setup is modeled as three explicit tracks:

1. Existing borrower + existing Rotessa schedule
2. New borrower + new Rotessa schedule
3. Existing borrower + new Rotessa schedule

The origination UI implements this as a two-column workflow:

- Left column: borrower selection
  - canonical borrower autocomplete
  - create borrower modal that captures identity plus bank details required for a new schedule
- Right column: schedule selection
  - existing surfaced schedules for the selected borrower
  - disabled rows for schedules already linked elsewhere
  - create-new-schedule path seeded from Core Economics
  - PAD authorization controls for both reused schedules and newly created schedules

When an existing schedule is selected, the UI auto-hydrates:

- borrower identity into `participantsDraft.primaryBorrower`
- payment amount into `mortgageDraft.paymentAmount`
- payment frequency into `mortgageDraft.paymentFrequency`
- first payment date into `mortgageDraft.firstPaymentDate`

The primary borrower is also selectable from the earlier `Participants` step through the same canonical borrower search surface, so operators encounter borrower autocomplete before reaching the provider-managed collections rail.

## PAD Authorization

Provider-managed Rotessa setup requires one of the following before the schedule linkage is considered complete:

- uploaded signed PAD document
- admin override with an audit reason

Uploaded PADs are written through the canonical document asset pipeline, then linked back onto the case via `padAuthorizationAssetId`.

Admin override writes:

- `padAuthorizationSource = "admin_override"`
- `padAuthorizationOverrideReason`

This keeps the collections step compliant without forcing free-text provider metadata to act as the source of truth, whether the operator is reusing an imported schedule or creating a new one.

## Rotessa Read Models

Rotessa customers and schedules are surfaced into canonical read models before origination reuses them:

- `externalCustomerProfiles`
  - canonical mapping for external Rotessa customers to FairLend borrowers
- `externalProviderSchedules`
  - canonical imported provider-side schedule rows surfaced for origination and reconciliation
- `rotessaSyncRuns`
  - sync run journal with status, counts, trigger, and failure details
- `rotessaReconciliationActions`
  - admin audit trail for linking, creation, suppression, and reconciliation decisions

The read-model normalization lives in:

- `convex/payments/rotessa/readModel.ts`

The admin/origination collections module now owns the sync and reconciliation surface:

- `runRotessaReadModelSync`
- `syncRotessaReadModelNow`
- `getRotessaReconciliationSnapshot`
- `linkRotessaCustomerToBorrower`
- `createBorrowerFromRotessaCustomer`
- `suppressRotessaReconciliationItem`

## Scheduled Sync

Rotessa sandbox state is synchronized automatically by cron several times per day.

- Cron name: `rotessa read-model sync`
- Schedule: every 360 minutes
- Entry point: `admin/origination/collections:runRotessaReadModelSync`

The same sync can also be triggered manually from the reconciliation screen.

## Admin Reconciliation Screen

The admin shell now includes `/admin/rotessa-reconciliation`.

The screen exposes:

- unmatched customers
- unmatched schedules
- conflicts
- broken links
- PAD authorization exceptions

Available actions include:

- link imported customer to canonical borrower
- create canonical borrower from Rotessa customer
- suppress schedule or conflict with audit reason
- jump directly back to the affected origination case when PAD evidence is missing

Every reconciliation decision is journaled because this is a compliance-sensitive identity boundary.

## Atomic Schedule Creation Semantics

New Rotessa schedule creation is treated as an all-or-nothing origination-side action:

- the provider schedule is created
- the imported provider schedule row is reserved for the current origination case
- the case draft is updated only after those steps succeed
- user feedback is surfaced immediately through Sonner toasts on success or failure

If the downstream reservation fails after provider creation, the mutation attempts to delete the newly created Rotessa schedule so the case is not left pointing at a partially-created provider asset.

### Current rollback limitation

The current Rotessa client primitives in repo expose recurring schedule deletion, but do not expose customer deletion. That means the rollback path can clean up a newly created schedule, but a newly created customer may still remain in the Rotessa sandbox if failure occurs after customer creation and before full local reservation completes.

This is acceptable for the current sandbox-only state, but production hardening should add either:

- explicit customer cleanup support if the provider allows it, or
- a durable orphan-customer reconciliation flow dedicated to provider-created-but-unlinked customers
