# Chunk Context: resource-checks

Source: Linear ENG-6, Notion implementation plan + linked architecture pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Objective
Implement **Layer 2 authorization** — resource-level access checks that answer *"Does this authenticated user have a relationship to this specific resource?"* This builds on the `ctx.viewer` Viewer object from ENG-2 and adds entity-relationship-based ownership verification for every core domain resource.

### Architecture Overview
```
Layer 1: IDENTITY & ROLE (WorkOS RBAC → JWT)
  "What type of user is this?"
  Checked: instantly, from session token

Layer 2: RESOURCE OWNERSHIP (Convex DB relationships)  ← THIS CHUNK
  "Does this user have a relationship to this resource?"
  Checked: in Convex query/mutation, from indexes

Layer 3: BUSINESS RULES (Convex domain logic + Governed Transitions)
  "Is this action allowed given the current state?"
```

**Key design decisions:**
- All `canAccess*` functions return `boolean` (not throw). The caller decides error handling — a query may filter silently, a mutation should throw `ConvexError`.
- The `Viewer` is a **serialized plain object** on `ctx.viewer` — not a class with methods.
- Role/permission checks use `Set.has()`: e.g. `viewer.roles.has("lender")`, `viewer.permissions.has("ledger:view")`.
- `viewer.isFairLendAdmin` is a pre-computed `boolean`, NOT a function call.

### Resource Ownership Checks — Access Rules

#### canAccessMortgage(ctx, viewer, mortgageId)
| Role | Relationship Check |
|------|-------------------|
| admin (FairLend Staff) | Always `true` (via `viewer.isFairLendAdmin`) |
| borrower | Has row in `mortgageBorrowers` linking their borrower profile to this mortgage |
| broker | `mortgage.brokerOfRecordId` or `mortgage.assignedBrokerId` matches their broker profile |
| lender | Holds a POSITION ledger account for this mortgage with positive balance |
| lawyer | `closingTeamAssignments` row exists for `(userId, mortgageId)` |

**IMPORTANT: Schema discrepancy from Notion plan:**
- Plan says `mortgage.borrowerId` but actual schema uses `mortgageBorrowers` join table (many-to-many with role: primary/co_borrower/guarantor)
- Plan says `mortgage.brokerId` but actual schema has `brokerOfRecordId: v.id("brokers")` and `assignedBrokerId: v.optional(v.id("brokers"))`
- Borrower lookup: `viewer.authId` → lookup `users` table by authId → lookup `borrowers` table by userId → query `mortgageBorrowers` by borrowerId
- Broker lookup: `viewer.authId` → lookup `users` table by authId → lookup `brokers` table by userId → compare broker._id with mortgage.brokerOfRecordId/assignedBrokerId

#### canAccessDeal(ctx, viewer, dealId)
| Role | Relationship Check |
|------|-------------------|
| admin (FairLend Staff) | Always `true` |
| broker | Deal's mortgage broker matches viewer |
| lender | Is buyer or seller on the deal (`deal.buyerId` or `deal.sellerId` — these are WorkOS authIds) |
| lawyer | Has `closingTeamAssignment` for the deal's mortgage, OR has `dealAccess` record with `status === "active"` |

#### canAccessLedgerPosition(ctx, viewer, mortgageId)
| Role | Relationship Check |
|------|-------------------|
| admin (FairLend Staff) | Always `true` |
| lender | Holds a POSITION account for this mortgage |
| broker | The mortgage's broker matches viewer |

