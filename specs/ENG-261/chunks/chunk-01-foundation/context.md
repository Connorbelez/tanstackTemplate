# ENG-261

## Verbatim Context

> Build a vertical integration demo that exercises the full EAV-CRM stack end-to-end: control plane → data plane → queries → view engine → system adapters → UI rendering. This catches integration mismatches between the `UnifiedRecord` shape and frontend rendering *before* production code depends on it.

> - [ ] Validation metrics panel shows read counts and render times
> - [ ] EAV query: ≤275 reads for 25 records × 10 fields
> - [ ] Native query: ≤30 reads for 25 records
> - [ ] Demo route accessible at `/demo/crm/`
> - [ ] `bun check` and `bun typecheck` pass

> ### Step 1: Create route layout and navigation
> - **File(s):** `src/routes/demo/crm/route.tsx`
> - **Details:**
>   - `createFileRoute("/demo/crm")` with `ssr: false`
>   - Layout component with title ("EAV-CRM Integration Sandbox"), description, tab nav
>   - 3 tabs: Custom Objects (`/demo/crm`), System Adapters (`/demo/crm/system`), Link Explorer (`/demo/crm/links`)
>   - Follow `audit-traceability/route.tsx` pattern: NAV_ITEMS array, pill nav, `<Outlet />`
>   - Icons from lucide-react: `Database`, `Server`, `Link2`

> ### Step 2: Create demo backend helpers
> - **File(s):** `convex/demo/crmSandbox.ts`
> - **Details:**
>   - `seedLeadPipeline` mutation: creates "Lead" object with fields (company_name: text, status: select, deal_value: currency, next_followup: date, is_qualified: boolean, email: email) + creates 5 sample records
>   - `resetCrmDemo` mutation: deletes all demo-created objectDefs/records (by org or naming convention)

## Codebase Reality

- Follow the section-route pattern used by `src/routes/demo/document-engine/route.tsx` and `src/routes/demo/audit-traceability/route.tsx`.
- Use `src/components/demo-layout.tsx` only for single-page demos; `/demo/crm` should be a nested section with child routes.
- Shared UI primitives already exist for `tabs`, `table`, `sheet`, `badge`, `card`, `input`, `select`, `switch`, `calendar`, and `combobox`.
- The CRM backend already exposes object, field, record, view, link-type, link, and system-bootstrap operations; this chunk does not need to invent those APIs.
