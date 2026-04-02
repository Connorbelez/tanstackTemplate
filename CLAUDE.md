# CLAUDE

## Tech Stack — Who Owns What

| Layer | Technology | Responsibility |
|---|---|---|
| **Auth & AuthZ** | **WorkOS AuthKit** | Canonical source of truth for authentication and authorization. Roles, permissions, organizations, and session management all live in WorkOS. User/org data is synced to Convex via the `@convex-dev/workos-authkit` component webhooks. |
| **Backend / DB / API** | **Convex** | Serverless backend, real-time database, ORM, scheduler, and function runtime. All business logic runs as Convex queries, mutations, and actions. |
| **Middleware** | **fluent-convex** | Chainable API builder for Convex functions with composable middleware. All auth checks, permission gates, and context enrichment are enforced through fluent-convex middleware chains (`authedQuery`, `requirePermission(p)`, `adminMutation`, etc.). No raw `ctx.auth.getUserIdentity()` calls outside of `getAuthContext()`. |
| **State Machines** | **XState v5** (pure functional API only) | Defines entity lifecycles as deterministic state machines. We use `setup().createMachine()` for definitions and `transition()` for pure state computation. No actors, no interpreters, no subscriptions — Convex's stateless V8 isolates require a hydrate-compute-persist pattern. |
| **Frontend** | **React + TanStack Start** | Meta-framework providing SSR, file-based routing, server functions. |
| **Routing** | **TanStack Router** | File-based routing in `src/routes/`. Route guards via `beforeLoad` for island-level auth gating. |
| **Data Fetching** | **TanStack Query + Convex** | `useSuspenseQuery(convexQuery(...))` for live-updating, server-rendered queries. Route loaders pre-fetch via `ensureQueryData`. |
| **UI** | **Tailwind CSS + ShadCN UI** | Utility-first styling with pre-built accessible components. |
| **Audit Logging** | **convex-audit-log** | Hash-chained, tamper-evident audit trail for compliance (O.Reg 189/08). Two layers: atomic journal (Layer 1) + component-isolated hash chain (Layer 2). |
| **Package Manager** | **Bun** | Package installation, script running, test execution. |
| **Testing** | **Vitest, React Testing Library, Playwright, convex-test** | Unit, component, integration, and E2E testing. |
| **Linting & Formatting** | **Biome** | Single tool for linting and formatting. Run `bun check` which auto-fixes before reporting errors. |

---

## Important Links

