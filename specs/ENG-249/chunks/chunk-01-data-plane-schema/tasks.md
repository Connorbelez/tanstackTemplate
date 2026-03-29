# Chunk 01: data-plane-schema

- [x] T-001: Add EAV-CRM DATA PLANE section comment after the control plane section
- [x] T-002: Add `records` table with orgId, objectDefId, labelValue, isDeleted, createdAt, updatedAt, createdBy and indexes by_object, by_org_object, by_org_label
- [x] T-003: Add `recordValuesText` table (value: string) with by_record, by_record_field, by_object_field_value indexes
- [x] T-004: Add `recordValuesNumber` table (value: number) with by_record, by_record_field, by_object_field_value indexes
- [x] T-005: Add `recordValuesBoolean` table (value: boolean) with by_record, by_record_field, by_object_field_value indexes
- [x] T-006: Add `recordValuesDate` table (value: number/unix ms) with by_record, by_record_field, by_object_field_value indexes
- [x] T-007: Add `recordValuesSelect` table (value: string) with by_record, by_record_field, by_object_field_value indexes
- [x] T-008: Add `recordValuesMultiSelect` table (value: array of strings) with ONLY by_record, by_record_field indexes (NO by_object_field_value)
- [x] T-009: Add `recordValuesRichText` table (value: string) with by_record, by_record_field, by_object_field_value indexes
- [x] T-010: Add `recordValuesUserRef` table (value: string) with by_record, by_record_field, by_object_field_value indexes
- [x] T-011: Add `recordLinks` table with polymorphic sourceKind/targetKind + string IDs and by_source, by_target, by_link_type indexes
- [x] T-012: Run `bunx convex codegen` — must pass
- [x] T-013: Run `bun typecheck` — must pass
- [x] T-014: Run `bun check` — must pass
