# Status: chunk-04-tests-and-validation

- Result: in-progress
- Last updated: 2026-04-19 19:44:56 EDT

## Completed tasks
- T-080
- T-090
- T-100
- T-910
- T-920

## Validation
- `bunx convex codegen`: pass
- `bun check`: pass
- `bun typecheck`: pass
- `bun run test -- convex/payments/__tests__/crons.test.ts`: pass
- `bun run test -- src/test/convex/documents/dealPackages.test.ts`: pass
- `bun run test`: fail (remaining failures are outside ENG-288 and no longer centered on the former cron harness issue)
- `bun run test:e2e`: not-run
- `$linear-pr-spec-audit`: not ready

## Notes
- Targeted signable backend and UI tests pass.
- The Documenso provider now accepts the repo's documented `DOCUMENSO_API_KEY` env name in addition to `DOCUMENSO_API_TOKEN`.
- Live embedded-signing automation remains a manual-only checkpoint because the worktree does not expose a second real non-recipient login for the negative live-signing assertion.
- Final completion remains blocked on the unrelated repo-wide `bun run test` failures, the live manual checkpoint, and the unavailable external CodeRabbit review.
