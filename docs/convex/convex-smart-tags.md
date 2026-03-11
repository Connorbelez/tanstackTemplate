---
name: convex-smart-tags
description: Add intelligent tagging and categorization to Convex with hierarchical tags, cross-table tagging, trending analytics, and tag-based querying. Use when working with tags, categorization, taxonomy, discovery, or content labeling.
---

# Convex Smart Tags

## Instructions

`convex-smart-tags` is a Convex component for intelligent tagging and categorization across multiple tables and entity types.

Use it when you need reusable tags, hierarchical tag relationships, tag analytics, or cross-entity categorization inside a Convex app.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-smart-tags
```

Then register the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import smartTags from "convex-smart-tags/convex.config";

const app = defineApp();
app.use(smartTags);

export default app;
```

### Capabilities

- Add and remove tags from entities across different tables
- Query tags attached to a record
- Query records by tag
- Define parent-child tag hierarchies
- Track tag usage over time
- Compute trending tags and tag statistics
- Build reusable taxonomy and categorization systems across your product

## Examples

### how to initialize smart tags in Convex

Create a shared Smart Tags client in your Convex code:

```ts
import { SmartTags } from "convex-smart-tags";
import { components } from "./_generated/api";

export const smartTags = new SmartTags(components.smartTags);
```

This shared instance can then be reused across mutations, queries, admin tools, and analytics flows.

### how to tag an entity in Convex

Use a mutation to attach a tag to a record:

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { smartTags } from "./smartTags";

export const tagPost = mutation({
  args: {
    postId: v.id("posts"),
    tagName: v.string(),
  },
  handler: async (ctx, args) => {
    await smartTags.addTag(ctx, {
      tagName: args.tagName,
      tableName: "posts",
      entityId: args.postId,
    });
  },
});
```

This is useful for content moderation, organization, search refinement, editorial workflows, and discovery features.

### how to get tags for a specific record

Query all tags attached to a record:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { smartTags } from "./smartTags";

export const getPostTags = query({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    return await smartTags.getTagsForEntity(ctx, {
      tableName: "posts",
      entityId: args.postId,
    });
  },
});
```

This is useful when rendering a tag UI, filtering related content, or inspecting record metadata.

### how to find entities by tag

Use tag-based lookup when users need to browse related content:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { smartTags } from "./smartTags";

export const getPostsByTag = query({
  args: {
    tagName: v.string(),
  },
  handler: async (ctx, args) => {
    return await smartTags.getEntitiesByTag(ctx, {
      tagName: args.tagName,
      tableName: "posts",
      limit: 50,
    });
  },
});
```

This works well for category pages, topic feeds, admin dashboards, and discovery views.

### how to build hierarchical tags in Convex

Smart Tags supports parent-child relationships between tags, which is useful for taxonomies.

Example use cases:

- `finance` → `lending`
- `lending` → `microloans`
- `risk` → `fraud`
- `content` → `announcements`

You can create hierarchy relationships like this:

```ts
await smartTags.createTagHierarchy(ctx, {
  parentTag: "finance",
  childTag: "lending",
});
```

Then query child tags or ancestor tags to build nested navigation and structured categorization.

### how to use trending tags and analytics

Smart Tags can track tag usage and expose analytics over time.

This is useful for:

- trending topics
- popular categories
- engagement analysis
- admin insights
- recommendation systems
- dynamic homepage sections

Typical examples include:

- most-used tags this week
- fastest-rising tags
- cross-table tag usage by feature area
- tags with unusual recent growth

### when to use smart tags in this codebase

Use this component when you need:

- reusable tags across multiple tables
- category systems that should not be hardcoded into a single schema field
- analytics around tag usage
- hierarchical taxonomy
- search and filtering based on labels
- shared classification rules across posts, products, users, documents, or events

Prefer this component over ad hoc string arrays on individual tables when tagging needs to be shared, queryable, or analytically useful across the app.

## Best Practices

- Keep the Smart Tags client in a shared Convex module.
- Use consistent tag naming conventions such as lowercase slugs.
- Normalize tag input before writing it.
- Use hierarchy intentionally to avoid messy overlapping taxonomies.
- Distinguish between product labels, admin-only tags, and user-generated tags when your app needs different rules.
- Wrap tag writes in your own auth-aware mutations instead of exposing tagging directly without access checks.
- Add product-specific metadata tables if tags need richer editorial context beyond the component’s built-in structures.

## Troubleshooting

**When should I use Smart Tags instead of a `tags: string[]` field on a table?**

Use Smart Tags when tags need to be queried across entities, reused across tables, organized hierarchically, or analyzed over time. A simple string array is fine for very small local-only tagging needs, but it does not scale well for shared taxonomy and analytics.

**Can I use Smart Tags across multiple tables?**

Yes. That is one of its main strengths. You can tag entities from different tables while keeping one shared tagging system.

**What kinds of features is this best for?**

It is a strong fit for content labeling, knowledge organization, topic discovery, editorial taxonomy, admin classification, recommendations, and trend analysis.

**Should tags be user-generated or controlled vocabulary?**

Either can work. Use controlled vocabulary when consistency matters, and allow user-generated tags only if the product experience benefits from open-ended labeling.

**How should I handle tag casing and duplicates?**

Normalize user input before writing tags, usually by trimming whitespace and converting to a consistent lowercase slug format. This prevents duplicate tags with different casing.

**Can I use hierarchy and analytics at the same time?**

Yes. You can organize tags into parent-child relationships while also tracking their usage and trends.

## Resources

- [npm package](https://www.npmjs.com/package/convex-smart-tags)
- [Convex Components Directory](https://www.convex.dev/components/convex-smart-tags)
- [GitHub repository](https://github.com/yourusername/convex-smart-tags)
- [Convex documentation](https://docs.convex.dev)