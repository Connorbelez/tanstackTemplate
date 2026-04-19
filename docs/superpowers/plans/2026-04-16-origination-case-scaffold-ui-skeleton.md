# Origination Case Scaffold And UI Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the phase-1 admin origination workspace with durable draft persistence, per-step validation, autosave, seven-step navigation, and a review shell without creating any canonical borrower, property, mortgage, listing, payment, or document rows.

**Architecture:** Add an additive staging aggregate in Convex (`adminOriginationCases` plus empty `originationCaseDocumentDrafts`), expose dedicated origination queries/mutations through `fluent-convex`, and mount a dedicated admin route family under `/admin/originations`. Keep the UI state local-and-optimistic for typing, but treat the persisted case query as the source of truth for refresh, step restore, and review rendering.

**Tech Stack:** Convex, fluent-convex, React 19, TanStack Router, TanStack Query + Convex Query integration, Tailwind CSS, ShadCN UI, Vitest, convex-test.

---

### Task 1: Backend Contract

**Files:**
- Create: `src/test/convex/admin/origination/cases.test.ts`
- Create: `convex/admin/origination/cases.ts`
- Create: `convex/admin/origination/validators.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/test/moduleMaps.ts`

- [ ] Write failing convex-test coverage for case bootstrap, additive patching, validation snapshot updates, list/query behavior, and deletion.
- [ ] Verify the new tests fail because the origination module/tables do not exist yet.
- [ ] Implement shared draft validators, deep additive patch helpers, and origination queries/mutations with `requirePermission("mortgage:originate")`.
- [ ] Add additive schema entries for `adminOriginationCases` and `originationCaseDocumentDrafts`, plus the module-map entries required by the Convex test kit.
- [ ] Re-run the origination backend tests until they pass.

### Task 2: Admin Shell Integration

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/admin-entities.ts`
- Modify: `src/components/admin/shell/entity-registry.ts`
- Modify: `src/components/admin/shell/AdminBreadcrumbs.tsx`
- Modify: `src/test/admin/admin-shell.test.ts`

- [ ] Add `/admin/originations` to the reserved admin route set so the generic entity route never claims it.
- [ ] Add navigation and breadcrumb labels for Originations inside the existing dashboard shell.
- [ ] Extend `canAccessAdminPath` so users with explicit `mortgage:originate` access can enter the origination subtree while external admins still cannot.
- [ ] Add/adjust admin-shell tests for the new route gate and navigation item.

### Task 3: Route Family And Workspace UI

**Files:**
- Create: `src/routes/admin/originations/route.tsx`
- Create: `src/routes/admin/originations/new.tsx`
- Create: `src/routes/admin/originations/$caseId.tsx`
- Create: `src/components/admin/origination/OriginationIndexPage.tsx`
- Create: `src/components/admin/origination/OriginationWorkspacePage.tsx`
- Create: `src/components/admin/origination/OriginationStepper.tsx`
- Create: `src/components/admin/origination/SaveStateIndicator.tsx`
- Create: `src/components/admin/origination/ReviewSummarySection.tsx`
- Create: `src/components/admin/origination/ParticipantsStep.tsx`
- Create: `src/components/admin/origination/PropertyStep.tsx`
- Create: `src/components/admin/origination/MortgageTermsStep.tsx`
- Create: `src/components/admin/origination/CollectionsStep.tsx`
- Create: `src/components/admin/origination/DocumentsStep.tsx`
- Create: `src/components/admin/origination/ListingCurationStep.tsx`
- Create: `src/components/admin/origination/ReviewStep.tsx`
- Create: `src/components/admin/origination/shared.ts`

- [ ] Build the originations index page around the existing admin shell with a `New origination` primary action and resume list.
- [ ] Implement `/admin/originations/new` as a bootstrap route that creates a durable case and redirects to `/$caseId`.
- [ ] Implement the seven-step workspace shell, autosave status indicator, step-local draft editing, and review summary sections.
- [ ] Keep documents/collections intentionally skeletal while still persisting draft choices and rendering future sections.
- [ ] Disable commit logic explicitly with explanatory copy.

### Task 4: Frontend Verification And Docs

**Files:**
- Create: `src/test/admin/origination-workspace.test.tsx`
- Create: `docs/architecture/admin-origination-workspace.md`

- [ ] Add focused frontend tests for the stepper/review shell and any pure helpers worth locking down.
- [ ] Document the staging tables, route contract, additive patch invariant, and “no canonical rows” rule.
- [ ] Run the repo gates: `bun check`, `bunx convex codegen`, `bun typecheck`, targeted Vitest suites, then `bun run test` if the targeted pass leaves no blockers.
- [ ] Run `coderabbit review --plain` after the implementation is stable and address any actionable findings.
