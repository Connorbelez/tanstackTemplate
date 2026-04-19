# Tasks: ENG-288 - Phase 8 — Signable docs, Documenso envelopes, and embedded signing

## Status Rules
- Keep task IDs stable.
- Add new tasks before editing newly discovered scope.
- Do not silently drop tasks; mark them complete or note the blocker.

## Phase 1: Planning
- [x] T-001: Finalize the implementation task list, chunk plan, and execution artifacts for `specs/ENG-288/`

## Phase 2: Schema and Provider Contracts
- [x] T-010: Extend `convex/schema.ts` and `convex/documents/contracts.ts` for signature envelopes, signature recipients, additive generated-document signing fields, and any normalized signing status changes.
- [x] T-020: Add `convex/documents/signature/provider.ts` and `convex/documents/signature/documenso.ts` for the backend signature seam, Documenso adapter, and shared status normalization helpers that reuse `convex/documentEngine/generation.ts`.

## Phase 3: Package Generation and Signing Backend
- [x] T-030: Rework `convex/documents/dealPackages.ts` so `private_templated_signable` blueprints generate PDFs, resolve recipients, create envelopes, persist normalized rows, and set accurate instance/package statuses.
- [x] T-040: Add embedded signing session issuance and idempotent provider sync or webhook handling in `convex/documents/signature/sessions.ts` and `convex/documents/signature/webhooks.ts`, including conservative retry and replacement rules.

## Phase 4: Reads and UI
- [x] T-050: Extend `convex/documents/dealPackages.ts` and `convex/deals/queries.ts` read surfaces to expose signable envelope state, recipient state, sync metadata, errors, and viewer action eligibility.
- [x] T-060: Replace the lender portal signable placeholder in `src/components/lender/deals/LenderDealDetailPage.tsx` with normalized rows, recipient chips, embedded signing launch, and status refresh behavior.
- [x] T-070: Replace the admin signable placeholder in `src/components/admin/shell/dedicated-detail-panels.tsx` with normalized envelope details, retry or sync actions, and recipient-level operational state.

## Phase 5: Tests and Validation
- [x] T-080: Update backend tests for signable generation, unresolved recipients, provider failures, session access control, sync normalization, and retry behavior.
- [x] T-090: Update lender/admin UI tests and supporting test helpers for the new signable surfaces and recipient-aware actions.
- [x] T-100: Add or update e2e/manual verification support for the signable checkpoint, or record why live-signing automation is not practical in this worktree.
- [ ] T-900: Run `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test`, and any targeted e2e coverage added for this issue.
  Blocked because `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test -- convex/payments/__tests__/crons.test.ts`, and `bun run test -- src/test/convex/documents/dealPackages.test.ts` now pass, but the full `bun run test` suite still fails in unrelated areas and the live manual Documenso checkpoint remains open.

## Phase 9: Audit
- [x] T-910: Run `$linear-pr-spec-audit` against the current branch diff for ENG-288 and persist the verdict to `specs/ENG-288/audit.md`.
- [x] T-920: Resolve audit findings or record blockers in `audit.md`, `status.md`, and the final report.
