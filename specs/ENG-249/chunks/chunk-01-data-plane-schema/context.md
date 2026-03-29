# Chunk Context: data-plane-schema

Source: Linear ENG-249, Notion implementation plan + EAV-CRM Architecture doc.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

Define the `records` table + 8 typed value tables + `recordLinks` table in `convex/schema.ts`. This is the data plane counterpart to the control plane schema defined in ENG-247. All 10 tables are NEW — no modifications to existing tables.

### `records` table

```typescript
records: defineTable({
  orgId: v.string(),
  objectDefId: v.id("objectDefs"),
  labelValue: v.optional(v.string()),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
})
  .index("by_object", ["objectDefId"])
  .index("by_org_object", ["orgId", "objectDefId"])
  .index("by_org_label", ["orgId", "labelValue"]),
```

### 8 Typed Value Tables

Each value table has: `recordId: v.id("records")`, `fieldDefId: v.id("fieldDefs")`, `objectDefId: v.id("objectDefs")`, typed `value`.

| Table | Value Type | Maps From |
| -- | -- | -- |
| `recordValuesText` | `v.string()` | text, email, phone, url |
| `recordValuesNumber` | `v.number()` | number, currency, percentage |
| `recordValuesBoolean` | `v.boolean()` | boolean |
| `recordValuesDate` | `v.number()` | date, datetime (unix ms) |
| `recordValuesSelect` | `v.string()` | single select |
| `recordValuesMultiSelect` | `v.array(v.string())` | multi select |
| `recordValuesRichText` | `v.string()` | HTML/Markdown |
| `recordValuesUserRef` | `v.string()` | WorkOS user subject ID |

### Indexes per value table

- `by_record: ["recordId"]` — load all values for a record
- `by_record_field: ["recordId", "fieldDefId"]` — load specific field value
- `by_object_field_value: ["objectDefId", "fieldDefId", "value"]` — workhorse: range queries

**Exception:** `recordValuesMultiSelect` cannot have `by_object_field_value` — Convex arrays aren't indexable. Uses `by_record` and `by_record_field` only.

### `recordLinks` table

```typescript
recordLinks: defineTable({
  orgId: v.string(),
  linkTypeDefId: v.id("linkTypeDefs"),
  sourceObjectDefId: v.id("objectDefs"),
  sourceKind: v.union(v.literal("record"), v.literal("native")),
  sourceId: v.string(),
  targetObjectDefId: v.id("objectDefs"),
  targetKind: v.union(v.literal("record"), v.literal("native")),
  targetId: v.string(),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  createdBy: v.string(),
})
  .index("by_source", ["sourceKind", "sourceId"])
  .index("by_target", ["targetKind", "targetId"])
  .index("by_link_type", ["linkTypeDefId"]),
```

## Architecture Context

This is a **Typed EAV** (Entity-Attribute-Value) system. Instead of one generic values table with string-typed values, we use 8 type-specific tables. This enables native Convex range queries via compound indexes — impossible with string-casted values.

The `by_object_field_value` compound index is the workhorse enabling:
- "All leads where deal_value > 100000" → range scan on recordValuesNumber
- "All leads where status = 'new'" → equality scan on recordValuesSelect

## Integration Points

### ENG-247 (Control Plane — DONE): Tables this schema references
- `objectDefs` — referenced via `v.id("objectDefs")`
- `fieldDefs` — referenced via `v.id("fieldDefs")`
- `linkTypeDefs` — referenced via `v.id("linkTypeDefs")`

### ENG-250 (Record CRUD — downstream): Will write to these tables
```typescript
await ctx.db.insert("records", { orgId, objectDefId, labelValue, isDeleted: false, ... });
await ctx.db.insert("recordValuesText", { recordId, fieldDefId, objectDefId, value: "..." });
```

### ENG-257 (Link Types — downstream): Will write to recordLinks
```typescript
sourceKind: v.union(v.literal("record"), v.literal("native")),
sourceId: v.string(),  // Convex doc ID cast to string OR WorkOS ID
```

## Constraints & Rules

- **Append-only to schema.ts** — no modifications to existing tables
- **camelCase table names** — `recordValuesText`, not `record_values_text`
- **`recordLinks` uses `v.string()` for IDs** — NOT `v.id("records")` — because endpoints can be either EAV records or native table rows
- **`recordValuesMultiSelect` has NO `by_object_field_value` index** — Convex arrays aren't indexable in compound indexes
- **`orgId` is `v.string()`** — stores WorkOS org ID, matches existing pattern
- **`createdBy` is `v.string()`** — stores WorkOS user subject ID, matches existing pattern

## File Structure

- Insert new tables in `convex/schema.ts` AFTER the existing EAV-CRM CONTROL PLANE section (which ends at line ~1966), BEFORE the closing `});` at line 1967
- Add a section comment: `// EAV-CRM DATA PLANE`
- Follow the same indentation pattern as the control plane tables (tab-indented)
