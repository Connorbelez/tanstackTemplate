# Chunk 3 Context: Tests, Reference Value, and Verification

## Scope
Validate behavior of the new mock provider and ensure its documentation value as the reference implementation for future providers.

## Test Expectations from ENG-220 / ENG-214 linkage
- Happy path async settlement confirmation
- Failure path with normalized failure code (e.g. NSF)
- Reversal path with compensating flow trigger shape
- Duplicate/idempotent webhook behavior support via deterministic event identifiers
- Immediate confirmation behavior for manual-like flows

## Existing Test Patterns to Follow
- Transfer tests are currently pure unit tests with deterministic fixtures under `convex/payments/transfers/__tests__/...`
- Provider adapter tests use constructor-level dependency injection and lightweight in-memory mocks
- Webhook tests validate mapping and payload shapes (`convex/payments/webhooks/__tests__/vopayWebhook.test.ts`)

## Documentation Requirements for `mock.ts`
Include concise comments that future provider authors can copy:
- Where external API calls belong (`initiate` path)
- How provider-specific responses map to `InitiateResult` / `StatusResult`
- Where provider error codes are normalized to platform error taxonomy
- Where amount conversion would occur at provider boundary (domain cents -> provider format)

## Completion Gate
After implementation and tests:
1. `bunx convex codegen`
2. `bun check`
3. `bun typecheck`
