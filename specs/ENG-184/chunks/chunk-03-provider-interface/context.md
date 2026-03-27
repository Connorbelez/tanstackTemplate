# Chunk 3 Context: Provider Interface & Manual Provider

## Goal
Define the `TransferProvider` strategy interface, implement `ManualTransferProvider` for bidirectional immediate confirmation, create the provider registry, and build the backward-compat adapter.

---

## T-009: Create `convex/payments/transfers/interface.ts`

Define the `TransferProvider` strategy interface and the `TransferRequestInput` contract. These are pure TypeScript — no Convex runtime imports.

```typescript
import type { Id } from "../../_generated/dataModel";
import type { CommandSource } from "../../engine/types";
import type { TransferDirection, TransferType, CounterpartyType, ProviderCode } from "./types";

/** Input for creating a transfer request */
export interface TransferRequestInput {
  direction: TransferDirection;
  transferType: TransferType;
  amount: number; // safe-integer cents — MUST be a positive integer
  currency: 'CAD';
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  bankAccountRef?: string;
  references: {
    mortgageId?: Id<"mortgages">;
    obligationId?: Id<"obligations">;
    dealId?: Id<"deals">;
    dispersalEntryId?: Id<"dispersalEntries">;
    planEntryId?: Id<"collectionPlanEntries">;
    collectionAttemptId?: Id<"collectionAttempts">;
  };
  providerCode: ProviderCode;
  idempotencyKey: string;
  source: CommandSource;
  metadata?: Record<string, unknown>;
  // Multi-leg
  pipelineId?: string;
  legNumber?: number;
}

/** Result of provider initiation */
export interface InitiateResult {
  providerRef: string;
  status: 'pending' | 'confirmed';
}

/** Result of provider confirmation */
export interface ConfirmResult {
  providerRef: string;
  settledAt: number;
  settledAmount?: number;
  providerData?: Record<string, unknown>;
}

/** Result of provider cancellation */
export interface CancelResult {
  cancelled: boolean;
}

/** Result of provider status check */
export interface StatusResult {
  status: string;
  providerData?: Record<string, unknown>;
}

/** Strategy interface for all payment providers */
export interface TransferProvider {
  initiate(request: TransferRequestInput): Promise<InitiateResult>;
  confirm(providerRef: string): Promise<ConfirmResult>;
  cancel(providerRef: string): Promise<CancelResult>;
  getStatus(providerRef: string): Promise<StatusResult>;
}
```

**Decision D2 applies:** Use `CommandSource` (from `convex/engine/types.ts`) as the source type, NOT the spec's `{ type, actor, channel }`.

---

## T-010: Create `convex/payments/transfers/providers/manual.ts`

Implement `ManualTransferProvider` supporting BOTH inbound and outbound with immediate confirmation.

Follow the existing `ManualPaymentMethod` pattern:
```typescript
// Existing ManualPaymentMethod (convex/payments/methods/manual.ts):
export class ManualPaymentMethod implements PaymentMethod {
  async initiate(params: InitiateParams): Promise<InitiateResult> {
    return {
      providerRef: `manual_${params.planEntryId}_${crypto.randomUUID()}`,
      status: "confirmed",
    };
  }
  // ...
}
```

The new `ManualTransferProvider` should:
- Return `status: "confirmed"` from `initiate()` (immediate confirmation shortcut)
- Generate `providerRef: "manual_{transferType}_{uuid}"`
- Work for both inbound and outbound directions
- Bypass provider APIs but NOT domain controls (foot gun #8 from spec)

---

## T-011: Create `convex/payments/transfers/providers/registry.ts`

Create a DI factory for provider resolution by provider code.

Follow the existing `createPaymentMethodRegistry` pattern from `convex/payments/methods/registry.ts`:
```typescript
export function createPaymentMethodRegistry(
  config: PaymentMethodRegistryConfig
): (method: string) => PaymentMethod {
  return (method: string) =>
    buildMethod(method, config.scheduleSettlement, config.mockPADConfig);
}
```

The new registry should:
- Accept a provider code string and return a `TransferProvider`
- Phase 1 supports only `manual` — throw for unknown codes
- Export `getTransferProvider(providerCode: string): TransferProvider`
- Use the Strategy pattern — no switch statements in business logic

---

## T-012: Create `convex/payments/transfers/providers/adapter.ts`

Create `PaymentMethodAdapter` that wraps existing `PaymentMethod` implementations in the `TransferProvider` interface.

```typescript
import type { PaymentMethod, InitiateParams } from "../../methods/interface";
import type { TransferProvider, TransferRequestInput, InitiateResult, ConfirmResult, CancelResult, StatusResult } from "../interface";

/** Bridges existing PaymentMethod implementations to the TransferProvider interface */
export class PaymentMethodAdapter implements TransferProvider {
  constructor(private inner: PaymentMethod) {}

  async initiate(request: TransferRequestInput): Promise<InitiateResult> {
    // Extract collection-specific fields from TransferRequest
    const params: InitiateParams = {
      amount: request.amount,
      borrowerId: request.counterpartyId,
      mortgageId: request.references.mortgageId as unknown as string ?? '',
      planEntryId: request.references.planEntryId as unknown as string ?? '',
      method: request.providerCode,
      metadata: request.metadata,
    };
    return this.inner.initiate(params);
  }

  async confirm(ref: string): Promise<ConfirmResult> {
    return this.inner.confirm(ref);
  }

  async cancel(ref: string): Promise<CancelResult> {
    return this.inner.cancel(ref);
  }

  async getStatus(ref: string): Promise<StatusResult> {
    return this.inner.getStatus(ref);
  }
}
```

This adapter is a TEMPORARY bridge (Phase M2a). After all collection flows migrate to `TransferProvider` natively, the adapter and old `PaymentMethod` interface are removed.

---

## Existing PaymentMethod Interface (for reference)
```typescript
// convex/payments/methods/interface.ts
export interface InitiateParams {
  amount: number;
  borrowerId: string;
  metadata?: Record<string, unknown>;
  method: string;
  mortgageId: string;
  planEntryId: string;
}

export interface PaymentMethod {
  cancel(ref: string): Promise<CancelResult>;
  confirm(ref: string): Promise<ConfirmResult>;
  getStatus(ref: string): Promise<StatusResult>;
  initiate(params: InitiateParams): Promise<InitiateResult>;
}
```
