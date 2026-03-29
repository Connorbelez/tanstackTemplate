# Chunk 1 Context: Pure Functions — Value Router + Field Validation

## What You're Building
Two pure function modules with zero side effects that power the record CRUD layer.

## T-001: `convex/crm/valueRouter.ts`

Maps 14 field types to 8 storage table names. This is used by writeValue/readExistingValue in records.ts.

### Mapping
| Field Type | Storage Table |
|---|---|
| text, email, phone, url | recordValuesText |
| number, currency, percentage | recordValuesNumber |
| boolean | recordValuesBoolean |
| date, datetime | recordValuesDate |
| select | recordValuesSelect |
| multi_select | recordValuesMultiSelect |
| rich_text | recordValuesRichText |
| user_ref | recordValuesUserRef |

### Exports
- `ValueTableName` — union type of the 8 table names
- `fieldTypeToTable(fieldType: FieldType): ValueTableName` — pure switch

### Type Source
```typescript
import type { Doc } from "../_generated/dataModel";
type FieldType = Doc<"fieldDefs">["fieldType"];
```

## T-002: `convex/crm/fieldValidation.ts`

### validateFieldValue(fieldDef, value)
Throws `ConvexError` on invalid input. Per-type validation:
- **text, rich_text**: typeof === "string"
- **email**: string + regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **phone**: string + regex `/^\+?[\d\s\-().]{7,20}$/`
- **url**: string + `new URL(value)` try/catch
- **number, currency, percentage**: typeof === "number" && !Number.isNaN
- **boolean**: typeof === "boolean"
- **date, datetime**: typeof === "number" && !isNaN && >= 0 (unix ms timestamp)
- **select**: string + validate against fieldDef.options (if present)
- **multi_select**: Array.isArray + all strings + validate each against fieldDef.options
- **user_ref**: string (WorkOS user subject ID)

### validateRequiredFields(fieldDefs, values)
Filters fieldDefs for `isRequired && isActive`, checks if field name exists in values map. Throws listing all missing required fields.

### Type Source
```typescript
import type { Doc } from "../_generated/dataModel";
type FieldDef = Doc<"fieldDefs">;
```

### Select Option Shape (from schema)
```typescript
// fieldDef.options is optional array of:
{ value: string, label: string, color: string, order: number }
```

### Import Pattern
```typescript
import { ConvexError } from "convex/values";
```

## Existing Code References
- `convex/crm/validators.ts` — exports `fieldTypeValidator` (14 types), `selectOptionValidator`
- `convex/crm/metadataCompiler.ts` — similar pattern of switching on fieldType
