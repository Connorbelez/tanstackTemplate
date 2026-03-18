# Chunk 2 Context: Tests + Quality Gate

## Test File
`convex/payments/__tests__/methods.test.ts`

## Test Structure (from Implementation Plan)
```typescript
describe("PaymentMethod interface compliance", () => {
  // Verify both implementations satisfy the interface contract
});

describe("ManualPaymentMethod", () => {
  it("initiate returns confirmed status immediately");
  it("providerRef contains planEntryId");
  it("confirm returns settledAt timestamp");
  it("cancel returns cancelled: true");
  it("getStatus returns confirmed");
});

describe("MockPADMethod", () => {
  it("initiate returns pending status");
  it("calls scheduleSettlement with correct delayMs");
  it("providerRef contains planEntryId");
  it("uses default config when none provided");
  it("respects custom delayMs");
  it("respects custom failureRate");
  it("confirm returns settledAt timestamp");
  it("cancel returns cancelled: true");
});

describe("Method Registry", () => {
  it('getPaymentMethod("manual") returns ManualPaymentMethod');
  it('getPaymentMethod("mock_pad") returns MockPADMethod');
  it("throws ConvexError for unknown method");
  it("createPaymentMethodRegistry injects scheduler correctly");
});
```

## Testing Conventions in This Project
- Test framework: Vitest
- Import pattern: `import { describe, it, expect, vi } from "vitest";`
- Use `vi.fn()` for mock functions (scheduler spy)
- ConvexError assertion: `expect(() => fn()).toThrow(ConvexError)` or check error message
- Tests live in `__tests__/` directories adjacent to the code

## Files Created in Chunk 1 (import from these)
- `convex/payments/methods/interface.ts` — PaymentMethod, InitiateParams, InitiateResult, ConfirmResult, CancelResult, StatusResult
- `convex/payments/methods/manual.ts` — ManualPaymentMethod class
- `convex/payments/methods/mockPAD.ts` — MockPADMethod class, MockPADConfig, DEFAULT_MOCK_PAD_CONFIG, ScheduleSettlementFn
- `convex/payments/methods/registry.ts` — getPaymentMethod(), createPaymentMethodRegistry(), PaymentMethodRegistryConfig

## Quality Gate Commands
1. `bun check` — lint + format (auto-fixes first, then reports)
2. `bun typecheck` — TypeScript type checking
3. `bunx convex codegen` — Convex code generation (ensure no regressions)
4. `bun run test -- convex/payments/__tests__/methods.test.ts` — targeted test
5. `bun run test` — full test suite (ensure no regressions)

## Key Testing Details

### ManualPaymentMethod
- `initiate()` returns `{ providerRef: "manual-{planEntryId}-{timestamp}", status: "confirmed" }`
- All methods are async (return Promises)
- No external dependencies

### MockPADMethod
- Constructor takes `ScheduleSettlementFn` + optional `Partial<MockPADConfig>`
- `initiate()` returns `{ status: "pending" }` and calls `scheduleSettlement` with `delayMs` from config
- `scheduleSettlement` receives `{ providerRef, shouldFail, planEntryId }`
- `shouldFail` is determined by `Math.random() < failureRate`
- Default config: `{ delayMs: 2000, failureRate: 0.1 }`

### Registry
- `getPaymentMethod("manual")` returns ManualPaymentMethod instance
- `getPaymentMethod("mock_pad")` returns MockPADMethod instance
- `getPaymentMethod("unknown")` throws `ConvexError("Unknown payment method: unknown")`
- `createPaymentMethodRegistry({ scheduleSettlement })` wires the scheduler to MockPADMethod

## Constraints
- No `any` types in tests either
- Use `vi.fn()` typed appropriately for ScheduleSettlementFn
