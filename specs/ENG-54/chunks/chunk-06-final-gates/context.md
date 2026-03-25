# Chunk 6 Context: Final Quality Gates

## Quality Gate Commands
1. `bun run test` — full test suite, all tests must pass
2. `bun check` — Biome lint + format, auto-fixes then reports remaining errors
3. `bun typecheck` — TypeScript type checking
4. `bunx convex codegen` — regenerate Convex types, must be current

## DoD Verification Report Format
For each of the 18 acceptance criteria, document:
- ✅ **Pass** — verified, no issues
- ⚠️ **Issue Found** — verified, issue found and fixed in-place
- ❌ **Fail** — issue found, not fixable / requires follow-up

### 18 Acceptance Criteria:
1. Machine definition matches SPEC section 3.1
2. State × event matrix: all 77 cases pass
3. Compound state round-trips: all 11 states
4. Happy path end-to-end
5. Cancellation from every non-terminal phase
6. Reservation → commit deterministic
7. All effects idempotent
8. Prorate math correct including zero-day
9. Kanban renders correctly
10. dealAccess gates queries
11. Audit trail complete
12. Schema matches SPEC section 6
13. File structure matches SPEC section 2
14. Zero direct status patches outside Transition Engine
15. Backward compatibility with flat-state machines
16. ENG-52 PR #116 merged to main
17. Zero-day prorate boundary tests passing (not skipped)
18. Playwright e2e tests for deal closing kanban

### Note on AC #18 (Playwright E2E Tests)
The implementation plan includes Playwright e2e tests but these require a running dev server and seeded data. This may be out of scope for automated verification — document as ⚠️ if not runnable in CI without a dev server, and note what would be needed.

## Workflow Reminder
- Always run `bun check` BEFORE trying to fix linting/formatting errors (it auto-fixes many issues)
- Run `coderabbit review --plain` as final code review (from CLAUDE.md workflow section) — but only if significant code changes were made
