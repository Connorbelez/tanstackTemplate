# 01. Spec and Contract Cleanup — Tasks

> Spec: https://www.notion.so/337fc1b4402481db974fcf609859c7ba
> Generated: 2026-04-03
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD/design/tasks artifacts for this workstream without overwriting existing user-owned alignment docs. (F-1, REQ-1)
- [x] T-002: Confirm this workstream is contract/documentation cleanup only and does not require schema changes. (REQ-1, REQ-4)
- [x] T-003: Record the relevant contract surfaces and boundaries for downstream workstreams. (F-4, REQ-4)

## Phase 2: Backend Functions
- [x] T-010: Update payment interface comments so `PaymentMethod` is clearly transitional compatibility for legacy inbound collection flows. (UC-1, REQ-3, F-3)
- [x] T-011: Update transfer interface and adapter comments so `TransferProvider` is clearly canonical for new inbound provider work. (UC-1, REQ-2, F-2)
- [x] T-012: Update repo-facing backend-adjacent docs/comments to document the canonical production path and obligation-driven lifecycle boundary. (UC-2, REQ-4, F-4)
- [x] T-013: Run project lint and type/codegen verification required by AGENTS.md. (REQ-1, REQ-2, REQ-3, REQ-4)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify no frontend route/component changes are needed for this documentation-only cleanup. (REQ-1)

## Phase 4: E2E Tests
- [x] T-030: Assess whether any e2e coverage is applicable to the workstream. (UC-1, UC-2)
- [x] T-031: Document why e2e/browser coverage is not applicable for this docs-and-comments-only task. (UC-1, UC-2)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and compare the final repo wording against the current source of truth. (F-1, F-2, F-3, F-4)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4)
