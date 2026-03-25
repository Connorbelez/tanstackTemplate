# Chunk 4 Context: UI & Access Verification

## SPEC Section 7 — Admin Kanban UI

### Board Layout
6 columns: Initiated, Lawyer Onboarding, Document Review, Funds Transfer, Confirmed, Failed

The kanban uses a Convex reactive query to load all deals, grouped by phase. The `getDealsByPhase` function extracts the phase from dot-notation status strings:
- `"initiated"` → column: initiated
- `"lawyerOnboarding.verified"` → column: lawyerOnboarding
- `"confirmed"` → column: confirmed

### Available Actions Hook
Maps status strings to available actions:
```
"initiated"                 → [Lock Deal]
"lawyerOnboarding.pending"  → [Verify Lawyer]
"lawyerOnboarding.verified" → [Confirm Representation]
"documentReview.pending"    → [Lawyer Approves Documents]
"documentReview.signed"     → [All Parties Signed]
"fundsTransfer.pending"     → [Confirm Funds Received]
```

Cancel is available on every non-terminal state (not confirmed, not failed), requires reason string.

### Button Handler
Calls `transitionMutation` with:
- `entityType: "deal"`
- `entityId: dealId`
- `eventType: <from action map>`
- `payload: <optional>`
- `source: { channel: "admin_dashboard", actorId, actorType: "admin" }`

On failure: `showRejection(result.reason)` — displays toast/notification.
On success: Convex reactive query auto-updates the board.

## SPEC Section 8 — dealAccess Authorization

### Two-Layer Auth Check
1. **Layer 1:** Check if user is admin (via fluent-convex middleware / auth context) → bypass
2. **Layer 2:** Query `dealAccess` table with `by_user_and_deal` index, filter for `status: "active"`

### Grant/Revoke Lifecycle
- **Grant:** On `LAWYER_VERIFIED` event → `createDealAccess` effect creates record with `status: "active"`
- **Revoke on cancel:** `revokeAllDealAccess` sets ALL active records to `status: "revoked"`, `revokedAt: Date.now()`
- **Revoke on confirm:** `revokeLawyerAccess` revokes only lawyer-role records; party records retained

### Roles
4-way union: `platform_lawyer`, `guest_lawyer`, `lender`, `borrower`

## Key Files
- `src/components/admin/kanban-deals.tsx` — kanban board component
- `src/components/admin/deal-card.tsx` — deal card with actions
- `src/hooks/useDealActions.ts` — available actions hook
- `convex/deals/accessCheck.ts` — assertDealAccess function
- `convex/deals/queries.ts` — getDealsByPhase, getInternalDeal, activeDealAccessRecords
- `convex/deals/mutations.ts` — transitionDeal, grantAccess, revokeAccess
- `src/routes/admin/deals/route.tsx` — admin route
