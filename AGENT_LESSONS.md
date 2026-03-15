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

---

## Lesson 9: WorkOS "seed" permissions config can break session cookie storage
**Date:** 2026-03-15
**Context:** Sign-in flow completed successfully (OAuth code exchange worked, `onSuccess` fired with user data), but the session cookie was never set on the browser. The `Set-Cookie` header was missing from the 307 callback redirect. Hours of debugging the TanStack Start middleware pipeline, cookie storage internals, and package version conflicts didn't find the issue. Root cause was a WorkOS dashboard configuration: sending the full permissions catalog as "seed" data bloated the session payload beyond the cookie size limit, causing the cookie to silently not be set.
**Root cause:** WorkOS dashboard config issue, not a code issue. The full permissions catalog was being sent as seed data, which made the encrypted session cookie too large for browser cookie limits (~4KB).
**Proposed amendment:**
> When debugging auth issues where the OAuth exchange succeeds but the session isn't persisted, check the WorkOS dashboard configuration (permissions seed, role assignments, etc.) BEFORE diving into middleware/cookie internals. Oversized session payloads can cause cookies to silently fail to set — browsers reject Set-Cookie headers that exceed ~4KB.

---

## Lesson 10: Convex ctx is serialized — no functions on ctx.viewer
**Date:** 2026-03-15
**Context:** Created an implementation plan for ENG-6 that described the Viewer object as having `hasRole()`, `hasPermission()`, and `isFairLendAdmin()` helper functions on `ctx.viewer`. The Notion technical design doc also described this pattern. In reality, Convex serializes context between middleware steps, so you CANNOT pass functions through ctx. The actual Viewer uses `roles: Set<string>`, `permissions: Set<string>`, and `isFairLendAdmin: boolean` (pre-computed). Checks use `viewer.roles.has("lender")`, `viewer.permissions.has("broker:access")`, and `viewer.isFairLendAdmin` (boolean).
**Root cause:** Relied on the Notion architecture doc's pseudocode (which showed an idealized Viewer interface with helper methods) instead of reading the actual `convex/fluent.ts` implementation first. The architecture doc was aspirational, the code is the source of truth.
**Proposed amendment:**
> When writing implementation plans that reference existing code patterns, always read the actual source file first — not just architecture docs or specs. Convex serializes context between middleware steps, so `ctx` can only carry plain data (primitives, arrays, Sets, objects), NOT functions or class instances. The Viewer on `ctx.viewer` uses `Set<string>` for roles/permissions and `boolean` for `isFairLendAdmin`.

## Lesson 11: XState v5 actions must be declared in setup(), not as raw strings
**Date:** 2026-03-15
**Context:** Created an XState v5 machine definition with `actions: ["assignRoleToUser"]` as a raw string array. XState v5 changed the API — raw strings aren't allowed in transitions anymore. Actions must be declared in the `setup()` call's `actions` property, even if they're no-ops.
**Root cause:** The Notion implementation plan used XState v5 syntax but the `actions` field pattern was from v4 (raw strings). The `setup()` builder requires all actions be registered.
**Proposed amendment:**
> XState v5 `setup()` requires all action names to be declared in `setup({ actions: { ... } })`. For GT machines where "actions" are just effect registry names (not real XState side effects), declare them as no-op functions: `assignRoleToUser: () => { /* resolved by GT effect registry */ }`.

## Lesson 12: convex-test requires explicit modules glob and fluent-convex needs inline deps
**Date:** 2026-03-15
**Context:** Integration tests using `convex-test` failed with two issues: (1) `import.meta.glob` not resolved — the second arg to `convexTest()` is `modules` directly, NOT `{ modules }`. (2) `fluent-convex` uses extensionless ESM imports internally which fail under Node strict ESM resolution in convex-test. Fixed by adding `server.deps.inline: ["fluent-convex"]` to vitest config.
**Root cause:** convex-test docs show `convexTest(schema, modules)` but it's easy to assume `{ modules }` pattern. The fluent-convex ESM issue is a known Node.js strict ESM resolution problem.
**Proposed amendment:**
> For `convex-test` integration tests: (1) pass modules as `convexTest(schema, modules)` not `convexTest(schema, { modules })`. (2) Use `import.meta.glob("../../../../convex/**/*.*s")` from `src/test/` directories. (3) Add `fluent-convex` to `test.server.deps.inline` in vite.config.ts to fix ESM resolution.

## Lesson 13: Convex components must be registered in convex-test
**Date:** 2026-03-15
**Context:** Integration tests for onboarding mutations all failed with `Component "auditLog" is not registered. Call "t.registerComponent"`. The onboarding mutations call `auditLog.log()` which requires the `auditLog` component to be registered with the test instance. The `convex-audit-log` package exports a `register` function from `convex-audit-log/test` that handles this. Also needed to add `convex-audit-log` to `test.server.deps.inline` in vite.config.ts for ESM resolution.
**Root cause:** Tests used `convexTest(schema, modules)` without registering any Convex components. Any code path that calls a component API (like `auditLog.log()`) will fail unless the component is registered via `t.registerComponent()` or the component's exported `register()` helper.
**Proposed amendment:**
> When writing `convex-test` integration tests for code that uses Convex components (audit-log, rate-limiter, etc.), you MUST register each component with the test instance. Most components export a `register()` function from their `/test` entrypoint (e.g. `import auditLogTest from "convex-audit-log/test"; auditLogTest.register(t)`). Also add the component package to `test.server.deps.inline` in vite.config.ts.
