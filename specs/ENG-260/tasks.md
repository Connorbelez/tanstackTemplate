# ENG-260: EAV-CRM Tests — Master Task List

## Chunk 1: Test Harness + Metadata Compiler Tests

- [x] T-001: Create test helpers (`convex/crm/__tests__/helpers.ts`)
  - `createCrmTestHarness()`: returns `convexTest(schema, modules)` with audit-log component registered
  - `CRM_ADMIN_IDENTITY`: WorkOS-style JWT with admin role + org_id
  - `CRM_USER_IDENTITY`: Non-admin identity
  - `DIFFERENT_ORG_IDENTITY`: Identity from different org
  - `seedObjectWithFields()`: creates objectDef + fieldDefs via mutations, returns fixture
  - `seedRecord()`: creates a record with typed values via mutation
  - Module glob: `import.meta.glob("/convex/**/*.ts")`
  - Register `convex-audit-log/test` component per AGENT_LESSONS Lesson 13

- [x] T-002: Create metadata compiler tests (`convex/crm/__tests__/metadataCompiler.test.ts`)
  - Test all 14 field types → correct capabilities derived
  - Test capability deletion + re-derivation on field type update
  - Test deactivated fields produce no capabilities
  - Test capabilities queryable via `fieldCapabilities.by_object_capability` index

- [x] T-003: Run `bun run test` to validate chunk 1 passes (23 tests passing)

## Chunk 2: Record CRUD Tests

- [x] T-004: Create record CRUD tests (`convex/crm/__tests__/records.test.ts`) (23 tests)
  - createRecord: all 14 field types → correct value table routing
  - createRecord: labelValue populated from first text field
  - createRecord: required field validation → rejection
  - createRecord: type validation → rejection on wrong type
  - createRecord: org-scoping (different org can't see record)
  - updateRecord: old values deleted, new values inserted
  - updateRecord: labelValue updated when label field changes
  - updateRecord: audit event includes before/after diff
  - deleteRecord: soft-delete sets isDeleted=true
  - deleteRecord: value rows preserved
  - deleteRecord: audit event emitted
  - Audit verification after each mutation

- [x] T-005: Run `bun run test` to validate chunk 2 passes (46 total passing)

## Chunk 3: View Engine Tests

- [x] T-006: Create view engine tests (`convex/crm/__tests__/viewEngine.test.ts`) (16 tests)
  - Table view: returns correct columns matching viewFields config
  - Table view: only visible fields included, in displayOrder
  - Table view: pagination with cursor works
  - Kanban view: groups records by select field value
  - Kanban view: each group has correct count and records
  - Kanban view: "No Value" group for records without grouping field
  - Calendar view: filters records by date range (start/end)
  - Calendar view: returns records with date field values
  - View filters: all operators work (eq, gt, lt, gte, lte, contains, starts_with, is_any_of, is_true, is_false)
  - View integrity: deactivate field → view.needsRepair = true
  - View integrity: querying needsRepair view throws error

- [x] T-007: Run `bun run test` to validate chunk 3 passes (62 total passing)

## Chunk 4: System Adapters + Links + Walkthrough

- [x] T-008: Create system adapter tests (`convex/crm/__tests__/systemAdapters.test.ts`) (13 tests)
  - queryNativeTable returns correct documents for each supported table
  - queryNativeTable: org-scoped (only returns docs from caller's org)
  - queryNativeTable: unknown table name throws error
  - resolveColumnPath: maps native field names to document properties
  - resolveColumnPath: handles nested paths and string dates → unix ms
  - UnifiedRecord contract: EAV record → _kind: "record", native → _kind: "native"
  - Both have identical shape

- [x] T-009: Create link tests (`convex/crm/__tests__/links.test.ts`) (16 skipped — ENG-257 pending)
  - ⚠️ ENG-257 NOT DONE — linkTypes.ts/recordLinks.ts don't exist
  - Use `it.skip()` with TODO comments for all tests
  - Scaffold: link type CRUD, createLink validation, bidirectional queries, polymorphic links

- [x] T-010: Create integration walkthrough test (`convex/crm/__tests__/walkthrough.test.ts`) (1 test)
  - Create object ("Lead") → verify default table view auto-created
  - Add fields: company_name (text), status (select), next_followup (date), deal_value (currency)
  - Verify capabilities derived correctly
  - Create kanban view bound to status field
  - Create 3 records with different status values
  - Query table view → verify 3 records with correct columns
  - Query kanban view → verify records grouped by status
  - Update record status → verify kanban group changes
  - Search records by labelValue → verify prefix match
  - Performance check: measure timing, assert < 2000ms

- [x] T-011: Run `bun run test`, `bun check`, `bun typecheck` — all pass (76 passed, 16 skipped)
