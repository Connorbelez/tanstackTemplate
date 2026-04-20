# Mortgage Payment Snapshots and Admin Table Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add snapshot-backed most recent payment and next upcoming payment support to the admin mortgages table, make those columns filterable and sortable, reuse the same snapshot on the mortgage detail page, and ship reusable header controls for search, column visibility, per-column filter/sort, and aggregate footers.

**Architecture:** Introduce a canonical `mortgagePaymentSnapshot` read-model in Convex, enrich native mortgage CRM records with structured snapshot fields before view filtering/sorting, and extend saved views with persisted sort state. On the frontend, add reusable admin table header/footer primitives that both the CRM shell and existing table toolbar can share, then render snapshot-aware cells and footer summaries from backend-provided metadata.

**Tech Stack:** Convex + fluent-convex, React 19 + TanStack Start, ShadCN UI, Vitest + React Testing Library, Playwright, Biome, TypeScript

---

## File Structure

**Create**

- `convex/payments/mortgagePaymentSnapshot.ts`
  Canonical snapshot types, pure derivation helpers, and batched loader for mortgage payment state.
- `convex/payments/__tests__/mortgagePaymentSnapshot.test.ts`
  Pure helper coverage for precedence rules and `none` handling.
- `convex/crm/tableFooterAggregates.ts`
  Backend footer-summary builder for visible table columns.
- `src/components/admin/shell/AdminTableHeaderControls.tsx`
  Reusable header strip for inline search, global filters, restore defaults, clear all, and columns trigger.
- `src/components/admin/shell/AdminTableColumnVisibilityPopover.tsx`
  Reusable searchable visible/hidden fields popover.
- `src/components/admin/shell/AdminTableColumnHeaderControls.tsx`
  Per-column filter/sort affordance anchored in each visible column header.
- `src/components/admin/shell/AdminTableAggregateFooter.tsx`
  Footer row renderer for backend-provided column summaries.
- `src/test/admin/admin-table-header-controls.test.tsx`
  UI tests for inline search, columns popover, and per-column controls.

**Modify**

- `convex/crm/types.ts`
  Add saved-view sort state and table-footer aggregate result shape.
- `convex/crm/validators.ts`
  Validate saved-view sort payloads.
- `convex/schema.ts`
  Persist saved-view sort state on `userSavedViews`.
- `convex/crm/userSavedViews.ts`
  Accept and persist sort updates.
- `convex/crm/viewState.ts`
  Overlay saved-view sort into effective table state.
- `convex/crm/viewQueries.ts`
  Apply saved-view sort and return table footer aggregates for table results.
- `convex/crm/systemAdapters/bootstrap.ts`
  Register snapshot-backed mortgage fields and make the new visible columns default-visible.
- `convex/crm/systemAdapters/queryAdapter.ts`
  Enrich native mortgage rows with snapshot fields before filters/sorts run.
- `convex/crm/systemAdapters/__tests__/queryAdapter.test.ts`
  Prove native mortgage rows include snapshot fields during query assembly.
- `convex/crm/__tests__/viewEngine.test.ts`
  Prove snapshot-backed filtering/sorting and footer aggregate behavior.
- `convex/crm/__tests__/userSavedViews.test.ts`
  Prove saved-view sort persistence and overlay.
- `convex/crm/__tests__/detailContextQueries.test.ts`
  Prove mortgage detail returns the shared snapshot contract.
- `convex/crm/detailContextQueries.ts`
  Reuse the shared snapshot loader in mortgage detail context.
- `convex/crm/entityAdapterRegistry.ts`
  Update mortgage preferred visible fields to use snapshot-backed columns instead of the old `paymentSummary`.
- `src/components/admin/shell/AdminEntityViewPage.tsx`
  Wire saved-view sort/visibility mutations and pass new header/footer props to the table view.
- `src/components/admin/shell/AdminEntityViewToolbar.tsx`
  Slim down to title + mode switching so header controls live with the table.
- `src/components/admin/shell/AdminEntityTableView.tsx`
  Render reusable header controls, per-column menus, snapshot-aware cells, and footer row.
- `src/components/admin/shell/EntityTableToolbar.tsx`
  Reuse the new shared header primitives so the interface is consistent across admin tables.
- `src/components/admin/shell/admin-view-rendering.tsx`
  Render `Most Recent Payment` and `Next Upcoming Payment` as composite cells from sibling snapshot fields.
- `src/components/admin/shell/dedicated-detail-panels.tsx`
  Render the shared snapshot on the mortgage detail page.
- `src/test/admin/admin-shell.test.ts`
  Update shell-level helpers/fixtures for snapshot-backed columns.
- `src/test/admin/mortgage-dedicated-details.test.tsx`
  Assert detail rendering uses snapshot data.

---

### Task 1: Build the Canonical Mortgage Payment Snapshot Module

**Files:**
- Create: `convex/payments/mortgagePaymentSnapshot.ts`
- Test: `convex/payments/__tests__/mortgagePaymentSnapshot.test.ts`

- [ ] **Step 1: Write the failing precedence tests**

```ts
import { describe, expect, it } from "vitest";
import {
  deriveMostRecentPaymentSnapshot,
  deriveNextUpcomingPaymentSnapshot,
} from "../mortgagePaymentSnapshot";

describe("mortgagePaymentSnapshot", () => {
  it("prefers the latest execution outcome over obligation fallback", () => {
    const snapshot = deriveMostRecentPaymentSnapshot({
      attempts: [
        {
          amount: 2450,
          initiatedAt: Date.parse("2026-04-02T12:00:00.000Z"),
          status: "failed",
        },
      ],
      obligations: [
        {
          amount: 2450,
          dueDate: Date.parse("2026-04-01T00:00:00.000Z"),
          status: "upcoming",
        },
      ],
      transfersByAttemptId: new Map(),
    });

    expect(snapshot.status).toBe("failed");
    expect(snapshot.amount).toBe(2450);
    expect(snapshot.date).toBe(Date.parse("2026-04-02T12:00:00.000Z"));
  });

  it("falls back to the next collection plan entry before provider schedule or obligation", () => {
    const snapshot = deriveNextUpcomingPaymentSnapshot({
      asOf: Date.parse("2026-04-15T00:00:00.000Z"),
      externalSchedule: {
        nextPollAt: Date.parse("2026-04-22T00:00:00.000Z"),
        status: "active",
      },
      obligations: [
        {
          amount: 2450,
          dueDate: Date.parse("2026-05-01T00:00:00.000Z"),
          status: "upcoming",
        },
      ],
      planEntries: [
        {
          amount: 2450,
          scheduledDate: Date.parse("2026-04-30T00:00:00.000Z"),
          status: "planned",
        },
      ],
    });

    expect(snapshot.status).toBe("planned");
    expect(snapshot.amount).toBe(2450);
    expect(snapshot.date).toBe(Date.parse("2026-04-30T00:00:00.000Z"));
  });

  it("returns explicit none states when a mortgage has no payment context", () => {
    expect(
      deriveMostRecentPaymentSnapshot({
        attempts: [],
        obligations: [],
        transfersByAttemptId: new Map(),
      }).status
    ).toBe("none");

    expect(
      deriveNextUpcomingPaymentSnapshot({
        asOf: Date.parse("2026-04-15T00:00:00.000Z"),
        externalSchedule: null,
        obligations: [],
        planEntries: [],
      }).status
    ).toBe("none");
  });
});
```

