# Chunk 04 Context — Frontend Routes & Components

## Overview

Create the three frontend routes for the Governed Transitions demo: Command Center, Journal Viewer, and Machine Inspector. Follow existing demo route patterns.

## Route Layout Pattern

Reference: `src/routes/demo/audit-traceability/route.tsx` — this is the exact pattern to follow.

```typescript
import {
  createFileRoute,
  Link,
  Outlet,
  useMatches,
} from "@tanstack/react-router";
import { Activity, Eye, Shield } from "lucide-react"; // pick appropriate icons

export const Route = createFileRoute("/demo/governed-transitions")({
  ssr: false,
  component: GovernedTransitionsLayout,
});

const NAV_ITEMS = [
  {
    to: "/demo/governed-transitions",
    label: "Command Center",
    icon: Shield, // or Terminal, Zap etc from lucide-react
  },
  {
    to: "/demo/governed-transitions/journal",
    label: "Journal",
    icon: Activity, // or ScrollText, BookOpen etc
  },
  {
    to: "/demo/governed-transitions/machine",
    label: "Machine Inspector",
    icon: Eye, // or GitBranch, Workflow etc
  },
] as const;

function GovernedTransitionsLayout() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath ?? "";

  return (
    <div className="mx-auto max-w-7xl p-4 py-8">
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Governed Transitions</h1>
        <p className="text-muted-foreground text-sm">
          State machine-driven lifecycle management with audit journal and effect scheduling
        </p>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/demo/governed-transitions"
              ? currentPath === "/demo/governed-transitions" ||
                currentPath === "/demo/governed-transitions/"
              : currentPath.startsWith(item.to);

          return (
            <Link
              className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 font-medium text-sm transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              key={item.to}
              to={item.to}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
```

## Command Center (index.tsx)

File: `src/routes/demo/governed-transitions/index.tsx`

```typescript
export const Route = createFileRoute("/demo/governed-transitions/")({
  ssr: false,
  component: CommandCenter,
});
```

### Layout
Two-column grid on lg screens.

### Left Column
- **Create Entity form**: Label (Input), Loan Amount (Input type=number), Applicant Name (Input, optional). Button "Create Application".
- **Action buttons row**: "Seed Data" (outline), "Run Full Lifecycle" (outline), "Reset Demo" (destructive outline).

### Right Column
- **Entity list as Cards**. Each card shows:
  - Label (font-medium)
  - Status as Badge (color-coded: draft=secondary, submitted=outline, under_review=default, approved=default, rejected=destructive, needs_info=secondary, funded=default, closed=outline)
  - Loan amount formatted as currency
  - When selected (clicked), card expands to show:
    - **Valid transitions** from `getValidTransitions`: rendered as green Buttons
    - **All events** section: all 9 event types shown. Valid ones are green; invalid ones are visually muted with `cursor-not-allowed` but remain clickable. Clicking an invalid one still calls `transition` to demonstrate rejection logging.
    - **Source selector**: Select/dropdown with options: borrower_portal, broker_portal, admin_dashboard, api_webhook, scheduler. Default: admin_dashboard.

### Imports
```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { api } from "../../../../convex/_generated/api";
```

### Convex API Calls
```typescript
const entities = useQuery(api.demo.governedTransitions.listEntities);
const validTransitions = useQuery(
  api.demo.governedTransitions.getValidTransitions,
  selectedEntityId ? { entityId: selectedEntityId } : "skip"
);
const transitionMut = useMutation(api.demo.governedTransitions.transition);
const createEntityMut = useMutation(api.demo.governedTransitions.createEntity);
const seedMut = useMutation(api.demo.governedTransitions.seedEntities);
const resetMut = useMutation(api.demo.governedTransitions.resetDemo);
const runLifecycleMut = useMutation(api.demo.governedTransitions.runFullLifecycle);
```

### All Event Types (for the "Send All Events" section)
```typescript
const ALL_EVENTS = [
  "SUBMIT", "ASSIGN_REVIEWER", "APPROVE", "REJECT",
  "REQUEST_INFO", "RESUBMIT", "REOPEN", "FUND", "CLOSE",
];
```

