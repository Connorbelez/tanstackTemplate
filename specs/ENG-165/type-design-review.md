# ENG-165 Type Design Analysis: Transfer Reconciliation

## Type: `TransferHealingCandidate` (transferHealingTypes.ts)

### Invariants Identified
- Must reference a valid transferRequest
- `direction` is constrained to "inbound" | "outbound"
- `confirmedAt` is a unix timestamp (number), no compile-time temporal guarantee
- `mortgageId` and `obligationId` are both optional independently

### Ratings
- **Encapsulation**: 5/10
  Plain interface with no behavior. All fields publicly accessible. This is a DTO, which is acceptable for a data-transit type, but it carries no validation.

- **Invariant Expression**: 4/10
  `amount` is `number` -- no guarantee it is positive, integer, or in cents. `confirmedAt` is just `number` -- could be negative or zero. The optionality of `mortgageId` and `obligationId` creates ambiguity: can both be undefined simultaneously? The escalation path in `retriggerTransferConfirmation` explicitly checks `if (!args.mortgageId)` and logs an error, suggesting that `mortgageId` is *effectively* required for successful healing. The type does not express this.

- **Invariant Usefulness**: 6/10
  The direction discriminant is good and prevents bad states. The Id types on references enforce relational integrity.

- **Invariant Enforcement**: 3/10
  No construction-time validation. Any code can create a `TransferHealingCandidate` with `amount: -1` or `confirmedAt: 0`. The `findOrphanedConfirmedTransfersForHealing` query does filter at runtime, but nothing stops callers from constructing invalid candidates in tests or other paths.

### Concerns
1. **`amount: number` is dangerously loose for a financial system.** This is a cents-denominated integer value, but the type permits `0.5`, `-100`, or `NaN`. Consider a branded type like `CentsAmount` or at minimum a runtime assertion.
2. **`mortgageId` optionality hides a business rule.** The cron handler's escalation path *requires* a mortgageId to create a SUSPENSE account. A candidate without a mortgageId will hit the error path and produce an incomplete escalation. The type should either make `mortgageId` required, or the healing pipeline should explicitly model the "unresolvable orphan" case as a separate discriminated variant.

---

## Type: `TransferHealingResult` (transferHealingTypes.ts)

### Invariants Identified
- `candidatesFound >= retriggered + escalated` (implicit, unenforced)
- `checkedAt` is a timestamp
- All counts are non-negative (unenforced)

### Ratings
- **Encapsulation**: 5/10 -- Simple DTO, acceptable.
- **Invariant Expression**: 4/10 -- The relationship `candidatesFound >= retriggered + escalated` is invisible. There are also "skipped" candidates (already escalated) that are counted in `candidatesFound` but appear in neither `retriggered` nor `escalated`.
- **Invariant Usefulness**: 6/10 -- Good for observability/logging.
- **Invariant Enforcement**: 3/10 -- No validation that counts are consistent.

### Recommended Improvement
~~Add a `skipped` count to make the invariant `candidatesFound === retriggered + escalated + skipped` expressible and verifiable via an assertion in the cron handler.~~ **DONE** -- `skipped` is already present in `TransferHealingResult` (`convex/payments/cashLedger/transferHealingTypes.ts`).

---

## Type: `transferHealingAttempts` Schema Table (schema.ts)

### Invariants Identified
- `status` is a proper discriminated union: `"retrying" | "escalated" | "resolved"`
- `escalatedAt` is optional, presumably only set when `status === "escalated"`
- `attemptCount` must be a positive integer (unenforced at schema level)
- One record per transferRequest (enforced by query patterns, not schema)

### Ratings
- **Encapsulation**: 6/10
  Convex schema validators provide good runtime enforcement. The `v.union(v.literal(...))` pattern is the right approach for status fields.

- **Invariant Expression**: 5/10
  The relationship between `status` and `escalatedAt` is not enforced. A record with `status: "retrying"` and `escalatedAt: 1234` is valid per the schema. A discriminated union at the schema level (e.g., separate shapes per status) would be ideal but Convex `defineTable` does not support it. The code does maintain this invariant correctly in practice.

