# Chunk 1 Context: ENG-217 Code Documentation + Principal-Sensitivity Test

## Background

ENG-217 resolves Tech Design §10 Open Decision 2 and Foot Gun 7 from the PaymentRailsSpec.
All three decisions **confirm the current implementation is correct** — no behavioral changes needed.

### Decision 1: When is the fee deducted?
**Answer: Pre-disbursement (current model).** Fee deducted during `createDispersalEntries`,
before dispersal amounts reach the transfer pipeline. No fee-related transfer type needed.

### Decision 2: From what is the fee deducted?
**Answer: Each settled interest payment (current model).** Only `regular_interest` obligation
settlements trigger fee deduction. Principal repayments go directly to lenders without fee deduction.

### Decision 3: Principal basis for fee calculation
**Answer: Current outstanding principal (current model).** `mortgage.principal` is the current
principal balance at time of settlement. As principal is paid down, the servicing fee decreases
proportionally — standard amortizing mortgage behavior.

**Foot Gun 7 Mitigation:** The code already stores `principalBalance` in `servicingFeeEntries` ✅
and stores `annualRate` and `sourceObligationType` for audit ✅. What's missing:
- Explicit JSDoc documentation that `mortgage.principal` means "current outstanding principal"
- A test case verifying that fee decreases when principal balance decreases

## Files to Modify

### 1. `convex/dispersal/servicingFee.ts`

Current file (31 lines total):

```typescript
/**
 * FairLend servicing fee: deducted once per settled payment period before
 * lender distribution, based on the mortgage principal rather than the amount
 * collected in that period.
 *
 * @see SPEC 1.6 §4.2
 */
import type { PaymentFrequency } from "../mortgages/paymentFrequency";
import { getPeriodsPerYear } from "../mortgages/paymentFrequency";

export function calculateServicingFee(
	annualServicingRate: number,
	principalCents: number,
	paymentFrequency: PaymentFrequency
): number {
	if (!Number.isFinite(annualServicingRate) || annualServicingRate < 0) {
		throw new Error(
			`calculateServicingFee: annualServicingRate must be a non-negative finite number, got ${annualServicingRate}`
		);
	}
	if (!Number.isSafeInteger(principalCents) || principalCents < 0) {
		throw new Error(
			`calculateServicingFee: principalCents must be a non-negative integer cent value, got ${principalCents}`
		);
	}

	return Math.round(
		(annualServicingRate * principalCents) / getPeriodsPerYear(paymentFrequency)
	);
}
```

**T-001 Change:** Update the module-level JSDoc AND add parameter-level JSDoc to `calculateServicingFee`:
- `@param annualServicingRate` — Annual rate (e.g., 0.01 for 1%)
- `@param principalCents` — Current outstanding principal in cents at time of settlement.
  This is the CURRENT principal balance (mortgage.principal), not the original loan amount.
  As principal is repaid, the servicing fee decreases proportionally.
  Decision: ENG-217 — chose current outstanding principal per standard mortgage servicing practice.
- `@param paymentFrequency` — Payment frequency determines periods per year

### 2. `convex/dispersal/createDispersalEntries.ts`

The relevant section is the `calculateServicingSplit` function (lines 181-210):

```typescript
async function calculateServicingSplit(
	ctx: MutationCtx,
	args: {
		mortgage: Doc<"mortgages">;
		obligation: Doc<"obligations">;
		settledAmount: number;
		settledDate: string;
	}
): Promise<ServicingSplit> {
	const servicingConfig =
		args.obligation.type === "regular_interest"
			? await resolveServicingFeeConfig(ctx.db, args.mortgage, args.settledDate)
			: null;
	const feeDue =
		servicingConfig === null
			? 0
			: calculateServicingFee(
					servicingConfig.annualRate,
					args.mortgage.principal,
					args.mortgage.paymentFrequency
				);
	const feeCashApplied = Math.min(args.settledAmount, feeDue);
	return {
		servicingConfig,
		feeDue,
		feeCashApplied,
		feeReceivable: feeDue - feeCashApplied,
		distributableAmount: args.settledAmount - feeCashApplied,
	};
}
```

**T-002 Change:** Add a comment block before the `calculateServicingFee` call (around line 197):
```typescript
// ENG-217: Fee basis is current outstanding principal (mortgage.principal).
// This means fees decrease as principal is repaid — standard amortizing mortgage behavior.
// The principalBalance used is stored in servicingFeeEntries for audit verification.
```

### 3. `convex/dispersal/__tests__/createDispersalEntries.test.ts`

**T-003 Change:** Add a new test case. Study the existing test patterns carefully. Key patterns:

**Test harness setup:**
```typescript
const t = convexTest(schema, modules);
```

**Seed helper:** `seedDispersalScenario(t, options?)` creates:
- A borrower, lender(s), mortgage, obligation, mortgage fee, ledger accounts
- Default principal: `10_000_000` (100k in cents)
- Default servicing rate: `0.01` (1%)
- Default payment frequency: `"monthly"`

**Run helper:** `runCreateDispersal(t, args)` calls the mutation.

**The new test should:**
1. Seed a scenario with default principal (10_000_000)
2. Run dispersal → capture first `servicingFeeEntry.feeDue` and `principalBalance`
3. Update the mortgage principal to 8_000_000 (simulate paydown)
4. Create a new obligation for the same mortgage
5. Run dispersal for the new obligation → capture second fee entry
6. Assert: second `feeDue` < first `feeDue`
7. Assert: first `principalBalance` === 10_000_000
8. Assert: second `principalBalance` === 8_000_000

**IMPORTANT:** Each obligation can only have one dispersal (idempotency). So you need TWO
separate obligations to get two fee calculations. Seed two obligations, update the mortgage
principal between the first and second dispersal runs.

**Naming convention:** Follow existing test naming like:
`"computes lower servicing fee when mortgage principal decreases (ENG-217)"`

Put it in the existing `describe("createDispersalEntries")` block alongside other servicing fee tests.

## Quality Gates
After all changes:
- `bun check` must pass
- `bun typecheck` must pass
- `bun run test convex/dispersal/__tests__/createDispersalEntries.test.ts` must pass
