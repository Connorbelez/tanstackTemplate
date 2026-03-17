# Chunk 1 Context: History Queries Hardening & Verification

Source: Linear `ENG-39`, linked Notion implementation plan, `SPEC 1.3 — Mortgage Ownership Ledger`, `REQ-72`, upstream `ENG-24`, downstream `ENG-42`, and current repo inspection.

## Goal

Finish the actual remaining work for `ENG-39` on this branch. The key repo drift is that both history queries and several history-query tests already exist, but the default-limit requirement from the Linear issue is still not implemented.

## Linear Issue Excerpt

```md
Implement paginated history queries as `authedQuery` functions:

### getAccountHistory(accountId, opts)

* Journal entries where debitAccountId or creditAccountId = accountId
* Optional from/to timestamp filters
* Paginated with limit (default 100)
* Ordered by timestamp ascending

### getMortgageHistory(mortgageId, opts)

* Journal entries for a mortgage
* Optional from/to timestamp filters
* Paginated with limit (default 100)
* Ordered by timestamp ascending
```

```md
## Acceptance Criteria

- [ ] getAccountHistory: returns paginated entries for an account, filtered by time range
- [ ] getMortgageHistory: returns paginated entries for a mortgage, filtered by time range
- [ ] Both support from/to timestamp filtering
- [ ] Both default to limit=100 with pagination support
- [ ] Both use appropriate indexes (by_debit_account, by_credit_account, by_mortgage_and_time)
- [ ] Both are authedQuery (require authentication)
- [ ] Tests: pagination, time range filtering, ordering
```

## Notion Implementation Plan Excerpt

```md
## 1. Status Assessment
**Both queries are already implemented** in `convex/ledger/queries.ts` (lines 248–324). The implementation uses `ledgerQuery` middleware (requires auth + `ledger:view` permission) and queries appropriate indexes. The remaining work is:
1. **Fix default limit** — AC requires `limit=100` default; current code has no default
2. **Write test suite** — No tests exist for either history query
```

```md
### 3a. Default Limit — NEEDS FIX
**Current code:** No default — if `limit` is omitted, all entries are returned
**Action:** Apply `args.limit ?? 100` as the effective limit. This is critical for REQ-72 compliance — 6-year retention means unbounded queries could return massive result sets.
```

## Repo Drift That Must Override the Stale Plan

- `convex/ledger/queries.ts` already exports both `getAccountHistory` and `getMortgageHistory`.
- `convex/ledger/__tests__/ledger.test.ts` already contains history-query coverage:
  - `T-069: getMortgageHistory returns entries in sequence order`
  - `T-070: getAccountHistory returns entries touching an account`
  - `T-069b: getMortgageHistory filters by from/to date range`
  - `T-069c: getMortgageHistory respects limit`
  - `T-070b: getAccountHistory filters by from/to date range`
- The Notion plan says the tests are missing and should be added to `queries.test.ts`; that is stale. Work against `ledger.test.ts` unless repo inspection shows a better local convention while implementing.

## Current Repo Facts

### `convex/ledger/queries.ts`

```ts
export const getAccountHistory = ledgerQuery
  .input({
    accountId: v.id("ledger_accounts"),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  })
  .handler(async (ctx, args) => {
    const lo = args.from ?? 0;
    const hi = args.to ?? Number.MAX_SAFE_INTEGER;
    // query by_debit_account and by_credit_account
    // merge + deduplicate + sort by sequenceNumber
    if (args.limit) {
      return unique.slice(0, args.limit);
    }
    return unique;
  })
  .public();
```

```ts
export const getMortgageHistory = ledgerQuery
  .input({
    mortgageId: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  })
  .handler(async (ctx, args) => {
    const lo = args.from ?? 0;
    const hi = args.to ?? Number.MAX_SAFE_INTEGER;
    // query by_mortgage_and_time
    // sort by sequenceNumber
    if (args.limit) {
      return entries.slice(0, args.limit);
    }
    return entries;
  })
  .public();
```

### Existing History Tests in `convex/ledger/__tests__/ledger.test.ts`

```ts
it("T-069: getMortgageHistory returns entries in sequence order", async () => { ... });
it("T-070: getAccountHistory returns entries touching an account", async () => { ... });
it("T-069b: getMortgageHistory filters by from/to date range", async () => { ... });
it("T-069c: getMortgageHistory respects limit", async () => { ... });
it("T-070b: getAccountHistory filters by from/to date range", async () => { ... });
```

## Relevant Spec / Goal Excerpts

```md
getAccountHistory(accountId: string, opts?: { from?, to?, limit? }): JournalEntry[]
getMortgageHistory(mortgageId: string, opts?: { from?, to?, limit? }): JournalEntry[]
```

```md
The mortgage ownership ledger is a pure primitive: tracks who owns what fraction of each mortgage, and when that changed.
...
Records retained 6 years after agreement expiry
Electronic records permitted if promptly retrievable in legible format
```

## Integration Points

### Upstream `ENG-24` (Done)

```md
`journalEntries` table ... Indexes: by_idempotency, by_mortgage_and_time, by_sequence, by_debit_account, by_credit_account, by_entry_type
```

These indexes are already present and are the required contract for this issue.

### Downstream `ENG-42`

```md
Working history queries for full Definition of Done checklist
Contract: Both queries return paginated, time-filtered, sequence-ordered journal entries
```

`ENG-39` should leave those query contracts stable for the downstream verification pass.

## Constraints

- Run `bun check` before hand-fixing lint or formatting issues.
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass before considering the issue complete.
- Do not introduce `any`.
- Preserve `ledgerQuery` auth/permission middleware; the issue contract requires authenticated access.
- Keep the existing index-backed query strategy:
  - `getAccountHistory` merges `by_debit_account` and `by_credit_account`
  - `getMortgageHistory` uses `by_mortgage_and_time`
- Preserve deterministic ascending `sequenceNumber` ordering after collection.

## Implementation Bias

The smallest coherent implementation is:

1. Add `const effectiveLimit = args.limit ?? 100` in both history queries.
2. Return sliced results using that default.
3. Extend the current `ledger.test.ts` coverage just enough to lock the default-limit behavior in place and close any remaining acceptance-criteria gaps without moving tests to a new file unless there is a strong repo-local reason.