- [ ] **Step 2: Run the new test to verify the missing module fails**

Run: `bun run test convex/payments/__tests__/mortgagePaymentSnapshot.test.ts`

Expected: FAIL with module-not-found or missing export errors for `mortgagePaymentSnapshot`.

- [ ] **Step 3: Implement the snapshot contract and pure derivation helpers**

```ts
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type MostRecentPaymentStatus =
  | "settled"
  | "processing"
  | "failed"
  | "reversed"
  | "cancelled"
  | "none";

export type NextUpcomingPaymentStatus =
  | "planned"
  | "provider_scheduled"
  | "executing"
  | "due"
  | "overdue"
  | "none";

export interface MortgagePaymentSnapshot {
  mostRecentPaymentAmount: number | null;
  mostRecentPaymentDate: number | null;
  mostRecentPaymentStatus: MostRecentPaymentStatus;
  nextUpcomingPaymentAmount: number | null;
  nextUpcomingPaymentDate: number | null;
  nextUpcomingPaymentStatus: NextUpcomingPaymentStatus;
}

export function deriveMostRecentPaymentSnapshot(args: {
  attempts: Array<Pick<Doc<"collectionAttempts">, "amount" | "initiatedAt" | "status" | "transferRequestId" | "_id">>;
  obligations: Array<Pick<Doc<"obligations">, "amount" | "dueDate" | "status">>;
  transfersByAttemptId: ReadonlyMap<string, Pick<Doc<"transferRequests">, "status" | "confirmedAt" | "failedAt" | "reversedAt">>;
}) {
  const latestAttempt = [...args.attempts].sort((a, b) => b.initiatedAt - a.initiatedAt)[0];
  if (latestAttempt) {
    return {
      amount: latestAttempt.amount,
      date: latestAttempt.initiatedAt,
      status: mapAttemptToMostRecentStatus(latestAttempt, args.transfersByAttemptId.get(String(latestAttempt._id))),
    } as const;
  }

  const latestObligation = [...args.obligations].sort((a, b) => b.dueDate - a.dueDate)[0];
  if (latestObligation) {
    return {
      amount: latestObligation.amount,
      date: latestObligation.dueDate,
      status: mapObligationToMostRecentStatus(latestObligation.status),
    } as const;
  }

  return { amount: null, date: null, status: "none" } as const;
}

export function deriveNextUpcomingPaymentSnapshot(args: {
  asOf: number;
  externalSchedule:
    | Pick<Doc<"externalCollectionSchedules">, "nextPollAt" | "status">
    | null;
  obligations: Array<Pick<Doc<"obligations">, "amount" | "dueDate" | "status">>;
  planEntries: Array<Pick<Doc<"collectionPlanEntries">, "amount" | "scheduledDate" | "status">>;
}) {
  const nextPlanEntry = [...args.planEntries]
    .filter((entry) => entry.status !== "cancelled" && entry.status !== "completed")
    .sort((a, b) => a.scheduledDate - b.scheduledDate)[0];

  if (nextPlanEntry) {
    return {
      amount: nextPlanEntry.amount,
      date: nextPlanEntry.scheduledDate,
      status: mapPlanEntryToNextUpcomingStatus(nextPlanEntry, args.asOf),
    } as const;
  }

  if (args.externalSchedule?.nextPollAt) {
    return {
      amount: null,
      date: args.externalSchedule.nextPollAt,
      status: "provider_scheduled" as const,
    };
  }

  const nextObligation = [...args.obligations]
    .filter((obligation) => obligation.status !== "settled" && obligation.status !== "waived")
    .sort((a, b) => a.dueDate - b.dueDate)[0];

  if (nextObligation) {
    return {
      amount: nextObligation.amount,
      date: nextObligation.dueDate,
      status: mapObligationToNextUpcomingStatus(nextObligation, args.asOf),
    } as const;
  }

  return { amount: null, date: null, status: "none" } as const;
}
```

- [ ] **Step 4: Implement the batched loader that the list and detail page will share**

```ts
export async function loadMortgagePaymentSnapshots(
  ctx: Pick<QueryCtx, "db">,
  mortgageIds: readonly Id<"mortgages">[],
  asOf = Date.now()
): Promise<Map<string, MortgagePaymentSnapshot>> {
  const uniqueMortgageIds = [...new Set(mortgageIds.map(String))].map(
    (value) => ctx.db.normalizeId("mortgages", value)
  ).filter((value): value is Id<"mortgages"> => value !== null);

  const snapshots = await Promise.all(
    uniqueMortgageIds.map(async (mortgageId) => {
      const [attempts, obligations, planEntries, externalSchedule] = await Promise.all([
        ctx.db
          .query("collectionAttempts")
          .withIndex("by_mortgage_status", (q) => q.eq("mortgageId", mortgageId))
          .collect(),
        ctx.db
          .query("obligations")
          .withIndex("by_mortgage_and_date", (q) => q.eq("mortgageId", mortgageId))
          .collect(),
        ctx.db
          .query("collectionPlanEntries")
          .withIndex("by_mortgage_status_scheduled", (q) => q.eq("mortgageId", mortgageId))
          .collect(),
        ctx.db
          .query("externalCollectionSchedules")
          .withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
          .order("desc")
          .first(),
      ]);

      const transfers = await Promise.all(
        attempts
          .map((attempt) => attempt.transferRequestId)
          .filter((transferId): transferId is Id<"transferRequests"> => Boolean(transferId))
          .map((transferId) => ctx.db.get(transferId))
      );

      const transfersByAttemptId = new Map(
        attempts.flatMap((attempt) =>
          attempt.transferRequestId
            ? [[String(attempt._id), transfers.find((transfer) => transfer?._id === attempt.transferRequestId)!] as const]
            : []
        )
      );

      const mostRecent = deriveMostRecentPaymentSnapshot({
        attempts,
        obligations,
        transfersByAttemptId,
      });
      const nextUpcoming = deriveNextUpcomingPaymentSnapshot({
        asOf,
        externalSchedule,
        obligations,
        planEntries,
      });

      return [
        String(mortgageId),
        {
          mostRecentPaymentAmount: mostRecent.amount,
          mostRecentPaymentDate: mostRecent.date,
          mostRecentPaymentStatus: mostRecent.status,
          nextUpcomingPaymentAmount: nextUpcoming.amount,
          nextUpcomingPaymentDate: nextUpcoming.date,
          nextUpcomingPaymentStatus: nextUpcoming.status,
        } satisfies MortgagePaymentSnapshot,
      ] as const;
    })
  );

  return new Map(snapshots);
}
```

