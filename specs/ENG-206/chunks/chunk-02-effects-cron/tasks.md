# Chunk 02 — Transfer Effects + Cron Alert

## Tasks

- [ ] T-006: Modify `publishTransferConfirmed` to patch dispersal entry → `"disbursed"` with `payoutDate`
- [ ] T-007: Modify `publishTransferFailed` to patch dispersal entry → `"failed"`
- [ ] T-008: Create `checkDisbursementsDue` internalMutation — daily alert
- [ ] T-009: Register disbursement-due cron in `convex/crons.ts`
