# Unified Payment Rails Technical Design

## Goal

Build a provider-agnostic transfer rail that handles all platform money movement through one domain contract, one governed transfer lifecycle, and one ledger-facing settlement bridge.

This design is intentionally grounded in the current codebase, not just the product goal. It identifies the current borrower-collection implementation, the adjacent deal/dispersal/ledger systems already in place, and the migration path required to make inbound collections, outbound disbursements, and multi-leg closing transfers financially correct.

## Current Baseline In Repo

### What already exists

- Borrower collection strategy abstraction exists as `PaymentMethod` in [convex/payments/methods/interface.ts](../../convex/payments/methods/interface.ts).
- Two implementations exist today:
  - `ManualPaymentMethod` in [convex/payments/methods/manual.ts](../../convex/payments/methods/manual.ts)
  - `MockPADMethod` in [convex/payments/methods/mockPAD.ts](../../convex/payments/methods/mockPAD.ts)
- Runtime method lookup exists in [convex/payments/methods/registry.ts](../../convex/payments/methods/registry.ts).
- Collection attempts are already modeled as a governed entity with a lifecycle in [convex/engine/machines/collectionAttempt.machine.ts](../../convex/engine/machines/collectionAttempt.machine.ts).
- Collection attempt effects already fan out to obligations and retry rules in [convex/engine/effects/collectionAttempt.ts](../../convex/engine/effects/collectionAttempt.ts).
- Obligation settlement already schedules lender dispersal creation in [convex/engine/effects/obligation.ts](../../convex/engine/effects/obligation.ts).
- Dispersal creation already exists in [convex/dispersal/createDispersalEntries.ts](../../convex/dispersal/createDispersalEntries.ts).
- Deal closing already has a governed state machine in [convex/engine/machines/deal.machine.ts](../../convex/engine/machines/deal.machine.ts), and ownership reroute side effects in [convex/engine/effects/dealClosingPayments.ts](../../convex/engine/effects/dealClosingPayments.ts).
- Ledger writes already flow through a single validated write path, `postEntry`, in [convex/ledger/postEntry.ts](../../convex/ledger/postEntry.ts).

### What does not exist yet

- A transfer abstraction that handles both inbound and outbound money movement.
- A provider registry keyed by transfer type plus direction.
- Bank account validation / mandate lifecycle as a first-class prerequisite for PAD/EFT.
- A real provider webhook ingestion layer for transfer settlement.
- A cash ledger distinct from the current ownership ledger.
- A multi-leg deal closing transfer orchestrator that moves actual cash, not just future payout routing.

### Important architectural truth

The repo currently has:

- A borrower collection execution model.
- A lender dispersal allocation model.
- A mortgage ownership ledger.
- A deal-closing ownership reroute mechanism.

It does **not** currently have a unified cash movement domain model. The proposed goal therefore spans multiple existing bounded contexts and must not be implemented as a thin extension of `PaymentMethod`.

## Design Principles

- Use one canonical `TransferRequest` contract for all rails.
- Separate transfer execution from obligation semantics and from ownership accounting.
- Treat provider callbacks as untrusted, replayable, and eventually consistent.
- Treat ledger posting as the consequence of confirmed settlement, not provider initiation.
- Preserve append-only financial records and derive corrections through compensating entries, never mutation-in-place.
- Make idempotency explicit at every boundary: request creation, provider initiation, webhook handling, ledger posting, and downstream effects.

## Proposed Domain Model

### Core entity: `transferRequests`

Create a new table, tentatively `transferRequests`, with governed-transition fields plus domain fields:

- `status`: governed state
- `machineContext`: provider and retry context
- `direction`: `"inbound" | "outbound"`
- `transferType`: taxonomy value
- `amount`: integer cents
- `currency`: `"CAD"`
- `providerKey`: resolved provider implementation key
- `providerRef`: optional external provider reference
- `providerStatus`: optional normalized provider status
- `counterpartyType`: `"borrower" | "lender" | "investor" | "trust" | "seller" | "buyer"`
- `counterpartyId`: canonical FairLend entity identifier
- `sourceBankAccountId`: optional internal bank account record
- `destinationBankAccountId`: optional internal bank account record
- `references`: object holding related ids such as `mortgageId`, `obligationId`, `dealId`, `dispersalEntryId`, `collectionPlanEntryId`, `collectionAttemptId`
- `idempotencyKey`: canonical dedupe key for the business operation
- `providerInitiationKey`: optional provider-specific dedupe key
- `settledAmount`: optional cents
- `failureCode`: optional normalized code
- `failureReason`: optional human-readable reason
- `initiatedAt`, `confirmedAt`, `failedAt`, `reversedAt`
- `source`: same provenance structure already used by the engine and ledger
- `metadata`