- [ ] **Step 5: Re-run the snapshot tests**

Run: `bun run test convex/payments/__tests__/mortgagePaymentSnapshot.test.ts`

Expected: PASS with coverage for latest execution precedence, next plan-entry precedence, and explicit `none` states.

- [ ] **Step 6: Record the snapshot module change**

```bash
gt create -am "feat: add mortgage payment snapshot model"
```

### Task 2: Persist Sort State in User Saved Views

**Files:**
- Modify: `convex/crm/types.ts`
- Modify: `convex/crm/validators.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/crm/userSavedViews.ts`
- Modify: `convex/crm/viewState.ts`
- Test: `convex/crm/__tests__/userSavedViews.test.ts`
- Test: `convex/crm/__tests__/viewEngine.test.ts`

- [ ] **Step 1: Add failing backend tests for saved-view sort persistence**

```ts
it("persists sort state on a saved view", async () => {
  const fixture = await seedLeadFixture(t);
  const savedViewId = await asAdmin(t).mutation(api.crm.userSavedViews.createUserSavedView, {
    objectDefId: fixture.objectDefId,
    name: "Sorted leads",
    sourceViewDefId: fixture.defaultViewId,
    viewType: "table",
  });

  await asAdmin(t).mutation(api.crm.userSavedViews.updateUserSavedView, {
    userSavedViewId: savedViewId,
    sort: {
      direction: "desc",
      fieldDefId: fixture.fieldDefs.deal_value,
    },
  });

  const savedViews = await asAdmin(t).query(api.crm.userSavedViews.listUserSavedViews, {
    objectDefId: fixture.objectDefId,
  });

  expect(savedViews[0]?.sort).toEqual({
    direction: "desc",
    fieldDefId: fixture.fieldDefs.deal_value,
  });
});

it("applies saved-view sort when resolving the effective table view", async () => {
  const fixture = await seedLeadFixture(t);
  await seedRecord(t, fixture.objectDefId, { company_name: "Alpha", deal_value: 100_000, status: "new" });
  await seedRecord(t, fixture.objectDefId, { company_name: "Beta", deal_value: 300_000, status: "new" });

  await t.run(async (ctx) => {
    await ctx.db.insert("userSavedViews", {
      orgId: CRM_ADMIN_IDENTITY.org_id,
      objectDefId: fixture.objectDefId,
      ownerAuthId: CRM_ADMIN_IDENTITY.subject,
      sourceViewDefId: fixture.defaultViewId,
      name: "Sorted Pipeline",
      viewType: "table",
      visibleFieldIds: [fixture.fieldDefs.company_name, fixture.fieldDefs.deal_value],
      fieldOrder: [fixture.fieldDefs.company_name, fixture.fieldDefs.deal_value],
      sort: { direction: "desc", fieldDefId: fixture.fieldDefs.deal_value },
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  const result = await asAdmin(t).query(api.crm.viewQueries.queryViewRecords, {
    viewDefId: fixture.defaultViewId,
    limit: 10,
  });

  expect(result.rows.map((row) => row.fields.company_name)).toEqual(["Beta", "Alpha"]);
});
```

- [ ] **Step 2: Run the two backend suites and verify they fail on the missing `sort` field**

Run: `bun run test convex/crm/__tests__/userSavedViews.test.ts convex/crm/__tests__/viewEngine.test.ts`

Expected: FAIL because `sort` is not in the validators, schema, or effective view state yet.

- [ ] **Step 3: Add `sort` to the saved-view types, validators, and schema**

```ts
// convex/crm/types.ts
export interface RecordSort {
  direction: "asc" | "desc";
  fieldDefId: Id<"fieldDefs">;
}

export interface UserSavedViewDefinition {
  // ...
  sort?: RecordSort;
}

export interface EffectiveViewDefinition {
  // ...
  sort?: RecordSort;
}

// convex/crm/validators.ts
export const recordSortValidator = v.object({
  fieldDefId: v.id("fieldDefs"),
  direction: v.union(v.literal("asc"), v.literal("desc")),
});

// convex/schema.ts
userSavedViews: defineTable({
  // ...
  sort: v.optional(recordSortValidator),
})
```

- [ ] **Step 4: Thread `sort` through saved-view mutations and effective view resolution**

```ts
// convex/crm/userSavedViews.ts
export const createUserSavedView = crmMutation
  .input({
    // ...
    sort: v.optional(recordSortValidator),
  })
  .handler(async (ctx, args) => {
    // ...
    await ctx.db.insert("userSavedViews", {
      // ...
      sort: args.sort,
    });
  });

export const updateUserSavedView = crmMutation
  .input({
    // ...
    sort: v.optional(recordSortValidator),
  })
  .handler(async (ctx, args) => {
    // ...
    if (args.sort !== undefined) {
      patch.sort = args.sort;
    }
  });

// convex/crm/viewState.ts
return {
  effectiveView: {
    // ...
    sort: savedView?.sort,
  },
  savedView,
  systemView,
  viewDef,
  viewFields,
};
```

- [ ] **Step 5: Apply the effective saved-view sort in table queries**

```ts
// convex/crm/viewQueries.ts
import { applySort } from "./recordQueries";

const filtered = applyFilters(assembled.records, recordFilters, state.fieldDefsById);
const sorted = applySort(filtered, state.effectiveView.sort, state.fieldDefsById);
const page = sorted.slice(offset, offset + limit);

return {
  // ...
  totalCount: sorted.length,
  rows,
};
```

