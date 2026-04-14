# Chunk Context: chunk-02-frontend-registry

## Goal
- Rewire the shared detail UI to consume the new backend detail contract and resolve renderers by entity via a real frontend registry with a generic fallback.

## Relevant plan excerpts
- Shared sheet and full-page detail surfaces consume the same renderer registry and normalized data contract.
- UI editability state surfaces read-only or computed reasons without bypassing Convex mutation enforcement.
- Relations and History tabs continue using `LinkedRecordsPanel` and `ActivityTimeline`.

## Implementation notes
- `RecordSidebar.tsx` is the canonical shared detail surface for both sheet and page contexts.
- `entity-view-adapters.tsx` currently only prioritizes field ordering; expand it into reusable render helpers without breaking notes/files overrides.
- `FieldRenderer.tsx` is the right place to centralize editability and relation-aware presentation.

## Existing code touchpoints
- `src/components/admin/shell/RecordSidebar.tsx`
- `src/components/admin/shell/entity-view-adapters.tsx`
- `src/components/admin/shell/FieldRenderer.tsx`
- `src/components/admin/shell/RecordSidebarProvider.tsx`

## Validation
- admin-shell tests
- targeted UI tests if present