- **Invariant Usefulness**: 8/10
  The status union prevents invalid status strings. The `by_transfer_request` index enables the one-per-transfer lookup pattern.

- **Invariant Enforcement**: 6/10
  The `v.union` validator catches bad status strings at write time. However, there is no unique constraint on `transferRequestId` -- the code uses `.first()` which works only if there is at most one. A second insert for the same transfer would silently create a duplicate, and the `.first()` query would return an arbitrary one.

### Concerns
1. **No unique constraint on `transferRequestId`.** If two cron runs race, both could insert a new record for the same transfer. The code uses `if (existing)` / `else insert`, but without transactional guarantees on the query+insert pair within the same mutation, duplicates are possible. Since Convex mutations are serialized, this is safe *within a single mutation*, but the cron action calls `retriggerTransferConfirmation` in a loop -- each is a separate mutation. Two cron action runs could interleave.
2. **`status: "resolved"` is never set in the code.** The status union includes `"resolved"` but no code path ever transitions to it. This is likely forward-looking, but dead enum values create confusion.

---

## Type: `transferRequests` Schema Table (schema.ts diff)

### Invariants Identified
- `status` extended with `"confirmed" | "reversed"` (good -- models transfer lifecycle)
- `direction` is optional with union constraint
- `amount`, `currency`, `confirmedAt`, `reversedAt` are all optional
- Multiple optional Id references (`mortgageId`, `obligationId`, `lenderId`, `borrowerId`, `dispersalEntryId`)

### Ratings
- **Encapsulation**: 5/10
  Fields are appropriately typed but the extreme optionality makes the type very permissive.

- **Invariant Expression**: 3/10
  This is the weakest type in the PR. A transfer in `"confirmed"` status should *always* have `confirmedAt`, `direction`, and `amount`, but the schema permits a confirmed transfer with all three undefined. The reconciliation check functions (`transferReconciliation.ts` lines 109-115) defensively skip records where these are missing ("Skip legacy stubs missing direction or amount"), acknowledging the schema is too loose. Similarly, `reversedAt` should be required when `status === "reversed"`.

- **Invariant Usefulness**: 5/10
  The direction union and Id-typed references are good. But the optionality undermines most guarantees.

- **Invariant Enforcement**: 3/10
  The Convex validators catch type errors (string vs number), but cannot enforce status-dependent required fields. The code compensates with runtime null checks scattered across every consumer.

### Concerns
1. **Status-dependent fields are all optional.** This is the classic "flat union" anti-pattern. A confirmed transfer without `confirmedAt` is a nonsensical state, yet the schema allows it. Every consumer must defensively check.
2. **`direction` being optional means every reconciliation function must guard against it.** This field is essential to the business logic (determines journal entry type mapping), yet it can be undefined.
3. **`amount` is `v.optional(v.number())`.** For a financial transfer, the amount should never be undefined once the transfer is past the "pending" state. The `?? 0` fallbacks in `checkStaleOutboundTransfers` (lines 260-261) are especially dangerous -- treating a missing amount as zero cents silently hides data issues.

### Recommended Improvement
Since Convex does not support discriminated unions in `defineTable`, consider:
1. A TypeScript-level discriminated union type for the *application layer* that narrows the DB record after fetching:
```ts
type ConfirmedTransfer = { status: "confirmed"; direction: "inbound" | "outbound"; amount: number; confirmedAt: number; /* ... */ };
type ReversedTransfer = { status: "reversed"; direction: "inbound" | "outbound"; amount: number; reversedAt: number; /* ... */ };
type TransferRequest = PendingTransfer | ConfirmedTransfer | ReversedTransfer | /* ... */;
```
2. A `narrowTransferRequest(doc)` function that validates and narrows, throwing on impossible states rather than silently skipping.

---

## Type: Reconciliation Item Types (transferReconciliation.ts)

### Types: `OrphanedConfirmedTransferItem`, `OrphanedReversedTransferItem`, `StaleOutboundTransferItem`, `TransferAmountMismatchItem`

### Invariants Identified
- `ageDays >= 0` (unenforced)
- `amount > 0` for orphaned items (unenforced)
- `expectedIdempotencyKey` follows a specific format (string, unenforced)
- `differenceCents !== 0` for mismatch items (enforced by check logic)