- [ ] **Step 6: Re-run the saved-view suites**

Run: `bun run test convex/crm/__tests__/userSavedViews.test.ts convex/crm/__tests__/viewEngine.test.ts`

Expected: PASS with the new `sort` field persisted and applied during table queries.

- [ ] **Step 7: Record the saved-view sort change**

```bash
gt modify -am "feat: persist admin view sort state"
```

### Task 3: Register and Materialize Snapshot Fields in the Native Mortgage CRM Path

**Files:**
- Modify: `convex/crm/systemAdapters/bootstrap.ts`
- Modify: `convex/crm/systemAdapters/queryAdapter.ts`
- Modify: `convex/crm/entityAdapterRegistry.ts`
- Test: `convex/crm/systemAdapters/__tests__/queryAdapter.test.ts`
- Test: `convex/crm/__tests__/viewEngine.test.ts`
- Depends on: `convex/payments/mortgagePaymentSnapshot.ts`

- [ ] **Step 1: Add failing native-adapter tests for snapshot fields**

```ts
it("enriches native mortgage rows with snapshot-backed fields", async () => {
  const queryStub = createIndexedQueryStub([
    {
      _id: "mortgage_1",
      _creationTime: 10,
      createdAt: 10,
      orgId: "org_1",
      principal: 42500000,
      status: "active",
    },
  ]);

  const ctx = {
    db: { query: vi.fn(() => queryStub) },
  };

  vi.mock("../../payments/mortgagePaymentSnapshot", () => ({
    loadMortgagePaymentSnapshots: vi.fn(async () =>
      new Map([
        [
          "mortgage_1",
          {
            mostRecentPaymentAmount: 2450,
            mostRecentPaymentDate: Date.parse("2026-04-02T12:00:00.000Z"),
            mostRecentPaymentStatus: "failed",
            nextUpcomingPaymentAmount: 2450,
            nextUpcomingPaymentDate: Date.parse("2026-04-30T00:00:00.000Z"),
            nextUpcomingPaymentStatus: "planned",
          },
        ],
      ])
    ),
  }));

  const result = await queryNativeRecords(
    ctx as never,
    { _id: "object_1", isSystem: true, nativeTable: "mortgages" } as never,
    [
      { name: "mostRecentPaymentStatus" },
      { name: "mostRecentPaymentDate" },
      { name: "nextUpcomingPaymentDate" },
    ] as never,
    "org_1",
    { cursor: null, numItems: 50 }
  );

  expect(result.records[0]?.fields).toMatchObject({
    mostRecentPaymentStatus: "failed",
    mostRecentPaymentDate: Date.parse("2026-04-02T12:00:00.000Z"),
    nextUpcomingPaymentDate: Date.parse("2026-04-30T00:00:00.000Z"),
  });
});
```

- [ ] **Step 2: Run the native adapter and view engine suites**

Run: `bun run test convex/crm/systemAdapters/__tests__/queryAdapter.test.ts convex/crm/__tests__/viewEngine.test.ts`

Expected: FAIL because the mortgage native adapter does not yet register or materialize the snapshot fields.

- [ ] **Step 3: Register the snapshot-backed mortgage field definitions in system bootstrap**

```ts
// convex/crm/systemAdapters/bootstrap.ts
const MORTGAGE_PAYMENT_STATUS_OPTIONS = opts(
  ["settled", "processing", "failed", "reversed", "cancelled", "none"],
  {
    settled: "#22c55e",
    processing: "#3b82f6",
    failed: "#ef4444",
    reversed: "#f97316",
    cancelled: "#6b7280",
    none: "#94a3b8",
  }
);

const NEXT_PAYMENT_STATUS_OPTIONS = opts(
  ["planned", "provider_scheduled", "executing", "due", "overdue", "none"],
  {
    planned: "#3b82f6",
    provider_scheduled: "#0ea5e9",
    executing: "#8b5cf6",
    due: "#f59e0b",
    overdue: "#ef4444",
    none: "#94a3b8",
  }
);

defaultVisibleFieldNames: [
  "principal",
  "interestRate",
  "mostRecentPaymentStatus",
  "nextUpcomingPaymentDate",
  "loanType",
  "maturityDate",
  "status",
],
fields: [
  // existing fields...
  {
    name: "mostRecentPaymentStatus",
    label: "Most Recent Payment",
    fieldType: "select",
    nativeColumnPath: "__snapshot__.mostRecentPaymentStatus",
    options: MORTGAGE_PAYMENT_STATUS_OPTIONS,
  },
  {
    name: "mostRecentPaymentDate",
    label: "Most Recent Payment Date",
    fieldType: "datetime",
    nativeColumnPath: "__snapshot__.mostRecentPaymentDate",
  },
  {
    name: "mostRecentPaymentAmount",
    label: "Most Recent Payment Amount",
    fieldType: "currency",
    nativeColumnPath: "__snapshot__.mostRecentPaymentAmount",
  },
  {
    name: "nextUpcomingPaymentDate",
    label: "Next Upcoming Payment",
    fieldType: "date",
    nativeColumnPath: "__snapshot__.nextUpcomingPaymentDate",
  },
  {
    name: "nextUpcomingPaymentAmount",
    label: "Next Upcoming Payment Amount",
    fieldType: "currency",
    nativeColumnPath: "__snapshot__.nextUpcomingPaymentAmount",
  },
  {
    name: "nextUpcomingPaymentStatus",
    label: "Next Upcoming Payment Status",
    fieldType: "select",
    nativeColumnPath: "__snapshot__.nextUpcomingPaymentStatus",
    options: NEXT_PAYMENT_STATUS_OPTIONS,
  },
]
```

- [ ] **Step 4: Enrich native mortgage docs with snapshot fields before filter/sort evaluation**

