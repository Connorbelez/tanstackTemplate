# FairLend

A digitized mortgage exchange platform with embedded origination, servicing, and payment infrastructure. FairLend enables fractional mortgage ownership, double-entry ledger accounting, and compliance-grade audit trails — all governed by deterministic state machines.

## Important Links

| Resource | Link |
|---|---|
| Product Planning System | [Notion](https://www.notion.so/FairLend-Product-Planning-System-30ffc1b4402481d187d8e2bdc309945b) |
| Phase 1 PRD | [Notion](https://www.notion.so/Phase-1-PRD-Financial-Core-Platform-Foundation-322fc1b4402481cdbfecd1de3abd6526) |
| How We Work | [Notion](https://www.notion.so/How-We-Work-Linear-Notion-Graphite-Workflow-322fc1b440248165a963eba34133fd20) |
| Linear Initiative | [Linear](https://linear.app/fairlend/initiative/fairlend-phase-1-foundation-bb7a993c963f/overview) |
| AI Agent Instructions | [AGENTS.md](./AGENTS.md) |
| AI Coding Guidelines | [CLAUDE.md](./CLAUDE.md) |

---

## Phase 1 Scope: Financial Core & Platform Foundation

Phase 1 builds the machine under the hood — no user-facing flows, no borrower onboarding, no marketplace. The deliverables are:

1. **RBAC & Authentication Foundation** — Three-layer authorization (WorkOS RBAC, Convex resource ownership, GT business-rule guards) enforced on every query and mutation from day one via fluent-convex middleware chains.
2. **Core Schema & Governed Transitions Engine** — The Transition Engine is the single code path for all entity status changes. XState v5 pure functional API, 8-step pipeline, atomic persistence + audit journaling.
3. **Mortgage Ownership Ledger** — Double-entry ledger with WORLD/TREASURY/POSITION accounts, 10,000 units per mortgage, append-only journal, point-in-time reconstruction.
4. **Deal Closing State Machine** — Parallel-state machine (lawyer onboarding, document review, funds transfer) with admin kanban UI. Proves cross-state-machine communication.
5. **Payment Rail Abstractions** — Three-layer architecture: Obligations (what is owed), Collection Plan (rules engine), Collection Attempts (execution). Pluggable PaymentMethod interface.
6. **Accrual & Dispersal Engine** — Daily interest accrual cron, pro-rata position-based splits, dispersal accounting to investor positions.

**What's NOT in Phase 1:** Borrower onboarding, broker portal, marketplace discovery, underwriting queue, VoPay integration, investor payout execution. Mortgage entities are seeded via admin mutations, not created through application flows.

---

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

## Architecture

### Governed Transitions (GT) — The Backbone

Every entity with a lifecycle (mortgages, deals, obligations, collection attempts, onboarding requests) flows through a single **Transition Engine** mutation. No entity's `status` field is ever patched directly.

The engine follows an 8-step pipeline:

```
1. LOAD    — Read entity from Convex
2. RESOLVE — Look up machine definition from registry
3. HYDRATE — Restore XState state from persisted status + machineContext
4. COMPUTE — Pure transition(machine, state, event) — no side effects
5. DETECT  — Compare states. If unchanged → rejection path
6. PERSIST — Atomic: patch entity + write audit journal entry (same mutation)
7. EFFECTS — Fire-and-forget scheduled functions for side effects
8. AUDIT   — Fire-and-forget Layer 2 hash-chain entry
```

Key constraints:
- Machine definitions are **pure data** — zero Convex imports, zero I/O, zero async
- Guards are **pure synchronous functions** — no database reads inside guards
- Effects are **fire-and-forget** — transition is already committed, effect failure does not roll back
- Cross-entity communication happens through effects constructing new Command Envelopes and calling the Transition Engine recursively

### Three-Layer Authorization

```
Layer 1: WorkOS RBAC     — Roles + permissions embedded in JWT claims
Layer 2: Convex Ownership — Resource-level checks (canAccessMortgage, canAccessDocument)
Layer 3: GT Guards        — Business-rule authorization (e.g., only sr_underwriter can approve above $X)
```

All three layers are enforced through **fluent-convex middleware chains**. Pre-built chains exist for every role combination (`authedQuery`, `adminMutation`, `brokerQuery`, `uwMutation`, etc.). Every Convex function must use a middleware chain — this is non-negotiable.

### WorkOS as Source of Truth

WorkOS AuthKit owns all auth state. The `@convex-dev/workos-authkit` component syncs user and organization data into Convex via webhooks. The sync is **one-directional**: WorkOS -> Convex. Never write auth state directly to the Convex database.

- **Frontend:** `useAuth()` from `@workos/authkit-tanstack-react-start/client`
- **Server:** `getAuth()` to fetch session, pass `sessionId` to Convex functions
- **Convex:** `getAuthContext()` utility resolves identity, user record, roles, permissions, orgId from JWT custom claims

Custom claims include `organization_id`, `organization_role`, `organization_roles`, and `organization_membership_id` — enabling org-scoped data isolation at the query level.

### Audit & Compliance

Auditability is enforced from the ground floor, not retrofitted:

- **Layer 1 — Audit Journal:** Written atomically with every entity state change (same Convex mutation). Records entityType, entityId, event, previousState, newState, outcome, source, timestamp. Both successful transitions and rejections are journaled.
- **Layer 2 — Audit Trail Component:** Hash-chained copy via `ctx.scheduler.runAfter(0, ...)` into a component-isolated store that host code cannot modify after the fact. Cryptographic tamper evidence.
- **Layer 3 — convex-audit-log:** For non-transition events (admin actions, API calls, system events). PII redaction, anomaly detection, retention controls.

An auditor can reconstruct the complete history of any entity and see not just what happened, but what was attempted and denied.

### fluent-convex Middleware

All Convex functions are defined using the fluent-convex chainable API:

```ts
export const listMortgages = convex
  .query()
  .use(authMiddleware)
  .use(requirePermission("mortgage:read"))
  .input({ orgId: v.string() })
  .handler(async (ctx, input) => {
    // ctx.user, ctx.permissions available from middleware
    return ctx.db.query("mortgages").filter(...).collect();
  })
  .public();
```

This pattern enforces auth checks structurally — you can't forget to add auth because the middleware chain is the function definition.

---

## Convex + TanStack: Integration Patterns

This project uses `@convex-dev/react-query` to bridge Convex's real-time subscriptions with TanStack Query's caching and SSR capabilities. This integration has several non-obvious behaviors that differ from typical TanStack Query usage.

### The Core Setup (src/router.tsx)

The router initializes three connected clients:

```ts
const convex = new ConvexReactClient(CONVEX_URL);
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),  // Convex-aware key hashing
      queryFn: convexQueryClient.queryFn(),          // Convex subscription bridge
    },
  },
});
convexQueryClient.connect(queryClient);
```

The `ConvexQueryClient` bridges Convex's WebSocket subscriptions into TanStack Query's cache. This means `convexQuery()` calls are **not HTTP requests** — they're live subscriptions that push updates automatically.

### Reading Data: `useSuspenseQuery` + `convexQuery`

**This is the primary pattern for all data reads:**

```ts
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";

const { data } = useSuspenseQuery(
  convexQuery(api.mortgages.getById, { id: mortgageId }),
);
```

Why `useSuspenseQuery` over `useQuery`:
- It integrates with TanStack Start's SSR — the query runs on the server during SSR and hydrates on the client
- It guarantees `data` is defined (no `undefined` checks), simplifying component logic
- It works with React Suspense boundaries for loading states

**You can spread `convexQuery()` with additional TanStack Query options:**

```ts
const { data } = useSuspenseQuery({
  ...convexQuery(api.mortgages.list, { orgId }),
  gcTime: 10000,  // Override garbage collection time
});
```

### Route Loaders: Pre-fetching for SSR

Route loaders ensure data is available before the route renders, eliminating loading flickers on navigation:

```ts
export const Route = createFileRoute("/mortgages")({
  loader: async (opts) => {
    await opts.context.queryClient.ensureQueryData(
      convexQuery(api.mortgages.list, { orgId: "..." }),
    );
  },
  component: MortgageList,
});
```

`ensureQueryData` populates the TanStack Query cache during SSR. When the component renders and calls `useSuspenseQuery` with the same query, it reads from cache immediately rather than re-fetching.

**Loaders also run on hover/intent** — `defaultPreload: "intent"` is set in our router config, so mousing over a `<Link>` pre-fetches that route's data.

### SSR Auth: The `serverHttpClient` Pattern

During SSR, there's no WebSocket connection — Convex falls back to HTTP requests. Auth tokens must be injected manually in the root route's `beforeLoad`:

```ts
beforeLoad: async (ctx) => {
  const { token } = await fetchWorkosAuth();
  if (token) {
    ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
  }
},
```

This only runs on the server. On the client, `ConvexProviderWithAuth` handles auth via the WebSocket connection.

### Writing Data: Mutations

There are two valid ways to call mutations. Both work, both auto-update all live query subscriptions, and **neither requires manual query invalidation**.

**Option A — TanStack Query `useMutation` + `useConvexMutation` (preferred for new code):**

```ts
import { useMutation } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";

const { mutate, isPending } = useMutation({
  mutationFn: useConvexMutation(api.mortgages.update),
});

// Gives you isPending, isError, onSuccess, onError, etc.
mutate({ id: mortgageId, principal: 500000 });
```

This gives you TanStack Query's full mutation lifecycle (`isPending`, `isError`, `onSuccess`, `onSettled`, optimistic updates) while Convex handles the actual execution. `useConvexMutation` is a re-export of `useMutation` from `convex/react` — it bridges the two.

**Option B — Convex's native `useMutation` (simpler, direct):**

```ts
import { useMutation } from "convex/react";

const updateMortgage = useMutation(api.mortgages.update);
await updateMortgage({ id: mortgageId, principal: 500000 });
```

Simpler when you don't need TanStack Query's mutation lifecycle hooks. You'll see this in existing code.

**The key insight: no manual query invalidation.** Because Convex queries are live WebSocket subscriptions, mutations automatically trigger re-renders in every component subscribed to affected data. `queryClient.invalidateQueries()` is dead code in this stack.

### What Doesn't Work Like Normal TanStack Query

| TanStack Query Concept | Convex Behavior |
|---|---|
| **`isStale`** | Always `false`. Convex data is pushed in real-time, never stale. |
| **`refetch()`** | Not needed. Subscriptions auto-update. Calling it is a no-op. |
| **`retry` options** | Ignored. Convex has its own retry/reconnection mechanism. |
| **Manual invalidation** | Not needed for Convex queries. Mutations auto-update all subscribers. |
| **`gcTime`** | Still relevant — controls how long the WebSocket subscription stays active after the last component unmounts. Default is 5 minutes; we use `5000ms` (5 seconds) to reduce unnecessary subscriptions. |
| **`staleTime`** | Irrelevant. Data is never stale. |

### Consistent Timestamps Across SSR Queries

TanStack Start sends a timestamp with each Convex query during SSR. Convex uses the same timestamp for all queries in a single render pass. This prevents a subtle bug: without it, one query might reflect a mutation that another query doesn't yet see, leading to inconsistent UI state.

### When to Drop Down to Raw Convex Hooks

The `@convex-dev/react-query` adapter doesn't cover all Convex features. Use native Convex hooks when you need:
- `useConvexAuth()` — auth state without a query
- `usePaginatedQuery()` — Convex's cursor-based pagination
- `useAction()` — calling Convex actions (server-side functions with side effects)
- `Authenticated` / `Unauthenticated` — conditional rendering based on auth state

Both hook systems coexist — the `ConvexProvider` and `QueryClientProvider` are both mounted in the router's `Wrap` component.

---

## Cross-State-Machine Communication

The GT system enables traceable causal chains across entity boundaries:

```
Collection Attempt (confirmed)
  → PAYMENT_RECEIVED → Obligation (settled)
  → OBLIGATION_SETTLED → Mortgage (checks arrears → possible cure)
  → OBLIGATION_SETTLED → Dispersal Engine (creates dispersal entries)

Obligation (overdue)
  → OBLIGATION_OVERDUE → Mortgage (active → delinquent)

Deal (all parallel children complete)
  → onDone → Ownership Ledger (transferShares)
  → onDone → Accrual Engine (prorateAccrualBetweenOwners)
```

Every link in these chains produces an audit journal entry. The full causal chain is reconstructable.

---

## How We Work

We use a three-tool system. Each tool owns a distinct layer — no context duplication across layers.

| Tool | Owns | Source of Truth For |
|---|---|---|
| **Notion** | Strategic context | PRDs, architecture docs, goals, schema reference, domain language — **why** and **what** |
| **Linear** | Tactical execution | Issues, cycles, project tracking — **who**, **when**, and **status** |
| **Graphite** | Code delivery | Stacked PRs, review, merge — **how code ships** |

**The flow:** Notion goal -> Linear project + issues -> Graphite PRs -> merged code -> Linear auto-updates -> Notion stays the reference.

**The no-duplication rule:** Each layer links to the one above it. PR description links to Linear issue, Linear issue links to Notion doc. If you're writing an architecture explanation in a PR description, stop — put it in Notion and link to it.

### Stacked PRs

We use Graphite for stacked PRs. Each PR is a logical, independently reviewable unit. A typical stack:

```
PR 1: Schema definitions + GT field conventions
PR 2: Machine definition + registry
PR 3: Engine integration + effects
PR 4: Tests (state x event matrix + integration)
```

Branch names include the Linear issue ID for automatic linking: `connor/fln-43-transition-engine`.

### Issue Format

Issues are short: what to do, acceptance criteria, and a Notion link. The architecture explanation lives in Notion, not in the issue.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (package manager + runtime)
- [Convex CLI](https://docs.convex.dev/getting-started) (`bun add -g convex`)
- [Graphite CLI](https://graphite.dev) (`npm install -g @withgraphite/graphite-cli`)
- Access to the FairLend WorkOS organization
- Access to the FairLend Convex project

### Development Commands

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Run Convex codegen (after schema changes)
bunx convex codegen

# Lint, format, and check errors (always run this BEFORE manually fixing lint issues)
bun check

# Type check
bun typecheck

# Run unit tests
bun test

# Run E2E tests
bun test:e2e

# Code review
bun run review
```

### Code Quality Gates

All three must pass before work is considered complete:

1. `bun check` (lint + format)
2. `bun typecheck` (TypeScript)
3. `bunx convex codegen` (Convex type generation)

---

## Design Principles

- **RBAC is structural, not decorative.** Authorization is wired into every query and mutation from day one via middleware chains. Retrofitting auth is the single most expensive technical debt pattern.
- **State machines as the backbone.** Every entity lifecycle goes through Governed Transitions. The Transition Engine is the only code path that modifies status fields.
- **Seed, don't build flows.** Phase 1 entities are seeded via admin mutations. The complex multi-step flows that create them are Phase 2+.
- **Interface-first on payment rails.** Define the PaymentMethod interface now, implement ManualPaymentMethod first, drop in real payment providers later with zero changes to business logic.
- **Auditability from the ground floor.** Every state transition is journaled, hash-chained, and queryable. Both successes and rejections. This is the 5-year regulatory retention layer.

### Code Patterns

- **DRY** — Extract shared logic into reusable modules. Duplicate logic across files is a code smell.
- **YAGNI** — Don't add functionality until it's necessary.
- **KISS** — If a simpler solution exists, use it.
- **Dependency Injection** — Inject dependencies, don't hardcode them. Everything should be mockable, testable, and replaceable.
- **Strategy Pattern** — Encapsulate interchangeable algorithms (e.g., PaymentMethod implementations).
- **Inversion of Control** — Use callbacks, events, and middleware to keep coupling loose.
- **Never use `any`** — unless there is genuinely no alternative.

---

## Project Structure

```
convex/                    # Convex backend
  machines/                # XState machine definitions (one per entity)
  effects/                 # Effect handlers for GT side effects
  engine/                  # Transition Engine (the 8-step pipeline)
  demo/                    # Demo backend files (safe to delete)
src/
  routes/                  # TanStack Router file-based routes
    demo/                  # Demo routes (safe to delete)
docs/
  convex/                  # Convex component documentation
  fluent-convex/           # fluent-convex middleware docs
  workos/                  # WorkOS AuthKit documentation
  design/                  # Architecture design docs
```

---

## Adding a Governed Entity (Checklist)

The GT pattern is designed so adding a new governed entity is mechanical:

1. **Define the machine** — `convex/machines/{entityType}.machine.ts` with `setup()` typed context and events
2. **Register the machine** — Add to `convex/machines/registry.ts`
3. **Define the schema** — GT fields (`status`, optionally `machineContext`, `lastTransitionAt`) + domain fields, with a machineContext comment explaining the decision
4. **Register effects** — Add handlers to `convex/effects/registry.ts`
5. **Write the state x event matrix test** — This is not optional. Every (state, event) pair must be tested.
6. **Write integration tests** — Happy path, rejection, cross-entity coordination.

---

## Phase 1 Governed Entities

| Entity | Machine | Key States |
|---|---|---|
| Mortgage | `mortgageMachine` | active -> delinquent -> defaulted -> collections -> written_off / matured |
| Deal | `dealMachine` | initiated -> awaiting_completion (parallel) -> confirmed / failed |
| Obligation | `obligationMachine` | upcoming -> due -> overdue -> settled (partially_settled) |
| Collection Attempt | `collectionAttemptMachine` | initiated -> pending -> confirmed / failed -> retry / permanent_fail |
| Onboarding Request | `onboardingRequestMachine` | pending_review -> approved -> role_assigned / rejected |