#### canAccessAccrual(ctx, viewer, investorId)
- admin → `true`
- lender → `investorId === viewer.authId` (investorId is an authId string)
- broker → investor is their client (requires: lookup lender by authId, check lender.brokerId matches viewer's broker profile)

#### canAccessDispersal(ctx, viewer, investorId)
- admin → `true`
- lender → `investorId === viewer.authId`
- No broker access (dispersals are lender-only + admin)

#### canAccessDocument(ctx, viewer, documentId)
**BLOCKED by ENG-144** — `generatedDocuments` table not yet defined.
- Create a stub that returns `true` for admin, `false` for everyone else
- Add a TODO comment referencing ENG-144
- Document the intended behavior: walk parent chain (document → mortgage/application), delegate to parent's canAccess* function

#### canAccessApplicationPackage(ctx, viewer, packageId)
| Role | Condition | Access |
|------|-----------|--------|
| admin (FairLend Staff) | Always | `true` |
| sr_underwriter | Full queue visibility | `true` |
| jr_underwriter / underwriter | Package in pool (`assembled` status) | `true` |
| jr_underwriter / underwriter | Package `under_review` AND `machineContext.claimedBy === viewer.authId` | `true` |
| Anyone with `underwriting:review_decisions` | Package in `decision_pending_review` | `true` |
| All others | — | `false` |

### Helper Utilities

```typescript
// Get all mortgage IDs where a lender holds a POSITION account with positive balance
async function getLenderMortgageIds(
  ctx: QueryCtx,
  lenderId: string
): Promise<Set<Id<"mortgages">>>

// Check if viewer is the broker for a given mortgage
async function isBrokerForMortgage(
  ctx: QueryCtx,
  viewer: Viewer,
  mortgageId: Id<"mortgages">
): Promise<boolean>
```

### Naming Renames
Three renames required across codebase:
| Old Name | New Name | Scope |
|----------|----------|-------|
| `investor` (role references) | `lender` | Role checks, variable names, function names |
| `isPlatformAdmin` | `isFairLendAdmin` | Method name on Viewer, all call sites |
| `uw_manager` | `sr_underwriter` | Role slug references |

**Current state from codebase analysis:**
- `isFairLendAdmin` already exists on the Viewer ✅
- `lenderQuery` / `lenderMutation` chains already exist ✅
- No references to `isPlatformAdmin` found in current code ✅
- `investorId` field exists on `ledger_accounts` — this is a **schema field name**, not a role reference. **Do NOT rename** schema fields — that would require a data migration.
- `LegacyOwnedLedgerAccount` in `convex/ledger/accountOwnership.ts` has `investorId` as a legacy field — do NOT rename, it's for backwards compatibility with existing data.
- `uw_manager` is already excluded from constants.ts ✅

**Strategy:**
1. Run `bun check` to see current state
2. Use grep to find all remaining `investor`, `isPlatformAdmin`, `uw_manager` references
3. Rename role string literals only (not schema field names like `investorId`)
4. Run `bun typecheck` after each batch

## Schema Context (Verbatim from convex/schema.ts)

### Viewer Interface (from convex/fluent.ts)
```typescript
export interface Viewer {
  authId: string;                    // WorkOS subject ID
  email: string | undefined;
  firstName: string | undefined;
  isFairLendAdmin: boolean;          // role === "admin" && orgId === FAIRLEND_STAFF_ORG_ID
  lastName: string | undefined;
  orgId: string | undefined;         // WorkOS org_id
  orgName: string | undefined;
  permissions: Set<string>;          // Set-based, use .has()
  role: string | undefined;          // Single role from JWT
  roles: Set<string>;                // Set-based, use .has()
}
```

### Key Tables

#### mortgages (lines 414-469)
```typescript
mortgages: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  propertyId: v.id("properties"),
  principal: v.number(),
  interestRate: v.number(),
  // ... financial fields ...
  brokerOfRecordId: v.id("brokers"),        // ← NOT "brokerId"
  assignedBrokerId: v.optional(v.id("brokers")),  // ← optional secondary broker
  // ...
}).index("by_broker_of_record", ["brokerOfRecordId"])
  .index("by_assigned_broker", ["assignedBrokerId"])
```

#### mortgageBorrowers (lines 471-482) — JOIN TABLE
```typescript
mortgageBorrowers: defineTable({
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  role: v.union(v.literal("primary"), v.literal("co_borrower"), v.literal("guarantor")),
  addedAt: v.number(),
}).index("by_mortgage", ["mortgageId"])
  .index("by_borrower", ["borrowerId"])
```

#### borrowers (lines 99-117)
```typescript
borrowers: defineTable({
  status: v.string(),
  lastTransitionAt: v.optional(v.number()),
  userId: v.id("users"),    // ← links to users table
  // ...
}).index("by_user", ["userId"])
```

#### brokers (lines 77-97)
```typescript
brokers: defineTable({
  status: v.string(),
  lastTransitionAt: v.optional(v.number()),
  userId: v.id("users"),    // ← links to users table
  // ...
}).index("by_user", ["userId"])
```

#### lenders (lines 119-148)
```typescript
lenders: defineTable({
  userId: v.id("users"),    // ← links to users table
  brokerId: v.id("brokers"), // ← their managing broker
  accreditationStatus: v.union(...),
  status: v.string(),
  // ...
}).index("by_user", ["userId"])
  .index("by_broker", ["brokerId"])
```

#### users (lines 23-45)
```typescript
users: defineTable({
  authId: v.string(),       // ← WorkOS subject ID, matches viewer.authId
  email: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  // ...
}).index("authId", ["authId"])
```

#### ledger_accounts (lines 834-850)
```typescript
ledger_accounts: defineTable({
  type: v.union(v.literal("WORLD"), v.literal("TREASURY"), v.literal("POSITION")),
  mortgageId: v.optional(v.string()),
  lenderId: v.optional(v.string()),   // ← lender's authId (string, NOT Id<"lenders">)
  cumulativeDebits: v.int64(),
  cumulativeCredits: v.int64(),
  // ...
}).index("by_mortgage", ["mortgageId"])
  .index("by_lender", ["lenderId"])
  .index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
  .index("by_type_and_mortgage", ["type", "mortgageId"])
```

#### closingTeamAssignments (lines 746-758)
```typescript
closingTeamAssignments: defineTable({
  mortgageId: v.id("mortgages"),
  userId: v.string(),       // ← authId from WorkOS
  role: v.union(v.literal("closing_lawyer"), v.literal("reviewing_lawyer"), v.literal("notary")),
  assignedBy: v.string(),
  assignedAt: v.number(),
}).index("by_mortgage", ["mortgageId"])
  .index("by_user", ["userId"])
```

#### deals (lines 704-726)
```typescript
deals: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  mortgageId: v.id("mortgages"),
  buyerId: v.string(),      // ← WorkOS authId
  sellerId: v.string(),     // ← WorkOS authId
  fractionalShare: v.number(),
  lawyerId: v.optional(v.string()),
  lawyerType: v.optional(v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"))),
  createdAt: v.number(),
  createdBy: v.string(),
}).index("by_mortgage", ["mortgageId"])
  .index("by_buyer", ["buyerId"])
  .index("by_seller", ["sellerId"])
```

#### dealAccess (lines 728-744)
```typescript
dealAccess: defineTable({
  userId: v.string(),       // ← WorkOS authId
  dealId: v.id("deals"),
  role: v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"), v.literal("lender"), v.literal("borrower")),
  grantedAt: v.number(),
  grantedBy: v.string(),
  revokedAt: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("revoked")),
}).index("by_user_and_deal", ["userId", "dealId"])
  .index("by_deal", ["dealId"])
  .index("by_user", ["userId"])
```

#### applicationPackages (lines 619-637)
```typescript
applicationPackages: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),  // ← contains claimedBy for underwriter assignment
  lastTransitionAt: v.optional(v.number()),
  sourceApplicationId: v.id("provisionalApplications"),
  currentVersion: v.number(),
  borrowerId: v.id("borrowers"),
  brokerId: v.id("brokers"),
  closingDate: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_status", ["status"])
  .index("by_source_application", ["sourceApplicationId"])
  .index("by_broker", ["brokerId"])
```

## Existing Patterns

### Account Ownership Helper (convex/ledger/accountOwnership.ts)
```typescript
export interface LegacyOwnedLedgerAccount {
  _id?: string;
  investorId?: string;  // Legacy field name — do NOT rename
  lenderId?: string;
}

export function getAccountLenderId(account: LegacyOwnedLedgerAccount): string | undefined {
  return account.lenderId ?? account.investorId;
}
```

### Existing getLenderPositions query (convex/ledger/queries.ts)
Uses `by_lender` index + legacy fallback scan. The resourceChecks helper should use the same `by_lender` index but with a simpler implementation (no legacy fallback needed — new code can assume `lenderId` field).

### Balance computation (convex/ledger/internal.ts)
```typescript
function computeBalance(account): bigint
// Returns cumulativeDebits - cumulativeCredits
```

### Constants (convex/constants.ts)
```typescript
export const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
```

## Integration Points

### From ENG-2 (Done — Viewer rewrite)
- `ctx.viewer` is available on all authed chains
- `viewer.authId` is the WorkOS subject ID
- `viewer.roles` is a `Set<string>` — use `.has("lender")`, `.has("broker")`, etc.
- `viewer.isFairLendAdmin` is a `boolean` — NOT a function call

### From ENG-18 (Done — Schema)
- All tables referenced above exist in the schema
- `closingTeamAssignments` already defined

### ENG-144 (Todo — generatedDocuments)
- `generatedDocuments` table NOT yet defined
- `canAccessDocument` must be a stub until ENG-144 is completed

## Constraints & Rules

1. **All functions return boolean** — never throw. Caller decides error handling.
2. **Admin shortcut first** — `if (viewer.isFairLendAdmin) return true;` as first line of every function.
3. **Resource not found → false** — if `ctx.db.get(id)` returns null, return false (not throw).
4. **Do NOT rename schema field names** — `investorId` in `ledger_accounts` stays. Only rename role string literals.
5. **Use existing indexes** — don't query without indexes. All lookups should use defined indexes.
6. **viewer.authId identity chain** — to find a borrower/broker/lender profile from viewer.authId:
   - First find user: `ctx.db.query("users").withIndex("authId", q => q.eq("authId", viewer.authId)).unique()`
   - Then find profile: `ctx.db.query("borrowers").withIndex("by_user", q => q.eq("userId", user._id)).first()`

## File Structure

- `convex/auth/resourceChecks.ts` — **CREATE** — all canAccess* functions + helpers
- `convex/schema.ts` — **VERIFY ONLY** — closingTeamAssignments already exists
- `convex/fluent.ts` — **READ ONLY** — Viewer type reference
- Various files — **MODIFY** — naming renames if any found
