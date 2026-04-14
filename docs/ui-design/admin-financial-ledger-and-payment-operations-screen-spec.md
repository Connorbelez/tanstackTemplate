# Admin Financial Ledger And Payment Operations Screen Spec

Status: proposed
Last updated: 2026-04-14

## 1. Purpose

Define the concrete dashboard screens for FairLend staff to:

- inspect borrower obligations as the canonical debt truth
- inspect collection strategy and execution separately from debt truth
- inspect the cash ledger as the system of record for money movement
- inspect reconciliation exceptions across transfers, obligations, payables, and suspense
- take operator actions that already exist in the backend without mixing accounting and workflow concerns

This spec is intentionally screen-first, but it is grounded in the current codebase rather than the earlier ledger ADR alone.

## 2. Sources Of Truth And Drift

Primary references used for this spec:

- Notion goal: `Cash & Obligations Ledger`
- [docs/cash-ledger-developer-guide.md](/Users/connor/Dev/tanstackFairLend/fairlendapp/docs/cash-ledger-developer-guide.md)
- [convex/payments/cashLedger/queries.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/queries.ts)
- [convex/payments/cashLedger/reconciliationQueries.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/reconciliationQueries.ts)
- [convex/payments/cashLedger/reconciliationSuite.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/reconciliationSuite.ts)
- [convex/payments/cashLedger/transferReconciliation.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/transferReconciliation.ts)
- [convex/payments/collectionPlan/admin.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/collectionPlan/admin.ts)
- [convex/payments/collectionPlan/readModels.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/collectionPlan/readModels.ts)
- [convex/payments/transfers/queries.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/transfers/queries.ts)
- [convex/payments/cashLedger/mutations.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/mutations.ts)
- [src/routes/admin/obligations/route.tsx](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/routes/admin/obligations/route.tsx)
- [src/routes/demo/amps/-collection-attempts.tsx](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/routes/demo/amps/-collection-attempts.tsx)
- [src/routes/demo/amps/-collection-plan.tsx](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/routes/demo/amps/-collection-plan.tsx)
- [src/routes/demo/amps/-mortgages.$mortgageId.payments.tsx](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/routes/demo/amps/-mortgages.$mortgageId.payments.tsx)

Important drift to preserve in the UI plan:

- The Notion ADR still talks about `convex/cashLedger/*`. The implemented code lives under `convex/payments/cashLedger/*`.
- The current `/admin/obligations` route is a fake-data scaffold and is not a valid UX source of truth.
- The real operator read models already split into two surfaces:
  - payment operations and execution data in `payments/collectionPlan/admin.ts`
  - accounting and reconciliation data in `payments/cashLedger/*` and `payments/transfers/queries.ts`
- The Paper mockups already reflect that split:
  - `Admin — Payment Operations Center`
  - `Admin — Financial Ledger Hub`

Conclusion: this should not be a single “accounting page”. It should be two first-class dashboard surfaces with clean drill-through between them.

## 3. Product Principles

- Use dense desktop-first data grids, not cards, for primary accounting views.
- Keep debt truth, strategy, execution, and journal truth visually separate.
- Default drill-down should be split-pane or side rail, not full navigation, so operators can keep context.
- Journals are append-only. No inline editing of posted journal rows.
- Reconciliation is a first-class view, not a hidden admin tool.
- Every exception row must deep-link to the upstream entity and the journal evidence.
- Cron and self-healing failures must be surfaced as queryable operational facts, not only as ephemeral Convex logs.
- Development-time validation against spreadsheet-calculated expected state is a first-class workflow for this surface until the ledger is fully trusted.
- CSV export should follow accounting conventions, not generic app-table export conventions. The canonical export is a journal-line export with separate debit and credit columns plus a companion trial-balance-style summary export.
- Assume the backend domain model and business logic already exist. This dashboard work must not create a parallel backend implementation.
- Backend changes in scope are limited to read-only queries or read-only adapter endpoints that reshape existing persisted data for the UI.
- If a required fact is not available from the existing backend, stop and confirm the gap rather than introducing new tables, write paths, cron wrappers, or duplicate domain logic under this dashboard effort.

## 4. Information Architecture

### Sidebar placement

Add two static admin routes:

- `Payments` domain:
  - `Payment Operations` -> `/admin/payment-operations`
- `Ledger` domain:
  - `Financial Ledger` -> `/admin/financial-ledger`

Do not overload `/admin/obligations` into the full operational console. That route can remain a generic entity table if needed, but the real operator workflow should live in `Payment Operations`.

### Route map

- `/admin/payment-operations`
- `/admin/payment-operations?tab=obligations`
- `/admin/payment-operations?tab=collections`
- `/admin/payment-operations?tab=transfers`
- `/admin/payment-operations?tab=collection-plans`
- `/admin/financial-ledger`
- `/admin/financial-ledger?tab=reconciliation`
- `/admin/financial-ledger?tab=cash-ledger`
- `/admin/financial-ledger?tab=ops-health`
- `/admin/financial-ledger?tab=validation`
- `/admin/financial-ledger?tab=ownership-ledger`
- `/admin/mortgages/$recordid?tab=payments-ledger`

