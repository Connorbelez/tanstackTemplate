# Unified Payment Rails — Technical Design Document

**Goal:** Unified Payment Rails
**Author:** AI-assisted (GitNexus code analysis + architecture review)
**Date:** 2026-03-20
**Status:** Draft — for review

---

## 1. Executive Summary

FairLend's payment system currently processes mortgage payments through a three-layer architecture: **Obligations** (what is owed), **Collection Plans** (rules-driven scheduling), and **Collection Attempts** (execution via pluggable payment methods). This document proposes a unified payment rails design that consolidates payment processing, adds real payment provider integration (Rotessa PAD, Stripe), and ensures financial/domain correctness across the entire money-movement pipeline — from borrower collection through pro-rata lender dispersal.

### Current State
- Two mock payment methods: `ManualPaymentMethod` (no-op) and `MockPADMethod` (simulated delay + failure)
- Stripe and Polar components installed but not wired into the collection pipeline
- Dispersal entries created atomically but no actual payout mechanism
- No real bank-account verification (Plaid/Flinks) or PAD agreement management
- Servicing fee calculated as fixed monthly amount, not prorated to actual collection day

### Target State
- Unified `PaymentMethod` strategy pattern with real providers (Rotessa PAD, Stripe ACH/EFT, manual)
- Bank account verification (Plaid or Flinks) as a prerequisite for PAD enrollment
- Automated lender payout via the same payment rails (reverse flow)
- End-to-end idempotency, reconciliation, and audit trail
- Governed Transitions for all payment lifecycle states

---

## 2. Architecture Overview

### 2.1 System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FairLend Platform                            │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐             │
│  │ Borrower │───▶│  Obligation  │───▶│  Collection   │             │
│  │  Portal  │    │  Generator   │    │  Plan Engine  │             │
│  └──────────┘    └──────────────┘    └───────┬───────┘             │
│                                              │                      │
│                                    ┌─────────▼─────────┐           │
│                                    │ Collection Attempt │           │
│                                    │   (PaymentMethod)  │           │
│                                    └─────────┬─────────┘           │
│                                              │                      │
│               ┌──────────────────────────────┼──────────┐          │
│               ▼                              ▼          ▼          │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────┐             │
│  │ Rotessa (PAD)  │  │ Stripe (ACH)   │  │  Manual  │             │
│  └───────┬────────┘  └───────┬────────┘  └────┬─────┘             │
│          │                   │                 │                    │
│          └───────────┬───────┘                 │                    │
│                      ▼                         ▼                    │
│            ┌──────────────────┐   ┌────────────────────┐           │
│            │   Settlement     │   │  Obligation Settled │           │
│            │   Confirmation   │──▶│  + Dispersal Split  │           │
│            └──────────────────┘   └────────┬───────────┘           │
│                                            │                       │
│                                   ┌────────▼───────────┐           │
│                                   │  Lender Dispersal  │           │
│                                   │  (Pro-rata payout)  │           │
│                                   └────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer Responsibilities

| Layer | Responsibility | Key Tables |
|-------|---------------|------------|
| **Obligations** | "What is owed" — generated from mortgage amortization schedules | `obligations` |
| **Collection Plan** | "When and how to collect" — rules engine scheduling | `collectionPlanEntries`, `collectionRules` |
| **Collection Attempts** | "Execute the payment" — provider-agnostic execution | `collectionAttempts` |
| **Settlement** | "Confirm receipt" — obligation settlement + ledger posting | `obligations`, `ledger_journal_entries` |
| **Dispersal** | "Pay the lenders" — pro-rata split with servicing fee deduction | `dispersalEntries`, `servicingFeeEntries` |
| **Payout** | "Move money to lenders" — **NEW: actual bank transfer to lenders** | `payoutEntries` (proposed) |

---

## 3. Detailed Component Design

### 3.1 Payment Method Interface (Existing — Extend)

The current `PaymentMethod` strategy interface is well-designed:

