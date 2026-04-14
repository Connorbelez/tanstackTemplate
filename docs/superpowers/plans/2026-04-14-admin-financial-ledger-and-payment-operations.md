# Admin Financial Ledger And Payment Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new `/admin/payment-operations` and `/admin/financial-ledger` dashboard surfaces from the approved screen spec using the existing backend, permitting only thin read-only adapters where current query shapes are insufficient.

**Architecture:** Add route-local admin surfaces for payment operations and ledger workflows, plus a small shared UI layer under `src/components/admin/financial-ledger`. Reuse existing Convex payment and cash-ledger queries directly where possible; if chart-of-accounts listing, journal search, export, or ops-health aggregation are still missing, add read-only adapter queries only. Keep validation as client-side comparison logic over existing read models rather than persisted validation infrastructure.

**Tech Stack:** React, TanStack Router, TanStack Query + Convex query integration, Convex, Tailwind CSS, shadcn/ui, Vitest.

---

### Task 1: Route And Navigation Scaffolding

**Files:**
- Modify: `src/components/admin/shell/entity-registry.ts`
- Create: `src/routes/admin/payment-operations.tsx`
- Create: `src/routes/admin/financial-ledger.tsx`
- Modify: `src/routeTree.gen.ts`

- [ ] **Step 1: Add static admin navigation entries**

Add static nav entries for:
- `/admin/payment-operations`
- `/admin/financial-ledger`

Keep them in the existing `payments` and `ledger` domains so the sidebar reflects the new information architecture.

- [ ] **Step 2: Add top-level admin routes**

Create dedicated file routes for:
- `src/routes/admin/payment-operations.tsx`
- `src/routes/admin/financial-ledger.tsx`

Each route should:
- preload the queries needed for its default tab where practical
- validate search params for tab/filter state
- render a route-local page component instead of the generic entity table shell

- [ ] **Step 3: Regenerate the route tree**

Run the project’s route generation command after the files exist so `src/routeTree.gen.ts` stays in sync.

### Task 2: Read-Only Convex Adapter Audit And Implementation

**Files:**
- Inspect/Modify if needed: `convex/payments/collectionPlan/admin.ts`
- Inspect/Modify if needed: `convex/payments/cashLedger/queries.ts`
- Inspect/Modify if needed: `convex/payments/cashLedger/reconciliationQueries.ts`
- Inspect/Modify if needed: `convex/payments/transfers/queries.ts`
- Create only if required: `convex/payments/adminDashboard/queries.ts`
- Test: `src/test/convex/...` or `src/test/admin/...` as appropriate

- [ ] **Step 1: Confirm direct-use query surfaces**

Use existing public/admin queries directly for:
- obligations/plan/attempts/workout summaries
- transfer lists and transfer timeline
- reconciliation checks and summary suite
- account balance and family balance queries

- [ ] **Step 2: Add read-only adapters only for missing shapes**

If the current backend still lacks clean UI payloads, add read-only queries only for:
- chart-of-accounts list
- journal search / register rows
- accounting CSV exports
- ops-health aggregation over existing healing/schedule/audit sources

Do **not** add:
- new source-of-truth tables
- write-side telemetry
- persisted validation-run infrastructure
- duplicate business logic already encoded in ledger/payment domain code

- [ ] **Step 3: Verify adapter visibility and permissions**

Ensure every new read-only surface uses the repo’s existing fluent builder chains with explicit visibility and the correct admin/payment/cash-ledger permission middleware.

### Task 3: Shared Admin UI Layer

**Files:**
- Create: `src/components/admin/financial-ledger/AdminFinancialLayout.tsx`
- Create: `src/components/admin/financial-ledger/FinancialLedgerTabs.tsx`
- Create: `src/components/admin/financial-ledger/MetricStrip.tsx`
- Create: `src/components/admin/financial-ledger/DataTableCard.tsx`
- Create: `src/components/admin/financial-ledger/DetailRail.tsx`
- Create: `src/components/admin/financial-ledger/StatusPill.tsx`
- Create: `src/components/admin/financial-ledger/filters.ts`

- [ ] **Step 1: Build the route-local shell components**

Create a focused shared UI kit for these screens:
- page header
- KPI strip
- sticky filter bar
- dense table card
- detail rail
- empty/loading/error states

- [ ] **Step 2: Commit to a clear dashboard visual direction**

Use the existing admin shell, but make the new surfaces feel intentional:
- dense finance-oriented layout
- restrained but distinct ledger color coding
- strong typography hierarchy without generic “cards everywhere”
- consistent status and severity badges across payment operations, ledger, ops health, and validation

- [ ] **Step 3: Keep all shared pieces route-local to this feature**

