# Mortgage Payment Snapshots and Admin Table Controls Design

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** Admin mortgages list, mortgage detail read-model reuse, reusable admin table header controls

---

## Goal

Enrich the admin mortgages table so staff can see, sort, and filter on:

- the most recent payment outcome
- the next upcoming payment

Do this in a way that also supports the mortgage detail page, keeps filtering authoritative in the backend, and establishes a reusable table-shell pattern for column visibility, per-column controls, and aggregate footers across CRM-backed admin tables.

---

## Problem Statement

The current admin shell can render table views backed by CRM/system-object view definitions, but it does not yet support:

- mortgage payment snapshot columns that are safe to filter and sort server-side
- a reusable, discoverable interface for showing and hiding columns
- per-column filter and sort affordances in the table header
- aggregate footer summaries on supported columns

Today, some mortgage-derived display fields can be hydrated after the main query, but that is not sufficient for true filtering or sorting in native system-object tables because filtering happens before later presentation hydration. We need a canonical snapshot contract that is available early enough in the query pipeline to behave like a first-class field.

---

## Recommended Approach

Use a shared mortgage payment snapshot read-model as the canonical source for payment-summary fields.

This snapshot module will:

- batch-load payment context for a set of mortgage ids
- normalize the latest payment outcome and next upcoming payment into a stable contract
- feed both the admin list query path and the mortgage detail page

The mortgage CRM/system-object pipeline will expose these snapshot-backed fields as real available fields so they can participate in visibility, filters, sorts, and aggregate footer selection. The UI will then expose a reusable header control model shared across admin tables.

This is intentionally designed behind a seam so the snapshot source can later move from on-demand read-model computation to a persisted projection table without changing the UI or shell contracts.

---

## Snapshot Contract

### Display summaries

The mortgage snapshot exposes two human-readable summary fields for compact table rendering:

- `mostRecentPaymentSummary`
  - example: `Settled • Apr 2 • $2,450`
- `nextUpcomingPaymentSummary`
  - example: `Apr 30 • $2,450 • planned`

These are presentation helpers only. Filtering and sorting should use the structured fields below.

### Structured fields

The snapshot also exposes filterable and sortable fields:

- `mostRecentPaymentStatus`
- `mostRecentPaymentDate`
- `mostRecentPaymentAmount`
- `nextUpcomingPaymentStatus`
- `nextUpcomingPaymentDate`
- `nextUpcomingPaymentAmount`

### Status vocabularies

`mostRecentPaymentStatus` uses:

- `settled`
- `processing`
- `failed`
- `reversed`
- `cancelled`
- `none`

`nextUpcomingPaymentStatus` uses:

- `planned`
- `provider_scheduled`
- `executing`
- `due`
- `overdue`
- `none`

`none` is a real value, not an omitted field. It must remain filterable so staff can isolate mortgages whose payment context is incomplete or missing.

---

## Snapshot Precedence Rules

### Most recent payment

The most recent payment view is operational, not purely contractual.

Precedence:

1. Prefer the latest real collection or transfer execution outcome when one exists.
2. If no execution exists, fall back to the best available obligation state.
3. If neither exists, return `none`.

This produces an answer that reflects what staff most often mean by "what happened last?"

### Next upcoming payment

The next upcoming payment should reflect the next practical collection event staff expect to happen.

Precedence:

1. Prefer the next collection plan entry.
2. If unavailable, fall back to provider-managed schedule state.
3. If still unavailable, fall back to the next unsettled obligation.
4. If none exist, return `none`.

The visible summary should include date, amount, and schedule status where available.

---

## Backend Architecture

### Shared read-model module

Create a dedicated shared module for mortgage payment snapshots. A representative API is:

```ts
loadMortgagePaymentSnapshots(ctx, mortgageIds) => Map<mortgageId, MortgagePaymentSnapshot>
```

Responsibilities:

- collect relevant payment and schedule records in batch
- normalize them into the shared snapshot contract
- avoid N+1 access patterns
- be safe for reuse from both list and detail flows

This module is the single place where payment snapshot precedence and normalization live.

### Native system-object integration

The mortgage list cannot rely on late hydration for these fields because list filtering and sorting happen earlier in the pipeline. For native system-object tables, snapshot-backed values must be available before filter and sort evaluation.

That means the mortgage query path needs an explicit pre-filter materialization step for snapshot fields when the active view depends on them, including:

- visible columns
- active filters
- active sorts
- active aggregate footer rules

The backend remains the source of truth for filtering and sorting. The frontend must not re-sort snapshot columns client-side.

### Field registration

Register the snapshot-backed mortgage fields as first-class mortgage CRM fields so they appear in:

- available columns
- saved view visibility state
- filter builders
- sort menus
- aggregate footer eligibility checks

This keeps the admin shell working through the existing saved-view and view-definition system instead of inventing a second preference model.

### Detail page reuse

The same snapshot contract must be consumed by the mortgage detail page so the list and detail surfaces do not drift semantically.

The detail page can render richer presentation around the same fields, but it should not reinterpret precedence rules or derive a separate payment-status concept.

---

## Data and Index Expectations

To keep snapshot loading efficient, add or confirm indexes that support batched lookup by mortgage and relevant time ordering.