### Supporting entity: `bankAccounts`

Introduce a first-class bank account store rather than burying bank details in provider-specific metadata:

- `ownerType`, `ownerId`
- `institutionName`
- `accountLast4`
- `routingFingerprint` / `transitFingerprint`
- `country`
- `currency`
- `status`: `"pending_validation" | "validated" | "revoked" | "rejected"`
- `validationMethod`: `"manual" | "micro_deposit" | "provider_verified"`
- `mandateStatus`: `"not_required" | "pending" | "active" | "revoked"`
- `providerProfiles`: keyed provider metadata
- `isDefaultInbound`
- `isDefaultOutbound`

### Supporting entity: `transferWebhooks`

Persist every inbound provider callback before processing:

- `providerKey`
- `externalEventId`
- `signatureVerified`
- `receivedAt`
- `payload`
- `normalizedEventType`
- `processingStatus`
- `transferRequestId`

This creates a replay-safe audit trail and a dedupe barrier.

## Canonical Contract

Replace the current borrower-only `InitiateParams` contract with a new transfer contract. The current interface in [convex/payments/methods/interface.ts](../../convex/payments/methods/interface.ts) is too collection-specific because it hardcodes `borrowerId`, `mortgageId`, and `planEntryId`.

```ts
export interface TransferRequestInput {
  direction: "inbound" | "outbound";
  transferType: TransferType;
  amount: number; // safe-integer cents
  currency: "CAD";
  counterparty: {
    entityType: "borrower" | "lender" | "investor" | "trust" | "seller" | "buyer";
    entityId: string;
    bankAccountId?: Id<"bankAccounts">;
  };
  settlementAccount: {
    entityType: "trust";
    entityId: string;
    bankAccountId?: Id<"bankAccounts">;
  };
  references: {
    mortgageId?: Id<"mortgages">;
    obligationId?: Id<"obligations">;
    dealId?: Id<"deals">;
    collectionPlanEntryId?: Id<"collectionPlanEntries">;
    collectionAttemptId?: Id<"collectionAttempts">;
    dispersalEntryId?: Id<"dispersalEntries">;
  };
  providerHint?: string;
  idempotencyKey: string;
  source: CommandSource;
  metadata?: Record<string, unknown>;
}
```

Provider implementations should then satisfy:

```ts
export interface TransferProvider {
  initiate(input: TransferRequestInput): Promise<{
    providerRef: string;
    providerStatus: "submitted" | "pending" | "confirmed";
  }>;
  confirm(providerRef: string): Promise<{
    providerRef: string;
    settledAt: number;
    settledAmount?: number;
    providerData?: Record<string, unknown>;
  }>;
  cancel(providerRef: string): Promise<{ cancelled: boolean }>;
  getStatus(providerRef: string): Promise<{
    status: string;
    providerData?: Record<string, unknown>;
  }>;
}
```

## Transfer Type Taxonomy

Use an explicit taxonomy, because direction alone is insufficient for accounting and provider routing.

### Inbound

- `borrower_interest_collection`
- `borrower_principal_collection`
- `borrower_late_fee_collection`
- `borrower_arrears_cure`
- `locking_fee_collection`
- `commitment_deposit_collection`
- `deal_principal_transfer`

### Outbound

- `lender_dispersal_payout`
- `lender_principal_return`
- `deal_seller_payout`
- `trust_refund`
- `provider_reversal_outbound`

The transfer type, not the provider, must drive ledger mapping and downstream domain effects.

## State Machine

Create a new governed transfer machine instead of overloading `collectionAttempt`.

Recommended states:

- `pending`
- `initiated`
- `processing`
- `confirmed`
- `failed`
- `cancelled`
- `reversed`

Recommended events:

- `INITIATE`
- `PROVIDER_ACKNOWLEDGED`
- `PROCESSING`
- `FUNDS_SETTLED`
- `FUNDS_FAILED`
- `CANCELLED`
- `REVERSED`

### Why a new machine is required

The existing collection attempt machine in [convex/engine/machines/collectionAttempt.machine.ts](../../convex/engine/machines/collectionAttempt.machine.ts) is tightly shaped around borrower collection retries:

- It assumes retry scheduling semantics.
- It emits `PAYMENT_APPLIED` to obligations as its core success side effect.
- It represents only a subset of transfer outcomes.

Outbound lender payouts and deal seller payouts have materially different failure handling and should not inherit collection-plan semantics.

## Provider Registry

Replace method-name lookup with a capability registry:

```ts
type ProviderCapabilityKey = `${TransferType}:${Direction}`;
```

Registry responsibilities:

- resolve enabled providers for a transfer capability
- validate provider supports required bank account / mandate prerequisites
- choose provider via config, priority, and provider health
- produce a concrete provider instance through DI

Suggested module split:

- `convex/payments/transfers/interface.ts`
- `convex/payments/transfers/providers/manual.ts`
- `convex/payments/transfers/providers/vopayPad.ts`
- `convex/payments/transfers/providers/vopayEft.ts`
- `convex/payments/transfers/providers/rotessaPad.ts`
- `convex/payments/transfers/providers/registry.ts`

Do not mutate the existing `PaymentMethod` registry into a kitchen sink. It is simpler and safer to create a new transfer provider layer and then bridge the existing collection attempt flow into it during migration.

## Integration Points

### 1. Collection Plan and Collection Attempts

Current integration:

- `collectionPlanEntries` spawn `collectionAttempts` using a collection-specific method string in [convex/schema.ts](../../convex/schema.ts).
- Successful collection attempts emit `PAYMENT_APPLIED` directly in [convex/engine/effects/collectionAttempt.ts](../../convex/engine/effects/collectionAttempt.ts).

Target integration:

- `collectionAttempts` become an adapter layer or are superseded by `transferRequests`.
- For low-risk migration, keep `collectionAttempts` as the orchestration entity for borrower collections in phase 1, but have the success path create or reference a `transferRequest`.
- Eventually collections should use the transfer machine directly, with collection-plan logic only deciding when to create a transfer.

Recommended phase-1 bridge:

1. Collection plan creates a `collectionAttempt`.
2. Collection attempt effect resolves and creates a `transferRequest` with inbound direction.
3. Provider settlement confirms `transferRequest`.
4. Transfer success emits canonical `TRANSFER_CONFIRMED`.
5. An adapter effect applies payment to obligations.

This keeps collection rules stable while moving execution into the new rail.

### 2. Obligations

Current integration:

- `emitPaymentReceived` applies payment across referenced obligations in [convex/engine/effects/collectionAttempt.ts](../../convex/engine/effects/collectionAttempt.ts).
- `emitObligationSettled` then schedules dispersal creation in [convex/engine/effects/obligation.ts](../../convex/engine/effects/obligation.ts).

Target integration:

- Only inbound transfer confirmation should trigger `PAYMENT_APPLIED`.
- A transfer must carry enough references to know whether it settles an obligation, funds a deal, or executes an outbound payout.
- Obligation settlement must remain the trigger for ownership-side dispersal calculations unless and until a dedicated cash ledger exists.

### 3. Dispersal Engine

Current integration:

- `emitObligationSettled` schedules `createDispersalEntries` with `{ mortgageId, obligationId, settledAmount, settledDate }` in [convex/engine/effects/obligation.ts](../../convex/engine/effects/obligation.ts).
- `createDispersalEntries` derives lender shares from current ownership positions and reroutes in [convex/dispersal/createDispersalEntries.ts](../../convex/dispersal/createDispersalEntries.ts).

Target integration:

- Keep ownership/dispersal generation as-is for borrower payment settlement in phase 1.
- Add a new outbound payout step that converts pending `dispersalEntries` into actual transfer requests of type `lender_dispersal_payout`.
- Do **not** mark a dispersal as paid merely because the calculation record exists. `dispersalEntries` currently represent owed-to-lender allocation, not actual outbound cash execution.

