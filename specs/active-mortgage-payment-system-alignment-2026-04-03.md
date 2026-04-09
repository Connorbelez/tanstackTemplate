# Active Mortgage Payment System Alignment Pass

Date: 2026-04-03
Mode: Intent-first
Primary sources:
- Notion goal: `Active Mortgage Payment System`
- Notion architecture: `Three-Layer Payment Architecture`
- Notion schema: `Obligations, Collection Plan, Collection Attempts`

## A. Executive Summary

### What is solid

- The repo preserves the core three-layer separation at the business-boundary level:
  - Obligations model debt and are governed entities.
  - Collection Plan is a rules/data layer, not a governed machine.
  - Collection Attempts model execution and remain distinct from obligations.
- The obligation lifecycle is materially aligned with the spec:
  - obligations generate from mortgage terms
  - due/overdue/settled transitions exist
  - overdue drives mortgage delinquency
  - settlement drives mortgage cure behavior
- The ledger-facing money flow is materially aligned with the intended boundary:
  - obligation accrual posts receivable
  - confirmed collection posts cash receipt against receivable
  - plan entries and rule evaluation are not posted directly to the cash ledger
- Retry and late-fee rule behavior exists in production code, not only in tests.
- The mortgage machine is still obligation-driven rather than collection-plan-driven.

### What is materially drifting

- The Collection Plan layer is only partially realized as an operational system:
  - seeded/default rules exist
  - rule evaluation exists
  - but there is no canonical production execution spine that picks up plan entries and spawns collection attempts
- `seedPaymentData` currently bypasses the rules engine and inserts initial plan entries directly instead of deriving them from `ScheduleRule`.
- The spec expects admin-configurable rules and mutable collection operations. The repo has internal rule records and internal queries/mutations, but no real admin-facing management surface or API for rules, workout plans, or borrower reschedules.
- The linked schema intent and current schema have drifted:
  - repo schema is leaner in some places
  - repo schema also contains different enum sets and operational fields
  - several schema expectations from Notion are not implemented

### What is still missing

- Balance pre-check capability
- Borrower reschedule capability
- Workout-plan capability
- Admin rule-management capability
- Canonical public/admin Collection Plan read/write surfaces
- Operational hardening and broader coverage for the canonical plan-entry execution spine

### Spec stale vs code drift

#### Spec stale

- The newer transfer-domain architecture is an acceptable evolution of the Collection Attempt/provider boundary:
  - `TransferProvider`
  - `transferRequests`
  - bridged inbound transfers
  - `PaymentMethodAdapter`
- The architecture page already reflects this evolution more accurately than the top-level goal page.

#### Code drift

- The activation/handoff path does not currently match the stated intent that the first collection strategy is created by `ScheduleRule`.
- The Collection Plan layer is still missing key extensibility capabilities called out as core intent, not optional stretch items.
- Admin configurability is mostly declarative in schema/docs, not exposed as an implemented operational surface.

## B. Coverage Matrix

