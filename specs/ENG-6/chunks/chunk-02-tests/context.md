# Chunk Context: tests

Source: Linear ENG-6, Notion implementation plan + linked architecture pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Testing Framework

The project uses `convex-test` for testing Convex functions. Tests should use `convexTest` from `convex-test` with the schema.

### Test Infrastructure Pattern
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
```

### Viewer Interface (from convex/fluent.ts)
```typescript
export interface Viewer {
  authId: string;
  email: string | undefined;
  firstName: string | undefined;
  isFairLendAdmin: boolean;
  lastName: string | undefined;
  orgId: string | undefined;
  orgName: string | undefined;
  permissions: Set<string>;
  role: string | undefined;
  roles: Set<string>;
}
```

### Functions Under Test (convex/auth/resourceChecks.ts)
All functions have this signature pattern:
```typescript
async function canAccessMortgage(ctx: QueryCtx, viewer: Viewer, mortgageId: Id<"mortgages">): Promise<boolean>
async function canAccessDeal(ctx: QueryCtx, viewer: Viewer, dealId: Id<"deals">): Promise<boolean>
async function canAccessLedgerPosition(ctx: QueryCtx, viewer: Viewer, mortgageId: Id<"mortgages">): Promise<boolean>
async function canAccessAccrual(ctx: QueryCtx, viewer: Viewer, investorId: string): Promise<boolean>
async function canAccessDispersal(ctx: QueryCtx, viewer: Viewer, investorId: string): Promise<boolean>
async function canAccessApplicationPackage(ctx: QueryCtx, viewer: Viewer, packageId: Id<"applicationPackages">): Promise<boolean>
```

### Key Data Relationships for Test Fixtures

**Borrower → Mortgage:** via `mortgageBorrowers` join table
- Need: user (authId) → borrower (userId) → mortgageBorrower (borrowerId, mortgageId)

**Broker → Mortgage:** via `mortgage.brokerOfRecordId` or `mortgage.assignedBrokerId`
- Need: user (authId) → broker (userId) → mortgage (brokerOfRecordId: broker._id)

**Lender → Mortgage:** via `ledger_accounts` POSITION with positive balance
- Need: user (authId) → ledger_account (lenderId: authId, mortgageId, type: "POSITION", positive balance)

**Lawyer → Mortgage:** via `closingTeamAssignments`
- Need: closingTeamAssignment (userId: authId, mortgageId)

**Deal → Mortgage:** via `deal.mortgageId`
- Deal also has `buyerId` and `sellerId` (WorkOS authIds)

**Application Package:** has `status`, `machineContext.claimedBy`
- For underwriting queue tests: create packages in different states

### Test Cases from Implementation Plan

#### canAccessMortgage
| Test Case | Expected |
|-----------|----------|
| admin viewer | `true` |
| borrower owns mortgage | `true` |
| borrower does NOT own mortgage | `false` |
| broker assigned to mortgage | `true` |
| broker NOT assigned | `false` |
| lender holds position | `true` |
| lender no position | `false` |
| lawyer with assignment | `true` |
| lawyer without assignment | `false` |
| random authenticated user | `false` |

#### canAccessDeal
| Test Case | Expected |
|-----------|----------|
| admin | `true` |
| broker owns deal's mortgage | `true` |
| lender is buyer/seller | `true` |
| lawyer with closingTeamAssignment for deal's mortgage | `true` |
| lawyer with dealAccess record | `true` |
| other | `false` |

#### canAccessLedgerPosition
| Test Case | Expected |
|-----------|----------|
| admin | `true` |
| lender holds position | `true` |
| lender no position | `false` |
| broker for that mortgage | `true` |
| other | `false` |

#### canAccessAccrual
| Test Case | Expected |
|-----------|----------|
| admin | `true` |
| lender (own investorId) | `true` |
| lender (other investorId) | `false` |
| broker (client's accrual) | `true` |
| other | `false` |

#### canAccessDispersal
| Test Case | Expected |
|-----------|----------|
| admin | `true` |
| lender (own) | `true` |
| lender (other) | `false` |
| broker | `false` (no broker access to dispersals) |

#### canAccessApplicationPackage
| Test Case | Expected |
|-----------|----------|
| admin | `true` |
| sr_underwriter sees all | `true` |
| jr_uw sees pool (assembled) | `true` |
| jr_uw sees own claim (under_review, claimedBy matches) | `true` |
| jr_uw cannot see other's claim | `false` |
| reviewer sees decision_pending_review | `true` |

### Fixture Helpers Pattern

Create a `createTestViewer` factory:
```typescript
function createTestViewer(overrides: Partial<Viewer>): Viewer {
  return {
    authId: "test_auth_id",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    orgId: undefined,
    orgName: undefined,
    role: undefined,
    roles: new Set<string>(),
    permissions: new Set<string>(),
    isFairLendAdmin: false,
    ...overrides,
  };
}
```

### Important Testing Notes

1. **resourceChecks functions are NOT Convex-registered functions** — they're internal helpers. Tests need to call them within a Convex test context to get a valid `ctx.db`.
2. **Use `t.run()` from convex-test** to execute within a transaction context where `ctx.db` is available.
3. **Ledger accounts use int64** — `cumulativeDebits` and `cumulativeCredits` are `v.int64()`. Use `BigInt()` values in test fixtures.
4. **`lenderId` on ledger_accounts is an authId string** — NOT an `Id<"lenders">`. It's the WorkOS subject ID.
5. **broker/borrower profiles link via `userId: v.id("users")`** — need to create user records first, then profiles.

### Constants
```typescript
const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
```

## File Structure
- `convex/auth/__tests__/resourceChecks.test.ts` — **CREATE** — all unit tests