This is a major foot gun in the current architecture: the system already computes lender distributions, but there is no modeled outbound payout lifecycle attached to them.

### 4. Deal Closing

Current integration:

- Deal closing ends with `FUNDS_RECEIVED` in [convex/engine/machines/deal.machine.ts](../../convex/engine/machines/deal.machine.ts).
- The current `updatePaymentSchedule` effect only inserts a future `dealReroutes` record in [convex/engine/effects/dealClosingPayments.ts](../../convex/engine/effects/dealClosingPayments.ts).

Target integration:

- Replace `FUNDS_RECEIVED` as the terminal cash event with a two-leg transfer workflow:
  - leg 1: buyer -> trust (`deal_principal_transfer`, inbound)
  - leg 2: trust -> seller (`deal_seller_payout`, outbound)
- Only after leg 1 confirms should leg 2 be initiated.
- Only after leg 2 confirms should the deal machine advance to final confirmation actions such as ownership reroute and reservation commit.

The current implementation updates future payment allocation after closing, but it does not model the actual closing-day cash movement. Unified rails must own that gap.

### 5. Ledger

Current integration:

- `postEntry` in [convex/ledger/postEntry.ts](../../convex/ledger/postEntry.ts) is the single validated write path for the ownership ledger.
- `ledger_journal_entries` represent ownership ledger entries, not trust cash ledger entries, per [convex/schema.ts](../../convex/schema.ts).

Target integration:

- Do not overload the ownership ledger with trust-cash semantics.
- Introduce a dedicated cash ledger or at minimum a new cash-journal bounded context for:
  - borrower cash received
  - lender payouts sent
  - seller payouts sent
  - reversals / returns / rejects
- If the product needs one bridge in phase 1, implement a `cashLedgerBridge` module that maps confirmed transfers into cash journal entries, while leaving the ownership ledger unchanged.

This distinction is critical. Ownership units and trust cash are not the same thing.

### 6. Auth and Permissions

Observed auth patterns:

- Query RBAC is enforced with JWT-derived permissions via `requirePermission(...)` in [convex/fluent.ts](../../convex/fluent.ts).
- Dispersal queries already require `dispersal:view` in [convex/dispersal/queries.ts](../../convex/dispersal/queries.ts).
- Engine command provenance already supports `sessionId` and command source metadata in [convex/engine/commands.ts](../../convex/engine/commands.ts).

Target permissions:

- `payment:manage`
- `payment:view`
- `payment:view_own`
- `payment:retry`
- `payment:cancel`
- `payment:webhook_process`
- `bank_account:manage`
- `bank_account:view_own`

Provider webhooks should not impersonate users. They should enter through internal or HTTP-action paths with `source.type = "webhook"` and provider-specific actor labels.

## Financial and Domain Correctness Invariants

These are the non-negotiable invariants for unified rails.

### Amount correctness

- All amounts are safe-integer cents, never floats.
- Every provider adapter must normalize into integer cents before writing domain state.
- Provider fees, if modeled later, must be separate entries, not netted invisibly into settlement amount.

### Idempotency correctness

- `transferRequests.idempotencyKey` must dedupe business intent.
- `providerInitiationKey` must dedupe provider submission.
- `transferWebhooks.externalEventId` must dedupe callback processing.
- Ledger posting must use a deterministic idempotency key derived from `transferRequestId` and posting semantic, not raw provider reference.

### Settlement correctness

- Provider acknowledgement is not settlement.
- A transfer enters financial truth only on confirmed settlement.
- Failed transfers post no cash journal entry.
- Reversed transfers create compensating entries; they do not mutate confirmed entries away.

### Ownership correctness

- Borrower cash collection and lender ownership allocation are related but not identical.
- Ownership reroutes affect future dispersal allocation, not the fact of cash already collected.
- Deal closing should not reroute historical entitlements.

### Multi-leg correctness

- Leg 2 must never execute unless leg 1 is confirmed.
- Partial success of multi-leg flows must leave funds explicitly in trust with a resolvable status.
- A deal cannot be marked closed merely because buyer funds were acknowledged by a provider.

