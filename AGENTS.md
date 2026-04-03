# AGENTS
## Techstack
- Backend, DB, API, ORM, Serverless: Convex
- Convex function builder and middleware: fluent-convex
- Frontend: React, TanStack Router, Tanstack Query + Convex query integration, Tailwind CSS, ShadCN UI
- Authentication: WorkOS AuthKit
- MetaFramework: TanStack Start
- package manager: Bun
- Testing: Vitest, React Testing Library, Playwright, convex-test
- linting + Formatting - Biome

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
### Convex
- `fluent-convex` is the canonical way of writing Convex functions in this application.
- Exported Convex queries, mutations, and actions must use the fluent builder and end with an explicit `.public()` or `.internal()` so visibility is obvious at the export site.
- Do not ship raw exported helper functions as pseudo-endpoints. Shared Convex logic should live in fluent callables, builder chains, or local pipeline/middleware stages, then be registered explicitly.
- Prefer pipeline/builder/middleware composition for validation and invariants such as uniqueness checks instead of standalone exported helper functions.

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
- This is an early stage project, feel free to suggest sweeping changes to the schema, architecture etc, but ask your human first. 

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there are shared logic that can be extracted to a separate module. Duplicate logic across mulitple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Context 
We're building a GREENFIELD project there is not existing prod data or deployment. Feel free to suggest sweeping changes to the schema, architecture etc, but ask your human first. 

## What we're building
We're building a backoffice Loan Management System with an integrated ledger and accounting system with an attached marketplace for fractional mortgage deal closing. 

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

#### convex-audit-log
- Description: Track user actions, API calls, and system events in Convex with audit trails, change diffs, PII redaction, querying, anomaly detection, and compliance-oriented retention controls. Use when working with audits, compliance, security logging, or destructive/admin actions.
- [Filepath](./docs/convex/convex-audit-log.md)
- When to use skill: Whenever working on anything related to audit trails, compliance evidence, security-sensitive event logging, destructive admin actions, or change tracking.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **t3code-35e1a6e1** (11289 symbols, 16442 relationships, 268 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- Run impact analysis before editing shared or risky symbols. Before modifying a function, class, or method with external consumers, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- Before committing, review the resulting git diff and run any available GitNexus checks manually when the local index is present. GitNexus guidance in this repo is workflow guidance, not an enforced pre-commit hook.
- Warn the user if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/t3code-35e1a6e1/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/t3code-35e1a6e1/context` | Codebase overview, check index freshness |
| `gitnexus://repo/t3code-35e1a6e1/clusters` | All functional areas |
| `gitnexus://repo/t3code-35e1a6e1/processes` | All execution flows |
| `gitnexus://repo/t3code-35e1a6e1/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.
