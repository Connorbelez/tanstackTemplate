---
source_url: "https://friendly-zebra-716.convex.site/middleware"
title: "Middleware"
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
## Middleware
Middleware lets you compose reusable logic that runs before (and optionally after) your handler. There are two main patterns:
  * **Context-enrichment** - transforms the context object by adding new properties. The middleware calls `next({ ...context, user })` and everything downstream sees the new property with full type safety.
  * **Onion (wrap)** - runs code both _before_ and _after_ the rest of the chain. Because `next()` awaits the downstream middleware + handler, you can measure timing, catch errors, or post-process results.

### Defining middleware[#](https://friendly-zebra-716.convex.site/middleware#defining-middleware)
You create middleware with `.createMiddleware()`. The function receives the current context and a `next` callback. Call `next()` with a new context to pass it downstream. If you need your middleware to work across queries, mutations, and actions, use `.$context<{ auth: Auth }>()` to scope the required context to the minimal shape shared by all function types.
Context-enrichment: authMiddleware[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/fluent.ts#L23-L43 "View on GitHub")
```
// Context-enrichment middleware: checks authentication and adds `user`
// to the context. Works with queries, mutations, and actions because
// we scope the required context to the minimal `{ auth: Auth }` shape
// that all Convex function types share.
export const authMiddleware = convex
  .$context<{ auth: Auth }>()
  .createMiddleware(async (context, next) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Everything downstream now has `context.user` available
    return next({
      ...context,
      user: {
        id: identity.subject,
        name: identity.name ?? "Unknown",
      },
    });
  });
```

Simple enrichment: addTimestamp[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/middleware.ts#L19-L26 "View on GitHub")
```
// Simple context-enrichment middleware: injects the current timestamp
// into the context so handlers can use `context.timestamp`.
export const addTimestamp = convex.createMiddleware(async (context, next) => {
  return next({
    ...context,
    timestamp: Date.now(),
  });
});
```

Because onion middleware wraps the handler, it can measure timing, catch errors, log results, or retry. The `withLogging` example below is parameterized - you pass an operation name and get back a middleware instance:
Onion middleware: withLogging(name)[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/middleware.ts#L31-L51 "View on GitHub")
```
// Onion middleware (parameterized): wraps the entire downstream chain
// so it can measure execution time and catch errors. Because `next()`
// executes all subsequent middleware + the handler, this middleware
// "surrounds" them like layers of an onion.
export const withLogging = (operationName: string) =>
  convex.createMiddleware(async (context, next) => {
    const start = Date.now();
    console.log(`[${operationName}] Starting...`);
    try {
      const result = await next(context);
      const duration = Date.now() - start;
      console.log(`[${operationName}] Completed in ${duration}ms`);
      return result;
    } catch (error: any) {
      const duration = Date.now() - start;
      console.error(
        `[${operationName}] Failed after ${duration}ms: ${error.message}`
      );
      throw error;
    }
  });
```

### Applying middleware with .use()[#](https://friendly-zebra-716.convex.site/middleware#applying-middleware)
Once defined, you apply middleware with `.use()`. You can chain multiple `.use()` calls - each one merges its context additions with the previous ones. The handler receives the combined context with everything fully typed.
convex/chains.ts - single and stacked .use() calls[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/chains.ts#L90-L120 "View on GitHub")
```
// Single middleware - adds `context.user`
export const authedNumbers = convex
  .query()
  .use(authMiddleware)
  .input({ count: v.number() })
  .handler(async (ctx, input) => {
    const numbers = await ctx.db.query("numbers").order("desc").take(input.count);
    return {
      viewer: ctx.user.name, // <-- from authMiddleware
      numbers: numbers.map((n) => n.value),
    };
  })
  .public();

// Multiple middleware - each .use() merges its context additions
export const loggedAuthedNumbers = convex
  .query()
  .use(withLogging("loggedAuthedNumbers"))
  .use(authMiddleware)
  .use(addTimestamp)
  .input({ count: v.number() })
  .handler(async (ctx, input) => {
    const numbers = await ctx.db.query("numbers").order("desc").take(input.count);
    return {
      viewer: ctx.user.name, // <-- from authMiddleware
      timestamp: ctx.timestamp, // <-- from addTimestamp
      numbers: numbers.map((n) => n.value),
      // withLogging wraps this handler and logs timing to the console
    };
  })
  .public();
```

### Why `$context`?[#](https://friendly-zebra-716.convex.site/middleware#why-context)
If you create middleware with `convex.query().createMiddleware(fn)`, the input context is typed as `QueryCtx` (which includes `db`). That middleware **can't** be used on a mutation or action — `ActionCtx` is not assignable to `QueryCtx`, so `.use(authMiddleware)` will produce a type error.
The fix is `.$context<{ auth: Auth }>()`: it declares _exactly_ what your middleware needs from the context. Since `auth` exists on all three function types (queries, mutations, and actions), the middleware is compatible with all of them.
Three approaches, and when to use each:
  * `convex.query().createMiddleware(fn)` — input context is `QueryCtx`. Use when middleware needs `db`.
  * `convex.createMiddleware(fn)` — input context is `EmptyObject`. Use when middleware needs no context at all.
  * `convex.$context<{ auth: Auth }>().createMiddleware(fn)` — input context is exactly `{ auth: Auth }`. Use when middleware needs specific properties shared across all function types.

### Auth middleware in practice[#](https://friendly-zebra-716.convex.site/middleware#auth-middleware)
A common pattern is to bake auth middleware into reusable chains like `authedQuery`, `authedMutation`, and `authedAction`. Every function built from them automatically requires a logged-in user and has `ctx.user` available, fully typed, no casting needed. Because the middleware uses `$context`, one middleware definition works for all three function types.
convex/fluent.ts - defining reusable auth chains[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/fluent.ts#L47-L53 "View on GitHub")
```
// Reusable partial chains - pre-configure middleware so downstream
// consumers don't need to repeat `.use(authMiddleware)` everywhere.
// Because authMiddleware uses $context<{ auth: Auth }>, it works
// with all three function types - queries, mutations, AND actions.
export const authedQuery = convex.query().use(authMiddleware);
export const authedMutation = convex.mutation().use(authMiddleware);
export const authedAction = convex.action().use(authMiddleware);
```

convex/authed.ts - a query using authedQuery[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/authed.ts#L15-L30 "View on GitHub")
```
export const listTasks = authedQuery
  .input({})
  .handler(async (ctx) => {
    // ctx.user is available from authMiddleware - fully typed!
    const tasks = await ctx.db.query("tasks").collect();
    return {
      viewer: ctx.user.name,
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        completed: t.completed,
        priority: t.priority,
      })),
    };
  })
  .public();
```

convex/authed.ts - a mutation using authedMutation[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/authed.ts#L34-L52 "View on GitHub")
```
export const addTask = authedMutation
  .input({
    title: v.string(),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
  })
  .handler(async (ctx, input) => {
    const id = await ctx.db.insert("tasks", {
      title: input.title,
      completed: false,
      priority: input.priority,
      createdBy: ctx.user.name,
    });
    return id;
  })
  .public();
```

convex/authed.ts - an action using authedAction[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/authed.ts#L77-L90 "View on GitHub")
```
// The same authMiddleware works on actions too - ctx.user is available!
export const getTaskSummary = authedAction
  .input({})
  .handler(async (ctx) => {
    const result: { viewer: string; tasks: { completed: boolean }[] } =
      await ctx.runQuery(api.authed.listTasks, {});
    const total = result.tasks.length;
    const done = result.tasks.filter((t) => t.completed).length;
    return {
      viewer: ctx.user.name,
      summary: `${done}/${total} tasks completed`,
    };
  })
  .public();
```

#### Live demo - sign in to manage tasks
Sign in to try the authenticated task manager demo.
Try with demo account
Built with [fluent-convex](https://github.com/mikecann/fluent-convex) + [Convex](https://convex.dev) + [React](https://react.dev)
