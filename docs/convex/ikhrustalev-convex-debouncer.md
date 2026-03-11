---
name: ikhrustalev-convex-debouncer
description: Debounce expensive server-side operations with sliding, fixed, or eager modes so only the latest meaningful update is processed. Use when working with debouncing, expensive operations, background processing.
---

# Convex Debouncer

## Instructions

`@ikhrustalev/convex-debouncer` is a Convex component for server-side debouncing. It helps you delay expensive backend work until activity settles down, while still guaranteeing that the latest meaningful state is what gets processed.

Prefer this component when repeated mutations would otherwise trigger wasteful downstream work such as LLM calls, metric recomputation, autosave processing, re-indexing, or expensive sync jobs.

### Installation

Because this project uses Bun, install it with:

```bash
bun add @ikhrustalev/convex-debouncer
```

Then register the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import debouncer from "@ikhrustalev/convex-debouncer/convex.config";

const app = defineApp();

app.use(workOSAuthKit);
app.use(debouncer);

export default app;
```

### Capabilities

- Delay expensive backend work until updates stop arriving.
- Ensure the latest payload is what ultimately gets processed.
- Support multiple debouncing strategies depending on UX and system needs.
- Centralize burst-control logic on the server instead of duplicating it in clients.
- Reduce unnecessary calls to LLMs, search indexing, notifications, analytics, or recomputation pipelines.

## When to Reach for It

Use this component when:

- A user can trigger the same expensive operation many times in quick succession.
- You want to process only the latest change after a quiet period.
- You need immediate execution once, then a trailing update later.
- You want debouncing guarantees to live in Convex instead of relying only on browser timing.

Avoid reaching for it when every event must be processed individually. In that case, a queue, workflow, cron, or retrier pattern is usually a better fit.

## Core Concepts

### Sliding mode

Each new call resets the timer. The function runs only after no new calls arrive during the configured delay.

Best for:

- search-as-you-type
- autosave
- validation
- recomputing derived state after editing stops

### Fixed mode

The first call starts the timer. Later calls update the pending arguments, but do not extend the timer.

Best for:

- batching frequent updates into predictable windows
- periodic recomputation
- rate-sensitive external APIs

### Eager mode

The first call executes immediately. If more calls happen during the cooldown window, one trailing execution runs later with the latest arguments.

Best for:

- AI responses where you want instant feedback plus a final recompute
- collaborative state updates
- flows where the first action should feel immediate but spam should still collapse

## Example

### how to debounce expensive recomputation after repeated updates

Create a debouncer instance and schedule a trailing job from a mutation:

```ts
import { Debouncer } from "@ikhrustalev/convex-debouncer";
import { components, internal } from "./_generated/api";
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const debouncer = new Debouncer(components.debouncer, {
  delay: 5000,
  mode: "sliding",
});

export const updateProperty = mutation({
  args: {
    propertyId: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    // Your normal write logic here.

    await debouncer.schedule(
      ctx,
      "property-metrics",
      args.propertyId,
      internal.metrics.compute,
      { propertyId: args.propertyId },
    );
  },
});

export const compute = internalMutation({
  args: {
    propertyId: v.string(),
  },
  handler: async (_ctx, args) => {
    console.log("Recomputing metrics for", args.propertyId);
  },
});
```

### namespace and key guidance

The combination of namespace and key determines which repeated events collapse into one debounced execution.

A good rule:

- namespace = the type of work being debounced
- key = the specific entity being updated

Examples:

- `"property-metrics"` + `propertyId`
- `"thread-summary"` + `threadId`
- `"search-index"` + `documentId`

## Patterns

### Debounce LLM summarization

When a thread or note changes rapidly, schedule summarization instead of calling the model on every keystroke.

```ts
await debouncer.schedule(
  ctx,
  "thread-summary",
  args.threadId,
  internal.ai.generateSummary,
  { threadId: args.threadId },
);
```

### Debounce autosave post-processing

If a document is autosaved often, debounce expensive steps like diff generation, version compaction, or downstream sync.

```ts
await debouncer.schedule(
  ctx,
  "document-post-process",
  args.documentId,
  internal.documents.postProcess,
  { documentId: args.documentId },
);
```

### Eager first run with trailing latest state

If you want one immediate execution and then one follow-up with the newest payload, configure eager mode:

```ts
const debouncer = new Debouncer(components.debouncer, {
  delay: 3000,
  mode: "eager",
});
```

## Best Practices

- Keep the debounced function idempotent when possible.
- Use stable, predictable namespace values.
- Choose keys at the entity level so unrelated work does not collapse together.
- Use `sliding` when “wait until activity stops” is the correct behavior.
- Use `fixed` when you want bounded latency and periodic consolidation.
- Use `eager` when the first response should be immediate but extra calls should collapse.
- Pass only the minimal arguments needed by the debounced function.
- Pair this with caching if the expensive work also produces reusable results.

## Troubleshooting

**Why is my function not running immediately?**

If you're using `sliding` or `fixed` mode, delayed execution is expected. Use `eager` mode if you want the first invocation to happen right away.

**Why does only the latest payload get processed?**

That is the point of debouncing. Later calls replace earlier pending arguments for the same namespace and key.

**What should I use as the key?**

Use the identifier for the specific entity whose work should collapse together, such as a `threadId`, `documentId`, or `userId`.

**Can I debounce multiple kinds of work independently?**

Yes. Use different namespaces so separate workloads do not interfere with each other.

**Should I debounce in the client or the server?**

Use server-side debouncing when correctness matters across clients, tabs, sessions, or devices. Client-side debouncing can still help reduce chatter, but it should not be the only safeguard when backend cost matters.

## Resources

- [npm package](https://www.npmjs.com/package/@ikhrustalev/convex-debouncer)
- [GitHub repository](https://github.com/ikhrustalev/convex-debouncer)
- [Convex Components Directory](https://www.convex.dev/components/ikhrustalev/convex-debouncer)
- [Convex documentation](https://docs.convex.dev)