### Deep-link query params

All major screens should support URL-driven state:

- `tab`
- `status`
- `type`
- `mortgageId`
- `borrowerId`
- `lenderId`
- `dateFrom`
- `dateTo`
- `selectedId`
- `selectedCheck`
- `showOnlyExceptions`
- `search`

## 5. Permissions

### Payment Operations

- Read: `payment:view`
- Mutations shown only when allowed:
  - `payment:manage` for execute and reschedule flows

### Financial Ledger

- Cash ledger read: `cash_ledger:view`
- Ownership tab read: `ledger:view`
- Mutations shown only when allowed:
  - `cash_ledger:correct` for ledger corrections and future suspense resolution

### Existing backend-aligned operator actions

Already available and should be wired into the screens:

- `waiveObligationBalance`
- `writeOffObligationBalance`
- `executeCollectionPlanEntry`
- `rescheduleCollectionPlanEntry`
- workout plan lifecycle actions

Not yet exposed as a staff public mutation and therefore should be marked follow-up:

- cash correction UI
- suspense resolution UI

## 6. Shared Screen Pattern

Every major page uses the same structural pattern:

- sticky page header with title, timestamp, and primary actions
- KPI strip
- sticky filter bar
- dense table or reconciliation grid
- persistent detail rail on desktop
- full-screen drawer on tablet/mobile

### Standard page header

- title
- one-line purpose statement
- as-of timestamp
- primary action button
- export action
- saved view dropdown later, not in v1

### Standard KPI strip

Use 4-6 tiles maximum. Tiles must be operational, not vanity metrics.

### Standard detail rail

The detail rail should always show:

- summary badges
- core references and IDs
- accounting facts
- upstream/downstream linked entities
- allowed actions
- recent audit or transition timeline

## 7. Screen A: Payment Operations Center

Route: `/admin/payment-operations`
Primary user: payment operations staff
Primary question: “What borrower debt exists, what strategy is scheduled, what execution happened, and what needs action?”

### A.1 Default tab

Default to `Obligations`.

Rationale:

- obligations are the canonical debt truth
- collection plans and attempts are execution layers
- this matches the backend architecture and the Paper direction

### A.2 Header

- title: `Payment Operations`
- subtitle: `Borrower debt, collection strategy, execution, and transfer state`
- actions:
  - `Export`
  - `Open Financial Ledger`

### A.3 KPI strip

Show six chips or compact cards:

- Upcoming obligations count
- Due obligations count
- Overdue obligations count
- Settled obligations count
- Active collection attempts count
- Reconciliation exceptions count

The first four come from obligation status counts. The last two are operational overlays.

### A.4 Tabs

- `Obligations`
- `Collections`
- `Transfers`
- `Collection Plans`

Do not merge these into one table. They are different layers with different invariants.

### A.5 Obligations tab

Purpose: inspect debt truth, payment state, and where obligation rows disagree with journal state.

#### Filters

- status
- obligation type
- mortgage
- borrower
- due date range
- corrective only
- show drift only
- show active attempts only
- search by obligation ID or mortgage label

#### Table columns

- Status
- Due date
- Mortgage
- Borrower
- Obligation type
- Payment number
- Amount
- Amount settled
- Journal outstanding balance
- Corrective chain badge
- Latest collection status
- Latest transfer status

#### Row badges

- `corrective`
- `journal drift`
- `active collection`
- `reversed after settlement`

#### Detail rail

- obligation summary
- amount, amountSettled, dueDate, gracePeriodEnd, type, paymentNumber
- journal-derived outstanding from `getObligationBalance`
- projected vs journal settled amount
- corrective obligation chain from `getObligationWithCorrectives`
- related plan entries
- related collection attempts
- related transfers
- quick links:
  - open mortgage
  - open collections tab filtered to this obligation
  - open financial ledger with `obligationId`

#### Actions

- `Waive balance`
- `Write off`
- `View mortgage`

Do not add “edit obligation” or “patch amountSettled”.

### A.6 Collections tab

Purpose: inspect execution attempts separately from strategy and debt truth.

#### Data source

- `listCollectionAttempts`
- `getCollectionAttempt`

#### Filters

- status
- mortgage
- plan entry
- initiated date range
- reconciliation health
- provider code
- search by attempt ID or provider ref

#### Table columns

- Attempt status
- Transfer status
- Reconciliation status
- Amount
- Method
- Mortgage
- Obligation count
- Trigger source
- Initiated at
- Confirmed at
- Failed at
- Provider ref

#### Detail rail

- attempt summary
- execution reason
- execution idempotency key
- linked transfer summary
- reconciliation health and reason
- linked plan entry
- transition journal
- quick links:
  - open transfer timeline
  - open plan entry
  - open mortgage

#### Actions

Only show actions the backend can already support safely. For v1:

- `Open transfer`
- `Open plan entry`
- `Open mortgage`

Retry/cancel can be a later phase if there is a supported public admin action.

### A.7 Transfers tab

Purpose: inspect provider-facing transfer truth and its ledger timeline.

#### Data source

- `listTransfersByStatus`
- `listTransfersByMortgage`
- `listTransfersByCounterparty`
- `listTransfersByDeal`
- `getTransferTimeline`

#### Filters

- status
- direction
- transfer type
- mortgage
- deal
- counterparty
- provider code
- created date range
- show only missing journal linkage

#### Table columns

- Transfer status
- Direction
- Transfer type
- Amount
- Mortgage or deal
- Counterparty
- Provider code
- Provider ref
- Created at
- Confirmed at
- Reversed at
- Journal integrity badge

#### Detail rail

- transfer payload summary
- provider refs
- linked collection attempt
- linked obligation
- linked dispersal entry
- unified timeline from `getTransferTimeline`
  - transfer lifecycle
  - audit journal events
  - cash ledger journal entries
- quick links:
  - open financial ledger filtered to `transferRequestId`
  - open mortgage
  - open deal

### A.8 Collection Plans tab

Purpose: inspect collection strategy, lineage, balance precheck outcomes, and workout ownership.

#### Data source

- `listCollectionPlanEntries`
- `getCollectionPlanEntry`

#### Filters

- status
- source
- mortgage
- workout plan
- include superseded
- balance precheck decision
- scheduled date range

#### Table columns

- Status
- Source
- Balance precheck decision
- Scheduled date
- Amount
- Method
- Mortgage
- Obligation count
- Created by rule
- Related attempt
- Workout linkage

#### Detail rail

- plan entry summary
- lineage
  - retryOf
  - rescheduledFrom
  - workoutPlanId
  - supersededByWorkoutPlanId
- balance precheck facts
- related attempt summary
- createdByRule summary
- audit events

#### Actions

- `Execute`
- `Reschedule`
- `Open mortgage workspace`

## 8. Screen B: Financial Ledger Hub

Route: `/admin/financial-ledger`
Primary user: finance, payment ops, compliance
Primary question: “What is the cash position, what accounting exceptions exist, and where is the supporting journal evidence?”

### B.1 Default tab

Default to `Reconciliation`.

Rationale:

- this is the highest-value operator landing state
- it matches the current Paper “Financial Ledger Hub” direction
- it surfaces risk first, then drill-through into accounts and journals

### B.2 Header

- title: `Financial Ledger`
- subtitle: `Cash ledger, ownership context, and reconciliation controls`
- actions:
  - `Run full suite`
  - `Export CSV`
  - `Export exceptions`
  - `Open Payment Operations`

### B.3 Tabs

- `Reconciliation`
- `Cash Ledger`
- `Ops Health`
- `Validation`
- `Ownership Ledger`

`Ownership Ledger` is included for operator context, but this spec focuses on the cash and obligations side.

## 9. Screen C: Reconciliation Tab

Purpose: exception-first accounting overview.

### C.1 Summary strip

Use the aggregated `reconciliationFullSuite` response and family balances to show:

- Unhealthy checks
- Healthy checks
- Total exception count
- Total exception amount

Optional follow-up tile once a summary adapter exists:

- Net cash exposure by family

### C.2 Card grid

Each card shows:

- check name
- severity badge from a static UI metadata map
- count
- total amount
- last checked timestamp
- top 1-3 item preview

Note: `Journal Replay Integrity` is not included in `reconciliationFullSuite` today. Treat it as a separate card backed by `journalReplayIntegrityCheck`.

#### Required cards

Cash exception checks:

- Unapplied Cash
- Suspense Items
- Orphaned Unapplied Cash
- Negative Payable Balances

Obligation integrity checks:

- Obligation Drift
- Orphaned Obligations
- Obligation Conservation
- Mortgage-Month Conservation

Structural checks:

- Control Net-Zero
- Journal Replay Integrity
- Stuck Collections

Transfer checks:

- Orphaned Confirmed Transfers
- Orphaned Reversed Transfers
- Stale Outbound Transfers
- Transfer Amount Mismatches

### C.3 Card click behavior

Clicking a card opens a full-width exception table below the cards and syncs:

- `selectedCheck=<checkName>`

### C.4 Exception table definitions

#### Unapplied Cash

Columns:

- Account ID
- Mortgage
- Balance
- Age days

#### Negative Payables

Columns:

- Account ID
- Lender
- Mortgage
- Balance

#### Obligation Drift

Columns:

- Obligation ID
- Due date
- Recorded amount
- Journal-derived amount
- Drift cents

#### Control Net-Zero

Columns:

- Posting group ID
- Obligation ID
- Entry count
- Control allocation balance

#### Suspense Items

Columns:

- Account ID
- Mortgage
- Balance
- Age days
- Metadata summary

#### Orphaned Obligations

Columns:

- Obligation ID
- Status
- Due date
- Amount

#### Stuck Collections

Columns:

