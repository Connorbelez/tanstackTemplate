# Remove Legacy Attempt Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every compatibility path where a `collectionAttempt` can behave like a provider-owned payment record without a canonical `transferRequest`, and make `transferRequests` the only provider-facing settlement and reversal record.

**Architecture:** `collectionAttempts` remain the borrower-collection business record, but they stop owning provider refs, provider status, reversal lookup, and bridge-created transfer rows. The refactor first locks the invariant that every executable attempt is linked to a `transferRequest`, then moves reversal/provider lookup fully into the transfer domain, then deletes the deprecated `PaymentMethod` and bridge stack, and finally removes schema, demo, admin, and reconciliation residue.

**Tech Stack:** TypeScript, Convex, Bun, Vitest, convex-test, Biome

---

## Non-Negotiable Invariants

- `collectionAttempts` stay in the codebase. The thing being removed is the legacy mode where an attempt can be provider-facing or exist without a canonical linked transfer.
- Every runtime path that settles, fails, cancels, or reverses borrower collection must go through a `transferRequests` row first.
- Provider-owned fields (`providerRef`, `providerStatus`, provider lookup) belong on `transferRequests`, not `collectionAttempts`.
- Because the project is greenfield and has no production data, schema-breaking cleanup is allowed in the same branch after runtime paths are migrated.

## File Structure

**Modify**
- `convex/payments/collectionPlan/execution.ts` — enforce canonical `transferRequestId` ownership and stop patching attempt-side provider status.
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — assert transfer linkage instead of attempt-side provider metadata.
- `convex/payments/collectionPlan/__tests__/runner.test.ts` — assert execution produces transfer-owned provider refs.
- `convex/payments/transfers/collectionAttemptReconciliation.ts` — stop writing `providerStatus` to attempts; keep only attempt lifecycle transitions.
- `convex/engine/effects/collectionAttempt.ts` — remove the legacy bridge call and the attempt-side `recordProviderRef` persistence effect.
- `convex/engine/effects/transfer.ts` — rename bridged semantics to canonical attempt-linked semantics and keep reversal/settlement routing transfer-first.
- `convex/engine/effects/__tests__/transfer.test.ts` — update transfer effect expectations after attempt-side provider metadata removal.
- `convex/payments/webhooks/handleReversal.ts` — lookup and validate `transferRequests` by `(providerCode, providerRef)` instead of `collectionAttempts` by `providerRef`.
- `convex/payments/webhooks/processReversal.ts` — transition the `transfer` machine instead of directly transitioning the attempt.
- `convex/payments/webhooks/__tests__/reversalIntegration.test.ts` — seed linked transfers and assert transfer-first reversal propagation.
- `convex/payments/transfers/reconciliation.ts` — remove legacy-stub assumptions from lightweight reconciliation.
- `convex/payments/cashLedger/transferReconciliation.ts` — remove legacy-stub skips and treat malformed transfers as integrity failures, not compatibility cases.
- `convex/payments/collectionPlan/admin.ts` — load provider ref and provider status from linked transfer summaries only.
- `convex/payments/collectionPlan/__tests__/admin.test.ts` — assert admin views do not depend on attempt-side provider fields.
- `convex/demo/amps.ts` — seed retry/failure demos through canonical transfer-linked attempts.
- `convex/schema.ts` — drop attempt-side provider fields/index and remove legacy transfer statuses.
- `convex/payments/transfers/validators.ts` — remove `approved` and `completed` from transfer status validation.
- `convex/payments/transfers/interface.ts` — remove transitional comments that mention `PaymentMethod`.
- `convex/payments/transfers/providers/registry.ts` — ensure registry language is canonical-only.
- `convex/payments/transfers/providers/__tests__/registry.test.ts` — keep coverage on canonical providers only.
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — remove assertions on `attempt.providerRef` / `attempt.providerStatus`.
- `convex/payments/transfers/__tests__/reconciliation.test.ts` — update expectations away from legacy stubs.
- `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts` — update expectations away from legacy stubs.