```typescript
interface PaymentMethod {
  initiate(params: InitiateParams): Promise<InitiateResult>;
  confirm(ref: string): Promise<ConfirmResult>;
  cancel(ref: string): Promise<CancelResult>;
  getStatus(ref: string): Promise<StatusResult>;
}
```

**Proposed extensions:**

```typescript
interface PaymentMethod {
  // Existing
  initiate(params: InitiateParams): Promise<InitiateResult>;
  confirm(ref: string): Promise<ConfirmResult>;
  cancel(ref: string): Promise<CancelResult>;
  getStatus(ref: string): Promise<StatusResult>;

  // New: refund/reversal support
  refund(ref: string, amount?: number): Promise<RefundResult>;

  // New: webhook event processing
  handleWebhook?(event: ProviderWebhookEvent): Promise<WebhookResult>;

  // New: capabilities declaration
  readonly capabilities: PaymentMethodCapabilities;
}

interface PaymentMethodCapabilities {
  supportsPartialRefund: boolean;
  supportsRecurring: boolean;
  supportsWebhooks: boolean;
  settlementDelayMs: number; // expected settlement time
  maxAmountCents: number;
}
```

### 3.2 Rotessa PAD Integration

Rotessa is the primary real PAD provider for Canadian EFT.

#### 3.2.1 Data Model Additions

```typescript
// New table: PAD agreements
padAgreements: defineTable({
  borrowerId: v.id("borrowers"),
  mortgageId: v.id("mortgages"),
  rotessaCustomerId: v.string(),
  routingNumber: v.string(),       // Transit + Institution
  accountNumberLast4: v.string(),  // Masked for display
  accountType: v.union(v.literal("checking"), v.literal("savings")),
  status: v.string(),              // GT-governed: draft → active → suspended → terminated
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  verificationMethod: v.union(
    v.literal("plaid"),
    v.literal("flinks"),
    v.literal("micro_deposit"),
    v.literal("void_cheque")
  ),
  verifiedAt: v.optional(v.number()),
  consentRecordId: v.optional(v.string()),  // PIPEDA consent tracking
  createdAt: v.number(),
})
  .index("by_borrower", ["borrowerId"])
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_rotessa_customer", ["rotessaCustomerId"]),
```

#### 3.2.2 Integration Flow

```
1. Borrower submits bank details via frontend form
2. Bank account verified via Plaid/Flinks (see §3.3)
3. PAD agreement created in FairLend (status: draft)
4. Rotessa customer created via API
5. PAD agreement activated (status: active)
6. Collection Plan creates entries with method: "rotessa_pad"
7. RealPADMethod.initiate() → Rotessa POST /transactions
8. Rotessa processes via Canadian Payments Association
9. Webhook callback → settlement or NSF notification
10. Settlement → Obligation settled → Dispersal triggered
```

#### 3.2.3 Rotessa-Specific Foot Guns

| Risk | Description | Mitigation |
|------|-------------|------------|
| **NSF cascading** | NSF triggers retry rule which may hit same insufficient account repeatedly | Implement exponential backoff in retry_rule; cap max retries at 3; require manual intervention after cap |
| **Processing windows** | Rotessa has 2-3 business day settlement; PAD reversals possible up to 90 days | Track `reversalWindowEnd` on settled attempts; hold lender dispersal for configurable "clearing period" |
| **Duplicate transactions** | Network retries may cause double-initiation | `idempotencyKey` on `collectionAttempts` + Rotessa's own idempotency support |
| **PAD agreement revocation** | Borrower can revoke PAD authorization at their bank | Webhook handler for authorization_revoked; auto-transition PAD agreement to `suspended` |
| **Weekend/holiday processing** | PAD only processes on business days | Schedule collection dates on business days only; maintain Canadian banking calendar |
| **Amount limits** | Individual PAD transactions may have bank-imposed limits | Validate against `capabilities.maxAmountCents` before initiation |

### 3.3 Bank Account Verification

#### 3.3.1 Plaid Integration (Recommended Primary)

