# AGENTS
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
- `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
- NEVER USE `any` as a type unless you absolutely have to. 
- Always prefer loose coupling and dependency injection. Everything should be mockable, testable and replaceable. Avoid tight coupling to specific implementations.

## Patterns To Live By
- DRY: Don't Repeat Yourself. If you find yourself writing the same code more than once, consider abstracting it into a reusable function or module.
- YAGNI: You Aren't Gonna Need It. Don't add functionality until it's necessary
- KISS: Keep It Simple Stupid. Avoid unnecessary complexity in your code. If a simpler solution exists, use it.
- Dependancy Injection: Instead of hardcoding dependencies, inject them into your functions or classes. This makes your code more flexible and easier to test.
- Strategy Pattern: Define a family of algorithms, encapsulate each one, and make them interchangeable. This allows you to select an algorithm at runtime without changing the client code. 
- Inversion of Control: Instead of calling functions directly, use callbacks, events, or other mechanisms to allow the flow of control to be determined by the runtime environment. This promotes loose coupling and flexibility in your code.


## Standards & Conventions 
### Auth
- WorkOS Authkit is the canonical source of truth. 
- Always use `import { useAuth } from "@workos/authkit-tanstack-react-start/client"` to access auth state in React components.
```ts
export interface AuthContextType {
    user: User | null;
    sessionId: string | undefined;
    organizationId: string | undefined;
    role: string | undefined;
    roles: string[] | undefined;
    permissions: string[] | undefined;
    entitlements: string[] | undefined;
    featureFlags: string[] | undefined;
    impersonator: Impersonator | undefined;
    loading: boolean;
    getAuth: (options?: {
        ensureSignedIn?: boolean;
    }) => Promise<void>;
    refreshAuth: (options?: {
        ensureSignedIn?: boolean;
        organizationId?: string;
    }) => Promise<void | {
        error: string;
    }>;
    signOut: (options?: {
        returnTo?: string;
    }) => Promise<void>;
    switchToOrganization: (organizationId: string) => Promise<void | {
        error: string;
    }>;
}
```
- Always use the `getAuth` method to fetch auth state in server-side code, and pass the sessionId to Convex functions for auth checks. Do not directly query the Convex database for auth state.
```ts
export interface UserIdentity {
  readonly tokenIdentifier: string;
  readonly subject: string;
  readonly issuer: string;
  readonly name?: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly nickname?: string;
  readonly preferredUsername?: string;
  readonly profileUrl?: string;
  readonly pictureUrl?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly gender?: string;
  readonly birthday?: string;
  readonly timezone?: string;
  readonly language?: string;
  readonly phoneNumber?: string;
  readonly phoneNumberVerified?: boolean;
  readonly address?: string;
  readonly updatedAt?: string;
  [key: string]: JSONValue | undefined;
}
/**
Custom Claims json shape: 
{
    "user_id": {{user.id}},
    "user_email":{{user.email}},
    "user_first_name":{{user.first_name}},
    "user_last_name":{{user.last_name}},
    "user_email_verified":{{user.email_verified}}, 
    "user_profile_picture_url":{{user.profile_picture_url}},
    "user_metadata":{{user.metadata}},
    "organization_id":{{organization.id}},
    "organization_name":{{organization.name}},
    "organization_role":{{organization_membership.role}},
    "organization_roles": {{organization_membership.roles}},
    "organization_membership_id":{{organization_membership.id}}
}
*/
```

## Workflow 
- DO NOT try to fix linting/formatting errors BEFORE running `bun check`. Always run `bun check` first as this command also auto formats and fixes some linting errors.
- TDD/test-first workflows are by request only in this repo. Do not automatically apply TDD, red-green-refactor, or test-first skills for setup scripts, one-off scripts, configuration changes, or routine implementation unless the user explicitly asks for TDD or for tests first.
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


#### convex-dev-launchdarkly
- Description: Sync LaunchDarkly flags and segments into Convex for backend feature flags and experimentation. Use when working with feature flags, experimentation, rollout control, LaunchDarkly.
- [Filepath](./docs/convex/convex-dev-launchdarkly.md)
- When to use skill: Whenever working on anything related to feature flags, experiments, staged rollouts, or LaunchDarkly-backed configuration.


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

#### convex-audit-log
- Description: Track user actions, API calls, and system events in Convex with audit trails, change diffs, PII redaction, querying, anomaly detection, and compliance-oriented retention controls. Use when working with audits, compliance, security logging, or destructive/admin actions.
- [Filepath](./docs/convex/convex-audit-log.md)
- When to use skill: Whenever working on anything related to audit trails, compliance evidence, security-sensitive event logging, destructive admin actions, or change tracking.

