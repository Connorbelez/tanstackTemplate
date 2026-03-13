---
source_url: "https://friendly-zebra-716.convex.site/"
title: "fluent-convex"
crawl_depth: 0
---

[![fluent-convex logo](https://friendly-zebra-716.convex.site/logo.png)fluent-convex](https://friendly-zebra-716.convex.site/)showcase & docs
[](https://github.com/mikecann/fluent-convex)[](https://www.npmjs.com/package/fluent-convex)
Guide
[Getting Started](https://friendly-zebra-716.convex.site/)[Validation](https://friendly-zebra-716.convex.site/validation)[Reusable Chains](https://friendly-zebra-716.convex.site/reusable-chains)[Middleware](https://friendly-zebra-716.convex.site/middleware)
Plugins
[Custom Plugins](https://friendly-zebra-716.convex.site/custom-plugins)[Zod Plugin](https://friendly-zebra-716.convex.site/zod-plugin)
Links
[GitHub repo](https://github.com/mikecann/fluent-convex)[Convex docs](https://docs.convex.dev)
![fluent-convex logo](https://friendly-zebra-716.convex.site/logo.png)
# fluent-convex
A fluent API builder for Convex functions with middleware support.
**fluent-convex** gives you a clean, chainable syntax for writing [Convex](https://convex.dev) backend functions. Instead of passing a configuration object, you build up your function step by step: `.query()`, `.input()`, `.handler()`, `.public()`.
On top of that, you get **composable middleware** , **reusable partial chains** , a **Zod plugin** for runtime validation, and an **extension system** for building your own plugins.
Every code snippet on this page is the **actual source code** powering this app, imported via Vite's `?raw` imports. What you see is what runs.
### Installation[#](https://friendly-zebra-716.convex.site/#installation)
Install via npm:
$ npm install fluent-convex
If you want to use the **Zod plugin** (`fluent-convex/zod`), also install its optional peer dependencies:
$ npm install zod convex-helpers
Everything starts with a single builder instance, typed to your Convex schema. Every file in your backend imports this builder and uses it to define functions.
convex/fluent.ts[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/fluent.ts#L15-L17 "View on GitHub")
```
// The root builder - typed to our schema so `context.db` knows
// about the `numbers` and `tasks` tables.
export const convex = createBuilder<DataModel>();
```

With the builder in place, you can define queries, mutations, and actions using a fluent chain. Call `.query()`, `.mutation()`, or `.action()` on the builder, add input validation with `.input()`, define your logic with `.handler()`, and register it with `.public()` or `.internal()`. The handler receives a fully-typed `ctx` (with `ctx.db` typed to your schema) and a validated `input` object.
convex/basics.ts - a simple query[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/basics.ts#L13-L25 "View on GitHub")
```
export const listNumbers = convex
  .query()
  .input({ count: v.number() })
  .handler(async (ctx, input) => {
    const numbers = await ctx.db
      .query("numbers")
      .order("desc")
      .take(input.count);
    return {
      numbers: numbers.reverse().map((n) => n.value),
    };
  })
  .public();
```

convex/basics.ts - a simple mutation[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/basics.ts#L29-L36 "View on GitHub")
```
export const addNumber = convex
  .mutation()
  .input({ value: v.number() })
  .handler(async (ctx, input) => {
    const id = await ctx.db.insert("numbers", { value: input.value });
    return id;
  })
  .public();
```

#### Live demo
Numbers: loading...
Add random numberClear all
Built with [fluent-convex](https://github.com/mikecann/fluent-convex) + [Convex](https://convex.dev) + [React](https://react.dev)
