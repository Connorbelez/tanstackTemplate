# chunk-01-foundation

- [ ] `T-001` Create `src/routes/demo/crm/route.tsx` as the section shell with header, pill-nav, `ssr: false`, and `Outlet`, following the existing multi-page demo route pattern.
- [ ] `T-002` Create shared CRM demo utilities/types under `src/components/demo/crm/` for route-local state, formatting helpers, and reusable view metadata so the new demo surface does not duplicate logic across tabs.
- [ ] `T-003` Create `src/components/demo/crm/MetricsProvider.tsx` and `src/components/demo/crm/ValidationMetrics.tsx` for sticky read-count/render-time/source-shape metrics shared across the CRM demo.
- [ ] `T-004` Create `convex/demo/crmSandbox.ts` with demo seed/reset helpers for a lead-pipeline walkthrough and any light bootstrap helpers needed by the frontend demo.
