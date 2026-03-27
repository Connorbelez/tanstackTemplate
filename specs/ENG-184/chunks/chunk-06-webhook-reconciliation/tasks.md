# Chunk 6: Webhook & Reconciliation

## Tasks
- [ ] T-020: Create `convex/payments/webhooks/vopay.ts`
- [ ] T-021: Add VoPay signature verification in `convex/payments/webhooks/verification.ts`
- [ ] T-022: Add `/webhooks/pad_vopay` route in `convex/http.ts`
- [ ] T-023: Create `convex/payments/transfers/reconciliation.ts`
- [ ] T-024: Wire reconciliation cron in `convex/crons.ts`

## Quality Gate
```bash
bunx convex codegen
bun check
bun typecheck
```
