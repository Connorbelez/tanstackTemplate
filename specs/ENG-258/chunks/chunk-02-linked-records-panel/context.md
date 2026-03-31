# Chunk 02 Context: Frontend — LinkedRecordsPanel

## Goal
Build the LinkedRecordsPanel component that displays all entities linked to the current record, grouped by link type, with add/remove actions. This will be used in the RecordSidebar Relations tab (ENG-231).

## Data Fetching Pattern
This project uses TanStack Query + Convex for data fetching. Components use `useQuery` from `convex/react`:
```tsx
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// In component:
const data = useQuery(api.crm.linkQueries.getLinkedRecords, {
  recordId: "...",
  recordKind: "record",
  direction: "both",
});
```

For mutations:
```tsx
import { useMutation } from "convex/react";

const createLink = useMutation(api.crm.recordLinks.createLink);
```

## Backend API: getLinkedRecords
Location: `convex/crm/linkQueries.ts`
Returns `LinkGroup[]` where:
```ts
interface LinkGroup {
  direction: "outbound" | "inbound";
  links: LinkedRecord[];
  linkTypeDefId: Id<"linkTypeDefs">;
  linkTypeName: string;
}

interface LinkedRecord {
  labelValue?: string;
  linkId: Id<"recordLinks">;
  linkTypeDefId: Id<"linkTypeDefs">;
  objectDefId: Id<"objectDefs">;
  recordId: string;
  recordKind: "record" | "native";
}
```

Input:
```ts
{
  recordId: v.string(),
  recordKind: entityKindValidator, // "record" | "native"
  direction: v.optional(v.union(v.literal("outbound"), v.literal("inbound"), v.literal("both"))),
}
```

## Backend API: getLinkTypesForObject
Location: `convex/crm/linkQueries.ts`
Returns all active `linkTypeDefs` where the given objectDef participates as source or target.
Input: `{ objectDefId: v.id("objectDefs") }`

## Backend API: createLink
Location: `convex/crm/recordLinks.ts`
Input:
```ts
{
  linkTypeDefId: v.id("linkTypeDefs"),
  sourceKind: entityKindValidator,
  sourceId: v.string(),
  targetKind: entityKindValidator,
  targetId: v.string(),
}
```
- Validates both entities exist and belong to caller's org
- Enforces cardinality (one_to_one, one_to_many, many_to_many)
- Detects duplicates (both forward A→B and reverse B→A)
- Logs audit event

## Backend API: deleteLink
Location: `convex/crm/recordLinks.ts`
Input: `{ linkId: v.id("recordLinks") }`
- Soft-deletes (sets isDeleted=true)
- Logs audit event

## Backend API: searchRecords
Location: `convex/crm/recordQueries.ts`
Input:
```ts
{
  objectDefId: v.id("objectDefs"),
  query: v.string(),
  limit: v.optional(v.number()), // default 20, max 100
}
```
Returns `UnifiedRecord[]` matching the search query on labelValue.
Note: Only works for EAV records (not system/native objects — returns empty []).

## ObjectDef Schema
```ts
objectDefs: defineTable({
  orgId: v.string(),
  name: v.string(),
  singularLabel: v.string(),
  pluralLabel: v.string(),
  icon: v.string(),           // icon name for entity registry
  description: v.optional(v.string()),
  isSystem: v.boolean(),
  nativeTable: v.optional(v.string()),
  isActive: v.boolean(),
  displayOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
})
```

## LinkTypeDef Schema
```ts
linkTypeDefs: defineTable({
  orgId: v.string(),
  name: v.string(),
  sourceObjectDefId: v.id("objectDefs"),
  targetObjectDefId: v.id("objectDefs"),
  cardinality: cardinalityValidator, // "one_to_one" | "one_to_many" | "many_to_many"
  isActive: v.boolean(),
  createdAt: v.number(),
})
```

## T-004: LinkedRecordsPanel Component

### Props
```tsx
interface LinkedRecordsPanelProps {
  recordId: string;
  recordKind: "record" | "native";
  objectDefId: Id<"objectDefs">;
}
```

### Structure
```
LinkedRecordsPanel
├── Header: "Relations" + total count badge
├── For each LinkGroup:
│   └── LinkGroupSection (collapsible)
│       ├── Header: linkTypeName + direction arrow + count + "Add" button
│       └── List of linked records:
│           └── LinkedRecordItem
│               ├── Entity icon (from objectDef.icon via Lucide)
│               ├── Label (labelValue or "Untitled")
│               ├── Object type badge
│               └── Remove button (trash icon)
└── Empty state if no links
```

### UI Components Available (shadcn)
- `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from `src/components/ui/collapsible.tsx`
- `Badge` from `src/components/ui/badge.tsx`
- `Button` from `src/components/ui/button.tsx`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `src/components/ui/dialog.tsx`
- `Input` from `src/components/ui/input.tsx`
- `AlertDialog` for delete confirmation from `src/components/ui/alert-dialog.tsx`
- `Tooltip` for icon buttons from `src/components/ui/tooltip.tsx`

Import pattern for all UI components:
```tsx
import { Button } from "#/components/ui/button";
```

### Icon Resolution
The `objectDef.icon` field stores a Lucide icon name (string). Use dynamic icon rendering:
```tsx
import * as LucideIcons from "lucide-react";

function EntityIcon({ iconName, className }: { iconName: string; className?: string }) {
  const Icon = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[iconName] ?? LucideIcons.FileText;
  return <Icon className={className} />;
}
```

### Navigation
When a linked record is clicked, it should navigate to the record's detail view. For now, use a callback prop:
```tsx
onNavigate?: (recordId: string, recordKind: "record" | "native", objectDefId: string) => void;
```

## T-005: AddLinkDialog Component

### Props
```tsx
interface AddLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The record we're adding a link FROM */
  sourceRecordId: string;
  sourceRecordKind: "record" | "native";
  /** The link type definition to use */
  linkTypeDef: {
    _id: Id<"linkTypeDefs">;
    name: string;
    sourceObjectDefId: Id<"objectDefs">;
    targetObjectDefId: Id<"objectDefs">;
    cardinality: string;
  };
  /** Whether this record is the source or target in the link type */
  direction: "outbound" | "inbound";
}
```

### Flow
1. User clicks "Add" on a link group section
2. Dialog opens with a search input
3. User types → debounced search via `searchRecords` query
4. Results displayed as a list of records (labelValue + objectDef icon)
5. User clicks a record → `createLink` mutation fires
6. Dialog closes on success
7. Error toast on failure (e.g., cardinality violation, duplicate)

### Search Debounce
Use a simple `useState` + `useEffect` with 300ms debounce, or use a ref-based approach. Do NOT add a new debounce library.

## T-006: Remove Link Action

Add a delete button to each linked record item. On click:
1. Show confirmation dialog (AlertDialog)
2. On confirm, call `deleteLink({ linkId })`
3. Optimistic update via TanStack Query invalidation (Convex queries auto-update)

## T-007: Quality Gate
Run: `bun check && bun typecheck`
Fix any issues before marking complete.

## File Structure
```
src/components/admin/shell/
├── FilterBuilder.tsx          (existing)
├── LinkedRecordsPanel.tsx     (new — T-004, T-006)
└── AddLinkDialog.tsx          (new — T-005)
```
