# Chunk 3 Context: Auth Gate Tests + Final Verification

## Auth middleware (from CLAUDE.md)

All auth checks go through fluent-convex middleware chains:
- `adminMutation` — requires admin role
- `ledgerMutation` — requires authenticated user
- `ledgerQuery` — requires authenticated user

## Test identity (from testUtils.ts)

```typescript
export const LEDGER_TEST_IDENTITY = {
  subject: "test-ledger-user",
  issuer: "https://api.workos.com",
  org_id: FAIRLEND_STAFF_ORG_ID,
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
  user_email: "ledger-test@fairlend.ca",
  user_first_name: "Ledger",
  user_last_name: "Tester",
};
```

## Non-admin identity for testing

```typescript
const NON_ADMIN_IDENTITY = {
  subject: "test-non-admin",
  issuer: "https://api.workos.com",
  org_id: FAIRLEND_STAFF_ORG_ID,
  role: "member",
  roles: JSON.stringify(["member"]),
  permissions: JSON.stringify([]),
  user_email: "member@fairlend.ca",
  user_first_name: "Member",
  user_last_name: "User",
};
```

## convex-test unauthenticated calls

To call without identity, use `t.query(...)` or `t.mutation(...)` directly WITHOUT calling `t.withIdentity(...)`:

```typescript
const t = createTestHarness();
// No auth: call directly on t
try {
  await t.query(api.ledger.queries.getBalance, { accountId: "..." });
  expect.fail("Expected auth rejection");
} catch (error) {
  // Expect auth-related error
}
```

## Admin mutations to test
- `api.ledger.mutations.mintMortgage`
- `api.ledger.mutations.burnMortgage`
- `api.ledger.mutations.postCorrection`
- `api.ledger.mutations.mintAndIssue` (ledgerMutation, not adminMutation — only needs auth)

## Ledger queries to test
- `api.ledger.queries.getBalance`
- `api.ledger.queries.getPositions`
- `api.ledger.queries.getLenderPositions`
- `api.ledger.queries.validateSupplyInvariant`
- `api.ledger.queries.getBalanceAt`
- `api.ledger.queries.getPositionsAt`
- `api.ledger.queries.getAccountHistory`
- `api.ledger.queries.getMortgageHistory`

## Quality check commands (from CLAUDE.md)
```bash
bun check          # Biome lint + format (auto-fixes first)
bun typecheck      # TypeScript strict mode
bunx convex codegen  # Regenerate Convex types
```

## File paths
- Modify: `convex/ledger/__tests__/convenienceMutations.test.ts` (add auth tests) OR create `convex/ledger/__tests__/auth.test.ts`
- Read-only: `convex/ledger/__tests__/testUtils.ts`