```typescript
// New table: bank account verifications
bankAccountVerifications: defineTable({
  borrowerId: v.id("borrowers"),
  provider: v.union(v.literal("plaid"), v.literal("flinks")),
  providerAccountId: v.string(),
  status: v.string(), // pending → verified → expired → revoked
  institutionId: v.string(),
  institutionName: v.string(),
  accountMask: v.string(),
  accountType: v.string(),
  routingNumber: v.optional(v.string()),  // Populated on Auth product success
  accessToken: v.optional(v.string()),    // Encrypted; for ongoing balance checks
  consentExpiresAt: v.optional(v.number()),
  verifiedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_borrower", ["borrowerId", "status"])
  .index("by_provider_account", ["provider", "providerAccountId"]),
```

**⚠️ Foot Gun: Plaid token expiry.** Plaid access tokens don't expire, but the underlying bank connection can go stale. Must implement periodic `plaid.accounts.get()` health checks and handle `ITEM_LOGIN_REQUIRED` errors by prompting borrower to re-link.

**⚠️ Foot Gun: Account number mismatch.** Plaid returns routing/account numbers via the Auth product. If the borrower's bank doesn't support instant auth, micro-deposits take 2-3 days. Collection must NOT be scheduled until verification completes.

### 3.4 Stripe Integration (ACH/EFT Fallback)

Stripe is already installed (`@convex-dev/stripe` v0.1.4). Wire into payment rails for:

1. **ACH Direct Debit** (US borrowers) — via Stripe's ACH integration
2. **Pre-authorized debit** (Canada) — via Stripe's Canadian payment methods
3. **Refunds/reversals** — Stripe's native refund API

```typescript
// New payment method implementation
class StripePaymentMethod implements PaymentMethod {
  readonly capabilities: PaymentMethodCapabilities = {
    supportsPartialRefund: true,
    supportsRecurring: true,
    supportsWebhooks: true,
    settlementDelayMs: 4 * 24 * 60 * 60 * 1000, // 4 business days for ACH
    maxAmountCents: 50_000_000, // $500k per ACH
  };

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    // 1. Look up Stripe Customer for borrower
    // 2. Look up verified PaymentMethod (bank account)
    // 3. Create PaymentIntent with confirm: true
    // 4. Return { providerRef: pi_xxx, status: "pending" }
  }

  async handleWebhook(event: ProviderWebhookEvent): Promise<WebhookResult> {
    // payment_intent.succeeded → trigger settlement
    // payment_intent.payment_failed → trigger retry rule
    // charge.dispute.created → freeze obligation + alert
  }
}
```

**⚠️ Foot Gun: Stripe ACH returns.** ACH payments can be returned up to 60 days post-settlement. A settled obligation that gets reversed must:
1. Re-open the obligation (GT transition: `settled → became_due` via `PAYMENT_REVERSED`)
2. Reverse the dispersal entries
3. Claw back lender dispersals (requires lender payout hold period)
4. Create a correction journal entry in the ledger

### 3.5 Collection Attempt State Machine (Existing — Extend)

Current GT states for `collectionAttempt`: governed by XState machine.

**Proposed extended state machine:**

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │ INITIATE
                    ┌────▼────┐
              ┌─────┤executing├─────┐
              │     └────┬────┘     │
              │          │          │
         FAILED     SETTLED    CANCELLED
              │          │          │
         ┌────▼──┐  ┌───▼───┐  ┌──▼───────┐
         │failed │  │settled│  │cancelled │
         └───────┘  └───┬───┘  └──────────┘
                        │
                   REVERSED (new)
                        │
                   ┌────▼────┐
                   │reversed │ (new state)
                   └─────────┘
```

**New events:**
- `REVERSED` — payment was settled but subsequently returned/charged back
- `DISPUTE_OPENED` — Stripe dispute opened; freeze until resolution

### 3.6 Dispersal & Payout Pipeline

#### 3.6.1 Current Flow (Collection → Dispersal)

```
Obligation SETTLED
  └─▶ createDispersalEntries(obligationId, settledAmount, settledDate)
       ├─ loadActivePositions() — get POSITION accounts with balance > 0
       ├─ applyDealReroutes() — adjust for mid-period ownership changes
       ├─ calculateServicingFee() — Math.round(annualRate × principal / 12)
       ├─ calculateProRataShares() — largest-remainder method
       └─ Insert dispersalEntries + servicingFeeEntry