| Resource | Link |
|---|---|
| Product Planning System | [Notion](https://www.notion.so/FairLend-Product-Planning-System-30ffc1b4402481d187d8e2bdc309945b) |
| Phase 1 PRD | [Notion](https://www.notion.so/Phase-1-PRD-Financial-Core-Platform-Foundation-322fc1b4402481cdbfecd1de3abd6526) |
| How We Work | [Notion](https://www.notion.so/How-We-Work-Linear-Notion-Graphite-Workflow-322fc1b440248165a963eba34133fd20) |
| Linear Initiative | [Linear](https://linear.app/fairlend/initiative/fairlend-phase-1-foundation-bb7a993c963f/overview) |
| AI Agent Instructions | [AGENTS.md](./AGENTS.md) |
| AI Coding Guidelines | [CLAUDE.md](./CLAUDE.md) |



## Dev environment tips
- Installing Packages: `bun add [package-name]`
- Running unit tests: `bun run test`
- Running end to end tests: `bun run test:e2e`
- building: `vite build`
- Running in development: `vite dev` 
- Updating convex codegen: `bunx convex codegen`
- Lint, format and check errors: `bun check`
- Type check: `bun typecheck`
- Code review: `bun run review`

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

## Design Principles

- **RBAC is structural, not decorative.** Authorization is wired into every query and mutation from day one via middleware chains. Retrofitting auth is the single most expensive technical debt pattern.
- **State machines as the backbone.** Every entity lifecycle goes through Governed Transitions. The Transition Engine is the only code path that modifies status fields.
- **Seed, don't build flows.** Phase 1 entities are seeded via admin mutations. The complex multi-step flows that create them are Phase 2+.
- **Interface-first on payment rails.** Define the PaymentMethod interface now, implement ManualPaymentMethod first, drop in real payment providers later with zero changes to business logic.
- **Auditability from the ground floor.** Every state transition is journaled, hash-chained, and queryable. Both successes and rejections. This is the 5-year regulatory retention layer.

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
Sample JWT Payload:
{
  "user_id": "user_01KKFF8EA41DV152KVHD8VJB48",
  "user_email": "c.beleznay@humanfeedback.com",
  "user_first_name": "Connor",
  "user_last_name": "Beleznay",
  "user_email_verified": true,
  "user_profile_picture_url": "https://workoscdn.com/images/v1/J_dQHD0Fq4c4Wnao2Eq2UJHvxfG_Br2zZ2-UYUqxrtg",
  "user_metadata": {},
  "organization_id": "org_01KKF56VABM4NYFFSR039RTJBM",
  "organization_name": "FairLendStaff",
  "organization_role": "admin",
  "organization_roles": [
    "admin"
  ],
  "organization_membership_id": "om_01KKFF914H1XD788BZ2MNP7GKV",
  "iss": "https://api.workos.com/user_management/client_01KJ62PRE8PHFSRB9XDCZYJGCK",
  "sub": "user_01KKFF8EA41DV152KVHD8VJB48",
  "sid": "session_01EXAMPLE000000000000000",
  "jti": "token_01EXAMPLE000000000000000",
  "org_id": "org_01KKF56VABM4NYFFSR039RTJBM",
  "role": "admin",
  "roles": [
    "admin"
  ],
  "permissions": [
    "widgets:users-table:manage"
  ],
  "iat": 1773405522,
  "exp": 1773405822
}
*/
```

## Workflow 
- DO NOT try to fix linting/formatting errors BEFORE running `bun check`. Always run `bun check` first as this command also auto formats and fixes some linting errors.
- After Completing a Major unit of work like a full SPEC run `coderabbit review --plain` to get a code review summary and check for any potential issues or improvements. 
- This is an early stage project, feel free to suggest sweeping changes to the schema, architecture, etc., but ask your human first. 

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across mulitple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Context 
We're building a greenfield project; there is no existing production data or deployment. Feel free to suggest sweeping changes to the schema, architecture, etc., but ask your human first. 

## What we're building
We're building a back-office loan management system with an integrated ledger and accounting system, plus an attached marketplace for fractional mortgage deal closings. 

## Toolkit 

### Convex Components

#### convex-dev-workos-authkit
- Description: Sync WorkOS AuthKit authentication events and user data directly into your Convex database with pre-built webhooks and queries. Use when working with auth features, WorkOS AuthKit.
- [Filepath](./docs/convex/convex-dev-workos-authkit.md)
- When to use skill: Whenever working on anything related to authentication or authorization.

#### convex-fs
- Description: Manage files in Convex using filesystem-style paths, directories, atomic operations, signed CDN URLs, and expiration-aware storage workflows. Use when working with file storage, path-based file management, uploads, downloads, or CDN-backed file access.
- [Filepath](./docs/convex/convex-fs.md)
- When to use skill: Whenever working on anything related to filesystem-style storage, path-based file organization, signed downloads, expiring file artifacts, or file lifecycle management.

#### convex-dev-workflow
- Description: Execute long-running code flows durably with built-in retries, delays, and state persistence across function interruptions. Use when working with durable-functions features, Workflow.
- [Filepath](./docs/convex/convex-dev-workflow.md)
- When to use skill: Whenever working on anything related to durable function execution, long-running processes

#### convex-dev-action-cache
- Description: Cache expensive action results with optional TTLs and automatic cleanup for slow or costly third-party API calls. Use when working with caching, expensive actions, API integrations, LLMs.
- [Filepath](./docs/convex/convex-dev-action-cache.md)
- When to use skill: Whenever working on anything related to caching expensive action results, reducing repeated API calls, or adding TTL-based action caches.



#### convex-dev-migrations
- Description: Define, run, resume, and observe database migrations with tracked state and batch processing across Convex tables. Use when working with schema evolution, backfills, database migrations.
- [Filepath](./docs/convex/convex-dev-migrations.md)
- When to use skill: Whenever working on anything related to data backfills, schema transitions, online migrations, or tracked database migration workflows.

#### convex-dev-aggregate
- Description: Maintain efficient aggregate counts, sums, rankings, and percentile-style lookups over large datasets with logarithmic-time operations. Use when working with leaderboards, analytics, counts, sums, aggregates.
- [Filepath](./docs/convex/convex-dev-aggregate.md)
- When to use skill: Whenever working on anything related to efficient counts, sums, rankings, leaderboards, or aggregate analytics over large datasets.


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


#### convex-tracer
- Description: Add tracing and observability to Convex functions with sampled traces, nested spans, error preservation, and cross-function execution visibility. Use when working with observability, debugging, tracing, production diagnostics, or performance analysis.
- [Filepath](./docs/convex/convex-tracer.md)
- When to use skill: Whenever working on anything related to tracing backend flows, debugging production issues, inspecting nested operations, or improving Convex observability.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