- Attempt ID
- Plan entry ID
- Initiated at
- Age days
- Amount

#### Orphaned Unapplied Cash

Columns:

- Account ID
- Mortgage
- Balance
- Age days

#### Obligation Conservation

Columns:

- Obligation ID
- Due date
- Obligation amount
- Dispersal total
- Servicing fee total
- Difference

#### Mortgage-Month Conservation

Columns:

- Mortgage
- Month
- Settled total
- Dispersal total
- Fee total
- Difference

#### Orphaned Confirmed Transfers

Columns:

- Transfer ID
- Direction
- Mortgage
- Confirmed at
- Age days
- Amount
- Expected idempotency key

#### Orphaned Reversed Transfers

Columns:

- Transfer ID
- Direction
- Mortgage
- Reversed at
- Age days
- Amount
- Expected idempotency key

#### Stale Outbound Transfers

Columns:

- Transfer ID
- Dispersal entry ID
- Dispersal status
- Confirmed at
- Age days
- Amount

#### Transfer Amount Mismatches

Columns:

- Transfer ID
- Journal entry ID
- Transfer amount
- Journal amount
- Difference

### C.5 Exception row actions

- `Open transfer`
- `Open mortgage`
- `Open obligation`
- `Open posting group`
- `Open in cash ledger`

Do not show destructive mutation buttons on the reconciliation grid itself. Exception pages are for triage first.

## 10. Screen D: Cash Ledger Tab

Purpose: provide an accounting-standard chart-of-accounts plus account register experience.

This should feel closer to accounting software than a CRM record list.

### D.1 Layout

Desktop:

- left rail: account families and account list
- right main panel: register for the selected account
- right detail drawer on top of register for selected journal row

Tablet/mobile:

- account list first
- register as second screen
- journal detail as drawer

### D.2 Top strip

Show:

- Trust cash total
- Gross lender payable
- Available lender payable
- Unapplied cash total
- Suspense total
- Control balance alerts

### D.3 Left rail: Chart of accounts

Group by family:

- BORROWER_RECEIVABLE
- TRUST_CASH
- CASH_CLEARING
- UNAPPLIED_CASH
- LENDER_PAYABLE
- SERVICING_REVENUE
- WRITE_OFF
- SUSPENSE
- CONTROL

#### Account row content

- family badge
- scoped label
  - obligation
  - mortgage
  - lender
  - borrower
  - subaccount for CONTROL
- current balance
- exception badge if applicable

#### Account row sort

- family
- then balance descending for exception-oriented families
- then recent activity

### D.4 Register filter bar

- date range
- entry type
- mortgage
- obligation
- lender
- borrower
- transfer ID
- posting group ID
- idempotency key search
- only corrections/reversals toggle

### D.5 Register table

Columns:

- Effective date
- Timestamp
- Sequence
- Entry type
- Debit account
- Credit account
- Amount
- Running balance
- Mortgage
- Obligation
- Lender
- Transfer
- Posting group
- Source

### D.6 Register row click

Open detail drawer with:

- journal entry fields
- debit and credit account snapshots
- causedBy chain
- posting group siblings
- linked transfer timeline
- linked obligation or mortgage
- audit metadata

### D.7 Account header summary

For the selected account show:

- account family
- scoped dimensions
- current balance
- opening balance for selected range
- closing balance for selected range
- entry count for selected range

Use `getAccountBalanceRange` once an account is selected.

### D.8 Shipping actions

Ship now:

- `Open posting group`
- `Open transfer`
- `Open obligation`
- `Open mortgage`

Future actions once backend public surfaces exist:

- `Post correction`
- `Resolve suspense`

### D.9 Export To CSV

The cash ledger screen must support a canonical accounting export designed for Excel-based validation.

There is no single universal accounting CSV standard to copy verbatim. The practical convention across accounting systems is:

- a chart-of-accounts style account master export
- a line-level general-journal export with separate debit and credit columns
- a trial-balance style summary export for period validation

This spec follows that convention rather than exporting a generic UI table dump.

#### Export types

Ship three exports:

1. `Chart Of Accounts CSV`
2. `Journal Lines CSV`
3. `Trial Balance CSV`

The journal export is the system-of-record export. The chart-of-accounts and trial-balance exports are the lookup and summary companions that make Excel validation practical.

#### Chart Of Accounts CSV

This export should contain one row per account in the cash ledger account master.

Columns:

- `account_id`
- `account_code`
- `account_name`
- `account_family`
- `normal_balance`
- `control_subaccount`
- `status`
- `opened_at`
- `closed_at`
- `mortgage_id`
- `obligation_id`
- `lender_id`
- `borrower_id`
- `notes`

Purpose:

- lets analysts map journal lines back to the account master
- gives Excel lookups a stable source for account labels and account families
- mirrors the common chart-of-accounts pattern used by accounting platforms

#### Canonical format: Journal Lines CSV

The canonical export should be line-normalized, not compact one-row-per-entry.

Because each cash journal entry contains both a debit account and a credit account, export each entry as two CSV rows:

