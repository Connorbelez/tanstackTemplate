# ENG-174: Payout Hold Period Enforcement — Master Task List

## Status: Complete

## Chunk 1: Utilities & Config (chunk-01-utilities)
- [x] T-001: Create business day utility (`convex/lib/businessDays.ts`)
- [x] T-002: Create hold period configuration (`convex/dispersal/holdPeriod.ts`)
- [x] T-003: Unit tests for business day utility
- [x] T-004: Unit tests for hold period config

## Chunk 2: Schema & Backend Integration (chunk-02-schema-backend)
- [x] T-005: Extend `dispersalStatusValidator` to union
- [x] T-006: Add `payoutEligibleAfter`, `paymentMethod` fields + `by_eligibility` index to schema
- [x] T-007: Update `DispersalEntry` type interface in `types.ts`
- [x] T-008: Update `createDispersalEntries` to resolve payment method and set hold fields
- [x] T-009: Add `getPayoutEligibleEntries` query to `queries.ts`
- [x] T-010: Run codegen, lint, typecheck — final quality gate
