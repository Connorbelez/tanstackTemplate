# Chunk Context: manual-bidirectional

Source: Linear ENG-196, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Linear Issue Scope

```md
## Scope

Ensure `ManualPaymentMethod` works for both inbound collections AND outbound disbursements through the unified rails, with immediate confirmation path (initiated → confirmed, skipping pending).

## What to Build

1. **Inbound manual** (UC-148): Admin records borrower payment → TransferRequest(direction=inbound) → ManualProvider → initiated → confirmed immediately
2. **Outbound manual** (UC-155): Admin records lender payout → TransferRequest(direction=outbound) → ManualProvider → initiated → confirmed (admin confirms send)
3. Register manual provider capabilities in provider registry for ALL transfer types
4. Manual provider must still create transfer records, audit trail, and cash journal postings — it bypasses provider APIs, NOT domain controls

## Acceptance Criteria

* Manual inbound: `initiated → confirmed` in single transaction (FUNDS_SETTLED fires from initiated)
* Manual outbound: `initiated → confirmed` after admin confirmation step
* Both directions create proper transfer records in the `transfers` table
* Cash Ledger Bridge fires for both directions (CASH_RECEIVED for inbound, LENDER_PAYOUT_SENT for outbound)
* Provenance includes `source.type = 'user'` with admin actor ID
* Duplicate detection works via `idempotencyKey`
```

## Implementation Plan Excerpt

```md
## 1. Goal
Ensure `ManualPaymentMethod` works for both inbound collections AND outbound disbursements through the unified rails. Manual transfers bypass provider APIs but NOT domain controls — they still create transfer records, audit trail, and cash journal postings. Inbound manual follows `initiated → confirmed` immediately; outbound manual follows `initiated → confirmed` after admin confirmation step.
```

```md
### Derived Requirements
- From Foot Gun 8: Manual rails bypass provider APIs, NOT domain controls. Transfer records, provenance, confirmation actor, and cash journal posting are all required.
- From spec: Manual providers return `status: "confirmed"` on initiation, which triggers the `initiated → confirmed` shortcut in the transfer state machine.
- Outbound manual transfers need a two-step flow: admin creates the transfer (initiated), then admin confirms the send (fires FUNDS_SETTLED).
- `lenderId` must be set on outbound transfers for `postLenderPayoutForTransfer()` to succeed.
```

```md
### Key Design Decisions
1. **Inbound Manual (Immediate):** `createTransferRequest(direction: 'inbound') → initiateTransfer() → ManualTransferProvider.initiate() returns confirmed → FUNDS_SETTLED fired → publishTransferConfirmed → postCashReceiptForTransfer()`
2. **Outbound Manual (Two-Step):** `createTransferRequest(direction: 'outbound') → initiateTransfer() → ManualTransferProvider.initiate() returns confirmed → FUNDS_SETTLED fired → publishTransferConfirmed → postLenderPayoutForTransfer()`
	- **Note:** The current `ManualTransferProvider` returns `confirmed` immediately for ALL transfers. The issue says outbound should have an "admin confirmation step", but the current implementation confirms immediately. This is a gap to address.
3. **Provider Resolution:** The registry resolves `"manual"` → `ManualTransferProvider`. No capability-keyed resolution needed for Phase 1.
```

```md
### Contradictions Found
- **Outbound Confirmation Step:** Issue says "Manual outbound: `initiated → confirmed` after admin confirmation step", but `ManualTransferProvider.initiate()` returns `confirmed` immediately for ALL directions. The two-step outbound flow (create → admin confirms later) is not yet implemented.
	- **Impact:** Outbound manual transfers confirm immediately without a separate admin confirmation action
	- **Recommendation:** Add a `confirmManualOutbound` admin mutation that takes a transferId in `initiated` status and fires FUNDS_SETTLED. Modify `ManualTransferProvider` to return `status: "pending"` for outbound transfers, OR keep current behavior and add a separate admin-triggered flow.
```

```md
### Step 2: (If Option B) Modify ManualTransferProvider for outbound
- **File(s):** `convex/payments/transfers/providers/manual.ts`
- **Action:** Return `status: "pending"` when `request.direction === "outbound"`, `"confirmed"` for inbound
- **Validation:** `bun typecheck` passes
- **Depends on:** Step 1
### Step 3: (If Option B) Add confirmManualOutbound mutation
- **File(s):** `convex/payments/transfers/mutations.ts`
- **Action:** Create `confirmManualOutbound` admin mutation that:
	1. Validates transfer exists, status is `pending`, providerCode is `manual`
	2. Fires `FUNDS_SETTLED` event via `executeTransition`
	3. Returns transition result
- **Validation:** `bun typecheck` passes
- **Depends on:** Step 2
### Step 4: Write integration tests
- **File(s):** `convex/payments/transfers/__tests__/manualBidirectional.test.ts` (Create)
- **Action:** Test cases:
	1. Inbound manual: create → initiate → verify `confirmed` status + CASH_RECEIVED entry
	2. Outbound manual: create → initiate → (confirm if Option B) → verify `confirmed` status + LENDER_PAYOUT_SENT entry
	3. Duplicate detection: same idempotencyKey returns existing transfer ID
	4. Provenance: source includes admin actor ID
	5. Missing lenderId on outbound: throws ConvexError
- **Validation:** `bun run test` passes
- **Depends on:** Step 2/3
```

## Unified Rails Spec Excerpts

```md
### Foot gun 8: Allowing manual rails to bypass bank account and ledger semantics
Manual rails should bypass provider APIs, not domain controls. They still need transfer records, provenance, confirmation actor, and cash journal posting.
```

