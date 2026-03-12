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

---

## Lesson 5: WorkOS event ordering is not guaranteed — `user.updated` can arrive before `user.created`
**Date:** 2026-03-11
**Context:** The `user.updated` handler logged a warning and returned when the user didn't exist in the database. In practice, `user.updated` events arrived for users that hadn't been created yet (the `user.created` event was either still queued or was lost). This caused the fluent-convex `authMiddleware` to throw "User not found in database" for authenticated users.
**Root cause:** Event handlers assumed `user.created` always runs before `user.updated`. WorkOS fires events asynchronously and the Convex workpool processes them without ordering guarantees.
**Fix:** Changed `user.updated` to upsert (create-if-missing) and schedule `syncUserRelatedData` to backfill orgs/memberships/roles from the WorkOS API.
**Proposed amendment:**
> Event handlers that depend on prior events (e.g. `user.updated` assuming `user.created` ran first) MUST be written as upserts, not patches. Webhook delivery order is never guaranteed. Always handle the "entity doesn't exist yet" case by creating it from available event data.

---

## Lesson 6: Playwright E2E tests for external auth UIs require manual browser exploration first
**Date:** 2026-03-11
**Context:** Writing Playwright selectors for the WorkOS AuthKit hosted login page based on assumptions about the DOM structure led to 5 consecutive test failures: wrong button names, strict mode violations, unmatched regex filters, incorrect parent traversal. The WorkOS UI renders button text in nested `<span>` elements, has a multi-step flow (email → password → org picker), and the ARIA tree doesn't match CSS DOM structure.
**Root cause:** Assumed standard HTML patterns (`input[type="email"]`, `button[type="submit"]`) instead of inspecting the actual page. Each assumption required a separate debugging cycle.
**Fix:** Used dev-browser to walk each step of the flow, captured ARIA snapshots, tested selector candidates interactively (`getByRole name` vs `filter hasText`), then wrote the test from confirmed selectors.
**Proposed amendment:**
> When writing Playwright tests for third-party hosted UIs (OAuth providers, payment pages, etc.), ALWAYS use browser automation tools to manually walk the flow first and inspect the ARIA tree at each step. Do not guess selectors — external UIs have unpredictable DOM structures. Key Playwright selector pitfalls: `getByRole({ name })` uses computed accessible name (whitespace-normalized), while `filter({ hasText })` checks raw textContent (preserves whitespace from nested elements).

---

## Lesson 7: Playwright does not auto-load .env.local — configure dotenv explicitly
**Date:** 2026-03-11
**Context:** E2E tests failed with `value: expected string, got undefined` because `process.env.TEST_ACCOUNT_EMAIL` was undefined at runtime. The `as string` TypeScript cast silently passed `undefined` through.
**Root cause:** Playwright doesn't load `.env.local` files. Even though Bun auto-loads them for `bun run` scripts, the test runner needs explicit dotenv configuration.
**Fix:** Installed `dotenv` and added `dotenv.config({ path: '.env.local' })` to `playwright.config.ts`. Also added `requireEnv()` helper to fail fast with clear error messages.
**Proposed amendment:**
> Playwright does not auto-load `.env.local`. Always add `dotenv.config()` to `playwright.config.ts`. For required env vars in test files, use a `requireEnv()` guard instead of `as string` casts to fail fast with clear messages.

---

## Lesson 8: Don't recommend production hardening for demo-only code
**Date:** 2026-03-11
**Context:** Suggested adding segregation-of-duties enforcement to `approveTransfer`/`completeTransfer` mutations in `convex/demo/auditTraceability.ts`. These are demo functions showcasing the audit trail — there's no production mortgage workflow in the repo. Recommending production controls for demo code wastes time and misrepresents scope.
**Root cause:** Treated demo code as production code when assessing compliance gaps. Didn't check whether the mutations were actually used in a real workflow.
**Proposed amendment:**
> Before recommending production hardening (RBAC, segregation of duties, input validation), verify the code is part of an actual production workflow — not a demo or showcase. Files in `convex/demo/` and `src/routes/demo/` are demo code by convention.
