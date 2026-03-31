# ENG-261

## Verbatim Context

> ### Tab 3: Link Explorer
> * Create link types between objects (custom↔custom, custom↔system, system↔system)
> * Create individual links between records
> * View linked records panel
> * Navigate between linked entities

> ### LinkExplorer (`src/components/demo/crm/LinkExplorer.tsx`)
> * Layout container for link type + link creation + linked records display

> ### LinkTypeCreator (`src/components/demo/crm/LinkTypeCreator.tsx`)
> * Source/target object selectors, link name, cardinality selector
> * Submit calls `createLinkTypeDef`
> * Table of existing link types

> ### LinkCreator (`src/components/demo/crm/LinkCreator.tsx`)
> * Select link type → source record dropdown + target record dropdown
> * "Link" button calls `createRecordLink`
> * Table of existing links for selected type

## Codebase Reality

- Link backend already exists in this workspace:
  - `api.crm.linkTypes.createLinkType`
  - `api.crm.linkTypes.listLinkTypes`
  - `api.crm.recordLinks.createLink`
  - `api.crm.recordLinks.deleteLink`
  - `api.crm.linkQueries.getLinkedRecords`
  - `api.crm.linkQueries.getLinkTypesForObject`
- This means the original placeholder recommendation from the Notion plan is stale for this branch. Link Explorer can be implemented as a working tab.

## Quality Gate

- After this chunk, run:
  - `bun check`
  - `bun typecheck`
  - `bunx convex codegen`
- If any of those fail, keep the chunk open until the failures are fixed or explicitly documented as blockers.
