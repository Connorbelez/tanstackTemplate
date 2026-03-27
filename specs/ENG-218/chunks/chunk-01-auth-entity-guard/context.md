# Chunk Context: Auth/Entity Guard

Source: Linear ENG-218 + Notion implementation plan for ENG-218.

## Linear Issue Excerpt (verbatim)

> Tech design foot gun 5: "Confusing lender auth ids with lender entity ids." The codebase bridges auth IDs (stored on ledger accounts) and entity IDs (stored in domain tables). New transfer tables must store canonical entity IDs and only use auth IDs at auth boundaries.
>
> What to Build
> 1. Type-safe ID layer: Ensure `counterpartyId` on transfers always stores domain entity IDs (not auth/WorkOS IDs)
> 2. Validation at boundary: When creating a transfer from an authenticated admin action, resolve auth user → lender entity ID before persisting
> 3. Audit existing code: Check `createDispersalEntries.ts:213` and `auth/resourceChecks.ts:64` patterns for potential confusion
> 4. Add type branding (optional): Use TypeScript branded types (`LenderEntityId` vs `AuthUserId`) to catch misuse at compile time

## Notion Implementation Plan Excerpts (verbatim)

### Goal

> Prevent a class of bugs where WorkOS auth IDs (e.g., `user_01KKFF8EA41DV152KVHD8VJB48`) are accidentally stored in `counterpartyId` fields that should contain domain entity IDs (Convex document IDs like `j571234...`).

### Key Design Decisions

> 1. Runtime validation over branded types — Branded types only help at compile time. Since `counterpartyId` comes from external inputs (admin UI, webhooks), we also need runtime validation that the string looks like a Convex document ID, not a WorkOS auth ID.
> 2. Auth-ID format detection — WorkOS auth IDs follow the pattern `user_01...` (26 chars, base32). Convex document IDs are base64url strings. A simple regex guard can reject auth-ID-shaped strings at the mutation boundary.
> 3. Resolution at auth boundary — The existing `getLenderByAuthId()` in `resourceChecks.ts` already does the correct auth → entity resolution. The issue is ensuring callers use entity IDs downstream.

### File Map

- `convex/payments/transfers/types.ts` — Add branded type aliases for entity IDs vs auth IDs
- `convex/payments/transfers/mutations.ts` — Add validation guard in `createTransferRequest` to reject auth-ID-shaped strings
- `convex/auth/resourceChecks.ts` — Audit only
- `convex/dispersal/createDispersalEntries.ts` — Audit only

### Drift Notes

> `ledger_accounts.lenderId` stores WorkOS auth IDs (used by `getLenderMortgageIds(lenderAuthId)` in `resourceChecks.ts:68`). Meanwhile, `transferRequests.lenderId` stores `Id<"lenders">` (Convex document ID). Same field name, different ID spaces.

### Steps (verbatim intent)

1. Add auth-ID detection utility in `convex/payments/transfers/types.ts`
2. Add validation guard in `createTransferRequest`
3. Add JSDoc on ambiguous `lenderId` fields
4. Add test for auth-ID rejection

## Existing Code Context

- `createTransferRequest` currently accepts `counterpartyId: v.string()` and writes it directly to `transferRequests.counterpartyId`.
- `getLenderByAuthId()` resolves WorkOS auth IDs to `lenders` entities via `users`.
- `createDispersalEntries` normalizes `lenderAuthId` → `lenderId` via `requireLenderIdForAuthId(...)` before writing dispersal rows.

## Constraints

- Keep auth→entity resolution at boundaries; transfer storage must hold domain entity IDs.
- No schema type migration required (`counterpartyId` remains string), runtime guard enforces correctness.
- Follow repo quality gates: `bun check`, `bun typecheck`, `bunx convex codegen`.