| Bucket | Spec assertion | Repo evidence | Status | Notes | Follow-up |
|---|---|---|---|---|---|
| Layer 1 Obligations | Obligations are contractual facts independent of collection strategy changes | `convex/payments/obligations/generateImpl.ts`, `convex/engine/machines/obligation.machine.ts` | Implemented | Obligation fields and lifecycle are separate from collection-plan records; no reschedule logic mutates obligation amount/due date. | None |
| Layer 1 Obligations | Obligations are generated from mortgage terms | `convex/payments/obligations/generate.ts`, `convex/payments/obligations/generateImpl.ts`, `convex/payments/__tests__/generation.test.ts` | Implemented | Production generator derives amount, cadence, grace period from mortgage data. | None |
| Layer 1 Obligations | Obligations are created at mortgage activation / handoff | `convex/payments/obligations/generate.ts`, `convex/seed/seedPaymentData.ts` | Partial | Obligations are generated through seed/bootstrap flows and internal generation functions, but there is no clear production mortgage-activation orchestrator wired to this goal. | Add explicit activation handoff path or mark current scope as seed-only in spec |
| Layer 1 Obligations | Obligation states include upcoming, due, overdue, partially_settled, settled | `convex/engine/machines/obligation.machine.ts` | Implemented with acceptable variance | Machine also supports `waived`, which is a valid extension. | Update spec wording to include waiver branch if desired |
| Layer 1 Obligations | Due transition accrues receivable | `convex/engine/machines/obligation.machine.ts`, `convex/engine/effects/obligationAccrual.ts`, `convex/payments/cashLedger/integrations.ts` | Implemented | `BECAME_DUE` fires `accrueObligation`; accrual posts `OBLIGATION_ACCRUED` to cash ledger. | None |
| Layer 1 Obligations | Overdue transition triggers mortgage delinquency | `convex/engine/effects/obligation.ts`, `convex/engine/machines/mortgage.machine.ts`, `src/test/convex/payments/crossEntity.test.ts` | Implemented | `emitObligationOverdue` forwards `OBLIGATION_OVERDUE` to mortgage and schedules rules evaluation. | None |
| Layer 1 Obligations | Settlement triggers mortgage cure behavior | `convex/engine/effects/obligation.ts`, `convex/engine/machines/mortgage.machine.ts`, `src/test/convex/payments/endToEnd.test.ts` | Implemented | Obligation settlement emits `PAYMENT_CONFIRMED` to mortgage. | None |
| Layer 1 Obligations | Settled obligations trigger ledger-relevant follow-up | `convex/engine/effects/obligation.ts`, `convex/payments/cashLedger/reconciliation.ts`, `convex/dispersal/createDispersalEntries.ts` | Implemented with acceptable variance | Repo settles through cash-ledger posting at collection confirmation, then uses obligation settlement for downstream dispersal logic. | Keep documented as current orchestration |
| Layer 2 Collection Plan | Collection Plan is not a governed state machine | `convex/payments/collectionPlan/mutations.ts`, `convex/payments/collectionPlan/queries.ts`, `convex/schema.ts` | Implemented | Entries use lightweight status fields only. | None |
| Layer 2 Collection Plan | Rules exist as data | `convex/schema.ts`, `convex/payments/collectionPlan/seed.ts`, `convex/payments/collectionPlan/engine.ts` | Implemented | `collectionRules` table plus seeded default rules. | None |
| Layer 2 Collection Plan | Rules can be enabled/disabled and ordered | `convex/schema.ts`, `convex/payments/collectionPlan/queries.ts` | Implemented | `enabled` and `priority` are honored by `getEnabledRules`. | None |
| Layer 2 Collection Plan | ScheduleRule creates plan entries ahead of due date | `convex/payments/collectionPlan/rules/scheduleRule.ts`, `convex/payments/__tests__/rules.test.ts` | Implemented | Uses rolling window and idempotency check. | None |
| Layer 2 Collection Plan | RetryRule creates retry entries with backoff | `convex/payments/collectionPlan/rules/retryRule.ts`, `src/test/convex/payments/crossEntity.test.ts`, `src/test/convex/payments/endToEnd.test.ts` | Implemented | Exponential backoff and `rescheduledFromId` are present. | None |
| Layer 2 Collection Plan | LateFeeRule creates a late-fee obligation on overdue | `convex/payments/collectionPlan/rules/lateFeeRule.ts`, `convex/obligations/mutations.ts` | Implemented | Correctly creates a new obligation, not a plan entry. | None |
| Layer 2 Collection Plan | BalancePreCheckRule exists | No production implementation found; only mentioned in Notion/docs | Missing | No rule handler, no schema specialization, no provider/bank health flow tied to plan entries. | Code |
| Layer 2 Collection Plan | BorrowerRescheduleRule exists | No production implementation found; only RBAC metadata mentions reschedule permissions | Missing | No handler, no mutation path, no borrower/admin flow. | Code |
| Layer 2 Collection Plan | WorkoutRule exists | No production implementation found | Missing | No workout plan entity/grouping flow beyond speculative schema mentions in Notion. | Code |
| Layer 2 Collection Plan | Rules are admin-configurable from dashboard without deployment | Internal tables exist; no real admin query/mutation/UI surface found; admin route scaffolds are fake | Partial | Config storage exists, operational surface does not. `src/routes/admin/obligations/route.tsx` is fake-data scaffold. | Code |
| Layer 2 Collection Plan | Initial collection plan is produced by rule evaluation | `convex/seed/seedPaymentData.ts` | Partial | Repo uses direct insertion of initial plan entries instead of invoking `ScheduleRule` through the engine. | Code or spec clarification |
| Layer 2 Collection Plan | Plan entry source taxonomy matches intended strategy sources | `convex/schema.ts`, `convex/payments/collectionPlan/mutations.ts` | Partial | Repo has `default_schedule`, `retry_rule`, `late_fee_rule`, `admin`; spec expects richer sources like `admin_workout`, `borrower_reschedule`, `admin_manual`. | Code and spec |
| Layer 3 Collection Attempts | Collection Attempts are distinct from obligations | `convex/schema.ts`, `convex/engine/machines/collectionAttempt.machine.ts` | Implemented | Separate entity and machine. | None |
| Layer 3 Collection Attempts | Collection Attempts are governed entities / state machine | `convex/engine/machines/collectionAttempt.machine.ts` | Implemented | GT machine exists with pending/confirmed/failure/reversal path. | None |
| Layer 3 Collection Attempts | Confirmed attempt applies payment to obligations | `convex/engine/effects/collectionAttempt.ts`, `convex/engine/effects/obligationPayment.ts` | Implemented | `emitPaymentReceived` distributes amount across referenced obligations. | None |
| Layer 3 Collection Attempts | Failed attempt triggers Collection Plan retry logic | `convex/engine/effects/collectionAttempt.ts`, `convex/payments/collectionPlan/rules/retryRule.ts` | Implemented | `MAX_RETRIES_EXCEEDED` schedules `COLLECTION_FAILED` rules evaluation. | None |
| Layer 3 Collection Attempts | Reversal handling exists | `convex/engine/effects/collectionAttempt.ts`, `convex/payments/webhooks/processReversal.ts` | Implemented | Durable reversal cascade and corrective obligation flow exist. | None |
| Layer 3 Collection Attempts | Collection Attempts are immutable execution records | `convex/schema.ts`, `convex/engine/machines/collectionAttempt.machine.ts` | Implemented with acceptable variance | Repo patches status/provider fields on the same attempt record, which is consistent with state-machine execution records; business meaning remains one attempt = one execution. | None |
| Layer 3 Collection Attempts | Collection Attempt layer is where payment methods/providers plug in | `convex/payments/methods/interface.ts`, `convex/payments/transfers/interface.ts`, `convex/payments/transfers/providers/adapter.ts`, `convex/engine/effects/collectionAttempt.ts` | Implemented with acceptable variance | Boundary evolved: attempts now bridge into `transferRequests` / `TransferProvider`. Legacy `PaymentMethod` remains for older borrower-collection path and adapter support. | Spec cleanup and code convergence |
| Cross-layer flow | Confirmed collection posts cash receipt against receivable | `convex/engine/effects/collectionAttempt.ts`, `convex/payments/cashLedger/integrations.ts`, `convex/payments/transfers/__tests__/inboundFlow.integration.test.ts` | Implemented | Cash posting happens in collection-attempt path; bridged transfer skips duplicate posting. | None |
| Cross-layer flow | Ledger does not see plan entries or balance checks | `convex/payments/cashLedger/integrations.ts`, `convex/engine/effects/collectionAttempt.ts` | Implemented with acceptable variance | Ledger-facing code works from obligation/attempt/transfer settlement semantics, not plan-entry strategy logic. | None |
| Cross-layer flow | Collection Plan entries eventually spawn Collection Attempts in production | `convex/payments/collectionPlan/execution.ts`, `convex/payments/collectionPlan/executionGuards.ts`, `convex/payments/collectionPlan/executionContract.ts` | Implemented with acceptable variance | The canonical plan-entry -> collection-attempt execution spine now exists; remaining work is coverage and operational hardening. | None |
| Integration | Mortgage Ownership Ledger boundary is accrual + cash receipt only | `convex/payments/obligations/generateImpl.ts`, `convex/payments/cashLedger/integrations.ts` | Implemented with acceptable variance | Repo uses cash ledger rather than ownership ledger for money truth, but boundary intent is preserved: accrual and confirmed cash settlement drive postings. | Spec wording should reference cash ledger explicitly where appropriate |
| Integration | Unified Borrower Payment Rails plug into Collection Attempt layer | `convex/payments/methods/*`, `convex/payments/transfers/*`, `convex/payments/transfers/providers/adapter.ts` | Partial | Intent is preserved through adapter/bridge, but the repo currently carries two abstractions. | Code and spec |
| Integration | Mortgage activation generates obligations, then scheduling strategy | `convex/seed/seedPaymentData.ts`, `convex/payments/obligations/generate.ts`, `convex/payments/collectionPlan/rules/scheduleRule.ts` | Partial | Repo does generate obligations first, but initial plan entries are inserted directly in seed/bootstrap path instead of flowing through `ScheduleRule`. | Code |
| Integration | Mortgage machine watches obligation states, not plan states | `convex/engine/effects/obligation.ts`, `convex/engine/machines/mortgage.machine.ts` | Implemented | Mortgage receives obligation-driven events only. | None |
| Integration | Collection failure does not directly drive mortgage state | `convex/engine/effects/collectionAttempt.ts`, `convex/engine/machines/mortgage.machine.ts` | Implemented | Failure triggers plan/rule logic, not direct mortgage transitions. | None |
| Admin/ops | Admin-facing obligation view exists | `src/routes/admin/obligations/route.tsx` | Partial | Route exists but currently serves fake data, not live Convex payment-system data. | Code |
| Admin/ops | Admin-facing collection-plan / rules management exists | No concrete route or Convex public API found | Missing | This is absent despite being central to the spec intent. | Code |
| Schema | Repo obligation schema matches intent | `convex/schema.ts` vs Notion schema page | Partial | Core fields exist, but repo uses `paymentNumber`, lacks explicit `currency`, and uses additional late-fee/corrective fields. | Spec stale and code cleanup candidate |
| Schema | Repo collectionPlanEntries schema matches intent | `convex/schema.ts` vs Notion schema page | Partial | Missing `mortgageId`, `currency`, execution timestamps, richer source enums, and direct `collectionAttemptId`; repo has leaner operational schema. | Code and spec |
| Schema | Repo collectionAttempts schema matches intent | `convex/schema.ts` vs Notion schema page | Partial | Missing `mortgageId`, `currency`, explicit `createdAt`, and some provider fields differ (`providerRef` vs `externalId`/`referenceNumber`). | Code and spec |
| Schema | Repo collectionRules schema matches intent | `convex/schema.ts` vs Notion schema page | Partial | Missing `description`, `trigger=manual`, `ruleType`, and audit actor fields. Repo keys behavior off `name` plus generic `action`/`parameters`. | Code and spec |

