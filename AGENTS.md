# CLAUDE
## Techstack
- Backend, DB, API, ORM, Serverless: Convex
- Frontend: React, TanStack Router, Tanstack Query + Convex query integration, Tailwind CSS, ShadCN UI
- Authentication: WorkOS AuthKit
- MetaFramework: TanStack Start
- package manager: Bun
- Testing: Vitest, React Testing Library, Playwright, convex-test
- linting + Formatting - Biome

## Dev environment tips
- Installing Packages: `bun add [package-name]`
- Running unit tests: `bun test`
- Running end to end tests: `bun test:e2e`
- building: `vite build`
- Running in development: `vite dev` 
- Updating convex codegen: `bunx convex codegen`
- Lint, format and check errors: `bun check`
- Type check: `bun typecheck`




## Code Quality
- `bun check` and `bun typecheck` must pass before considering tasks completed.
- NEVER USE `any` as a type unless you absolutely have to. 


## Workflow 
- DO NOT try to fix linting/formatting errors BEFORE running `bun check`. Always run `bun check` first as this command also auto formats and fixes some linting errors.
- After Completing a Major unit of work like a full SPEC run `coderabbit review --plain` to get a code review summary and check for any potential issues or improvements. 
- This is an early stage project, feel free to suggest sweeping changes to the schema, architecture etc, but ask your human first. 

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there are shared logic that can be extracted to a separate module. Duplicate logic across mulitple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.


## Toolkit 

### Convex Components

#### convex-dev-workos-authkit
- Description: Sync WorkOS AuthKit authentication events and user data directly into your Convex database with pre-built webhooks and queries. Use when working with auth features, WorkOS AuthKit.
- [Filepath](./docs/convex/convex-dev-workos-authkit.md)
- When to use skill: Whenever working on anything related to authentication or authorization.

#### convex-dev-resend
- Description: Official Convex integration for Resend email service with queuing, batching, rate limiting, and guaranteed delivery via durable execution. Use when working with integrations features, email, resend, inbox.
- [Filepath](./docs/convex/convex-dev-resend.md)
- When to use skill: Whenever working on anything related to email sending, integrations, or Resend email service.

#### convex-dev-workflow
- Description: Execute long-running code flows durably with built-in retries, delays, and state persistence across function interruptions. Use when working with durable-functions features, Workflow.
- [Filepath](./docs/convex/convex-dev-workflow.md)
- When to use skill: Whenever working on anything related to durable function execution, long-running processes

#### convex-dev-stripe
- Description: Integrate Stripe payments, subscriptions, billing, checkout sessions, customer portals, and webhook syncing directly with Convex. Use when working with payments, subscriptions, billing, checkout, invoices, Stripe.
- [Filepath](./docs/convex/convex-dev-stripe.md)
- When to use skill: Whenever working on anything related to payments, subscriptions, billing, customer portals, or Stripe webhooks.

#### convex-dev-action-cache
- Description: Cache expensive action results with optional TTLs and automatic cleanup for slow or costly third-party API calls. Use when working with caching, expensive actions, API integrations, LLMs.
- [Filepath](./docs/convex/convex-dev-action-cache.md)
- When to use skill: Whenever working on anything related to caching expensive action results, reducing repeated API calls, or adding TTL-based action caches.

#### gilhrpenner-convex-files-control
- Description: Manage secure file uploads, access control, download grants, lifecycle cleanup, and optional HTTP upload/download routes for Convex storage or R2. Use when working with files, uploads, storage, access control.
- [Filepath](./docs/convex/gilhrpenner-convex-files-control.md)
- When to use skill: Whenever working on anything related to file uploads, secure downloads, file access policies, or managed file lifecycle flows.

#### ikhrustalev-convex-debouncer
- Description: Debounce expensive server-side operations with sliding, fixed, or eager modes so only the latest meaningful update is processed. Use when working with debouncing, expensive operations, background processing.
- [Filepath](./docs/convex/ikhrustalev-convex-debouncer.md)
- When to use skill: Whenever working on anything related to debounced backend execution, delayed recomputation, autosave-like flows, or suppressing repeated expensive work.

#### convex-dev-rate-limiter
- Description: Define application-layer rate limits with fixed-window or token-bucket strategies, fairness guarantees, and configurable sharding. Use when working with abuse prevention, throttling, quotas, limits.
- [Filepath](./docs/convex/convex-dev-rate-limiter.md)
- When to use skill: Whenever working on anything related to throttling user actions, enforcing quotas, preventing abuse, or application-layer rate limiting.

#### convex-dev-presence
- Description: Track live room presence and last-online state with reactive updates and heartbeat-based session management. Use when working with collaboration, presence, rooms, online status.
- [Filepath](./docs/convex/convex-dev-presence.md)
- When to use skill: Whenever working on anything related to online presence, live room membership, collaborative cursors, or heartbeat-driven presence systems.

#### convex-dev-migrations
- Description: Define, run, resume, and observe database migrations with tracked state and batch processing across Convex tables. Use when working with schema evolution, backfills, database migrations.
- [Filepath](./docs/convex/convex-dev-migrations.md)
- When to use skill: Whenever working on anything related to data backfills, schema transitions, online migrations, or tracked database migration workflows.

