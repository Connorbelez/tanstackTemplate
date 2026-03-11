---
name: convex-tracer
description: Add tracing and observability to Convex functions with sampled traces, nested spans, error preservation, and cross-function execution visibility. Use when working with observability, debugging, tracing, production diagnostics, or performance analysis.
---

# Convex Tracer

## Instructions

`convex-tracer` is a Convex component for observability and tracing in Convex applications. It helps you understand how queries, mutations, and actions execute across your backend, including nested spans, cross-function flows, and failures.

Use this component whenever you need better production diagnostics, performance visibility, or detailed tracing for complex backend behavior.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-tracer
```

Then register the component in `convex/convex.config.ts`:

```ts
import tracer from "convex-tracer/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(tracer);

export default app;
```

### Capabilities

- Trace Convex queries, mutations, and actions with structured execution data
- Capture nested spans for complex multi-step workflows
- Preserve error traces for debugging production failures
- Configure sampling so tracing overhead stays under control
- Add metadata and logs to traces during execution
- Improve visibility into slow functions, cross-function flows, and operational issues

## Examples

### how to initialize convex tracer

Create a shared tracer module in your Convex backend:

```ts
import { Tracer } from "convex-tracer";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const {
  tracedQuery,
  tracedMutation,
  tracedAction,
  internalTracedQuery,
  internalTracedMutation,
  internalTracedAction,
  tracer,
} = new Tracer<DataModel>(components.tracer, {
  sampleRate: 0.1,
  preserveErrors: true,
  retentionMinutes: 120,
});
```

This gives you traced wrappers that behave like normal Convex function builders, plus a shared tracer instance for lower-level instrumentation.

### how to create traced mutations in convex

Use traced wrappers instead of the standard function wrappers when you want automatic trace capture:

```ts
import { v } from "convex/values";
import { tracedMutation } from "./tracer";

export const createOrder = tracedMutation({
  name: "createOrder",
  args: {
    customerId: v.id("customers"),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.tracer.info("Starting order creation", {
      customerId: args.customerId,
      total: args.total,
    });

    const orderId = await ctx.db.insert("orders", {
      customerId: args.customerId,
      total: args.total,
      status: "pending",
    });

    await ctx.tracer.info("Order created", { orderId });

    return orderId;
  },
});
```

This is useful when you want automatic visibility into business-critical backend flows.

### how to create nested spans in convex tracer

Use nested spans to break complex logic into meaningful sub-operations:

```ts
import { tracedMutation } from "./tracer";
import { v } from "convex/values";

export const processPayment = tracedMutation({
  name: "processPayment",
  args: {
    orderId: v.id("orders"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.tracer.withSpan("chargeCustomer", async (span) => {
      await span.updateMetadata({
        orderId: args.orderId,
        amount: args.amount,
      });

      // payment logic here
      return { ok: true };
    });
  },
});
```

Nested spans are especially helpful for:

- payment processing
- order workflows
- AI pipelines
- third-party integrations
- multi-step onboarding
- background orchestration

### how to trace production errors in convex

Enable `preserveErrors: true` so failed traces are kept even when sampling is low. This gives you a much better chance of diagnosing production failures after the fact.

This is especially valuable for:

- flaky third-party integrations
- intermittent workflow bugs
- hard-to-reproduce customer issues
- complex multi-function mutations and actions

### how to use tracer for complex workflows

Tracer is a strong fit for backend flows that cross multiple steps or systems, such as:

- creating orders and charging payments
- user onboarding pipelines
- scheduled processing jobs
- webhook handling
- long-running background actions
- audit-heavy or compliance-sensitive operations

Whenever you would normally add lots of temporary logs just to understand what happened, tracing is often the better long-term tool.

## Best Practices

- Keep tracing wrappers in a shared Convex module.
- Give traced functions stable, descriptive names.
- Use nested spans only where they add debugging value.
- Attach metadata that helps diagnose behavior, not sensitive secrets.
- Preserve error traces even if normal trace sampling is low.
- Use sampling to control storage and overhead in high-traffic systems.
- Treat tracing as an observability aid, not a replacement for domain logging or audit logging.

## Troubleshooting

**When should I use `convex-tracer`?**

Use it when you need better visibility into backend execution, especially for complex, multi-step, or error-prone flows. It is most useful in production debugging and performance investigation.

**What kinds of Convex functions can be traced?**

The component supports queries, mutations, and actions, including internal variants through traced wrapper exports.

**Why use tracing instead of just `console.log`?**

Tracing gives you structured, related execution data across a whole function flow, including nested spans and preserved error context. Plain logs are often fragmented and harder to interpret across complex execution paths.

**Should I trace every function?**

Not necessarily. Trace the flows where debugging value is highest, such as billing, auth-adjacent operations, external integrations, and critical business workflows. Use sampling to limit overhead.

**Can I keep error traces even with low sampling?**

Yes. That is one of the main reasons to enable error preservation.

**What kind of data should I avoid attaching to traces?**

Do not attach raw secrets, API keys, tokens, passwords, or unnecessarily sensitive personal data. Keep trace metadata operationally useful but privacy-conscious.

## Resources

- [npm package](https://www.npmjs.com/package/convex-tracer)
- [GitHub repository](https://github.com/Moumen-io/convex-tracer)
- [Convex Components Directory](https://www.convex.dev/components/convex-tracer)
- [Convex documentation](https://docs.convex.dev)