- one debit line
- one credit line

Both lines share the same journal entry identifier.

This is the most compatible shape for Excel, pivot tables, and external accounting review.

Do not export a single signed `amount` column as the canonical format. Double-entry review expects separate positive-value `debit` and `credit` columns.

#### Journal Lines CSV column order

- `journal_entry_id`
- `sequence_number`
- `posting_group_id`
- `line_number`
- `line_role`
- `effective_date`
- `timestamp_utc`
- `entry_type`
- `reference`
- `description`
- `account_id`
- `account_code`
- `account_name`
- `account_family`
- `control_subaccount`
- `normal_balance`
- `debit`
- `credit`
- `debit_cents`
- `credit_cents`
- `currency_code`
- `mortgage_id`
- `obligation_id`
- `lender_id`
- `borrower_id`
- `transfer_request_id`
- `dispersal_entry_id`
- `idempotency_key`
- `caused_by_journal_entry_id`
- `source_channel`
- `source_actor_type`
- `source_actor_id`

#### Journal Lines CSV formatting rules

- one row per journal line
- shared `journal_entry_id` for the debit and credit lines of one entry
- `line_number` must be stable and deterministic: `1` for debit, `2` for credit
- `effective_date` must use `YYYY-MM-DD`
- `timestamp_utc` must use ISO-8601 UTC
- `debit` and `credit` must be plain decimal numbers with 2 fraction digits and no currency symbols
- `debit_cents` and `credit_cents` must be exported as safe integer helper columns for exact Excel comparison
- `currency_code` should be `CAD` unless multi-currency is introduced later
- blank fields are preferred over placeholder text such as `N/A`
- the populated side of the row must be positive and the opposite side must be `0.00`
- do not include subtotal rows, footer rows, or presentation-only columns
- emit UTF-8 CSV with a single header row and spreadsheet-safe column names
- order rows by:
  - `effective_date`
  - `sequence_number`
  - `journal_entry_id`
  - `line_number`

#### Validation rules for Journal Lines CSV

The exported file must let an analyst confirm:

- total debit equals total credit
- any posting group nets correctly
- account activity can be pivoted by account, obligation, lender, mortgage, or transfer
- transaction history can be reconstructed in Excel from the exported rows alone
- every journal line can be joined back to the account master from `Chart Of Accounts CSV`

#### Trial Balance CSV

The companion summary export should contain one row per account as-of the selected end date.

Columns:

- `account_id`
- `account_code`
- `account_name`
- `account_family`
- `control_subaccount`
- `normal_balance`
- `opening_balance`
- `debit_turnover`
- `credit_turnover`
- `closing_balance`
- `opening_balance_cents`
- `debit_turnover_cents`
- `credit_turnover_cents`
- `closing_balance_cents`
- `as_of_date`
- `mortgage_id`
- `obligation_id`
- `lender_id`
- `borrower_id`

#### Date-range export rule

If the user exports a bounded period instead of full history, include an opening balance representation so Excel can still reconcile the selected range.

Preferred approach:

- Trial Balance CSV includes explicit opening and closing balances
- Journal Lines CSV remains pure transaction history for the selected period

Optional follow-up:

- add synthetic `OPENING_BALANCE` rows to a separate export variant if finance users need single-file workbook import

#### Excel compatibility rules

The export flow should optimize for direct use in Excel without cleanup:

- export each file separately rather than one denormalized mega-CSV
- use stable identifiers across all files so `XLOOKUP` or `INDEX/MATCH` works cleanly
- keep dates ISO-formatted so Excel can parse or preserve them deterministically
- keep numeric amount fields raw and unformatted so formulas and pivots work immediately
- include both decimal and integer-cent fields anywhere exact equality checks matter
- keep transaction history in `Journal Lines CSV`; do not collapse history into balances only
- default export bundle names:
  - `chart-of-accounts.csv`
  - `journal-lines.csv`
  - `trial-balance.csv`

## 11. Screen E: Ownership Ledger Tab

Purpose: provide contextual bridge to the existing unit ledger without conflating it with cash accounting.

This tab can initially be a contextual wrapper around existing ownership ledger views with three summary cards:

- ownership positions
- pending deals affecting ownership
- links to the existing ownership ledger details

The important rule is that ownership and cash stay on separate tabs with separate terminology.

## 12. Screen F: Mortgage-Level Payments And Ledger Workspace

Route: `/admin/mortgages/$recordid?tab=payments-ledger`

Purpose: give operators a single mortgage-scoped view without dumping them into the global console.

### Sections

- Mortgage summary
- Obligation truth
- Upcoming collection plan entries
- Recent collection attempts
- Cash state by family
- Reconciliation badges for this mortgage only

### Data sources

- `getMortgageCollectionOperationsSummary`
- `getMortgageCashState`
- mortgage-scoped collection plan and transfer filters
- mortgage-scoped reconciliation queries

### Actions

- `Open Payment Operations`
- `Open Financial Ledger`
- `Create workout plan`
- `Execute plan entry`
- `Reschedule plan entry`