Minimum expected support:

- collection attempts by mortgage and initiated timestamp
- collection plan entries by mortgage and scheduled date

If provider-scheduled or obligation fallback queries need additional indexes once implemented, add them in the same workstream rather than compensating in application code.

---

## Reusable Admin Table Header Controls

### Control model

The reusable interaction model for admin tables is:

- inline search in the table header area
- a global "All filters" entry point in the header
- a header-level "Columns" button that opens a compact visibility manager
- per-column filter and sort affordances in each visible column header
- restore-defaults and clear-all actions in the same header system

The column manager should not live in a detached side panel. It belongs behind a single header button so visibility management is discoverable but not visually dominant.

### Column visibility

V1 supports:

- show and hide columns
- search available fields in the column manager
- restore default visibility
- persistence per user and per saved view

V1 does not include drag-and-drop column ordering UI. Existing view order remains authoritative until a later iteration introduces explicit reordering controls.

### Per-column controls

Each visible column header should expose:

- filter control
- sort control

These controls can open popovers or menus, but the header must clearly communicate that the column is individually controllable.

The payment snapshot columns are expected to support:

- filtering by normalized status
- sorting by status, date, or amount through their structured fields

For composite display columns, the default header sort semantics must be explicit:

- sorting `Most Recent Payment` defaults to `mostRecentPaymentDate`
- sorting `Next Upcoming Payment` defaults to `nextUpcomingPaymentDate`

If the UI exposes richer sort choices inside the column control, those choices should map to the structured fields rather than attempting to sort on the display summary string.

---

## Aggregate Footer

### Purpose

Aggregate summaries should appear at the bottom of the table for columns where a summary is actually meaningful on the active result set.

The footer is scoped to the currently filtered result set, not the full dataset.

### Rules by field type

- numeric fields: use `sum` or `avg` where appropriate
- date fields: use `earliest` or `latest`
- status-like fields: use counts by normalized bucket
- fields with no meaningful summary: render no aggregate value

Examples:

- principal: sum
- rate: average
- most recent payment status: counts by status
- next upcoming payment date: earliest date
- lifecycle status: counts by status

The footer should stay sparse rather than forcing a summary for every column.

---

## Missing Data and Empty States

If a mortgage has no known payment history:

- `mostRecentPaymentStatus = none`
- summary renders as an empty-state treatment, not a fabricated status

If a mortgage has no upcoming payment:

- `nextUpcomingPaymentStatus = none`
- summary renders as an empty-state treatment

These `none` values remain usable in filters and aggregates where appropriate.

---

## Failure and Degraded Behavior

If a view does not depend on mortgage payment snapshot fields, the mortgage list should behave exactly as it does today.

If a view does depend on snapshot fields and snapshot loading fails, the backend should fail the query rather than silently dropping the fields or applying partial client-side behavior. Silent degradation would make filter and sort results misleading.

The UI can render a normal query failure state, but it should not mask the problem by showing stale or incomplete snapshot-derived values.

---

## Reuse Across Tables

The header-shell pattern is intended to be reusable beyond mortgages. The immediate target is the mortgages table, but the same interaction model should be applicable across other admin entity tables such as obligations and related CRM-backed listings.

Reusability here means:

- one shell-level header controls component pattern
- one visibility-management interaction model
- one approach to per-column filter and sort affordances
- one aggregate footer treatment model

Mortgage-specific logic belongs only in the payment snapshot fields and their backend read-model.

---

## Non-Goals

This design does not include:

- a dedicated persisted snapshot table or projection in v1
- drag-and-drop column ordering UI
- user-defined custom aggregate formulas
- a second preferences system outside the existing saved-view model
- client-side-only filtering or sorting for snapshot fields

---

## Acceptance Criteria

The work is complete when all of the following are true:

1. The mortgages table can display most recent payment and next upcoming payment columns.
2. Both payment concepts are filterable and sortable through backend-authoritative query behavior.
3. The same snapshot contract is reused by the mortgage detail page.
4. Column visibility is managed through a reusable header control used by admin tables.
5. Each visible column exposes filter and sort controls from the table header.
6. Aggregate footers render for supported columns and reflect the active filtered result set.
7. Missing payment context resolves to explicit `none` states rather than silent omission.

---

## Testing and Verification Expectations

Planning and implementation should include verification for all three layers:

- backend snapshot normalization tests for precedence, status vocabulary mapping, `none` handling, and batch loading behavior
- backend list-query tests proving snapshot-backed fields can participate in filters, sorts, and aggregate footer inputs for mortgage views
- frontend tests for reusable header controls, including inline search, column popover visibility management, per-column filter/sort affordances, and aggregate footer rendering

If the mortgage detail page consumes the shared snapshot contract through a separate loader path, include a verification that detail rendering uses the same normalized snapshot semantics as the list.

---

## Implementation Notes for Planning

The implementation plan should assume:

- backend work is the critical path because filterability requires early pipeline integration
- the shared snapshot module is the contract boundary and should be introduced before UI changes depend on it
- the shell UI should be implemented as reusable table infrastructure, not mortgage-only view code
- tests must cover both backend snapshot normalization and frontend header-control behavior

---

## Open Questions

None for v1. The design is specific enough to proceed to implementation planning.
