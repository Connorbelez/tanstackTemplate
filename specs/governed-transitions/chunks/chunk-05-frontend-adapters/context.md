# Chunk 05 Context — Frontend Adapters & Route Refinement

## Overview

Create governed-transitions-specific adapter/wrapper components that bridge the domain data to two existing reusable UI components, then update the Journal and Machine routes to use them. Enforce the read-only observer rule on non-Command-Center surfaces.

## Reusable Component: InteractiveLogsTable

File: `src/components/ui/interactive-logs-table-shadcnui.tsx`

Current interface — the component uses hardcoded `SAMPLE_LOGS` data and this `Log` type:

```typescript
type LogLevel = "info" | "warning" | "error";

interface Log {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  duration: string;
  status: string;
  tags: string[];
}
```

The component currently:
- Has search, filter panel (level/service/status), and row expansion
- Uses `SAMPLE_LOGS` internally (hardcoded)
- Renders as a full-height `h-screen` layout with header, filter sidebar, and log rows
- Is purely presentational — no mutation affordances

**Refactoring needed (T-031C):** The component needs to accept `logs` as a prop instead of using hardcoded `SAMPLE_LOGS`. Add a `logs` prop while keeping the sample data as a default for backward compatibility. Also accept optional `title` and `subtitle` props to replace the hardcoded "Logs" header.

Suggested prop interface:
```typescript
interface InteractiveLogsTableProps {
  logs?: Log[];
  title?: string;
  subtitle?: string;
}

export function InteractiveLogsTable({
  logs = SAMPLE_LOGS,
  title = "Logs",
  subtitle,
}: InteractiveLogsTableProps) {
  // ... existing implementation, replacing SAMPLE_LOGS references with logs prop
}
```

**Important:** Don't change the default behavior — when no props are passed, it should still work exactly as before with SAMPLE_LOGS. Also change `h-screen` to `h-full` so it fits within a parent layout.

## Reusable Component: N8nWorkflowBlock

File: `src/components/ui/n8n-workflow-block-shadcnui.tsx`

Current interface:

```typescript
interface WorkflowNode {
  id: string;
  type: "trigger" | "action" | "condition";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  position: { x: number; y: number };
}

interface WorkflowConnection {
  from: string;
  to: string;
}
```

The component currently:
- Uses hardcoded `initialNodes` and `initialConnections`
- Supports dragging nodes and adding new nodes
- Has "Add Node" button and "Drag nodes to reposition" footer

**Refactoring needed (T-031C):** Add props for nodes, connections, and a `readOnly` mode:

```typescript
interface N8nWorkflowBlockProps {
  nodes?: WorkflowNode[];
  connections?: WorkflowConnection[];
  readOnly?: boolean;
  title?: string;
  activeNodeId?: string; // for highlighting current state
}

export function N8nWorkflowBlock({
  nodes: propNodes,
  connections: propConnections,
  readOnly = false,
  title = "Workflow Builder",
  activeNodeId,
}: N8nWorkflowBlockProps) {
  // When readOnly: hide "Add Node" button, disable drag, hide "Drag to reposition"
  // When activeNodeId: highlight that node with a ring/border
  // Use propNodes/propConnections if provided, else fall back to internal state
}
```

**Important:** Don't break existing usage. When no props are passed, it should behave exactly as before.

## Journal Adapter Component

Create: `src/routes/demo/governed-transitions/_components/GovernedTransitionsJournalView.tsx`

This wrapper:
1. Queries governed-transitions journal data via Convex
2. Maps `demo_gt_journal` entries to the `Log` interface
3. Passes mapped data to `InteractiveLogsTable`
4. Supports entity scoping via optional entityId filter

Mapping:
- `entry._id` → `log.id`
- `new Date(entry.timestamp).toISOString()` → `log.timestamp`
- `entry.outcome === "rejected" ? "error" : "info"` → `log.level`
- `entry.source.channel` → `log.service`
- `"${entry.eventType}: ${entry.previousState} → ${entry.newState}"` → `log.message`
- `""` → `log.duration` (not applicable)
- `entry.outcome` → `log.status`
- Build tags from: `[entry.eventType, entry.outcome, entry.source.channel, ...(entry.effectsScheduled ?? [])]` → `log.tags`

