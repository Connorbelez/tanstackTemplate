# Chunk Context: Engine Serialization

Source: Linear ENG-45, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Linear Issue Excerpt

## Context

[SPEC 1.4 — Deal Closing](<https://www.notion.so/322fc1b44024810e944cd5ef27bd9214>) (Section 4: Compound State Serialization)
[R8 — Compound state serialization and rehydration](<https://www.notion.so/322fc1b440248134a838f6043a06a616>)

## What

Implement `serializeState()` and `deserializeState()` utility functions that convert XState compound state values to/from dot-notation strings. Flat strings pass through unchanged. These are used by the Transition Engine for deal (and any future nested) machines.

## Acceptance Criteria

- [ ] `serializeState("initiated")` → `"initiated"` (passthrough)
- [ ] `serializeState({ lawyerOnboarding: "verified" })` → `"lawyerOnboarding.verified"`
- [ ] `deserializeState("initiated")` → `"initiated"` (passthrough)
- [ ] `deserializeState("lawyerOnboarding.verified")` → `{ lawyerOnboarding: "verified" }`
- [ ] Round-trip: serialize → deserialize → serialize produces identical string for all 11 deal states
- [ ] XState rehydration: `resolveState({ value: deserialize("lawyerOnboarding.verified"), context })` produces valid state that accepts correct next event
- [ ] Unit tests in `src/test/convex/engine/serialization.test.ts`

## Implementation Plan Excerpt

**Linear Issue:** [ENG-45](https://linear.app/fairlend/issue/ENG-45/implement-compound-state-serialization-helpers-serializestate)
**Spec:** [SPEC 1.4 — Deal Closing](https://www.notion.so/322fc1b44024810e944cd5ef27bd9214) (Section 4)
**Requirement:** [R8 — Compound state serialization and rehydration](https://www.notion.so/322fc1b440248134a838f6043a06a616)
**Status:** Ready for implementation
**Date:** 2026-03-17
**Revision:** 2 — Updated after ENG-44 and ENG-46 landed

---

## Acceptance Criteria (verbatim from Linear)
- [ ] `serializeState("initiated")` → `"initiated"` (passthrough)
- [ ] `serializeState({ lawyerOnboarding: "verified" })` → `"lawyerOnboarding.verified"`
- [ ] `deserializeState("initiated")` → `"initiated"` (passthrough)
- [ ] `deserializeState("lawyerOnboarding.verified")` → `{ lawyerOnboarding: "verified" }`
- [ ] Round-trip: serialize → deserialize → serialize produces identical string for all 11 deal states
- [ ] XState rehydration: `resolveState({ value: deserialize("lawyerOnboarding.verified"), context })` produces valid state that accepts correct next event
- [ ] Unit tests in `src/test/convex/engine/serialization.test.ts`

---

## Drift Report
### CRITICAL: Serialization format mismatch

| Aspect | Spec says | Code has | Impact |
| ----- | ----- | ----- | ----- |
| **Serialization format** | Dot-notation: `"lawyerOnboarding.verified"` | JSON: `'{"lawyerOnboarding":"verified"}'` | Audit journal readability, kanban grouping logic, all downstream consumers |
| **Function names** | `serializeState()` / `deserializeState()` | `serializeStatus()` / `deserializeStatus()` | All call sites need updating |
| **Detection logic** | `status.includes(".")` for compound check | `status.startsWith("{")` for JSON check | Deserialization heuristic changes |

**Recommendation:** Replace the current JSON-based implementation with dot-notation. The spec's rationale is sound — dot-notation is human-readable in audit journals and simplifies kanban phase grouping (`status.split(".")[0]`). The JSON approach is technically correct but fails the readability requirement from R8 and the kanban logic in spec section 7.1.

### No drift on other aspects
- `convex/engine/transition.ts` now calls `deserializeState(governedEntity.status)` before hydration, `serializeState(previousStateValue)` for the comparison baseline, and `serializeState(newStateValue)` after transition before persist — the call sites are wired correctly
- `convex/schema.ts` has `deals` table with `status: v.string()` — matches spec
- `convex/engine/machines/deal.machine.ts` exists with all 11 states (ENG-44 complete)
- `convex/engine/machines/registry.ts` registers `deal: dealMachine` (ENG-46 complete)
- `convex/engine/types.ts` includes `"deal"` in `GovernedEntityType` (ENG-46 complete)
- Serialization tests exist in `src/test/convex/engine/serialization.test.ts` and cover flat, compound, round-trip, and rehydration flows

---

## File Map

| File | Action | Purpose |
| ----- | ----- | ----- |
| `convex/engine/serialization.ts` | **Modify** | Replace JSON serialization with dot-notation; rename exports to `serializeState`/`deserializeState` |
| `convex/engine/transition.ts` | **Modify** | Update import names from `serializeStatus`→`serializeState`, `deserializeStatus`→`deserializeState`; update all 3 call sites |
| `src/test/convex/engine/serialization.test.ts` | **Modify** | Unit tests for serialization helpers + XState rehydration using real `dealMachine` |

---

## Integration Points

### ENG-46 (already implemented): Transition Engine compound state support
The transition engine already calls the serialization functions at the correct points:
- Line 227: `deserializeState(governedEntity.status)` — HYDRATE step
- Line 228: `serializeState(previousStateValue)` — comparison baseline before `getNextSnapshot`
- Line 245: `serializeState(newStateValue)` — serialize the next state before the persist step

ENG-45's integration points are now implemented in `transition.ts`; future changes should preserve these three serialization call sites.

### Downstream consumers (ENG-49, ENG-50, ENG-51, ENG-53)
All downstream deal-closing issues expect dot-notation strings in the `status` field and audit journal `previousState`/`newState`. This is the critical path.

---

## Implementation Steps

### Step 1: Replace serialization implementation
**File:** `convex/engine/serialization.ts`

Replace the entire file. The new implementation uses dot-notation per spec section 4.2:

```typescript
/**
 * Serialization helpers for XState compound state values.
 *
 * Flat string states pass through unchanged.
 * Compound states (single-region objects) serialize to dot-notation:
 *   { lawyerOnboarding: "verified" } → "lawyerOnboarding.verified"
 *
 * Backward-compatible — existing flat-state machines
 * (onboardingRequest, mortgage, obligation) are unaffected.
 */
import type { StateValue } from "xstate";

export function serializeState(stateValue: StateValue): string {
  if (typeof stateValue === "string") return stateValue;
  const entries = Object.entries(stateValue);
  if (entries.length !== 1) {
    throw new Error(
      `serializeState only supports single-region compound states; got keys: ${Object.keys(stateValue).join(", ")}`
    );
  }
  const [region, subState] = entries[0];
  if (typeof subState === "string") return `${region}.${subState}`;
  // Recursive for deeper nesting (future-proof)
  return `${region}.${serializeState(subState as StateValue)}`;
}

export function deserializeState(status: string): StateValue {
  if (!status.includes(".")) return status;
  const parts = status.split(".");
  let result: StateValue = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    result = { [parts[i]]: result };
  }
  return result;
}
```

**Key design decisions:**
- Uses XState's `StateValue` type (not `string | Record<string, unknown>`) for type safety
- Throws on parallel states (multiple regions) — deal machine is sequential, this guards against misuse
- Recursive `serializeState` handles arbitrarily deep nesting (future-proof per spec)
- `deserializeState` splits on `.` and builds nested object from right to left

### Step 2: Update transition engine imports
**File:** `convex/engine/transition.ts`

Update line 11:

```typescript
// Before:
import { deserializeStatus, serializeStatus } from "./serialization";

// After:
import { deserializeState, serializeState } from "./serialization";
```

Then rename all usages in the file (3 occurrences):
- Line 227: `deserializeStatus` → `deserializeState`
- Line 228: `serializeStatus` → `serializeState`
- Line 245: `serializeStatus` → `serializeState`

### Step 3: Verify backward compatibility
Run existing machine tests to confirm flat-state machines are unaffected:

```bash
bun run test convex/engine/machines/__tests__/
```

All existing tests (`onboardingRequest.machine.test.ts`, `mortgage.machine.test.ts`, `obligation.machine.test.ts`, `registry.test.ts`, `deal.machine.test.ts`) should pass unchanged.

### Step 4: Write serialization unit tests
**File:** `src/test/convex/engine/serialization.test.ts` (modify)

```typescript
import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { dealMachine } from "../machines/deal.machine";
import { serializeState, deserializeState } from "../serialization";

describe("serializeState", () => {
  it("passes flat strings through unchanged", () => {
    expect(serializeState("initiated")).toBe("initiated");
    expect(serializeState("confirmed")).toBe("confirmed");
    expect(serializeState("failed")).toBe("failed");
  });

  it("serializes single-level compound states to dot-notation", () => {
    expect(serializeState({ lawyerOnboarding: "pending" }))
      .toBe("lawyerOnboarding.pending");
    expect(serializeState({ lawyerOnboarding: "verified" }))
      .toBe("lawyerOnboarding.verified");
    expect(serializeState({ documentReview: "signed" }))
      .toBe("documentReview.signed");
    expect(serializeState({ fundsTransfer: "pending" }))
      .toBe("fundsTransfer.pending");
  });

  it("throws on parallel (multi-region) states", () => {
    expect(() =>
      serializeState({ a: "x", b: "y" })
    ).toThrow("single-region");
  });
});

describe("deserializeState", () => {
  it("passes flat strings through unchanged", () => {
    expect(deserializeState("initiated")).toBe("initiated");
    expect(deserializeState("confirmed")).toBe("confirmed");
    expect(deserializeState("failed")).toBe("failed");
  });

  it("deserializes dot-notation to compound state objects", () => {
    expect(deserializeState("lawyerOnboarding.verified"))
      .toEqual({ lawyerOnboarding: "verified" });
    expect(deserializeState("documentReview.pending"))
      .toEqual({ documentReview: "pending" });
    expect(deserializeState("fundsTransfer.complete"))
      .toEqual({ fundsTransfer: "complete" });
  });
});

describe("round-trip (all 11 deal states)", () => {
  const ALL_DEAL_STATES = [
    "initiated",
    "lawyerOnboarding.pending",
    "lawyerOnboarding.verified",
    "lawyerOnboarding.complete",
    "documentReview.pending",
    "documentReview.signed",
    "documentReview.complete",
    "fundsTransfer.pending",
    "fundsTransfer.complete",
    "confirmed",
    "failed",
  ];

  it.each(ALL_DEAL_STATES)(
    "serialize → deserialize → serialize is identity for %s",
    (state) => {
      const deserialized = deserializeState(state);
      const reserialized = serializeState(deserialized);
      expect(reserialized).toBe(state);
    }
  );
});

describe("XState rehydration with real dealMachine", () => {
  const DEFAULT_CONTEXT = { dealId: "test-deal-1" };

  it("rehydrates flat state and accepts next event", () => {
    const deserialized = deserializeState("initiated");
    const snapshot = dealMachine.resolveState({
      value: deserialized,
      context: DEFAULT_CONTEXT,
    });
    const next = getNextSnapshot(dealMachine, snapshot, {
      type: "DEAL_LOCKED",
      closingDate: 1_700_000_000_000,
    });
    expect(serializeState(next.value)).toBe("lawyerOnboarding.pending");
  });

  it("rehydrates compound state and accepts next event", () => {
    const deserialized = deserializeState("lawyerOnboarding.pending");
    const snapshot = dealMachine.resolveState({
      value: deserialized,
      context: DEFAULT_CONTEXT,
    });
    const next = getNextSnapshot(dealMachine, snapshot, {
      type: "LAWYER_VERIFIED",
      verificationId: "v-1",
    });
    expect(serializeState(next.value)).toBe("lawyerOnboarding.verified");
  });

  it("rehydrated state rejects invalid events (state unchanged)", () => {
    const deserialized = deserializeState("lawyerOnboarding.pending");
    const snapshot = dealMachine.resolveState({
      value: deserialized,
      context: DEFAULT_CONTEXT,
    });
    const next = getNextSnapshot(dealMachine, snapshot, {
      type: "FUNDS_RECEIVED",
      method: "manual",
    });
    expect(serializeState(next.value)).toBe("lawyerOnboarding.pending");
  });

  it("rehydrates mid-phase and completes phase gate via onDone", () => {
    const deserialized = deserializeState("lawyerOnboarding.verified");
    const snapshot = dealMachine.resolveState({
      value: deserialized,
      context: DEFAULT_CONTEXT,
    });
    const next = getNextSnapshot(dealMachine, snapshot, {
      type: "REPRESENTATION_CONFIRMED",
    });
    expect(serializeState(next.value)).toBe("documentReview.pending");
  });

  it("full happy path round-trips through serialize/deserialize at each step", () => {
    const events = [
      { type: "DEAL_LOCKED", closingDate: 1_700_000_000_000 },
      { type: "LAWYER_VERIFIED", verificationId: "v-1" },
      { type: "REPRESENTATION_CONFIRMED" },
      { type: "LAWYER_APPROVED_DOCUMENTS" },
      { type: "ALL_PARTIES_SIGNED" },
      { type: "FUNDS_RECEIVED", method: "manual" },
    ] as const;

    const expectedStates = [
      "lawyerOnboarding.pending",
      "lawyerOnboarding.verified",
      "documentReview.pending",
      "documentReview.signed",
      "fundsTransfer.pending",
      "confirmed",
    ];

    let currentSerialized = "initiated";
    for (let i = 0; i < events.length; i++) {
      const deserialized = deserializeState(currentSerialized);
      const snapshot = dealMachine.resolveState({
        value: deserialized,
        context: DEFAULT_CONTEXT,
      });
      const next = getNextSnapshot(dealMachine, snapshot, events[i]);
      currentSerialized = serializeState(next.value);
      expect(currentSerialized).toBe(expectedStates[i]);
    }
  });
});
```

### Step 5: Run quality checks

```bash
bun check
bun typecheck
bunx convex codegen
bun test src/test/convex/engine/serialization.test.ts
bun run test convex/engine/machines/__tests__/
```

All must pass.

## Spec Excerpts

## 4. Compound State Serialization
This is the key technical challenge unique to the deal machine.

### 4.1 The Problem
Simple GT machines store `status: "active"` — a flat string. The deal machine produces compound state values from XState:

```javascript
// XState state.value for a deal in lawyerOnboarding.verified:
{ lawyerOnboarding: "verified" }

// XState state.value for a deal in documentReview.pending:
{ documentReview: "pending" }

// XState state.value for a deal in initiated or confirmed:
"initiated"  // flat string for non-compound states
"confirmed"  // flat string for terminal states
```

### 4.2 Serialization Strategy
Store `status` as `v.string()` consistently across ALL governed entities. For compound states, use a dot-notation string:

```typescript
// Serialization (in Transition Engine, after transition):
function serializeState(stateValue: StateValue): string {
  if (typeof stateValue === "string") return stateValue;
  // Compound: { lawyerOnboarding: "verified" } → "lawyerOnboarding.verified"
  const [region, subState] = Object.entries(stateValue)[0];
  if (typeof subState === "string") return `${region}.${subState}`;
  // Deeper nesting (not needed for deals, but future-proof):
  return `${region}.${serializeState(subState)}`;
}

// Deserialization (in Transition Engine, before hydration):
function deserializeState(status: string): StateValue {
  if (!status.includes(".")) return status; // flat string
  const parts = status.split(".");
  // Build nested object: "lawyerOnboarding.verified" → { lawyerOnboarding: "verified" }
  let result: any = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    result = { [parts[i]]: result };
  }
  return result;
}
```

### 4.3 Transition Engine Modification
The Transition Engine (from Project 2) needs a small modification to handle compound states:

```typescript
// In engine/transition.ts — Step 3 (hydrate)
const restoredState = machineDef.resolveState({
  value: deserializeState(entity.status), // ← deserialize before hydration
  context: entity.machineContext ?? {},
});

// In engine/transition.ts — Step 5 (compare)
const newStatus = serializeState(nextState.value); // ← serialize after transition
const transitioned = newStatus !== previousState;

// In engine/transition.ts — Step 6 (persist)
await ctx.db.patch(entityId, {
  status: newStatus, // ← always a string
  machineContext: nextState.context,
  lastTransitionAt: Date.now(),
});
```

This modification is backward-compatible — flat state strings round-trip through serialize/deserialize unchanged.

### 4.4 Audit Journal Readability
Compound states in the audit journal appear as dot-notation strings:

```javascript
{
  entityType: "deal",
  previousState: "lawyerOnboarding.pending",
  newState: "lawyerOnboarding.verified",
  eventType: "LAWYER_VERIFIED",
  outcome: "transitioned",
}
```

This is human-readable and unambiguous. An auditor can reconstruct the exact phase and sub-state from the string.

## 7. Admin Kanban UI

### 7.1 Board Layout
The kanban uses a Convex reactive query to load all deals, grouped by phase:

```typescript
// deals/queries.ts
export const getDealsByPhase = authedQuery({
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    return groupDealsByPhase(deals);
  },
});

function groupDealsByPhase(deals: Deal[]) {
  const groups = {
    initiated: [],
    lawyerOnboarding: [],
    documentReview: [],
    fundsTransfer: [],
    confirmed: [],
    failed: [],
  };
  for (const deal of deals) {
    const phase = deal.status.includes(".")
      ? deal.status.split(".")[0]
      : deal.status;
    groups[phase]?.push(deal) ?? groups.initiated.push(deal);
  }
  return groups;
}
```

## 10. Testing Plan

### 10.5 Compound State Serialization Tests
- `serializeState("initiated")` → `"initiated"`
- `serializeState({ lawyerOnboarding: "verified" })` → `"lawyerOnboarding.verified"`
- `deserializeState("initiated")` → `"initiated"`
- `deserializeState("lawyerOnboarding.verified")` → `{ lawyerOnboarding: "verified" }`
- Round-trip: serialize → deserialize → serialize produces identical string
- XState rehydration: `resolveState({ value: deserialize("lawyerOnboarding.verified"), context })` produces a valid state that accepts `REPRESENTATION_CONFIRMED`

## Requirement Excerpt

## Description
The Transition Engine must correctly serialize compound (nested) state values produced by the deal machine and rehydrate them on subsequent transitions. Unlike simple machines that store `status` as a flat string, the deal machine produces state values like `"lawyerOnboarding.verified"` or equivalent object representations that must round-trip through Convex persistence.

## Acceptance Criteria
- Given a deal transitions from `initiated` to `lawyerOnboarding.pending`, when the entity is persisted, then `status` contains a value that uniquely identifies the compound state
- Given a persisted deal with a compound `status` value, when the Transition Engine loads it for the next command, then `machine.resolveState()` correctly rehydrates to the compound state
- Given a rehydrated compound state, when a valid event is sent, then the transition produces the correct next compound state
- Given a deal progresses through all phases to `confirmed`, when the full transition history is replayed, then every intermediate compound state was correctly serialized and rehydrated
- Given compound state values are stored in the `status` field, when the audit journal records `previousState` and `newState`, then both accurately represent the compound states

## Related Issue Excerpt (ENG-46)

## What

Modify the Transition Engine (`engine/transition.ts`) to use `deserializeState()` before hydration and `serializeState()` after transition. This is backward-compatible — flat strings pass through unchanged. Also register `dealMachine` in `machines/registry.ts` and add Command Envelope types for all deal events.

## Acceptance Criteria

- [ ] Engine step 3 (hydrate): calls `deserializeState(entity.status)` before `resolveState()`
- [ ] Engine step 5 (compare): calls `serializeState(nextState.value)` and compares strings
- [ ] Engine step 6 (persist): writes serialized string to `status` field
- [ ] Backward-compatible: existing flat-state machines (onboardingRequest, mortgage, obligation) unaffected
- [ ] `dealMachine` registered in `machines/registry.ts` as `deal: dealMachine`
- [ ] Command Envelope types: DEAL_LOCKED, LAWYER_VERIFIED, REPRESENTATION_CONFIRMED, LAWYER_APPROVED_DOCUMENTS, ALL_PARTIES_SIGNED, FUNDS_RECEIVED, DEAL_CANCELLED
- [ ] Audit journal: compound states appear as dot-notation in previousState/newState

## Architecture Context

**Critical invariant:** The `transition` mutation is the **only** code path that changes an entity's `status` field. There are no `ctx.db.patch(id, { status: "..." })` calls anywhere else in the codebase. If a status changed, it went through the engine.

**The database is the source of truth. The machine is the law. The journal is the receipt.**

## Local Codebase Notes

- Current serializer file is `convex/engine/serialization.ts` and exports `serializeState` / `deserializeState`, including dot-notation handling plus legacy JSON deserialization for backward compatibility.
- Current transition file is `convex/engine/transition.ts` and imports `serializeState` / `deserializeState` at line 11 with three usage sites in the hydration/compare/persist flow.
- Current serialization tests live in `src/test/convex/engine/serialization.test.ts`, not `convex/engine/__tests__/serialize.test.ts`.
- Current deal machine test file is `convex/engine/machines/__tests__/deal.machine.test.ts` and already defines the full 11-state matrix with real `StateValue` objects.
- `git status --short` was clean on 2026-03-17 before planning artifacts were created.
