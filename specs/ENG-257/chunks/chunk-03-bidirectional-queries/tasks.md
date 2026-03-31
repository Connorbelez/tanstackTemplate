# Chunk 03: Bidirectional Queries + Verification

## T-006: Create `getLinkedRecords` query
- **File:** `convex/crm/linkQueries.ts` (create)
- **Details:**
  - Use `crmQuery` from `../fluent`
  - Args: `{ recordId: v.string(), recordKind: v.union(v.literal("record"), v.literal("native")), direction: v.optional(v.union(v.literal("outbound"), v.literal("inbound"), v.literal("both"))) }`
  - Default direction to `"both"`
  - Query outbound links via `by_org_source` index (sourceKind=recordKind, sourceId=recordId)
  - Query inbound links via `by_org_target` index (targetKind=recordKind, targetId=recordId)
  - Filter `isDeleted === false`
  - Group results by `linkTypeDefId`
  - For each group, load the `linkTypeDef` name
  - Resolve peer records to `LinkedRecord` shape (load `labelValue` for EAV records)
  - Return `{ linkTypeName: string, linkTypeDefId: Id<"linkTypeDefs">, direction: "outbound" | "inbound", links: LinkedRecord[] }[]`

## T-007: Create `getLinkTypesForObject` query
- **File:** `convex/crm/linkQueries.ts` (add to same file)
- **Details:**
  - Use `crmQuery`
  - Args: `{ objectDefId: v.id("objectDefs") }`
  - Query `linkTypeDefs` via `by_source_object` and `by_target_object` indexes
  - Filter `isActive === true`
  - Return combined list (deduplicated by _id) — used by ENG-258's "Add Link" dialog

## T-008: Verify integration with existing `getRecord`
- **File:** `convex/crm/recordQueries.ts` (verify, no changes expected)
- **Details:**
  - Confirm `getRecord` already loads outbound/inbound links correctly via `by_org_source`/`by_org_target`
  - Confirm `LinkedRecord` type alignment between `types.ts` and query output
  - If any adjustments needed (e.g., adding linkTypeName), make them

## T-009: Quality Gate
- Run `bun check` (auto-formats + lints)
- Run `bun typecheck`
- Run `bunx convex codegen`
- All three must pass with zero errors