```typescript
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { InteractiveLogsTable } from "#/components/ui/interactive-logs-table-shadcnui";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface Props {
  entityId?: Id<"demo_gt_entities">;
  outcome?: string;
}

export function GovernedTransitionsJournalView({ entityId, outcome }: Props) {
  const journal = useQuery(api.demo.governedTransitions.getJournal, {
    entityId,
    outcome,
  });
  const stats = useQuery(api.demo.governedTransitions.getJournalStats);

  const logs = (journal ?? []).map(entry => ({
    id: entry._id,
    timestamp: new Date(entry.timestamp).toISOString(),
    level: (entry.outcome === "rejected" ? "error" : "info") as "info" | "warning" | "error",
    service: entry.source.channel,
    message: `${entry.eventType}: ${entry.previousState} → ${entry.newState}${entry.reason ? ` (${entry.reason})` : ""}`,
    duration: "",
    status: entry.outcome,
    tags: [
      entry.eventType,
      entry.outcome,
      entry.source.channel,
      ...(entry.effectsScheduled ?? []),
    ],
  }));

  const subtitle = stats
    ? `${stats.total} total · ${stats.transitioned} transitioned · ${stats.rejected} rejected`
    : undefined;

  return (
    <InteractiveLogsTable
      logs={logs}
      title="Transition Journal"
      subtitle={subtitle}
    />
  );
}
```

## Machine Adapter Component

Create: `src/routes/demo/governed-transitions/_components/GovernedTransitionsMachineView.tsx`

This wrapper:
1. Queries machine definition and optionally the selected entity's state
2. Maps machine states to `WorkflowNode` format
3. Maps transitions to `WorkflowConnection` format
4. Passes to `N8nWorkflowBlock` in read-only mode with activeNodeId

Mapping states to nodes — arrange in a lifecycle flow layout:
```typescript
const STATE_POSITIONS: Record<string, { x: number; y: number }> = {
  draft: { x: 50, y: 200 },
  submitted: { x: 300, y: 200 },
  under_review: { x: 550, y: 200 },
  approved: { x: 800, y: 100 },
  rejected: { x: 800, y: 300 },
  needs_info: { x: 550, y: 400 },
  funded: { x: 1050, y: 100 },
  closed: { x: 1300, y: 100 },
};
```

Node type mapping:
- Initial state ("draft") → type: "trigger"
- Terminal state ("closed") → type: "condition" (to visually distinguish)
- All others → type: "action"

Color mapping:
- draft → "blue", submitted → "indigo", under_review → "amber"
- approved → "emerald", rejected → "purple", needs_info → "amber"
- funded → "emerald", closed → "emerald"

Icon: use generic icons from lucide-react (e.g., `Circle` for states, `CheckCircle` for terminal).

## Updated Journal Page (T-032A)

Update `src/routes/demo/governed-transitions/journal.tsx` to use `GovernedTransitionsJournalView` as the main content area, replacing any bespoke card list. Keep the stats bar and entity/outcome filter controls at the top of the page, passing filter values as props to the wrapper.

## Updated Machine Inspector Page (T-033A)

Update `src/routes/demo/governed-transitions/machine.tsx` to use `GovernedTransitionsMachineView` for the state diagram section, replacing bespoke HTML/CSS. Keep the transition table section as-is (it's data-driven from `getMachineDefinition`).

## Read-Only Observer Rule (T-033B)

Verify that:
- Journal page: no buttons that call mutations, no reset/seed/command buttons
- Machine page: no "Add Node" button visible, no drag interactions, no mutation calls
- Only the Command Center (index.tsx) has mutation calls

If either observer page currently has mutation affordances, remove them.

## File Locations

```
src/routes/demo/governed-transitions/
  _components/
    GovernedTransitionsJournalView.tsx
    GovernedTransitionsMachineView.tsx
  route.tsx        — already created (chunk-04)
  index.tsx        — already created (chunk-04) — the only mutative surface
  journal.tsx      — update to use journal wrapper
  machine.tsx      — update to use machine wrapper
```
