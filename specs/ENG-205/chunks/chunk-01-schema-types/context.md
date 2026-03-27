# Chunk 01 Context: Schema & Types

## Goal
Add the `bankAccounts` table to the Convex schema and create the TypeScript types for bank account validation.

## T-001: Add `bankAccounts` table to `convex/schema.ts`

Insert the table definition BEFORE the `// DEMO TABLES` section (around line 1520). Place it after the `webhookEvents` table, in a new section header:

```typescript
// ══════════════════════════════════════════════════════════
// BANK ACCOUNTS — Pre-transfer validation (ENG-205)
// ══════════════════════════════════════════════════════════

bankAccounts: defineTable({
  ownerType: v.union(
    v.literal('borrower'),
    v.literal('lender'),
    v.literal('investor'),
    v.literal('trust')
  ),
  ownerId: v.string(),
  institutionNumber: v.optional(v.string()), // 3 digits
  transitNumber: v.optional(v.string()),     // 5 digits
  accountNumber: v.optional(v.string()),     // masked
  accountLast4: v.optional(v.string()),
  country: v.optional(v.literal('CA')),
  currency: v.optional(v.literal('CAD')),
  status: v.union(
    v.literal('pending_validation'),
    v.literal('validated'),
    v.literal('revoked'),
    v.literal('rejected'),
  ),
  validationMethod: v.optional(v.union(
    v.literal('manual'),
    v.literal('micro_deposit'),
    v.literal('provider_verified'),
  )),
  mandateStatus: v.union(
    v.literal('not_required'),
    v.literal('pending'),
    v.literal('active'),
    v.literal('revoked'),
  ),
  isDefaultInbound: v.optional(v.boolean()),
  isDefaultOutbound: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  metadata: v.optional(v.any()),
})
  .index('by_owner', ['ownerType', 'ownerId'])
  .index('by_status', ['status']),
```

**Important:** The schema already imports `counterpartyTypeValidator` but the bankAccounts `ownerType` uses the same union values. You can use the validator inline since it matches the CounterpartyType union from transfer types.

After adding, run: `bunx convex codegen`

## T-002: Create `convex/payments/bankAccounts/types.ts`

Create directory `convex/payments/bankAccounts/` and add `types.ts`:

```typescript
// convex/payments/bankAccounts/types.ts
// Pure TypeScript — no Convex imports, no runtime deps.

export type BankAccountStatus = 'pending_validation' | 'validated' | 'revoked' | 'rejected';
export type MandateStatus = 'not_required' | 'pending' | 'active' | 'revoked';

export interface BankAccountValidationResult {
  valid: boolean;
  errorCode?: 'BANK_ACCOUNT_NOT_FOUND' | 'BANK_ACCOUNT_NOT_VALIDATED'
    | 'MANDATE_NOT_ACTIVE' | 'INVALID_ACCOUNT_FORMAT';
  errorMessage?: string;
}
```

## T-003: Add provider-code helpers to `types.ts`

In the same `types.ts` file, add:

```typescript
import type { ProviderCode } from '../../transfers/types';

/** Provider codes that require bank account validation before initiation */
export const BANK_VALIDATION_REQUIRED_PROVIDERS = new Set<ProviderCode>([
  'pad_vopay', 'pad_rotessa', 'eft_vopay', 'mock_pad', 'mock_eft',
]);

/** Returns true if the provider code requires a validated bank account */
export function requiresBankAccountValidation(providerCode: ProviderCode): boolean {
  return BANK_VALIDATION_REQUIRED_PROVIDERS.has(providerCode);
}

/** PAD-specific providers that additionally require an active mandate */
const PAD_PROVIDERS = new Set<ProviderCode>(['pad_vopay', 'pad_rotessa', 'mock_pad']);

/** Returns true if the provider is a PAD provider (requires mandate check) */
export function isPadProvider(providerCode: ProviderCode): boolean {
  return PAD_PROVIDERS.has(providerCode);
}
```

**Existing provider codes** (from `convex/payments/transfers/types.ts`):
```typescript
export const PROVIDER_CODES = [
  "manual", "mock_pad", "mock_eft", "pad_vopay",
  "pad_rotessa", "eft_vopay", "e_transfer", "wire", "plaid_transfer",
] as const;
```

## Validation
- `bunx convex codegen` passes
- `bun typecheck` passes
