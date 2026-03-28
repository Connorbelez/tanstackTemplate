# ENG-210: Implement Investor Principal Return Flow

## Master Task List

### Chunk 1: Pipeline lenderId Fix + Principal Return Module

- [x] T-001: Add `lenderId` to `DealClosingLeg1Metadata` in `pipeline.types.ts`
- [x] T-002: Update `extractLeg1Metadata` to extract and validate `lenderId`
- [x] T-003: Add `lenderId` arg to `createDealClosingPipeline` and store in Leg 1 metadata
- [x] T-004: Add `lenderId` arg to `createAndInitiateLeg2` and pass to `createTransferRequestInternal`
- [x] T-005: Update `handlePipelineLegConfirmed` to extract and pass `lenderId` to Leg 2 scheduler call
- [x] T-006: Update `startDealClosingPipeline` to pass `deal.lenderId` to pipeline
- [x] T-007: Create `principalReturn.logic.ts` with `computeProrationAdjustedAmount` pure function
- [x] T-008: Create `principalReturn.ts` with `createPrincipalReturn` internal action orchestrator
- [x] T-009: Add `returnInvestorPrincipal` admin action to `mutations.ts`

### Chunk 2: Tests

- [x] T-010: Unit tests for `computeProrationAdjustedAmount` in `principalReturn.logic.test.ts`
- [x] T-011: Integration/unit tests for `createPrincipalReturn` and `returnInvestorPrincipal` in `principalReturn.test.ts`
