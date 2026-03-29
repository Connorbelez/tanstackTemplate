# ENG-250: Record CRUD & Typed EAV Storage — Master Task List

## Chunk 1: Pure Functions (valueRouter + fieldValidation)
- [ ] T-001: Create `convex/crm/valueRouter.ts` — fieldTypeToTable() mapping 14 types → 8 tables
- [ ] T-002: Create `convex/crm/fieldValidation.ts` — validateFieldValue() + validateRequiredFields()

## Chunk 2: Record CRUD Mutations
- [ ] T-003: writeValue + readExistingValue helpers (compile-time table switch)
- [ ] T-004: createRecord mutation (org check, validate, write records + fan-out, audit)
- [ ] T-005: updateRecord mutation (read old values, delete+insert, audit with before/after diff)
- [ ] T-006: deleteRecord mutation (soft-delete, retain values, audit)

## Quality Gate
- [ ] T-007: bun check + bun typecheck + bunx convex codegen pass
