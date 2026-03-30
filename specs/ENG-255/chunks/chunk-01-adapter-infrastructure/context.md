# Chunk 01 Context: Adapter Infrastructure

## Architecture Overview

System adapters present native Convex tables as metadata objects. The UI doesn't know the difference — a RecordTable renders a mortgage and a custom "Referral Source" identically. Native queries are ~10x more efficient than EAV (25 reads vs 275).

**Decision: Read-only for v1.** System adapter fields are `nativeReadOnly: true`. No write-through to native tables.

## Key Constraint: Convex Compile-Time Table Names

`ctx.db.query("mortgages")` works, but `ctx.db.query(tableName)` does NOT (TypeScript rejects it). The switch-statement pattern is the only viable approach. Each new native table requires a new case.

## Native Tables (6) — All have `by_org` and `by_org_status` indexes

### brokers
Fields: status, lastTransitionAt, userId, licenseId, licenseProvince, brokerageName, orgId, onboardedAt, createdAt

### borrowers
Fields: status, lastTransitionAt, orgId, userId, financialProfile, idvStatus, personaInquiryId, onboardedAt, createdAt

### lenders
Fields: userId, orgId, brokerId, accreditationStatus, idvStatus, kycStatus, personaInquiryId, onboardingEntryPath, onboardingId, status, activatedAt, payoutFrequency, lastPayoutDate, minimumPayoutCents, createdAt

### mortgages
Fields: orgId, status, machineContext, lastTransitionAt, propertyId, principal, interestRate, rateType, termMonths, amortizationMonths, paymentAmount, paymentFrequency, loanType, lienPosition, annualServicingRate, interestAdjustmentDate, termStartDate, maturityDate, firstPaymentDate, brokerOfRecordId, assignedBrokerId, priorMortgageId, isRenewal, simulationId, fundedAt, createdAt

### obligations
Fields: orgId, status, machineContext, lastTransitionAt, mortgageId, borrowerId, paymentNumber, type, amount, amountSettled, dueDate, gracePeriodEnd, sourceObligationId, postingGroupId, feeCode, mortgageFeeId, settledAt, createdAt

### deals
Fields: orgId, status, machineContext, lastTransitionAt, mortgageId, buyerId, sellerId, fractionalShare, closingDate, lockingFeeAmount, lawyerId, reservationId, lawyerType, lenderId, createdAt, createdBy

## String ID Inconsistencies (from ENG-218 audit)
- `deals.buyerId` / `sellerId` are WorkOS auth IDs (strings), NOT `Id<"lenders">`
- `ledger_accounts.lenderId` stores WorkOS auth ID, not `Id<"lenders">`
- `transferRequests.counterpartyId` is a domain ID string (not typed ref)
- **Adapter must handle BOTH** `Id<"table">` refs and string IDs when resolving

## Schema: objectDefs Table
```typescript
objectDefs: defineTable({
  orgId: v.string(),
  name: v.string(),
  singularLabel: v.string(),
  pluralLabel: v.string(),
  icon: v.string(),
  description: v.optional(v.string()),
  isSystem: v.boolean(),           // ← System flag
  nativeTable: v.optional(v.string()), // ← Points to native table
  isActive: v.boolean(),
  displayOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
})
```

## Schema: fieldDefs Table
```typescript
fieldDefs: defineTable({
  orgId: v.string(),
  objectDefId: v.id("objectDefs"),
  name: v.string(),
  label: v.string(),
  fieldType: fieldTypeValidator, // 14 types
  description: v.optional(v.string()),
  isRequired: v.boolean(),
  isUnique: v.boolean(),
  isActive: v.boolean(),
  displayOrder: v.number(),
  defaultValue: v.optional(v.string()),
  options: v.optional(v.array(selectOptionValidator)),
  nativeColumnPath: v.optional(v.string()), // ← Maps to native column
  nativeReadOnly: v.boolean(),              // ← Read-only flag
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

## Existing Types (convex/crm/types.ts — from main)
```typescript
export type UnifiedRecord = {
  _id: string;
  _kind: "record" | "native";
  objectDefId: Id<"objectDefs">;
  fields: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};
```

## Existing valueRouter.ts Pattern
```typescript
export type ValueTableName = "recordValuesText" | "recordValuesNumber" | ... ;

