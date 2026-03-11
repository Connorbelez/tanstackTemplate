---
name: convex-dev-action-cache
description: Cache expensive Convex action results with optional TTLs and automatic cleanup. Use when working with caching, expensive actions, API integrations, LLMs.
---

# Action Cache

## Instructions

Action Cache is a Convex component that provides durable caching for expensive action results. It is useful when your app calls slow, rate-limited, or costly external services and you want to avoid repeating the same work for identical inputs.

### Installation

```bash
bun add @convex-dev/action-cache
```

Add the component to your Convex app:

```ts
import actionCache from "@convex-dev/action-cache/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(actionCache);

export default app;
```

### Capabilities

- Cache expensive action results based on action name and arguments
- Add optional TTL-based expiration for cached values
- Avoid repeated third-party API calls for identical requests
- Reduce cost and latency for LLM, embeddings, and enrichment workloads
- Invalidate cache entries by versioned names or grouped cache clearing
- Automatically clean up expired entries with scheduled cleanup

## Examples

### how to cache an expensive Convex action

Use `ActionCache` when you already have an internal action that does expensive work and you want callers to reuse the result for repeated inputs.

```ts
import { ActionCache } from "@convex-dev/action-cache";
import { components, internal } from "./_generated/api";

const cache = new ActionCache(components.actionCache, {
  action: internal.example.myExpensiveAction,
});
```

Then fetch through the cache from another action:

```ts
import { action } from "./_generated/server";

export const myFunction = action({
  handler: async (ctx): Promise<{ text: string }> => {
    return await cache.fetch(ctx, { foo: "bar" });
  },
});
```

### caching LLM or embeddings responses in Convex

Action Cache is a strong fit for LLM generations, embeddings, summarization, classification, and other paid inference calls. If the same prompt or payload appears again, you can return the cached result instead of paying for another API request.

Typical uses include:

- Embedding generation for search
- LLM summaries for documents
- AI tagging or categorization
- Third-party enrichment APIs
- Expensive billing or analytics lookups

### using TTLs for cache freshness

If cached data should eventually expire, set a TTL in milliseconds when creating the cache instance.

```ts
const cache = new ActionCache(components.actionCache, {
  action: internal.example.myExpensiveAction,
  name: "myExpensiveActionV1",
  ttl: 1000 * 60 * 60 * 24 * 7,
});
```

This keeps entries valid for 7 days. Expired values are removed on read and also cleaned up by the component’s scheduled cleanup job.

### versioning cache entries when logic changes

When the underlying action logic changes, set a new cache `name` to avoid serving stale results computed by old logic. A versioned name like `summarizeV2` or `embeddingV3` is a simple pattern for safe invalidation.

### when to use Action Cache instead of a table

Use Action Cache when:

- The value is fully determined by the action arguments
- You want a reusable memoized result
- You do not need custom query patterns over the cached data
- You want automatic TTL behavior and cache-oriented semantics

Prefer your own table when:

- You need rich querying or indexing
- Cached data is part of your domain model
- You need custom ownership or visibility rules in schema design
- The data lifecycle is more business-driven than cache-driven

## Troubleshooting

**How does Action Cache identify a cached value?**

The cache key is based on the cache instance name and the arguments passed to `fetch`. By default the name is derived from the configured action, but you can set a custom `name` explicitly.

**What kinds of work should I cache with Action Cache?**

Cache work that is deterministic for a given input and expensive to recompute, especially third-party API calls, AI inference, data enrichment, or slow remote lookups.

**What happens when the TTL expires?**

Expired entries are removed when accessed and are also cleaned up by the component’s scheduled cleanup process.

**How do I invalidate old cached data after changing my logic?**

The simplest pattern is to change the cache `name`, for example from `generateSummaryV1` to `generateSummaryV2`. This effectively creates a fresh namespace for cache entries.

**Should I return the cached result directly from an action?**

Yes, that is a common pattern. If you return the cached result directly, make sure your action has an explicit return type when needed to avoid circular type inference issues in Convex.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/action-cache)
- [GitHub repository](https://github.com/get-convex/action-cache)
- [Convex Components Directory](https://www.convex.dev/components/action-cache)
- [Convex documentation](https://docs.convex.dev)