### Ratings
- **Encapsulation**: 5/10 -- DTOs, acceptable.
- **Invariant Expression**: 6/10 -- The item types are well-structured and clearly named. Each captures the specific diagnostic data needed for its check. The `direction` discriminant is consistently present.
- **Invariant Usefulness**: 8/10 -- These types serve a clear diagnostic purpose. They carry exactly the data needed for investigation and remediation.
- **Invariant Enforcement**: 4/10 -- Construction happens only in the check functions, which do validate. But the types themselves do not enforce anything.

### Strengths
- Clear, purpose-specific naming
- Consistent structure across all four item types (transferRequestId, amount, age)
- The `expectedIdempotencyKey` field is a nice touch for healing -- it tells the operator exactly what key should have been used

### Concerns
1. **`OrphanedConfirmedTransferItem` and `OrphanedReversedTransferItem` are nearly identical.** They differ only in `confirmedAt` vs `reversedAt`. Consider a discriminated union:
```ts
type OrphanedTransferItem =
  | { kind: "confirmed"; confirmedAt: number; /* shared fields */ }
  | { kind: "reversed"; reversedAt: number; /* shared fields */ };
```
This would reduce duplication and make the type relationship explicit.

---

## Type: `ReconciliationCheckResult<T>` (reconciliationSuite.ts)

### Invariants Identified
- `isHealthy === (items.length === 0)` (enforced by `buildResult`)
- `count === items.length` (enforced by `buildResult`, redundant)
- `totalAmountCents >= 0` for most checks (unenforced)

### Ratings
- **Encapsulation**: 7/10 -- The `buildResult` factory function ensures consistency between `isHealthy`, `count`, and `items`. Good.
- **Invariant Expression**: 6/10 -- The `count` field is redundant with `items.length`. It exists presumably for serialization convenience but creates a second source of truth.
- **Invariant Usefulness**: 8/10 -- Clean, consistent result shape across all 14+ checks.
- **Invariant Enforcement**: 7/10 -- The `buildResult` helper enforces the key invariants at construction. However, `recomputeResult` in `reconciliationQueries.ts` rebuilds results after filtering, creating a second construction path that must stay in sync.

### Concern
Two construction paths (`buildResult` in reconciliationSuite.ts and `recomputeResult` in reconciliationQueries.ts) that must maintain the same invariants. If one diverges, results become inconsistent. Consider consolidating into a single factory.

---

## Type: `FullReconciliationResult` (reconciliationSuite.ts)

### Invariants Identified
- `isHealthy === (unhealthyCheckNames.length === 0)`
- `totalGapCount === sum(all check result counts)`
- `checkResults`, `conservationResults`, `transferResults` are partitioned by category

### Ratings
- **Encapsulation**: 6/10
- **Invariant Expression**: 5/10 -- The three result arrays use `ReconciliationCheckResult<unknown>`, erasing the item type information. Consumers cannot access typed items without casting.
- **Invariant Usefulness**: 7/10 -- Good aggregate view for dashboards and cron alerting.
- **Invariant Enforcement**: 6/10 -- Computed correctly in `runFullReconciliationSuite`, but the `unknown` erasure is a smell.

### Recommended Improvement
Consider a mapped type or named result fields to preserve item types:
```ts
interface FullReconciliationResult {
  unappliedCash: ReconciliationCheckResult<UnappliedCashItem>;
  negativePayables: ReconciliationCheckResult<NegativePayableItem>;
  // ... etc
}
```
This eliminates the `unknown` erasure and makes the result strongly typed end-to-end.

---

## Type: `retriggerTransferConfirmation` Return Type (transferReconciliationCron.ts)

### Invariants Identified
- Returns `{ action: "skipped" | "retriggered" | "escalated"; attemptCount: number }`
- The action discriminant maps to three distinct code paths

### Ratings
- **Encapsulation**: 7/10 -- Good use of const assertions.
- **Invariant Expression**: 7/10 -- The three-way discriminant clearly models the outcome space.
- **Invariant Usefulness**: 8/10 -- Directly consumed by the cron handler for counting.
- **Invariant Enforcement**: 7/10 -- Each code path returns the correct variant via `as const`.

