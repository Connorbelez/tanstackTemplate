---
source_url: "https://friendly-zebra-716.convex.site/validation"
title: "Validation"
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
## Validation
The `.input()` method accepts three flavors of validators, all through the same API. You can also add explicit return type validation with `.returns()`.
Here is the same query written three different ways. Each one fetches the most recent numbers from the database - the only difference is how the input is validated.
### 1. Property validators[#](https://friendly-zebra-716.convex.site/validation#property-validators)
The simplest form. Pass a plain object where each key is a Convex validator. This is equivalent to the standard Convex `args` object.
Property validators[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/validators.ts#L23-L33 "View on GitHub")
```
export const listWithPropertyValidators = convex
  .query()
  .input({ count: v.number() })
  .handler(async (ctx, input) => {
    const numbers = await ctx.db
      .query("numbers")
      .order("desc")
      .take(input.count);
    return { numbers: numbers.map((n) => n.value) };
  })
  .public();
```

### 2. Object validators with .returns()[#](https://friendly-zebra-716.convex.site/validation#object-validators)
You can also pass a `v.object()` validator directly. Pairing it with `.returns()` gives you explicit return type validation - Convex will check the output matches at runtime.
Object validators + .returns()[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/validators.ts#L41-L52 "View on GitHub")
```
export const listWithObjectValidators = convex
  .query()
  .input(v.object({ count: v.number() }))
  .returns(v.object({ numbers: v.array(v.number()) }))
  .handler(async (ctx, input) => {
    const numbers = await ctx.db
      .query("numbers")
      .order("desc")
      .take(input.count);
    return { numbers: numbers.map((n) => n.value) };
  })
  .public();
```

### 3. Zod schemas via .extend(WithZod)[#](https://friendly-zebra-716.convex.site/validation#zod-schemas)
With the `WithZod` plugin, you can pass Zod schemas to `.input()` and `.returns()`. Zod schemas are automatically converted to Convex validators for structural validation, and Zod's own runtime validation (including refinements) runs on top. More on this in the [Zod Plugin](https://friendly-zebra-716.convex.site/zod-plugin) section.
Zod schemas via .extend(WithZod)[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/validators.ts#L60-L80 "View on GitHub")
```
export const listWithZod = convex
  .query()
  .extend(WithZod)
  .input(
    z.object({
      count: z.number().int().min(1).max(100),
    })
  )
  .returns(
    z.object({
      numbers: z.array(z.number()),
    })
  )
  .handler(async (ctx, input) => {
    const numbers = await ctx.db
      .query("numbers")
      .order("desc")
      .take(input.count);
    return { numbers: numbers.map((n) => n.value) };
  })
  .public();
```

#### Live demo - all three return the same data
property
...
v.object()
...
Zod
...
Built with [fluent-convex](https://github.com/mikecann/fluent-convex) + [Convex](https://convex.dev) + [React](https://react.dev)
