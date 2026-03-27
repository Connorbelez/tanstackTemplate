# ENG-218: Guard Against Lender Auth-ID / Entity-ID Confusion — Master Task List

## Phase 1: Transfer ID-Safety Guard
- [x] T-001: Add transfer-domain ID safety helpers in `convex/payments/transfers/types.ts` (branded aliases + WorkOS auth-ID detector).
- [x] T-002: Enforce `counterpartyId` runtime validation in `convex/payments/transfers/mutations.ts` so auth-ID-shaped values are rejected before persistence.
- [x] T-003: Add/extend transfer mutation tests in `convex/payments/transfers/__tests__/mutations.test.ts` to prove auth-ID detection and rejection behavior.

## Phase 2: ID-Space Documentation & Audit Hardening
- [x] T-004: Add explicit ID-space docs where confusion is likely (`convex/schema.ts`, `convex/auth/resourceChecks.ts`) to distinguish auth IDs vs entity IDs.
- [x] T-005: Audit `convex/dispersal/createDispersalEntries.ts` and `convex/auth/resourceChecks.ts` for boundary resolution correctness and preserve auth→entity conversion at auth boundaries only.

## Phase 3: Quality Gate
- [ ] T-006: Run `bun check`, `bun typecheck`, and `bunx convex codegen` and resolve any issues.
