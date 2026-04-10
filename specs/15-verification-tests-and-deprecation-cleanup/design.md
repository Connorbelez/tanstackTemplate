# 15. Verification, Tests, and Deprecation Cleanup — Design

> Derived from: https://www.notion.so/337fc1b4402481a5abd4c1804791ac9b

## Recommended Direction
Treat page 15 as the backend closeout page for the AMPS realignment. The core domain work is already in place across pages 02 through 14. The remaining work is to:
- prove the canonical backend path with one coherent verification matrix
- demote legacy bridge/manual stories so they are clearly compatibility-only
- align local docs and closeout artifacts with the actual shipped architecture

The linked Notion plan includes admin UI and demo validation, but the user has explicitly deferred all UI work to later dedicated execution pages. This local design therefore excludes route/component/browser/demo work and focuses only on backend verification plus docs cleanup.

## Verification Matrix To Lock

### Canonical backend path
- activation/bootstrap handoff uses the shared initial scheduling seam
- due runner executes only through `executePlanEntry`
- execution creates one attempt, hands off to transfers, and settles through the canonical spine
- reconciliation and cash posting complete without requiring strategy-layer ownership

### Follow-on collection behaviors
- retry remains driven by failed execution outcomes
- late-fee remains obligation-driven rather than plan-entry-driven
- balance pre-check blocks or defers before attempt creation
- reschedule preserves lineage while replacing strategy entries
- workout ownership governs future scheduling without mutating obligation truth

### Boundary invariants
- mortgage lifecycle stays obligation-driven
- strategy-layer entities stay strategy-only
- transfer/provider lifecycle remains transfer-owned
- cash/ledger meaning remains obligation- and transfer-driven

## Cleanup Targets

### Primary test/doc surfaces
- [execution.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/collectionPlan/__tests__/execution.test.ts)
- [runner.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/collectionPlan/__tests__/runner.test.ts)
- [crossEntity.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/test/convex/payments/crossEntity.test.ts)
- [endToEnd.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/test/convex/payments/endToEnd.test.ts)
- [bridge.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/transfers/__tests__/bridge.test.ts)
- [inboundFlow.integration.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/transfers/__tests__/inboundFlow.integration.test.ts)
- [active-mortgage-payment-system-alignment-2026-04-03.md](/Users/connor/Dev/tanstackFairLend/fairlendapp/specs/active-mortgage-payment-system-alignment-2026-04-03.md)

### What to change
- keep the production-path tests and strengthen them only where the verification matrix still has holes
- relabel old manual/bridge tests as compatibility-only if they remain justified
- remove or rewrite comments that still describe bridge/manual compatibility as the production path
- add local closeout notes explaining why UI/admin/demo verification is intentionally deferred

## Implementation Strategy

### Phase 1: Build the local verification matrix
- map the alignment-report findings and page-15 requirements onto existing backend test files
- identify missing scenarios versus scenarios that already exist in page-02 through page-14 coverage
- prefer reuse of existing regression suites over introducing a second overlapping mega-suite

### Phase 2: Rewrite or relabel outdated coverage
- rename legacy manual/mock-pad suites so they read as compatibility coverage
- reframe bridge tests as compatibility/guardrail coverage, not canonical flow proof
- tighten older inbound-flow comments to reflect the post-page-03/page-04 architecture

### Phase 3: Final backend verification
- run the focused collection-plan, transfer, cross-entity, boundary, and end-to-end backend slices that together satisfy the verification matrix
- keep page-14 boundary tests in the final slice so page 15 closes the loop on architectural guardrails

### Phase 4: Documentation and closeout
- update local specs/gap analyses to reflect the final backend-only scope
- explicitly map remaining alignment findings to implemented verification or intentional compatibility/deferred scope
- document that UI/demo validation is deferred to later execution pages

## Test Design
- prefer existing backend integration suites over new duplicated end-to-end files
- add only narrow new assertions where the current suites still fail to prove a requirement
- keep compatibility-only tests small and clearly named
- do not add browser or route-level coverage in this page

## Decision Bias
- favor relabeling and consolidating existing tests over inventing a parallel harness
- treat compatibility coverage as allowed but secondary
- preserve the canonical backend story in both tests and docs
