# Admin Origination Collections + Rotessa Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the under-modeled origination collections step with explicit app-owned manual execution, a real immediate-Rotessa linking workflow, mandatory PAD authorization evidence, automatic Rotessa sync/reconciliation, and a dedicated Rotessa reconciliation admin surface.

**Architecture:** Stop treating `collectionsDraft.mode` as the full model. Instead, represent operator intent with separate fields for execution intent, app-owned execution strategy, and provider-managed activation state. Keep canonical mortgage activation and obligation/bootstrap scheduling as the source of truth, then layer provider-managed Rotessa activation on top through canonical linkage records and read-model sync instead of free-text staging or bank-account metadata alone. Use a compensating-transaction pattern for immediate Rotessa creation: external schedule create plus a single atomic Convex mutation for internal state, with immediate provider cleanup on failure and typed error propagation back to the UI.

**Tech Stack:** TanStack Start, React, Convex, fluent-convex, Tailwind, shadcn/ui, Vitest, convex-test

---

## Scope Lock

### Top-level UI choices

- `Canonical only`
- `FairLend app-owned execution`
- `Immediate Rotessa activation`

### Exposed execution strategies for this iteration

- App-owned:
  - `manual`
- Provider-managed:
  - `pad_rotessa`

### Explicitly out of scope for this iteration

- app-owned `mock_pad`
- app-owned `pad_vopay`
- app-owned `pad_rotessa`
- refinance/transfer migration workflow for reusing one external schedule across multiple mortgages

## Current Behavior Correction

- `No collection rail yet` is not actually “no collections.” The backend still commits the mortgage, generates obligations, and bootstraps app-owned collection plan entries.
- `FairLend app-owned` does not currently choose a rail or method. Origination bootstrap still hard-codes app-owned entries as `method: "manual"`.
- `provider_managed_now` is not just a method. It is a post-commit orchestration branch that creates and links an external recurring schedule after canonical commit succeeds.

## File Structure

### Existing files to modify

- `src/lib/admin-origination.ts`
- `src/components/admin/origination/CollectionsStep.tsx`
- `src/components/admin/origination/ReviewStep.tsx`
- `src/components/admin/origination/OriginationWorkspacePage.tsx`
- `src/components/admin/shell/dedicated-detail-panels.tsx`
- `convex/admin/origination/validators.ts`
- `convex/admin/origination/collections.ts`
- `convex/payments/rotessa/client.ts`
- `convex/crons.ts`
- `convex/schema.ts`
- `src/components/admin/financial-ledger/payment-operations-page.tsx`
- `src/components/admin/financial-ledger/types.ts`
- `src/components/admin/financial-ledger/search.ts`
- `src/routes/admin/payment-operations.tsx`

### New files to create

- `src/components/admin/origination/collections/CollectionsIntentSelector.tsx`
- `src/components/admin/origination/collections/AppOwnedManualPanel.tsx`
- `src/components/admin/origination/collections/RotessaBorrowerCombobox.tsx`
- `src/components/admin/origination/collections/RotessaBorrowerScheduleLinker.tsx`
- `src/components/admin/origination/collections/RotessaCustomerSchedulePicker.tsx`
- `src/components/admin/origination/collections/PadAuthorizationPanel.tsx`
- `src/components/admin/origination/collections/CreateBorrowerDialog.tsx`
- `convex/admin/origination/rotessaSetup.ts`
- `convex/payments/rotessa/sync.ts`
- `src/routes/admin/rotessa-reconciliation.tsx`
- `src/test/admin/origination/collections-step.test.tsx`
- `src/test/convex/admin/origination/rotessaSetup.test.ts`
- `src/test/convex/payments/rotessaSync.test.ts`

### New canonical linkage tables

- `externalCustomerProfiles`
- `externalScheduleBorrowerLinks`

### Existing canonical table to keep authoritative on the mortgage side

- `externalCollectionSchedules`

### Existing asset linkage to reuse

- `documentAssets`

## Additional Requirements To Preserve

- Rotessa sandbox test customers and schedules must all be surfaced through the sync/import layer once implementation is complete.
- Add a new Rotessa sync/reconciliation cron that runs a few times per day.
- The immediate Rotessa UI must be a two-column interaction:
  - left column: borrower autocomplete
  - right column: schedules for that borrower, disabled until borrower selection
- Already-assigned schedules must remain visible but greyed out and non-selectable.
- `Create new payment schedule` must reuse data from the Core Economics / mortgage terms step:
  - `paymentAmount`
  - `paymentFrequency`
  - `firstPaymentDate`
