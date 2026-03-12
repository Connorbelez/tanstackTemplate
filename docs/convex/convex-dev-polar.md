---
name: convex-dev-polar
description: Add Polar-powered subscriptions and billing to Convex with synced products, checkout flows, customer portals, and webhook-driven subscription state. Use when working with billing, subscriptions, Polar, SaaS plans.
---

# Polar

## Instructions

`@convex-dev/polar` is a Convex component for adding Polar-based billing and subscriptions to your Convex app. It helps you manage products, checkout flows, customer billing portals, and synced subscription state inside Convex.

Use this component when you need SaaS subscriptions, plan management, billing state in your backend, or Polar-hosted checkout and customer portal flows.

### Installation

Because this project uses Bun, install it with:

```bash
bun add @convex-dev/polar
```

Then register the component in `convex/convex.config.ts`:

```ts
import polar from "@convex-dev/polar/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();

app.use(workOSAuthKit);
app.use(polar);

export default app;
```

### Environment Variables

Set these in your Convex deployment environment:

- `POLAR_ORGANIZATION_TOKEN` - Your Polar organization token
- `POLAR_WEBHOOK_SECRET` - Your Polar webhook secret

### Capabilities

- Add subscription billing to your app using Polar
- Sync products and subscription state into Convex
- Generate hosted checkout flows for upgrades and purchases
- Support customer billing portal flows for subscription management
- Keep billing state up to date through Polar webhooks
- Query current subscription details from Convex instead of making direct billing API calls for every read

## Examples

### how to add Polar billing to Convex

Register the component in `convex/convex.config.ts`, then create a shared Polar client in your Convex code.

```ts
import { Polar } from "@convex-dev/polar";
import { components } from "./_generated/api";

export const polar = new Polar(components.polar);
```

This shared instance can then be used across billing actions, subscription checks, and portal flows.

### how to set up Polar webhooks in Convex

Polar uses webhooks to keep products and subscriptions synchronized with your Convex deployment.

Use your Convex site URL with the `/polar/events` path as the webhook endpoint, for example:

```text
https://your-deployment.convex.site/polar/events
```

Enable the relevant Polar events, including product and subscription lifecycle updates, then set the webhook secret in Convex.

### how to register Polar routes in Convex http

Register the Polar webhook route in `convex/http.ts` using your shared Polar client.

```ts
import { httpRouter } from "convex/server";
import { polar } from "./polarClient";

const http = httpRouter();

polar.registerRoutes(http);

export default http;
```

This allows your Convex deployment to receive Polar webhook events and keep billing state in sync.

### how to get the current user's subscription in Convex

Polar works well for “what plan is this user on?” checks in your backend.

Typical usage looks like:

- fetch the current authenticated user
- map that user to your Convex user record
- call a Polar helper such as current subscription lookup
- gate premium features based on subscription status or product key

This is a good fit for:

- feature access checks
- usage gating
- premium UI unlocks
- team or account billing status

### how to create a checkout flow for plan upgrades

Use Polar when you want to send a user to a hosted checkout flow for a specific product or plan. This is useful for:

- upgrading from free to paid
- switching between monthly and yearly plans
- selling a premium feature set
- managing self-serve subscription purchases

### how to use the Polar customer portal

The customer portal flow is useful when users need to:

- manage their subscription
- update billing details
- review active plans
- cancel or change service

Use it instead of building custom billing management UI from scratch.

## When to use Polar vs Stripe

Use Polar when:

- your product already uses Polar
- you want Polar-hosted subscription flows
- your pricing and plan management are centered around Polar
- the billing model is SaaS subscription oriented

Use Stripe when:

- you specifically need Stripe-native checkout, invoices, payment intents, or customer portal behavior
- the product requirement explicitly calls for Stripe’s billing primitives
- you are integrating with an existing Stripe-based billing system

## Troubleshooting

**Why are Polar subscriptions not updating in Convex?**

Usually one of these is missing:

- the component is not registered in `convex/convex.config.ts`
- the Polar routes are not registered in `convex/http.ts`
- `POLAR_ORGANIZATION_TOKEN` is missing
- `POLAR_WEBHOOK_SECRET` is missing
- the Polar webhook endpoint is not pointed at your Convex deployment

**What webhook URL should I use?**

Use your Convex site URL plus `/polar/events`, such as:

```text
https://your-deployment.convex.site/polar/events
```

**What permissions should the Polar token have?**

The organization token should have the permissions needed for products, subscriptions, customers, checkouts, checkout links, portals, and customer sessions, as described in the package documentation.

**Can I use Polar for a single active subscription per user?**

Yes. Polar works well for apps where each user has one active plan, but it can also support more advanced subscription setups depending on your billing model.

**Should I store app authorization based only on client-side billing state?**

No. Use Convex-side subscription checks as the source of truth for premium access and feature gating.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/polar)
- [GitHub repository](https://github.com/get-convex/polar)
- [Convex Components Directory](https://www.convex.dev/components/polar)
- [Polar](https://polar.sh)
- [Convex documentation](https://docs.convex.dev)