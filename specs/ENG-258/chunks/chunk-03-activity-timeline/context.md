# Chunk 03 Context: Frontend — ActivityTimeline

## Goal
Build the ActivityTimeline component that displays a chronological list of events for a record. This will be used in the RecordSidebar History tab (ENG-231).

## Backend API: getRecordActivity (from Chunk 01)
Location: `convex/crm/activityQueries.ts`

Input:
```ts
{
  recordId: v.string(),
  recordKind: entityKindValidator, // "record" | "native"
  limit: v.optional(v.number()),   // default 20, max 50
  cursor: v.optional(v.string()),  // for pagination
}
```

Returns `ActivityQueryResult`:
```ts
interface ActivityQueryResult {
  events: ActivityEvent[];
  continueCursor: string | null;
  isDone: boolean;
}

interface ActivityEvent {
  _id: string;
  eventType: "created" | "field_updated" | "linked" | "unlinked" | "status_changed" | "other";
  action: string;
  description: string;
  actor: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  timestamp: number;
  diff?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}
```

## Data Fetching Pattern
```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";

const { data } = useSuspenseQuery(convexQuery(api.crm.activityQueries.getRecordActivity, {
  recordId: props.recordId,
  recordKind: props.recordKind,
  limit: 20,
}));
```

## T-008: ActivityTimeline Component

### Props
```tsx
interface ActivityTimelineProps {
  recordId: string;
  recordKind: "record" | "native";
}
```

### Structure
```
ActivityTimeline
├── Header: "Activity" + event count
├── Timeline list (vertical line connecting events)
│   └── For each ActivityEvent:
│       └── ActivityEventItem
│           ├── Timeline dot (colored by eventType)
│           ├── Event icon (by eventType)
│           ├── Actor info: avatar + name
│           ├── Description text
│           ├── Relative timestamp (e.g., "2 hours ago")
│           └── Optional: FieldDiffDisplay (for field_updated events)
├── "Load more" button (if !isDone)
└── Empty state if no events
```

### Event Type Icons & Colors
Use Lucide icons:
- `created` → `Plus` icon, green dot
- `field_updated` → `Pencil` icon, blue dot
- `linked` → `Link2` icon, purple dot
- `unlinked` → `Unlink2` icon, orange dot
- `status_changed` → `ArrowRightLeft` icon, amber dot
- `other` → `Activity` icon, gray dot

### Relative Time Formatting
Use a simple utility function (no external library):
```ts
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
```

### Actor Avatar
Use the `Avatar` component from shadcn:
```tsx
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";

<Avatar className="size-6">
  {actor.avatarUrl && <AvatarImage src={actor.avatarUrl} />}
  <AvatarFallback className="text-xs">{getInitials(actor.name)}</AvatarFallback>
</Avatar>
```

## T-009: FieldDiffDisplay Component

### Props
```tsx
interface FieldDiffDisplayProps {
  diff: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}
```

### Structure
Show changed fields in a compact format:
```
┌─────────────────────────────────┐
│ fieldName                       │
│ - old value  → + new value      │
│                                 │
│ fieldName2                      │
│ - old value  → + new value      │
└─────────────────────────────────┘
```

- Compare before/after objects key-by-key
- Only show keys that actually changed
- Red text for removed values, green for added values
- Handle null/undefined gracefully (show "—" for empty)
- Truncate long values with ellipsis

## T-010: Infinite Scroll Pagination

Since this is inside a sidebar panel that scrolls, use a "Load more" button pattern rather than scroll-based infinite loading:

1. Initial query fetches first page (limit: 20)
2. If `isDone === false`, show a "Load more" button
3. Clicking "Load more" passes the `continueCursor` to the next query
4. Append new events to the existing list
5. Use React state to accumulate pages:
```tsx
const [cursor, setCursor] = useState<string | null>(null);
const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
```

Alternatively, since Convex queries are reactive, you may need to handle pagination at the query level. Consider using a simple approach where the `limit` increases on "Load more" (e.g., 20 → 40 → 60). This works well with Convex's reactive queries since the whole result set re-renders.

## T-011: Quality Gate
Run: `bun check && bun typecheck`
Fix any issues before marking complete.

## UI Components Available (shadcn)
Import pattern:
```tsx
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { ScrollArea } from "#/components/ui/scroll-area";
```

## File Structure
```
src/components/admin/shell/
├── FilterBuilder.tsx          (existing)
├── LinkedRecordsPanel.tsx     (from Chunk 02)
├── AddLinkDialog.tsx          (from Chunk 02)
├── ActivityTimeline.tsx       (new — T-008, T-010)
└── FieldDiffDisplay.tsx       (new — T-009)
```
