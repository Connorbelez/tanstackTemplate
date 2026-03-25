---
name: convex-dev-aggregate
description: Maintain efficient aggregate counts, sums, rankings, and percentile-style lookups over large datasets with logarithmic-time operations. Use when working with leaderboards, analytics, counts, sums, aggregates.
---

# Aggregate

## Instructions

Aggregate is a Convex component that provides efficient count, sum, ranking, and ordered lookup operations over large datasets without scanning entire tables.

### Installation

```bash
bun add @convex-dev/aggregate
```

### Convex config

```ts
import aggregate from "@convex-dev/aggregate/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(aggregate);

export default app;
```

### Capabilities

- Maintain efficient aggregate counts and sums with logarithmic-time reads
- Support ranking, percentile-style lookups, and ordered access patterns
- Aggregate globally, by prefix grouping, or by isolated namespace
- Build leaderboard, analytics, and summary features without collecting large result sets

## Examples

### how to count records efficiently in Convex

Use Aggregate when you need a fast total count or bounded count over a large logical dataset. Instead of reading every row with `.collect()`, define an aggregate and query it directly for counts.

### how to build a leaderboard with rank lookups in Convex

Aggregate works well for leaderboard-style features where you need counts, max values, score positions, percentile-style access, or lookup by rank. You can sort by a score key and ask for count, sum, max, `indexOf`, or `at` style lookups.

### how to group aggregate metrics by prefix in Convex

If your aggregate key is a tuple like `[gameId, userId, score]`, you can query subsets by prefix to answer questions like “how many scores exist for this game?” or “what is this user’s highest score in this game?”

### when to use namespaces instead of grouped keys

Use namespaces when partitions are fully separate and you do not need cross-partition aggregation. This improves throughput by isolating internal structures, but you give up global rollups across those partitions.

## Troubleshooting

**When should I use Aggregate instead of a normal Convex index?**

Use Aggregate when you need efficient counts, sums, ranking, percentile-style access, or ordered statistics over many documents. A normal index is great for pagination and point lookups, but it does not provide efficient aggregate operations by itself.

**Can Aggregate replace collecting documents and counting in application code?**

Yes, that is one of its main purposes. Aggregate avoids fetching and iterating through large result sets just to compute counts or sums, which keeps queries faster and more scalable.

**How should I choose between grouped keys and namespaces?**

Use grouped keys when you still need global rollups and sub-group queries from the same structure. Use namespaces when data partitions are independent and throughput matters more than cross-partition aggregation.

**What kinds of features is Aggregate best for?**

It is a strong fit for leaderboards, usage analytics, counters, score distributions, ranking systems, percentile lookups, and any feature where ordered numeric or tuple-based metrics need to be queried efficiently.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/aggregate)
- [GitHub repository](https://github.com/get-convex/aggregate)
- [Convex Components Directory](https://www.convex.dev/components/aggregate)
- [Convex documentation](https://docs.convex.dev)