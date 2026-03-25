# ENG-57: Implement obligationMachine definition + state × event matrix test

## Master Task List

- [ ] T-001: Update obligation machine definition (add states, events, guard, context, version)
- [ ] T-002: Create placeholder effects file (`obligationPlaceholders.ts`)
- [ ] T-003: Register new effects in Effect Registry
- [ ] T-004: Update existing obligation effect for backward compatibility
- [ ] T-005: Rename DUE_DATE_REACHED → BECAME_DUE in seed files and integration tests
- [ ] T-006: Rewrite state × event matrix test (6×4 = 24 cases)
- [ ] T-007: Run full validation suite (bun check, typecheck, codegen, tests)
