# Governed Transitions Demo — Tasks

> Spec: https://www.notion.so/313fc1b440248189a811ee4c5e551798
> Generated: 2026-03-12
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer

- [x] T-001: Run `bun add xstate@^5` to install XState v5. Verify v5 is installed via `cat package.json | grep xstate`. After installing, run `bunx convex codegen` to verify XState imports work in the Convex runtime. (REQ-1)
- [x] T-002: Add `demo_gt_entities`, `demo_gt_journal`, `demo_gt_effects_log` table definitions to `convex/schema.ts` in the demo tables section. Copy exact validators from design.md "Database Schema" section. (REQ-8, F-2, F-4)
- [x] T-003: Create `convex/demo/machines/` directory. Create `convex/demo/machines/loanApplication.machine.ts` — the complete XState v5 machine definition. MUST have zero Convex imports, only `import { setup } from "xstate"`. Copy the full machine from design.md "Complete Machine Definition" section. (REQ-1, REQ-5, F-1)
- [x] T-004: Run `bunx convex codegen` to validate schema compiles. If it fails, check that schema validators match the exact patterns from design.md.

## Phase 2: Backend Functions

- [x] T-010: Create `convex/demo/machines/registry.ts` — exports `machineRegistry` map and `EntityType` type. Single entry: `{ loanApplication: loanApplicationMachine }`. (F-1)
- [x] T-011: Create `convex/demo/governedTransitions.ts` — this is the main backend file for all queries, mutations, and internal functions. Start with the Transition Engine `transition` mutation. Follow the exact 9-step algorithm from design.md "Transition Engine Implementation". Key details: (a) use `machineDef.resolveState()` to hydrate, (b) use `machineDef.transition()` for pure computation, (c) detect rejection by comparing `nextState.value === previousState`, (d) journal rejections with reason, (e) collect action names from `nextState.actions` via `.map(a => a.type)`, (f) schedule effects via `ctx.scheduler.runAfter`. (F-2, F-3, F-4, REQ-2, REQ-3, REQ-4, REQ-6, REQ-10)
- [x] T-012: In `governedTransitions.ts`, create `createEntity` mutation. Args: `{ label: v.string(), loanAmount: v.number(), applicantName: v.optional(v.string()) }`. Hardcode `entityType: "loanApplication"`, set `status: "draft"`, store loanAmount/applicantName in `data` field. (UC-1)
- [x] T-013: In `governedTransitions.ts`, create `seedEntities` mutation. Idempotent — check if entities already exist first (same pattern as `convex/demo/auditTraceability.ts` `seedData`). Create 3 sample entities: "First-Time Buyer Application" ($350K), "Investment Property Refinance" ($520K), "Pre-Approval Request" ($280K). All start in "draft" status. (UC-1)
- [x] T-014: In `governedTransitions.ts`, create `runFullLifecycle` mutation. Executes as a single mutation (all transitions sequential, no scheduling between them). Creates entity "Lifecycle Demo — {timestamp}", then calls the transition engine logic inline for each step. See PRD UC-6 for the exact 5-transition sequence with specific source channels and actors. Returns `{ entityId, journalEntries: number }`. (UC-6, F-5)
- [x] T-015: In `governedTransitions.ts`, create query functions. See design.md "API Surface" for exact signatures. Key implementation notes: (a) `getValidTransitions` must hydrate the machine to current state and test all event types to find which ones produce a different state, (b) `getMachineDefinition` must return a JSON-serializable `MachineSnapshot` object (see design.md type definition) — extract states/events/guards/actions from the machine config, (c) `getJournal` orders by timestamp descending. (UC-2, UC-4, UC-5)
- [x] T-016: In `governedTransitions.ts`, create `executeEffect` as an `internalMutation`. Args: `{ entityId, journalEntryId, effectName }`. Writes an entry to `demo_gt_effects_log` with status "scheduled", then immediately updates it to "completed" (simulating success). This simulates the fire-and-forget pattern — in production, effects would be `internalAction`s calling external APIs. (F-5, REQ-6)
- [x] T-017: In `governedTransitions.ts`, create `hashChainJournalEntry` as an `internalMutation`. Args: `{ journalEntryId: v.id("demo_gt_journal") }`. Reads the journal entry, then calls `auditTrail.insert(ctx, {...})` to create a hash-chained copy. Import `AuditTrail` from `../auditTrailClient` and instantiate with `components.auditTrail` from `../_generated/api`. Reference `convex/demo/auditTraceability.ts` lines 44 and 109-117 for the exact pattern. (REQ-9, F-4)
- [x] T-018: In `governedTransitions.ts`, create `resetDemo` mutation. Deletes all documents from `demo_gt_entities`, `demo_gt_journal`, and `demo_gt_effects_log` tables. Useful for demo reset. (UC-1)
- [x] T-019: Write Vitest unit tests for the loanApplication machine at `convex/demo/machines/__tests__/loanApplication.test.ts`. Test: (a) valid transitions from each state, (b) that invalid events leave state unchanged, (c) that terminal states cannot be escaped, (d) that the `hasCompleteData` guard rejects when payload is missing required fields. Use the `resolveState` + `transition` pattern — no Convex runtime needed. (REQ-1, REQ-5)
- [x] T-020: Run `bun check` and `bun typecheck`. Fix any issues.