**Delete**
- `convex/payments/transfers/legacyBridgeCompatibility.ts`
- `convex/payments/transfers/__tests__/bridge.test.ts`
- `convex/payments/methods/interface.ts`
- `convex/payments/methods/registry.ts`
- `convex/payments/methods/manual.ts`
- `convex/payments/methods/mockPAD.ts`
- `convex/payments/__tests__/methods.test.ts`
- `convex/payments/transfers/providers/adapter.ts`
- `convex/payments/transfers/providers/__tests__/adapter.test.ts`

**Generated / Verification**
- Regenerate Convex types with `bunx convex codegen`.
- Verify repo health with `bun check`, `bun typecheck`, and focused Vitest runs before full suite.

### Task 1: Lock the Canonical Transfer Link Invariant

**Files:**
- Modify: `convex/payments/collectionPlan/execution.ts`
- Test: `convex/payments/collectionPlan/__tests__/execution.test.ts`
- Test: `convex/payments/collectionPlan/__tests__/runner.test.ts`

- [ ] **Step 1: Write the failing execution test that asserts transfer linkage is mandatory**

```ts
it("stores transferRequestId on the attempt before any provider-facing progress", async () => {
	const result = await t.action(
		internal.payments.collectionPlan.execution.executePlanEntryAction,
		{
			planEntryId,
			triggerSource: "system_scheduler",
		}
	);

	const attempt = await t.run(async (ctx) =>
		ctx.db.get(result.collectionAttemptId)
	);
	const transfer = result.transferRequestId
		? await t.run(async (ctx) => ctx.db.get(result.transferRequestId!))
		: null;

	expect(result.transferRequestId).toBeDefined();
	expect(attempt?.transferRequestId).toBe(result.transferRequestId);
	expect(transfer?._id).toBe(result.transferRequestId);
});
```

- [ ] **Step 2: Run the focused collection-plan tests to capture the current red state**

Run: `bun run vitest convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts`

Expected: at least one assertion still references `attempt.providerRef` / `attempt.providerStatus`, or the new transfer-link invariant test fails before implementation.

- [ ] **Step 3: Implement the invariant in `execution.ts` and stop patching attempt-side provider status**

```ts
export const recordTransferHandoffSuccess = convex
	.mutation()
	.input({
		attemptId: v.id("collectionAttempts"),
		transferRequestId: v.id("transferRequests"),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.attemptId, {
			transferRequestId: args.transferRequestId,
		});
	});

export const recordTransferHandoffFailure = convex
	.mutation()
	.input({
		attemptId: v.id("collectionAttempts"),
		failureReason: v.string(),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.attemptId, {
			failureReason: args.failureReason,
		});
	});
```

```ts
if (!transferRequestId) {
	throw new Error(
		`[collection-plan] Attempt ${result.collectionAttemptId} has no transferRequestId. ` +
			"Legacy transferless attempts are no longer supported."
	);
}
```

- [ ] **Step 4: Update the collection-plan tests to assert transfer-owned provider state**

```ts
expect(attempt?.transferRequestId).toBeTruthy();
expect(transfer?.providerRef).toBeTruthy();
expect(attempt).not.toHaveProperty("providerStatus");
```

- [ ] **Step 5: Re-run the focused collection-plan tests until they pass**

Run: `bun run vitest convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts`

Expected: PASS

- [ ] **Step 6: Record the invariant change**

```bash
gt create -am "refactor: require transfer-linked collection attempts"
```

### Task 2: Move Reversal Ownership Fully Into the Transfer Domain

**Files:**
- Modify: `convex/payments/webhooks/handleReversal.ts`
- Modify: `convex/payments/webhooks/processReversal.ts`
- Test: `convex/payments/webhooks/__tests__/reversalIntegration.test.ts`

- [ ] **Step 1: Write the failing webhook integration test for transfer-first reversal lookup**

```ts
it("looks up the transfer by providerCode + providerRef and reverses the linked attempt through transfer effects", async () => {
	const transfer = await t.run(async (ctx) =>
		ctx.db
			.query("transferRequests")
			.withIndex("by_provider_ref", (q) =>
				q.eq("providerCode", "pad_rotessa").eq("providerRef", "txn_test_reversal_001")
			)
			.first()
	);

	expect(transfer?._id).toBeDefined();

	const result = await handlePaymentReversal(actionCtx, {
		provider: "rotessa",
		providerRef: "txn_test_reversal_001",
		providerEventId: "evt_nsf_001",
		reversalDate: "2026-03-10",
		reversalReason: "NSF",
	});

	expect(result.success).toBe(true);
	expect(result.transferId).toBe(transfer?._id);
});
```

