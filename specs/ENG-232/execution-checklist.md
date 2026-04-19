# Execution Checklist: ENG-232 - Admin Shell - EntityPage (Full Entity Detail View)

## Requirements From Linear
- [x] Build a full-page entity detail view with two-column layout, tabbed content, and entity-specific content slots.
- [x] Header includes back button, breadcrumb, entity title, status badge, and action buttons.
- [x] Main content area reuses the RecordSidebar tabs with more space.
- [x] Details tab shows a full field grid.
- [x] Relations tab supports richer relation rendering than a plain list.
- [x] History tab supports fuller audit rendering with expandable entries where possible from current primitives.
- [x] Summary sidebar shows key metrics, quick actions, and status context.
- [x] Dedicated admin detail routes remain URL-addressable for direct entry.

## Definition Of Done From Linear
- [x] Full-page detail view renders for any registered entity
- [x] Breadcrumb shows: Admin > Entity Type > Record Title
- [x] Two-column layout on desktop, single column on mobile
- [x] All tabs from RecordSidebar work in full-page context
- [x] Entity-specific content slots render custom sections
- [x] Back button returns to entity list
- [x] URL-addressable: `/admin/listings/[id]` loads directly
- [x] `bun check` and `bun typecheck` pass
- [x] Comprehensive Storybook stories added for every reusable UI component introduced by this issue
- [x] Stories cover default plus relevant states/variants (loading, empty, error/validation, responsive, edge-case content, interaction states)
- [x] New UI follows accessibility best practices: semantic structure, keyboard access, labels, focus states, screen-reader text, contrast, and no color-only meaning

## Agent Instructions
- Keep this file current as work progresses.
- Do not mark an item complete unless code, tests, and validation support it.
- If an item is blocked or inapplicable, note the reason directly under the item.
- Manual impact analysis is required for touched symbols because GitNexus is unavailable in this session.

## Test Coverage Expectations
- [x] Unit tests added or updated where backend or domain logic changed
- [ ] E2E tests added or updated where an operator or user workflow changed
Reason: no dedicated e2e harness exists for this shared admin-detail shell flow in the current repo; targeted helper tests plus Storybook build were used instead.
- [x] Storybook stories added or updated where reusable UI changed

## Final Validation
- [x] All requirements are satisfied
- [x] All definition-of-done items are satisfied
- [ ] Required quality gates passed
Reason: `bunx convex codegen` is still blocked in this worktree because `CONVEX_DEPLOYMENT` is not configured.
- [x] Test coverage expectations were met or explicitly justified
