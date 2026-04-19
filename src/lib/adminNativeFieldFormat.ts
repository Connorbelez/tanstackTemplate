const NATIVE_CENT_CURRENCY_FIELDS: Readonly<Record<string, readonly string[]>> =
	{
		listings: ["principal", "monthlyPayment"],
		mortgages: ["principal", "paymentAmount"],
	};

/**
 * Canonical mortgage/listing currency fields are stored in **cents** on native rows.
 */
export function isNativeCentCurrencyField(
	nativeTable: string | null | undefined,
	fieldName: string
): boolean {
	if (!nativeTable) {
		return false;
	}

	const names = NATIVE_CENT_CURRENCY_FIELDS[nativeTable];
	return Boolean(names?.includes(fieldName));
}

/**
 * Renders stored `interestRate` / `annualServicingRate` as **annual percentage points**
 * for admin UI (e.g. `0.07` → 7%, `7.25` → 7.25%).
 *
 * Values already entered as percentage points (≥ 1) are left unchanged. Nominal annual
 * decimals from ledger math (`< 1`) are scaled to percentage points.
 *
 * `ltvRatio` on listings is already on a 0–100 style scale — pass through unchanged.
 */
export function annualNominalPercentPointsForDisplay(args: {
	fieldName: string;
	value: number;
}): number {
	const { fieldName, value } = args;
	if (!Number.isFinite(value) || value <= 0) {
		return value;
	}

	if (fieldName === "ltvRatio") {
		return value;
	}

	if (
		(fieldName === "interestRate" || fieldName === "annualServicingRate") &&
		value < 1
	) {
		return value * 100;
	}

	return value;
}