- [ ] **Step 2: Run the reversal-focused tests to capture the current red state**

Run: `bun run vitest convex/payments/webhooks/__tests__/reversalIntegration.test.ts`

Expected: FAIL because the current handler still queries `collectionAttempts.by_provider_ref`.

- [ ] **Step 3: Replace attempt lookup and attempt transition with transfer lookup and transfer transition**

```ts
export const getTransferByProviderRef = internalQuery({
	args: {
		providerCode: v.string(),
		providerRef: v.string(),
	},
	handler: async (ctx, args) => {
		return ctx.db
			.query("transferRequests")
			.withIndex("by_provider_ref", (q) =>
				q.eq("providerCode", args.providerCode).eq("providerRef", args.providerRef)
			)
			.first();
	},
});
```

```ts
export const processTransferReversal = internalMutation({
	args: {
		transferId: v.id("transferRequests"),
		effectiveDate: v.string(),
		reason: v.string(),
		provider: v.union(
			v.literal("rotessa"),
			v.literal("stripe"),
			v.literal("pad_vopay")
		),
		providerEventId: v.string(),
	},
	handler: async (ctx, args) => {
		return executeTransition(ctx, {
			entityType: "transfer",
			entityId: args.transferId,
			eventType: "PAYMENT_REVERSED",
			payload: {
				effectiveDate: args.effectiveDate,
				reason: args.reason,
				provider: args.provider,
				providerEventId: args.providerEventId,
			},
			source: {
				actorType: "system",
				channel: "api_webhook",
				actorId: `webhook:${args.provider}`,
			},
		});
	},
});
```

- [ ] **Step 4: Update the reversal integration seed so confirmed attempts are backed by confirmed transfers**

```ts
const transferId = await ctx.db.insert("transferRequests", {
	status: "confirmed",
	direction: "inbound",
	transferType: "borrower_interest_collection",
	amount: TOTAL_AMOUNT,
	currency: "CAD",
	counterpartyType: "borrower",
	counterpartyId: `${borrowerId}`,
	providerCode: "pad_rotessa",
	providerRef: "txn_test_reversal_001",
	idempotencyKey: `reversal-seed:${attemptId}`,
	source: SYSTEM_SOURCE,
	createdAt: Date.now(),
	lastTransitionAt: Date.now(),
	planEntryId,
	collectionAttemptId: attemptId,
	obligationId,
	mortgageId,
	borrowerId,
	confirmedAt: Date.now() - 60_000,
});

await ctx.db.patch(attemptId, { transferRequestId: transferId });
```

- [ ] **Step 5: Re-run reversal integration tests until they pass**

Run: `bun run vitest convex/payments/webhooks/__tests__/reversalIntegration.test.ts`

Expected: PASS

- [ ] **Step 6: Record the transfer-owned reversal refactor**

```bash
gt modify -am "refactor: make payment reversals transfer-owned"
```

### Task 3: Remove Attempt-Side Bridge Hooks and Provider Status Writes

**Files:**
- Modify: `convex/engine/effects/collectionAttempt.ts`
- Modify: `convex/payments/transfers/collectionAttemptReconciliation.ts`
- Test: `convex/engine/effects/__tests__/transfer.test.ts`
- Test: `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts`

- [ ] **Step 1: Write the failing test that proves attempt reconciliation no longer mutates attempt-side provider status**

```ts
it("reconciles transfer-linked failures without patching providerStatus on collectionAttempts", async () => {
	await reconcileAttemptLinkedInboundFailure(ctx, {
		transfer: { collectionAttemptId: attemptId, direction: "inbound" },
		failureCode: "NSF",
		failureReason: "Insufficient funds",
		source: SYSTEM_SOURCE,
	});

	const attempt = await ctx.db.get(attemptId);
	expect(attempt?.failureReason).toBe("Insufficient funds");
	expect(attempt).not.toHaveProperty("providerStatus");
});
```

- [ ] **Step 2: Run the transfer reconciliation/effect tests to capture the current red state**

