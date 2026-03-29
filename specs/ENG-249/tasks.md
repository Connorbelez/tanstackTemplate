# Tasks: ENG-249 — Phase 2: Data Plane Schema — records + 8 Typed Value Tables

Source: Linear ENG-249, Notion implementation plan
Generated: 2026-03-29

## Phase 1: Schema — Data Plane Tables

- [x] T-001: Add EAV-CRM DATA PLANE section comment to `convex/schema.ts` after the existing control plane section (before closing `});`).
- [x] T-002: Add `records` table with fields: orgId (string), objectDefId (id→objectDefs), labelValue (optional string), isDeleted (boolean), createdAt (number), updatedAt (number), createdBy (string). Indexes: `by_object` [objectDefId], `by_org_object` [orgId, objectDefId], `by_org_label` [orgId, labelValue].
- [x] T-003: Add `recordValuesText` table with fields: recordId (id→records), fieldDefId (id→fieldDefs), objectDefId (id→objectDefs), value (string). Indexes: `by_record` [recordId], `by_record_field` [recordId, fieldDefId], `by_object_field_value` [objectDefId, fieldDefId, value].
- [x] T-004: Add `recordValuesNumber` table — same structure as Text but value is `v.number()`. Same 3 indexes including `by_object_field_value`.
- [x] T-005: Add `recordValuesBoolean` table — same structure but value is `v.boolean()`. Same 3 indexes including `by_object_field_value`.
- [x] T-006: Add `recordValuesDate` table — same structure but value is `v.number()` (unix ms). Same 3 indexes including `by_object_field_value`.
- [x] T-007: Add `recordValuesSelect` table — same structure as Text (value is string). Same 3 indexes including `by_object_field_value`.
- [x] T-008: Add `recordValuesMultiSelect` table — value is `v.array(v.string())`. ONLY 2 indexes: `by_record` and `by_record_field`. NO `by_object_field_value` (arrays not indexable).
- [x] T-009: Add `recordValuesRichText` table — same structure as Text. Same 3 indexes including `by_object_field_value`.
- [x] T-010: Add `recordValuesUserRef` table — same structure as Text (value is string for WorkOS subject ID). Same 3 indexes including `by_object_field_value`.
- [x] T-011: Add `recordLinks` table with fields: orgId (string), linkTypeDefId (id→linkTypeDefs), sourceObjectDefId (id→objectDefs), sourceKind (union: "record"|"native"), sourceId (string), targetObjectDefId (id→objectDefs), targetKind (union: "record"|"native"), targetId (string), isDeleted (boolean), createdAt (number), createdBy (string). Indexes: `by_source` [sourceKind, sourceId], `by_target` [targetKind, targetId], `by_link_type` [linkTypeDefId].

## Phase 2: Verification

- [x] T-012: Run `bunx convex codegen` — PASSED
- [x] T-013: Run `bun typecheck` — PASSED
- [x] T-014: Run `bun check` — PASSED (pre-existing warnings in unrelated files only)
