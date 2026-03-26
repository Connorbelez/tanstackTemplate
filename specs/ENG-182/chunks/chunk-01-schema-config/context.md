# Chunk 01 Context: Schema & Configuration

## T-001: Schema Change — Lenders Table

### Current lenders schema (`convex/schema.ts:132`):
```typescript
lenders: defineTable({
    // ─── Auth link ───
    userId: v.id("users"),

    // ─── Broker relationship ───
    brokerId: v.id("brokers"),

    // ─── Compliance ───
    accreditationStatus: v.union(
        v.literal("pending"),
        v.literal("accredited"),
        v.literal("exempt"),
        v.literal("rejected")
    ),
    idvStatus: v.optional(v.string()),
    kycStatus: v.optional(v.string()),
    personaInquiryId: v.optional(v.string()),

    // ─── Provenance ───
    onboardingEntryPath: v.string(),
    onboardingId: v.optional(v.id("onboardingRequests")),

    // ─── Lifecycle ───
    status: v.string(),
    activatedAt: v.optional(v.number()),
    createdAt: v.number(),
})
    .index("by_user", ["userId"])
    .index("by_broker", ["brokerId"])
    .index("by_status", ["status"]),
```

### What to add (from Implementation Plan Step 1):
Add a new **Payout configuration** section BEFORE the closing `})`:
```typescript
// ─── Payout configuration (ENG-182) ───
payoutFrequency: v.optional(payoutFrequencyValidator), // default: monthly (handled in code)
lastPayoutDate: v.optional(v.string()), // YYYY-MM-DD: last payout execution date
minimumPayoutCents: v.optional(v.number()), // per-lender override (default: global MINIMUM_PAYOUT_CENTS)
```

**IMPORTANT**: The `payoutFrequencyValidator` must be imported from `convex/payments/payout/validators.ts` — create T-003 first, then import in schema.ts.

All three fields are `v.optional()` because:
1. Existing lender records don't have them (greenfield but still need backward compat)
2. Default values are handled in code (`config.ts`)
3. `on_demand` lenders explicitly opt out of scheduled payouts

## T-002: Payout Frequency Configuration

### File: `convex/payments/payout/config.ts` (NEW)

From the Implementation Plan Step 2:

```typescript
export const DEFAULT_PAYOUT_FREQUENCY = "monthly" as const;
export const MINIMUM_PAYOUT_CENTS = 100; // $1.00 minimum to prevent micro-payouts

export type PayoutFrequency = "monthly" | "bi_weekly" | "weekly" | "on_demand";

/**
 * Determine if a lender is due for payout based on their frequency setting.
 * @param frequency Lender's configured payout frequency
 * @param lastPayoutDate YYYY-MM-DD of last payout (or undefined if never paid)
 * @param today YYYY-MM-DD of current business date
 * @returns true if lender should be included in today's payout batch
 */
export function isPayoutDue(
  frequency: PayoutFrequency,
  lastPayoutDate: string | undefined,
  today: string
): boolean {
  if (frequency === "on_demand") return false; // only admin-triggered
  if (!lastPayoutDate) return true; // never paid out — always due

  const last = new Date(lastPayoutDate);
  const now = new Date(today);
  const daysSinceLastPayout = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );

  switch (frequency) {
    case "weekly": return daysSinceLastPayout >= 7;
    case "bi_weekly": return daysSinceLastPayout >= 14;
    case "monthly": return daysSinceLastPayout >= 28; // conservative 4 weeks
    default: return false;
  }
}
```

**Open Question Resolution (from Notion §9):**
- OQ-3 (monthly timing): Using 28-day intervals (conservative 4 weeks) for simplicity. Not calendar-month.
- OQ-4 (holiday calendar): No — payout runs daily, hold period handles the safety window.

## T-003: Payout Frequency Validator

### File: `convex/payments/payout/validators.ts` (NEW)

Create a Convex validator matching the `PayoutFrequency` type:
```typescript
import { v } from "convex/values";

export const payoutFrequencyValidator = v.union(
    v.literal("monthly"),
    v.literal("bi_weekly"),
    v.literal("weekly"),
    v.literal("on_demand")
);
```

This validator is imported by `convex/schema.ts` for the lenders table definition.

## Existing Conventions to Follow

- **Validator files**: See `convex/dispersal/validators.ts` for the pattern — export const validators used in schema
- **Schema imports**: Schema already imports from validators files (line 5: `import { dispersalStatusValidator } from "./dispersal/validators"`)
- **Date format**: YYYY-MM-DD strings for business dates (matches `effectiveDate`, `dispersalDate`, `payoutEligibleAfter`)
- **Optional fields**: All new fields are `v.optional()` since existing lender records won't have them
- **Config files**: Pure functions with no Convex dependencies — testable without convex-test harness
