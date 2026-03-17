# ENG-51: Implement Admin Kanban UI

## Issue Summary
Implement the admin kanban UI in `app/routes/admin/deals/`: board layout, deal cards, action buttons, rejection display. Uses Convex reactive queries for real-time updates.

## Acceptance Criteria
- [x] `getDealsByPhase` query groups deals into 6 columns: Initiated, Lawyer Onboarding, Document Review, Funds Transfer, Confirmed, Failed
- [x] `useDealActions` hook returns available actions for current state (maps dot-notation status to button labels + event types)
- [x] Action buttons construct Command Envelopes and call Transition Engine with `source: { channel: "admin_dashboard", actorId, actorType: "admin" }`
- [x] Only valid actions shown for current state — no buttons for future-phase events
- [x] Cancel button on every non-terminal deal card with required reason prompt
- [x] Rejection display: on `{ success: false }`, show reason as toast/notification, card doesn't move
- [x] Real-time: Convex reactive query — deal transitions by Admin A visible to Admin B within 1s
- [x] Sub-state visible within each phase column (e.g., "Lawyer Onboarding — Verified")
- [x] Completed phase indicators on deal cards
- [x] Closing team assignment visible on deal card (from closingTeamAssignments query)

## Deal State Machine Phases (from deal.machine.ts)
```
initiated → lawyerOnboarding (pending/verified/complete) → documentReview (pending/signed/complete) → fundsTransfer (pending/complete) → confirmed
                                                      └─ failed (terminal)
```

## Deal Events
- `DEAL_LOCKED` - Move from initiated to lawyerOnboarding
- `LAWYER_VERIFIED` - Move within lawyerOnboarding: pending → verified
- `REPRESENTATION_CONFIRMED` - Move within lawyerOnboarding: verified → complete
- `LAWYER_APPROVED_DOCUMENTS` - Move within documentReview: pending → signed
- `ALL_PARTIES_SIGNED` - Move within documentReview: signed → complete
- `FUNDS_RECEIVED` - Move within fundsTransfer: pending → complete (payload: method: "vopay" | "wire_receipt" | "manual")
- `DEAL_CANCELLED` - Cancel from any non-terminal state (payload: reason: string)

## Key Files Created/Modified
- `convex/deals/queries.ts` - Added `getDealsByPhase` query
- `convex/deals/mutations.ts` - Added `transitionDeal` command wrapper
- `src/hooks/useDealActions.ts` - Hook for available actions
- `src/routes/admin/deals/route.tsx` - Main kanban page
- `src/components/admin/deal-card.tsx` - Deal card component
- `src/components/admin/kanban-deals.tsx` - Kanban board

## Commands
- Transition command: `transitionDeal` mutation (like `transitionOnboardingRequest` in commands.ts)
- Source: `{ channel: "admin_dashboard", actorId, actorType: "admin" }`

## Dependencies
- Existing: deal.machine.ts (states/events)
- Existing: transition.ts (executeTransition)
- Existing: commands.ts (transition wrappers pattern)
- Existing: trello-kanban-board.tsx (adapt for deals)