## C. Integration Seam Review

### 1. Mortgage Ownership Ledger

#### Current implementation

- Obligation accrual posts receivables through cash-ledger integration helpers:
  - `postObligationAccrued` in `convex/payments/cashLedger/integrations.ts`
- Confirmed collection posts cash receipt through the collection-attempt effect path:
  - `emitPaymentReceived` in `convex/engine/effects/collectionAttempt.ts`
  - `postCashReceiptForObligation` in `convex/payments/cashLedger/integrations.ts`
- Bridged inbound transfers are created for audit and transfer-domain consistency, but they intentionally skip duplicate cash posting:
  - `publishTransferConfirmed` in `convex/engine/effects/transfer.ts`

#### Alignment judgment

Implemented with acceptable variance.

The top-level goal text says “Mortgage Ownership Ledger,” but the repo now correctly uses the cash ledger as the money-truth boundary for accrual and receipt posting. That is not architectural collapse. It is a more precise implementation seam. The Collection Plan layer still does not directly post money events.

#### Risk if left as-is

Low to medium.

The main risk is documentation ambiguity, not behavior. Future contributors may misread “ownership ledger” as the place borrower cash postings happen, when the repo now clearly separates ownership from cash.

### 2. Unified Borrower Payment Rails

#### Current implementation

