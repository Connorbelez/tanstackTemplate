# Chunk 01 — Schema & Machine Definition

- [ ] T-001: Run `bun add xstate@^5` to install XState v5. Verify v5 is installed via `cat package.json | grep xstate`. After installing, run `bunx convex codegen` to verify XState imports work in the Convex runtime.
- [ ] T-002: Add `demo_gt_entities`, `demo_gt_journal`, `demo_gt_effects_log` table definitions to `convex/schema.ts` in the demo tables section. Copy exact validators from the context below.
- [ ] T-003: Create `convex/demo/machines/` directory. Create `convex/demo/machines/loanApplication.machine.ts` — the complete XState v5 machine definition. MUST have zero Convex imports, only `import { setup } from "xstate"`. Copy the full machine from context below.
- [ ] T-004: Run `bunx convex codegen` to validate schema compiles. If it fails, check that schema validators match the exact patterns from context.
