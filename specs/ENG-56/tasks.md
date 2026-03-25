# ENG-56: PaymentMethod Interface + ManualPaymentMethod + MockPADMethod + Registry

## Master Task List

### Chunk 1: Interface, Implementations & Registry
- [x] T-001: Create `convex/payments/methods/interface.ts` — PaymentMethod interface + typed params/results (InitiateParams, InitiateResult, ConfirmResult, CancelResult, StatusResult)
- [x] T-002: Create `convex/payments/methods/manual.ts` — ManualPaymentMethod class implementing PaymentMethod. initiate returns `{ status: "confirmed" }` immediately.
- [x] T-003: Create `convex/payments/methods/mockPAD.ts` — MockPADMethod class with DI scheduler (ScheduleSettlementFn), configurable delayMs (default 2000) and failureRate (0-1, default 0.1). initiate returns `{ status: "pending" }`.
- [x] T-004: Create `convex/payments/methods/registry.ts` — Two-tier API: `getPaymentMethod(method)` simple lookup + `createPaymentMethodRegistry({ scheduleSettlement })` full DI. Unknown method throws ConvexError.

### Chunk 2: Tests + Quality Gate
- [x] T-005: Create `convex/payments/__tests__/methods.test.ts` — Full test suite covering ManualPaymentMethod, MockPADMethod, and registry. Interface compliance, DI scheduler verification, config overrides, ConvexError on unknown method.
- [x] T-006: Run quality gate — `bun check`, `bun typecheck`, `bunx convex codegen`, targeted test run.