- Legacy borrower-collection abstraction:
  - `convex/payments/methods/interface.ts`
  - `convex/payments/methods/manual.ts`
  - `convex/payments/methods/mockPAD.ts`
- Newer transfer abstraction:
  - `convex/payments/transfers/interface.ts`
  - `convex/payments/transfers/providers/registry.ts`
  - `convex/payments/transfers/providers/manual.ts`
  - `convex/payments/transfers/providers/mock.ts`
- Compatibility bridge:
  - `convex/payments/transfers/providers/adapter.ts`
- Collection-attempt settlement currently bridges into transfer records:
  - `convex/engine/effects/collectionAttempt.ts`

#### Alignment judgment

Partial, but directionally correct.

This is not a boundary violation by itself. The repo is in a transitional state where `TransferProvider` is the stronger canonical abstraction and `PaymentMethod` is legacy borrower-collection compatibility. The architecture page already reflects this. The code still carries both abstractions, so the boundary is preserved, but the conceptual model is split.

#### Recommendation

Treat `TransferProvider` plus `transferRequests` as the long-term canonical rail abstraction. Keep `PaymentMethod` only as a migration shim until all collection-attempt initiation flows route through transfer creation or a single adapter-backed provider boundary.

#### Risk if left as-is

Medium to high.

The dual abstraction invites duplicated provider integrations and inconsistent inbound behavior. The next real provider implementation could land on the wrong side of the split.

