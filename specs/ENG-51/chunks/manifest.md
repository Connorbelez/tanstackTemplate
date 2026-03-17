# ENG-51 Chunks

## Chunk 1: Backend - Deal Queries
- [x] T-001: Add `getDealsByPhase` query to `convex/deals/queries.ts`
- [x] T-002: Add `closingTeamAssignments` query to get team assignments
- [x] T-003: Test queries with mock data

## Chunk 2: Backend - Deal Mutations
- [x] T-004: Add `transitionDeal` mutation wrapper to `convex/deals/mutations.ts`
- [x] T-005: Register deal machine in transition engine (if not already)

## Chunk 3: Frontend - Deal Actions Hook
- [x] T-006: Create `src/hooks/useDealActions.ts` hook
- [x] T-007: Map status dot-notation to available actions
- [x] T-008: Create action button configuration

## Chunk 4: Frontend - Components
- [x] T-009: Create `src/components/admin/deal-card.tsx` component
- [x] T-010: Create `src/components/admin/kanban-deals.tsx` board
- [x] T-011: Add rejection toast handling

## Chunk 5: Frontend - Route
- [x] T-012: Create `src/routes/admin/deals/route.tsx` page
- [x] T-013: Add cancel dialog with reason prompt
- [x] T-014: Test real-time updates

## Chunk 6: Integration & Polish
- [x] T-015: Final integration testing
- [x] T-016: Quality gate (lint, typecheck)
