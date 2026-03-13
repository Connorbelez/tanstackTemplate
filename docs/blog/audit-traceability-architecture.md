# Defense in Depth: Composing Triggers, Middleware, and Components for Compliance-Grade Audit Trails in Convex

*How FairLend combines four independent systems into a single atomic audit pipeline for regulated mortgage transactions.*

---

## The Problem No One Talks About

Modern serverless databases are designed for developer velocity. Convex gives you `ctx.db.insert`, `ctx.db.patch`, `ctx.db.delete` — powerful primitives that make building fast. They're also the exact capabilities that make audit immutability hard.

Any developer with database access can, in principle, modify or delete any row — including the rows that constitute your audit trail. This isn't a bug. It's a fundamental tension between developer ergonomics and regulatory compliance.

If you're building a fintech app that handles mortgage ownership transfers under PIPEDA, OSFI B-13, and SOC 2 Type II, "just add logging" doesn't cut it. You need guarantees — not policies.

FairLend's approach doesn't pretend this tension doesn't exist. Instead, it addresses it through **defense in depth**: four composable systems, each compensating for the limitations of the others.

---

## The Four Tools

Here's what we're working with:

| Tool | What It Does | What It Guarantees |
|------|-------------|-------------------|
| **Fluent Convex Middleware** | Enriches mutation context with actor identity, roles, permissions | Every audited mutation knows *who* is acting |
| **Database Triggers** (`convex-helpers`) | Fires automatically on every `ctx.db` write, in the same transaction | *Nothing is missed* — no mutation can skip audit |
| **`convex-audit-log` Component** | Stores audit events in an isolated component namespace | Host app's `ctx.db` *literally cannot* touch audit records at compile time |
| **`convex-tracer` Component** | Traces execution flows with nested spans and error preservation | You can observe the audit pipeline itself |

Each tool is useful on its own. The interesting part is how they compose.

---

## The Architecture: One Mutation, Four Systems

Here's what happens when a mortgage officer approves an ownership transfer:

```
Client: approveTransfer({ mortgageId })
  │
  ├── authMiddleware         → ctx gains { user, identity }
  ├── withAuditContext       → ctx gains { auditActor: "user_abc123" }
  ├── withTriggers           → ctx.db is wrapped with trigger-aware proxy
  │
  └── Handler body
       │
       ctx.db.patch(mortgageId, {
         status: "transfer_approved",
         updatedBy: ctx.auditActor      // ← middleware sets this
       })
       │
       └── TRIGGER FIRES (same transaction, atomically)
            │
            ├── sanitizeState(oldDoc, newDoc)
            │     → strips borrowerEmail, borrowerSsn, propertyAddress
            │     → recursive, case-insensitive substring matching
            │
            ├── computeHash(prevHash, eventType, entityId, ...)
            │     → SHA-256 chain link for tamper detection
            │
            ├── ctx.innerDb.insert("audit_events", { hash, sanitized state })
            │     → local event store with outbox pattern
            │
            └── auditLog.logChange(ctx, { before, after, generateDiff: true })
                  → component store (compile-time isolated)
```

The handler body is three lines of business logic. Everything else — PII sanitization, hash chains, audit storage, component isolation — happens automatically in the trigger.

If the business mutation commits, the audit record commits. If it rolls back, no orphaned audit record exists. This is the transactional outbox pattern, and it's free because triggers run in the same transaction.

---

## The Novel Pattern: Triggers as Fluent Middleware

The typical way to use Convex triggers is with `convex-helpers`' `customMutation`:

```typescript
import { customMutation, customCtx } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

const triggers = new Triggers<DataModel>();
triggers.register("mortgages", async (ctx, change) => { /* ... */ });

const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

This works, but it creates a separate mutation builder. If you're using Fluent Convex for middleware composition (auth, RBAC, logging), you now have two incompatible systems.

The insight: `triggers.wrapDB` is just a function that takes a ctx and returns a ctx with a wrapped `db`. That's exactly what a middleware does.

```typescript
import { createBuilder } from "fluent-convex";

const convex = createBuilder<DataModel>();

// Triggers as a fluent middleware
const withTriggers = convex
  .$context<{ db: GenericDatabaseWriter<DataModel> }>()
  .createMiddleware(async (context, next) => {
    return next(triggers.wrapDB(context));
  });

// Now triggers compose with everything else
const auditedMutation = convex
  .mutation()
  .use(authMiddleware)        // who is acting
  .use(withAuditContext)      // enrich with audit actor ID
  .use(withTriggers);         // wrap db — triggers fire on every write
