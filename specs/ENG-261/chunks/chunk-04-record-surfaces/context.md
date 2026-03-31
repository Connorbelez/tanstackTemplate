# ENG-261

## Verbatim Context

> 4. **Click a row → sidebar sheet** showing the full record with tabbed details
> 5. **Click through to a full page** showing the record in a full-page layout
> 7. **Create links** between records (e.g., Lead Source → Mortgage) and see them in a relations panel

> ### Record Sidebar
> * Details tab: field values displayed via cell renderers
> * Relations tab: linked records (if any links created)
> * History tab: audit trail entries for this record

> ### RecordSidebar (`src/components/demo/crm/RecordSidebar.tsx`)
> * Uses `src/components/ui/sheet.tsx` (SheetContent side="right", ~480px)
> * Header: object icon + record labelValue + status badge + "Open Full Page" link
> * Tabs (line variant): Details, Relations, History

> ### Goal
> Build the two frontend components that bring the polymorphic link system and audit trail to life in the UI: a **Linked Records Panel** that groups related entities by link type with add/remove actions, and an **Activity Timeline** showing chronological audit events with field diffs.

## API Surface

- `api.crm.recordQueries.getRecord`
  args: `{ recordId }`
  returns `{ record, links: { outbound, inbound } }` for EAV records
- `api.crm.linkQueries.getLinkedRecords`
  args: `{ recordId, recordKind, direction? }`
- `api.crm.linkQueries.getLinkTypesForObject`
  args: `{ objectDefId }`
- `api.crm.recordLinks.createLink`
  args: `{ linkTypeDefId, sourceKind, sourceId, targetKind, targetId }`
- `api.crm.recordLinks.deleteLink`
  args: `{ linkId }`

## Constraints

- Build sidebar navigation so clicking a related record can either replace sidebar content or route to full-page detail.
- The frontend should use a thin CRM audit query wrapper instead of directly coupling components to the audit-log component API.
- Keep relations/history components demo-local under `src/components/demo/crm/`, not admin-shell paths.
