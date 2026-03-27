# Chunk 1: RBAC Foundation

## Tasks
- [x] T-001: Record WorkOS permission registration requirements and deployment prerequisite
- [x] T-002: Add payment permission chains to `convex/fluent.ts`
- [x] T-003: Migrate `createTransferRequest` and `initiateTransfer` to payment permission chains

## Quality Gate
```bash
bun check
bun typecheck
bunx convex codegen
```
