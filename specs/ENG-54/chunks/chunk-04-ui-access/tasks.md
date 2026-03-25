# Chunk 4: UI & Access Verification

- [ ] T-012: DoD #9 — Read kanban components, verify:
  - `getDealsByPhase` groups deals into 6 columns: initiated, lawyerOnboarding, documentReview, fundsTransfer, confirmed, failed
  - Deal cards show sub-state within phase (e.g., "Lawyer Onboarding — Verified")
  - `useDealActions` returns correct actions for every status value
  - Only valid actions shown for current state — no future-phase buttons
  - Cancel button on every non-terminal deal card with required reason prompt
  - Rejection display: failed transitions show toast/notification
  - Real-time: uses Convex reactive query (`useQuery` or `useSuspenseQuery`)
  - Closing team assignment visible on deal cards
  - Phase completion indicators present

- [ ] T-013: DoD #10 — Read access check files, verify:
  - `assertDealAccess()` checks `dealAccess` table with `by_user_and_deal` index
  - Admin role bypasses dealAccess check
  - Non-admin without active dealAccess → error thrown
  - Revoked access (status: "revoked") → error thrown
  - Grant on LAWYER_VERIFIED → `createDealAccess` effect creates record
  - Revoke on cancel → `revokeAllDealAccess` sets status to "revoked"
  - Revoke on confirm → `revokeLawyerAccess` revokes only lawyer roles
