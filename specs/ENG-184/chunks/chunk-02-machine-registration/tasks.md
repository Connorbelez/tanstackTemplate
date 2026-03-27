# Chunk 2: State Machine & Registration

## Tasks
- [ ] T-004: Create `convex/engine/machines/transfer.machine.ts`
- [ ] T-005: Add `"transfer"` to `EntityType` and `GovernedEntityType` in `convex/engine/types.ts`
- [ ] T-006: Add `transfer: "transferRequests"` to `ENTITY_TABLE_MAP` in `convex/engine/types.ts`
- [ ] T-007: Add `v.literal("transfer")` to `entityTypeValidator` in `convex/engine/validators.ts`
- [ ] T-008: Import and register `transferMachine` in `convex/engine/machines/registry.ts`

## Quality Gate
```bash
bunx convex codegen
bun check
bun typecheck
```
