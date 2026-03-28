# ENG-208 — Implement Locking Fee Collection Flow

## Master Task List

### Chunk 1: Schema + Backend Implementation
- [x] T-001: Add `lockingFeeAmount` field to deals table schema
- [x] T-002: Implement `collectLockingFee` effect in `dealClosingEffects.ts`
- [x] T-003: Register `collectLockingFee` in effect registry
- [x] T-004: Add `collectLockingFee` action to deal machine's `DEAL_LOCKED` transition

### Chunk 2: Tests
- [x] T-005: Write unit tests for the locking fee collection flow
