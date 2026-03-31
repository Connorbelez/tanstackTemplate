# Chunk 02: Record Linking Mutations

## T-003: Create entity existence validator helper
- **File:** `convex/crm/recordLinks.ts` (create)
- **Details:**
  - Create `validateEntityExists(ctx, kind, id, orgId)` async helper:
    - If `kind === "record"`: load from `records` table by ID, verify not deleted, verify `orgId` matches
    - If `kind === "native"`: load objectDef for that entity to find `nativeTable`, then query that table by ID and verify orgId. Use a switch statement on `nativeTable` for compile-time table names (pattern from `queryAdapter.ts`).
    - Returns `{ orgId: string, objectDefId: Id<"objectDefs"> }` on success
    - Throws ConvexError on failure
  - NOTE: For the native case, we need the objectDefId. The caller passes it via the linkTypeDef's sourceObjectDefId/targetObjectDefId, so the helper can take objectDefId as an additional param for native entities.

## T-004: Create `createLink` mutation with fail-fast validation
- **File:** `convex/crm/recordLinks.ts` (add to same file)
- **Details:**
  - Use `crmMutation` from `../fluent` (linking is not admin-only)
  - Args: `{ linkTypeDefId: v.id("linkTypeDefs"), sourceKind, sourceId: v.string(), targetKind, targetId: v.string() }` where kinds use `v.union(v.literal("record"), v.literal("native"))`
  - **Validation (fail-fast order per spec):**
    1. Load `linkTypeDef`, verify active and org-owned
    2. Validate source entity exists (via helper)
    3. Validate target entity exists (via helper)
    4. **Object type match**: source objectDefId matches linkTypeDef.sourceObjectDefId AND target objectDefId matches linkTypeDef.targetObjectDefId
    5. **Cross-org prohibition** (REQ-166): both source and target orgId match caller's org
    6. **Duplicate detection**: query `by_org_source` filtered by targetId + linkTypeDefId + `isDeleted === false`
    7. **Cardinality enforcement**:
       - `one_to_one`: check neither source nor target has existing active link of this type
       - `one_to_many`: check source (the "one" side) doesn't have existing active link of this type
       - `many_to_many`: no cardinality check needed
  - Insert into `recordLinks` with all fields
  - Emit `auditLog.log()` with action `"crm.link.created"`
  - Return the new link ID

## T-005: Create `deleteLink` mutation (soft-delete)
- **File:** `convex/crm/recordLinks.ts` (add to same file)
- **Details:**
  - Args: `{ linkId: v.id("recordLinks") }`
  - Load link, verify org ownership, verify not already deleted
  - Set `isDeleted: true` (soft-delete)
  - Emit `auditLog.log()` with action `"crm.link.deleted"`
