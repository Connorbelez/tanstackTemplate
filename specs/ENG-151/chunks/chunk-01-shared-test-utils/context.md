# Chunk 01 Context: Shared Test Utilities

## Goal
Extract common helpers from existing test files into a shared `testUtils.ts` to reduce duplication across all new test files. The `.ts` extension is required because Biome's `noExportsInTest` rule prohibits exports from `.test.ts` files.

## File to Create
`convex/payments/cashLedger/__tests__/testUtils.ts`

## Pattern from Existing Tests
Every existing test file duplicates these patterns:

```typescript
const modules = import.meta.glob("/convex/**/*.ts");
const SYSTEM_SOURCE = { channel: "scheduler" as const, actorId: "system", actorType: "system" as const };
const ADMIN_SOURCE = { channel: "admin_dashboard" as const, actorId: "admin-user-123", actorType: "admin" as const };

function createHarness() { return convexTest(schema, modules); }
type TestHarness = ReturnType<typeof convexTest>;
```

The `seedCoreEntities` function in `integration.test.ts` creates users, brokers, borrowers, lenders, properties, mortgages, and ownership ledger accounts. This is the most complete seeding function and should be the base for our shared helper.

## What to Include in testUtils.ts

### Constants
- `SYSTEM_SOURCE` — `{ channel: "scheduler", actorId: "system", actorType: "system" }`
- `ADMIN_SOURCE` — `{ channel: "admin_dashboard", actorId: "admin-user-123", actorType: "admin" }`
- `ADMIN_IDENTITY` — For authed query tests: `{ name: "Admin", email: "admin@fairlend.test", tokenIdentifier: "test-admin", subject: "test-admin" }`

### `createHarness()`
```typescript
export function createHarness() { return convexTest(schema, modules); }
export type TestHarness = ReturnType<typeof createHarness>;
```

### `seedMinimalEntities(t: TestHarness)`
Returns `{ mortgageId, borrowerId, lenderAId, lenderBId, obligationId }`.
Must create:
- 1 broker user + broker record
- 1 borrower user + borrower record
- 2 lender users + lender records (A: 60% ownership, B: 40%)
- 1 property
- 1 mortgage (monthly, $100k payment, 8% rate, 1% servicing)
- 2 POSITION ledger accounts (6000/4000 units for lender A/B)
- 1 obligation (upcoming, $100k, regular_interest)

### `createTestAccount(t, spec)`
Wraps `getOrCreateCashAccount` in a `t.run` for convenience. Accepts `{ family, mortgageId?, obligationId?, lenderId?, borrowerId?, subaccount?, initialDebitBalance?, initialCreditBalance? }`.

### `postTestEntry(t, args)`
Wraps `postCashEntryInternal` in a `t.run`. This lets tests call it without nesting inside `t.run` manually.

## Key Imports Needed
```typescript
import { convexTest } from "convex-test";
import schema from "../../../schema";
import type { Id } from "../../../_generated/dataModel";
import { getOrCreateCashAccount } from "../accounts";
import { postCashEntryInternal, type PostCashEntryInput } from "../postEntry";
import type { CashAccountFamily, ControlSubaccount } from "../types";
import type { CommandSource } from "../../../engine/types";
```

## CommandSource Type
```typescript
interface CommandSource {
  actorId?: string;
  actorType?: "borrower" | "broker" | "member" | "admin" | "system";
  channel: "borrower_portal" | "broker_portal" | "onboarding_portal" | "admin_dashboard" | "api_webhook" | "scheduler" | "simulation";
  ip?: string;
  sessionId?: string;
}
```

## Constraints
- File extension MUST be `.ts` (not `.test.ts`) to avoid Biome `noExportsInTest` lint errors
- No `any` types
- All monetary amounts as integers (cents)
- Export everything — other test files will import from here
