# 11. Align Payment Schemas with Target Contract — Tasks

> Spec: https://www.notion.so/337fc1b44024814c9598f556312c62e9
> Generated: 2026-04-05
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Contract Inventory
- [x] T-001: Capture local PRD, design, and task artifacts for the page-11 schema-alignment pass. (F-1, F-2, F-3, F-4, F-5)
- [x] T-002: Inventory the current `collectionPlanEntries`, `collectionAttempts`, and `collectionRules` shapes against the live schema page and linked implementation plan so only real remaining drift is targeted. (REQ-1, REQ-2, REQ-4, REQ-7, REQ-8, F-1, F-2, F-3)
- [x] T-003: Run impact analysis on `convex/schema.ts`, collection-plan execution consumers, attempt/reconciliation consumers, and rule-model consumers before editing them. GitNexus could not resolve the shared schema file-path targets cleanly, so I recorded that fallback and compensated with focused regression coverage plus final `detect_changes` review. (REQ-8, REQ-10, F-1, F-2, F-3, F-4)
- [x] T-004: Lock the target page-11 contract decisions for `mortgageId` snapshots, canonical lineage naming, and attempt-transfer linkage without introducing redundant aliases. (REQ-2, REQ-4, REQ-5, REQ-6, REQ-8, REQ-9, F-1, F-2)

## Phase 2: Schema Alignment
- [x] T-010: Align `collectionPlanEntries` with the target contract, including direct business-context fields, clearer strategy lineage, and canonical execution metadata naming. (REQ-1, REQ-2, REQ-3, REQ-8, F-1, F-4)
- [x] T-011: Align `collectionAttempts` with the target business-owned execution contract, including stable mortgage/obligation snapshots and clearer lifecycle/reconciliation metadata. (REQ-4, REQ-5, REQ-6, REQ-8, F-2, F-4)
- [x] T-012: Converge `collectionRules` on the typed/admin-operable contract and fence or remove weaker legacy dual-shape semantics. (REQ-7, REQ-8, REQ-9, F-3, F-4)
- [x] T-013: Update schema indexes where the aligned contract needs new query surfaces for admin inspection or execution/reconciliation lookup. (REQ-3, REQ-5, REQ-10, F-1, F-2, F-4)

## Phase 3: Consumer Migration
- [x] T-020: Update collection-plan execution, retry, reschedule, balance pre-check, and workout consumers to the converged plan-entry contract. (REQ-1, REQ-2, REQ-3, REQ-10, F-1, F-4)
- [x] T-021: Update attempt creation, transfer reconciliation, cash-posting, webhook, and inspection consumers to the converged attempt contract. (REQ-4, REQ-5, REQ-6, REQ-10, F-2, F-4)
- [x] T-022: Update rule seeds, rule engine, and any admin-facing or query-facing rule consumers to the converged typed rule contract. (REQ-7, REQ-8, REQ-10, F-3, F-4)
- [x] T-023: Remove or clearly fence transitional field meanings so downstream code is not left reading both old and new schema semantics as peers. (REQ-8, REQ-9, REQ-10, F-4)

## Phase 4: Verification Coverage
- [x] T-030: Assess whether browser e2e adds value for page 11; backend contract and integration coverage was sufficient, and no page-11 UI change forced browser e2e. (REQ-10, F-4, F-5)
- [x] T-031: Add contract coverage for the final `collectionPlanEntries`, `collectionAttempts`, and `collectionRules` shapes and their canonical field meanings. (REQ-1, REQ-4, REQ-7, REQ-8, REQ-10, F-1, F-2, F-3)
- [x] T-032: Add regression coverage proving execution, reconciliation, and rule consumers still behave correctly after the schema cleanup. (REQ-1, REQ-4, REQ-5, REQ-7, REQ-10, F-1, F-2, F-3, F-4)
- [x] T-033: Add coverage for lineage clarity across retry, reschedule, and workout-owned entries now that the field contract distinguishes `retryOfId` from `rescheduledFromId`. (REQ-2, REQ-8, REQ-10, F-1, F-4)

## Phase 5: Verification & Closeout
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify final code still matches the current page-11 contract. Revalidated through the Notion connector during closeout. (F-1, F-2, F-3, F-4, F-5)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
