# Chunk 2 Context: Record CRUD Tests

## Key Files to Read

1. `convex/crm/records.ts` — createRecord, updateRecord, deleteRecord mutations
2. `convex/crm/fieldValidation.ts` — validateFieldValue, validateRequiredFields
3. `convex/crm/valueRouter.ts` — fieldTypeToTable mapping
4. `convex/crm/recordQueries.ts` — queryRecords, getRecord, searchRecords
5. `convex/crm/__tests__/helpers.ts` — Test harness from chunk 1

## API References

Record mutations:
- `api.crm.records.createRecord` — args: { objectDefId, values: Record<string, unknown> }
- `api.crm.records.updateRecord` — args: { recordId, values: Record<string, unknown> }
- `api.crm.records.deleteRecord` — args: { recordId }

Record queries:
- `api.crm.recordQueries.queryRecords` — args: { objectDefId, paginationOpts: { numItems, cursor }, filters?, sort? }
- `api.crm.recordQueries.getRecord` — args: { recordId }
- `api.crm.recordQueries.searchRecords` — args: { objectDefId, query, limit? }

## Value Table Routing

| Field Type | Storage Table |
|-----------|--------------|
| text, email, phone, url | recordValuesText |
| number, currency, percentage | recordValuesNumber |
| boolean | recordValuesBoolean |
| date, datetime | recordValuesDate |
| select | recordValuesSelect |
| multi_select | recordValuesMultiSelect |
| rich_text | recordValuesRichText |
| user_ref | recordValuesUserRef |

## Field Validation Rules

- text, rich_text, user_ref: must be string
- email: string matching /^[^\s@]+@[^\s@]+\.[^\s@]+$/
- phone: string matching /^\+?[\d\s\-().]{7,20}$/
- url: string that passes `new URL(value)`
- number, currency, percentage: number (not NaN)
- boolean: must be boolean
- date, datetime: positive number (unix ms)
- select: string, must be in options if options exist
- multi_select: array of strings, all must be in options

## Required Field Validation

If `isRequired: true` and field name not present in values → ConvexError("Missing required fields: ...")

## Record labelValue

The `labelValue` is populated from the first active text field (by displayOrder) that has a non-empty string value. Used for search indexing.

## Audit Log

CRM mutations emit audit events:
- `createRecord` → `auditLog.log()` with action "crm.record.created"
- `updateRecord` → `auditLog.logChange()` with action "crm.record.updated" + before/after
- `deleteRecord` → `auditLog.log()` with action "crm.record.deleted"

## Sample Test Value Map (all 14 types)

```typescript
const ALL_FIELD_VALUES = {
  company_name: "Acme Corp",           // text
  email: "contact@acme.com",           // email
  phone: "+1-555-0100",                // phone
  website: "https://acme.com",         // url
  employee_count: 250,                 // number
  revenue: 1500000,                    // currency
  growth_rate: 15.5,                   // percentage
  is_public: true,                     // boolean
  founded_date: 1609459200000,         // date (unix ms)
  last_contact: 1711929600000,         // datetime (unix ms)
  status: "new",                       // select
  tags: ["enterprise", "tech"],        // multi_select
  notes: "<p>Important client</p>",    // rich_text
  assigned_to: "user_01EXAMPLE",       // user_ref
};
```

## Seed Helper Pattern

Use the helpers from chunk 1:
```typescript
const t = createCrmTestHarness();
const fixture = await seedObjectWithFields(t, {
  name: "company",
  fields: [
    { name: "company_name", fieldType: "text", isRequired: true },
    { name: "status", fieldType: "select", options: [...] },
    // ...
  ],
});
```
