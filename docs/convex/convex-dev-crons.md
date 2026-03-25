---
name: convex-dev-crons
description: Register and manage cron jobs dynamically at runtime using interval or cron schedules instead of only static deploy-time definitions. Use when working with scheduling, automation, cron jobs, recurring tasks.
---

# Crons

## Instructions

Crons is a Convex component that provides dynamic runtime cron registration and management inside your Convex app.

### Installation

```bash
bun add @convex-dev/crons
```

### Add to Convex

```ts
import crons from "@convex-dev/crons/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(crons);

export default app;
```

### Capabilities

- Register cron jobs dynamically at runtime instead of only at deploy time
- Support both interval-based schedules and unix-style cron expressions
- Create, inspect, list, and delete scheduled jobs from Convex functions
- Build tenant-specific, user-specific, or data-driven recurring automation
- Store and manage recurring jobs through Convex instead of external schedulers

## Examples

### how to initialize runtime crons in Convex

Create a shared `Crons` instance in your Convex code:

```ts
import { Crons } from "@convex-dev/crons";
import { components } from "./_generated/api";

export const crons = new Crons(components.crons);
```

This instance can then be reused across your scheduling mutations, admin actions, or automation flows.

### how to register a cron schedule at runtime

Use `register` to create a recurring job from a Convex function:

```ts
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { crons } from "./crons";

export const scheduleDailyDigest = mutation({
	args: {},
	handler: async (ctx) => {
		return await crons.register(
			ctx,
			{ kind: "cron", cronspec: "0 0 * * *" },
			internal.jobs.sendDailyDigest,
			{ type: "daily-digest" },
		);
	},
});
```

This is useful when schedules depend on product configuration, tenant settings, or user preferences.

### how to register interval jobs in Convex

Use interval schedules when you want a recurring job every fixed number of milliseconds:

```ts
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { crons } from "./crons";

export const scheduleHourlySync = mutation({
	args: {},
	handler: async (ctx) => {
		return await crons.register(
			ctx,
			{ kind: "interval", ms: 60 * 60 * 1000 },
			internal.jobs.syncExternalData,
			{ source: "billing" },
		);
	},
});
```

This works well for sync jobs, polling-like maintenance work, recurring cleanup, and scheduled refreshes.

### how to manage scheduled jobs dynamically

The `Crons` wrapper supports common management operations:

- `register(ctx, schedule, fn, args, name?)`
- `get(ctx, { name | id })`
- `list(ctx)`
- `delete(ctx, { name | id })`

This makes it straightforward to build admin tooling for scheduled automations.

### how to schedule tenant-specific recurring work

Dynamic crons are especially useful when each tenant or workspace needs its own recurring automation, such as:

- billing reminders
- nightly exports
- recurring reports
- cleanup policies
- integration syncs
- digest emails

Instead of hardcoding all cron definitions at deploy time, you can register and remove them as tenant settings change.

## Troubleshooting

**When should I use this component instead of static Convex crons?**

Use this component when schedules need to be created, updated, or deleted at runtime based on app data, tenant configuration, or admin actions. Static Convex cron definitions are better when schedules are fixed and known ahead of time.

**What schedule types are supported?**

The component supports both interval schedules in milliseconds and unix-style cron expressions.

**What kinds of features is this best for?**

It is a strong fit for recurring background jobs, tenant-specific automations, scheduled syncs, digests, reminders, maintenance jobs, and app-configurable workflows.

**Can I build an admin UI for scheduled jobs with this?**

Yes. Because jobs can be registered, listed, fetched, and deleted from Convex functions, you can expose those operations through admin tooling or internal dashboards.

**What should I pass as the scheduled function?**

Pass a function reference for the internal or server-side function that should run on the schedule, along with the arguments it needs.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/crons)
- [GitHub repository](https://github.com/get-convex/crons)
- [Convex Components Directory](https://www.convex.dev/components/crons)
- [Convex documentation](https://docs.convex.dev)
- [Cron jobs article](https://stack.convex.dev/cron-jobs)