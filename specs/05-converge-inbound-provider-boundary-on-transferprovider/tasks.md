# 05. Converge Inbound Provider Boundary on TransferProvider — Tasks

> Spec: https://www.notion.so/337fc1b4402481ceb962ca7c2eada7af
> Generated: 2026-04-03
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-05 provider-boundary convergence pass. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-002: Inventory remaining `PaymentMethod`-first production, compatibility, test, and doc call sites and classify each one as canonical, compatibility-only, or candidate for immediate migration. (REQ-1, REQ-3, REQ-4, REQ-5, REQ-7, F-1, F-3, F-5)
- [x] T-003: Add any minimal deprecation or compatibility metadata needed to make the migration posture explicit without introducing new schema or runtime configuration. (REQ-5, REQ-8, F-3, F-6)

## Phase 2: Backend Functions
- [x] T-010: Run impact analysis on the shared provider interfaces, registries, and adapter surfaces before modifying them. (REQ-1, REQ-3, REQ-6, F-1, F-4)
- [x] T-011: Verify and enforce that canonical inbound execution paths resolve providers only through transfer-domain provider contracts and registries. (UC-1, REQ-1, REQ-2, REQ-6, F-1, F-2)
- [x] T-012: Remove, isolate, or freeze any remaining production inbound path that still resolves legacy `PaymentMethod` implementations directly. (UC-1, REQ-1, REQ-2, REQ-5, REQ-6, F-2, F-3)
- [x] T-013: Narrow `PaymentMethodAdapter` and the legacy methods registry so they read as explicit compatibility shims rather than normal provider-extension surfaces. (UC-2, REQ-3, REQ-5, REQ-8, F-3, F-4)
- [x] T-014: Update legacy manual and mock compatibility implementations so new work is steered toward `TransferProvider`-native paths. (REQ-4, REQ-5, REQ-8, REQ-9, F-3, F-4)
- [x] T-015: Preserve any still-legitimate compatibility use cases without allowing them to present `PaymentMethod` and `TransferProvider` as peer production architecture. (UC-2, REQ-5, REQ-9, F-3, F-6)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify that page 05 remains backend/docs/test convergence work with no route or UI changes required. (REQ-2, REQ-4, F-2, F-5)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value given that the delivery surface is backend/provider-boundary and documentation convergence. (REQ-10, F-5, F-6)
- [x] T-031: Expand or rewrite backend/provider tests so canonical inbound provider resolution uses `TransferProvider` terminology and behavior. (UC-1, REQ-1, REQ-4, REQ-6, REQ-7, F-1, F-4, F-5)
- [x] T-032: Relabel or restructure legacy `PaymentMethod` tests so they validate compatibility-only behavior instead of canonical architecture. (UC-2, REQ-5, REQ-7, REQ-9, F-3, F-5)
- [x] T-033: Update older end-to-end or cross-entity tests that still present `ManualPaymentMethod` as the primary inbound lifecycle story. (UC-3, REQ-4, REQ-7, F-5)
- [x] T-034: Update docs and examples so future contributors see a single canonical inbound provider boundary with a small explicit compatibility section. (UC-3, REQ-4, REQ-8, F-5, F-6)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify the final code still matches the current page-05 contract. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
