
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

# ADDITIVE UI / UX DESIGN, CORE FLOWS, AND ASCII MOCKUPS

## Dashboard-shell integration requirements for this phase

This phase touches two admin-facing surfaces that MUST remain within the existing dashboard shell:

1. the origination-case `Collections` step, and
2. the mortgage detail `Payment setup` section.

The global dashboard sidebar and header/breadcrumb shell remain the outer chrome. The collections selector and activation-state UI are page-local components inside that shell.

Recommended breadcrumb patterns:

- origination collections step: `Admin / Originations / Case {caseId}`
- mortgage detail payment setup: `Admin / Mortgages / {mortgageId}`

## Collections step design in the origination workflow

This phase turns the phase-1 shell into a real decision surface. The layout SHOULD still match the existing origination page structure:

- left local stepper unchanged,
- right main pane shows the collections content.

Recommended content order:

1. **Mode selector**
2. **Provider requirements / helper text**
3. **Bank account selector** (conditional)
4. **Preflight checklist** (conditional)
5. **What happens after commit** explainer

### Mode selector treatment

Do not use a tiny dropdown. Use three explicit radio cards or segmented cards so the operational consequences are obvious:

- `No collection setup`
- `Manual / app-owned only`
- `Provider-managed now`

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Collections — choose how collections start after commit                                     │
│                                                                                             │
│ ┌────────────┐ ┌─────────────────┐ ┌──────────────────────┐                                 │
│ │ No setup   │ │ Manual/app-owned│ │ Provider-managed now │                                 │
│ │ No recur.  │ │ Bootstrap only  │ │ Rotessa after commit │                                 │
│ └────────────┘ └─────────────────┘ └──────────────────────┘                                 │
│                                                                                             │
│ Provider: pad_rotessa                                                                       │
│ v1: bank account must belong to primary borrower.                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Bank account selector

When `provider_managed_now` is selected, show a dedicated card below the mode selector.

Recommended behavior:

- list or searchable picker of eligible bank accounts,
- primary borrower ownership highlighted,
- validated / mandate-active badges visible in-row,
- unsupported accounts shown but disabled with a reason if the UX pattern supports it,
- do not hide disqualification reasons inside backend-only errors.

Suggested row columns:

- account nickname / masked account,
- owner name,
- validation status,
- mandate status,
- provider metadata availability,
- selection control.

### Preflight checklist

This checklist SHOULD appear only when `provider_managed_now` is selected. It communicates likely success conditions before commit while remaining subordinate to backend source-of-truth validation.

Recommended checklist items:

- account belongs to primary borrower,
- account is validated,
- PAD mandate is active,
- institution/transit format valid,
- Rotessa metadata present,
- cadence supported,
- uniform installment amounts will be checked after plan-entry generation.

Use pass/warn/fail icons. Unknown checks SHOULD say `validated at commit` rather than pretending success.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Provider-managed preflight                                                                  │
│ Selected: TD ••••1842 (Jane Doe)                                                            │
│ ✓ Primary borrower ownership                                                                │
│ ✓ Validated account                                                                         │
│ ✓ Active PAD mandate                                                                        │
│ ✓ Rotessa metadata present                                                                  │
│ ✓ Cadence: monthly                                                                          │
│ • Uniform entry amounts confirmed after bootstrap                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Review-step summary treatment

On the review step, add a collections summary card that makes the selected mode explicit. Operators should not have to click back into the collections step to remember what will happen after commit.

Recommended summary variants:

- `No collection setup requested`
- `App-owned collection bootstrap only`
- `Provider-managed activation requested after commit using account TD ••••1842`

This summary MUST also explain the non-transactional rule for provider-managed now: canonical origination happens first, and provider setup may fail later without rolling back the mortgage.

## Mortgage detail payment-setup extension

After commit, the same mortgage detail `Payment setup` section from phase 4 MUST now surface activation state. Keep it in the same section; do not create a second scattered provider-status surface.

Recommended additions above the tables:

- activation-status banner/card,
- provider summary row,
- retry control when failed.

Possible states:

- `Pending`
- `Activating`
- `Active`
- `Failed`

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Payment setup / activation                                                                  │
│ Mode: [Provider-managed]  Provider: [pad_rotessa]                                           │
│ Status: [Active]  External schedule: sch_123                                                │
│                                                                                             │
│ — or —                                                                                      │
│ Status: [Failed]                                                                            │
│ Last error: Unsupported cadence or missing provider metadata                                │
│                                    [Retry activation]                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

When state is `pending` or `activating`, the UI SHOULD show a spinner/progress treatment and explain that canonical mortgage + obligations + plan entries already exist.

## Failure-state UX requirements

Provider activation failure is a first-class operational state, not a generic toast.

The mortgage detail page and, if still accessible, the origination case review screen SHOULD show:

- a durable banner,
- the current activation status chip,
- human-readable `lastError`,
- retry action,
- explicit text that the mortgage, obligations, and app-owned plan entries were still created successfully.

Recommended banner copy shape:

```text
Collection setup failed after canonical origination completed.
The mortgage and initial app-owned plan entries remain valid.
You can retry provider-managed activation or continue servicing in app-owned mode.
```

## Core user flows the UI MUST support

### Flow A — provider-managed now succeeds

1. Operator selects `Provider-managed now`.
2. Selects an eligible primary-borrower bank account.
3. Review step summarizes the choice.
4. Commit succeeds canonically.
5. Mortgage detail initially shows `Pending` or `Activating`.
6. UI refresh/polling eventually shows `Active` and provider-managed execution mode.

### Flow B — provider-managed now fails

1. Operator selects `Provider-managed now`.
2. Commit succeeds canonically.
3. Follow-up activation fails.
4. Mortgage detail shows `Failed`, `lastError`, and `Retry activation`.
5. Obligations and plan entries remain visible below the failure banner.

### Flow C — operator chooses app-owned only

1. Operator selects `Manual / app-owned only`.
2. Review step summary reflects that choice.
3. After commit, mortgage detail shows `Execution mode: app_owned` and no provider activation banner.

## Interaction and visual-behavior rules

- The collections mode selector SHOULD default conservatively according to existing product defaults, but the selected mode must always be explicit.
- Do not let the presence of a bank account silently switch the mode to provider-managed now.
- Do not show a success state until the underlying adapter has actually succeeded.
- Preserve status across page refresh and redirect; never keep it only in component-local memory.
- Retry action SHOULD be disabled while a retry is actively in progress.
- The UI MUST never present generic one-time transfer actions on this screen; that would contradict the scope and architecture.

## Merge-safe UI ownership notes

This phase owns the semantics of the collections step and activation banners. Later phases may polish these surfaces, but they MUST NOT move provider-activation status into an unrelated screen or bypass the same `Payment setup` section established here.

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
- Bank-account ownership must be primary-borrower-only in v1; do not silently accept co-borrower or guarantor accounts.
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
