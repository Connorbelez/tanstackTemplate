---
name: 00akshatsinha00-convex-cascading-delete
description: Configure safe cascading deletes across related Convex documents with atomic or batched deletion modes and progress tracking. Use when working with relational cleanup, dependent records, cascading deletes, or deleting data trees.
---

# Convex Cascading Delete

## Instructions

`@00akshatsinha00/convex-cascading-delete` is a Convex component for managing cascading deletes across related documents in your existing schema.

Use it when deleting one document should also delete dependent records, such as deleting a user and all their posts, comments, memberships, or other related data. It works with your existing Convex tables and indexes, and supports both atomic inline deletion and batched deletion for large dependency trees.

### Installation

Because this project uses Bun, install it with:

```bash
bun add @00akshatsinha00/convex-cascading-delete
```

Then register the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import convexCascadingDelete from "@00akshatsinha00/convex-cascading-delete/convex.config";

const app = defineApp();

app.use(workOSAuthKit);
app.use(convexCascadingDelete);

export default app;
```

### Capabilities

- Define explicit cascade relationships using your existing Convex indexes
- Delete related data safely without rewriting your schema around a custom DSL
- Support atomic inline deletes for small dependency trees
- Support batched scheduled deletes for large graphs of related records
- Track batch deletion progress reactively
- Handle circular and diamond dependencies with visited-set protection
- Return per-table deletion summaries for observability
- Optionally guard against accidental direct `db.delete` usage with helper patterns

## Core Concepts

### Cascade rules

You define which tables cascade into which other tables, and which index should be used to find related documents.

A rule describes:

- `to`: the child table
- `via`: the index used to find child records
- `field`: the field on the child record pointing to the parent

This keeps cascading behavior explicit and centralized.

### Inline delete mode

Use inline deletion when the dependency tree is small enough to fit comfortably in a single transactional delete operation.

Best for:

- deleting a user with a modest number of related rows
- removing a small workspace or project
- preserving atomic all-or-nothing behavior

### Batched delete mode

Use batched deletion when the related tree may be too large for one transaction.

Best for:

- organizations with lots of users and data
- projects with large event histories
- account deletion flows with many dependent tables
- admin cleanup jobs

## Example setup

### how to configure cascade rules in Convex

Create a shared file such as `convex/cascading.ts`:

```ts
import {
  CascadingDelete,
  defineCascadeRules,
  makeBatchDeleteHandler,
} from "@00akshatsinha00/convex-cascading-delete";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const cascadeRules = defineCascadeRules({
  users: [
    { to: "posts", via: "byAuthorId", field: "authorId" },
    { to: "comments", via: "byAuthorId", field: "authorId" },
  ],
  posts: [{ to: "comments", via: "byPostId", field: "postId" }],
});

export const cd = new CascadingDelete(components.convexCascadingDelete, {
  rules: cascadeRules,
});

export const _cascadeBatchHandler = makeBatchDeleteHandler(
  internalMutation,
  components.convexCascadingDelete,
);
```

This creates a reusable `cd` instance and the internal batch handler required for large batched deletions.

### how to delete a document and all dependent records atomically

Use inline deletion inside a normal mutation when the tree is reasonably small:

```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { cd } from "./cascading";

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const summary = await cd.deleteWithCascade(ctx, "users", userId);
    return summary;
  },
});
```

This is appropriate when you want the delete to succeed or fail as one unit.

### how to delete large dependency trees in batches

Use the batched mode for larger trees:

```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { cd } from "./cascading";

export const deleteOrganization = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    return await cd.deleteWithCascadeBatched(ctx, "organizations", orgId, {
      batchHandlerRef: internal.cascading._cascadeBatchHandler,
      batchSize: 2000,
    });
  },
});
```

This is the better fit when an organization or tenant may own a very large amount of data.

### how to use deletion summaries for observability

Both delete modes can return a summary of what was deleted, which is useful for logs, audit behavior, admin UX, or confirming cleanup breadth.

Typical output shape:

```ts
{
  users: 1,
  posts: 5,
  comments: 23,
}
```

Use this to:

- log destructive actions
- display admin confirmations
- validate that cleanup rules are behaving as expected
- compare expected vs actual deletion scope

## When to use this component

Reach for this component when:

- your data has parent-child or ownership relationships across tables
- deleting one record should reliably clean up many related records
- you want deletion rules defined centrally instead of duplicated across mutations
- you want safer destructive flows for user deletion, org deletion, or project deletion
- your schema already exists and you do not want to redesign it for cascading behavior

It is especially useful for:

- user deletion
- organization / tenant deletion
- project deletion
- content cleanup
- GDPR or account-erasure workflows
- admin destructive actions

## Best Practices

- Keep cascade rules in one shared Convex module.
- Use existing indexes intentionally and name them clearly.
- Prefer inline deletion for small trees and batched deletion for large trees.
- Protect destructive mutations with strong authorization checks.
- Log or store deletion summaries for important destructive actions.
- Test cascade rules carefully whenever new related tables are added.
- Review cascade coverage during schema changes so new child tables are not forgotten.

## Troubleshooting

**When should I use inline delete vs batched delete?**

Use inline delete for small dependency trees where atomic behavior matters most. Use batched delete when a record may fan out into many related documents and you need safer large-scale cleanup.

**Do I need to redesign my schema to use this component?**

No. One of the main advantages of this component is that it works with existing `defineTable` definitions and indexes.

**Why does this component rely on indexes?**

Indexes are how the component efficiently finds related child documents. Good cascade rules depend on the correct index existing on the child table for the parent reference field.

**Can it handle circular dependencies?**

Yes. The component is designed to handle circular and diamond-shaped dependency graphs using visited-set protection.

**What if I add a new child table later?**

You should update your cascade rules whenever a new dependent relationship is introduced. Otherwise, deletes may leave orphaned records in that new table.

**Should I still do auth checks in my delete mutation?**

Yes. This component handles relational cleanup, not authorization. Your mutation should still verify that the caller is allowed to perform the destructive action.

**When is batched deletion especially important?**

Batched deletion is important for large tenant, organization, or account removals where a single transaction could be too large or too slow.

## Resources

- [npm package](https://www.npmjs.com/package/@00akshatsinha00/convex-cascading-delete)
- [GitHub repository](https://github.com/akshatsinha0/convex-cascading-delete)
- [Convex Components Directory](https://www.convex.dev/components/00akshatsinha00/convex-cascading-delete)
- [Convex documentation](https://docs.convex.dev)