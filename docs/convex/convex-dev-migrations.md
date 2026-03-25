---
name: convex-dev-migrations
description: Define, run, resume, and observe database migrations with tracked state and batch processing across Convex tables. Use when working with schema evolution, backfills, and online database migrations.
---

# Migrations

## Instructions

`@convex-dev/migrations` is a Convex component for defining, running, and tracking stateful database migrations. It is useful for online migrations, backfills, resumable table-wide updates, and schema transitions where you need to safely change existing data over time.

### Installation

Because this project uses Bun, install the package with:

```bash
bun add @convex-dev/migrations
```

Then register the component in `convex/convex.config.ts`:

```ts
import migrations from "@convex-dev/migrations/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();

app.use(workOSAuthKit);
app.use(migrations);

export default app;
```

### Capabilities

- Define migrations that process every document in a table, or a subset of documents, in batches.
- Track migration progress and state so migrations can resume after interruption or failure.
- Run migrations from Convex functions or from the CLI.
- Support zero-downtime schema evolution by letting your app handle old and new shapes during rollout.
- Observe migration progress reactively from Convex queries.

## Examples

### how to initialize migrations in Convex

Create a dedicated file such as `convex/migrations.ts` and initialize the component with your generated `DataModel`:

```ts
import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();
```

This gives you a reusable `migrations` instance for defining migrations and a `run` function for executing them.

### how to define a migration for a table

You define a migration with a target table and a `migrateOne` handler that updates each document as needed:

```ts
import { migrations } from "./migrations";

export const setDefaultPhoneNumber = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.phoneNumber === undefined) {
      await ctx.db.patch(user._id, {
        phoneNumber: "",
      });
    }
  },
});
```

This pattern works well for adding optional fields, normalizing data, or backfilling derived values.

### how to handle safe schema evolution with migrations

A typical safe migration flow in Convex is:

1. Update the schema so both old and new document shapes are valid.
2. Update application code to support both versions.
3. Define and deploy the migration.
4. Run the migration until completion.
5. Tighten the schema and simplify application logic once all data matches the new shape.

This helps avoid breaking production reads and writes while existing data is still being updated.

### how to run migrations programmatically

You can expose a mutation, action, or internal function to run migrations:

```ts
import { internalMutation } from "./_generated/server";
import { run } from "./migrations";

export const runMigrations = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await run(ctx);
  },
});
```

This is useful when you want migration execution controlled from your app or admin tooling.

### how to use migrations for backfills

Migrations are a good fit when you need to backfill derived values across an existing table:

```ts
import { migrations } from "./migrations";

export const backfillUserFullNames = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    await ctx.db.patch(user._id, {
      fullName,
    });
  },
});
```

This is safer and more observable than writing an ad-hoc one-off loop.

## Troubleshooting

**When should I use `@convex-dev/migrations` instead of a one-off script?**

Use the component when you need state tracking, resumability, visibility into progress, or online migration behavior across many documents. For small temporary fixes, a quick one-off approach may be enough, but the component is better for reliable production migrations.

**Why should my app support both old and new data shapes during a migration?**

Because the migration may take time to complete. During that window, some documents may still be in the old shape while others have already been updated. Supporting both versions prevents runtime errors and downtime.

**Can migrations be resumed after failure?**

Yes. The component tracks migration state, so interrupted migrations can continue from where they left off instead of restarting everything.

**Should I make fields optional before backfilling them?**

Usually yes. A common approach is to first make the new field optional in the schema, deploy code that can handle missing values, run the migration to backfill it, and only then make the field required.

**Can I use migrations for large production tables?**

Yes. That is one of the main reasons to use this component. It is designed for batched, online updates with tracked progress instead of risky all-at-once rewrites.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/migrations)
- [GitHub repository](https://github.com/get-convex/migrations)
- [Convex Components Directory](https://www.convex.dev/components/migrations)
- [Convex documentation](https://docs.convex.dev)
- [Migration primer](https://stack.convex.dev/intro-to-migrations)
- [Migrating data with mutations](https://stack.convex.dev/migrating-data-with-mutations)