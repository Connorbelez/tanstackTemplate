# 15. Verification, Tests, and Deprecation Cleanup — Tasks

> Spec: https://www.notion.so/337fc1b4402481a5abd4c1804791ac9b
> Generated: 2026-04-05
>
> Scope override: admin UI, browser verification, and demo validation are
> intentionally deferred to later dedicated execution pages.
> If every non-deferred task below is checked, the active page-15 scope is fully
> implemented, tested, and verified.

## Phase 1: Verification Matrix & Scope Lock
- [x] T-001: Capture local PRD, design, and task artifacts for page 15. (F-1, F-2, F-3, F-4)
- [x] T-002: Re-fetch the live page-15 Notion spec and linked implementation plan, then ground the local plan against current repo truth. (REQ-1, REQ-3, REQ-5, REQ-6, REQ-7, F-1, F-3, F-4)
- [x] T-003: Build a backend-only verification matrix from the page-15 requirements and the alignment report, explicitly excluding deferred UI/demo checks. (REQ-1, REQ-2, REQ-6, REQ-7, F-1, F-4)
- [x] T-004: Inventory the current legacy/compatibility tests and docs that still imply an outdated production story. (REQ-3, REQ-4, REQ-5, F-2, F-3)
- [x] T-005: Run impact analysis on any shared symbols that need non-comment code edits, and record GitNexus blind spots where the index does not resolve cleanly. (REQ-1, REQ-3, REQ-8, F-1, F-2)

## Phase 2: Verification & Deprecation Cleanup
- [x] T-010: Rewrite or relabel outdated backend tests so the canonical production path and compatibility-only paths are clearly separated. (REQ-1, REQ-3, REQ-4, F-1, F-2)
- [x] T-011: Add or tighten backend assertions where the final verification matrix still has gaps across execution, reconciliation, retry, balance-pre-check, reschedule, workout, or boundary behavior. (REQ-1, REQ-2, REQ-6, F-1, F-4)
- [x] T-012: Update local docs and local closeout artifacts so they consistently describe the canonical backend path, compatibility seams, and deferred UI scope. (REQ-4, REQ-5, REQ-6, REQ-7, F-3, F-4)

## Deferred UI / Demo Work — Do Not Execute In This Page
- [ ] T-020: Add or validate admin UI route/component coverage for collection operations. (REQ-7)
- [ ] T-021: Add browser/e2e validation for the admin operator workflows. (REQ-7)
- [ ] T-022: Validate the stakeholder-facing demo flow against the final architecture. (REQ-7)

## Phase 3: Final Verification & Closeout
- [x] T-030: Re-fetch the Notion spec and linked implementation plan after implementation to confirm the final local closeout still matches the live page-15 contract, subject to the explicit UI deferral override. (REQ-5, REQ-6, REQ-7, F-3, F-4)
- [x] T-031: Run the focused backend verification slice that satisfies the final matrix. (REQ-1, REQ-2, REQ-8, F-1)
- [x] T-032: Run final `bun check`, `bun typecheck`, and `bunx convex codegen`. (REQ-8)
- [x] T-033: Create `gap-analysis.md` with explicit notes on verified backend scope, compatibility-only seams, and deferred UI/demo work. (REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, F-2, F-3, F-4)
- [ ] T-034: Present the gap analysis to the user. (REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, F-2, F-3, F-4)
