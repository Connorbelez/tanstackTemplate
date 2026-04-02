# ENG-228 Context

## Issue
- Linear issue: `ENG-228` - Admin Shell — Layout, Navigation & Entity Registry.
- Required outcomes:
  - Shared admin layout with sidebar, breadcrumb trail, and content outlet.
  - Sidebar navigation generated from a type-safe entity registry.
  - Mobile/collapsible behavior using the existing sidebar primitive.
  - Breadcrumbs that reflect admin entity routes.
  - Existing `/admin/deals` route must continue to work inside the shell.
  - `guardPermission("admin:access")` remains enforced at the `/admin` layout level.

## Confirmed dependencies
- `ENG-253` is done and establishes future CRM/view-engine contracts for entity table surfaces.
- `ENG-256` is done and establishes system objects for mortgages, borrowers, lenders, brokers, deals, and obligations.
- Downstream shell issues (`ENG-230`, `ENG-231`, `ENG-232`) depend on a stable registry contract for labels, routes, icons, and navigation grouping.

## Current repo drift
- `src/components/admin/shell/DashboardShell.tsx` exists, but the canonical shell should be `AdminLayout`.
- `src/components/admin/shell/AdminNavigation.tsx` still contains demo teams, placeholder sections, and hardcoded lorem-ish nav data.
- `src/components/admin/shell/AdminBreadcrumbs.tsx` only maps raw path segments and falls back to `Record {id}` for detail routes.
- There is no `src/components/admin/shell/entity-registry.ts`.
- `/admin` currently wraps children in `DashboardShell` and keeps `parseAdminDetailSearch`, but its `beforeLoad` implementation is not calling the returned permission guard correctly.

## Constraints
- Reuse existing primitives from `src/components/ui/sidebar.tsx` and `src/components/ui/breadcrumb.tsx`.
- Keep the entity registry strongly typed. Do not introduce `any`.
- Preserve typed admin search validation in `src/routes/admin/route.tsx`.
- Support both entity-backed routes and generic operations/platform routes in breadcrumbs and navigation shape.
- Listings are a first-class admin entity. Properties are not part of the initial registry even though a placeholder route exists.

## Planned implementation contract
- Introduce typed definitions for:
  - `AdminEntityDomain`
  - `AdminDomainDefinition`
  - `AdminEntityDefinition`
  - `AdminNavigationItem`
  - `AdminNavigationSection`
- Export helpers for:
  - entity lookup by type and route
  - navigation section building
  - route matching
- Canonical shell should:
  - provide sidebar + top bar + content area
  - include `SidebarTrigger` for mobile and collapsed desktop usage
  - show breadcrumbs on the left and a user menu on the right
- Navigation should:
  - group entities by domain
  - highlight the active route
  - use the registry for labels/routes/icons
- Breadcrumbs should:
  - map entity segments through the registry
  - gracefully handle unknown non-entity segments
  - avoid duplicating entity labels outside the registry