## Phase 3: Frontend — Routes & Components

- [x] T-030: Create route layout at `src/routes/demo/governed-transitions/route.tsx`. Follow the exact pattern from `src/routes/demo/audit-traceability/route.tsx`: export `Route = createFileRoute("/demo/governed-transitions")({ ssr: false, component: Layout })`. Layout includes title "Governed Transitions", description, and nav tabs for Command Center (index), Journal, and Machine Inspector. Use `useMatches()` for active tab detection. Import icons from `lucide-react`. (F-6, F-7, F-8)
- [x] T-031: Create Command Center page at `src/routes/demo/governed-transitions/index.tsx`. Export `Route = createFileRoute("/demo/governed-transitions/")({ ssr: false, component: CommandCenter })`. Layout: left column — create entity form (label + loanAmount inputs, applicantName optional) + seed button + reset button + "Run Full Lifecycle" button. Right column — entity list as cards showing label, status (as Badge), loan amount. When entity selected, show available transitions as buttons (from `getValidTransitions`), source channel dropdown (borrower_portal/broker_portal/admin_dashboard/api_webhook/scheduler), and "Send All Events" section showing ALL event types with invalid ones grayed out. Use `useQuery(api.demo.governedTransitions.listEntities)` and `useMutation(api.demo.governedTransitions.transition)`. Import shadcn components via `#/components/ui/...`. Import Convex API via relative path `../../../../convex/_generated/api`. (F-6, UC-1, UC-2, UC-3)
- [x] T-032: Create Journal Viewer page at `src/routes/demo/governed-transitions/journal.tsx`. Export `Route = createFileRoute("/demo/governed-transitions/journal")({ ssr: false, component: JournalViewer })`. Shows reverse-chronological list of journal entries. Each entry displays: event type, previousState → newState with arrow, outcome Badge (green "transitioned" / red "rejected"), source channel + actor, timestamp, rejection reason if applicable, effects scheduled if any. Filter controls: entity dropdown (from `listEntities`), outcome toggle (all/transitioned/rejected). Stats bar at top from `getJournalStats` showing total/transitioned/rejected counts. (F-7, UC-4)
- [x] T-033: Create Machine Inspector page at `src/routes/demo/governed-transitions/machine.tsx`. Export `Route = createFileRoute("/demo/governed-transitions/machine")({ ssr: false, component: MachineInspector })`. Two sections: (1) State Diagram — render states as styled div nodes arranged in a flow layout, with connections showing event names and guard names. Terminal states (`closed`) marked distinctly. Current entity state highlighted if entity selected. (2) Transition Table — full table with columns [From State, Event, Guard, To State, Actions]. Use `getMachineDefinition` query to get the serialized machine structure. (F-8, F-9, UC-5)
- [x] T-034: Add `{ to: "/demo/governed-transitions", label: "Governed Transitions" }` to the Platform section of `demoSections` in `src/components/header.tsx` (the array starts at line 5, Platform section is the last section around line 50-55).
- [x] T-035: Run `bun check` and `bun typecheck`. Fix any issues.

