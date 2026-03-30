# ENG-255: System Adapter Infrastructure & UnifiedRecord — Task Breakdown

## Prerequisites
- [x] ENG-246: orgId + by_org indexes on all 6 native tables (Done, PR #341)
- [x] ENG-247: Control Plane Schema — objectDefs, fieldDefs (Done, PR #340)
- [x] ENG-251: Record Queries & Search — recordQueries.ts, types.ts (Done, PR #351 on main)

## Tasks

### T-001: Merge main branch
- **Action:** Merge main into working branch to get ENG-251 code (recordQueries.ts, types.ts)
- **Validation:** recordQueries.ts and types.ts exist in convex/crm/
- **Status:** [ ]

### T-002: Create columnResolver.ts
- **File:** `convex/crm/systemAdapters/columnResolver.ts`
- **Action:** Create new file
- **Details:**
  - `resolveColumnPath(nativeDoc, fieldDef)` — maps nativeColumnPath to document field
  - Split on `.` for nested path resolution (e.g., `"terms.interestRate"`)
  - Handle type coercion:
    - String dates (YYYY-MM-DD like mortgages.maturityDate) → unix ms for date fields
    - `Id<"table">` refs → string (toString)
    - String IDs (WorkOS auth IDs like deals.buyerId) → pass through
  - Return `undefined` for missing paths (don't throw)
  - No `any` types — use `unknown`
- **Status:** [ ]

### T-003: Create queryAdapter.ts
- **File:** `convex/crm/systemAdapters/queryAdapter.ts`
- **Action:** Create new file
- **Details:**
  - `queryNativeTable(ctx, tableName, orgId, limit)` — switch statement with 6 cases:
    - mortgages, borrowers, lenders, brokers, deals, obligations
    - Each uses `by_org` index: `.withIndex("by_org", q => q.eq("orgId", orgId)).take(limit)`
    - default: throw ConvexError
  - `queryNativeRecords(ctx, objectDef, fieldDefs, orgId, limit)` — assembles UnifiedRecord[]:
    1. Call queryNativeTable for raw docs
    2. Map each doc's fields using resolveColumnPath per fieldDef with nativeColumnPath
    3. Return UnifiedRecord with _kind: "native", _id as string
  - Import resolveColumnPath from ./columnResolver
  - Import UnifiedRecord from ../types
- **Status:** [ ]

### T-004: Wire system adapter into recordQueries.ts
- **File:** `convex/crm/recordQueries.ts`
- **Action:** Modify — replace 3 ENG-255 stubs
- **Details:**
  - In `queryRecords()`: Replace `throw ConvexError("System object queries not yet implemented (see ENG-255)")` with call to `queryNativeRecords(ctx, objectDef, activeFieldDefs, orgId, args.paginationOpts.numItems)`
  - In `getRecord()`: Keep stub — `getRecord` takes `Id<"records">` which doesn't map to native entities. Update error message to `"getRecord for system objects not yet supported — use queryRecords instead"`. Full native single-record lookup (`getNativeRecord(nativeTable, nativeId)`) is **deferred to ENG-256**.
  - In `searchRecords()`: Replace stub with basic native search (query by org, filter labelValue in-memory, or return empty for v1 since native records don't have search index)
  - Import queryNativeRecords from ./systemAdapters/queryAdapter
- **Status:** [ ]

### T-005: Run quality gates
- **Action:** Run bun check, bun typecheck, bunx convex codegen
- **Validation:** All pass with zero errors
- **Status:** [ ]
