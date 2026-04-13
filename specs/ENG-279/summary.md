# Summary: ENG-279 - View Engine — Detail Sheet Renderer Registry, Editability, and Domain Sections

- Source issue: https://linear.app/fairlend/issue/ENG-279/view-engine-detail-sheet-renderer-registry-editability-and-domain
- Primary plan: https://www.notion.so/341fc1b4402481599b9feebaa5801f61
- Supporting docs:
  - https://www.notion.so/336fc1b4402481eba141c9c8cf17a600
  - https://www.notion.so/334fc1b4402480dab40fe17598a9b990
  - https://www.notion.so/336fc1b4402481b1ab28d94fc1be02b5
  - https://www.notion.so/336fc1b4402481baba83cc1e48c915ef
  - https://www.notion.so/333fc1b4402481548142c10261af4c4a

## Scope
- Add a backend detail-surface contract that exposes normalized fields, adapter metadata, and record data without depending on a source `viewDefId`.
- Refactor the shared admin detail UI to consume that contract instead of raw field/record queries.
- Expand the frontend detail adapter registry from prioritized field grids into reusable section-based renderers with a generic fallback.
- Surface editability metadata and better typed rendering for computed and relation values.
- Add dedicated section modules for the first set of important entities where the current data surface supports a richer experience.
- Add or update backend and frontend tests for the new detail query and renderer behavior.

## Constraints
- The canonical shared detail surface is `src/components/admin/shell/RecordSidebar.tsx`, not `AdminDetailSheet.tsx`.
- Existing relation and history tabs must continue using `LinkedRecordsPanel` and `ActivityTimeline`.
- Existing dedicated routes must continue to work and resolve through the shared surface.
- `bun check`, `bun typecheck`, and `bunx convex codegen` are required quality gates.
- GitNexus impact analysis for planned edits returned only LOW risk; no HIGH or CRITICAL blockers were found.

## Open questions
- The exact first-pass depth for listing/property/mortgage domain sections depends on what detail data is already available without inventing new domain query surfaces.