### Source Channel Options
```typescript
const SOURCE_CHANNELS = [
  { value: "borrower_portal", label: "Borrower Portal" },
  { value: "broker_portal", label: "Broker Portal" },
  { value: "admin_dashboard", label: "Admin Dashboard" },
  { value: "api_webhook", label: "API Webhook" },
  { value: "scheduler", label: "Scheduler" },
];
```

## Journal Viewer (journal.tsx)

File: `src/routes/demo/governed-transitions/journal.tsx`

```typescript
export const Route = createFileRoute("/demo/governed-transitions/journal")({
  ssr: false,
  component: JournalViewer,
});
```

### Top Bar
Three stat cards showing Total, Transitioned (green), Rejected (red) counts — derived from the filtered `getJournal` result so counts stay in sync with active entity/outcome filters.

### Filters Row
Entity dropdown (from `listEntities`, with "All" option), Outcome toggle buttons (All / Transitioned / Rejected).

### Journal List
Reverse-chronological cards. Each entry shows:
- Event type in monospace bold
- Previous state → New state with arrow icon (ArrowRight from lucide)
- Outcome Badge: green "transitioned" or red "rejected"
- Source: channel + actorType + actorId
- Timestamp (formatted)
- If rejected: reason in muted text
- If effects scheduled: list of effect names as small badges

### API Calls
```typescript
const journal = useQuery(api.demo.governedTransitions.getJournal, filterArgs);
const stats = useQuery(api.demo.governedTransitions.getJournalStats);
const entities = useQuery(api.demo.governedTransitions.listEntities);
```

## Machine Inspector (machine.tsx)

File: `src/routes/demo/governed-transitions/machine.tsx`

```typescript
export const Route = createFileRoute("/demo/governed-transitions/machine")({
  ssr: false,
  component: MachineInspector,
});
```

### Section 1: State Diagram
Render states as styled div nodes in a CSS grid or flex layout. Each state node:
- Name label
- Border color: green if current entity state, gray otherwise
- "FINAL" badge on terminal states
- Shows outgoing transitions as labeled connections

Use HTML/CSS for the diagram. Arrange states roughly in lifecycle flow:
draft → submitted → under_review → (approved | rejected | needs_info) → funded → closed

### Section 2: Transition Table
Full HTML table with columns: From State, Event, Guard, To State, Actions.
Populated from `getMachineDefinition` query. Group by from-state.

### API Calls
```typescript
const machineDef = useQuery(api.demo.governedTransitions.getMachineDefinition);
const entities = useQuery(api.demo.governedTransitions.listEntities);
// Optional: selected entity for current-state highlighting
```

### MachineSnapshot Type (returned by getMachineDefinition)
```typescript
interface MachineSnapshot {
  id: string;
  initial: string;
  states: Record<string, {
    type?: "final";
    on: Record<string, {
      target: string;
      guard?: string;
      actions?: string[];
    }>;
  }>;
  allStates: string[];
  allEvents: string[];
  allGuards: string[];
  allActions: string[];
}
```

## Header Link (T-034)

In `src/components/header.tsx`, add to the Platform section of `demoSections` (the last section, around line 50-55):

```typescript
{
  label: "Platform",
  links: linkOptions([
    { to: "/demo/document-engine", label: "Document Engine" },
    { to: "/demo/audit-traceability", label: "Audit & Traceability" },
    { to: "/demo/governed-transitions", label: "Governed Transitions" },  // ADD THIS
  ]),
},
```

## shadcn UI Components Available

All components are at `#/components/ui/...`:
- Badge, Button, Card, CardContent, CardHeader, CardTitle
- Input, Label
- Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- Table, TableBody, TableCell, TableHead, TableHeader, TableRow (for transition table)

## Status Badge Color Scheme

```typescript
const statusColors: Record<string, string> = {
  draft: "secondary",
  submitted: "outline",
  under_review: "default",
  approved: "default",
  rejected: "destructive",
  needs_info: "secondary",
  funded: "default",
  closed: "outline",
};
```
