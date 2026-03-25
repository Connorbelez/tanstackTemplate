---
name: convex-dev-presence
description: Track live room presence and last-online state with reactive updates and heartbeat-based session management. Use when working with collaboration, presence, rooms, online status.
---

# Presence

## Instructions

Presence is a Convex component that provides live-updating room presence with heartbeat-based session tracking and last-online state.

### Installation

```bash
bun add @convex-dev/presence
```

Add the component to `convex/convex.config.ts`:

```ts
import presence from "@convex-dev/presence/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(presence);

export default app;
```

### Capabilities

- Track which users are currently present in a room without polling
- Keep presence updates reactive so clients only update when users join or leave
- Maintain session-based presence with heartbeats and disconnect handling
- Expose last-online style state for collaborative and multiplayer experiences

## Examples

### how to add room presence in Convex

Create a `Presence` client in your Convex code and expose wrapper functions for heartbeat, list, and disconnect behavior.

```ts
import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // Add your auth checks here.
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // This may be called from sendBeacon, so don't rely on normal auth here.
    return await presence.disconnect(ctx, sessionToken);
  },
});
```

### how to use Convex presence from React

Use the React hook to automatically send heartbeats and manage client presence state.

```tsx
import usePresence from "@convex-dev/presence/react";
import FacePile from "@convex-dev/presence/facepile";
import { useState } from "react";
import { api } from "../convex/_generated/api";

export default function App(): React.ReactElement {
  const [name] = useState(() => `User ${Math.floor(Math.random() * 10000)}`);
  const presenceState = usePresence(api.presence, "my-chat-room", name);

  return (
    <main>
      <FacePile presenceState={presenceState ?? []} />
    </main>
  );
}
```

### presence for collaborative rooms and cursors

Presence works well for chat rooms, collaborative documents, shared dashboards, multiplayer lobbies, and anywhere you need a live list of active participants without building a custom heartbeat system from scratch.

## Troubleshooting

**How does Presence avoid polling?**

The component uses Convex scheduled functions and reactive queries so clients update when presence membership actually changes, instead of re-running queries on every heartbeat.

**What values should I use for room and user identifiers?**

Use stable identifiers from your app domain, such as a document ID for `roomId` and the authenticated user's ID for `userId`. Keep `sessionId` unique per browser tab or client session.

**Why is disconnect handled separately from heartbeat?**

Disconnect is commonly triggered from browser lifecycle behavior like `sendBeacon`, where normal authenticated request flows may not be available. Separating it helps clean up sessions reliably when a tab closes.

**Can I add authorization checks around presence?**

Yes. You should usually enforce access rules in your wrapper mutations and queries so only allowed users can join or list a room's presence data.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/presence)
- [GitHub repository](https://github.com/get-convex/presence)
- [Convex Components Directory](https://www.convex.dev/components/presence)
- [Convex documentation](https://docs.convex.dev)