# Chunk 4 Context: Methods + Cross-Entity Chain Verification

## SPEC §5 — PaymentMethod Interface

### §5.1 Interface Definition
```typescript
export interface InitiateParams {
  amount: number;          // cents
  mortgageId: string;
  borrowerId: string;
  planEntryId: string;
  method: string;          // "manual", "mock_pad", "rotessa_pad"
  metadata?: Record<string, any>;
}

export interface InitiateResult {
  providerRef: string;
  status: "pending" | "confirmed";
}

export interface ConfirmResult {
  providerRef: string;
  settledAt: number;
  providerData?: Record<string, any>;
}

export interface PaymentMethod {
  initiate(params: InitiateParams): Promise<InitiateResult>;
  confirm(ref: string): Promise<ConfirmResult>;
  cancel(ref: string): Promise<{ cancelled: boolean }>;
  getStatus(ref: string): Promise<{ status: string; providerData?: any }>;
}
```

### §5.2 ManualPaymentMethod
- `initiate()` → providerRef: `"manual-{planEntryId}-{timestamp}"`, status: `"confirmed"` (immediate)
- `confirm()` → returns settledAt: `Date.now()`
- Two-transition lifecycle: initiated → confirmed (skips pending)

### §5.3 MockPADMethod
- Constructor config: `{ delayMs: number, failureRate: number }` (defaults: 2000ms, 0.1)
- `initiate()` → status: `"pending"`, schedules delayed confirmation/failure
- Simulates async webhook-driven lifecycle

### §5.4 Method Registry
- `methodRegistry` maps method name → PaymentMethod instance
- `getPaymentMethod(method)` throws ConvexError for unknown methods
- Adding RotessaPADMethod: add one entry to registry, implement one class — ZERO changes elsewhere

## SPEC §8 — Cross-Entity Effects

### §8.1 emitPaymentReceived (Attempt confirmed → Obligation)
- Loads attempt → plan entry → obligation IDs
- For each obligation: fires PAYMENT_APPLIED with amount, attemptId, currentAmountSettled, totalAmount
- This bridges the Collection Attempt machine to the Obligation machine

### §8.2 emitObligationOverdue (Obligation overdue → Mortgage)
- Fires OBLIGATION_OVERDUE to mortgage machine
- Triggers rules engine evaluation with eventType "OBLIGATION_OVERDUE"
- Must call REAL evaluateRules engine (not stub — Drift D2)

### §8.3 emitObligationSettled (Obligation settled → Mortgage + Dispersal)
- Fires OBLIGATION_SETTLED to mortgage machine (cure check)
- Fires to dispersal engine (Project 6 — may be stub)

## Cross-Entity Chain (PRD §Machine Topologies)
```
Collection Attempt (confirmed)
  → PAYMENT_RECEIVED → Obligation machine (payment_applied → settled)
  → OBLIGATION_SETTLED → Mortgage machine (checks arrears → possible cure)
  → OBLIGATION_SETTLED → Dispersal engine (creates dispersal entries)

Collection Attempt (permanent_fail)
  → COLLECTION_FAILED → Collection Plan rules engine (evaluates next action)

Obligation (overdue)
  → OBLIGATION_OVERDUE → Mortgage machine (active → delinquent)
  → Side effects: notify borrower, create late fee obligation
```

## Test Expectations

### crossEntity.test.ts should verify:
1. Full chain: plan entry → attempt initiated → confirmed → PAYMENT_RECEIVED → obligation settled → OBLIGATION_SETTLED → mortgage cure event (3 audit journal entries with causal chain)
2. Failure chain: attempt failed → COLLECTION_FAILED → RetryRule creates new plan entry
3. Overdue chain: obligation overdue → OBLIGATION_OVERDUE → mortgage delinquent + late fee

### endToEnd.test.ts should verify:
1. Seed mortgage → generate obligations → ScheduleRule → ManualPaymentMethod → settled
2. Same with MockPADMethod (async path)
3. Partial payment → partially_settled → second payment → settled
4. Full retry chain: attempt fails → RetryRule → new attempt → succeeds → settled