```

#### 3.6.2 Proposed Payout Flow (Dispersal → Bank Transfer)

```typescript
// New table: lender payouts
payoutEntries: defineTable({
  lenderId: v.id("lenders"),
  dispersalEntryIds: v.array(v.id("dispersalEntries")),
  totalAmount: v.number(), // cents — sum of dispersal amounts
  method: v.string(), // "eft", "wire", "cheque"
  status: v.string(), // GT: pending → processing → completed → failed → reversed
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  providerRef: v.optional(v.string()),
  bankAccountId: v.optional(v.id("lenderBankAccounts")),
  batchId: v.optional(v.string()), // Group payouts for batch EFT processing
  scheduledDate: v.string(),
  processedAt: v.optional(v.number()),
  failedAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_lender", ["lenderId", "status"])
  .index("by_status", ["status", "scheduledDate"])
  .index("by_batch", ["batchId"])
  .index("by_provider_ref", ["providerRef"]),
```

**Payout batching strategy:**
- Aggregate all pending dispersals for a lender into a single payout
- Daily batch run (configurable frequency)
- Minimum payout threshold to avoid micro-transfers
- Hold period between dispersal creation and payout initiation (configurable, default: 5 business days)

#### 3.6.3 Foot Guns: Dispersal & Payout

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Rounding drift** | Largest-remainder method ensures sum = distributableAmount per obligation, but across many obligations rounding errors accumulate | Run monthly reconciliation check: sum(dispersalEntries.amount) + sum(servicingFeeEntries.amount) == sum(obligations.amountSettled) |
| **Stale positions** | Ownership transfer settles mid-collection-period; borrower payment goes to wrong lender | `applyDealReroutes()` already handles this — but ensure reroute `effectiveAfterDate` aligns with obligation `settledDate`, NOT `dueDate` |
| **Servicing fee > payment** | If mortgage principal is very high relative to payment, monthly servicing fee could exceed the payment amount | Existing guard: `if (servicingFee >= settledAmount) throw`. But need business rule for partial settlements — currently no partial settlement path |
| **Dispersal without payout** | dispersalEntries created but no mechanism to actually pay lenders | Unified payout pipeline (§3.6.2) closes this gap |
| **Reversal after dispersal** | Payment reversed after lender has been paid out | Hold period before payout; reversal clawback mechanism; lender agreement must include clawback provisions |
| **Double dispersal** | Same obligation settled twice due to race condition | Idempotency guard on `createDispersalEntries`: checks existing by `obligationId` before insert |
| **Timezone in date comparisons** | `settledDate` is YYYY-MM-DD string; deal reroute `effectiveAfterDate` compared as string | String comparison works for ISO dates — but ensure ALL date fields use same convention. Current mix: `dueDate` is Unix timestamp, `settledDate` is YYYY-MM-DD string |

---

## 4. Financial Domain Correctness

### 4.1 Interest Calculation — Actual/365

Current implementation in `interestMath.ts`:

```
accrued = annualRate × fraction × principalBalance × days / 365
```

**Correctness concerns:**

1. **Leap years:** Using fixed 365 denominator (not Actual/Actual). This is standard for Canadian mortgages but should be explicitly documented as a product decision, not an oversight.

2. **Day count inclusivity:** `daysBetween()` is inclusive of both endpoints (`+1`). This is correct for accrual but means a 1-day period (same start/end) counts as 1 day of interest. Verify this matches lender agreements.

3. **Floating-point precision:** `calculatePeriodAccrual` returns unrounded floating-point. Rounding is deferred to presentation layer. **Foot gun:** if rounding is applied inconsistently (e.g., round-per-period vs. round-at-total), lender statements will disagree with actual dispersals.

4. **Principal balance changes:** Current implementation uses a static `principalBalance` for accrual. For mortgages with principal repayment obligations, the balance should decrease as principal is repaid. **Ensure accrual queries fetch the correct point-in-time principal.**

### 4.2 Servicing Fee Calculation

Current implementation:

```typescript
Math.round((annualServicingRate * principalCents) / 12)
```

**Correctness concerns:**

1. **Fixed monthly amount:** This produces a constant monthly fee regardless of payment frequency. For bi-weekly or weekly payment mortgages, the fee per obligation should be `annualRate × principal / (payments_per_year)`, not `/12`.

2. **Payment frequency mismatch:** A monthly mortgage pays 12 times/year, bi-weekly pays 26 times/year. The current formula overcharges on monthly mortgages relative to the effective annual rate, and undercharges on bi-weekly since the fee is only assessed once per obligation settlement.

3. **Proposed fix:**

```typescript
function calculateServicingFee(
  annualServicingRate: number,
  principalCents: number,
  paymentFrequency: PaymentFrequency
): number {
  const paymentsPerYear = {
    monthly: 12,
    bi_weekly: 26,
    accelerated_bi_weekly: 26,
    weekly: 52,
  }[paymentFrequency];

  return Math.round((annualServicingRate * principalCents) / paymentsPerYear);
}
```

### 4.3 Pro-Rata Distribution (Largest Remainder Method)

The `calculateProRataShares()` implementation is correct and handles:
- Integer-cent precision (no fractional cents)
- Deterministic tie-breaking (by units, then by index)
- Sum guarantee: `sum(shares) === distributableAmount`

**Edge cases to test:**
- Single lender with 10,000/10,000 units → should receive 100%
- Two lenders with equal units → deterministic split (lower index gets extra cent)
- Very small distributable amount (e.g., 1 cent) with many lenders → only one receives

### 4.4 Ledger Integrity

The double-entry ledger enforces:
- Every entry has exactly one debit account and one credit account
- Entry types are constrained to valid account-type pairs via `ENTRY_TYPE_ACCOUNT_MAP`
- Sequence numbers are monotonically increasing
- Idempotency keys prevent duplicate entries

**Current enforcement:**
- `ENTRY_TYPE_ACCOUNT_MAP` is enforced in `convex/ledger/postEntry.ts` via the `typeCheck()` step, so invalid debit/credit account-type pairs are rejected before journal entries are posted.
- The stale TODO in `convex/ledger/types.ts` was removed in ENG-155 to keep the code comments aligned with the actual validation pipeline.

### 4.5 Date/Time Consistency

**Current mixed representations:**

| Field | Format | Used In |
|-------|--------|---------|
| `dueDate` | Unix timestamp (ms) | `obligations` |
| `gracePeriodEnd` | Unix timestamp (ms) | `obligations` |
| `settledDate` | YYYY-MM-DD string | `dispersalEntries` |
| `effectiveDate` | YYYY-MM-DD string | `ledger_journal_entries` |
| `effectiveAfterDate` | YYYY-MM-DD string | `dealReroutes` |
| `firstPaymentDate` | YYYY-MM-DD string | `mortgages` |
| `scheduledDate` | Unix timestamp (ms) | `collectionPlanEntries` |

**Foot gun:** Converting between these formats requires timezone assumptions. The crons run at 06:00 UTC. A borrower in Vancouver (UTC-8) has their "March 1" obligation become due at 10pm Feb 28 local time. This is operationally acceptable but must be documented.

**Recommendation:** Standardize new tables on YYYY-MM-DD strings for business dates (what day does the business event belong to) and Unix timestamps for system events (when did the system process it).

---

## 5. Integration Points & Sequencing

### 5.1 Webhook Architecture

All real payment providers require webhook processing. FairLend already has a webhook pattern via WorkOS AuthKit (HTTP endpoint → immediate 200 → async workpool processing).

**Proposed webhook architecture for payment providers:**

```typescript
// convex/http.ts — add payment webhook routes
http.route({
  path: "/webhooks/rotessa",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // 1. Verify Rotessa webhook signature
    // 2. Store raw event in paymentWebhookEvents table
    // 3. Return 200 immediately
    // 4. Schedule async processing
  }),
});