## 13. Screen G: Ops Health Tab

Route: `/admin/financial-ledger?tab=ops-health`

Purpose: surface cron, self-healing, sync, and integrity-defect information in a durable operator UI.

This screen is required because the examples below are currently visible only as Convex logs:

- dispersal self-healing batch warnings
- self-healing escalation failures
- recurring schedule polling failures
- uncaught cron/query exceptions

### G.1 Core rule

Do not design this screen as a “tail the logs” viewer.

The UI must prefer persisted telemetry in this order:

1. explicit state tables
2. audit log events
3. persisted job-run and incident records
4. only then raw log excerpts, if they have been persisted into the incident record

### G.2 Header

- title: `Ops Health`
- subtitle: `Self-healing, cron execution, sync failures, and integrity defects`
- actions:
  - `Refresh`
  - `Open Reconciliation`
  - `Export incidents`

### G.3 Summary strip

Show:

- Active incidents
- Failed runs in last 24h
- Escalated healing attempts
- Schedules in sync error
- Open integrity defects

### G.4 Primary sections

#### Job health board

One row per recurring operational job:

- Dispersal self-healing
- Transfer reconciliation / transfer healing
- Recurring schedule poller
- Daily reconciliation
- Obligation transition cron

Columns:

- Job name
- Last run started
- Last run finished
- Status
- Items scanned
- Retriggered
- Escalated
- Failed count
- Last error summary

#### Incident feed

Show newest first. Each incident is one persisted failure or escalation event.

Columns:

- Severity
- Source job
- Function
- Error summary
- Related entity
- First seen
- Last seen
- Occurrence count
- Current status

#### Detail rail

For a selected job or incident show:

- structured run summary
- persisted error message
- stack excerpt
- affected IDs
- related audit events
- related healing attempts
- deep links to obligation, transfer, mortgage, schedule, or posting group

### G.5 Existing persisted sources to use immediately

#### Dispersal self-healing

Existing queryable facts:

- `dispersalHealingAttempts` table
- audit log action `dispersal.self_healing_escalated`
- reconciliation checks for missing dispersals and conservation defects

Use these to show:

- retrying vs escalated vs resolved attempts
- attempt count
- last attempt timestamp
- escalated timestamp

#### Transfer healing and integrity defects

Existing queryable facts:

- `transferHealingAttempts` table
- audit log action `transfer.integrity_defect.confirmed_without_ledger`
- transfer reconciliation queries

Use these to show:

- confirmed transfer without journal linkage
- escalation state
- related transfer and mortgage
- repeated integrity defects

#### Provider-managed recurring schedules

Existing queryable facts:

- `externalCollectionSchedules`
- `listExternalCollectionScheduleSyncIssues`
- `getExternalCollectionScheduleDetail`
- fields such as `lastSyncErrorAt`, `lastSyncErrorMessage`, `consecutiveSyncFailures`, `nextPollAt`

Use these to show:

- schedules in `sync_error`
- repeated sync failures
- lease stuck conditions
- next poll timing

### G.6 Backend boundary for ops health

This spec assumes the operational telemetry already exists in the backend domain model or in persisted supporting records.

For this screen:

- do not introduce a second incident-management subsystem
- do not add new cron wrappers or new write-side telemetry flows as part of the dashboard project
- do not duplicate backend classification logic in the frontend

If the current UI payloads are awkward, add read-only adapter queries over existing persisted sources only.

Acceptable adapter examples:

- `getOpsHealthOverview`
- `listOpsHealthEvents`
- `getOpsHealthEventDetail`

If one of the provided examples is not currently derivable from existing persisted backend facts, treat that as a backend visibility gap to confirm separately, not as permission to build parallel tables here.

### G.8 Mapping of the provided examples

#### Example: settled obligations without dispersals

Surface as:

- job run summary with `candidatesFound = 4`
- linked incident rows only if retrigger or escalation fails
- deep links to the affected obligations

#### Example: `cash account not found for family=BORROWER_RECEIVABLE`

Surface as:

- severity `error`
- source job `dispersal self-healing`
- function `dispersal/selfHealing:retriggerDispersal`
- related obligation and mortgage
- stack excerpt and occurrence count

#### Example: recurring schedules query ran multiple paginated queries

Surface as:

- failed run or incident fact sourced from the existing backend telemetry
- error summary matching `multiple paginated queries`
- related schedule or poller context where the existing backend already provides it
- if the current backend does not persist this failure class, mark it as a visibility gap for backend confirmation rather than adding a new telemetry path in this dashboard scope

## 14. Screen H: Validation Tab

Route: `/admin/financial-ledger?tab=validation`

Purpose: support development-time comparison of expected ledger state from Excel against actual system state.

This is intentionally a development and finance-ops tool. It should be feature-flagged or environment-gated outside local and staging until the workflow is hardened.

### H.1 Primary use cases