### Bank-account correctness

- Unvalidated accounts cannot be used for PAD/EFT initiation.
- A revoked mandate invalidates future PAD initiation, even if the account record still exists.
- Provider account tokens must be rotated independently of user-visible bank account records.

## Major Foot Guns

### Foot gun 1: Extending `PaymentMethod` directly

The current interface is borrower-collection specific. Reusing it directly for outbound payouts will leak collection terminology into disbursement and closing flows, creating a brittle abstraction.

### Foot gun 2: Treating `dispersalEntries` as cash payouts

`dispersalEntries` are allocation records with `status: "pending"` today. They are not actual outbound rail executions. Unified rails must introduce a payout execution step rather than silently reusing this status.

### Foot gun 3: Reusing ownership ledger as cash ledger

The current ledger enforces ownership-unit constraints, not trust-cash accounting. Mixing these domains will produce misleading balances and impossible reconciliation.

### Foot gun 4: Using current positions instead of effective ownership snapshot incorrectly

`createDispersalEntries` already adjusts current positions with `dealReroutes` by `effectiveAfterDate` in [convex/dispersal/createDispersalEntries.ts](../../convex/dispersal/createDispersalEntries.ts). New transfer logic must preserve date-sensitive ownership semantics and not accidentally use “latest owner wins” logic for historical cash events.

### Foot gun 5: Confusing lender auth ids with lender entity ids

The codebase currently bridges between auth ids stored on ledger accounts and entity ids stored in domain tables, for example in [convex/dispersal/createDispersalEntries.ts](../../convex/dispersal/createDispersalEntries.ts) and [convex/auth/resourceChecks.ts](../../convex/auth/resourceChecks.ts). New transfer tables should store canonical entity ids and only use auth ids at auth boundaries.

### Foot gun 6: Assuming provider callbacks are exactly once

Webhooks will retry, arrive out of order, and occasionally conflict with polling. Processing must be replay-safe and monotonic.

### Foot gun 7: Computing servicing fee from current mortgage principal without explicit principal basis

Current dispersal fee calculation uses `mortgage.principal` in [convex/dispersal/createDispersalEntries.ts](../../convex/dispersal/createDispersalEntries.ts). That may diverge from the economically correct principal basis if amortization or paydown semantics evolve. Unified rails should explicitly document whether fees are based on original principal, current principal, or payment-level interest slice.

### Foot gun 8: Allowing manual rails to bypass bank account and ledger semantics

Manual rails should bypass provider APIs, not domain controls. They still need transfer records, provenance, confirmation actor, and cash journal posting.

### Foot gun 9: Marking obligations settled from provider initiation

Only confirmed inbound settlement should apply `PAYMENT_APPLIED`. Manual immediate-confirmation is valid only because the operator is asserting settlement at initiation time.

### Foot gun 10: Missing a trust-account balance gate on outbound transfers

Before any outbound initiation, the system must verify sufficient available trust cash for the relevant payable bucket. Without this, asynchronous outbound rails can over-disburse.

## Proposed Module Boundaries

### New transfer bounded context

- `convex/payments/transfers/types.ts`
- `convex/payments/transfers/interface.ts`
- `convex/payments/transfers/registry.ts`
- `convex/payments/transfers/mutations.ts`
- `convex/payments/transfers/queries.ts`
- `convex/payments/transfers/webhooks.ts`
- `convex/payments/transfers/reconciliation.ts`

### Provider adapters

- `providers/manual.ts`
- `providers/vopayPad.ts`
- `providers/vopayEft.ts`
- `providers/rotessaPad.ts`

### Bank account domain

- `convex/payments/bankAccounts/mutations.ts`
- `convex/payments/bankAccounts/queries.ts`
- `convex/payments/bankAccounts/validation.ts`

### Cash ledger bridge

- `convex/payments/cashLedger/postTransferSettlement.ts`
- `convex/payments/cashLedger/postTransferReversal.ts`

## Migration Plan

### Phase 1: Introduce unified transfer model without breaking collections

