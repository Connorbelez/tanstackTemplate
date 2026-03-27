# Chunk 3: Rotessa PAD Skeleton and Tests

## Tasks
- [x] T-007: Create `convex/payments/webhooks/rotessaPad.ts` as the transfer-domain skeleton for `POST /webhooks/pad_rotessa`, reusing Rotessa signature verification, persisting raw events before acknowledgement, and keeping provider-specific placeholder status mapping inside the Rotessa file.
- [x] T-008: Register `POST /webhooks/pad_rotessa` in `convex/http.ts` while keeping the existing legacy `/webhooks/rotessa` reversal route intact for current collection-attempt flows.
- [x] T-009: Expand webhook tests to cover shared persistence/idempotency behavior, VoPay PAD/EFT transfer processing paths, and the Rotessa PAD skeleton without regressing the existing reversal-only tests.
- [x] T-010: Run the repo quality gate for this issue: `bun check`, `bun typecheck`, and `bunx convex codegen`.

## Quality Gate
```bash
bun check
bun typecheck
bunx convex codegen
```
