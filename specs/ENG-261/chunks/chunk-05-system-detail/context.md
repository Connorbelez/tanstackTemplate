# ENG-261

## Verbatim Context

> 6. **Switch to a system object** (e.g., Mortgages) and see native Convex table data rendered through the *same* table/sidebar/page components via the system adapter

> ### Tab 2: System Adapter Playground
> * **Object Selector:** Dropdown of system objects (Mortgages, Lenders, Borrowers, Deals)
> * **Native Record Table:** Same table component, but data comes from system adapter
> * **Native Record Sidebar:** Same sidebar component, data from native table
> * **Side-by-Side Comparison:** Visual indicator showing query source (EAV vs native) and read count

> ### SystemAdapterTab (`src/components/demo/crm/SystemAdapterTab.tsx`)
> * Object selector: dropdown of system objects (objectDefs where isSystem=true)
> * Native Record Table: same RecordTable component, data from system adapter transparently
> * Native Record Sidebar: same RecordSidebar, data from native table
> * Source indicator badge: "Native Adapter" vs "EAV Storage"

## Codebase Reality

- `api.crm.recordQueries.queryRecords` already routes system objects through the native adapter and returns `UnifiedRecord` with `_kind: "native"`.
- `api.crm.recordQueries.getRecord` currently throws for system objects with the message `getRecord for system objects not yet supported — use queryRecords instead`.
- `api.crm.recordQueries.searchRecords` returns `[]` for system objects.
- `api.crm.viewQueries.queryViewRecords` does not route system objects through the native adapter.

## Planning Implication

- This chunk must either add a native-detail query path or introduce a new record-reference-based detail query that supports both `record` and `native` kinds.
- The system tab should be built on `queryRecords`, not `queryViewRecords`, unless backend view parity is expanded as part of the same chunk.