```

Any mutation built on `auditedMutation` gets auth + audit context + automatic trigger-based audit capture. By construction, not by convention.

```typescript
export const approveTransfer = auditedMutation
  .input({ mortgageId: v.id("demo_audit_mortgages") })
  .handler(async (ctx, input) => {
    // This is ALL the developer writes.
    // Triggers handle the rest.
    await ctx.db.patch(input.mortgageId, {
      status: "transfer_approved",
      updatedBy: ctx.auditActor,
      updatedAt: Date.now(),
    });
  })
  .public();
```

---

## The Actor Problem: How Triggers Know "Who"

Triggers see document changes. They don't see HTTP headers or auth tokens. So how does the trigger know who performed the action?

We bridge this with a simple pattern: the middleware sets a field on the document, and the trigger reads it.

```typescript
// Middleware enriches context
const withAuditContext = convex
  .$context<{ user: Doc<"users"> }>()
  .createMiddleware(async (context, next) => {
    return next({ ...context, auditActor: context.user.authId });
  });

// Handler writes actor to the document
await ctx.db.patch(id, { updatedBy: ctx.auditActor, ...changes });

// Trigger reads it from the change
triggers.register("demo_audit_mortgages", async (ctx, change) => {
  const actorId = change.newDoc?.updatedBy ?? "system";
  // ... emit audit event with actorId
});
```

This keeps the systems loosely coupled. The middleware doesn't know about triggers. The triggers don't know about middleware. They communicate through the document — the one thing they both touch.

---

## Per-Entity Hash Chains: Tamper Detection Without an External Store

Every audit event includes a SHA-256 hash computed from the previous event's hash plus the current event's data:

```typescript
hash = SHA-256(prevHash | eventType | entityId | actorId | timestamp | afterState)
```

Chains are **per-entity**, not global. This is critical in Convex — a global chain would mean every audit write contends with every other audit write (OCC conflicts). Per-entity chains only contend within a single entity's history, which is rare.

The first event in a chain uses `prevHash = ""`.

```typescript
async function computeHash(parts: {
  prevHash: string;
  eventType: string;
  entityId: string;
  actorId: string;
  timestamp: number;
  afterState: string;
}): Promise<string> {
  const payload = [
    parts.prevHash, parts.eventType, parts.entityId,
    parts.actorId, String(parts.timestamp), parts.afterState,
  ].join("|");

  const data = new TextEncoder().encode(payload);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
```

Verification walks the chain and recomputes every hash:

```typescript
export const verifyChain = convex.query()
  .input({ entityId: v.string() })
  .handler(async (ctx, input) => {
    const events = await ctx.db
      .query("demo_audit_events")
      .withIndex("by_entity", q => q.eq("entityId", input.entityId))
      .order("asc")
      .collect();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const expectedPrevHash = i === 0 ? "" : events[i - 1].hash;

      if (event.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: i, reason: "prevHash mismatch" };
      }

      const recomputed = await computeHash({
        prevHash: event.prevHash,
        eventType: event.eventType,
        entityId: event.entityId,
        actorId: event.actorId,
        timestamp: event.timestamp,
        afterState: event.afterState ?? "",
      });

      if (recomputed !== event.hash) {
        return { valid: false, brokenAt: i, reason: "hash mismatch" };
      }
    }

    return { valid: true, chainLength: events.length };
  })
  .public();
```

If someone modifies an audit record through the Convex dashboard, `verifyChain` catches it on the next run. Modified events break the hash chain. Deleted events break the `prevHash` link. Inserted events break both.

This doesn't prevent tampering — an attacker with database access could recompute the entire chain. That's what the external append-only store (Layer 5, roadmap) addresses. But for audit purposes, hash chains make tampering **detectable and attributable**.

---

## PII: Omit, Don't Mask

The audit trail records business transitions — ownership percentages, status changes, deal stages. It does not record personal identity.

```typescript
const SENSITIVE_SUBSTRINGS = [
  "email", "phone", "ssn", "socialsecuritynumber", "dateofbirth",
  "dob", "accountnumber", "routingnumber", "creditcardnumber",
  "bankaccount", "password", "accesstoken", "refreshtoken",
  "apikey", "secret", "token", "streetaddress", "fulladdress",
];

