# Chunk 01 Context — Schema & Machine Definition

## Overview

Build the data layer for the Governed Transitions demo: XState v5 dependency, three new demo tables, and a pure machine definition file.

**Design philosophy:** The database is the source of truth. The machine is the law. The journal is the receipt.

## Requirements

- **REQ-1**: Machine definitions are pure data — no Convex/DB imports. Machine file has zero Convex imports, only xstate.
- **REQ-5**: Guards are pure functions — no I/O, no async. Guards only read machine context and event payload.
- **REQ-8**: Demo uses `demo_` prefixed tables. All tables named `demo_gt_*`.
- **F-1**: XState Machine Definition — Pure XState v5 machine for a Loan Application lifecycle with guards, actions, and terminal states.
- **F-2**: Transition Engine — Single Convex mutation that hydrates machine state, validates transitions, persists, journals, schedules.
- **F-4**: Audit Journal — Append-only journal recording every command (successful transitions + rejections) with full context.

## Database Schema

Add these to `convex/schema.ts` in the demo tables section (after the existing `demo_audit_mortgages` table definition). The file uses `defineTable` and `v` from convex.

```typescript
// ── Demo Governed Transitions ───────────────────────────
demo_gt_entities: defineTable({
  entityType: v.string(),
  label: v.string(),
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  data: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_type", ["entityType"]),

demo_gt_journal: defineTable({
  entityType: v.string(),
  entityId: v.id("demo_gt_entities"),
  eventType: v.string(),
  payload: v.optional(v.any()),
  previousState: v.string(),
  newState: v.string(),
  outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
  reason: v.optional(v.string()),
  source: v.object({
    channel: v.string(),
    actorId: v.optional(v.string()),
    actorType: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  }),
  machineVersion: v.optional(v.string()),
  timestamp: v.number(),
  effectsScheduled: v.optional(v.array(v.string())),
})
  .index("by_entity", ["entityId", "timestamp"])
  .index("by_outcome", ["outcome", "timestamp"]),

demo_gt_effects_log: defineTable({
  entityId: v.id("demo_gt_entities"),
  journalEntryId: v.id("demo_gt_journal"),
  effectName: v.string(),
  status: v.union(
    v.literal("scheduled"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  scheduledAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_entity", ["entityId"])
  .index("by_journal", ["journalEntryId"]),
```

**Important:** Place these right after the `demo_audit_mortgages` table definition and its comment block (around line 194 in the current schema). The existing schema ends with Document Engine tables.

## Complete Machine Definition

File: `convex/demo/machines/loanApplication.machine.ts`

This file must have ZERO Convex imports. Only `import { setup } from "xstate"`.

### State Transition Table

| From State     | Event            | Guard             | To State       | Actions (Effects)                       |
| -------------- | ---------------- | ----------------- | -------------- | --------------------------------------- |
| draft          | SUBMIT           | hasCompleteData   | submitted      | notifyReviewer                          |
| submitted      | ASSIGN_REVIEWER  | —                 | under_review   | —                                       |
| under_review   | APPROVE          | —                 | approved       | notifyApplicant                         |
| under_review   | REJECT           | —                 | rejected       | notifyApplicant                         |
| under_review   | REQUEST_INFO     | —                 | needs_info     | notifyApplicant                         |
| needs_info     | RESUBMIT         | —                 | under_review   | notifyReviewer                          |
| rejected       | REOPEN           | —                 | draft          | —                                       |
| approved       | FUND             | —                 | funded         | scheduleFunding, generateDocuments      |
| funded         | CLOSE            | —                 | closed         | —                                       |

**Terminal states:** `closed` (`{ type: "final" }`)

**Guard — `hasCompleteData`**: Checks that `context.data` contains a non-empty `applicantName` string and a `loanAmount` number greater than 0. Reads from `context` (entity's `data` field merged during hydration), NOT from event payload.

```typescript
// convex/demo/machines/loanApplication.machine.ts
import { setup } from "xstate";

export const loanApplicationMachine = setup({
  types: {
    context: {} as {
      entityId: string;
      data?: {
        applicantName?: string;
        loanAmount?: number;
      };
    },
    events: {} as
      | { type: "SUBMIT" }
      | { type: "ASSIGN_REVIEWER" }
      | { type: "APPROVE" }
      | { type: "REJECT" }
      | { type: "REQUEST_INFO" }
      | { type: "RESUBMIT" }
      | { type: "REOPEN" }
      | { type: "FUND" }
      | { type: "CLOSE" },
  },
  guards: {
    hasCompleteData: ({ context }) => {
      const data = context.data;
      return (
        data != null &&
        typeof data.applicantName === "string" &&
        data.applicantName.length > 0 &&
        typeof data.loanAmount === "number" &&
        data.loanAmount > 0
      );
    },
  },
}).createMachine({
  id: "loanApplication",
  initial: "draft",
  states: {
    draft: {
      on: {
        SUBMIT: {
          target: "submitted",
          guard: "hasCompleteData",
          actions: ["notifyReviewer"],
        },
      },
    },
    submitted: {
      on: {
        ASSIGN_REVIEWER: {
          target: "under_review",
        },
      },
    },
    under_review: {
      on: {
        APPROVE: {
          target: "approved",
          actions: ["notifyApplicant"],
        },
        REJECT: {
          target: "rejected",
          actions: ["notifyApplicant"],
        },
        REQUEST_INFO: {
          target: "needs_info",
          actions: ["notifyApplicant"],
        },
      },
    },
    needs_info: {
      on: {
        RESUBMIT: {
          target: "under_review",
          actions: ["notifyReviewer"],
        },
      },
    },
    approved: {
      on: {
        FUND: {
          target: "funded",
          actions: ["scheduleFunding", "generateDocuments"],
        },
      },
    },
    rejected: {
      on: {
        REOPEN: {
          target: "draft",
        },
      },
    },
    funded: {
      on: {
        CLOSE: {
          target: "closed",
        },
      },
    },
    closed: { type: "final" },
  },
});
```

## File Structure

```
convex/demo/
  machines/
    loanApplication.machine.ts        — Pure XState v5 machine definition (zero Convex imports)
```

## Existing Schema Pattern

The existing `convex/schema.ts` imports `defineSchema`, `defineTable` from `"convex/server"` and `v` from `"convex/values"`. Demo tables are defined inline in the same `defineSchema({...})` call, prefixed with `demo_`. The schema currently ends with Document Engine tables. Insert the new `demo_gt_*` tables after line 198 (end of the `demo_audit_mortgages` block and its comment).