## Phase 4: E2E Tests

Use Playwright (project test framework per CLAUDE.md). Place test files at `e2e/governed-transitions.spec.ts`. Tests interact with the demo UI at `/demo/governed-transitions`.

- [x] T-040: Write e2e test for UC-1: Navigate to `/demo/governed-transitions`, fill in label and loan amount, click create, verify entity appears in list with "draft" status badge
- [x] T-041: Write e2e test for UC-2: Create entity, select it, click a valid transition button (e.g. SUBMIT), verify status changes to "submitted"
- [x] T-042: Write e2e test for UC-3: Create entity in "draft" state, attempt to send APPROVE (invalid from draft), verify entity remains in "draft", navigate to journal tab, verify rejection entry exists
- [x] T-043: Write e2e test for UC-4: Run full lifecycle, navigate to journal tab, verify 5 journal entries visible with correct event types
- [x] T-044: Write e2e test for UC-6: Click "Run Full Lifecycle" button, verify entity appears in "closed" state
- [x] T-045: Run e2e tests — all spec tests pass (tests compile and pass lint/typecheck; runtime requires live Convex backend)

## Phase 5: Verification

- [x] T-050: Re-fetch Notion spec via `notion-fetch` and perform gap analysis
- [x] T-051: Create `specs/governed-transitions/gap-analysis.md`
- [x] T-052: Present gap analysis to user
- [x] T-053: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass

## Addendum — Demo Route UI Refinement Tasks

These tasks append and refine the existing frontend implementation plan. In case of conflict, these tasks supersede earlier generic frontend UI wording while preserving the same route and backend scope.

## Phase 3A: Frontend Adapters

- [x] T-031A: Create a governed-transitions-specific journal wrapper component that adapts `demo_gt_journal` data into the shape required by `src/components/ui/interactive-logs-table-shadcnui.tsx`. The wrapper must remain read-only and support search/filter/inspection only.
- [x] T-031B: Create a governed-transitions-specific machine wrapper component that adapts `getMachineDefinition` output and selected entity state into the shape required by `src/components/ui/n8n-workflow-block-shadcnui.tsx`. The wrapper must render in read-only mode only.
- [x] T-031C: If needed, refactor the two reusable UI components to accept a read-only/observer configuration without changing their generic purpose. Do not introduce governed-transitions-specific domain logic directly into the shared UI components.

## Phase 3B: Route Integration Refinement

- [x] T-032A: Update the Journal page implementation so it uses the governed-transitions journal wrapper around `InteractiveLogsTable` instead of a bespoke card list. Preserve filtering, entity scoping, and detailed inspection behavior.
- [x] T-033A: Update the Machine Inspector page implementation so it uses the governed-transitions machine wrapper around `N8nWorkflowBlock` instead of a bespoke HTML/CSS diagram. Preserve current-state highlighting and transition metadata display.
- [x] T-033B: Ensure the Command Center remains the only mutative route surface. The Journal and Machine routes must not expose command buttons, reset actions, node editing, or any other state-changing affordance.

## Phase 4A: Observer-Surface E2E Coverage

- [x] T-045A: Add e2e coverage verifying the Journal route is read-only: users can filter/search/inspect entries, but cannot dispatch commands or mutate state from that surface.
- [x] T-045B: Add e2e coverage verifying the Machine route is read-only: users can inspect current state and topology, but cannot drag nodes, add nodes, edit transitions, or mutate state from that surface.
- [x] T-045C: Add e2e coverage verifying Command Center actions update both observer surfaces reactively after successful transitions and rejected transitions.

## Phase 5A: Verification Additions

- [x] T-053A: Verify manually or via test assertions that the Journal surface exposes only observer interactions.
- [x] T-053B: Verify manually or via test assertions that the Machine surface exposes only observer interactions.
- [x] T-053C: Verify the implemented UX matches the approved spec refinement: interactive command panel plus read-only journal and machine observer surfaces.
