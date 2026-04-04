# 04. Reconcile Collection Attempts with Transfer Execution and Cash Posting — Tasks

> Spec: https://www.notion.so/337fc1b4402481a48a13ee61e289e8f0
> Generated: 2026-04-03
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-04 reconciliation seam. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-002: Inventory the current attempt-linked inbound settlement, reversal, and bridge-era paths and document the canonical ownership rules in code comments or helper boundaries. (REQ-1, REQ-2, REQ-7, REQ-8, F-1, F-5)
- [x] T-003: Add any minimal persistence or audit metadata required for attempt-linked transfer reconciliation, while deferring broader schema cleanup to page 11. (REQ-1, REQ-6, REQ-9, F-1)

## Phase 2: Backend Functions
- [x] T-010: Run impact analysis on shared collection-attempt, transfer, and cash-posting symbols before modifying them. (REQ-1, REQ-2, REQ-4, REQ-7, F-1, F-2, F-4)
- [x] T-011: Implement a canonical transfer-outcome reconciliation coordinator that maps attempt-linked transfer confirmations, failures, cancellations, and reversals back into Collection Attempt GT events. (UC-1, UC-2, UC-3, REQ-1, REQ-2, REQ-6, REQ-7, F-1, F-3, F-4)
- [x] T-012: Refactor transfer settlement and reversal effects so attempt-linked inbound transfers delegate business meaning to the Collection Attempt path instead of creating a second inbound cash story. (UC-1, UC-3, REQ-2, REQ-4, REQ-5, REQ-7, F-2, F-4)
- [x] T-013: Enforce one canonical obligation-application and borrower-cash-posting trigger for confirmed attempt-linked inbound collections. (UC-1, REQ-3, REQ-4, REQ-5, F-2)
- [x] T-014: Remove or sharply fence the legacy bridge-transfer creation path in `emitPaymentReceived`, and update reconciliation or healing logic so it reflects the canonical attempt-linked flow. (UC-4, REQ-8, REQ-9, F-5)
- [x] T-015: Align failure and cancellation behavior across transfer and attempt lifecycles so retry semantics remain durable without posting money. (UC-2, REQ-1, REQ-6, F-3)
- [x] T-016: Align reversal semantics so attempt-linked transfer reversals cascade once through Collection Attempt reversal and ledger repair. (UC-3, REQ-7, F-4)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify that page 04 remains backend-only and identify any minimum admin/operator observability wrapper needed for later work without widening scope now. (REQ-6, REQ-9, F-1, F-3)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value, given that the critical delivery surface is backend reconciliation and settlement orchestration. (REQ-10, F-6)
- [x] T-031: Add backend integration coverage for the canonical async settlement path: transfer confirms later, linked Collection Attempt settles once, obligations apply once, and borrower cash journals once. (UC-1, REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-10, F-1, F-2, F-6)
- [x] T-032: Add backend integration coverage for failed or cancelled attempt-linked inbound transfers proving durable attempt failure semantics with no confirmed-money side effects. (UC-2, REQ-1, REQ-6, REQ-10, F-3, F-6)
- [x] T-033: Add backend integration coverage for attempt-linked inbound reversals proving one attempt reversal and one ledger-repair cascade. (UC-3, REQ-7, REQ-10, F-4, F-6)
- [x] T-034: Rewrite or relabel bridge-era tests so they either validate explicit compatibility handling or are replaced by canonical-flow coverage, and document why browser e2e is unnecessary if backend coverage is sufficient. (UC-4, REQ-8, REQ-9, REQ-10, F-5, F-6)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify the final code still matches the current page-04 contract. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