Do not pollute the generic entity table system. Shared components for this feature should live under `src/components/admin/financial-ledger`.

### Task 4: Payment Operations Surface

**Files:**
- Create: `src/components/admin/financial-ledger/payment-operations-page.tsx`
- Create: `src/components/admin/financial-ledger/payment-operations-tabs.tsx`
- Create: `src/components/admin/financial-ledger/payment-operations-types.ts`
- Modify if needed: `src/routes/admin/payment-operations.tsx`

- [ ] **Step 1: Implement the `Obligations` tab**

Render a real operator table and rail for:
- obligation truth
- settled/outstanding amounts
- collection/transfer overlays
- quick links into mortgage and ledger context

If no single backend row already exists, compose the UI from existing read models or use one thin read-only adapter.

- [ ] **Step 2: Implement the `Collections`, `Transfers`, and `Collection Plans` tabs**

Wire directly to the existing admin/payment query surfaces already used by the AMPS demo where possible.

- [ ] **Step 3: Surface existing operator actions only**

Show only actions already supported by the backend, such as:
- execute collection plan entry
- reschedule collection plan entry
- waive/write-off where already available from the backend surface used here

### Task 5: Financial Ledger Surface

**Files:**
- Create: `src/components/admin/financial-ledger/financial-ledger-page.tsx`
- Create: `src/components/admin/financial-ledger/reconciliation-tab.tsx`
- Create: `src/components/admin/financial-ledger/cash-ledger-tab.tsx`
- Create: `src/components/admin/financial-ledger/ops-health-tab.tsx`
- Create: `src/components/admin/financial-ledger/validation-tab.tsx`
- Create: `src/components/admin/financial-ledger/ownership-ledger-tab.tsx`
- Modify if needed: `src/routes/admin/financial-ledger.tsx`

- [ ] **Step 1: Implement `Reconciliation`**

Use `reconciliationFullSuite` plus supporting checks to render:
- summary strip
- exception cards
- selected-check exception table
- detail rail / drill-through links

- [ ] **Step 2: Implement `Cash Ledger`**

Provide:
- chart-of-accounts list
- journal/register view
- posting-group detail
- account/family filters
- export controls

Use existing account balance/history queries where possible and a read-only adapter for global listing or journal-search only if required.

- [ ] **Step 3: Implement `Ops Health`**

Surface existing persisted operational facts:
- dispersal healing attempts
- transfer healing attempts
- schedule sync errors
- escalation/integrity audit evidence

If one coherent shape does not exist today, add a read-only adapter only.

- [ ] **Step 4: Implement `Validation`**

Keep expected spreadsheet rows in client state.
Fetch actual system values from existing ledger queries or thin read-only snapshots.
Perform diffing in the client unless an existing backend comparison surface already exists.

### Task 6: Accounting CSV Export

**Files:**
- Modify or create read-only query surface only if required: `convex/payments/adminDashboard/queries.ts`
- Create: `src/components/admin/financial-ledger/export-menu.tsx`
- Create: `src/components/admin/financial-ledger/csv.ts`

- [ ] **Step 1: Implement export entry points**

Expose the accounting bundle:
- `Chart Of Accounts CSV`
- `Journal Lines CSV`
- `Trial Balance CSV`

- [ ] **Step 2: Enforce accounting-friendly export conventions**

The journal export must be line-normalized with:
- shared journal entry IDs
- separate `debit` and `credit` columns
- stable line numbering
- deterministic ordering
- raw numeric fields plus cent helper fields

- [ ] **Step 3: Make the exports spreadsheet-safe**

Users should be able to open the files in Excel immediately without cleanup and validate:
- total debits = total credits
- trial balance roll-forward
- account activity by mortgage, obligation, lender, borrower, posting group, and transfer

### Task 7: Tests And Verification

**Files:**
- Create/Modify: `src/test/admin/financial-ledger.test.tsx`
- Create/Modify: `src/test/admin/payment-operations.test.tsx`
- Create/Modify backend tests only if new read-only adapters are added

- [ ] **Step 1: Add focused screen tests**

Cover:
- route rendering for both screens
- tab switching from search params
- critical empty/loading/error states
- CSV export entry point visibility
- validation diff behavior for client-side expected vs actual comparisons

- [ ] **Step 2: Add adapter tests only where new endpoints were introduced**

If read-only adapters are added, test only the reshaping/filtering behavior. Do not duplicate domain-logic tests that already belong to the underlying payment/ledger modules.

- [ ] **Step 3: Run project verification**

Run:
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- targeted tests for the new admin surfaces

- [ ] **Step 4: Record residual gaps explicitly**

If any spec requirement cannot be implemented without new backend write-side infrastructure, stop and report that exact gap instead of silently creating parallel backend logic.
