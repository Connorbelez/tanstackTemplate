# ENG-282 Phase 2 Canonical Borrower/Property/Mortgage Activation Without Payments

## Goal

Ship the phase-2 origination commit path so `/admin/originations/$caseId` can convert a staged origination case into canonical `borrowers`, `properties`, `mortgages`, `mortgageBorrowers`, appraisal/valuation, ledger genesis, and audit rows without creating payment schedules or marketplace listing artifacts.

## Constraints From Spec

- Commit must be idempotent by workflow source.
- Borrower resolution must look up existing `users` by email, provision/invite through WorkOS when missing, and never write `users` directly.
- If a WorkOS user was provisioned but the Convex `users` row is not synced yet, commit must stop at `awaiting_identity_sync` before canonical writes.
- Borrower reuse must fail closed across organizations.
- There must never be multiple borrower rows for the same `userId` within one org.
- Canonical mortgage activation must create the mortgage directly in `active` state with the exact machine/collection defaults from the issue.
- The activation path must call the existing ownership-ledger genesis primitive.
- Phase 2 must write origination audit entries instead of faking a governed transition.
- Listing projection, public docs sync, and payment bootstrap remain future seams.

## Architecture

### 1. Canonical origination commit orchestration

- Add `convex/admin/origination/commit.ts` as the single phase-2 orchestration surface.
- Expose:
  - `commitCase` public mutation guarded by `requirePermission("mortgage:originate")`
  - focused local helpers for loading viewer/case context, validating commit eligibility, and short-circuiting idempotent replays
- Responsibilities:
  - assert org access
  - reject incomplete stage data using persisted validation
  - resolve/provision borrower identities
  - stop at `awaiting_identity_sync` when any provisioned identity is not yet represented in `users`
  - activate canonical borrower/property/mortgage state exactly once
  - patch the origination case with `status`, `committedMortgageId`, and `committedAt`

### 2. Borrower identity resolution seam

- Add `convex/borrowers/resolveOrProvisionForOrigination.ts`.
- Provide a testable helper that:
  - normalizes borrower emails
  - finds existing Convex `users` by normalized email
  - provisions a WorkOS user when none exists
  - rechecks Convex `users` after provisioning
  - returns either:
    - `ready` with canonical `userId`
    - `awaiting_identity_sync` with WorkOS `userId`
- Also handle canonical borrower lookup/creation:
  - reuse same-org borrower for same `userId`
  - reject a borrower linked to the same `userId` in another org
  - create a new borrower only when no borrower exists for that `userId`

### 3. Canonical mortgage activation seam

- Add:
  - `convex/mortgages/provenance.ts`
  - `convex/mortgages/valuation.ts`
  - `convex/mortgages/activateMortgageAggregate.ts`
- `activateMortgageAggregate` owns canonical write order:
  1. resolve or create property
  2. create valuation/appraisal snapshot
  3. insert mortgage directly in `active`
  4. create `mortgageBorrowers`
  5. call ledger genesis primitive (`mintMortgage`)
  6. write origination audit
- Add provenance fields/indexes needed for idempotent workflow-source lookup on borrowers and mortgages.

### 4. UI completion

- Update the review step and workspace page so commit is real:
  - enable commit when staged validation is clear
  - show in-flight / awaiting-identity-sync / committed / failed states
  - redirect to `/admin/mortgages/$recordid` after success
  - surface linked borrower/property/mortgage references after commit returns
- Preserve saved review semantics: review reads persisted case payload, not optimistic unsaved edits.

### 5. Documentation

- Extend `docs/architecture/admin-origination-workspace.md` with phase-2 commit behavior, statuses, idempotency, and future seams.
- Add backend comments only where the write ordering or idempotency logic is non-obvious.

## Blast Radius Checkpoints

Manual blast radius inspection is required in this session because GitNexus tools are not exposed.

- Before editing `convex/schema.ts`: check all current borrower/mortgage/appraisal consumers.
- Before editing `convex/admin/origination/cases.ts` or UI workflow files: check existing phase-1 tests and route consumers.
- Before editing mortgage detail context: check `src/components/admin/shell/dedicated-detail-panels.tsx` and related CRM detail queries.

## Test-First Sequence

### Backend tests

- Extend `src/test/convex/admin/origination/cases.test.ts` for:
  - real commit idempotency
  - awaiting identity sync short-circuit
  - no duplicate canonical writes on replay
  - committed case metadata
- Add `src/test/convex/admin/origination/commit.test.ts` for:
  - happy-path canonical activation
  - same-org borrower reuse
  - cross-org borrower fail-closed
  - property reuse vs creation
  - valuation snapshot creation
  - ledger mint invocation effect
  - audit row creation
- Add `src/test/convex/borrowers/resolveOrProvisionForOrigination.test.ts` for WorkOS-backed identity resolution behavior.

### UI tests

- Extend `src/test/admin/origination/origination-workflow.test.tsx` for:
  - commit enabled when validation passes
  - review copy/state for awaiting identity sync
  - review copy/state for committed redirect contract
- Add focused tests for any new workspace commit-state helper if extracted.

## Files Expected To Change

- Update: `convex/schema.ts`
- Update: `convex/test/moduleMaps.ts`
- Update: `convex/admin/origination/cases.ts`
- Add: `convex/admin/origination/commit.ts`
- Add: `convex/borrowers/resolveOrProvisionForOrigination.ts`
- Add: `convex/mortgages/activateMortgageAggregate.ts`
- Add: `convex/mortgages/provenance.ts`
- Add: `convex/mortgages/valuation.ts`
- Update: `convex/engine/effects/workosProvisioning.ts`
- Update: `src/components/admin/origination/OriginationWorkspacePage.tsx`
- Update: `src/components/admin/origination/ReviewStep.tsx`
- Update: `src/components/admin/origination/workflow.ts`
- Update: `src/lib/admin-origination.ts`
- Update: `docs/architecture/admin-origination-workspace.md`
- Add or update: origination backend and UI tests under `src/test/convex/admin/origination` and `src/test/admin/origination`

## Verification Bar

- `bun check`
- `bunx convex codegen`
- `bun typecheck`
- Focused origination tests
- `coderabbit review --plain`

## Definition Of Done

- Commit from the origination review step creates canonical borrower/property/mortgage artifacts exactly once.
- Missing user sync stops safely in `awaiting_identity_sync` with zero canonical writes.
- Mortgage detail page becomes the post-commit landing surface.
- Ownership ledger genesis and origination audit are written.
- Tests and docs cover the new phase-2 contract.