http.route({
  path: "/webhooks/stripe/payments",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // 1. Verify Stripe signature (stripe.webhooks.constructEvent)
    // 2. Store raw event
    // 3. Return 200
    // 4. Schedule processing
  }),
});
```

**New table:**

```typescript
paymentWebhookEvents: defineTable({
  provider: v.string(),
  eventType: v.string(),
  eventId: v.string(),         // Provider's event ID for dedup
  rawPayload: v.string(),      // JSON string
  status: v.union(
    v.literal("received"),
    v.literal("processing"),
    v.literal("processed"),
    v.literal("failed")
  ),
  processedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  retryCount: v.number(),
  createdAt: v.number(),
})
  .index("by_event_id", ["provider", "eventId"])
  .index("by_status", ["status", "createdAt"]),
```

**⚠️ Foot Gun (from WorkOS experience):** Every webhook event type MUST have a corresponding handler. Unhandled events should be explicitly acknowledged and stored, not silently dropped. The WorkOS `additionalEventTypes` whitelist pattern is a good model — apply the same to payment webhooks.

### 5.2 Reconciliation

**Daily reconciliation check (extend existing 06:00 UTC cron):**

```
For each mortgage with status "funded":
  1. Sum(obligations.amountSettled) should equal Sum(collectionAttempts.amount WHERE status = "settled")
  2. Sum(dispersalEntries.amount) + Sum(servicingFeeEntries.amount) should equal Sum(obligations.amountSettled)
  3. Ledger balance(TREASURY) + Sum(ledger balance(all POSITIONs)) should equal ledger balance(WORLD) × -1
  4. No collectionAttempts stuck in "executing" for > 7 days (provider timeout)
  5. No dispersalEntries in "pending" status for > payout hold period
