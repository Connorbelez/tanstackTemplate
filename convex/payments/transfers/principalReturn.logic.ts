/**
 * Pure logic for investor principal return calculations.
 *
 * No Convex imports — fully testable with plain values.
 * All amounts are in cents (integer).
 */

/**
 * Computes the net principal return amount after proration adjustment.
 * Both inputs and the result are in integer cents.
 *
 * @param principalAmount - The gross principal to return (positive integer, cents).
 * @param prorationAdjustment - Signed integer adjustment (positive = add, negative = subtract).
 * @returns The adjusted amount in cents.
 * @throws If the adjusted amount is not a positive integer.
 */
export function computeProrationAdjustedAmount(
	principalAmount: number,
	prorationAdjustment: number
): number {
	if (!Number.isInteger(principalAmount) || principalAmount <= 0) {
		throw new Error(
			`principalAmount must be a positive integer (cents), got: ${principalAmount}`
		);
	}
	if (!Number.isInteger(prorationAdjustment)) {
		throw new Error(
			`prorationAdjustment must be an integer (cents), got: ${prorationAdjustment}`
		);
	}
	const adjusted = principalAmount + prorationAdjustment;
	if (adjusted <= 0) {
		throw new Error(
			`Invalid prorated amount: ${adjusted} (principal: ${principalAmount}, adjustment: ${prorationAdjustment})`
		);
	}
	return adjusted;
}

/**
 * Builds a deterministic idempotency key for a principal return transfer.
 * Ensures only one principal return per deal + seller combination.
 */
export function buildPrincipalReturnIdempotencyKey(
	dealId: string,
	sellerId: string
): string {
	return `principal-return:${dealId}:${sellerId}`;
}
