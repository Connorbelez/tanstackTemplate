---
source_url: "https://friendly-zebra-716.convex.site/reusable-chains"
title: "Reusable Chains & Callable Syntax"
crawl_depth: 1
---

[![fluent-convex logo](https://friendly-zebra-716.convex.site/logo.png)fluent-convex](https://friendly-zebra-716.convex.site/)showcase & docs
[](https://github.com/mikecann/fluent-convex)[](https://www.npmjs.com/package/fluent-convex)
Guide
[Getting Started](https://friendly-zebra-716.convex.site/)[Validation](https://friendly-zebra-716.convex.site/validation)[Reusable Chains](https://friendly-zebra-716.convex.site/reusable-chains)[Middleware](https://friendly-zebra-716.convex.site/middleware)
Plugins
[Custom Plugins](https://friendly-zebra-716.convex.site/custom-plugins)[Zod Plugin](https://friendly-zebra-716.convex.site/zod-plugin)
Links
[GitHub repo](https://github.com/mikecann/fluent-convex)[Convex docs](https://docs.convex.dev)
## Reusable Chains & Callable Syntax
Because the builder is immutable and every method returns a new instance, you can **stop the chain at any point** and reuse that partial builder elsewhere.
A builder that has a `.handler()` but hasn't been registered with `.public()` / `.internal()` is called a **callable**. It's a fully-typed function you can invoke directly from other handlers, register as a standalone endpoint, or extend with more middleware, all from the same definition.
### Define once as a callable[#](https://friendly-zebra-716.convex.site/reusable-chains#callable-as-building-block)
Start by defining your logic as a callable. It looks just like a normal fluent-convex function, but without the final `.public()` or `.internal()` call. You can register it later whenever you need a real Convex endpoint.
convex/chains.ts - a callable + its registered form[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/chains.ts#L24-L35 "View on GitHub")
```
// This callable is NOT registered - it's a reusable building block.
// Think of it like a helper function, but with full middleware support.
const getNumbers = convex
  .query()
  .input({ count: v.number() })
  .handler(async (ctx, args) => {
    const rows = await ctx.db.query("numbers").order("desc").take(args.count);
    return rows.map((r) => r.value);
  });

// Register it as a public query - clients can call this over the network.
export const listNumbers = getNumbers.public();
```

### Call it inside other handlers[#](https://friendly-zebra-716.convex.site/reusable-chains#call-from-handler)
Because `getNumbers` is callable, you can invoke it directly from inside another handler. No additional Convex function invocation, no extra registration - just a direct, in-process call with full type safety on both the arguments and return value.
convex/chains.ts - calling a callable inside another handler[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/chains.ts#L43-L58 "View on GitHub")
```
// Because `getNumbers` is callable, we can invoke it directly
// inside other handlers. No additional Convex function invocation,
// full type safety on args and return value.
export const getNumbersWithTimestamp = convex
  .query()
  .input({ count: v.number() })
  .handler(async (ctx, args) => {
    // Call the unregistered callable directly - reuses the same logic
    const numbers = await getNumbers(ctx, args);

    return {
      numbers,
      fetchedAt: Date.now(),
    };
  })
  .public();
```

The syntax is `callable(ctx, args)`. The first argument passes the context (so the middleware chain runs with the correct ctx), the second passes the validated arguments. This mirrors the handler signature shape.
### Register the same callable multiple ways[#](https://friendly-zebra-716.convex.site/reusable-chains#register-multiple-ways)
Since the original callable is immutable, you can derive as many registered functions from it as you like, each with different middleware or visibility. The base logic is written once.
convex/chains.ts - same callable, many registrations[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/chains.ts#L66-L82 "View on GitHub")
```
// The original callable is unchanged - we can register it again
// with different middleware stacked on top.

// Public, with logging
export const listNumbersLogged = getNumbers
  .use(withLogging("listNumbersLogged"))
  .public();

// Protected behind auth
export const listNumbersProtected = getNumbers
  .use(authMiddleware)
  .public();

// Internal only (server-to-server), with timestamp middleware
export const listNumbersInternal = getNumbers
  .use(addTimestamp)
  .internal();
```

### Stacking middleware on a callable[#](https://friendly-zebra-716.convex.site/reusable-chains#stacking-middleware)
Each `.use()` call returns a new builder, so the original callable is always untouched. You can build up as many layers as you need before registering.
Stacking middleware on a callable[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/chains.ts#L128-L146 "View on GitHub")
```
const listWithMetadata = convex
  .query()
  .input({ count: v.number() })
  .handler(async (ctx, input) => {
    const numbers = await ctx.db
      .query("numbers")
      .order("desc")
      .take(input.count);
    return {
      numbers: numbers.map((n) => n.value),
      timestamp: (ctx as any).timestamp as number | undefined,
    };
  });

// Stack logging + timestamp middleware, then register
export const listNumbersWithMetadata = listWithMetadata
  .use(withLogging("listNumbersWithMetadata"))
  .use(addTimestamp)
  .public();
```

#### Live demo
listNumbers (public)
...
getNumbersWithTimestamp (calls callable)
...
listNumbersWithMetadata (stacked middleware)
...
Built with [fluent-convex](https://github.com/mikecann/fluent-convex) + [Convex](https://convex.dev) + [React](https://react.dev)
