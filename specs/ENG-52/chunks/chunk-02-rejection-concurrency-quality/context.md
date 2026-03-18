# Chunk 02 Context — Rejection + Concurrency + Quality

## What You're Building
Continue implementing `convex/machines/__tests__/deal.integration.test.ts` — adding rejection tests, terminal state tests, and concurrency simulation tests. Then run quality gates.

## Key Contract: Rejection Behavior

From the Transition Engine (`convex/engine/transition.ts`), when an event is not valid for the current state:

1. `getNextSnapshot()` computes the next state — if it's the same as the previous state AND there are no effects, the event is rejected
2. A rejection audit journal entry is written with `outcome: "rejected"` and a reason string
3. The function returns `{ success: false, previousState, newState, reason }` where newState === previousState

Rejection reason format: `Event "${eventType}" not valid in state "${previousStateSerialized}"`

## Key Contract: Terminal States

The deal machine defines `confirmed` and `failed` as `{ type: "final" }`. XState final states accept NO events — any event sent to them results in the same state value (unchanged). The Transition Engine detects this (newState === previousState, no effects) and writes a rejection.

DEAL_CANCELLED is NOT available from terminal states because it's defined per-compound-state (on initiated, lawyerOnboarding, documentReview, fundsTransfer), NOT at root level. So even DEAL_CANCELLED is rejected from confirmed/failed.

## Key Contract: Concurrency (OCC Simulation)

convex-test runs mutations sequentially (no true OCC). The concurrency test simulates OCC by:
1. Fire event A → succeeds (state advances)
2. Fire same event A again → rejected (state already advanced, event no longer valid)

This matches Convex's OCC retry semantics: on retry, the mutation reads the updated state, finds the event invalid, and rejects.

## TransitionResult Type
```typescript
export interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  journalEntryId?: string;
  effectsScheduled?: string[];
  reason?: string;
}
```

## Audit Journal Query Pattern
```typescript
const journal = await t.run(async (ctx) => {
  return ctx.db
    .query("auditJournal")
    .withIndex("by_entity", (q) =>
      q.eq("entityType", "deal").eq("entityId", dealId)
    )
    .collect();
});
```

## Deal Machine State × Event (Relevant Subset)

Valid transitions only:
- `initiated`: DEAL_LOCKED, DEAL_CANCELLED
- `lawyerOnboarding.pending`: LAWYER_VERIFIED, DEAL_CANCELLED
- `lawyerOnboarding.verified`: REPRESENTATION_CONFIRMED, DEAL_CANCELLED
- `documentReview.pending`: LAWYER_APPROVED_DOCUMENTS, DEAL_CANCELLED
- `documentReview.signed`: ALL_PARTIES_SIGNED, DEAL_CANCELLED
- `fundsTransfer.pending`: FUNDS_RECEIVED, DEAL_CANCELLED
- `confirmed`: (none — final state)
- `failed`: (none — final state)

Any event NOT in the valid set for the current state → rejected.

## Helper: Advancing Deal to a Specific State

For rejection tests from later states, reuse the transition helper to advance the deal:

```typescript
// Advance to lawyerOnboarding.pending
await t.mutation(internal.engine.transitionMutation.transitionMutation, {
  entityType: "deal", entityId: dealId,
  eventType: "DEAL_LOCKED",
  payload: { closingDate: Date.now() + 14 * 86400000 },
  source: ADMIN_SOURCE,
});
```

For advancing to confirmed (full happy path):
```typescript
const happyPathEvents = [
  { eventType: "DEAL_LOCKED", payload: { closingDate: Date.now() + 14 * 86400000 } },
  { eventType: "LAWYER_VERIFIED", payload: { verificationId: "v-1" } },
  { eventType: "REPRESENTATION_CONFIRMED", payload: {} },
  { eventType: "LAWYER_APPROVED_DOCUMENTS", payload: {} },
  { eventType: "ALL_PARTIES_SIGNED", payload: {} },
  { eventType: "FUNDS_RECEIVED", payload: { method: "manual" } },
];
```

## Existing Patterns from Test Codebase

Source fixture:
```typescript
const ADMIN_SOURCE = {
  channel: "admin_dashboard" as const,
  actorId: "user_admin_integration",
  actorType: "admin" as const,
};
```

Test structure:
```typescript
let t: TestHarness;
beforeEach(() => { t = convexTest(schema, modules); });
```

## Quality Gate Commands
```bash
bun check          # Lint + format (auto-fixes first)
bun typecheck      # TypeScript type checking
bunx convex codegen # Ensure codegen is current
bun run test convex/machines/__tests__/deal.integration.test.ts  # Run just this file
bun run test       # Full test suite
```

## Constraints
1. No `any` types
2. All test data properly typed with `Id<"deals">`, etc.
3. `bun check`, `bun typecheck`, `bunx convex codegen` must all pass
4. Rejection tests MUST verify the audit journal entry (not just the return value)