```md
<tr>
<td>`manual`</td>
<td>Admin-confirmed manual payment (cash, cheque, bank draft)</td>
<td>Both</td>
<td>Immediate</td>
<td>Exists</td>
</tr>
```

```md
- **`initiated → confirmed`** shortcut — for immediate providers (Manual), `FUNDS_SETTLED` fires directly from `initiated`, skipping `pending`. This matches `ManualPaymentMethod.initiate()` returning `status: "confirmed"`.
```

```md
All live in `convex/payments/cashLedger/integrations.ts` and call the existing `postCashEntryInternal()` 9-step validated pipeline:
<table header-row="true">
<tr>
<td>**Transfer Event**</td>
<td>**Cash Ledger Function**</td>
<td>**Entry Type**</td>
</tr>
<tr>
<td>Inbound transfer confirmed (obligation-backed)</td>
<td>`postCashReceiptForTransfer()`</td>
<td>`CASH_RECEIVED`</td>
</tr>
<tr>
<td>Inbound transfer confirmed (fee/deposit)</td>
<td>`postCashReceiptForTransfer()` with `UNAPPLIED_CASH` credit</td>
<td>`CASH_RECEIVED`</td>
</tr>
<tr>
<td>Outbound transfer confirmed</td>
<td>`postLenderPayoutForTransfer()`</td>
<td>`LENDER_PAYOUT_SENT`</td>
</tr>
<tr>
<td>Transfer reversed</td>
<td>`postTransferReversal()`</td>
<td>`REVERSAL`</td>
</tr>
</table>
```

## Prerequisite Issue Outputs

```md
### Prerequisites (blockedBy)
- **ENG-192**: Register `transfer` as GovernedEntityType with Transition Engine — **Done** ✅
	- Key outputs: `transfer` entity type registered, `transferMachine` in machine registry, all effects in effect registry
- **ENG-195**: Build PaymentMethodAdapter bridge — **Done** ✅
	- Key outputs: `PaymentMethodAdapter` class at `convex/payments/transfers/providers/adapter.ts` wrapping legacy `PaymentMethod` → `TransferProvider`
- **ENG-215**: Implement Provider Capability Registry with runtime resolution — **Done** ✅
	- Key outputs: Provider resolution by code (currently simple switch in `providers/registry.ts`)
```

## Relevant Current Code

```ts
export class ManualTransferProvider implements TransferProvider {
	async initiate(request: TransferRequestInput): Promise<InitiateResult> {
		// Generate provider ref using transfer type + UUID for uniqueness
		return {
			providerRef: `manual_${request.transferType}_${crypto.randomUUID()}`,
			status: "confirmed", // Immediate confirmation — operator asserts settlement at entry time
		};
	}
```

```ts
export const initiateTransfer = paymentAction
	.input({
		transferId: v.id("transferRequests"),
	})
	.handler(async (ctx, args): Promise<TransitionResult> => {
		// ...
		const result = await provider.initiate(input);
		const source = buildSource(ctx.viewer, "admin_dashboard");

		if (result.status === "confirmed") {
			await ctx.runMutation(
				internal.payments.transfers.mutations.persistProviderRef,
				{
					transferId: args.transferId,
					providerRef: result.providerRef,
				}
			);
			return ctx.runMutation(
				internal.payments.transfers.mutations.fireInitiateTransition,
				{
					transferId: args.transferId,
					eventType: "FUNDS_SETTLED",
					payload: {
						settledAt: Date.now(),
						providerData: {},
						providerRef: result.providerRef,
					},
					source,
				}
			);
		}

		return ctx.runMutation(
			internal.payments.transfers.mutations.fireInitiateTransition,
			{
				transferId: args.transferId,
				eventType: "PROVIDER_INITIATED",
				payload: { providerRef: result.providerRef },
				source,
			}
		);
	})
```

```ts
export const confirmManualTransfer = paymentMutation
	.input({
		transferId: v.id("transferRequests"),
		providerRef: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const transfer = await ctx.db.get(args.transferId);
		// ...
		if (!canManuallyConfirmTransferStatus(transfer.status)) {
			throw new ConvexError(
				`Transfer must be in "initiated", "pending", or "processing" status to confirm manually, currently: "${transfer.status}"`
			);
		}
		// ...
		return executeTransition(ctx, {
			entityType: "transfer",
			entityId: args.transferId,
			eventType: "FUNDS_SETTLED",
			payload: {
				settledAt: now,
				providerData: {
					providerRef,
					method: "manual",
				},
			},
			source,
		});
	})
```

```ts
export async function postLenderPayoutForTransfer(
	ctx: MutationCtx,
	args: {
		transferRequestId: Id<"transferRequests">;
		source: CommandSource;
	}
): Promise<Doc<"cash_ledger_journal_entries">> {
	const transfer = await ctx.db.get(args.transferRequestId);
	// ...
	if (!transfer.lenderId) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} has no lenderId for lender payout`
		);
	}
```

## Constraints & Rules

```md
- `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
- NEVER USE `any` as a type unless you absolutely have to.
- Always prefer loose coupling and dependency injection. Everything should be mockable, testable and replaceable.
```

```md
- DO NOT try to fix linting/formatting errors BEFORE running `bun check`. Always run `bun check` first as this command also auto formats and fixes some linting errors.
```

## File Structure

```md
convex/payments/transfers/providers/manual.ts
convex/payments/transfers/mutations.ts
convex/payments/transfers/__tests__/mutations.test.ts
convex/payments/transfers/__tests__/handlers.integration.test.ts
convex/payments/cashLedger/integrations.ts
convex/engine/effects/transfer.ts
```
