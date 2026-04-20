# Chunk: chunk-04-tests-and-validation

- [x] T-080: Update backend tests for signable generation, failures, access control, and retry behavior.
- [x] T-090: Update lender and admin UI tests for normalized signable states and recipient actions.
- [x] T-100: Add or document e2e or manual verification for the live signing checkpoint.
- [ ] T-900: Run required quality gates.
- [x] T-910: Run `$linear-pr-spec-audit`.
- [x] T-920: Resolve audit findings or record blockers.
  `T-900` remains blocked because the targeted ENG-288 validation commands pass but the full `bun run test` suite is still failing outside the ENG-288 scope, and the manual live-signing checkpoint is still pending.
