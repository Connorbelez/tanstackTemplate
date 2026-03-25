---
name: convex-dev-rate-limiter
description: Define application-layer rate limits in Convex with fixed-window and token-bucket strategies, typed limit names, fairness guarantees, and configurable sharding. Use when working with abuse prevention, throttling, quotas, login protection, API limits, or per-user action caps.
---

# Rate Limiter

## Instructions

Rate Limiter is a Convex component that provides application-level rate limiting directly inside your Convex functions.

### Installation

```bash
bun add @convex-dev/rate-limiter
```

### Add to Convex

```ts
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(rateLimiter);

export default app;
```

### Capabilities

- Define type-safe named rate limits for different actions in your app
- Enforce global, per-user, per-org, or custom-key quotas inside Convex mutations and actions
- Choose between `fixed window` and `token bucket` algorithms depending on product behavior
- Support burst capacity, rollover behavior, and configurable sharding for higher throughput
- Apply limits transactionally so failed mutations roll back associated rate limit changes
- Fail closed to avoid accidental abuse during overload scenarios

## Examples

### how to define typed rate limits in Convex

Create a shared `RateLimiter` instance and declare named rules for the actions you want to protect.

```ts
import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	freeTrialSignUp: { kind: "fixed window", rate: 100, period: HOUR },
	sendMessage: {
		kind: "token bucket",
		rate: 10,
		period: MINUTE,
		capacity: 3,
	},
	failedLogins: { kind: "token bucket", rate: 10, period: HOUR },
});
```

Use `fixed window` when you want a simple cap over a time period, and `token bucket` when you want smoother limiting with optional bursts.

### how to rate limit per user in a Convex mutation

Pass a custom `key` so each user gets an independent quota instead of sharing one global bucket.

```ts
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { rateLimiter } from "./rateLimit";

export const sendMessage = mutation({
	args: {
		channelId: v.string(),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError("Unauthorized");
		}

		const status = await rateLimiter.limit(ctx, "sendMessage", {
			key: identity.subject,
		});

		if (!status.ok) {
			throw new ConvexError("Rate limit exceeded");
		}

		await ctx.db.insert("messages", {
			channelId: args.channelId,
			body: args.body,
			userId: identity.subject,
		});
	},
});
```

This is useful for chat messages, comments, likes, reactions, search requests, and other user-triggered mutations.

### how to protect login or signup flows from abuse

Use a global rule or key by email, IP, or identity to slow down repeated auth attempts.

```ts
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { rateLimiter } from "./rateLimit";

export const requestMagicLink = action({
	args: {
		email: v.string(),
	},
	handler: async (ctx, args) => {
		const status = await rateLimiter.limit(ctx, "failedLogins", {
			key: args.email.toLowerCase(),
		});

		if (!status.ok) {
			throw new ConvexError("Too many attempts. Try again later.");
		}

		// Continue with auth flow here.
	},
});
```

This pattern works well for signup, password reset, OTP delivery, email verification, and anti-bot throttling.

### how to use a global rate limit for expensive shared resources

Omit the custom key when you want one shared limit across the whole app or deployment.

```ts
const status = await rateLimiter.limit(ctx, "freeTrialSignUp");
if (!status.ok) {
	throw new Error("Signup temporarily unavailable");
}
```

This is useful for vendor APIs, LLM quotas, trial creation, or any shared capacity that should be capped globally.

### how to allow bursts with token bucket limits

A token bucket lets you preserve an average rate while permitting occasional spikes up to `capacity`.

```ts
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	apiWrites: {
		kind: "token bucket",
		rate: 60,
		period: MINUTE,
		capacity: 10,
	},
});
```

With this setup, consumers can burst briefly, but sustained traffic is still limited to the configured average.

### how to scale rate limits with sharding

If a single hot rule will receive very high traffic, configure shards to increase throughput without changing the external behavior.

```ts
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	llmRequests: {
		kind: "fixed window",
		rate: 1000,
		period: MINUTE,
		shards: 10,
	},
});
```

Use sharding for high-volume app-wide limits such as AI requests, ingestion endpoints, or large public APIs.

## Best Practices

- Keep the `RateLimiter` instance in a shared Convex module so multiple functions reuse the same definitions.
- Use stable keys like `userId`, `organizationId`, email, or another deterministic identifier.
- Prefer `token bucket` for end-user interactions where small bursts feel better.
- Prefer `fixed window` for simpler hard quotas and administrative controls.
- Return clear product-level errors so users understand whether they should retry later.
- Combine rate limiting with authentication and authorization checks rather than treating it as a replacement.
- Add separate limits for different surfaces instead of one giant catch-all quota.

## Troubleshooting

**When should I use `fixed window` vs `token bucket`?**

Use `fixed window` when you want a simple “N requests per time window” rule. Use `token bucket` when you want smoother behavior and optional bursts while still enforcing an average rate over time.

**Can I create per-user and global limits at the same time?**

Yes. Define multiple named limits and apply them independently. For example, you might check a per-user message limit and also a global vendor quota limit in the same mutation.

**What key should I use for a rate limit?**

Use the entity you want to isolate: a user ID for per-user limits, an org ID for tenant limits, an email for login throttling, or no key for a single shared global limit.

**Does rate limiting roll back if my mutation fails?**

Yes. The component is designed for transactional application-layer limiting, so rate limit state changes roll back with the surrounding mutation when the mutation fails.

**Can I use rate limiting in auth and webhook flows?**

Yes, as long as you choose an appropriate stable key. In auth flows that may be email, session, or IP-derived data. In webhook or integration flows it may be the upstream account, workspace, or provider identifier.

**How do I avoid hot spots for very busy limits?**

Use `shards` on high-throughput limits. Sharding helps spread internal load while preserving the configured limiting behavior.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/rate-limiter)
- [GitHub repository](https://github.com/get-convex/rate-limiter)
- [Convex Components Directory](https://www.convex.dev/components/rate-limiter)
- [Convex documentation](https://docs.convex.dev)
- [Rate limiting article](https://stack.convex.dev/rate-limiting)