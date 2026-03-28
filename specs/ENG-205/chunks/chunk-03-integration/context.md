# Chunk 03 Context: Integration & Seed Mutation

## Goal
Wire the validation gate into both `initiateTransfer` paths and create the admin seed mutation.

## T-006: Wire validation into `initiateTransfer` (public action)

**File:** `convex/payments/transfers/mutations.ts`
**Location:** Inside `initiateTransfer` handler (starts at line 225), AFTER loading the transfer record and BEFORE building the `TransferRequestInput` / calling `provider.initiate()`.

The validation must be inserted between lines 258 and 260 (after counterpartyId validation, before building the input object).

**Insert this block:**
```typescript
// ── Bank account validation gate (ENG-205) ────────────────────
const bankValidation = await ctx.runQuery(
  internal.payments.bankAccounts.validation.validateBankAccountForTransfer,
  {
    counterpartyType: transfer.counterpartyType,
    counterpartyId: transfer.counterpartyId,
    providerCode: transfer.providerCode,
  }
);
if (!bankValidation.valid) {
  throw new ConvexError({
    code: bankValidation.errorCode,
    message: bankValidation.errorMessage ?? "Bank account validation failed",
  });
}
```

**Full `initiateTransfer` action for reference (current code):**
```typescript
export const initiateTransfer = paymentAction
  .input({
    transferId: v.id("transferRequests"),
  })
  .handler(async (ctx, args): Promise<TransitionResult> => {
    // 1. Load transfer record
    const transfer = await ctx.runQuery(
      internal.payments.transfers.queries.getTransferInternal,
      { transferId: args.transferId }
    );
    if (!transfer) {
      throw new ConvexError("Transfer request not found");
    }
    if (transfer.status !== "initiated") {
      throw new ConvexError(
        `Transfer must be in "initiated" status to initiate, currently: "${transfer.status}"`
      );
    }

    // 2. Resolve provider
    const provider = getTransferProvider(transfer.providerCode);

    // 3. Validate counterpartyId
    let counterpartyId: TransferRequestInput["counterpartyId"];
    try {
      counterpartyId = toDomainEntityId(transfer.counterpartyId, "counterpartyId");
    } catch (error) {
      if (error instanceof InvalidDomainEntityIdError) {
        throw new ConvexError(error.message);
      }
      throw error;
    }

    // >>> INSERT BANK ACCOUNT VALIDATION HERE <<<

    // 4. Build input and initiate
    const input: TransferRequestInput = { ... };
    const result = await provider.initiate(input);
    // ... rest of handler
  })
  .public();
```

**Important:** The import for `internal` already exists at the top of the file. You just need to ensure the `internal.payments.bankAccounts.validation` path resolves after `bunx convex codegen`.

## T-007: Wire validation into `initiateTransferInternal` (system action)

**File:** `convex/payments/transfers/mutations.ts`
**Location:** Inside `initiateTransferInternal` handler (starts at line 447), same position — after counterpartyId validation, before building input.

**Insert the exact same validation block** (between lines 479 and 481):
```typescript
// ── Bank account validation gate (ENG-205) ────────────────────
const bankValidation = await ctx.runQuery(
  internal.payments.bankAccounts.validation.validateBankAccountForTransfer,
  {
    counterpartyType: transfer.counterpartyType,
    counterpartyId: transfer.counterpartyId,
    providerCode: transfer.providerCode,
  }
);
if (!bankValidation.valid) {
  throw new ConvexError({
    code: bankValidation.errorCode,
    message: bankValidation.errorMessage ?? "Bank account validation failed",
  });
}
```

**Both paths need the gate** because:
- `initiateTransfer` = admin-facing, RBAC-gated
- `initiateTransferInternal` = system pipeline (deal closing), no RBAC but still needs bank validation

## T-008: Create `convex/payments/bankAccounts/mutations.ts`

Admin seed mutation for Phase 1. Uses `paymentMutation` (requires `payment:manage` permission).

```typescript
// convex/payments/bankAccounts/mutations.ts
import { ConvexError, v } from "convex/values";
import { paymentMutation } from "../../fluent";

// Top-level regex constants (biome/useTopLevelRegex)
const INSTITUTION_RE = /^\d{3}$/;
const TRANSIT_RE = /^\d{5}$/;

/**
 * Admin seed mutation — creates a bank account record for Phase 1 seeding.
 * Phase 2+ will add full CRUD through the Bank Account Vault.
 */
export const seedBankAccount = paymentMutation
  .input({
    ownerType: v.union(
      v.literal('borrower'),
      v.literal('lender'),
      v.literal('investor'),
      v.literal('trust')
    ),
    ownerId: v.string(),
    institutionNumber: v.optional(v.string()),
    transitNumber: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountLast4: v.optional(v.string()),
    status: v.union(
      v.literal('pending_validation'),
      v.literal('validated'),
      v.literal('revoked'),
      v.literal('rejected'),
    ),
    mandateStatus: v.union(
      v.literal('not_required'),
      v.literal('pending'),
      v.literal('active'),
      v.literal('revoked'),
    ),
    validationMethod: v.optional(v.union(
      v.literal('manual'),
      v.literal('micro_deposit'),
      v.literal('provider_verified'),
    )),
    isDefaultInbound: v.optional(v.boolean()),
    isDefaultOutbound: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  })
  .handler(async (ctx, args) => {
    // Validate format if provided
    if (args.institutionNumber && !INSTITUTION_RE.test(args.institutionNumber)) {
      throw new ConvexError("Institution number must be exactly 3 digits");
    }
    if (args.transitNumber && !TRANSIT_RE.test(args.transitNumber)) {
      throw new ConvexError("Transit number must be exactly 5 digits");
    }

    const now = Date.now();
    return ctx.db.insert("bankAccounts", {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      institutionNumber: args.institutionNumber,
      transitNumber: args.transitNumber,
      accountNumber: args.accountNumber,
      accountLast4: args.accountLast4,
      country: "CA",
      currency: "CAD",
      status: args.status,
      mandateStatus: args.mandateStatus,
      validationMethod: args.validationMethod,
      isDefaultInbound: args.isDefaultInbound,
      isDefaultOutbound: args.isDefaultOutbound,
      createdAt: now,
      metadata: args.metadata,
    });
  })
  .public();
```

## Key Patterns from Existing Code

### How `paymentMutation` is used (from `createTransferRequest`):
```typescript
export const createTransferRequest = paymentMutation
  .input({ ... })
  .handler(async (ctx, args) => { ... })
  .public();
```

### How `ConvexError` is used with structured error codes:
```typescript
throw new ConvexError({
  code: "BANK_ACCOUNT_NOT_FOUND",
  message: "No bank account found...",
});
```

### Internal import path for validation:
```typescript
import { internal } from "../../_generated/api";
// Then: internal.payments.bankAccounts.validation.validateBankAccountForTransfer
```

## Validation
- `bunx convex codegen` passes
- `bun typecheck` passes
- `bun check` passes
