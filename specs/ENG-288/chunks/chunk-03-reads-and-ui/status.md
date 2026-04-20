# Status: chunk-03-reads-and-ui

- Result: complete
- Last updated: 2026-04-19 19:24:43 EDT

## Completed tasks
- T-050
- T-060
- T-070

## Validation
- `bun check`: pass
- `bun typecheck`: pass
- `bun run test -- src/test/lender/deal-detail-page.test.tsx`: pass
- `bun run test -- src/test/admin/deal-dedicated-details.test.tsx`: pass

## Notes
- Deal read models now include normalized signing state and recipient eligibility, and both lender/admin deal surfaces show signable rows, recipient chips, refresh actions, and embedded-signing affordances without leaking provider URLs.
