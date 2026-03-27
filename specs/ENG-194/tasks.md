# Tasks: ENG-194 — Implement Transfer Effect Handlers

Source: Linear ENG-194, Notion implementation plan
Generated: 2026-03-27

## Phase 1: Transfer Effect Test Coverage
- [x] T-001: Verify `convex/engine/effects/transfer.ts` and `convex/engine/effects/registry.ts` satisfy the ENG-194 behavior contract, and confirm the exact coverage gap in `convex/engine/effects/__tests__/transfer.test.ts`.
- [x] T-002: Replace the current shallow `convex/engine/effects/__tests__/transfer.test.ts` assertions with `convex-test` integration coverage that invokes the real transfer effect internal mutations against a harnessed Convex runtime.
- [x] T-003: Add coverage proving a non-bridged confirmed inbound transfer creates exactly one `CASH_RECEIVED` journal entry with matching `transferRequestId`, and a non-bridged confirmed outbound transfer creates exactly one `LENDER_PAYOUT_SENT` journal entry with matching `transferRequestId`.
- [x] T-004: Add coverage proving a reversed transfer creates exactly one `REVERSAL` journal entry linked via `causedBy`, while bridged transfers skip duplicate cash posting and bridged reversal skips cash reversal when no transfer-backed journal entry exists.
- [x] T-005: Add coverage for error and metadata paths: non-bridged confirmed transfers without direction fail loudly, non-bridged reversals without an original journal entry fail closed, `recordTransferProviderRef` patches `providerRef`, and `publishTransferFailed` patches failure metadata.

## Phase 2: Verification & Quality Gates
- [x] T-006: Run targeted verification for `convex/engine/effects/__tests__/transfer.test.ts` and any affected cash-ledger suites, fixing regressions if the stronger transfer-effect coverage exposes them.
- [x] T-007: Run `bun check`, `bun typecheck`, and `bunx convex codegen` and resolve any failures required to consider ENG-194 complete.
- [ ] T-008: Run `coderabbit review --plain` after the implementation and quality gates complete, and address any high-signal issues that materially affect ENG-194. Blocker: CodeRabbit review timed out after entering the review phase and returned no findings.