Run: `bun run vitest convex/engine/effects/__tests__/transfer.test.ts convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts`

Expected: FAIL because the reconciliation helpers still patch `providerStatus`, and the attempt effect still imports the bridge module.

- [ ] **Step 3: Delete the bridge call from `collectionAttempt.ts` and stop persisting provider refs on attempts**

```ts
		// Route any remaining overpayment to UNAPPLIED_CASH
		if (remainingAmount > 0) {
			const firstObligation = await ctx.db.get(planEntry.obligationIds[0]);
			if (firstObligation) {
				await postOverpaymentToUnappliedCash(ctx, {
					attemptId: args.entityId,
					amount: remainingAmount,
					mortgageId: firstObligation.mortgageId,
					borrowerId: firstObligation.borrowerId,
					postingGroupId,
					source: args.source,
				});
			}
		}
```

```ts
export const notifyAdmin = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[notifyAdmin] Permanent collection failure for attempt=${args.entityId}`
		);
	},
});
```

- [ ] **Step 4: Remove `providerStatus` patches from attempt-linked reconciliation helpers**

```ts
await ctx.db.patch(args.transfer.collectionAttemptId, {
	failureReason: args.failureReason,
});
```

```ts
await transitionAttempt(ctx, {
	transfer: args.transfer,
	eventType: "ATTEMPT_CANCELLED",
	payload: { reason: args.reason },
	source: args.source,
});
```

- [ ] **Step 5: Re-run the effect/reconciliation tests until they pass**

Run: `bun run vitest convex/engine/effects/__tests__/transfer.test.ts convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts`

Expected: PASS

- [ ] **Step 6: Record the attempt cleanup**

```bash
gt modify -am "refactor: remove attempt-side provider compatibility state"
```

### Task 4: Delete the Deprecated `PaymentMethod` Compatibility Stack

**Files:**
- Delete: `convex/payments/methods/interface.ts`
- Delete: `convex/payments/methods/registry.ts`
- Delete: `convex/payments/methods/manual.ts`
- Delete: `convex/payments/methods/mockPAD.ts`
- Delete: `convex/payments/__tests__/methods.test.ts`
- Delete: `convex/payments/transfers/providers/adapter.ts`
- Delete: `convex/payments/transfers/providers/__tests__/adapter.test.ts`
- Delete: `convex/payments/transfers/legacyBridgeCompatibility.ts`
- Delete: `convex/payments/transfers/__tests__/bridge.test.ts`
- Modify: `convex/payments/transfers/interface.ts`
- Modify: `convex/payments/transfers/providers/registry.ts`
- Test: `convex/payments/transfers/providers/__tests__/registry.test.ts`

- [ ] **Step 1: Delete the compatibility-only tests first**

```bash
rm convex/payments/__tests__/methods.test.ts
rm convex/payments/transfers/providers/__tests__/adapter.test.ts
rm convex/payments/transfers/__tests__/bridge.test.ts
```

- [ ] **Step 2: Run provider registry tests to capture any remaining hidden compatibility dependency**

Run: `bun run vitest convex/payments/transfers/providers/__tests__/registry.test.ts`

Expected: PASS before deletions. After the compatibility files are removed, this test must still PASS.

- [ ] **Step 3: Delete the compatibility implementation files and tighten the transfer interface comments**

```bash
rm convex/payments/methods/interface.ts
rm convex/payments/methods/registry.ts
rm convex/payments/methods/manual.ts
rm convex/payments/methods/mockPAD.ts
rm convex/payments/transfers/providers/adapter.ts
rm convex/payments/transfers/legacyBridgeCompatibility.ts
```

```ts
/**
 * Canonical provider contract for all payment rails.
 * New and existing provider integrations must implement TransferProvider.
 */
