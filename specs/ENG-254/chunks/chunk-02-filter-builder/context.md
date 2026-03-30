# Chunk 02 Context: FilterBuilder React Component

## Objective
Create a reusable FilterBuilder component for creating/editing view filters across all view types (table, kanban, calendar).

## File to Create
- `src/components/admin/shell/FilterBuilder.tsx` (NEW — directory must be created)

## Props Interface
```typescript
interface FilterBuilderProps {
  viewDefId: Id<"viewDefs">;
  objectDefId: Id<"objectDefs">;
}
```

## Component Architecture

### Data Fetching
```typescript
// Live-updating query for existing filters
const filters = useSuspenseQuery(
  convexQuery(api.crm.viewFilters.listViewFilters, { viewDefId })
);

// Live-updating query for field definitions
const fieldDefs = useSuspenseQuery(
  convexQuery(api.crm.fieldDefs.listFieldDefs, { objectDefId })
);

// Mutations
const addFilter = useMutation(api.crm.viewFilters.addViewFilter);
const removeFilter = useMutation(api.crm.viewFilters.removeViewFilter);
```

**Important:** Check if `listFieldDefs` exists in `convex/crm/fieldDefs.ts`. If not, the component may need to use an alternative query or it may need to be created. Check the actual exports.

### UI Structure
1. **Active filter pills** — horizontal row of Badge components, each showing:
   - Field name + operator + value summary
   - X button to remove (calls `removeViewFilter`)
2. **"Add filter" button** — opens a Popover containing:
   - **Field selector**: Select dropdown populated from active fieldDefs
   - **Operator selector**: Select dropdown filtered by `getValidOperators(selectedFieldType)`
   - **Value input**: Type-appropriate input (see mapping below)
   - **Logical connector**: AND/OR toggle (shown for 2nd+ filters)
   - **Submit button**: Calls `addViewFilter` mutation

### Value Input Strategy (per field type)

| Field Type Category | Input Component | Notes |
|---|---|---|
| text, email, phone, url, rich_text | `<Input type="text" />` | Free text entry |
| number, currency, percentage | `<Input type="number" />` | Numeric entry |
| date, datetime | Date picker (ShadCN Calendar in Popover) | For "between": two date pickers. Value stored as unix ms JSON string. |
| select, multi_select | `<Select>` with options from fieldDef.options | For "is_any_of": multi-select checkbox pattern |
| boolean | No value input needed | Operators `is_true`/`is_false` ARE the value |
| user_ref | `<Select>` with org users | Simplified: text input for user ID in Phase 1 |

### Filter Value Encoding
Filter values are stored as `v.optional(v.string())` in the schema. Encoding convention:
- Text values: stored as-is
- Number values: JSON string of number (e.g., `"250000"`)
- Date values: JSON string of unix ms (e.g., `"1772524800000"`)
- "between" dates: JSON string `{"start": 123, "end": 456}`
- "is_any_of": JSON array string `["new", "qualified"]`

### ShadCN Components to Import
```typescript
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
```

### Operator Display Names
Map technical operator names to human-readable labels:
```typescript
const OPERATOR_LABELS: Record<string, string> = {
  contains: "contains",
  equals: "equals",
  starts_with: "starts with",
  eq: "equals",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
  before: "before",
  after: "after",
  between: "between",
  is: "is",
  is_not: "is not",
  is_any_of: "is any of",
  is_true: "is true",
  is_false: "is false",
};
```

## Key Dependencies

### filterOperatorValidation.ts (importable in client code):
```typescript
// Pure function — safe for client-side import
import { getValidOperators } from "../../convex/crm/filterOperatorValidation";

// Usage: when user selects a field, filter the operator dropdown
const operators = getValidOperators(selectedField.fieldType);
```

**Important:** `filterOperatorValidation.ts` imports from `../\_generated/dataModel` which is Convex server code. This may NOT be importable on the client side. If so, duplicate the OPERATOR_MAP logic on the client or create a shared constants file.

### viewFilters.ts mutations:
- `addViewFilter({ viewDefId, fieldDefId, operator, value?, logicalOperator? })` — uses `crmAdminMutation`
- `updateViewFilter({ filterId, operator?, value?, logicalOperator? })` — uses `crmAdminMutation`
- `removeViewFilter({ filterId })` — uses `crmAdminMutation`
- `listViewFilters({ viewDefId })` — uses `crmAdminQuery`

### Schema (viewFilters):
```typescript
viewFilters: defineTable({
  viewDefId: v.id("viewDefs"),
  fieldDefId: v.id("fieldDefs"),
  operator: filterOperatorValidator,  // 16 operator types
  value: v.optional(v.string()),
  logicalOperator: v.optional(logicalOperatorValidator),  // "and" | "or"
})
```

### validators.ts:
```typescript
export const filterOperatorValidator = v.union(
  v.literal("contains"), v.literal("equals"), v.literal("starts_with"),
  v.literal("eq"), v.literal("gt"), v.literal("lt"),
  v.literal("gte"), v.literal("lte"),
  v.literal("before"), v.literal("after"), v.literal("between"),
  v.literal("is"), v.literal("is_not"), v.literal("is_any_of"),
  v.literal("is_true"), v.literal("is_false")
);

export const logicalOperatorValidator = v.union(
  v.literal("and"), v.literal("or")
);
```

## Data Fetching Pattern
The project uses `useSuspenseQuery(convexQuery(...))` for live-updating queries:
```typescript
import { useSuspenseQuery } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
```

**Check actual imports** — the exact import paths may differ. Look at existing components for patterns.

## Constraints
- No `any` types — all props, state, return types must be explicit
- Use ShadCN UI primitives + Tailwind utilities
- Component receives viewDefId + objectDefId as props, fetches its own data (loose coupling)
- DRY: reuse `getValidOperators()` logic, don't duplicate operator mapping
- `bun check` and `bun typecheck` must pass
- Reusable across table, kanban, and calendar views