```

**Alert on discrepancy:** Log error + schedule admin notification. Do NOT auto-correct — human review required for financial discrepancies.

### 5.3 Convex-Specific Considerations

| Constraint | Impact | Design Decision |
|-----------|--------|----------------|
| **Convex actions are not transactional** | Payment initiation (action) → status update (mutation) is not atomic | Use Convex `workflow` component for durable multi-step payment flows |
| **Convex mutations have 10s timeout** | Complex dispersal calculations must complete in <10s | Batch dispersals; current `BATCH_SIZE = 100` for obligation crons is appropriate |
| **Convex scheduler is at-least-once** | Settlement callbacks may fire multiple times | Idempotency keys on all financial writes; `collectionAttempts.by_provider_ref` index enables dedup |
| **Convex crons are singleton** | Only one instance of a cron runs at a time | Current design is correct; batch processing handles volume |
| **No SQL joins** | Reconciliation queries require multiple round-trips | Use `internalAction` to orchestrate queries + aggregate in-memory |

### 5.4 Authorization Integration

Payment operations must respect the three-layer auth model:

| Operation | WorkOS RBAC | Convex Ownership | GT Guard |
|-----------|-------------|-------------------|----------|
| View obligations | `mortgage:read` | `canAccessMortgage(borrowerId)` | — |
| Initiate manual payment | `payment:write` | `canAccessMortgage(mortgageId)` | Obligation must be in `became_due` or `grace_period_expired` |
| Approve PAD agreement | `payment:admin` | — | PAD agreement must be in `draft` |
| View dispersals | `dispersal:read` | `canAccessAccrual(lenderId)` | — |
| Initiate lender payout | `payout:admin` | — | Dispersal must be past hold period |
| Process refund | `payment:admin` | — | Attempt must be in `settled` and within reversal window |

---

## 6. Potential Foot Guns — Comprehensive Registry

### 6.1 Financial Foot Guns

| # | Category | Foot Gun | Severity | Current Status | Required Action |
|---|----------|----------|----------|---------------|-----------------|
| F1 | Ledger | Stale audit note claimed `ENTRY_TYPE_ACCOUNT_MAP` was not wired into `postEntry` | N/A | Resolved: validation already enforced in `typeCheck()` | Keep docs/comments aligned with implementation |
| F2 | Servicing Fee | Fixed `/12` divisor ignores payment frequency | 🟡 Medium | Bug | Fix formula to use `paymentsPerYear` |
| F3 | Accrual | Static principal balance doesn't decrease with principal repayments | 🟡 Medium | Design gap | Add point-in-time principal lookup |
| F4 | Dispersal | No mechanism to reverse dispersals on payment reversal | 🔴 Critical | Not implemented | Design reversal flow before going live |
| F5 | Rounding | Per-obligation rounding is correct, but cross-obligation drift not monitored | 🟡 Medium | No monitoring | Add monthly reconciliation report |
| F6 | Dates | Mixed timestamp/string date formats across tables | 🟡 Medium | Inconsistent | Standardize; document conversion rules |

### 6.2 Integration Foot Guns

| # | Category | Foot Gun | Severity | Required Action |
|---|----------|----------|----------|-----------------|
| I1 | Rotessa | NSF retry storm — retrying against insufficient funds | 🔴 Critical | Exponential backoff + max retry cap |
| I2 | Rotessa | 90-day PAD reversal window | 🟡 Medium | Track reversal window; hold lender payouts |
| I3 | Stripe | 60-day ACH return window | 🟡 Medium | Same as I2 |
| I4 | Stripe | Dispute/chargeback freezes funds | 🔴 Critical | Implement dispute handler; freeze obligation |
| I5 | Webhooks | Unhandled event type crashes pipeline | 🔴 Critical | Explicit handler for every whitelisted event |
| I6 | Webhooks | Out-of-order webhook delivery | 🟡 Medium | Use `providerRef` + status checks; idempotent handlers |
| I7 | Plaid | Stale bank connection (`ITEM_LOGIN_REQUIRED`) | 🟡 Medium | Periodic health check; alert borrower |

### 6.3 Operational Foot Guns

| # | Category | Foot Gun | Severity | Required Action |
|---|----------|----------|----------|-----------------|
| O1 | Crons | Financial crons were previously scheduled for the same 06:00 UTC window | N/A | Resolved: obligations run at 06:00 UTC; reconciliation runs at 07:00 UTC |
| O2 | Batch size | `BATCH_SIZE = 100` may be too small at scale | 🟡 Medium | Monitor batch overflow logging; increase or add second daily run |
| O3 | Timezone | Obligations become due at UTC midnight, not borrower's local midnight | 🟡 Medium | Document; consider per-mortgage timezone field |
| O4 | Idempotency | `idempotencyKey` format varies across tables | 🟡 Medium | Standardize format: `{entity}:{id}:{operation}:{date}` |
| O5 | Audit | GT audit trail exists but no financial-specific audit report | 🟡 Medium | Build SOC 2-ready payment audit export |

---

## 7. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)
1. Confirm `ENTRY_TYPE_ACCOUNT_MAP` validation remains enforced in `postEntry` and keep related docs/comments in sync
2. Fix servicing fee calculation for payment frequency
3. Standardize date format conventions (document + enforce via validators)
4. Add `reversed` state to collectionAttempt state machine
5. Design dispersal reversal flow

### Phase 2: Bank Verification (Weeks 3-5)
1. Integrate Plaid (or Flinks) for bank account verification
2. Build `bankAccountVerifications` table and GT state machine
3. Build borrower bank linking UI flow
4. Implement verification health check cron

### Phase 3: Rotessa PAD (Weeks 5-8)
1. Implement `RealPADMethod` (Rotessa API integration)
2. Build `padAgreements` table and GT state machine
3. Build PAD agreement management UI
4. Implement Rotessa webhook handler
5. Add NSF handling and retry backoff

### Phase 4: Lender Payout (Weeks 8-10)
1. Build `payoutEntries` table and GT state machine
2. Implement payout batching logic
3. Implement lender bank account management
4. Wire payout initiation to Rotessa/Stripe
5. Build payout dashboard for admins

### Phase 5: Reconciliation & Monitoring (Weeks 10-12)
1. Extend daily reconciliation with full financial checks
2. Build payment reversal / clawback flow
3. Build financial audit export
4. Load testing with production-scale obligation volumes
5. Compliance review (PIPEDA consent, PAD rules)

---

## 8. Testing Strategy

### 8.1 Unit Tests
- `interestMath.ts` — edge cases for leap years, single-day periods, zero balances
- `calculateProRataShares` — single lender, equal split, uneven split, 1-cent distributable
- `calculateServicingFee` — all payment frequencies, boundary amounts

### 8.2 Integration Tests
- End-to-end obligation → collection → settlement → dispersal pipeline
- MockPAD failure → retry rule → second attempt → settlement
- Payment reversal → obligation re-opened → dispersal reversed

### 8.3 Financial Invariant Tests
- **Ledger balance equation:** WORLD debits = TREASURY credits + sum(POSITION credits) for each mortgage
- **Conservation of money:** settledAmount = sum(dispersalAmounts) + servicingFee (per obligation)
- **No negative balances:** No POSITION account should have a negative posted balance
- **Sequence monotonicity:** Journal entry sequence numbers are strictly increasing

### 8.4 Chaos/Fault Tests
- Webhook delivered out of order
- Webhook delivered multiple times
- Settlement callback fires after cancellation
- Convex action timeout during payment initiation
- Concurrent settlement of same obligation

---

## 9. Open Questions

1. **Clearing period:** How many business days should lender payouts be held after borrower payment settles? (Recommendation: 5 business days for PAD, 7 for ACH)

2. **Partial payments:** Current system assumes full obligation settlement. Should we support partial payments? (Recommendation: defer to Phase 2; requires `amountSettled` tracking which already exists)

3. **Multi-currency:** Are any mortgages denominated in non-CAD currencies? (Architecture assumes single currency)

4. **Stripe vs. Rotessa primary:** For Canadian PAD, should Rotessa be primary with Stripe as fallback, or vice versa? (Recommendation: Rotessa primary for lower PAD fees; Stripe for US ACH)

5. **Lender payout frequency:** Daily, weekly, or monthly? (Recommendation: configurable per lender, default monthly)

6. **Rate changes:** For variable-rate mortgages, how are rate changes propagated to obligation amounts? (Not yet addressed in obligation generation logic)

---

## 10. Appendix: Current Code References

| Concept | Primary Files |
|---------|--------------|
| PaymentMethod interface | `convex/payments/methods/interface.ts` |
| Payment method registry | `convex/payments/methods/registry.ts` |
| Manual payment method | `convex/payments/methods/manual.ts` |
| Mock PAD method | `convex/payments/methods/mockPAD.ts` |
| Obligation generation | `convex/payments/obligations/generate.ts`, `generateImpl.ts` |
| Obligation lifecycle crons | `convex/payments/obligations/crons.ts` |
| Collection rules engine | `convex/payments/collectionPlan/engine.ts` |
| Schedule rule | `convex/payments/collectionPlan/rules/scheduleRule.ts` |
| Retry rule | `convex/payments/collectionPlan/rules/retryRule.ts` |
| Late fee rule | `convex/payments/collectionPlan/rules/lateFeeRule.ts` |
| Dispersal creation | `convex/dispersal/createDispersalEntries.ts` |
| Servicing fee calc | `convex/dispersal/servicingFee.ts` |
| Interest math | `convex/accrual/interestMath.ts` |
| Ledger types | `convex/ledger/types.ts` |
| Ledger posting | `convex/ledger/postEntry.ts` |
| GT transition engine | `convex/engine/transition.ts` |
| Schema | `convex/schema.ts` |
| Crons | `convex/crons.ts` |
| Convex config (components) | `convex/convex.config.ts` |