export interface TransferProvider {
	cancel(providerRef: string): Promise<CancelResult>;
	confirm(providerRef: string): Promise<ConfirmResult>;
	getStatus(providerRef: string): Promise<StatusResult>;
	initiate(request: TransferRequestInput): Promise<InitiateResult>;
}
```

- [ ] **Step 4: Re-run a repo search and the provider registry tests**

Run: `rg -n "PaymentMethod|legacyBridgeCompatibility|maybeCreateLegacyBridgeTransfer|PaymentMethodAdapter" convex`

Expected: no matches

Run: `bun run vitest convex/payments/transfers/providers/__tests__/registry.test.ts`

Expected: PASS

- [ ] **Step 5: Record the compatibility-layer deletion**

```bash
gt modify -am "refactor: delete payment method compatibility layer"
```

### Task 5: Remove Schema, Admin, Demo, and Validation Residue

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/payments/transfers/validators.ts`
- Modify: `convex/payments/collectionPlan/admin.ts`
- Modify: `convex/payments/collectionPlan/__tests__/admin.test.ts`
- Modify: `convex/demo/amps.ts`
- Test: `convex/payments/collectionPlan/__tests__/admin.test.ts`
- Test: `convex/payments/collectionPlan/__tests__/execution.test.ts`

- [ ] **Step 1: Write the failing admin test that proves provider summaries come from the linked transfer only**

```ts
it("returns providerRef from the transfer summary even when the attempt has no provider fields", async () => {
	const summary = await t.query(
		internal.payments.collectionPlan.admin.getAttemptAdminSummaryInternal,
		{ attemptId }
	);

	expect(summary.transfer?.providerRef).toBe("txn_test_reversal_001");
	expect(summary).not.toHaveProperty("providerRef");
	expect(summary).not.toHaveProperty("providerStatus");
});
```

- [ ] **Step 2: Run admin-focused tests to capture the current red state**

Run: `bun run vitest convex/payments/collectionPlan/__tests__/admin.test.ts convex/payments/collectionPlan/__tests__/execution.test.ts`

Expected: FAIL because admin summaries and execution tests still read attempt-side provider fields.

- [ ] **Step 3: Remove attempt-side provider fields and legacy transfer statuses from the schema and validators**

```ts
collectionAttempts: defineTable({
	status: v.string(),
	machineContext: v.optional(v.any()),
	lastTransitionAt: v.optional(v.number()),
	planEntryId: v.id("collectionPlanEntries"),
	mortgageId: v.id("mortgages"),
	obligationIds: v.array(v.id("obligations")),
	method: v.string(),
	amount: v.number(),
	triggerSource: v.optional(
		v.union(
			v.literal("system_scheduler"),
			v.literal("admin_manual"),
			v.literal("workflow_replay"),
			v.literal("migration_backfill")
		)
	),
	executionRequestedAt: v.optional(v.number()),
	executionIdempotencyKey: v.optional(v.string()),
	requestedByActorType: v.optional(
		v.union(v.literal("system"), v.literal("admin"), v.literal("workflow"))
	),
	requestedByActorId: v.optional(v.string()),
	executionReason: v.optional(v.string()),
	transferRequestId: v.optional(v.id("transferRequests")),
	initiatedAt: v.number(),
	confirmedAt: v.optional(v.number()),
	settledAt: v.optional(v.number()),
	failedAt: v.optional(v.number()),
	cancelledAt: v.optional(v.number()),
	reversedAt: v.optional(v.number()),
	failureReason: v.optional(v.string()),
})
	.index("by_plan_entry", ["planEntryId"])
	.index("by_transfer_request", ["transferRequestId"])
	.index("by_mortgage_status", ["mortgageId", "status", "initiatedAt"])
	.index("by_status", ["status"]);
```

```ts
export const transferStatusValidator = v.union(
	v.literal("initiated"),
	v.literal("pending"),
	v.literal("processing"),
	v.literal("confirmed"),
	v.literal("failed"),
	v.literal("cancelled"),
	v.literal("reversed")
);
```

- [ ] **Step 4: Update admin loading and demo seeding to use linked transfers**

```ts
return {
	attemptId: attempt._id,
	status: attempt.status,
	amount: attempt.amount,
	method: attempt.method,
	transferRequestId: attempt.transferRequestId,
	transfer,
	reconciliation,
};
```

```ts
const transferRequestId = await ctx.runMutation(
	internal.payments.transfers.mutations.createTransferRequestInternal,
	{
		direction: "inbound",
		transferType: "borrower_interest_collection",
		amount: planEntry.amount,
		counterpartyType: "borrower",
		counterpartyId: `${borrowerId}`,
		mortgageId: planEntry.mortgageId,
		obligationId: planEntry.obligationIds[0],
		planEntryId: planEntry._id,
		collectionAttemptId: attemptId,
		borrowerId,
		providerCode: "manual",
		idempotencyKey: `demo-amps:retry:${planEntry._id}`,
		source,
	}
);

await ctx.db.patch(attemptId, { transferRequestId });
```

