---
name: convex-dev-launchdarkly
description: Sync LaunchDarkly flags and segments into Convex for backend feature flags, experimentation, and rollout control. Use when working with feature flags, experiments, staged rollouts, or LaunchDarkly-backed configuration.
---

# LaunchDarkly

## Instructions

`@convex-dev/launchdarkly` is a Convex component for syncing LaunchDarkly flags and segments into your Convex deployment so you can use feature flags directly in backend logic.

Use this component when you need LaunchDarkly-backed rollout control, experimentation, or real-time flag state inside Convex queries, mutations, and actions.

### Installation

Because this project uses Bun, install the package with:

```bash
bun add @convex-dev/launchdarkly
```

Then register the component in `convex/convex.config.ts`:

```ts
import launchdarkly from "@convex-dev/launchdarkly/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(launchdarkly);

export default app;
```

### HTTP Route Registration

Register the LaunchDarkly webhook routes in `convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@convex-dev/launchdarkly";
import { components } from "./_generated/api";

const http = httpRouter();

registerRoutes(components.launchdarkly, http);

export default http;
```

By default, this registers the LaunchDarkly webhook endpoint at `/ld/webhook`.

### Environment Variables

Set this in your Convex deployment environment:

- `LAUNCHDARKLY_SDK_KEY` - Your LaunchDarkly environment SDK key. It should start with `sdk-`.

### Capabilities

- Sync LaunchDarkly flags and segments into Convex
- Use backend feature flags directly in Convex business logic
- Support staged rollouts, experiments, and kill switches
- React to LaunchDarkly changes without polling LaunchDarkly on every request
- Centralize feature-gated behavior inside backend logic instead of only in the frontend
- Keep feature configuration close to your server-side authorization, billing, and workflow logic

## Examples

### how to register LaunchDarkly in Convex

Use the component in `convex/convex.config.ts`, then register the webhook handler in `convex/http.ts`. After that, configure the Convex integration in LaunchDarkly to point to your deployment’s HTTP endpoint.

This is the required setup pattern before any synced flag data can be used reliably in your Convex app.

### how to use LaunchDarkly for backend feature flags

Use LaunchDarkly when a feature gate should be enforced in backend code, not just hidden in the UI.

Good examples include:

- enabling a beta workflow for only some users
- rolling out a billing rule gradually
- turning off an integration with a kill switch
- gating expensive AI features by account tier or experiment cohort
- controlling access to new mutations, actions, or automation paths

### how to use LaunchDarkly for experiments in Convex

LaunchDarkly is a strong fit for experiments where backend behavior changes by user segment or flag variation. This is especially useful when experiment logic affects writes, data shape, or server-side integrations and cannot safely live only in frontend code.

### how to configure the LaunchDarkly webhook url

The webhook URL should use your Convex deployment’s HTTP actions URL plus the configured path. By default, that path is:

`/ld/webhook`

So the final webhook URL will look like:

`https://<your-deployment>.convex.site/ld/webhook`

Each Convex deployment should usually have its own LaunchDarkly integration configuration.

## Setup Checklist

1. Install `@convex-dev/launchdarkly` with Bun.
2. Add the component in `convex/convex.config.ts`.
3. Register routes in `convex/http.ts`.
4. Set `LAUNCHDARKLY_SDK_KEY` in the Convex environment.
5. Configure the LaunchDarkly Convex integration to point at your Convex webhook URL.
6. Verify LaunchDarkly can reach the webhook endpoint.
7. Use the synced flags in your Convex backend logic.

## Best Practices

- Keep feature flag checks close to the business rule they control.
- Use backend-enforced flags for anything security-sensitive or billing-sensitive.
- Avoid relying only on frontend gating for paid or restricted features.
- Treat flags as runtime configuration, not as a replacement for authorization.
- Use separate LaunchDarkly environments and Convex deployments for dev, staging, and production.
- Remove stale flag branches once a rollout is complete to keep code maintainable.

## Troubleshooting

**Why are my LaunchDarkly flags not syncing into Convex?**

Check that the component is added in `convex/convex.config.ts`, routes are registered in `convex/http.ts`, `LAUNCHDARKLY_SDK_KEY` is set correctly, and the LaunchDarkly integration is pointing at the correct Convex webhook URL.

**What kind of LaunchDarkly key does this component need?**

It needs the LaunchDarkly environment SDK key, stored as `LAUNCHDARKLY_SDK_KEY`. The copied value should start with `sdk-`.

**Why should I use LaunchDarkly in backend Convex code instead of only in the frontend?**

Because some flags control protected or state-changing behavior. If a feature affects writes, billing, workflows, or access control, the backend should enforce it.

**Do I need a separate LaunchDarkly integration for each Convex deployment?**

Usually yes. Different developer, staging, and production deployments should typically have their own integration configuration and environment keys.

**Can I change the webhook path from `/ld/webhook`?**

Yes. The route registration supports overriding the default path if you want a custom endpoint, but the LaunchDarkly integration must match whatever path you configure.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/launchdarkly)
- [GitHub repository](https://github.com/get-convex/launchdarkly)
- [Convex Components Directory](https://www.convex.dev/components/launchdarkly)
- [LaunchDarkly documentation](https://launchdarkly.com/docs)
- [Convex documentation](https://docs.convex.dev)