```ts
// convex/crm/systemAdapters/queryAdapter.ts
import { loadMortgagePaymentSnapshots } from "../../payments/mortgagePaymentSnapshot";

async function assembleNativeDocs(
  ctx: QueryCtx,
  objectDef: ObjectDef,
  fieldDefs: FieldDef[],
  docs: Record<string, unknown>[]
): Promise<UnifiedRecord[]> {
  if (objectDef.nativeTable !== "mortgages") {
    return docs.map((doc) => assembleNativeDoc(objectDef, fieldDefs, doc));
  }

  const snapshotByMortgageId = await loadMortgagePaymentSnapshots(
    ctx,
    docs.map((doc) => doc._id as Id<"mortgages">)
  );

  return docs.map((doc) =>
    assembleNativeDoc(objectDef, fieldDefs, {
      ...doc,
      __snapshot__: snapshotByMortgageId.get(String(doc._id)) ?? {
        mostRecentPaymentAmount: null,
        mostRecentPaymentDate: null,
        mostRecentPaymentStatus: "none",
        nextUpcomingPaymentAmount: null,
        nextUpcomingPaymentDate: null,
        nextUpcomingPaymentStatus: "none",
      },
    })
  );
}
```

- [ ] **Step 5: Update the mortgage adapter’s preferred visible fields**

```ts
// convex/crm/entityAdapterRegistry.ts
layoutDefaults: {
  calendarDateFieldName: "maturityDate",
  kanbanFieldName: "status",
  preferredVisibleFieldNames: [
    "propertySummary",
    "principal",
    "interestRate",
    "mostRecentPaymentStatus",
    "nextUpcomingPaymentDate",
    "borrowerSummary",
    "loanType",
    "maturityDate",
    "status",
  ],
},
```

- [ ] **Step 6: Add a view-engine regression that filters and sorts on the snapshot fields**

```ts
it("filters and sorts mortgages by snapshot-backed payment fields", async () => {
  const fixture = await seedMortgageSystemFixture(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("userSavedViews", {
      orgId: CRM_ADMIN_IDENTITY.org_id,
      objectDefId: fixture.objectDefId,
      ownerAuthId: CRM_ADMIN_IDENTITY.subject,
      sourceViewDefId: fixture.defaultViewId,
      name: "Payment triage",
      viewType: "table",
      visibleFieldIds: [
        fixture.fieldDefs.mostRecentPaymentStatus,
        fixture.fieldDefs.nextUpcomingPaymentDate,
      ],
      fieldOrder: [
        fixture.fieldDefs.mostRecentPaymentStatus,
        fixture.fieldDefs.nextUpcomingPaymentDate,
      ],
      filters: [
        {
          fieldDefId: fixture.fieldDefs.mostRecentPaymentStatus,
          operator: "eq",
          value: "failed",
        },
      ],
      sort: {
        direction: "asc",
        fieldDefId: fixture.fieldDefs.nextUpcomingPaymentDate,
      },
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  const result = await asAdmin(t).query(api.crm.viewQueries.queryViewRecords, {
    viewDefId: fixture.defaultViewId,
    limit: 10,
  });

  expect(result.rows.every((row) => row.fields.mostRecentPaymentStatus === "failed")).toBe(true);
  expect(result.rows.map((row) => row.fields.nextUpcomingPaymentDate)).toEqual(
    [...result.rows.map((row) => row.fields.nextUpcomingPaymentDate)].sort()
  );
});
```

- [ ] **Step 7: Re-run the native/system suites**

Run: `bun run test convex/crm/systemAdapters/__tests__/queryAdapter.test.ts convex/crm/__tests__/viewEngine.test.ts`

Expected: PASS with snapshot fields present before view filtering and sorting.

- [ ] **Step 8: Record the native mortgage integration change**

```bash
gt modify -am "feat: expose mortgage payment snapshot fields"
```

### Task 4: Add Smart Footer Aggregates for Visible Table Columns

**Files:**
- Create: `convex/crm/tableFooterAggregates.ts`
- Modify: `convex/crm/types.ts`
- Modify: `convex/crm/metadataCompiler.ts`
- Modify: `convex/crm/viewQueries.ts`
- Test: `convex/crm/__tests__/metadataCompiler.test.ts`
- Test: `convex/crm/__tests__/viewEngine.test.ts`

- [ ] **Step 1: Write failing aggregate metadata and footer-result tests**

```ts
it("marks date fields as footer-aggregate eligible with min/max", () => {
  expect(deriveAggregationEligibility("date")).toEqual({
    enabled: true,
    supportedFunctions: ["count", "min", "max"],
  });
});

it("builds smart footer aggregates for visible numeric, date, and select columns", () => {
  const footer = buildTableFooterAggregates({
    columns: [
      { fieldDefId: "field_principal", fieldType: "currency", isVisible: true, label: "Principal", name: "principal" },
      { fieldDefId: "field_next", fieldType: "date", isVisible: true, label: "Next Upcoming Payment", name: "nextUpcomingPaymentDate" },
      { fieldDefId: "field_recent", fieldType: "select", isVisible: true, label: "Most Recent Payment", name: "mostRecentPaymentStatus" },
    ] as never,
    fieldDefsById: new Map(),
    records: [
      { fields: { principal: 42500000, nextUpcomingPaymentDate: 1_746_057_600_000, mostRecentPaymentStatus: "failed" } },
      { fields: { principal: 31800000, nextUpcomingPaymentDate: 1_745_107_200_000, mostRecentPaymentStatus: "settled" } },
    ],
  });

  expect(footer).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldName: "principal", summary: 74300000 }),
      expect.objectContaining({ fieldName: "nextUpcomingPaymentDate", summary: 1_745_107_200_000 }),
      expect.objectContaining({ fieldName: "mostRecentPaymentStatus", summary: "1 failed, 1 settled" }),
    ])
  );
});
```

- [ ] **Step 2: Run the metadata and view-engine suites**

Run: `bun run test convex/crm/__tests__/metadataCompiler.test.ts convex/crm/__tests__/viewEngine.test.ts`

Expected: FAIL because date/select fields are not aggregate-eligible and no footer aggregate contract exists.

- [ ] **Step 3: Add a dedicated footer aggregate builder**

