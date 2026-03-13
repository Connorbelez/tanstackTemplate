---
source_url: "https://friendly-zebra-716.convex.site/zod-plugin"
title: "Zod Plugin"
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
## Zod Plugin
The `WithZod` plugin (imported from `fluent-convex/zod`) adds Zod schema support to `.input()` and `.returns()`. You enable it by calling `.extend(WithZod)` on the builder chain.
The Zod plugin adds **full runtime validation**. Convex's built-in validators only check structural types (is this a number? is this a string?). Zod refinements like `.positive()`, `.min()`, `.max()`, `.email()` are enforced **server-side** before your handler runs. Invalid input throws before any database access happens.
### Refinements[#](https://friendly-zebra-716.convex.site/zod-plugin#refinements)
The example below requires the value to be a positive number. Try submitting a negative number or zero in the live demo - the server will reject it with a Zod validation error.
Zod refinements (.positive(), .min(), .max())[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/validators.ts#L88-L104 "View on GitHub")
```
export const addPositiveNumber = convex
  .mutation()
  .extend(WithZod)
  .input(
    z.object({
      value: z.number().positive("Value must be positive"),
      label: z.string().min(1).max(50).optional(),
    })
  )
  .returns(v.id("numbers"))
  .handler(async (ctx, input) => {
    if (input.label) {
      console.log(`Adding number with label: ${input.label}`);
    }
    return await ctx.db.insert("numbers", { value: input.value });
  })
  .public();
```

#### Live demo - try a negative number
Value (must be positive)
Label (optional, 1-50 chars)
Add
### Complex return types[#](https://friendly-zebra-716.convex.site/zod-plugin#complex-return-types)
Zod is also useful for complex return types. The `.returns()` validator checks the handler's output before sending it to the client.
Complex return types with Zod[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/validators.ts#L112-L139 "View on GitHub")
```
export const getNumberStats = convex
  .query()
  .extend(WithZod)
  .input(z.object({ limit: z.number().optional() }))
  .returns(
    z.object({
      total: z.number(),
      average: z.number(),
      min: z.number().nullable(),
      max: z.number().nullable(),
    })
  )
  .handler(async (ctx, input) => {
    const docs = await ctx.db
      .query("numbers")
      .order("desc")
      .take(input.limit ?? 100);
    const values = docs.map((n) => n.value);
    const total = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      total,
      average: total > 0 ? sum / total : 0,
      min: total > 0 ? Math.min(...values) : null,
      max: total > 0 ? Math.max(...values) : null,
    };
  })
  .public();
```

#### Live stats result
total: 10, avg: 49.0, min: 7, max: 95
Built with [fluent-convex](https://github.com/mikecann/fluent-convex) + [Convex](https://convex.dev) + [React](https://react.dev)
