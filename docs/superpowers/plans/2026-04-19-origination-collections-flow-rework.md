# Origination Collections Flow Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy three-option collections flow and rework origination so operators only see `app managed via manual` or `provider managed via Rotessa payment schedule`, with a real borrower autocomplete plus borrower-to-schedule two-column Rotessa workflow.

**Architecture:** Collapse the collections selector to two canonical intents and remove the legacy `none` path from the draft model, validation, and review surfaces. Keep participant identity staging separate, but eliminate raw borrower-ID entry by replacing it with canonical borrower search and letting the Rotessa collections step own the two-column borrower/schedule linking workflow, seeded from mortgage terms and guarded by PAD evidence.

**Tech Stack:** React, TanStack Start, Convex, Tailwind, shadcn/ui, Vitest

---

### Task 1: Remove The Legacy Third Collections Option

**Files:**
- Modify: `src/lib/admin-origination.ts`
- Modify: `convex/admin/origination/validators.ts`
- Modify: `src/components/admin/origination/collections-step-model.ts`
- Modify: `src/components/admin/origination/ReviewStep.tsx`
- Test: `src/test/admin/origination/collections-step-model.test.ts`
- Test: `src/test/convex/admin/origination/validators.test.ts`

- [ ] Remove `none` from the draft/UI type surface and keep backward-compatibility only as a normalization fallback if required.
- [ ] Ensure the selector exposes exactly two labels matching current product language.
- [ ] Update review/summary helpers so no stale “no collection rail yet” branch can render.
- [ ] Update tests to assert exactly two strategies and the new labels.

### Task 2: Replace Raw Borrower ID Entry In Participants

**Files:**
- Modify: `src/components/admin/origination/ParticipantsStep.tsx`
- Modify: `src/components/admin/origination/OriginationWorkspacePage.tsx`
- Modify: `src/components/admin/origination/participants-step-model.ts`
- Test: `src/test/admin/origination/participants-step-model.test.ts`

- [ ] Remove any visible raw `borrower_...` entry field from participant staging.
- [ ] Keep canonical borrower autocomplete plus manual fallback for staged borrower identity.
- [ ] Preserve commit payload shape so backend participant resolution does not regress.
- [ ] Extend model tests for search, selection hydration, and clear-selection behavior.

### Task 3: Rework Rotessa Into A Real Two-Column Selection Surface

**Files:**
- Modify: `src/components/admin/origination/CollectionsStep.tsx`
- Modify: `src/components/admin/origination/collections-step-model.ts`
- Test: `src/test/admin/origination/collections-step-model.test.ts`

- [ ] Make the left column a proper borrower selection surface, not a loose text filter plus list.
- [ ] Keep the right column disabled until a borrower is selected.
- [ ] Continue surfacing already-linked schedules as visible but greyed out.
- [ ] Keep “Create new payment schedule” seeded from `paymentAmount`, `paymentFrequency`, and `firstPaymentDate`.
- [ ] Keep PAD upload/admin override mandatory for new schedule creation.

### Task 4: Verify End-To-End Visible Behavior And Docs

**Files:**
- Modify: `docs/architecture/admin-origination-workspace.md`
- Modify: `docs/architecture/origination-collections-rotessa.md`

- [ ] Document the two-option collections contract and removal of the legacy third path.
- [ ] Document that borrower autocomplete exists in participant staging and that Rotessa setup is the canonical two-column borrower/schedule flow.
- [ ] Run targeted tests, `bun check`, `bun typecheck`, and `bunx convex codegen` if deployment config is available.
