# Chunk 1: Pre-flight + Schema/Structure Verification

## Tasks

### T-001: Verify ENG-63/64 deliverables exist in codebase
- Check that these files/registrations exist:
  - `convex/payments/__tests__/crossEntity.test.ts`
  - `convex/payments/__tests__/endToEnd.test.ts`
  - `convex/payments/collectionAttempts/execute.ts` (or equivalent pipeline)
  - Effects registered in `convex/engine/effects/registry.ts`: `emitPaymentReceived`, `emitCollectionFailed`, `recordProviderRef`, `notifyAdmin`
- If any are missing, document as BLOCKER
- Check if `emitObligationOverdue` calls real `evaluateRules` or stub (Drift D2)

### T-002: Run full test suite
```bash
bun run test
```
- All tests must pass. Document any failures.

### T-003: Run lint, typecheck, codegen
```bash
bun check
bun typecheck
bunx convex codegen
```
- All must pass. Fix auto-fixable issues.

### T-004: DoD #12 — Schema audit against SPEC §9
- Read `convex/schema.ts` and compare the 4 payment tables against SPEC §9:
  - **obligations** (§9.1): GT fields, mortgageId, type union, amount, amountSettled, dueDate, gracePeriodEnd, sourceObligationId, createdAt, indexes
  - **collectionPlanEntries** (§9.2): obligationIds, amount, method, scheduledDate, status union, source union, ruleId, rescheduledFromId, createdAt, indexes
  - **collectionRules** (§9.3): name, trigger, condition, action, parameters, priority, enabled, createdAt, updatedAt, index
  - **collectionAttempts** (§9.4): GT fields, planEntryId, method, amount, providerRef, providerStatus, providerData, initiatedAt, settledAt, failedAt, failureReason, indexes
- Document: exact matches, accepted deviations (extra fields that improve querying), missing items
- Special attention: Does `collectionPlanEntries` have `by_obligation` index? (Drift D4)

### T-005: DoD #13 — File structure audit against SPEC §2
- Walk through SPEC §2 file tree and map each expected file to its actual location
- The `convex/engine/` prefix is an intentional architectural choice (Drift D3 — LOW)
- Document: present files, missing files, extra files not in spec
- Key missing items to verify were delivered by ENG-64:
  - `convex/payments/collectionAttempts/execute.ts`
  - `convex/payments/__tests__/crossEntity.test.ts`
  - `convex/payments/__tests__/endToEnd.test.ts`
