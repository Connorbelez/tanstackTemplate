
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
- Obligation `status` must follow the same canonical due-date convention the obligation machine expects.
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
- Use the existing obligation machine’s due-date status convention.
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
- Set `status` from due date according to the canonical convention expected by the existing obligation machine.

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
- Reuse the existing obligation machine’s status conventions instead of inventing new statuses.
- Implement the initial plan-entry bootstrap wrapper around existing scheduling code.
- Modify `activateMortgageAggregate` in the reserved seam so that after the later phase-6 blueprint hook and before the later phase-3 listing hook, it:
  1. generates obligations,
  2. bootstraps plan entries,
  3. returns created IDs and `scheduleRuleMissing`.
- Ensure no attempts or transfer requests are created.
- Ensure no provider APIs are called here.

# FRONTEND / UI WORK

- Extend mortgage detail/admin surfaces with payment setup summary.
- Add obligations list visibility from mortgage/admin.
- Add collection plan entries visibility from mortgage/admin.
- Show a schedule-rule warning chip/banner if `scheduleRuleMissing = true`.
- Make sure the UI clearly shows app-owned planned entries rather than implying provider-managed status.

# ADDITIVE UI / UX DESIGN, CORE FLOWS, AND ASCII MOCKUPS

## Dashboard-shell integration requirements for this phase

All admin-facing payment-setup surfaces introduced by this phase MUST live inside the existing mortgage detail screen within the dashboard shell:

- global sidebar unchanged,
- breadcrumbs in the shell header,
- payment summary rendered as a normal section/card on the mortgage detail page,
- obligations and collection-plan entries displayed as read-only operational tables.

This phase MUST NOT introduce a separate payment-setup app or a floating wizard outside the mortgage detail route.

Recommended breadcrumb pattern:

- `Admin / Mortgages / {mortgageId}`

## Payment setup section information architecture

The `Payment setup` section should become a first-class card/anchor on mortgage detail. Recommended structure:

1. **Overview strip**
   - execution mode (`app_owned` in this phase),
   - count of obligations,
   - count of collection-plan entries,
   - optional `schedule rule missing` warning chip.

2. **Warning banner**
   - only visible when `scheduleRuleMissing = true`,
   - explains that bootstrap used existing defaults and that this is an operational warning, not proof of provider setup.

3. **Two read-only tables**
   - Obligations
   - Collection plan entries

ASCII mockup:

```text
┌────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Admin              │ Breadcrumbs: Admin / Mortgages / M-2031                                │
│ Mortgages          │ Mortgage M-2031                                                        │
│ Listings           │ ───────────────────────────────────────────────────────────────────────│
│ Deals              │ ┌─────────────────────────────────────────────────────────────────────┐│
│ ...                │ │ Payment setup: [App-owned]  Obligations: 25  Entries: 25            ││
│                    │ │ Schedule rule: [Missing warning]                                    ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ No active schedule rule. Bootstrap used defaults.                   ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Obligations  #  Due date    Type           Amount   Status          ││
│                    │ │               1  2026-06-01  interest       8,500    planned        ││
│                    │ │               25 2027-05-01  principal      850,000  planned        ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
│                    │ ┌─────────────────────────────────────────────────────────────────────┐│
│                    │ │ Collection plan  Date       Amount  Mode       Status               ││
│                    │ │                   2026-06-01 8500    app_owned  planned             ││
│                    │ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

## Table design requirements

### Obligations table

Recommended columns:

- payment number,
- due date,
- obligation type,
- amount due,
- amount settled,
- status.

The table is operational and read-only. Avoid actions such as `Collect now`, `Retry`, or `Send to provider`; those would misrepresent the scope of this phase.

### Collection plan entries table

Recommended columns:

- planned date,
- amount,
- execution mode,
- status,
- provider code or `—`,
- entry ID or inspect action if the repo commonly exposes row details.

The table MUST make `app_owned` + `planned` legible. Operators should not mistake phase-4 bootstrap for provider-managed scheduling.

## Summary-card and status-chip behavior

Recommended chips/labels:

- `App-owned`
- `Planned`
- `Warning: default schedule config used`

Avoid provider-colored or provider-branded treatment in this phase, because provider-managed activation has not happened yet.

## Mortgage detail navigation and section ordering

The payment setup card SHOULD sit near the top half of mortgage detail because:

- it is canonical operational truth,
- later phase 5 extends the same area with provider activation state,
- operators verifying origination correctness will check this soon after summary and borrowers.

Recommended order after phase 4:

1. Summary
2. Borrowers
3. Payment setup
4. Listing
5. Documents
6. Audit

## Core user flows the UI MUST support

### Flow A — inspect bootstrap result after commit

1. Operator commits a mortgage.
2. Lands on mortgage detail.
3. Opens/scrolls to `Payment setup`.
4. Sees real obligations and real app-owned planned entries.
5. Confirms no provider-managed state is implied.

### Flow B — inspect missing-schedule warning

1. Origination occurs in an environment with no active schedule rule.
2. Payment setup still renders obligations and plan entries.
3. Warning banner clearly indicates defaults were used.
4. Operator can continue operational follow-up without assuming the mortgage failed to originate.

## Interaction and visual-behavior rules

- Keep the tables read-only in this phase.
- Use empty states only if origination truly has no rows, which should generally indicate an implementation failure rather than a normal condition.
- Do not collapse obligations and plan entries into a single mixed table; they represent different canonical concepts.
- Do not label app-owned plan entries with provider-oriented status copy such as `scheduled with Rotessa`.
- If there are many rows, default to pagination or scroll within the section according to existing dashboard table patterns.

## Merge-safe UI ownership notes

Phase 5 will extend this exact `Payment setup` surface with provider-managed activation state, failures, and retry actions. The section layout established here SHOULD therefore reserve obvious space for:

- activation status banner,
- provider metadata strip,
- retry CTA region.

Do not force later phases to create a second payment card elsewhere on the page.

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
