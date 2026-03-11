# Agent Lessons

Proposed CLAUDE.md amendments from issues encountered during development. Review and merge into CLAUDE.md as appropriate.

---

## Lesson 1: Read component docs before writing integration code
**Date:** 2026-03-11
**Context:** Implemented WorkOS AuthKit webhook handlers without reading the component docs. Missed that `additionalEventTypes` is a whitelist — only `user.created/updated/deleted` are handled by default. All other event types (org, membership, role, session) must be explicitly registered. This caused all webhook events to silently not reach our handlers.
**Root cause:** Jumped to exploring `node_modules` types instead of reading the linked doc file in CLAUDE.md Toolkit section.
**Proposed amendment (already applied):**
> **MANDATORY: Before writing or modifying code that uses a Convex Component listed in the Toolkit section below, you MUST first read its linked documentation file.** Do not rely on assumptions, node_modules exploration, or type inference alone. The docs contain critical configuration requirements (e.g. event registration, component options) that types alone won't reveal.

---

## Lesson 2: Every registered event type needs a handler
**Date:** 2026-03-11
**Context:** The `additionalEventTypes` config included `"session.created"` but the handler in `authKit.events()` had it commented out. This caused `e[i.event] is not a function` errors that blocked the ENTIRE event processing pipeline — not just session events. The component processes events sequentially, so one unhandled type acts as a poison pill.
**Root cause:** Didn't verify that every entry in `additionalEventTypes` had a corresponding handler.
**Proposed amendment:**
> When configuring event-driven components (e.g. WorkOS AuthKit), ensure every event type registered in config has a corresponding handler. An unregistered handler for a registered event type can block processing of ALL events, not just the unhandled type.

---

## Lesson 3: WorkOS Events API has a different valid event set than webhook payloads
**Date:** 2026-03-11
**Context:** `additionalEventTypes` included `organization_membership.added` and `organization_membership.removed`. These exist in the WorkOS SDK TypeScript types (for webhook deserialization) but are NOT valid for the Events API (`GET /events`). The `@convex-dev/workos-authkit` component polls via `workos.events.listEvents()`, so these caused `Invalid name parameter` errors that crashed the entire event pipeline.
**Root cause:** Relied on SDK TypeScript types to determine valid event names. The `EventName` union type includes webhook-only event names that the Events API rejects. Always cross-reference the WorkOS Events API docs (https://workos.com/docs/events) when choosing event types.
**Proposed amendment:**
> When adding event types to WorkOS AuthKit `additionalEventTypes`, only use names listed in the WorkOS Events API documentation (https://workos.com/docs/events). The SDK's TypeScript `EventName` type is broader than what the Events API accepts — some names are webhook-only. Invalid names crash the entire event processing pipeline.

---

## Lesson 4: Always validate event handler data shapes against the official event payload docs
**Date:** 2026-03-11
**Context:** The `upsertMembership` helper expected `organizationName` in the event data, but the WorkOS `organization_membership.*` event payload does NOT include it — only `id`, `user_id`, `organization_id`, `status`, `role`, `roles`. This caused a Convex schema validation error (`Object is missing the required field organizationName`). Similarly, `allowProfilesOutsideOrganization` on organization events may not always be present in the event payload despite being part of the Organization API object.
**Root cause:** Built handler data shapes from assumptions about what fields would be present, rather than cross-referencing the actual event payload structure in the WorkOS Events docs (https://workos.com/docs/events).
**Proposed amendment:**
> When writing webhook/event handlers, always verify the exact payload shape against the provider's event documentation. Do NOT assume API object fields will all be present in event payloads — events often carry a subset. For denormalized fields (e.g. org name on membership), look them up from your database. For fields that may be absent, use `v.optional()` in the schema or provide sensible defaults.