### 3. Mortgage Activation & Lifecycle Handoff

#### Current implementation

- Obligation generation exists:
  - `convex/payments/obligations/generate.ts`
  - `convex/payments/obligations/generateImpl.ts`
- Seed/bootstrap path creates initial payment data:
  - `convex/seed/seedPaymentData.ts`
- Schedule rule exists independently:
  - `convex/payments/collectionPlan/rules/scheduleRule.ts`

#### Alignment judgment

Partial.

The repo gets the ordering mostly right: obligations first, collection strategy second. But the actual initial-plan creation path does not currently route through the rules engine. `seedPaymentData` directly inserts plan entries, which weakens the “contractual reality then rules-derived strategy” boundary the spec is trying to enforce.

#### Risk if left as-is

Medium.

Initial collection behavior can drift from `ScheduleRule` semantics over time. The system then has two sources of truth for initial scheduling.

### 4. Mortgage Lifecycle

#### Current implementation

- Mortgage machine listens for obligation-driven events:
  - `convex/engine/machines/mortgage.machine.ts`
- Obligation effects forward overdue and settlement outcomes to mortgage:
  - `convex/engine/effects/obligation.ts`
- Collection-attempt failure routes to Collection Plan rules, not mortgage:
  - `convex/engine/effects/collectionAttempt.ts`

#### Alignment judgment

Implemented.

This boundary is clean. Mortgage state remains driven by obligation state transitions and not by collection-plan bookkeeping or provider-level execution noise.

#### Risk if left as-is

Low.

This is one of the cleanest parts of the implementation.

## D. Prioritized Backlog

### P0 Boundary Violations

No clear P0 boundary violation was found.

The repo’s biggest issues are missing spine and incomplete surface area rather than outright concern collapse.

### P1 Execution Spine Hardening

#### P1-1: Validate canonical production execution from Collection Plan entry to Collection Attempt

- Problem: The canonical plan-entry execution spine exists, but it still needs broader coverage around replay safety, staging, and downstream handoff behavior.
- Evidence:
  - `convex/payments/collectionPlan/execution.ts`
  - `convex/payments/collectionPlan/executionGuards.ts`
  - `convex/payments/collectionPlan/executionContract.ts`
- Likely owning areas:
  - `convex/payments/collectionPlan/*`
  - `convex/engine/commands.ts`
  - `convex/payments/methods/*`
  - `convex/payments/transfers/*`
- Fix belongs in: code

#### P1-2: Route initial plan creation through the rules engine instead of direct seed insertion

- Problem: `seedPaymentData` directly inserts initial plan entries.
- Evidence:
  - `convex/seed/seedPaymentData.ts`
  - `convex/payments/collectionPlan/rules/scheduleRule.ts`
- Likely owning areas:
  - `convex/seed/seedPaymentData.ts`
  - `convex/payments/collectionPlan/engine.ts`
  - `convex/payments/collectionPlan/rules/scheduleRule.ts`
- Fix belongs in: code

#### P1-3: Converge provider abstraction around one canonical inbound rail contract

- Problem: `PaymentMethod` and `TransferProvider` coexist, with adapter bridging between them.
- Evidence:
  - `convex/payments/methods/interface.ts`
  - `convex/payments/transfers/interface.ts`
  - `convex/payments/transfers/providers/adapter.ts`
