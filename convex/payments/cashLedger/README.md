# Cash Ledger

Append-only money ledger and obligation-control subledger that tracks how much is owed to FairLend, how much FairLend owes to lenders and platform revenue accounts, and how cash moves through collection, settlement, dispersal, payout, waiver, write-off, and correction flows.

## Disbursement Pre-Validation Gate

Before any outbound disbursement is initiated through Unified Payment Rails, the system queries the Cash Ledger for the lender's outstanding payable balance and rejects transfers exceeding it. This is a **pre-initiation guard**, not just a posting-time constraint.

### Integration Contract

```typescript
const balance = await getLenderPayableBalance(lenderId);
if (transferRequest.amount > balance) {
  throw new Error(
    `Disbursement of ${transferRequest.amount} exceeds payable balance of ${balance}`
  );
}
```

### API

#### `getAvailableLenderPayableBalance(lenderId)`

Returns the available (disbursable) payable balance for a lender.

**Signature:**
```typescript
getAvailableLenderPayableBalance(lenderId: Id<"lenders">): Promise<{
  grossBalance: bigint;      // total payable balance in cents
  inFlightAmount: bigint;    // outbound transfers in flight (currently 0)
  availableBalance: bigint;  // grossBalance - inFlightAmount
}>
```

#### `validateDisbursementAmount(ctx, { lenderId, requestedAmount })`

Pre-initiation guard that validates a disbursement amount against available balance.

**Signature:**
```typescript
validateDisbursementAmount(
  ctx: QueryCtx,
  args: { lenderId: Id<"lenders">; requestedAmount: number }
): Promise<DisbursementValidationResult>

interface DisbursementValidationResult {
  allowed: boolean;
  availableBalance: number;
  requestedAmount: number;
  reason?: string;
}
```

Returns a result object — **never throws**.

#### `assertDisbursementAllowed(ctx, { lenderId, requestedAmount })`

Throwing variant for callers that want hard failure.

**Throws:** `ConvexError` with code `DISBURSEMENT_EXCEEDS_PAYABLE`
```typescript
{
  code: "DISBURSEMENT_EXCEEDS_PAYABLE",
  requestedAmount: number,
  availableBalance: number,
  lenderId: Id<"lenders">,
}
```

### When to Call

Call `validateDisbursementAmount` or `assertDisbursementAllowed` **before initiating any outbound transfer** via the Unified Payment Rails.

### Rejection Handling

When `allowed: false`:
1. Do not initiate the transfer
2. Log the rejection with `requestedAmount`, `availableBalance`, and `lenderId`
3. Return an appropriate error to the caller

### Relationship to REQ-251

REQ-251 (Lender payable balance cannot go negative) is enforced at **posting time** by `postLenderPayout`. This pre-initiation guard catches excess disbursements **before** the transfer is initiated, preventing in-flight transfers that would be rejected at posting.

### Known Limitations

**In-flight deduction not yet implemented.** The `inFlightAmount` field is currently always `0n`. When the `transferRequests` schema is extended to include `lenderId`, `amount`, `direction`, and `transferType`, the `getAvailableLenderPayableBalance` query should deduct outbound transfers in `pending` or `processing` status from the available balance.

The posting-time constraint (ENG-162 REQ-251) provides a safety net until this is implemented.

### Direction of Data Flow

- **Cash Ledger** is the **source** (queried)
- **Unified Payment Rails** is the **consumer** (validates)
- The ledger never initiates transfers; it provides the truth that the rails check against
