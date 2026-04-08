# 14. Preserve Mortgage Lifecycle and Ledger Boundaries — Tasks

> Spec: https://www.notion.so/337fc1b440248188a5cbf191c15cb468
> Generated: 2026-04-05
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Local Context & Boundary Audit
- [x] T-001: Capture local PRD, design, and task artifacts for page 14. (F-1, F-2, F-3, F-4)
- [x] T-002: Re-fetch the live page-14 Notion spec and linked implementation plan, then ground the local plan against current repo truth instead of older assumptions. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, F-1, F-2, F-4)
- [x] T-003: Inventory the current mortgage lifecycle, obligation effect, transfer effect, collection-attempt effect, and cash-ledger integration seams most likely to leak cross-domain behavior. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, F-1, F-2, F-4)
- [x] T-004: Run impact analysis on the shared mortgage and ledger boundary symbols before editing them, and record any GitNexus blind spots if the current index does not resolve the targets cleanly. (REQ-1, REQ-3, REQ-4, REQ-5, REQ-8, F-1, F-2, F-3)
- [x] T-005: Lock the specific invariants to enforce in code and tests: obligation-driven mortgage lifecycle, strategy-only plan entries, execution-only attempts, strategy-agnostic ledger meaning, and transfer-owned settlement lifecycle. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, F-1, F-2, F-4)

## Phase 2: Guardrail Implementation
- [x] T-010: Add or tighten code-level guardrails/comments/helpers around the mortgage lifecycle seam so only obligation-driven events mutate mortgage state. (REQ-1, REQ-2, REQ-7, F-1, F-4)
- [x] T-011: Add or tighten guardrails around collection-attempt and transfer settlement seams so strategy-layer entities do not directly create cash or lifecycle meaning. (REQ-2, REQ-4, REQ-5, REQ-7, F-1, F-2, F-4)
- [x] T-012: Review workout/reschedule/plan-entry paths and fence any hidden lifecycle shortcuts so strategy changes stay future-scheduling-only. (REQ-2, REQ-6, REQ-7, F-1, F-4)

## Phase 3: Regression Coverage
- [x] T-020: Add regression tests proving mortgage delinquency/cure still follow obligation-driven events only. (UC-1, REQ-1, REQ-8, F-1, F-3)
- [x] T-021: Add regression tests proving plan-entry creation/reschedule/cancellation and attempt initiation/failure alone do not mutate mortgage state. (UC-2, REQ-2, REQ-8, F-1, F-3)
- [x] T-022: Add regression tests proving transfer-confirmed and borrower cash-posting logic do not require strategy-layer awareness. (UC-3, REQ-3, REQ-4, REQ-5, REQ-8, F-2, F-3)
- [x] T-023: Add regression tests proving workout strategy changes future scheduling without bypassing obligation-driven lifecycle boundaries. (UC-4, REQ-6, REQ-8, F-1, F-3)

## Phase 4: Verification & Closeout
- [x] T-030: Re-fetch the Notion spec and linked implementation plan after implementation to confirm the final code still matches the live page-14 contract. (F-1, F-2, F-3, F-4)
- [x] T-031: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8)
- [ ] T-032: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8)
- [x] T-033: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8)
