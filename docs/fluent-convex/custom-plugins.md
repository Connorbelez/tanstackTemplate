---
source_url: "https://friendly-zebra-716.convex.site/custom-plugins"
title: "Custom Plugins"
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
## Custom Plugins
The `.extend()` method lets you swap the builder class for your own subclass. This is how the Zod plugin works internally, and you can use the same pattern to add any custom methods to the chain.
The key requirement is overriding `_clone()` so your plugin type is preserved through `.use()`, `.input()`, and `.returns()` calls. Without this, the chain would revert to the base builder type after the first method call.
The example below defines a `TimedBuilder` plugin that adds a `.withTiming(name)` method. Calling it wraps the function in an onion middleware that logs start/end times.
convex/plugin.ts - defining a plugin[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/plugin.ts#L27-L72 "View on GitHub")
```
export class TimedBuilder<
  TDataModel extends GenericDataModel = GenericDataModel,
  TFunctionType extends FunctionType = FunctionType,
  TCurrentContext extends Context = EmptyObject,
  TArgsValidator extends ConvexArgsValidator | undefined = undefined,
  TReturnsValidator extends ConvexReturnsValidator | undefined = undefined,
> extends ConvexBuilderWithFunctionKind<
  TDataModel,
  TFunctionType,
  TCurrentContext,
  TArgsValidator,
  TReturnsValidator
> {
  constructor(builderOrDef: any) {
    const def =
      builderOrDef instanceof ConvexBuilderWithFunctionKind
        ? (builderOrDef as any).def
        : builderOrDef;
    super(def);
  }

  // Override _clone so TimedBuilder survives through .use(), .input(), etc.
  protected _clone(def: ConvexBuilderDef<any, any, any>): any {
    return new TimedBuilder(def);
  }

  /** Add automatic execution timing via onion middleware. */
  withTiming(operationName: string) {
    return this.use(async (ctx, next) => {
      const start = Date.now();
      console.log(`[TIMER:${operationName}] Start`);
      try {
        const result = await next(ctx);
        console.log(
          `[TIMER:${operationName}] Done in ${Date.now() - start}ms`
        );
        return result;
      } catch (error) {
        console.error(
          `[TIMER:${operationName}] Error after ${Date.now() - start}ms`
        );
        throw error;
      }
    });
  }
}
```

### Using the plugin[#](https://friendly-zebra-716.convex.site/custom-plugins#using-the-plugin)
Once defined, you use it with `.extend(TimedBuilder)` and then call your custom method. The rest of the chain works as normal.
convex/plugin.ts - using the plugin[](https://github.com/mikecann/fluent-convex/blob/main/apps/docs/convex/plugin.ts#L76-L84 "View on GitHub")
```
export const timedQuery = convex
  .query()
  .extend(TimedBuilder)
  .withTiming("timedQuery")
  .input({ echo: v.string() })
  .handler(async (_ctx, input) => {
    return { message: `Echo: ${input.echo}`, timestamp: Date.now() };
  })
  .public();
```

#### Live demo
Echo input
...
Check the Convex dashboard logs to see the timing output from the plugin.
Built with [fluent-convex](https://github.com/mikecann/fluent-convex) + [Convex](https://convex.dev) + [React](https://react.dev)
