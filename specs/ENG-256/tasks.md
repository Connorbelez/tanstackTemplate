# ENG-256: System Object Bootstrapping — Master Task List

## Chunk 1: Bootstrap Core (`convex/crm/systemAdapters/bootstrap.ts`) ✅

- [x] T-001: Define `SystemObjectConfig` type with fields for name, labels, icon, nativeTable, and field array
- [x] T-002: Define `SYSTEM_OBJECT_CONFIGS` const array with all 6 native entity definitions (mortgage, borrower, lender, broker, deal, obligation) including field mappings and select options from actual machine states
- [x] T-003: Implement `bootstrapSystemObjects` as `internalMutation({ args: { orgId: v.string() } })` — idempotent: checks by_org_name before inserting objectDefs, creates fieldDefs with nativeColumnPath + nativeReadOnly:true, runs deriveCapabilities, creates default table view + viewFields
- [x] T-004: Implement `adminBootstrap` as a public mutation via `crmAdminMutation` that calls bootstrapSystemObjects with the caller's orgId, plus audit event

## Chunk 2: Webhook Integration + Quality Gate ✅

- [x] T-005: Modify `convex/auth.ts` — in `organization.created` handler, schedule `bootstrapSystemObjects` via `ctx.scheduler.runAfter(0, ...)` after `upsertOrganization`
- [x] T-006: Run `bunx convex codegen`, `bun check`, `bun typecheck` and fix any issues
