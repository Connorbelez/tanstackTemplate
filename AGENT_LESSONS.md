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