- Creating a new schedule requires PAD authorization evidence or audited admin override.
- User feedback must use `sonner` toasts, matching existing app conventions.

## Task 1: Redesign `collectionsDraft` Around Intent, Strategy, And Activation State

**Files:**
- Modify: `src/lib/admin-origination.ts`
- Modify: `convex/admin/origination/validators.ts`
- Modify: `convex/admin/origination/collections.ts`
- Modify: `src/components/admin/origination/ReviewStep.tsx`
- Test: `src/test/convex/admin/origination/validators.test.ts`

- [ ] **Step 1: Write the failing validator tests for the new draft model**

```ts
it("requires executionStrategy when executionIntent is app_owned", () => {
  const snapshot = computeOriginationValidationSnapshot({
    collectionsDraft: {
      executionIntent: "app_owned",
    },
  } as OriginationCaseDraftState);

  expect(snapshot.stepErrors?.collections).toContain(
    "App-owned collections require an execution strategy."
  );
});

it("requires PAD authorization before immediate Rotessa activation", () => {
  const snapshot = computeOriginationValidationSnapshot({
    collectionsDraft: {
      executionIntent: "provider_managed_now",
      providerCode: "pad_rotessa",
      borrowerSource: "existing",
      scheduleSource: "existing",
      selectedBorrowerId: "borrower_1",
    },
  } as OriginationCaseDraftState);

  expect(snapshot.stepErrors?.collections).toContain(
    "Immediate Rotessa activation requires PAD authorization evidence or an audited override."
  );
});
```

- [ ] **Step 2: Replace the coarse draft type**

```ts
export interface OriginationCollectionsDraft {
  executionIntent?: "canonical_only" | "app_owned" | "provider_managed_now";
  executionStrategy?: "manual";
  providerCode?: "pad_rotessa";
  providerManagedActivationStatus?: "pending" | "activating" | "active" | "failed";
  borrowerSource?: "existing" | "create";
  scheduleSource?: "existing" | "create";
  selectedBorrowerId?: string;
  selectedExternalCustomerProfileId?: string;
  selectedExternalCollectionScheduleId?: string;
  selectedBankAccountId?: string;
  padAuthorizationSource?: "uploaded" | "admin_override";
  padAuthorizationAssetId?: string;
  padAuthorizationOverrideReason?: string;
  lastError?: string;
  retryCount?: number;
  lastAttemptAt?: number;
  externalCollectionScheduleId?: string;
}
```

- [ ] **Step 3: Normalize the new shape with backward-compatible fallback**

```ts
export function normalizeOriginationCollectionsDraft(
  value: OriginationCollectionsDraftValue | undefined
) {
  if (!value) {
    return undefined;
  }

  const executionIntent =
    value.executionIntent ??
    (value.mode === "provider_managed_now"
      ? "provider_managed_now"
      : value.mode === "app_owned_only"
        ? "app_owned"
        : "canonical_only");

  return pruneObject({
    executionIntent,
    executionStrategy:
      executionIntent === "app_owned" ? value.executionStrategy ?? "manual" : undefined,
    providerCode:
      executionIntent === "provider_managed_now"
        ? value.providerCode ?? "pad_rotessa"
        : undefined,
    providerManagedActivationStatus:
      executionIntent === "provider_managed_now"
        ? value.providerManagedActivationStatus ?? "pending"
        : undefined,
    borrowerSource: value.borrowerSource,
    scheduleSource: value.scheduleSource,
    selectedBorrowerId: value.selectedBorrowerId,
    selectedExternalCustomerProfileId: value.selectedExternalCustomerProfileId,
    selectedExternalCollectionScheduleId: value.selectedExternalCollectionScheduleId,
    selectedBankAccountId: value.selectedBankAccountId,
    padAuthorizationSource: value.padAuthorizationSource,
    padAuthorizationAssetId: value.padAuthorizationAssetId,
    padAuthorizationOverrideReason: trimToUndefined(value.padAuthorizationOverrideReason),
    lastError: trimToUndefined(value.lastError),
    retryCount: value.retryCount,
    lastAttemptAt: value.lastAttemptAt,
    externalCollectionScheduleId: value.externalCollectionScheduleId,
  });
}
```

- [ ] **Step 4: Enforce the new validation rules**