- Likely owning areas:
  - `convex/payments/methods/interface.ts`
  - `convex/payments/transfers/interface.ts`
  - initiation/orchestration code for attempts and transfers
- Fix belongs in: code and spec

### P2 Admin / Config Surface Gaps

#### P2-1: Add real admin-facing Collection Plan and Collection Rules APIs

- Problem: The spec centers admin configurability, but repo surfaces are mostly internal-only.
- Evidence:
  - `convex/payments/collectionPlan/mutations.ts`
  - `convex/payments/collectionPlan/queries.ts`
  - fake-data admin obligations route
- Likely owning areas:
  - `convex/payments/collectionPlan/*`
  - admin routes and components under `src/routes/admin/*`
- Fix belongs in: code

#### P2-2: Implement BalancePreCheck capability

- Problem: A named core rule from the goal is absent.
- Evidence:
  - no rule handler or flow found
  - only future-looking references in design docs
- Likely owning areas:
  - `convex/payments/collectionPlan/rules/*`
  - bank-account verification / provider integration areas
- Fix belongs in: code

#### P2-3: Implement BorrowerReschedule capability

- Problem: No workflow exists for rescheduling planned collection without mutating the obligation.
- Evidence:
  - no handler/mutation/UI found
  - only permission metadata mentions rescheduling
- Likely owning areas:
  - `convex/payments/collectionPlan/*`
  - borrower/admin action surfaces
- Fix belongs in: code

#### P2-4: Implement Workout-plan capability

- Problem: No admin-initiated workout scheduling system exists.
- Evidence:
  - no workout entity or operational workflow found
  - only spec/docs references
- Likely owning areas:
  - `convex/payments/collectionPlan/*`
  - possible new workout-plan module/table
- Fix belongs in: code

### P3 Schema / Spec Cleanup

#### P3-1: Reconcile top-level goal text with transfer-domain evolution

- Problem: Top-level goal still reads as if payment methods plug directly into Collection Attempts, while the architecture page shows the evolved transfer boundary.
- Likely owning areas:
  - Notion goal page
  - Notion architecture page cross-links
- Fix belongs in: spec

#### P3-2: Reconcile schema page with current repo schema

- Problem: Notion schema page and repo schema differ materially on enum sets and fields.
- Key contracts to review:
  - `collectionPlanEntries`
  - `collectionRules`
  - `collectionAttempts`
  - `obligations`
- Fix belongs in: code and spec

#### P3-3: Clarify ledger wording

- Problem: The goal’s “Mortgage Ownership Ledger” wording no longer matches the repo’s money-truth implementation.
- Evidence:
  - borrower-cash semantics live in `convex/payments/cashLedger/*`
- Fix belongs in: spec

## Interface and Type Follow-up Targets

These are the main public or cross-module contracts that should be evaluated next:

- `convex/payments/methods/interface.ts`
  - legacy borrower-collection abstraction
- `convex/payments/transfers/interface.ts`
  - stronger rail abstraction
- `convex/payments/transfers/providers/adapter.ts`
  - explicit migration shim
- `convex/schema.ts`
  - `collectionPlanEntries`
  - `collectionRules`
  - `collectionAttempts`
  - `obligations`
- `convex/seed/seedPaymentData.ts`
  - current activation/bootstrap handoff shape
- canonical plan-entry execution contract
  - implemented via `executePlanEntry` and `stagePlanEntryExecution`

## Recommendation Summary

1. Keep the three-layer architecture.
2. Treat the transfer domain as an acceptable evolution, not as drift, but converge the inbound provider boundary onto one canonical abstraction.
3. Prioritize the missing Collection Plan execution spine before adding more rule types.
4. Move initial scheduling behind the rules engine so activation/handoff matches the intended architecture.
5. Update the Notion goal/schema text after code direction is settled, especially around:
   - transfer-domain evolution
   - cash ledger vs ownership ledger wording
   - actual schema shape

## Bottom Line

The repo is aligned on the architecture that matters most:
separate debt, strategy, and execution.

It is not yet aligned on operational completeness.

The biggest remaining gap is not the state machines or the cash posting path. It is the missing production spine that turns Collection Plan strategy into actual Collection Attempt execution, plus the absence of admin-configurable operational surfaces promised by the spec.