- compare spreadsheet-computed expected balances against live ledger state
- validate a mortgage or batch before trusting a new posting flow
- prove that journal-derived state matches offline calculations
- export discrepancies for investigation

### H.2 Layout

Desktop:

- left panel: validation input and run configuration
- center panel: diff summary and grouped comparison table
- right rail: selected variance detail with deep links

### H.3 Validation modes

Ship in this order:

1. CSV upload from Excel export
2. paste tabular values
3. manual row entry for quick checks

### H.4 Scope toggles

- by mortgage
- by obligation
- by lender payable
- by month
- by account family
- by posting group

### H.5 Comparison targets

At minimum support:

- obligation outstanding balance
- journal-settled amount
- lender payable balance
- available lender payable balance
- balances by family for a mortgage
- monthly conservation totals
- control balances by posting group

### H.6 Validation run flow

1. select scope
2. upload or paste expected rows
3. choose effective date or range
4. run comparison
5. inspect variances
6. export diff

### H.7 Summary strip

Show:

- rows compared
- exact matches
- mismatches
- total absolute variance
- largest variance
- unresolved variances

### H.8 Comparison table

Columns:

- Subject type
- Subject ID
- Metric
- Effective date or month
- Expected amount
- Actual amount
- Variance
- Variance percent
- Status
- Source row reference

### H.9 Variance detail rail

Show:

- expected input row
- actual query inputs and outputs
- linked account, obligation, transfer, or posting group
- related reconciliation checks
- operator notes

### H.10 Backend boundary for validation

Do not create a parallel validation backend for this screen.

Validation should work like this:

- expected values are uploaded, pasted, and held in client state for the active session
- actual values come from existing ledger queries or thin read-only adapter endpoints
- diffing can happen in the client unless there is already an existing backend comparison surface

Acceptable read-only adapter examples:

- `getValidationComparisonSnapshot`
- `getValidationAccountActuals`
- `getValidationPostingGroupActuals`

Out of scope for this dashboard effort:

- persisted validation-run tables
- write-side validation workflows
- a second backend comparison engine that reimplements existing ledger rules

### H.11 CSV Validation Workflow

Validation mode should work cleanly with the exported accounting CSV.

Recommended workflow:

1. export `Chart Of Accounts CSV`
2. export `Journal Lines CSV`
3. export `Trial Balance CSV`
4. load the bundle into Excel
5. compare spreadsheet-calculated expectations against actual exported balances
6. optionally re-import expected comparison rows into the Validation tab

The exported CSV must therefore prioritize:

- deterministic ordering
- stable identifiers
- separate debit and credit columns
- exact cent helper fields
- enough dimensional metadata to pivot by mortgage, obligation, lender, and month

## 15. Visual And Interaction Requirements

- Use the existing admin shell and breadcrumb system.
- The main information density should come from tables, not oversized cards.
- Badges should encode status and exception state consistently across screens.
- Keep the detail rail sticky on desktop.
- All IDs should be copyable.
- All linked references should deep-link to the owning route.
- Use human labels first, IDs second.
- Do not hide accounting fields behind generic “details” accordions.
- Ops Health should visually differentiate:
  - domain exception
  - job failure
  - escalated incident
- Validation should visually differentiate:
  - exact match
  - within tolerance
  - mismatch
  - missing actual
  - missing expected

## 16. Backend Data Contract Mapping

### Existing query surfaces that should be used directly

Payment operations:

- `listCollectionAttempts`
- `getCollectionAttempt`
- `listCollectionPlanEntries`
- `getCollectionPlanEntry`
- `getMortgageCollectionOperationsSummary`
- `listTransfersByStatus`
- `listTransfersByMortgage`
- `listTransfersByCounterparty`
- `listTransfersByDeal`
- `getTransferTimeline`

Cash ledger and reconciliation:

- `getObligationBalance`
- `getMortgageCashState`
- `getLenderPayableBalance`
- `getAvailableLenderPayableBalance`
- `getUnappliedCash`
- `getSuspenseItems`
- `getAccountBalance`
- `getAccountBalanceAt`
- `getAccountBalanceRange`
- `getObligationHistory`
- `getControlAccounts`
- `getControlBalance`
- `controlNetZeroCheck`
- `getPostingGroupEntries`
- `getBorrowerBalance`
- `getBalancesByFamily`
- `journalReplayIntegrityCheck`
- all reconciliation queries in `reconciliationQueries.ts`

Operational health:

- `dispersalHealingAttempts` table
- `transferHealingAttempts` table
- `listExternalCollectionScheduleSyncIssues`
- `getExternalCollectionScheduleDetail`
- audit log events for escalations and integrity defects

### Read-only adapters that may be required for a clean UI

These are acceptable only as read-only shaping endpoints over existing backend data. They must not introduce new write paths, new source-of-truth tables, or parallel business logic.

#### 1. Chart of accounts list query

Needed:

- `listCashLedgerAccounts`

Why:

- current public API supports reading balances for known accounts but not listing accounts for a global chart-of-accounts screen

Expected row DTO:

