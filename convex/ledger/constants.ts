/**
 * Total ownership units **per mortgage**.
 *
 * Each mortgage is divided into exactly 10,000 fungible units.
 * Holding all 10,000 units represents 100% ownership of that single mortgage.
 * This is NOT a global/system-wide supply — every mortgage has its own
 * independent 10,000-unit pool.
 *
 * @see SPEC 1.3 — Mortgage Ownership Ledger (ENG-25 AC: "TOTAL_SUPPLY = 10,000")
 */
export const TOTAL_SUPPLY = 10_000n;

/**
 * Minimum non-zero position **per investor per mortgage**, in ownership units.
 *
 * An investor's balance in a given mortgage must be either 0 (no position)
 * or at least 1,000 units (10% of that mortgage's TOTAL_SUPPLY).
 * This floor prevents dust positions and simplifies compliance reporting.
 *
 * @see SPEC 1.3 — Mortgage Ownership Ledger (ENG-25 AC: "MIN_FRACTION = 1,000")
 */
export const MIN_FRACTION = 1_000n;
