# Chunk 1 Context: Transfer Machine & Provider Registry Unit Tests

## Goal
Write comprehensive pure unit tests for the transfer state machine (all valid/invalid transitions) and the provider registry (all provider code resolution paths).

## Transfer Machine

**File:** `convex/engine/machines/transfer.machine.ts`

The transfer machine uses XState v5 pure functional API. States and transitions:

```
States: initiated, pending, processing, confirmed, failed (final), cancelled (final), reversed (final)

Valid transitions:
- initiated + PROVIDER_INITIATED → pending (action: recordTransferProviderRef)
- initiated + FUNDS_SETTLED → confirmed (action: publishTransferConfirmed) [immediate providers]
- initiated + TRANSFER_CANCELLED → cancelled
- pending + PROVIDER_ACKNOWLEDGED → pending (no-op, stays in same state)
- pending + PROCESSING_UPDATE → processing
- pending + FUNDS_SETTLED → confirmed (action: publishTransferConfirmed)
- pending + TRANSFER_FAILED → failed (action: publishTransferFailed)
- processing + FUNDS_SETTLED → confirmed (action: publishTransferConfirmed)
- processing + TRANSFER_FAILED → failed (action: publishTransferFailed)
- confirmed + TRANSFER_REVERSED → reversed (action: publishTransferReversed)

Invalid transitions (should NOT change state):
- initiated + TRANSFER_FAILED → stay initiated
- initiated + TRANSFER_REVERSED → stay initiated
- initiated + PROCESSING_UPDATE → stay initiated
- initiated + PROVIDER_ACKNOWLEDGED → stay initiated
- pending + TRANSFER_CANCELLED → stay pending
- pending + TRANSFER_REVERSED → stay pending
- pending + PROVIDER_INITIATED → stay pending
- processing + TRANSFER_CANCELLED → stay processing
- processing + TRANSFER_REVERSED → stay processing
- processing + PROVIDER_INITIATED → stay processing
- processing + PROVIDER_ACKNOWLEDGED → stay processing
- processing + PROCESSING_UPDATE → stay processing
- confirmed + FUNDS_SETTLED → stay confirmed (already confirmed)
- confirmed + TRANSFER_FAILED → stay confirmed
- confirmed + TRANSFER_CANCELLED → stay confirmed
- confirmed + PROVIDER_INITIATED → stay confirmed
- failed → no events accepted (final state)
- cancelled → no events accepted (final state)
- reversed → no events accepted (final state)
```

### Testing Pattern
Use XState's `transition()` function for pure state computation:
```typescript
import { transition } from "xstate";
import { transferMachine } from "../transfer.machine";

const initial = transferMachine.resolveState({ value: "initiated", context: { transferId: "", providerRef: "", retryCount: 0 } });
const [nextState] = transition(transferMachine, initial, { type: "PROVIDER_INITIATED", providerRef: "ref-001" });
expect(nextState.value).toBe("pending");
```

For invalid transitions, the state should not change:
```typescript
const [nextState] = transition(transferMachine, initial, { type: "TRANSFER_FAILED", errorCode: "NSF", reason: "test" });
expect(nextState.value).toBe("initiated"); // unchanged
```

### Actions to verify
Actions are placeholders resolved by the GT effect registry. Verify they are listed in the correct transitions:
- `recordTransferProviderRef` — only on PROVIDER_INITIATED from initiated
- `publishTransferConfirmed` — on FUNDS_SETTLED from initiated, pending, processing
- `publishTransferFailed` — on TRANSFER_FAILED from pending, processing
- `publishTransferReversed` — on TRANSFER_REVERSED from confirmed

## Provider Registry

**File:** `convex/payments/transfers/providers/registry.ts`

The registry is a simple factory function `getTransferProvider(providerCode)` that returns a `TransferProvider` instance.

**Current implementation:**
```typescript
case "manual": return new ManualTransferProvider()
case "mock_pad":
case "mock_eft":
  // gated by areMockProvidersEnabled()
  return new MockTransferProvider()
default: throw new Error("not yet implemented")
```

**Provider codes from types.ts:**
```typescript
export const PROVIDER_CODES = [
  "manual", "mock_pad", "mock_eft",
  "pad_vopay", "pad_rotessa", "eft_vopay",
  "e_transfer", "wire", "plaid_transfer"
] as const;
```

### Mock provider gating
**File:** `convex/payments/transfers/mockProviders.ts`

```typescript
export function areMockProvidersEnabled(): boolean {
  return process.env.ENABLE_MOCK_PROVIDERS === "true";
}
```

### Test cases for registry:
1. `manual` → returns ManualTransferProvider
2. `mock_pad` with ENABLE_MOCK_PROVIDERS=true → returns MockTransferProvider
3. `mock_eft` with ENABLE_MOCK_PROVIDERS=true → returns MockTransferProvider
4. `mock_pad` without env var → throws (production guard)
5. `pad_vopay` / `pad_rotessa` / `eft_vopay` / `e_transfer` / `wire` / `plaid_transfer` → throws "not yet implemented"
6. Unknown string → throws

### Test output files:
- `convex/payments/transfers/__tests__/transferMachine.test.ts` — state machine transition coverage
- `convex/payments/transfers/providers/__tests__/registry.test.ts` — provider registry tests

### Existing tests NOT to modify:
- `convex/payments/transfers/providers/__tests__/mock.test.ts` — MockTransferProvider is already well-tested
- `convex/payments/transfers/providers/__tests__/adapter.test.ts` — PaymentMethodAdapter already tested
- `convex/engine/effects/__tests__/transfer.test.ts` — effect registry presence already tested