```ts
import type { FieldDef } from "./viewState";
import type { ViewColumnDefinition } from "./viewState";

export interface TableFooterAggregateResult {
  fieldDefId: Id<"fieldDefs">;
  fieldName: string;
  label: string;
  summary: number | string | null;
}

export function buildTableFooterAggregates(args: {
  columns: readonly ViewColumnDefinition[];
  fieldDefsById: ReadonlyMap<string, FieldDef>;
  records: Array<{ fields: Record<string, unknown> }>;
}): TableFooterAggregateResult[] {
  return args.columns
    .filter((column) => column.isVisible)
    .flatMap((column) => {
      const field = args.fieldDefsById.get(column.fieldDefId.toString());
      if (!field?.aggregation?.enabled) {
        return [];
      }

      const values = args.records
        .map((record) => record.fields[column.name])
        .filter((value) => value !== null && value !== undefined);

      if (field.fieldType === "currency" || field.fieldType === "number" || field.fieldType === "percentage") {
        const numericValues = values.filter((value): value is number => typeof value === "number");
        return numericValues.length > 0
          ? [{ fieldDefId: column.fieldDefId, fieldName: column.name, label: column.label, summary: numericValues.reduce((sum, value) => sum + value, 0) }]
          : [];
      }

      if (field.fieldType === "date" || field.fieldType === "datetime") {
        const numericValues = values.filter((value): value is number => typeof value === "number");
        return numericValues.length > 0
          ? [{ fieldDefId: column.fieldDefId, fieldName: column.name, label: column.label, summary: Math.min(...numericValues) }]
          : [];
      }

      if (field.fieldType === "select") {
        const counts = new Map<string, number>();
        for (const value of values) {
          if (typeof value !== "string") continue;
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        if (counts.size === 0) return [];
        return [{
          fieldDefId: column.fieldDefId,
          fieldName: column.name,
          label: column.label,
          summary: [...counts.entries()].map(([value, count]) => `${count} ${value}`).join(", "),
        }];
      }

      return [];
    });
}
```

- [ ] **Step 4: Broaden footer aggregate eligibility in metadata**

```ts
export function deriveAggregationEligibility(fieldType: FieldType) {
  switch (fieldType) {
    case "number":
    case "currency":
    case "percentage":
      return { enabled: true, supportedFunctions: ["count", "sum", "avg", "min", "max"] };
    case "date":
    case "datetime":
      return { enabled: true, supportedFunctions: ["count", "min", "max"] };
    case "select":
      return { enabled: true, supportedFunctions: ["count"] };
    default:
      return {
        enabled: false,
        reason: "This field type does not produce a meaningful table footer summary.",
        supportedFunctions: [],
      };
  }
}
```

- [ ] **Step 5: Return footer aggregates from table queries**

```ts
// convex/crm/types.ts
export interface TableViewFooterAggregateResult {
  fieldDefId: Id<"fieldDefs">;
  fieldName: string;
  label: string;
  summary: number | string | null;
}

// convex/crm/viewQueries.ts
import { buildTableFooterAggregates } from "./tableFooterAggregates";

return {
  ...buildViewQueryBase(state),
  footerAggregates: buildTableFooterAggregates({
    columns: state.columns,
    fieldDefsById: state.fieldDefsById,
    records: sorted,
  }),
  // existing payload...
};
```

- [ ] **Step 6: Re-run the aggregate suites**

Run: `bun run test convex/crm/__tests__/metadataCompiler.test.ts convex/crm/__tests__/viewEngine.test.ts`

Expected: PASS with date/select footer eligibility and backend footer summaries for visible columns.

- [ ] **Step 7: Record the footer aggregate change**

```bash
gt modify -am "feat: add smart admin table footer aggregates"
```

### Task 5: Build Reusable Admin Table Header Controls, Column Popover, and Snapshot-Aware Cells

**Files:**
- Create: `src/components/admin/shell/AdminTableHeaderControls.tsx`
- Create: `src/components/admin/shell/AdminTableColumnVisibilityPopover.tsx`
- Create: `src/components/admin/shell/AdminTableColumnHeaderControls.tsx`
- Create: `src/components/admin/shell/AdminTableAggregateFooter.tsx`
- Modify: `src/components/admin/shell/AdminEntityViewPage.tsx`
- Modify: `src/components/admin/shell/AdminEntityViewToolbar.tsx`
- Modify: `src/components/admin/shell/AdminEntityTableView.tsx`
- Modify: `src/components/admin/shell/EntityTableToolbar.tsx`
- Modify: `src/components/admin/shell/admin-view-rendering.tsx`
- Test: `src/test/admin/admin-table-header-controls.test.tsx`
- Test: `src/test/admin/admin-shell.test.ts`

- [ ] **Step 1: Write the failing UI test for inline header controls and the columns popover**