- `accountId`
- `family`
- `subaccount`
- `mortgageId`
- `obligationId`
- `lenderId`
- `borrowerId`
- `balance`
- `lastActivityAt`
- `isException`

#### 2. Journal search query

Needed:

- `listCashLedgerJournalEntries`

Why:

- current public API supports account range and obligation history, but not operator-grade journal search across dimensions

Expected filters:

- date range
- family
- accountId
- mortgageId
- obligationId
- lenderId
- borrowerId
- transferRequestId
- postingGroupId
- entryType

#### 3. Obligations admin list adapter

Needed:

- `listObligationOperationsRows`

Why:

- `/admin/obligations` is fake
- `payments/obligations/queries.ts` is internal and too raw for the operator console
- the UI needs joined obligation, journal, latest attempt, and latest transfer state

#### 4. Obligation operations detail adapter

Needed:

- `getObligationOperationsDetail`

Why:

- the screen needs corrective-chain, latest plan entries, latest attempts, and latest transfers in one payload
- `getObligationWithCorrectives` currently exists only as an internal query

#### 5. Reconciliation summary adapter

Needed:

- `getFinancialLedgerOverview`

Why:

- the UI should not fan out 10+ queries in the page component just to build the summary strip and card counts

#### 6. Posting group summary adapter

Needed:

- `getPostingGroupSummary`

Why:

- the register drawer needs a grouped explanation of multi-entry posting events

#### 7. Ops health adapter surface

Needed:

- `getOpsHealthOverview`
- `listOpsHealthEvents`
- `getOpsHealthEventDetail`

Why:

- the UI needs one coherent read-only surface over the existing persisted telemetry, healing, schedule, and audit sources
- this adapter layer must only reshape existing backend facts; it must not create a new incident subsystem

#### 8. Validation comparison adapter surface

Needed:

- `getValidationComparisonSnapshot`
- `getValidationAccountActuals`
- `getValidationPostingGroupActuals`

Why:

- spreadsheet-vs-system comparison is now an explicit product requirement for early rollout and debugging
- the UI may need read-only snapshots of existing ledger actuals, but it should not create saved validation-run infrastructure in this effort

#### 9. Accounting CSV export query surface

Needed:

- `exportCashLedgerChartOfAccountsCsv`
- `exportCashLedgerJournalLinesCsv`
- `exportCashLedgerTrialBalanceCsv`

Why:

- generic table export is insufficient for accounting validation
- the export must follow journal-line and trial-balance conventions that work in Excel and external accounting review
- if export formatting is not already exposed cleanly, add a read-only export surface rather than duplicating ledger calculation logic in the frontend

## 17. Non-Goals

- No inline editing of journal rows
- No merged “all payments and ledger events” mega-table
- No attempt to make ownership and cash share a single ledger view
- No mobile-first optimization beyond making the workflows usable on tablet
- No self-service borrower or lender UX in these admin screens
- No direct UI dependency on raw Convex deployment logs as the primary data source
- No new backend source-of-truth tables, write-side telemetry flows, or parallel validation infrastructure as part of this dashboard effort

## 18. Recommended Delivery Order

1. Ship `Payment Operations` first because the backend read models already exist and align closely with the Paper direction.
2. Ship `Financial Ledger -> Reconciliation` second because the reconciliation queries already exist and provide the highest operator leverage.
3. Ship `Financial Ledger -> Ops Health` third using existing healing tables, schedule sync-error fields, and audit-log-backed escalations.
4. Ship `Financial Ledger -> Cash Ledger` fourth, gated on read-only chart-of-accounts, journal-search, and export surfaces where the existing backend shape is too low-level for the UI.
5. Add `Financial Ledger -> Validation` fifth as a client-side and read-only workflow over existing ledger data.
6. Add the mortgage-scoped workspace integration last.

## 19. Acceptance Criteria

- Staff can answer, from the dashboard, what is owed, what was attempted, what settled, and what remains unreconciled.
- Staff can move from an obligation row to its collection attempt, transfer, and journal evidence in no more than two clicks.
- Finance users can inspect a chart of accounts and a register-style journal view without using raw database tables.
- Reconciliation exceptions are visible by default on the ledger landing page.
- Self-healing and cron failures are visible in the UI as existing persisted backend facts exposed through the dashboard, not only as terminal logs.
- The UI can surface the specific classes of failures in the provided examples, including job-level query failures and self-healing escalations.
- Development users can upload spreadsheet-derived expected values and see exact diffs against system state.
- Finance and engineering can export a spreadsheet-safe accounting bundle consisting of `Chart Of Accounts CSV`, `Journal Lines CSV`, and `Trial Balance CSV`, then validate totals and balances in Excel without manual cleanup.
- Existing backend actions for waive, write-off, execute, reschedule, and workout lifecycle are discoverable from the correct operational surfaces.
- The UI vocabulary preserves the real system boundaries:
  - obligations = debt truth
  - collection plans = strategy
  - collection attempts and transfers = execution
  - cash ledger = money truth
