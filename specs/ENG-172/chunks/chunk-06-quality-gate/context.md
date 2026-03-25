# Chunk 06 Context: Quality Gate & Codegen

## Commands

```bash
# T-021: Lint and format (auto-fixes first, then reports errors)
bun check

# T-022: Type check
bun typecheck

# T-023: Convex codegen
bunx convex codegen

# T-024: Run all cash ledger tests
bun run test convex/payments/cashLedger/
```

## Fix Strategy

1. Run `bun check` first — it auto-fixes formatting and some lint issues.
2. Fix any remaining Biome errors manually (common: top-level regex, unused imports).
3. Run `bun typecheck` — fix type errors.
4. Run `bunx convex codegen` — should be clean if no schema changes were made.
5. Run the full test suite — all existing tests should pass alongside new ones.

## Common Issues

- **Biome: useTopLevelRegex** — Move regex patterns to module scope
- **Biome: noExplicitAny** — Replace `any` with proper types
- **Unused imports** — Remove them
- **BigInt/number mismatches** — Use `safeBigintToNumber()` at Convex query boundaries
