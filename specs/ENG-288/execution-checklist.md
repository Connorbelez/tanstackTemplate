# Execution Checklist: ENG-288 - Phase 8 — Signable docs, Documenso envelopes, and embedded signing

## Requirements From Linear
- [x] Add `signatureEnvelopes` with normalized envelope status, provider identifiers, sync timestamps, and last-error metadata plus deal/provider lookup indexes.
- [x] Add `signatureRecipients` with provider recipient identifiers, normalized recipient status and timestamps, signing order, provider role, and a canonical platform-identity link for recipient matching.
- [x] Extend `generatedDocuments` with `finalPdfStorageId`, `completionCertificateStorageId`, and `signingCompletedAt`, and reconcile its signing-status vocabulary with provider failure handling.
- [x] Replace the placeholder-only signable branch in `convex/documents/dealPackages.ts` with real signable generation, envelope creation, recipient persistence, and signable instance status updates.
- [x] Update package summarization and retry semantics so signable rows participate in `ready`, `partial_failure`, and `failed` outcomes.
- [x] Introduce `SignatureProvider` and a Documenso-backed implementation that consumes the existing `documensoConfig` output from `convex/documentEngine/generation.ts`.
- [x] Add backend embedded-signing session issuance guarded by both `assertDealAccess` and canonical recipient matching, returning only session URL and expiry metadata.
- [x] Add idempotent provider webhook or sync handling that mirrors canonical status into `signatureEnvelopes`, `signatureRecipients`, `generatedDocuments.signingStatus`, and `dealDocumentInstances.status`.
- [x] Replace lender/admin reserved signable placeholders with normalized signable rows, recipient chips, and admin operational controls.
- [x] Add backend and UI coverage for successful signing, unresolved recipient resolution, provider failures, access denial, and retry behavior.
- [ ] Validate the work with `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test`, and the manual signing checkpoint.
  Blocked because `bunx convex codegen`, `bun check`, and `bun typecheck` pass, and the previously-audited `convex/payments/__tests__/crons.test.ts` failure is fixed, but `bun run test` still fails outside ENG-288 in multiple unrelated suites and the live manual Documenso checkpoint has not been executed.

## Definition Of Done From Linear
- [x] Locking a deal with at least one `private_templated_signable` blueprint creates a generated PDF, a signature envelope row, recipient rows, and a signable document instance.
- [x] An eligible deal participant who matches a persisted signature recipient can launch embedded signing from the portal without receiving a provider admin URL.
- [x] A user who has deal access but is not a matching recipient cannot start signing.
- [x] Provider webhook or sync updates persist across refresh, reconnect, and repeated portal sessions.
- [x] Lender and admin deal surfaces show normalized signable statuses, recipient chips, envelope-level error and sync metadata, and only the actions appropriate to the viewer.
- [x] Retry flows are idempotent and auditable and do not create duplicate live envelopes without explicit replacement logic.
- [x] `generatedDocuments` stores provider linkage and the additive archive-placeholder fields that Phase 9 will consume.
- [x] Existing Phase 7 static and non-signable package behavior remains green.
- [ ] `bunx convex codegen`, `bun check`, `bun typecheck`, and `bun run test` all pass.
  `bunx convex codegen`, `bun check`, and `bun typecheck` pass. `bun run test -- convex/payments/__tests__/crons.test.ts` and `bun run test -- src/test/convex/documents/dealPackages.test.ts` pass, but `bun run test` still fails in unrelated suites on this branch.
- [ ] Manual verification passes: lock a listing, open the deal portal as an eligible participant, launch embedded signing, complete at least one signature, refresh, and confirm non-recipient denial.
  Live Documenso-backed manual verification has not been run from this worktree. The Documenso env-name drift was fixed by accepting `DOCUMENSO_API_KEY`, but the full checkpoint still needs a real signable scenario plus a second real non-recipient login.

## Agent Instructions
- Keep this file current as work progresses.
- Do not mark an item complete unless code, tests, and validation support it.
- If an item is blocked or inapplicable, note the reason directly under the item.

## Test Coverage Expectations
- [x] Unit tests are added or updated for signable schema/contracts, package generation, session authorization, sync normalization, and retry behavior.
- [x] E2E coverage is added or updated for the signable deal workflow, or the exact limitation is recorded if a live Documenso flow cannot be automated from this worktree.
  No new Playwright coverage was added because the real embedded-signing flow depends on a live Documenso session and authenticated deal-portal identities that are not reproducible in this worktree. Targeted backend and UI tests cover the normalized contract and portal gating paths.
- [x] Storybook updates are explicitly recorded as not applicable unless reusable deal-surface story coverage already exists in-repo.
  Not applicable. The work changes page-local lender/admin deal surfaces rather than introducing new reusable component-library primitives.

## Final Validation
- [ ] All requirements are satisfied.
- [ ] All definition-of-done items are satisfied.
- [ ] Required quality gates passed.
- [x] Test coverage expectations were met or explicitly justified.
- [x] Final `$linear-pr-spec-audit` review passed or blockers are explicitly recorded.