```tsx
/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminTableHeaderControls } from "#/components/admin/shell/AdminTableHeaderControls";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminTableHeaderControls", () => {
  it("renders inline search and opens the column visibility popover from the header button", () => {
    render(
      <AdminTableHeaderControls
        activeFilterChips={[{ id: "failed", label: "Recent payment: Failed" }]}
        columnOptions={[
          { fieldDefId: "field_recent", isVisible: true, label: "Most Recent Payment", name: "mostRecentPaymentStatus" },
          { fieldDefId: "field_next", isVisible: true, label: "Next Upcoming Payment", name: "nextUpcomingPaymentDate" },
        ]}
        onClearAll={vi.fn()}
        onColumnVisibilityChange={vi.fn()}
        onRestoreDefaults={vi.fn()}
        onSearchChange={vi.fn()}
        searchValue=""
      />
    );

    expect(screen.getByPlaceholderText("Search mortgages, borrowers, or payment states...")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.getByPlaceholderText("Search fields...")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing UI test for the snapshot-aware table cells and footer**

```tsx
it("renders composite mortgage payment cells and footer summaries", () => {
  render(
    <AdminEntityTableView
      adapterContract={{ entityType: "mortgages", titleFieldName: "propertySummary" }}
      columns={[
        { displayOrder: 0, fieldDefId: "field_recent", fieldType: "select", isVisible: true, label: "Most Recent Payment", name: "mostRecentPaymentStatus" },
        { displayOrder: 1, fieldDefId: "field_next", fieldType: "date", isVisible: true, label: "Next Upcoming Payment", name: "nextUpcomingPaymentDate" },
      ] as never}
      fields={fieldsFixture}
      footerAggregates={[
        { fieldDefId: "field_recent", fieldName: "mostRecentPaymentStatus", label: "Most Recent Payment", summary: "1 failed, 1 settled" },
        { fieldDefId: "field_next", fieldName: "nextUpcomingPaymentDate", label: "Next Upcoming Payment", summary: Date.parse("2026-04-19T00:00:00.000Z") },
      ] as never}
      objectDef={{ nativeTable: "mortgages", singularLabel: "Mortgage" }}
      rows={[
        {
          record: {
            _id: "mortgage_1",
            _kind: "native",
            createdAt: 0,
            updatedAt: 0,
            nativeTable: "mortgages",
            objectDefId: "object_mortgage",
            fields: {
              mostRecentPaymentAmount: 2450,
              mostRecentPaymentDate: Date.parse("2026-04-02T12:00:00.000Z"),
              mostRecentPaymentStatus: "failed",
              nextUpcomingPaymentAmount: 2450,
              nextUpcomingPaymentDate: Date.parse("2026-04-30T00:00:00.000Z"),
              nextUpcomingPaymentStatus: "planned",
            },
          },
          cells: [],
        },
      ] as never}
    />
  );

  expect(screen.getByText("Failed")).toBeInTheDocument();
  expect(screen.getByText(/Apr/)).toBeInTheDocument();
  expect(screen.getByText("1 failed, 1 settled")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the admin-shell UI suites and verify they fail**

Run: `bun run test src/test/admin/admin-table-header-controls.test.tsx src/test/admin/admin-shell.test.ts`

Expected: FAIL because the reusable header components and footer rendering do not exist yet.

- [ ] **Step 4: Create the shared header and column-popover primitives**

```tsx
// src/components/admin/shell/AdminTableHeaderControls.tsx
export function AdminTableHeaderControls(props: {
  activeFilterChips: Array<{ id: string; label: string }>;
  columnOptions: Array<{ fieldDefId: string; isVisible: boolean; label: string; name: string }>;
  onClearAll: () => void;
  onColumnVisibilityChange: (fieldDefId: string, nextVisible: boolean) => void;
  onRestoreDefaults: () => void;
  onSearchChange: (value: string) => void;
  rightSlot?: ReactNode;
  searchPlaceholder?: string;
  searchValue: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 bg-muted/20 px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-[260px] flex-1 sm:max-w-lg">
            <Input
              aria-label="Search records"
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder={props.searchPlaceholder ?? "Search visible columns..."}
              value={props.searchValue}
            />
          </div>
          <Button size="sm" type="button" variant="outline">All filters</Button>
          <AdminTableColumnVisibilityPopover
            columns={props.columnOptions}
            onColumnVisibilityChange={props.onColumnVisibilityChange}
          />
          <Button onClick={props.onRestoreDefaults} size="sm" type="button" variant="outline">
            Restore defaults
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.activeFilterChips.map((chip) => (
            <Badge key={chip.id} variant="secondary">{chip.label}</Badge>
          ))}
          {props.rightSlot}
          <Button onClick={props.onClearAll} size="sm" type="button" variant="ghost">
            Clear all
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Render per-column filter/sort controls in the table header and persist those changes**

```tsx
// src/components/admin/shell/AdminTableColumnHeaderControls.tsx
export function AdminTableColumnHeaderControls(props: {
  canSort: boolean;
  fieldDefId: string;
  label: string;
  onAddFilter: (fieldDefId: string) => void;
  onSortChange: (sort: { direction: "asc" | "desc"; fieldDefId: string } | undefined) => void;
  sortDirection?: "asc" | "desc";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-xs uppercase tracking-[0.08em]">{props.label}</span>
      <div className="flex items-center gap-1">
        <Button onClick={() => props.onAddFilter(props.fieldDefId)} size="icon" type="button" variant="ghost">
          F
        </Button>
        {props.canSort ? (
          <Button
            onClick={() =>
              props.onSortChange(
                props.sortDirection === "asc"
                  ? { fieldDefId: props.fieldDefId, direction: "desc" }
                  : { fieldDefId: props.fieldDefId, direction: "asc" }
              )
            }
            size="icon"
            type="button"
            variant="ghost"
          >
            {props.sortDirection === "desc" ? "↓" : "↑"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// src/components/admin/shell/AdminEntityViewPage.tsx
const updateUserSavedView = useMutation(api.crm.userSavedViews.updateUserSavedView);

async function handleSortChange(nextSort: { direction: "asc" | "desc"; fieldDefId: Id<"fieldDefs"> } | undefined) {
  if (!activeSavedView) {
    const savedViewId = await createUserSavedView({
      objectDefId: objectDef._id,
      sourceViewDefId: activeSourceView._id,
      name: activeSourceView.name,
      viewType: "table",
      sort: nextSort,
    });
    await setDefaultUserSavedView({ userSavedViewId: savedViewId });
    return;
  }

  await updateUserSavedView({
    userSavedViewId: activeSavedView.userSavedViewId,
    sort: nextSort,
  });
}
```

- [ ] **Step 6: Render composite mortgage payment cells and the backend footer row**

```tsx
// src/components/admin/shell/admin-view-rendering.tsx
function renderMortgageSnapshotCell(args: {
  fieldName: "mostRecentPaymentStatus" | "nextUpcomingPaymentDate";
  record: UnifiedRecord;
}) {
  if (args.fieldName === "mostRecentPaymentStatus") {
    return (
      <div className="space-y-1">
        <SelectCell
          options={[]}
          value={String(args.record.fields.mostRecentPaymentStatus ?? "none")}
        />
        <p className="text-muted-foreground text-xs">
          {formatCompactDate(args.record.fields.mostRecentPaymentDate)} •{" "}
          {typeof args.record.fields.mostRecentPaymentAmount === "number"
            ? formatCompactCurrency(args.record.fields.mostRecentPaymentAmount)
            : "—"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <DateCell format="absolute" value={args.record.fields.nextUpcomingPaymentDate as number | string} />
      <p className="text-muted-foreground text-xs">
        {typeof args.record.fields.nextUpcomingPaymentAmount === "number"
          ? formatCompactCurrency(args.record.fields.nextUpcomingPaymentAmount)
          : "—"}{" "}
        • {formatTokenLabel(args.record.fields.nextUpcomingPaymentStatus)}
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Reuse the same header primitives in `EntityTableToolbar`**

```tsx
// src/components/admin/shell/EntityTableToolbar.tsx
return (
  <AdminTableHeaderControls
    activeFilterChips={activeFilters.map((filter) => ({
      id: filter.id,
      label: `${filter.label}: ${filter.value}`,
    }))}
    columnOptions={hideableColumns.map((column) => ({
      fieldDefId: column.id,
      isVisible: column.getIsVisible(),
      label: getColumnLabel(column),
      name: column.id,
    }))}
    onClearAll={() => {
      setSearchValue("");
      table.resetColumnFilters();
      onGlobalFilterChange("");
    }}
    onColumnVisibilityChange={(columnId, nextVisible) => {
      table.getColumn(columnId)?.toggleVisibility(nextVisible);
    }}
    onRestoreDefaults={() => {
      hideableColumns.forEach((column) => column.toggleVisibility(true));
    }}
    onSearchChange={(value) => setSearchValue(value)}
    rightSlot={toolbarSlot}
    searchValue={searchValue}
  />
);
```

- [ ] **Step 8: Re-run the admin UI suites**

Run: `bun run test src/test/admin/admin-table-header-controls.test.tsx src/test/admin/admin-shell.test.ts`

Expected: PASS with inline search, header-triggered columns popover, persisted sort trigger wiring, and footer rendering.

- [ ] **Step 9: Record the admin table shell UI change**

```bash
gt modify -am "feat: add reusable admin table header controls"
```

### Task 6: Reuse the Snapshot Contract on the Mortgage Detail Page and Finish Verification

**Files:**
- Modify: `convex/crm/detailContextQueries.ts`
- Modify: `src/components/admin/shell/dedicated-detail-panels.tsx`
- Test: `convex/crm/__tests__/detailContextQueries.test.ts`
- Test: `src/test/admin/mortgage-dedicated-details.test.tsx`

- [ ] **Step 1: Add the failing detail-context and UI tests**

```ts
it("returns paymentSnapshot alongside mortgage detail context", async () => {
  const fixture = await seedMortgageDetailFixture(t);
  const result = await asAdmin(t).query(api.crm.detailContextQueries.getMortgageDetailContext, {
    mortgageId: fixture.mortgageId,
  });

  expect(result.paymentSnapshot).toEqual({
    mostRecentPaymentStatus: "failed",
    mostRecentPaymentDate: expect.any(Number),
    mostRecentPaymentAmount: 2450,
    nextUpcomingPaymentStatus: "planned",
    nextUpcomingPaymentDate: expect.any(Number),
    nextUpcomingPaymentAmount: 2450,
  });
});
```

```tsx
it("renders the shared payment snapshot in the mortgage detail panel", () => {
  render(
    <MortgagesDedicatedDetailsContent
      detailContext={{
        paymentSnapshot: {
          mostRecentPaymentAmount: 2450,
          mostRecentPaymentDate: Date.parse("2026-04-02T12:00:00.000Z"),
          mostRecentPaymentStatus: "failed",
          nextUpcomingPaymentAmount: 2450,
          nextUpcomingPaymentDate: Date.parse("2026-04-30T00:00:00.000Z"),
          nextUpcomingPaymentStatus: "planned",
        },
      } as never}
      fields={fields}
      objectDefs={[]}
      paymentSetup={paymentSetup}
      record={record}
    />
  );

  expect(screen.getByText("Failed")).toBeInTheDocument();
  expect(screen.getByText("Planned")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the detail suites and verify they fail**

Run: `bun run test convex/crm/__tests__/detailContextQueries.test.ts src/test/admin/mortgage-dedicated-details.test.tsx`

Expected: FAIL because mortgage detail context does not yet expose `paymentSnapshot`.

- [ ] **Step 3: Load the shared snapshot in the detail query and render it**

```ts
// convex/crm/detailContextQueries.ts
import { loadMortgagePaymentSnapshots } from "../payments/mortgagePaymentSnapshot";

const paymentSnapshot =
  (await loadMortgagePaymentSnapshots(ctx, [args.mortgageId])).get(
    String(args.mortgageId)
  ) ?? {
    mostRecentPaymentAmount: null,
    mostRecentPaymentDate: null,
    mostRecentPaymentStatus: "none",
    nextUpcomingPaymentAmount: null,
    nextUpcomingPaymentDate: null,
    nextUpcomingPaymentStatus: "none",
  };

return {
  // existing detail context...
  paymentSnapshot,
};
```

```tsx
// src/components/admin/shell/dedicated-detail-panels.tsx
<DetailSectionShell
  description="Canonical payment snapshot shared with the mortgages table."
  title="Payment Snapshot"
>
  <MetricGrid
    items={[
      {
        label: "Most recent payment",
        value: `${formatEnumLabel(detailContext?.paymentSnapshot?.mostRecentPaymentStatus ?? "none")} · ${
          formatDateTime(detailContext?.paymentSnapshot?.mostRecentPaymentDate) ?? "—"
        }`,
      },
      {
        label: "Next upcoming payment",
        value: `${formatDate(detailContext?.paymentSnapshot?.nextUpcomingPaymentDate) ?? "—"} · ${
          formatEnumLabel(detailContext?.paymentSnapshot?.nextUpcomingPaymentStatus ?? "none")
        }`,
      },
    ]}
  />
</DetailSectionShell>
```

- [ ] **Step 4: Re-run the detail suites**

Run: `bun run test convex/crm/__tests__/detailContextQueries.test.ts src/test/admin/mortgage-dedicated-details.test.tsx`

Expected: PASS with the same snapshot semantics available in both table and detail paths.

- [ ] **Step 5: Run codegen, targeted verification, repo checks, and review**

Run: `bunx convex codegen`
Expected: SUCCESS with updated generated API/types.

Run: `bun run test convex/payments/__tests__/mortgagePaymentSnapshot.test.ts convex/crm/systemAdapters/__tests__/queryAdapter.test.ts convex/crm/__tests__/userSavedViews.test.ts convex/crm/__tests__/viewEngine.test.ts convex/crm/__tests__/detailContextQueries.test.ts src/test/admin/admin-table-header-controls.test.tsx src/test/admin/admin-shell.test.ts src/test/admin/mortgage-dedicated-details.test.tsx`
Expected: PASS for all targeted backend and frontend suites.

Run: `bun check`
Expected: SUCCESS with Biome fixes applied and no remaining lint/check issues.

Run: `bun typecheck`
Expected: SUCCESS for both app and Convex TS configs.

Run: `coderabbit review --plain`
Expected: Review summary with no unresolved blockers, or actionable follow-up items captured before merge.

- [ ] **Step 6: Record the final integrated change**

```bash
gt modify -am "feat: ship mortgage payment table controls"
```

---

## Plan Self-Review

- Spec coverage: Snapshot contract, filterable mortgage columns, reusable header controls, per-column filter/sort, footer aggregates, and detail-page reuse are all mapped to explicit tasks above.
- Placeholder scan: No `TODO`, `TBD`, or “implement later” language remains.
- Type consistency: The plan uses one shared `MortgagePaymentSnapshot` contract, one optional saved-view `sort`, and one `footerAggregates` result path throughout.
