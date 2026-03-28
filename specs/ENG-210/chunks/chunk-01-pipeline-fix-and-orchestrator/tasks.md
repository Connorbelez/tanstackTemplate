# Chunk 01: Pipeline lenderId Fix + Principal Return Module

## Tasks

- [ ] T-001: Add `lenderId` to `DealClosingLeg1Metadata` in `pipeline.types.ts`
- [ ] T-002: Update `extractLeg1Metadata` to extract and validate `lenderId`
- [ ] T-003: Add `lenderId` arg to `createDealClosingPipeline` and store in Leg 1 metadata
- [ ] T-004: Add `lenderId` arg to `createAndInitiateLeg2` and pass to `createTransferRequestInternal`
- [ ] T-005: Update `handlePipelineLegConfirmed` to extract and pass `lenderId` to Leg 2 scheduler call
- [ ] T-006: Update `startDealClosingPipeline` to pass `deal.lenderId` to pipeline
- [ ] T-007: Create `principalReturn.logic.ts` with `computeProrationAdjustedAmount` pure function
- [ ] T-008: Create `principalReturn.ts` with `createPrincipalReturn` internal action orchestrator
- [ ] T-009: Add `returnInvestorPrincipal` admin action to `mutations.ts`