- [ ] **Step 5: Regenerate Convex codegen after schema edits**

Run: `bunx convex codegen`

Expected: PASS and generated types update with no `collectionAttempts.providerRef` / `providerStatus`.

- [ ] **Step 6: Re-run the admin and collection-plan tests**

Run: `bun run vitest convex/payments/collectionPlan/__tests__/admin.test.ts convex/payments/collectionPlan/__tests__/execution.test.ts`

Expected: PASS

- [ ] **Step 7: Record the schema/admin/demo cleanup**

```bash
gt modify -am "refactor: remove legacy attempt schema residue"
```

### Task 6: Simplify Reconciliation and Finish Repo-Wide Verification

**Files:**
- Modify: `convex/engine/effects/transfer.ts`
- Modify: `convex/payments/transfers/reconciliation.ts`
- Modify: `convex/payments/cashLedger/transferReconciliation.ts`
- Test: `convex/payments/transfers/__tests__/reconciliation.test.ts`
- Test: `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts`
- Test: `convex/engine/effects/__tests__/transfer.test.ts`

- [ ] **Step 1: Write the failing reconciliation tests that remove legacy-stub assumptions**

```ts
it("throws when a confirmed transfer is missing direction or amount", async () => {
	await expect(
		checkOrphanedConfirmedTransfers(ctx, { nowMs: NOW })
	).rejects.toThrow(/Canonical transfers must always have direction and amount/);
});
```

- [ ] **Step 2: Run the reconciliation-focused tests to capture the current red state**

Run: `bun run vitest convex/payments/transfers/__tests__/reconciliation.test.ts convex/payments/cashLedger/__tests__/transferReconciliation.test.ts convex/engine/effects/__tests__/transfer.test.ts`

Expected: FAIL because reconciliation still logs and skips `legacy stub` transfers.

- [ ] **Step 3: Remove the legacy-stub branches and rename comments to canonical attempt-linked behavior**

```ts
if (!transfer.direction || transfer.amount == null) {
	throw new Error(
		`[TRANSFER-RECONCILIATION] Transfer ${transfer._id} is malformed. ` +
			"Canonical transfers must always have direction and amount."
	);
}
```

```ts
// Attempt-linked inbound transfers intentionally route business settlement
// and cash meaning through the collection-attempt path.
if (transfer.collectionAttemptId) {
	console.info(
		`[publishTransferReversed] No journal entry for attempt-linked inbound transfer ${args.entityId}. ` +
			"Cash reversal is owned by the collection-attempt path."
	);
}
```

- [ ] **Step 4: Re-run the reconciliation and transfer effect tests**

Run: `bun run vitest convex/payments/transfers/__tests__/reconciliation.test.ts convex/payments/cashLedger/__tests__/transferReconciliation.test.ts convex/engine/effects/__tests__/transfer.test.ts`

Expected: PASS

- [ ] **Step 5: Run repo-wide verification**

Run: `bun check`

Expected: PASS

Run: `bun typecheck`

Expected: PASS

Run: `bun run vitest`

Expected: PASS

- [ ] **Step 6: Run the repo review command and record the final branch state**

Run: `bun run review`

Expected: PASS or actionable review notes that must be resolved before merge

```bash
gt modify -am "refactor: finish legacy attempt removal"
gt submit
```

## Completion Checklist

- No code path can settle or reverse a borrower payment using a transferless `collectionAttempt`.
- `collectionAttempts` no longer store `providerRef`, `providerStatus`, or provider-owned compatibility state.
- Reversal webhooks look up `transferRequests`, not `collectionAttempts`.
- No repo matches remain for `PaymentMethod`, `PaymentMethodAdapter`, `legacyBridgeCompatibility`, or `maybeCreateLegacyBridgeTransfer`.
- `convex/schema.ts` and `convex/payments/transfers/validators.ts` no longer include legacy transfer statuses.
- Demo, admin, reconciliation, and tests all use canonical transfer-linked attempts.
