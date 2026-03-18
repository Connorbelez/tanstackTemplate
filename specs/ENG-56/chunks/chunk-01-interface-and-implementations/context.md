# Chunk 1 Context: Interface, Implementations & Registry

## Acceptance Criteria (from Linear)
- `PaymentMethod` interface: `initiate(params)`, `confirm(ref)`, `cancel(ref)`, `getStatus(ref)` with typed params/results
- `ManualPaymentMethod`: initiate returns `{ status: "confirmed" }` immediately, no external API
- `MockPADMethod`: initiate returns `{ status: "pending" }`, schedules delayed FUNDS_SETTLED/DRAW_FAILED via Convex scheduler
- `MockPADMethod` configurable: delayMs (default 2000), failureRate (0-1, default 0.1)
- Method registry: `getPaymentMethod("manual")` → ManualPaymentMethod, `"mock_pad"` → MockPADMethod
- Unknown method throws ConvexError

## File Map
| File | Action |
|------|--------|
| `convex/payments/methods/interface.ts` | Create |
| `convex/payments/methods/manual.ts` | Create |
| `convex/payments/methods/mockPAD.ts` | Create |
| `convex/payments/methods/registry.ts` | Create |

## Downstream Contract (ENG-63 expects this)
```typescript
// ENG-63 will call:
import { getPaymentMethod } from "../methods/registry";
import type { PaymentMethod, InitiateParams, InitiateResult } from "../methods/interface";

const method: PaymentMethod = getPaymentMethod(planEntry.method);
const result: InitiateResult = await method.initiate({
  amount: planEntry.amount,
  mortgageId: attempt.mortgageId,
  borrowerId: attempt.borrowerId,
  planEntryId: planEntry._id,
  method: planEntry.method,
});

if (result.status === "confirmed") {
  // fire FUNDS_SETTLED on collectionAttemptMachine
} else {
  // fire DRAW_INITIATED, schedule delayed settlement check
}
```

## Design Decisions from Implementation Plan

### SchedulerAdapter Pattern (Drift Report Item #4)
A class instance cannot access `ctx.scheduler` — only Convex functions have a `ctx`. MockPADMethod needs a `ScheduleSettlementFn` injected via constructor. In tests, use a vi.fn() spy. In production, the caller (ENG-63) passes `ctx.scheduler.runAfter`.

### Two-Tier Registry API
- `getPaymentMethod("manual")` — simple lookup with no-op scheduler (safe for ManualPaymentMethod)
- `createPaymentMethodRegistry({ scheduleSettlement })` — full DI, required for MockPADMethod in production

### Pure TypeScript (No Convex Validators)
The interface layer lives outside Convex function boundaries. Use plain TypeScript types, not `v.` validators.

## Interface Definition (from Spec Section 5.1 + Implementation Plan refinements)
```typescript
export interface InitiateParams {
  amount: number;          // cents
  mortgageId: string;
  borrowerId: string;
  planEntryId: string;
  method: string;          // "manual", "mock_pad", "rotessa_pad"
  metadata?: Record<string, unknown>;
}

export interface InitiateResult {
  providerRef: string;     // unique reference from provider
  status: "pending" | "confirmed";
}

export interface ConfirmResult {
  providerRef: string;
  settledAt: number;
  providerData?: Record<string, unknown>;
}

export interface CancelResult {
  cancelled: boolean;
}

export interface StatusResult {
  status: string;
  providerData?: Record<string, unknown>;
}

export interface PaymentMethod {
  initiate(params: InitiateParams): Promise<InitiateResult>;
  confirm(ref: string): Promise<ConfirmResult>;
  cancel(ref: string): Promise<CancelResult>;
  getStatus(ref: string): Promise<StatusResult>;
}
```

## MockPADMethod Design (from Implementation Plan Step 3)
```typescript
export interface MockPADConfig {
  delayMs: number;       // simulated processing delay (default: 2000)
  failureRate: number;   // 0-1, probability of failure (default: 0.1)
}

export const DEFAULT_MOCK_PAD_CONFIG: MockPADConfig = {
  delayMs: 2000,
  failureRate: 0.1,
};

export type ScheduleSettlementFn = (
  delayMs: number,
  params: {
    providerRef: string;
    shouldFail: boolean;
    planEntryId: string;
  }
) => Promise<void>;
```

## Constraints (from CLAUDE.md + Spec)
1. **No `any` types** — all params and results must be fully typed. Use `Record<string, unknown>` instead.
2. **Dependency injection** — MockPADMethod's scheduler must be injectable for testability
3. **ConvexError for unknown methods** — `import { ConvexError } from "convex/values"`
4. **Interface-first design** — adding RotessaPADMethod (Phase 2+) must require zero changes to machines, rules, or registry lookup logic
5. **Pure TypeScript** — no `v.` validators in the interface file
6. **Strategy Pattern** — PaymentMethod implementations are interchangeable strategies

## Existing Codebase Conventions
- ConvexError import: `import { ConvexError } from "convex/values";`
- No `any` types — project enforces this
- File naming: camelCase for files (e.g., `mockPAD.ts`, not `mock-pad.ts`)
- Directory structure: `convex/payments/methods/` (new directory, needs creating)
- The `convex/payments/` directory does NOT exist yet — must create it
