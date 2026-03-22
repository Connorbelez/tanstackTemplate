# Chunk 02: Integration Functions & Query Enrichment

## Tasks

- [ ] **T-006**: Create `postToSuspense` helper function in `convex/payments/cashLedger/integrations.ts`
  - Private async function (not exported — only used by the fallback wrapper)
  - Creates SUSPENSE account via `getOrCreateCashAccount(ctx, { family: "SUSPENSE", mortgageId })`
  - Creates CASH_CLEARING account via `getOrCreateCashAccount(ctx, { family: "CASH_CLEARING", mortgageId })`
  - Posts `SUSPENSE_ROUTED` entry via `postCashEntryInternal`
  - Logs audit event `cashLedger.suspense_routed` via `auditLog.log`
  - Returns the posting result

- [ ] **T-007**: Create `postCashReceiptWithSuspenseFallback` exported function in `convex/payments/cashLedger/integrations.ts`
  - Accepts: `{ obligationId?, mortgageId?, amount, idempotencyKey, effectiveDate?, attemptId?, source, mismatchReason? }`
  - Happy path: if obligationId provided AND obligation exists, delegate to `postCashReceiptForObligation`
  - Fallback: route to `postToSuspense` with diagnostic metadata (reason, originalObligationId, originalAmount)
  - Idempotency key for suspense: `suspense-routed:{originalKey}`

- [ ] **T-008**: Enrich `getSuspenseItems()` in `convex/payments/cashLedger/queries.ts`
  - Add `createdAt: account._creationTime` to the returned object
  - Add `ageMs: Date.now() - account._creationTime` computed field
  - This supports escalation workflow visibility for ENG-169

- [ ] **T-009**: Run quality gates: `bunx convex codegen && bun check && bun typecheck && bun run test`

## Quality Gate
All 4 commands must pass: codegen, check, typecheck, test