#### convex-dev-aggregate
- Description: Maintain efficient aggregate counts, sums, rankings, and percentile-style lookups over large datasets with logarithmic-time operations. Use when working with leaderboards, analytics, counts, sums, aggregates.
- [Filepath](./docs/convex/convex-dev-aggregate.md)
- When to use skill: Whenever working on anything related to efficient counts, sums, rankings, leaderboards, or aggregate analytics over large datasets.

#### convex-dev-geospatial
- Description: Store and query geospatial points with efficient rectangle queries, filters, and sort keys on top of Convex. Use when working with maps, nearby search, coordinates, geospatial indexing.
- [Filepath](./docs/convex/convex-dev-geospatial.md)
- When to use skill: Whenever working on anything related to location indexing, map features, nearby lookups, or geospatial filtering.

#### convex-dev-crons
- Description: Register and manage cron jobs dynamically at runtime using interval or cron schedules instead of only static deploy-time definitions. Use when working with scheduling, automation, cron jobs, recurring tasks.
- [Filepath](./docs/convex/convex-dev-crons.md)
- When to use skill: Whenever working on anything related to dynamic scheduled tasks, recurring jobs, tenant-specific automation, or runtime cron registration.

#### convex-dev-twilio
- Description: Send and receive SMS messages through Twilio with Convex actions and webhook route registration. Use when working with SMS, phone messaging, notifications, Twilio.
- [Filepath](./docs/convex/convex-dev-twilio.md)
- When to use skill: Whenever working on anything related to SMS delivery, phone-based notifications, or Twilio webhook/message flows.

#### convex-dev-launchdarkly
- Description: Sync LaunchDarkly flags and segments into Convex for backend feature flags and experimentation. Use when working with feature flags, experimentation, rollout control, LaunchDarkly.
- [Filepath](./docs/convex/convex-dev-launchdarkly.md)
- When to use skill: Whenever working on anything related to feature flags, experiments, staged rollouts, or LaunchDarkly-backed configuration.

#### convex-api-keys
- Description: Manage API keys in Convex with creation, validation, rotation, revocation, expiry, idle timeouts, permissions, metadata, and audit-friendly usage patterns. Use when working with API authentication, server-to-server access, machine credentials, or scoped access keys.
- [Filepath](./docs/convex/convex-api-keys.md)
- When to use skill: Whenever working on anything related to API key issuance, machine authentication, partner integrations, service credentials, or scoped programmatic access.

#### convex-api-tokens
- Description: Manage API token issuance, validation, rotation, revocation, and encrypted third-party credential storage in Convex. Use when working with API authentication, machine-to-machine access, token rotation, secure credentials, or protected HTTP endpoints.
- [Filepath](./docs/convex/convex-api-tokens.md)
- When to use skill: Whenever working on anything related to API tokens, machine auth, token rotation, encrypted provider credentials, or bearer-token protected endpoints.

#### convex-timeline
- Description: Manage undo and redo history with scoped state snapshots and named checkpoints in Convex. Use when working with undo/redo flows, draft history, editor state, or restorable application state.
- [Filepath](./docs/convex/convex-timeline.md)
- When to use skill: Whenever working on anything related to undo/redo, scoped draft history, editor checkpoints, or restoreable user state.

#### convex-fs
- Description: Manage files in Convex using filesystem-style paths, directories, atomic operations, signed CDN URLs, and expiration-aware storage workflows. Use when working with file storage, path-based file management, uploads, downloads, or CDN-backed file access.
- [Filepath](./docs/convex/convex-fs.md)
- When to use skill: Whenever working on anything related to filesystem-style storage, path-based file organization, signed downloads, expiring file artifacts, or file lifecycle management.

#### convex-tracer
- Description: Add tracing and observability to Convex functions with sampled traces, nested spans, error preservation, and cross-function execution visibility. Use when working with observability, debugging, tracing, production diagnostics, or performance analysis.
- [Filepath](./docs/convex/convex-tracer.md)
- When to use skill: Whenever working on anything related to tracing backend flows, debugging production issues, inspecting nested operations, or improving Convex observability.

#### convex-smart-tags
- Description: Add intelligent tagging and categorization to Convex with hierarchical tags, cross-table tagging, trending analytics, and tag-based querying. Use when working with tags, categorization, taxonomy, discovery, or content labeling.
- [Filepath](./docs/convex/convex-smart-tags.md)
- When to use skill: Whenever working on anything related to reusable tags, hierarchical taxonomy, tag analytics, cross-table categorization, or discovery and filtering systems.

#### convex-audit-log
- Description: Track user actions, API calls, and system events in Convex with audit trails, change diffs, PII redaction, querying, anomaly detection, and compliance-oriented retention controls. Use when working with audits, compliance, security logging, or destructive/admin actions.
- [Filepath](./docs/convex/convex-audit-log.md)
- When to use skill: Whenever working on anything related to audit trails, compliance evidence, security-sensitive event logging, destructive admin actions, or change tracking.

#### 00akshatsinha00-convex-cascading-delete
- Description: Configure safe cascading deletes across related Convex documents with atomic or batched deletion modes and progress tracking. Use when working with relational cleanup, dependent records, cascading deletes.
- [Filepath](./docs/convex/00akshatsinha00-convex-cascading-delete.md)
- When to use skill: Whenever working on anything related to deleting related data trees, enforcing cleanup of dependent records, or batched cascading deletion flows.
