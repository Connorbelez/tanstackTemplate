---
name: convex-dev-stripe
description: Integrate Stripe payments, subscriptions, billing, checkout sessions, customer portals, and webhook syncing directly with Convex. Use when working with payments, subscriptions, billing, checkout, invoices, Stripe.
---

# Stripe

## Instructions

Stripe is a Convex component that provides Stripe-powered payments, subscriptions, customer management, checkout sessions, billing portals, invoices, and webhook-driven data synchronization inside your Convex app.

### Installation

```bash
bun add @convex-dev/stripe
```

Add the component to your Convex app in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import stripe from "@convex-dev/stripe/convex.config.js";

const app = defineApp();
app.use(stripe);

export default app;
```

### Environment Variables

Set these in your Convex deployment environment:

- `STRIPE_SECRET_KEY` - Your Stripe secret key.
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook signing secret.

### HTTP Route Registration

Register Stripe webhook routes in `convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@convex-dev/stripe";
import { components } from "./_generated/api";

const http = httpRouter();

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
});

export default http;
```

### Capabilities

- Create one-time payment and subscription checkout sessions
- Sync Stripe customers, subscriptions, invoices, and payments into Convex
- Support customer portal flows for self-serve billing management
- Link Stripe billing state to users or organizations in your app
- Handle webhook events so billing state stays current in Convex
- Query billing data reactively from Convex instead of calling Stripe directly for every read

## Examples

### how to create a Stripe subscription checkout session in Convex

Use `StripeSubscriptions` with `components.stripe` to create or reuse a Stripe customer and generate a hosted checkout session for recurring billing. This is the right fit for SaaS plans, paid memberships, and seat-based subscriptions.

### how to use Stripe customer portal with Convex

Stripe supports customer self-service billing management through its customer portal. Use the component when you need users to update payment methods, manage subscriptions, or review billing details without building a custom portal from scratch.

### how to sync Stripe webhooks into Convex

Register the Stripe webhook handler in `convex/http.ts` and configure your Stripe dashboard webhook endpoint to point at your Convex deployment. The component keeps subscription and payment state synchronized as Stripe events arrive.

### how to link Stripe billing to app users or organizations

Use the component when you need to associate Stripe customers and subscriptions with authenticated users, teams, or organizations in your Convex app. This is especially useful for multi-tenant billing and account-level subscription access checks.

## Troubleshooting

**Which Stripe webhook events should I configure?**

At minimum, configure the webhook events recommended by the package README, including checkout, customer, subscription, invoice, and payment intent events. These keep Convex in sync with Stripe billing lifecycle changes.

**Why is the webhook signature failing?**

Most commonly, `STRIPE_WEBHOOK_SECRET` is missing or does not match the webhook endpoint configured in Stripe. Make sure the secret comes from the exact Stripe webhook endpoint that targets your Convex deployment.

**Why are Stripe records not appearing in Convex?**

Check that the component is added in `convex/convex.config.ts`, routes are registered in `convex/http.ts`, the webhook endpoint is configured in Stripe, and both required environment variables are set in Convex.

**Can I use this for one-time payments and subscriptions?**

Yes. The component supports both one-time checkout flows and recurring subscription billing flows.

**When should I use Stripe instead of Polar in this codebase?**

Use Stripe when you specifically need Stripe’s payment rails, billing primitives, invoices, checkout sessions, or customer portal. Use Polar when the product requirement is aligned with Polar’s subscription and billing model instead.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/stripe)
- [GitHub repository](https://github.com/get-convex/stripe)
- [Convex Components Directory](https://www.convex.dev/components/stripe)
- [Stripe documentation](https://docs.stripe.com)
- [Convex documentation](https://docs.convex.dev)