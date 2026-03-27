# Chunk 02 Context: Validation Logic & Queries

## Goal
Create the core validation function and the bank account query that powers it.

## T-004: Create `convex/payments/bankAccounts/validation.ts`

This is the heart of the feature — a pure validation function that checks bank account readiness before a transfer.

**File:** `convex/payments/bankAccounts/validation.ts`

The function signature must be an **internal query** (not a plain function) because:
- `initiateTransfer` is an **action** and cannot access `ctx.db` directly
- Actions call queries via `ctx.runQuery()`
- The validation must use the `by_owner` index to look up bank accounts

```typescript
// convex/payments/bankAccounts/validation.ts
import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import type { ProviderCode } from "../transfers/types";
import {
  type BankAccountValidationResult,
  isPadProvider,
  requiresBankAccountValidation,
} from "./types";

// Top-level regex constants (biome/useTopLevelRegex)
const INSTITUTION_RE = /^\d{3}$/;
const TRANSIT_RE = /^\d{5}$/;

/**
 * Validates that a counterparty has a bank account suitable for the given provider.
 *
 * Returns { valid: true } if:
 * - Provider doesn't require bank validation (manual, e_transfer, wire, plaid_transfer)
 * - OR bank account exists, is validated, mandate is active (for PAD), and format is correct
 */
export const validateBankAccountForTransfer = internalQuery({
  args: {
    counterpartyType: v.string(),
    counterpartyId: v.string(),
    providerCode: v.string(),
  },
  handler: async (ctx, args): Promise<BankAccountValidationResult> => {
    const providerCode = args.providerCode as ProviderCode;

    // 1. Skip if provider doesn't need bank validation
    if (!requiresBankAccountValidation(providerCode)) {
      return { valid: true };
    }

    // 2. Query bank account by owner
    const bankAccount = await ctx.db
      .query("bankAccounts")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", args.counterpartyType as any).eq("ownerId", args.counterpartyId)
      )
      .first();

    // 3. Check account exists
    if (!bankAccount) {
      return {
        valid: false,
        errorCode: 'BANK_ACCOUNT_NOT_FOUND',
        errorMessage: `No bank account found for ${args.counterpartyType} ${args.counterpartyId}. A validated bank account is required for ${providerCode} transfers.`,
      };
    }

    // 4. Check status === 'validated'
    if (bankAccount.status !== 'validated') {
      return {
        valid: false,
        errorCode: 'BANK_ACCOUNT_NOT_VALIDATED',
        errorMessage: `Bank account status is "${bankAccount.status}" — must be "validated" for ${providerCode} transfers.`,
      };
    }

    // 5. For PAD providers: check mandateStatus === 'active'
    if (isPadProvider(providerCode) && bankAccount.mandateStatus !== 'active') {
      return {
        valid: false,
        errorCode: 'MANDATE_NOT_ACTIVE',
        errorMessage: `PAD mandate status is "${bankAccount.mandateStatus}" — must be "active" for ${providerCode} transfers.`,
      };
    }

    // 6. Validate account format if institution/transit numbers present
    if (bankAccount.institutionNumber && !INSTITUTION_RE.test(bankAccount.institutionNumber)) {
      return {
        valid: false,
        errorCode: 'INVALID_ACCOUNT_FORMAT',
        errorMessage: `Institution number "${bankAccount.institutionNumber}" must be exactly 3 digits.`,
      };
    }
    if (bankAccount.transitNumber && !TRANSIT_RE.test(bankAccount.transitNumber)) {
      return {
        valid: false,
        errorCode: 'INVALID_ACCOUNT_FORMAT',
        errorMessage: `Transit number "${bankAccount.transitNumber}" must be exactly 5 digits.`,
      };
    }

    return { valid: true };
  },
});
```

**IMPORTANT NOTE on the `as any` cast for `ownerType`:**
The `counterpartyType` arg comes in as `string` from the action caller. The `by_owner` index expects the union literal type. Convex queries filter at runtime regardless of TypeScript types — the cast is safe here. The alternative (using a union validator on the arg) is also acceptable but adds coupling to the counterpartyType validator import chain.

A cleaner approach: import `counterpartyTypeValidator` from `../transfers/validators` and use it on the `counterpartyType` arg. This way the cast is unnecessary. **Prefer this approach.**

## T-005: Create `convex/payments/bankAccounts/queries.ts`

Simple query for admin use — fetching bank accounts by owner.

```typescript
// convex/payments/bankAccounts/queries.ts
import { v } from "convex/values";
import { paymentQuery } from "../../fluent";

/** Lists bank accounts for a given owner. */
export const listBankAccountsByOwner = paymentQuery
  .input({
    ownerType: v.string(),
    ownerId: v.string(),
  })
  .handler(async (ctx, args) => {
    return ctx.db
      .query("bankAccounts")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", args.ownerType as any).eq("ownerId", args.ownerId)
      )
      .collect();
  })
  .public();
```

**Note:** `paymentQuery` already enforces `payment:view` permission via the fluent middleware chain in `convex/fluent.ts`:
```typescript
export const paymentQuery = authedQuery.use(requirePermission("payment:view"));
```

## Existing Codebase Patterns

### How actions call queries (from `initiateTransfer` in mutations.ts):
```typescript
const transfer = await ctx.runQuery(
  internal.payments.transfers.queries.getTransferInternal,
  { transferId: args.transferId }
);
```

### How internal queries are defined (from `queries.ts`):
```typescript
export const getTransferInternal = internalQuery({
  args: { transferId: v.id("transferRequests") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.transferId);
  },
});
```

## Validation
- `bun typecheck` passes
- `bunx convex codegen` passes
