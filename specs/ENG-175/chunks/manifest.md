# ENG-175: Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| chunk-01 | Infrastructure + Core Reversal Logic | T-001 → T-004 | pending |
| chunk-02 | Provider Handlers + Router Registration | T-005 → T-007 | pending |
| chunk-03 | Tests | T-008 → T-010 | pending |

## Execution Order
1. **chunk-01** — Foundation: signature verification, types, internal mutation, shared action handler
2. **chunk-02** — Provider-specific: Rotessa + Stripe httpAction handlers, HTTP router registration
3. **chunk-03** — Tests: core reversal logic, Rotessa-specific, Stripe-specific

## Dependencies
- chunk-02 depends on chunk-01 (uses verification, types, handleReversal)
- chunk-03 depends on chunk-01 + chunk-02 (tests everything)
