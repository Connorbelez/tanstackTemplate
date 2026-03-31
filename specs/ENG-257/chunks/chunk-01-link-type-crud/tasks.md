# Chunk 01: Link Type CRUD

## T-001: Create `createLinkType` admin mutation
- **File:** `convex/crm/linkTypes.ts` (create)
- **Details:**
  - Use `crmAdminMutation` from `../fluent` (link type management is admin-only)
  - Args: `{ name: v.string(), sourceObjectDefId: v.id("objectDefs"), targetObjectDefId: v.id("objectDefs"), cardinality: cardinalityValidator }`
  - Import `cardinalityValidator` from `./validators`
  - Validate both objectDefs exist, are active, and belong to caller's org
  - Insert into `linkTypeDefs` with `isActive: true`, `createdAt: Date.now()`, `orgId: ctx.viewer.orgId`
  - Emit `auditLog.log()` with action `"crm.linkType.created"`
  - Return the new `linkTypeDefId`

## T-002: Create `deactivateLinkType` admin mutation + `listLinkTypes` query
- **File:** `convex/crm/linkTypes.ts` (add to same file)
- **Details:**
  - **`deactivateLinkType` mutation:**
    - Args: `{ linkTypeDefId: v.id("linkTypeDefs") }`
    - Load linkTypeDef, verify org ownership
    - Check for active links using `by_link_type` index — if any non-deleted exist, throw ConvexError
    - Set `isActive: false`
    - Emit `auditLog.log()` with action `"crm.linkType.deactivated"`
  - **`listLinkTypes` query:**
    - Use `crmAdminQuery`
    - Query `linkTypeDefs` via `by_org` index filtered by `isActive === true`
    - Return list of active link types for the org
