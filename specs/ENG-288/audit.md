# Spec Audit: ENG-288 - Phase 8 — Signable docs, Documenso envelopes, and embedded signing

- Audit skill: `$linear-pr-spec-audit`
- Review target: scoped ENG-288 implementation files in the current worktree
- Last run: 2026-04-19 19:44:56 EDT
- Verdict: not ready

## Findings
- [high] The Linear validation contract is still not met because `bun run test` fails on this branch outside the signable-document scope. The original `convex/payments/__tests__/crons.test.ts` harness failure has been fixed, but the full suite still reports unrelated failures across payments cash-ledger queries and generation, admin origination, CRM saved views, admin record-sidebar behavior, and several import-path issues in webhook tests. This still blocks the managed requirement and definition-of-done item that call for `bun run test` to pass.
- [medium] The mandatory manual checkpoint remains unverified. The Documenso config drift between `.env.local` / `.env.local.example` (`DOCUMENSO_API_KEY`) and the provider code was fixed by adding `DOCUMENSO_API_KEY` fallback support, but no live Documenso-backed portal run has yet demonstrated that an eligible participant can launch embedded signing, complete at least one signature, refresh, and confirm that a non-recipient with deal access still cannot sign. The current worktree exposes one real browser login plus org switching, but not a second real login for the negative half of the live checkpoint.
- [low] The preferred external review step could not be collected because `coderabbit review --plain` still fails to start with `Review failed: Unknown error` on retry. This does not change the code evidence below, but it leaves the workflow without its expected third-party review summary.

## Coverage Summary
- SATISFIED: 11
- PARTIAL: 1
- MISSING: 0
- CONTRADICTED: 0
- UNVERIFIED: 1
- OUT_OF_SCOPE: 1

## Requirement Ledger
| Status | Bucket | Requirement | Evidence | Notes |
| --- | --- | --- | --- | --- |
| SATISFIED | data model | Add `signatureEnvelopes` with normalized status, sync metadata, and provider identifiers | `convex/schema.ts:692`, `convex/documents/contracts.ts` | Includes provider status, timestamps, last-error, and lookup indexes |
| SATISFIED | data model | Add `signatureRecipients` with canonical identity linkage, provider role, order, and status timestamps | `convex/schema.ts:708`, `convex/documents/contracts.ts` | Recipient rows persist `userId` for canonical recipient matching |
| SATISFIED | data model | Extend `generatedDocuments` with signing/archive-placeholder fields | `convex/schema.ts:2187`, `convex/documents/contracts.ts` | `finalPdfStorageId`, `completionCertificateStorageId`, `signingCompletedAt`, normalized `signingStatus` |
| SATISFIED | backend | Replace the placeholder signable branch with real generation, recipient resolution, envelope persistence, and status updates | `convex/documents/dealPackages.ts:715`, `convex/documents/dealPackages.ts:1136`, `convex/documents/dealPackages.ts:1202`, `convex/documents/dealPackages.ts:2193` | Includes retry handling and explicit `signature_pending_recipient_resolution` / `provider_error` paths |
| SATISFIED | integration | Introduce a backend `SignatureProvider` seam and Documenso implementation | `convex/documents/signature/provider.ts:97`, `convex/documents/signature/provider.ts:115`, `convex/documents/signature/documenso.ts:422` | Provider-specific behavior is isolated behind the seam |
| SATISFIED | auth | Embedded signing requires both deal access and canonical recipient match | `convex/documents/signature/sessions.ts:29`, `convex/documents/signature/sessions.ts:35`, `convex/documents/signature/sessions.ts:73` | Session issuance first gates on portal access, then rejects non-recipient viewers |
| SATISFIED | sync | Provider sync normalizes state back into canonical rows and surfaced statuses | `convex/documents/signature/webhooks.ts:15`, `convex/documents/signature/webhooks.ts:50`, `convex/documents/signature/webhooks.ts:68` | Sync updates envelope/recipient rows and mirrors provider failures as normalized state |
| SATISFIED | ui | Lender and admin deal surfaces show normalized signable rows, recipient chips, and operational controls without provider admin URLs | `src/components/lender/deals/LenderDealDetailPage.tsx:111`, `src/components/lender/deals/LenderDealDetailPage.tsx:413`, `src/components/admin/shell/dedicated-detail-panels.tsx:1160`, `src/components/admin/shell/dedicated-detail-panels.tsx:1390` | Portal uses backend actions for session issuance/sync and only shows viewer-appropriate actions |
| SATISFIED | negative contract | The frontend does not talk directly to Documenso and does not receive provider admin URLs | `src/components/lender/deals/LenderDealDetailPage.tsx:111`, `src/components/lender/deals/LenderDealDetailPage.tsx:114`, `convex/documents/signature/sessions.ts:95` | UI only calls backend actions and receives embedded session URLs |
| SATISFIED | tests | Backend and UI coverage exists for happy path, unresolved recipients, provider failure, access denial, sync normalization, and retry behavior | `src/test/convex/documents/dealPackages.test.ts`, `src/test/lender/deal-detail-page.test.tsx`, `src/test/admin/deal-dedicated-details.test.tsx` | Targeted signable tests pass |
| SATISFIED | regression | Existing phase-7 static and non-signable package behavior remains exercised | `src/test/convex/documents/dealPackages.test.ts` | The main package-materialization test still covers static and non-signable rows alongside signable additions |
| PARTIAL | validation | Required quality gates pass | `bunx convex codegen`, `bun check`, `bun typecheck` passed on 2026-04-19; `bun run test -- convex/payments/__tests__/crons.test.ts` and `bun run test -- src/test/convex/documents/dealPackages.test.ts` pass after the follow-up fixes | `bun run test` still fails in unrelated suites outside ENG-288 |
| UNVERIFIED | manual checkpoint | A human can complete live embedded signing and verify persistence plus non-recipient denial | no live execution evidence yet | Environment parity improved via `DOCUMENSO_API_KEY` fallback, but the end-to-end checkpoint still requires a real signable scenario plus a second real login for the non-recipient denial step |
| OUT_OF_SCOPE | archive behavior | Final signed artifact archival into platform storage | Linear issue scope, `convex/documents/signature/provider.ts:105` | Phase 9 owns consuming `downloadCompletedArtifacts` and storing final artifacts |

## Unresolved items
- Resolve or quarantine the unrelated full-suite `bun run test` failures outside ENG-288.
- Run the live manual checkpoint with a real signable deal, a real eligible recipient login, and a second real non-recipient login.
- Re-run the preferred external CodeRabbit review if the service becomes available.

## Next action
- Clear the broader repo-wide test failures, execute the live manual checkpoint, then rerun the audit and final artifact validation before marking ENG-288 complete.