function sanitizeState(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeState);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_SUBSTRINGS.some(s => lowerKey.includes(s));
    result[key] = isSensitive ? "[REDACTED]" : sanitizeState(value);
  }
  return result;
}
```

Notice the **substring matching**: a field named `borrowerEmail` is caught because its lowercased form contains `"email"`. Same for `userSSN`, `primaryPhone`, `streetAddress`. This is aggressive by design — false positives (redacting too much) are far less dangerous than false negatives (leaking PII into audit records).

A mortgage ownership transfer audit record looks like this:

```json
{
  "eventType": "transfer.completed",
  "beforeState": {
    "currentOwnerId": "fairlend",
    "ownershipPercentage": 100,
    "status": "transfer_approved",
    "borrowerEmail": "[REDACTED]",
    "borrowerSsn": "[REDACTED]",
    "propertyAddress": "[REDACTED]",
    "loanAmount": 450000
  },
  "afterState": {
    "currentOwnerId": "investor_abc",
    "ownershipPercentage": 75,
    "status": "transfer_completed",
    "borrowerEmail": "[REDACTED]",
    "borrowerSsn": "[REDACTED]",
    "propertyAddress": "[REDACTED]",
    "loanAmount": 450000
  }
}
```

The audit record captures *what happened* (ownership moved from fairlend to investor_abc at 75%) without *who it happened to* (no borrower identity).

---

## Component Isolation: TypeScript as a Security Layer

`convex-audit-log` is a Convex Component. This means its internal tables are invisible to the host application's `ctx.db`. If a developer writes:

```typescript
// This is a TypeScript error — the table doesn't exist in the host's DataModel
await ctx.db.query("audit_events").collect();
```

It fails at **compile time**, not runtime. There is no `audit_events` table in the host schema. The component manages its own storage behind a controlled API: `log()`, `logChange()`, `queryByResource()`, `queryByActor()`, `watchCritical()`.

No `update`. No `delete`. No `patch`. Append-only by absence of code, not by policy.

To modify audit records, a developer would need to: (1) fork the component source, (2) add a delete/update export, (3) redeploy the component, (4) call it from the host. All four steps are visible in version control and deployment logs.

---

## The Transactional Outbox

Audit events are written inside the business mutation's transaction. A cron job polls for unemitted events every 60 seconds:

```typescript
export const emitPendingEvents = internalMutation({
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("demo_audit_events")
      .withIndex("by_emitted", q => q.eq("emitted", false))
      .take(100);

    for (const event of pending) {
      // In production: emit to Pulsar/S3/external system
      // In demo: just mark as emitted
      await ctx.db.patch(event._id, {
        emitted: true,
        emittedAt: Date.now(),
      });
    }
  },
});
```

Delivery is at-least-once. Downstream consumers must be idempotent. The `emitted` boolean + `emittedAt` timestamp let you monitor pipeline health: if events sit unemitted for more than 2 minutes, something is wrong.

---

## Observability of the Audit Pipeline

The audit system is infrastructure. Infrastructure needs monitoring.

`convex-tracer` wraps key operations with structured traces:

```typescript
const { tracedMutation, tracer } = new Tracer<DataModel>(components.tracer, {
  sampleRate: 1.0,
  preserveErrors: true,
  retentionMinutes: 120,
});

export const tracedTransferLifecycle = tracedMutation({
  name: "tracedTransferLifecycle",
  handler: async (ctx) => {
    const id = await ctx.tracer.withSpan("createMortgage", async (span) => {
      // ...
    });

    await ctx.tracer.withSpan("initiateTransfer", async (span) => {
      // ...
    });

    await ctx.tracer.withSpan("approveTransfer", async (span) => {
      // ...
    });

    await ctx.tracer.withSpan("completeTransfer", async (span) => {
      // ...
    });
  },
});
```

Each span captures timing, metadata, and errors. If the hash chain computation is slow, you'll see it. If the component call fails, the error trace is preserved even at low sampling rates.

---

## What This Doesn't Solve

Honesty matters more than marketing:

- **Dashboard tampering is detectable, not prevented.** An operator with Convex dashboard access can modify rows directly. The hash chain catches it — but after the fact.
- **No external immutable store yet.** The `IEventEmitter` adapter pattern is designed for Pulsar/S3 Object Lock, but that's roadmap. Today, the hash chain is the strongest tamper-detection layer.
- **Failed operations aren't recorded.** If a mutation throws before the `ctx.db.patch` call, no trigger fires and no audit record exists. The mutation also doesn't commit (no state changed), but the *attempt* isn't in the structured trail.

These are real limitations. Each one has a mitigation on the roadmap. But shipping something imperfect today is better than shipping nothing perfect never.

---

## The Composition Principle

The key insight isn't any individual tool. It's that four independent systems — each with different failure modes — compose into something stronger than any one of them alone:

- Middleware fails? Triggers still capture the write.
- Trigger missed? The component's query API reveals gaps in the trail.
- Component compromised? The hash chain detects modification.
- Hash chain recomputed? The external store (future) has the original.

Each layer compensates for the limitations of the one below it. That's defense in depth — and in regulated fintech, it's the only architecture that lets you sleep at night.

---

*Built with [Convex](https://convex.dev), [Fluent Convex](https://github.com/get-convex/fluent-convex), [convex-helpers](https://github.com/get-convex/convex-helpers), [convex-audit-log](https://www.convex.dev/components/convex-audit-log), and [convex-tracer](https://www.convex.dev/components/convex-tracer).*
