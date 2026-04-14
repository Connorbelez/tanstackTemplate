# Summary: ENG-277 - View Engine - Kanban Layout Builder

- Source issue: `ENG-277` - https://linear.app/fairlend/issue/ENG-277/view-engine-kanban-layout-builder
- Primary plan: https://www.notion.so/341fc1b44024813d932bed604778be39
- Supporting docs:
  - https://www.notion.so/336fc1b4402481eba141c9c8cf17a600
  - https://www.notion.so/341fc1b440248134b191da5114d9875b
  - https://www.notion.so/337fc1b440248189bfbfeeccd67856a4
  - https://www.notion.so/337fc1b44024810e9157f7433d1feac7
  - https://www.notion.so/337fc1b4402481a88fe9df64f632f07f
  - https://www.notion.so/337fc1b440248165b010ddaa24c9b745

## Scope
- Reuse the existing `convex/crm` kanban engine and query contracts instead of rebuilding them.
- Add a canonical admin view-engine path for route entity type to object/view/saved-view resolution.
- Build a shared production admin surface that can render table or kanban from view-engine state.
- Let operators choose the eligible single-select field that drives kanban and persist that through the existing system-view or saved-view model.
- Keep kanban visible but disabled with an explanation when the entity has no eligible field.
- Keep MVP kanban read-only.
- Migrate the admin routes in scope away from scaffolded table models and fake data.

## Constraints
- `fluent-convex` is the required Convex style.
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass before the work is done.
- Do not use `any`.
- GitNexus impact analysis is required before editing existing symbols.
- The current admin routes still use `api.admin.queries.listEntityRows`; this needs to converge on the view-engine path.
- The demo `RecordTableSurface` already proves the basic table/kanban pattern, but it incorrectly allows the first `select` or `multi_select` field instead of eligible single-select only.
- `moveKanbanRecord` exists in the backend, but the production UI must not expose drag/drop or mutation affordances in this issue.

## Open questions
- Whether layout and bound-field persistence should land entirely through saved views or if default system-view updates are also required for the first production pass.
- Whether all current admin routes should move in this issue or only the routes with real data sources ready for the shared surface.
