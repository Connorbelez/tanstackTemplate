# ENG-257: Link Types & Record Linking (Polymorphic) — Master Task List

## Chunk 1: Link Type CRUD (`convex/crm/linkTypes.ts`)
- [x] T-001: Create `createLinkType` admin mutation
- [x] T-002: Create `deactivateLinkType` admin mutation + `listLinkTypes` query

## Chunk 2: Record Linking Mutations (`convex/crm/recordLinks.ts`)
- [x] T-003: Create entity existence validator helper (`validateEntityExists`)
- [x] T-004: Create `createLink` mutation with fail-fast validation chain
- [x] T-005: Create `deleteLink` mutation (soft-delete)

## Chunk 3: Bidirectional Queries (`convex/crm/linkQueries.ts`) + Verification
- [x] T-006: Create `getLinkedRecords` query (grouped by link type)
- [x] T-007: Create `getLinkTypesForObject` query
- [x] T-008: Verify integration with existing `getRecord` in recordQueries.ts — CONFIRMED COMPATIBLE
- [x] T-009: Run quality gate — `bun check` ✅, `bun typecheck` ✅