```ts
function buildCollectionsValidationErrors(values: OriginationCaseDraftState) {
  const draft = values.collectionsDraft;
  if (!draft) return [];

  if (draft.executionIntent === "app_owned") {
    return collectMissingFieldErrors([
      {
        value: draft.executionStrategy,
        message: "App-owned collections require an execution strategy.",
      },
    ]);
  }

  if (draft.executionIntent !== "provider_managed_now") {
    return [];
  }

  return [
    ...collectMissingFieldErrors([
      {
        value: draft.providerCode ?? "pad_rotessa",
        message: "Immediate Rotessa activation requires a provider.",
      },
      {
        value: draft.borrowerSource,
        message: "Immediate Rotessa activation requires a borrower source.",
      },
      {
        value: draft.scheduleSource,
        message: "Immediate Rotessa activation requires a schedule source.",
      },
      {
        value: draft.selectedBorrowerId,
        message: "Immediate Rotessa activation requires a canonical borrower selection.",
      },
      {
        value: draft.padAuthorizationSource,
        message:
          "Immediate Rotessa activation requires PAD authorization evidence or an audited override.",
      },
    ]),
    ...(draft.padAuthorizationSource === "uploaded" && !draft.padAuthorizationAssetId
      ? ["Upload the signed PAD form before activating Rotessa."]
      : []),
    ...(draft.padAuthorizationSource === "admin_override" &&
    !draft.padAuthorizationOverrideReason
      ? ["Administrative PAD overrides require a reason."]
      : []),
  ];
}
```

- [ ] **Step 5: Run the validator suite**

Run: `bun run test src/test/convex/admin/origination/validators.test.ts`
Expected: PASS with the new validation failures and backward-compat normalization.

## Task 2: Add Canonical External Linkage Records For Rotessa Customers And Borrower Links

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/admin/origination/rotessaSetup.ts`
- Test: `src/test/convex/admin/origination/rotessaSetup.test.ts`

- [ ] **Step 1: Write the failing linkage tests**

```ts
it("rejects linking one external schedule to two active mortgages", async () => {
  await expect(
    linkExistingRotessaScheduleToMortgage(ctx, {
      externalCollectionScheduleId: existingScheduleId,
      mortgageId: secondMortgageId,
    })
  ).rejects.toThrow(
    "External schedules cannot be linked to multiple active mortgages without an explicit migration workflow."
  );
});

it("rejects linking one Rotessa recurring schedule to multiple borrower identities", async () => {
  await expect(
    attachExternalScheduleBorrowerLink(ctx, {
      externalScheduleRef: "rotessa-123",
      borrowerId: borrowerBId,
      providerCode: "pad_rotessa",
    })
  ).rejects.toThrow(
    "Rotessa recurring schedules cannot be linked to multiple canonical borrower identities."
  );
});
```

- [ ] **Step 2: Add canonical linkage tables**

```ts
externalCustomerProfiles: defineTable({
  providerCode: v.literal("pad_rotessa"),
  externalCustomerRef: v.string(),
  borrowerId: v.id("borrowers"),
  status: v.union(
    v.literal("active"),
    v.literal("conflict"),
    v.literal("archived")
  ),
  lastSyncedAt: v.number(),
  provenance: v.union(
    v.literal("rotessa_sync"),
    v.literal("admin_link"),
    v.literal("origination_create")
  ),
  metadata: v.optional(v.record(v.string(), v.any())),
})
  .index("by_provider_customer", ["providerCode", "externalCustomerRef"])
  .index("by_borrower", ["borrowerId", "status"]),

externalScheduleBorrowerLinks: defineTable({
  providerCode: v.literal("pad_rotessa"),
  externalScheduleRef: v.string(),
  borrowerId: v.id("borrowers"),
  externalCustomerProfileId: v.optional(v.id("externalCustomerProfiles")),
  status: v.union(
    v.literal("active"),
    v.literal("conflict"),
    v.literal("archived")
  ),
  linkedAt: v.number(),
  linkedByUserId: v.optional(v.id("users")),
  lastSyncedAt: v.optional(v.number()),
})
  .index("by_provider_schedule", ["providerCode", "externalScheduleRef"])
  .index("by_borrower", ["borrowerId", "status"])
```

- [ ] **Step 3: Add safe admin mutations for canonical linking**

```ts
export const linkExternalCustomerProfile = adminMutation
  .input({
    borrowerId: v.id("borrowers"),
    externalCustomerRef: v.string(),
    providerCode: v.literal("pad_rotessa"),
  })
  .handler(async (ctx, args) => {
    const existing = await ctx.db
      .query("externalCustomerProfiles")
      .withIndex("by_provider_customer", (q) =>
        q.eq("providerCode", args.providerCode).eq("externalCustomerRef", args.externalCustomerRef)
      )
      .first();

    if (existing && existing.borrowerId !== args.borrowerId && existing.status === "active") {
      throw new ConvexError(
        "Rotessa customers must map to exactly one canonical borrower unless explicitly reconciled as a conflict."
      );
    }

    // Upsert active canonical link.
  })
  .public();