- Add `transferRequests`, `transferWebhooks`, and `bankAccounts`.
- Implement new provider registry and transfer machine.
- Keep existing collection plan and collection attempt flows.
- Change collection execution to create transfer requests under the hood.
- Keep `emitPaymentReceived` as the adapter from confirmed inbound transfer to obligation settlement.

### Phase 2: Connect real inbound provider

- Implement VoPay or Rotessa inbound PAD adapter.
- Add signature-verified webhook ingestion.
- Add bank account validation / mandate prerequisites.
- Replace `MockPADMethod` in production with real provider configuration.

### Phase 3: Model outbound lender payouts

- Introduce payout orchestration that reads pending `dispersalEntries` and creates `lender_dispersal_payout` transfers.
- Add preflight check against trust-cash availability.
- Track payout execution status separately from dispersal calculation status.

### Phase 4: Model deal-closing money movement

- Replace current `FUNDS_RECEIVED` shortcut with buyer->trust and trust->seller transfer orchestration.
- Gate ownership reroute and reservation commit on transfer confirmation.

### Phase 5: Introduce dedicated cash ledger if not already done

- Post confirmed and reversed transfers into cash journal entries.
- Reconcile trust cash, provider events, and outbound payouts against that ledger.

## Testing Strategy

### Unit tests

- provider adapter normalization
- provider registry capability resolution
- bank account validation logic
- transfer machine transition coverage
- webhook dedupe and signature verification
- cash ledger bridge mapping

### Integration tests

- inbound borrower collection -> confirmed transfer -> obligation settlement
- obligation settlement -> dispersal calculation
- dispersal payout creation -> outbound transfer initiation
- failed outbound payout leaves payable intact
- deal close leg 1 success + leg 2 failure leaves explicit trust-held state

### Financial property tests

- sum of rounded dispersal outputs equals distributable amount
- one transfer confirmation produces exactly one ledger posting
- replayed webhook produces zero additional postings
- reversal net effect equals zero across original plus compensating postings

### Operational tests

- delayed webhook after polling confirmation
- duplicate webhook arrival
- provider callback with mismatched amount
- revoked bank mandate after account selection but before initiation

## Observability and Reconciliation

- Every transfer must have a queryable lifecycle timeline.
- Every provider webhook must be durably stored before business processing.
- Every confirmed transfer must link to zero or more downstream journal entries.
- Add reconciliation views for:
  - provider settlement totals vs confirmed transfers
  - confirmed inbound transfers vs obligation settlements
  - pending dispersals vs executed lender payouts
  - executed outbound payouts vs trust cash movements

## Concrete Recommendations

1. Create a new `transferRequests` bounded context rather than broadening `PaymentMethod`.
2. Keep `collectionAttempts` temporarily as an adapter to reduce blast radius.
3. Treat `dispersalEntries` as calculation records, then add a separate outbound payout lifecycle.
4. Do not use the current ownership ledger as the cash ledger.
5. Implement multi-leg deal close transfers before claiming unified rails covers all platform money movement.
6. Make bank-account validation mandatory for real PAD/EFT rails from day one.
7. Make provider webhook storage and idempotency part of the initial design, not a later hardening task.

## Open Decisions That Need Product or Architecture Sign-off

- Whether lender monthly disbursement is executed per `dispersalEntry`, per lender/date batch, or per payout cycle aggregate.
- Whether servicing fee is deducted from each settled payment, from interest only, or from a separate trust-cash fee path.
- Whether principal repayment to investors flows through the same payout rail as interest distributions or through a distinct principal-return domain.
- Whether the first version of the cash ledger is a real new bounded context or a lighter event journal bridge.
- Whether collection attempts remain as a user-visible domain entity after transfer requests are introduced.

## Bottom Line

The repo already contains most of the surrounding systems needed for unified payment rails, but they are currently split across collection execution, dispersal allocation, ownership accounting, and deal-closing ownership transfer. The missing piece is a canonical cash-movement domain.

The correct implementation is not “add more providers to `PaymentMethod`.” The correct implementation is:

- add a transfer domain
- bridge it into collections
- attach outbound payouts to dispersals
- attach closing legs to deals
- keep cash accounting separate from ownership accounting

That is the lowest-risk path that preserves financial correctness while still matching the stated goal of one provider-agnostic rail for all money movement.
