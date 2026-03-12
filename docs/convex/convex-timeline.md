---
name: convex-timeline
description: Manage undo and redo history with scoped state snapshots and named checkpoints in Convex. Use when working with undo/redo flows, draft history, editor state, or restorable application state.
---

# Convex Timeline

## Instructions

`convex-timeline` is a Convex component for undo/redo state management with scoped history and named checkpoints.

Use it when your app needs timeline-style state history, such as document editing, draft workflows, wizard progress, canvas state, or any feature where users should be able to step backward and forward through previous states.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-timeline
```

Then register the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import timeline from "convex-timeline/convex.config.js";

const app = defineApp();
app.use(timeline);

export default app;
```

### Capabilities

- Store linear state history per scope
- Support undo and redo operations
- Create named checkpoints that persist independently of normal timeline pruning
- Limit history size with configurable pruning
- Isolate history by scope so each document, entity, or workspace has its own timeline
- Provide a clean server-side API for editor-like or draft-like history behavior

## Examples

### how to initialize Convex Timeline

Create a shared `Timeline` instance in your Convex code:

```ts
import { Timeline } from "convex-timeline";
import { components } from "./_generated/api";

export const timeline = new Timeline(components.timeline);
```

This shared instance can then be reused across mutations and queries that manage state history.

### how to push state and undo changes in Convex

You can push snapshots into a scoped history and later undo or redo them.

```ts
import { timeline } from "./timeline";

await timeline.push(ctx, "doc:123", { text: "Hello" });
await timeline.push(ctx, "doc:123", { text: "Hello world" });

const previous = await timeline.undo(ctx, "doc:123");
const next = await timeline.redo(ctx, "doc:123");
```

This works well for editors, settings panels, builders, or multi-step interfaces.

### how to use scoped timelines per document or entity

A scope identifies an independent history stream.

Good scope examples include:

- `doc:123`
- `draft:loanApplication:abc`
- `canvas:workspace42`
- `profile:user_17`

This keeps unrelated histories from interfering with each other.

### how to create named checkpoints in Convex Timeline

Checkpoints let you save a named snapshot that survives normal timeline pruning.

```ts
await timeline.createCheckpoint(ctx, "doc:123", "before-major-edit");
await timeline.restoreCheckpoint(ctx, "doc:123", "before-major-edit");
```

Use checkpoints for:

- important save points
- version markers
- recoverable milestones
- user-visible restore points
- pre-migration or pre-transform backups of editable state

### how to use a scoped facade for cleaner code

You can create a scope-specific helper to avoid repeating the scope string.

```ts
const doc = timeline.forScope("doc:123");

await doc.push(ctx, { text: "Hello" });
await doc.undo(ctx);
await doc.redo(ctx);
await doc.createCheckpoint(ctx, "draft-1");
```

This is useful when many operations target the same logical entity.

### how pruning works after undo and a new push

Timeline uses standard editor-style linear history behavior.

If a user undoes changes and then pushes a new state, the forward history is discarded.

Example:

1. Push `A`
2. Push `B`
3. Push `C`
4. Undo to `B`
5. Push `D`

Now `C` is pruned, and the timeline becomes `A -> B -> D`.

This matches the behavior users expect from most editors and note-taking tools.

## When to use this component

Use `convex-timeline` when:

- users need undo/redo
- you manage draft or transient editing state
- state snapshots are a better fit than per-field event replay
- named restore points are useful
- each entity needs isolated history

Strong fits include:

- rich text editors
- form drafts
- whiteboards or canvases
- workflow builders
- settings editors
- multi-step onboarding or application flows
- user-editable templates

## Best Practices

- Use stable scope identifiers tied to real entities.
- Keep snapshot payloads focused on the editable state, not unrelated metadata.
- Create checkpoints before destructive transforms or large edits.
- Use per-scope limits if some histories are much noisier than others.
- Keep timeline state separate from permanent domain records when that improves clarity.
- Treat timeline history as user-facing interaction state, not your only persistence model.

## Troubleshooting

**When should I use Timeline instead of storing versions in my own table?**

Use Timeline when you want undo/redo semantics and checkpoint-based state history. Use your own tables when you need full business-level versioning, approvals, audit requirements, or long-term immutable history.

**Does Timeline support branching history?**

No. It uses a linear model. If you undo and then push a new state, the forward branch is pruned.

**What should I store in each snapshot?**

Store the smallest complete piece of state needed to restore the user’s working context, such as editor content, builder configuration, or draft form values.

**What are checkpoints for if I already have normal history?**

Normal history can be pruned. Checkpoints persist independently and are better for meaningful restore points like “published draft”, “before import”, or “before reset”.

**Can I use one Timeline instance for many documents?**

Yes. That is the intended pattern. Use different scopes for each document, draft, or entity.

## Resources

- [npm package](https://www.npmjs.com/package/convex-timeline)
- [GitHub repository](https://github.com/MeshanKhosla/convex-timeline)
- [Convex Components Directory](https://www.convex.dev/components/convex-timeline)
- [Convex documentation](https://docs.convex.dev)