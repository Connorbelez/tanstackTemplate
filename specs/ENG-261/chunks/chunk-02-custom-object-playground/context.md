# ENG-261

## Verbatim Context

> 1. **Create a custom object type** (e.g., "Lead Source") with fields of various types
> 2. **Create records** for that object type via a form

> ### Tab 1: Custom Object Playground
> * **Object Creator:** Form to create a new objectDef (name, icon, fields)
>   * Add fields of different types (text, number, select, date, currency, boolean)
>   * Submit → calls `createObjectDef` + `createFieldDef` mutations
> * **Record Creator:** Dynamic form rendered from fieldDefs
>   * Field inputs rendered based on field type
>   * Submit → calls `createRecord` mutation

> ### ObjectCreator (`src/components/demo/crm/ObjectCreator.tsx`)
> * Object form: name, singularLabel, pluralLabel, icon, description
> * Field adder: repeatable rows with name, label, fieldType dropdown (14 types), isRequired toggle
> * For `select` type: options editor (value, label, color per option)
> * Submit: calls `createObjectDef` then `createFieldDef` per field
> * Object list sidebar: shows existing objectDefs, click to select

> ### DynamicRecordForm (`src/components/demo/crm/DynamicRecordForm.tsx`)
> * Field type → input mapping (all 14 types): text→Input, number→Input(number), currency→Input with $ prefix, percentage→Input with % suffix, boolean→Switch, date→Calendar, select→Select dropdown, multi_select→Combobox, email/phone/url→Input with validation, rich_text→Textarea, user_ref→Select of users

## API Surface

- `api.crm.objectDefs.createObject`
  args: `{ name, singularLabel, pluralLabel, icon, description?, isSystem?, nativeTable? }`
- `api.crm.objectDefs.listObjects`
  returns active object defs ordered by `displayOrder`
- `api.crm.fieldDefs.createField`
  args: `{ objectDefId, name, label, fieldType, description?, isRequired?, isUnique?, defaultValue?, options?, nativeColumnPath?, nativeReadOnly? }`
- `api.crm.fieldDefs.listFields`
  args: `{ objectDefId }`
- `api.crm.records.createRecord`
  args: `{ objectDefId, values }`
- `api.crm.records.updateRecord`
  args: `{ recordId, values }`
- `api.crm.records.deleteRecord`
  args: `{ recordId }`

## Constraints

- No `any` in component props or local state.
- Use WorkOS auth context patterns already established in the app; do not query auth state from Convex directly in React.
- Keep object/field editor logic reusable so the same row editor can be used later by record-sidebar or admin-shell work.
