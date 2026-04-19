# Chunk Context: chunk-01-backend-relation-contract

## Goal
- Add a stable typed relation payload to the shared view-engine contract and hydrate it from backend relation data for table and kanban consumers.

## Relevant plan excerpts
- "Backend view queries must return a typed, cell-ready relation payload for relation-backed fields, including target `recordId`, `recordKind`, `objectDefId`, and human-readable label text."
- "Kanban cards must use the same relation value contract and presentation rules when a preview field is relation-backed."
- "Calendar views and calendar query contracts remain out of scope for this issue and must not be expanded as part of the relation-cell work."

## Implementation notes
- `convex/crm/types.ts` still models `EntityViewCell.value` as `unknown`, while `displayValue` now carries typed relation payloads without breaking scalar consumers.
- `convex/crm/viewQueries.ts` now hydrates relation display values before row projection so both table and kanban paths reuse the same typed payload contract.
- `convex/crm/linkQueries.ts` and `convex/crm/recordQueries.ts` both contain linked-record resolution logic; prefer extracting or sharing a single label/object resolution helper rather than duplicating relation lookup rules again.
- Keep the existing calendar query path untouched; only table and kanban payloads should change in this chunk.
- Treat this file as architecture context, not lint-oriented code. When reviewing it, verify statements against the implemented backend behavior instead of flagging Markdown formatting noise.

## Existing code touchpoints
- `convex/crm/types.ts`
- `convex/crm/viewState.ts`
- `convex/crm/viewQueries.ts`
- `convex/crm/linkQueries.ts`
- `convex/crm/recordQueries.ts`
- `convex/crm/__tests__/viewEngine.test.ts`

## Validation
- Backend tests in `convex/crm/__tests__/viewEngine.test.ts` cover relation payload hydration for both populated and empty relation states.
- Existing table and kanban coverage remains focused on the relation contract without expanding calendar assertions.