### Strength
This is the best-typed return value in the PR. The discriminant makes it impossible to confuse the three outcomes.

---

## Type: `SUSPENSE_ESCALATED` Entry Type Constraint (types.ts)

### Concern
The `CASH_ENTRY_TYPE_FAMILY_MAP` defines `SUSPENSE_ESCALATED` as:
```ts
SUSPENSE_ESCALATED: {
  debit: ["SUSPENSE"],
  credit: ["BORROWER_RECEIVABLE"],
}
```
But `retriggerTransferConfirmation` credits either `BORROWER_RECEIVABLE` (inbound) or `LENDER_PAYABLE` (outbound). The family constraint map only allows `BORROWER_RECEIVABLE` as the credit family. If an outbound transfer is escalated, the `postCashEntryInternal` call will attempt to credit a `LENDER_PAYABLE` account, which violates the family constraint. **This is a potential runtime error** unless `postCashEntryInternal` does not enforce the family map (it should).

### Recommended Fix
Update the family constraint:
```ts
SUSPENSE_ESCALATED: {
  debit: ["SUSPENSE"],
  credit: ["BORROWER_RECEIVABLE", "LENDER_PAYABLE"],
}
```

---

## Cross-Cutting Concerns

### 1. `buildResult` / `buildIdempotencyKey` Duplication
`buildResult` is defined in *both* `reconciliationSuite.ts` (line 97) and `transferReconciliation.ts` (line 64). Same for `ageDays` (lines 113 and 80 respectively). The `transferReconciliation.ts` version is `export`ed, but `reconciliationSuite.ts` has its own private copy. This violates DRY and risks divergence.

**Fix:** Extract `buildResult` and `ageDays` into a shared `reconciliationHelpers.ts` module.

### 2. `direction` as `v.string()` in Convex Args
In `retriggerTransferConfirmation` args, `direction` is typed as `v.string()` rather than `v.union(v.literal("inbound"), v.literal("outbound"))`. This means the Convex validator will accept any string. The runtime code then compares `args.direction === "inbound"` which will silently fall through to the outbound path for any typo like `"Inbound"`.

**Fix:** Use `v.union(v.literal("inbound"), v.literal("outbound"))` for the `direction` arg.

### 3. Monetary Amounts as `number`
Throughout the codebase, amounts are plain `number` types. In a financial ledger system subject to O.Reg 189/08 compliance, this is a latent risk. The existing `safeBigintToNumber` in accounts.ts shows awareness of the issue (the ledger internally uses BigInt), but the transfer/healing layer operates entirely in `number` space with no validation that values are integer cents.

---

## Summary Ratings

| Type / Area | Encap. | Expression | Usefulness | Enforcement |
|---|---|---|---|---|
| TransferHealingCandidate | 5 | 4 | 6 | 3 |
| TransferHealingResult | 5 | 4 | 6 | 3 |
| transferHealingAttempts (schema) | 6 | 5 | 8 | 6 |
| transferRequests (schema) | 5 | 3 | 5 | 3 |
| Reconciliation Item Types | 5 | 6 | 8 | 4 |
| ReconciliationCheckResult<T> | 7 | 6 | 8 | 7 |
| FullReconciliationResult | 6 | 5 | 7 | 6 |
| retrigger return type | 7 | 7 | 8 | 7 |

## Top 5 Actionable Fixes (Priority Order)

1. **SUSPENSE_ESCALATED family constraint bug** -- Add `"LENDER_PAYABLE"` to credit families. This is likely a runtime error for outbound escalations.
2. **`direction` arg validator** -- Change `v.string()` to `v.union(v.literal("inbound"), v.literal("outbound"))` in `retriggerTransferConfirmation` and `retryTransferConfirmationEffect`.
3. **Extract duplicate `buildResult`/`ageDays`** into a shared module to prevent divergence.
4. **Create application-layer discriminated union** for `TransferRequest` status variants to eliminate defensive null checks.
5. ~~**Add `skipped` count** to `TransferHealingResult` to make the count invariant explicit.~~ **DONE** -- Already implemented in `transferHealingTypes.ts`.