export function fieldTypeToTable(fieldType: FieldType): ValueTableName {
  switch (fieldType) {
    case "text": case "email": case "phone": case "url": return "recordValuesText";
    case "number": case "currency": case "percentage": return "recordValuesNumber";
    // ... etc with exhaustive never check
  }
}
```

## Design: columnResolver.ts

```typescript
import type { Doc } from "../../_generated/dataModel";

type FieldDef = Doc<"fieldDefs">;

/**
 * Resolves a native document field using the fieldDef's nativeColumnPath.
 * Handles nested paths (e.g., "terms.interestRate"), type coercion,
 * and string ID pass-through.
 *
 * Returns undefined for missing paths — never throws.
 */
export function resolveColumnPath(
  nativeDoc: Record<string, unknown>,
  fieldDef: FieldDef
): unknown {
  const path = fieldDef.nativeColumnPath;
  if (!path) return undefined;

  // Navigate nested path
  const segments = path.split(".");
  let current: unknown = nativeDoc;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  // Type coercion: string dates → unix ms for date/datetime fields
  if ((fieldDef.fieldType === "date" || fieldDef.fieldType === "datetime")
      && typeof current === "string") {
    const parsed = Date.parse(current);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  // All other values (including string IDs) pass through as-is
  // Id<"table"> objects have .toString() but are already strings in doc fields
  return current;
}
```

## Design: queryAdapter.ts

```typescript
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { UnifiedRecord } from "../types";
import { resolveColumnPath } from "./columnResolver";

type FieldDef = Doc<"fieldDefs">;
type ObjectDef = Doc<"objectDefs">;

/** All native tables that can be queried via system adapters. */
export type NativeTableName =
  | "mortgages"
  | "borrowers"
  | "lenders"
  | "brokers"
  | "deals"
  | "obligations";

/**
 * Routes a runtime table name to a compile-time Convex query.
 * Each case uses the `by_org` index for org-scoped listing.
 */
export async function queryNativeTable(
  ctx: QueryCtx,
  tableName: string,
  orgId: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  switch (tableName) {
    case "mortgages":
      return ctx.db.query("mortgages").withIndex("by_org", q => q.eq("orgId", orgId)).take(limit);
    case "borrowers":
      return ctx.db.query("borrowers").withIndex("by_org", q => q.eq("orgId", orgId)).take(limit);
    case "lenders":
      return ctx.db.query("lenders").withIndex("by_org", q => q.eq("orgId", orgId)).take(limit);
    case "brokers":
      return ctx.db.query("brokers").withIndex("by_org", q => q.eq("orgId", orgId)).take(limit);
    case "deals":
      return ctx.db.query("deals").withIndex("by_org", q => q.eq("orgId", orgId)).take(limit);
    case "obligations":
      return ctx.db.query("obligations").withIndex("by_org", q => q.eq("orgId", orgId)).take(limit);
    default:
      throw new ConvexError(`Unknown native table: ${tableName}`);
  }
}

/**
 * Assembles UnifiedRecord[] from native table documents.
 * Uses fieldDef mappings with nativeColumnPath to extract fields.
 */
export async function queryNativeRecords(
  ctx: QueryCtx,
  objectDef: ObjectDef,
  fieldDefs: FieldDef[],
  orgId: string,
  limit: number
): Promise<UnifiedRecord[]> {
  if (!objectDef.nativeTable) {
    throw new ConvexError("System object missing nativeTable");
  }

  const nativeDocs = await queryNativeTable(ctx, objectDef.nativeTable, orgId, limit);

  return nativeDocs.map((doc) => {
    const fields: Record<string, unknown> = {};
    for (const fd of fieldDefs) {
      if (fd.nativeColumnPath) {
        fields[fd.name] = resolveColumnPath(doc as Record<string, unknown>, fd);
      }
    }
    return {
      _id: String(doc._id),
      _kind: "native" as const,
      objectDefId: objectDef._id,
      fields,
      createdAt: (doc.createdAt as number) ?? (doc._creationTime as number),
      updatedAt: (doc._creationTime as number),
    };
  });
}
```

## Constraints & Gotchas
1. **No `any` types** — use `unknown` for field values
2. **mortgages.maturityDate is v.string()** (YYYY-MM-DD) but fieldType "date" expects unix ms — columnResolver must coerce
3. **String ID inconsistencies** — deals.buyerId/sellerId are WorkOS auth IDs, NOT Id<"lenders">
4. **orgId is v.optional(v.string())** — by_org index naturally excludes records where orgId is undefined. This is correct.
5. **createdAt** may not exist on all native docs — fall back to `_creationTime`
