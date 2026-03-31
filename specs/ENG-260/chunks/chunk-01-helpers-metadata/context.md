# Chunk 1 Context: Test Harness + Metadata Compiler

## Key Files to Read Before Implementation

1. `convex/crm/metadataCompiler.ts` — The pure function to test
2. `convex/crm/fieldDefs.ts` — createField, updateField, deactivateField mutations (call deriveCapabilities)
3. `convex/crm/objectDefs.ts` — createObject mutation (creates default view)
4. `convex/crm/validators.ts` — fieldTypeValidator, capabilityValidator
5. `convex/accrual/__tests__/accrual.integration.test.ts` — Reference for convex-test patterns
6. `convex/deals/__tests__/access.test.ts` — Another convex-test reference
7. `AGENT_LESSONS.md` — Lessons 12-14 about convex-test

## convex-test Setup Pattern

```typescript
import { convexTest } from "convex-test";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

// CORRECT: pass modules directly (Lesson 12)
const t = convexTest(schema, modules);

// NOT: convexTest(schema, { modules })  ← WRONG
```

## Audit-Log Component Registration (Lesson 13)

CRM mutations (createObject, createField, etc.) call `auditLog.log()` and `auditLog.logChange()`.
Without registering the audit-log component, tests will fail with:
`Component "auditLog" is not registered. Call "t.registerComponent"`

You need to find and use the `convex-audit-log/test` registration helper.
Check existing codebase for examples — if none exist, try:
```typescript
import auditLogComponentTest from "convex-audit-log/test";
// Then call registration on the test instance
```

Also ensure `convex-audit-log` is in `test.server.deps.inline` in vite.config.ts.
If it's not there, add it alongside `fluent-convex`.

## Fluent Middleware Chain

CRM mutations use these middleware chains:
- `crmAdminMutation` = authedMutation + requireOrgContext + requireAdmin
- `crmAdminQuery` = authedQuery + requireOrgContext + requireAdmin
- `crmQuery` = authedQuery + requireOrgContext
- `crmMutation` = authedMutation + requireOrgContext

The identity must include:
- `org_id` — used by requireOrgContext
- `role: "admin"` — used by requireAdmin
- `roles: JSON.stringify(["admin"])` — serialized array

## API References

Object CRUD:
- `api.crm.objectDefs.createObject` — args: { name, singularLabel, pluralLabel, icon }
- `api.crm.objectDefs.listObjects` — no args (uses org from identity)

Field CRUD:
- `api.crm.fieldDefs.createField` — args: { objectDefId, name, label, fieldType, isRequired?, options? }
- `api.crm.fieldDefs.updateField` — args: { fieldDefId, fieldType?, ... }
- `api.crm.fieldDefs.deactivateField` — args: { fieldDefId }
- `api.crm.fieldDefs.listFields` — args: { objectDefId }

## The 14 Field Types

text, number, boolean, date, datetime, select, multi_select, email, phone, url, currency, percentage, rich_text, user_ref

## Capability Derivation Matrix

| Field Type | Capabilities |
|-----------|-------------|
| text | [table] |
| email | [table] |
| phone | [table] |
| url | [table] |
| rich_text | [table] |
| user_ref | [table] |
| number | [table, aggregate, sort] |
| currency | [table, aggregate, sort] |
| percentage | [table, aggregate, sort] |
| boolean | [table] |
| date | [table, calendar, sort] |
| datetime | [table, calendar, sort] |
| select | [table, kanban, group_by] |
| multi_select | [table, kanban] |

## Select Options Format

For select/multi_select fields, options are required:
```typescript
options: [
  { value: "new", label: "New", color: "#3b82f6", order: 0 },
  { value: "contacted", label: "Contacted", color: "#eab308", order: 1 },
]
```

## Never Use `any`

CLAUDE.md rule: NEVER USE `any` as a type unless you absolutely have to.
All test fixtures and assertions must be typed.