```

- [ ] **Step 4: Run the linkage tests**

Run: `bun run test src/test/convex/admin/origination/rotessaSetup.test.ts`
Expected: PASS with coverage for customer uniqueness, schedule uniqueness, and conflict-state creation.

## Task 3: Add Rotessa Sync Read Models On Top Of The Existing Client Primitives

**Files:**
- Create: `convex/payments/rotessa/sync.ts`
- Modify: `convex/payments/rotessa/client.ts`
- Modify: `convex/crons.ts`
- Modify: `convex/admin/origination/rotessaSetup.ts`
- Test: `src/test/convex/payments/rotessaSync.test.ts`

- [ ] **Step 1: Write the failing sync tests**

```ts
it("imports Rotessa customers into externalCustomerProfiles candidates", async () => {
  const result = await syncRotessaCustomersAndSchedules(ctx, { orgId });
  expect(result.customersSeen).toBe(2);
  expect(result.schedulesSeen).toBe(3);
});

it("marks unmatched schedules as reconciliation candidates", async () => {
  const result = await syncRotessaCustomersAndSchedules(ctx, { orgId });
  expect(result.unmatchedSchedules).toBe(1);
});

it("surfaces all sandbox customers and schedules returned by Rotessa", async () => {
  const result = await syncRotessaCustomersAndSchedules(ctx, { orgId });
  expect(result.customersSeen).toBeGreaterThan(0);
  expect(result.schedulesSeen).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Reuse the existing client as-is**

```ts
const customers = await client.customers.list();

for (const customer of customers) {
  const detail = await client.customers.get(customer.id);

  for (const schedule of detail.transaction_schedules) {
    // Upsert sync rows derived from customer + schedule detail.
  }
}
```

- [ ] **Step 3: Add sync output rows used by origination and reconciliation**

```ts
type RotessaSyncedScheduleRow = {
  externalCustomerRef: string;
  externalScheduleRef: string;
  borrowerId?: Id<"borrowers">;
  status: "available" | "linked" | "conflict" | "unmatched";
  amountCents: number;
  frequency: string;
  nextProcessDate?: string;
};
```

- [ ] **Step 4: Add a scheduled sync job that runs a few times per day**

```ts
export const syncRotessaReadModels = internalAction({
  args: {
    orgId: v.optional(v.string()),
    full: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Load Rotessa customers, customer details, and schedules,
    // then upsert canonical external read models and reconciliation facts.
  },
});
```

```ts
crons.interval(
  "rotessa customer and schedule sync",
  { hours: 8 },
  internal.payments.rotessa.sync.syncRotessaReadModels,
  {}
);
```

- [ ] **Step 5: Add admin queries for origination pickers**

- [ ] **Step 4: Add admin queries for origination pickers**

```ts
export const searchBorrowersForRotessaActivation = adminQuery
  .input({ search: v.string() })
  .handler(async (ctx, args) => {
    // Search canonical borrowers first, then decorate with external customer linkage.
  })
  .public();

export const listAvailableRotessaSchedulesForBorrower = adminQuery
  .input({ borrowerId: v.id("borrowers") })
  .handler(async (ctx, args) => {
    // Return only unlinked schedules or schedules linked to the same borrower
    // and not attached to another active mortgage.
  })
  .public();
```

- [ ] **Step 6: Run the sync tests**

Run: `bun run test src/test/convex/payments/rotessaSync.test.ts`
Expected: PASS with customer import, schedule import, unmatched detection, conflict marking, and cron-covered sync entrypoints.

## Task 4: Rebuild The Origination Collections UI Around A Two-Column Borrower/Schedule Linker, Canonical Borrowers, And PAD Authorization

**Files:**
- Modify: `src/components/admin/origination/CollectionsStep.tsx`
- Create: `src/components/admin/origination/collections/CollectionsIntentSelector.tsx`
- Create: `src/components/admin/origination/collections/AppOwnedManualPanel.tsx`
- Create: `src/components/admin/origination/collections/RotessaBorrowerCombobox.tsx`
- Create: `src/components/admin/origination/collections/RotessaBorrowerScheduleLinker.tsx`
- Create: `src/components/admin/origination/collections/RotessaCustomerSchedulePicker.tsx`
- Create: `src/components/admin/origination/collections/PadAuthorizationPanel.tsx`
- Create: `src/components/admin/origination/collections/CreateBorrowerDialog.tsx`
- Test: `src/test/admin/origination/collections-step.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

```tsx
it("shows the three top-level choices with reality-aligned labels", () => {
  render(<CollectionsStep caseId="case_1" onChange={vi.fn()} />);
  expect(screen.getByText("Canonical only")).toBeTruthy();
  expect(screen.getByText("FairLend app-owned execution")).toBeTruthy();
  expect(screen.getByText("Immediate Rotessa activation")).toBeTruthy();
});

it("requires selecting the manual strategy when app-owned execution is chosen", async () => {
  render(<CollectionsStep caseId="case_1" onChange={onChange} />);
  fireEvent.click(screen.getByLabelText("FairLend app-owned execution"));
  fireEvent.click(screen.getByLabelText("Manual"));
  expect(onChange).toHaveBeenCalled();
});

it("uses a two-column borrower then schedule flow for immediate Rotessa activation", async () => {
  render(<CollectionsStep caseId="case_1" onChange={onChange} />);
  fireEvent.click(screen.getByLabelText("Immediate Rotessa activation"));

  expect(screen.getByText("Borrower")).toBeTruthy();
  expect(screen.getByText("Payment schedules")).toBeTruthy();
  expect(screen.getByText("Select a borrower to load schedules.")).toBeTruthy();
});
```

- [ ] **Step 2: Build the top-level intent selector**

```tsx
<CollectionsIntentSelector
  draft={draft}
  onChange={onChange}
  options={[
    {
      value: "canonical_only",
      label: "Canonical only",
      description: "Commit the mortgage and bootstrap canonical obligations without selecting an execution workflow now.",
    },
    {
      value: "app_owned",
      label: "FairLend app-owned execution",
      description: "FairLend owns servicing and execution. Initial strategy: manual collection handling.",
    },
    {
      value: "provider_managed_now",
      label: "Immediate Rotessa activation",
      description: "Commit canonically first, then activate a Rotessa recurring schedule for the selected borrower.",
    },
  ]}
/>
```

- [ ] **Step 3: Keep app-owned scope narrow**

```tsx
<AppOwnedManualPanel
  value={draft.executionStrategy}
  onChange={(executionStrategy) =>
    onChange({
      ...draft,
      executionIntent: "app_owned",
      executionStrategy,
    })
  }
  strategies={[
    {
      value: "manual",
      label: "Manual",
      description: "Cash, cheque, or non-API collection handling tracked in the app.",
    },
  ]}
/>
```

- [ ] **Step 4: Replace free-text borrower entry with canonical borrower selection or create flow**

```tsx
<RotessaBorrowerCombobox
  selectedBorrowerId={draft.selectedBorrowerId}
  onSelectBorrower={(borrower) =>
    onChange({
      ...draft,
      borrowerSource: "existing",
      selectedBorrowerId: borrower.borrowerId,
    })
  }
/>

<CreateBorrowerDialog
  onBorrowerCreated={(borrower) =>
    onChange({
      ...draft,
      borrowerSource: "create",
      selectedBorrowerId: borrower.borrowerId,
    })
  }
/>
```

- [ ] **Step 5: Build the two-column borrower/schedule linker**

```tsx
<RotessaBorrowerScheduleLinker
  borrowerColumn={
    <RotessaBorrowerCombobox
      selectedBorrowerId={draft.selectedBorrowerId}
      onSelectBorrower={handleBorrowerSelect}
    />
  }
  scheduleColumn={
    <RotessaCustomerSchedulePicker
      borrowerId={draft.selectedBorrowerId}
      disabled={!draft.selectedBorrowerId}
      selectedExternalCollectionScheduleId={draft.selectedExternalCollectionScheduleId}
      onUseExistingSchedule={handleExistingScheduleSelect}
      onCreateNewSchedule={handleCreateNewSchedule}
    />
  }
/>
```

- [ ] **Step 6: Add existing-schedule vs create-schedule decision surface**

```tsx
<RotessaCustomerSchedulePicker
  borrowerId={draft.selectedBorrowerId}
  scheduleSource={draft.scheduleSource}
  selectedExternalCustomerProfileId={draft.selectedExternalCustomerProfileId}
  selectedExternalCollectionScheduleId={draft.selectedExternalCollectionScheduleId}
  onUseExistingSchedule={(selection) =>
    onChange({
      ...draft,
      scheduleSource: "existing",
      selectedExternalCustomerProfileId: selection.externalCustomerProfileId,
      selectedExternalCollectionScheduleId: selection.externalCollectionScheduleId,
      selectedBankAccountId: selection.bankAccountId,
    })
  }
  onCreateNewSchedule={(selection) =>
    onChange({
      ...draft,
      scheduleSource: "create",
      selectedExternalCustomerProfileId: selection.externalCustomerProfileId,
      selectedBankAccountId: selection.bankAccountId,
    })
  }
/>
```

- [ ] **Step 7: Show already-assigned schedules as greyed out instead of hiding them**

```tsx
<ScheduleRow
  disabled={schedule.status === "linked"}
  muted={schedule.status === "linked"}
  subtitle={
    schedule.status === "linked"
      ? `Already linked to mortgage ${schedule.linkedMortgageLabel ?? schedule.linkedMortgageId}`
      : schedule.nextProcessDate
  }
/>
```

- [ ] **Step 8: Make `Create new payment schedule` reuse Core Economics data**

```ts
const scheduleSeed = {
  amountCents: draftValues.mortgageDraft?.paymentAmount,
  frequency: draftValues.mortgageDraft?.paymentFrequency,
  processDate: draftValues.mortgageDraft?.firstPaymentDate,
};
```

```tsx
<Button
  disabled={!draft.selectedBorrowerId}
  onClick={() => openCreateScheduleDialog(scheduleSeed)}
  type="button"
  variant="outline"
>
  Create new payment schedule
</Button>
```

- [ ] **Step 9: Make PAD authorization first-class**

```tsx
<PadAuthorizationPanel
  assetId={draft.padAuthorizationAssetId}
  source={draft.padAuthorizationSource}
  overrideReason={draft.padAuthorizationOverrideReason}
  onChange={(nextValue) => onChange({ ...draft, ...nextValue })}
/>
```

- [ ] **Step 10: Auto-fill summary fields when an existing schedule is selected**

```ts
const scheduleSummary = selectedSchedule
  ? {
      borrowerName: selectedSchedule.borrowerName,
      cadence: selectedSchedule.frequency,
      nextProcessDate: selectedSchedule.nextProcessDate,
      amountCents: selectedSchedule.amountCents,
      bankSummary: selectedSchedule.bankSummary,
    }
  : null;
```

- [ ] **Step 11: Add `sonner` toast notifications for user-visible success/failure**

```tsx
import { toast } from "sonner";

try {
  await saveDraft(nextDraft);
  toast.success("Collections setup saved.");
} catch (error) {
  toast.error(error instanceof Error ? error.message : "Unable to save collections setup.");
}
```

- [ ] **Step 12: Run the collections step tests**

Run: `bun run test src/test/admin/origination/collections-step.test.tsx`
Expected: PASS with canonical-only, app-owned manual, two-column borrower/schedule flow, greyed linked schedules, create-borrower flow, and create-schedule prefill.

## Task 5: Wire Immediate Rotessa Activation And New-Schedule Creation With Compensating Atomicity Guarantees

**Files:**
- Modify: `convex/admin/origination/collections.ts`
- Modify: `src/components/admin/shell/dedicated-detail-panels.tsx`
- Test: `src/test/convex/admin/origination/commit.test.ts`

- [ ] **Step 1: Write the failing activation tests**

```ts
it("rejects immediate activation when the selected Rotessa customer does not match the chosen canonical borrower", async () => {
  await expect(
    commitWithRotessaSelection(t, {
      borrowerId: borrowerAId,
      externalCustomerProfileId: customerLinkedToBorrowerBId,
    })
  ).rejects.toThrow(
    "The selected Rotessa customer is not linked to the chosen canonical borrower."
  );
});

it("rejects reusing an external schedule already linked to another active mortgage", async () => {
  await expect(
    commitWithRotessaSelection(t, {
      externalCollectionScheduleId: linkedScheduleId,
      mortgageId: secondMortgageId,
    })
  ).rejects.toThrow(
    "External schedules cannot be linked to multiple active mortgages without an explicit migration workflow."
  );
});

it("rolls back provider state when new Rotessa schedule finalization fails", async () => {
  await expect(
    commitWithRotessaSelection(t, {
      borrowerId: borrowerAId,
      scheduleSource: "create",
      simulateFinalizeFailure: true,
    })
  ).rejects.toThrow("Immediate Rotessa activation failed and all staged changes were rolled back.");
});
```

- [ ] **Step 2: Translate the new draft shape into the existing activation flow**

```ts
if (draft.executionIntent !== "provider_managed_now") {
  return { status: "skipped" as const };
}

assertCanonicalBorrowerMatchesExternalCustomer(draft);
assertPadAuthorizationPresent(draft);
assertExternalScheduleEligibility(draft);

return ctx.runAction(activateCommittedCaseCollectionsRef, {
  caseId: args.caseId,
  viewerUserId: args.viewerUserId,
});
```

- [ ] **Step 3: Resolve schedule selection through canonical links, not metadata-only lookup**

```ts
const externalCustomerProfile = await ctx.db.get(
  draft.selectedExternalCustomerProfileId as Id<"externalCustomerProfiles">
);

if (!externalCustomerProfile || externalCustomerProfile.borrowerId !== borrowerId) {
  throw new ConvexError(
    "The selected Rotessa customer is not linked to the chosen canonical borrower."
  );
}
```

- [ ] **Step 4: Create new schedules from Core Economics values when requested**

```ts
const scheduleCreateInput = {
  amount: requirePaymentAmountFromMortgageDraft(caseRecord.mortgageDraft),
  frequency: mapMortgageFrequencyToRotessaFrequency(
    requirePaymentFrequencyFromMortgageDraft(caseRecord.mortgageDraft)
  ),
  processDate: requireFirstPaymentDateFromMortgageDraft(caseRecord.mortgageDraft),
  providerCode: "pad_rotessa" as const,
  ...customerReference,
};
```

- [ ] **Step 5: Implement compensating atomicity for external create + internal finalize**

```ts
let createdExternalScheduleRef: string | undefined;

try {
  const providerSchedule = await provider.createSchedule(scheduleCreateInput);
  createdExternalScheduleRef = providerSchedule.externalScheduleRef;

  await ctx.runMutation(finalizeImmediateRotessaLinkageRef, {
    caseId,
    externalScheduleRef: createdExternalScheduleRef,
    // all FairLend writes happen in this one mutation
  });
} catch (error) {
  if (createdExternalScheduleRef) {
    await provider.cancelSchedule(createdExternalScheduleRef);
  }

  throw new ConvexError(
    "Immediate Rotessa activation failed and all staged changes were rolled back."
  );
}
```

- [ ] **Step 6: Keep the current mortgage-side schedule link authoritative**

```ts
await ctx.db.patch(scheduleId, {
  borrowerId,
  mortgageId,
  providerCode: "pad_rotessa",
});
```

- [ ] **Step 7: Return typed user-facing results that map cleanly to `toast.success` / `toast.error`**

```ts
return {
  outcome: "failed" as const,
  userMessage:
    "Rotessa activation failed. No borrower, schedule, or mortgage-side link changes were persisted.",
};
```

- [ ] **Step 8: Improve the committed mortgage detail panel**

```tsx
<MetricGrid
  items={[
    { label: "Execution Intent", value: formatEnumLabel(paymentSetup.executionIntent) },
    { label: "Execution Strategy", value: paymentSetup.executionStrategy ?? "N/A" },
    { label: "Provider Activation", value: paymentSetup.activationStatus ?? "Not requested" },
    { label: "PAD Authorization", value: paymentSetup.padAuthorizationSource ?? "Missing" },
  ]}
/>
```

- [ ] **Step 9: Run the commit tests**

Run: `bun run test src/test/convex/admin/origination/commit.test.ts`
Expected: PASS with borrower/customer mismatch rejection, schedule reuse rejection, PAD authorization enforcement, create-schedule prefill flow, and compensating rollback on finalize failure.

## Task 6: Add A Dedicated Rotessa Reconciliation Screen

**Files:**
- Create: `src/routes/admin/rotessa-reconciliation.tsx`
- Modify: `src/components/admin/financial-ledger/payment-operations-page.tsx`
- Modify: `src/components/admin/financial-ledger/types.ts`
- Modify: `src/components/admin/financial-ledger/search.ts`
- Modify: `convex/admin/origination/rotessaSetup.ts`
- Test: `src/test/convex/admin/origination/rotessaSetup.test.ts`

- [ ] **Step 1: Write the failing reconciliation query tests**

```ts
it("lists unmatched customers, unmatched schedules, conflicts, and PAD exceptions", async () => {
  const snapshot = await t.run(async (ctx) =>
    getRotessaReconciliationSnapshot(ctx, { orgId })
  );

  expect(snapshot.tabs.unmatchedCustomers.length).toBe(1);
  expect(snapshot.tabs.unmatchedSchedules.length).toBe(1);
  expect(snapshot.tabs.conflicts.length).toBe(1);
  expect(snapshot.tabs.padAuthorizationExceptions.length).toBe(1);
});
```

- [ ] **Step 2: Add the dedicated route**

```tsx
export const Route = createFileRoute("/admin/rotessa-reconciliation")({
  component: RotessaReconciliationRoutePage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(rotessaReconciliationQueryOptions);
  },
});
```

- [ ] **Step 3: Model the screen tabs exactly as requested**

```ts
type RotessaReconciliationTab =
  | "unmatched-customers"
  | "unmatched-schedules"
  | "conflicts"
  | "broken-links"
  | "pad-authorization-exceptions";
```

- [ ] **Step 4: Expose auditable admin actions**

```ts
export const reconcileRotessaCustomerToBorrower = adminMutation
  .input({
    borrowerId: v.id("borrowers"),
    externalCustomerRef: v.string(),
    reason: v.string(),
  })
  .handler(async (ctx, args) => {
    await auditLog.log(ctx, {
      action: "rotessa.customer_linked",
      actorId: ctx.viewer.authId,
      metadata: {
        borrowerId: `${args.borrowerId}`,
        externalCustomerRef: args.externalCustomerRef,
        reason: args.reason,
      },
      resourceId: args.externalCustomerRef,
      resourceType: "externalCustomerProfiles",
      severity: "info",
    });
  })
  .public();
```

- [ ] **Step 5: Add UI actions**

```tsx
<ActionButtonRow
  actions={[
    { label: "Link customer to borrower", onClick: handleLinkCustomer },
    { label: "Create borrower from customer", onClick: handleCreateBorrower },
    { label: "Reassign schedule", onClick: handleReassignSchedule },
    { label: "Archive stale link", onClick: handleArchiveLink },
    { label: "Suppress false positive", onClick: handleSuppress },
  ]}
/>
```

- [ ] **Step 6: Run the reconciliation tests**

Run: `bun run test src/test/convex/admin/origination/rotessaSetup.test.ts`
Expected: PASS with snapshot rows and auditable reconciliation actions.

## Task 7: Full Verification

**Files:**
- No additional product files

- [ ] **Step 1: Regenerate Convex codegen**

Run: `bunx convex codegen`
Expected: PASS

- [ ] **Step 2: Run formatting, linting, and static checks**

Run: `bun check`
Expected: PASS

- [ ] **Step 3: Run type checks**

Run: `bun typecheck`
Expected: PASS

- [ ] **Step 4: Run focused tests**

Run: `bun run test src/test/admin/origination/collections-step.test.tsx src/test/convex/admin/origination/validators.test.ts src/test/convex/admin/origination/commit.test.ts src/test/convex/admin/origination/rotessaSetup.test.ts src/test/convex/payments/rotessaSync.test.ts`
Expected: PASS

- [ ] **Step 5: Run review**

Run: `bun run review`
Expected: PASS or only pre-existing findings

## Spec Coverage Check

- Separate coarse `mode` into intent, strategy, and activation state: covered by Task 1.
- Limit exposed strategies to app-owned manual and provider-managed Rotessa: covered by Task 1 and Task 4.
- Replace free-text borrower flow with canonical borrower autocomplete and create modal: covered by Task 4.
- Support borrower source and bank/schedule source primitives: covered by Task 1 and Task 4.
- Make PAD upload or override mandatory: covered by Task 1, Task 4, and Task 5.
- Prevent multi-borrower schedule links and multi-mortgage active schedule reuse: covered by Task 2 and Task 5.
- Require Rotessa customer to match canonical borrower mapping: covered by Task 2 and Task 5.
- Build sync/read-model layer instead of relying on raw API capability alone: covered by Task 3.
- Add dedicated `Admin > Payments > Rotessa Reconciliation` screen: covered by Task 6.
- Surface existing sandbox customers and schedules through sync/import: covered by Task 3.
- Add scheduled sync/reconciliation a few times per day: covered by Task 3.
- Use a two-column borrower then schedule component: covered by Task 4.
- Reuse Core Economics values when creating a new schedule: covered by Task 4 and Task 5.
- Use `sonner` toasts for success/failure feedback: covered by Task 4 and Task 5.
- Treat the flow as atomic on the FairLend side with compensating rollback for provider-created state: covered by Task 5.

## Recommended First Execution Slice

Highest leverage order:

1. `collectionsDraft` redesign and validators
2. app-owned manual selector + relabeled collections step
3. canonical external linkage tables
4. borrower autocomplete + create modal
5. immediate Rotessa linking flow
6. dedicated reconciliation screen

Plan complete and saved to `docs/superpowers/plans/2026-04-18-origination-collections-rotessa-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
