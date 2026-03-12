import { format as formatDate, parseISO } from "date-fns";
import type { FormatOptions, VariableType } from "./types";

/**
 * Format a raw variable value according to its type and optional format config.
 * All values arrive as strings; this function renders them for PDF interpolation.
 */
export function formatValue(
	value: string,
	type: VariableType,
	options?: FormatOptions
): string {
	switch (type) {
		case "currency": {
			const num = Number.parseFloat(value);
			if (Number.isNaN(num)) {
				return value;
			}
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: options?.currencyCode ?? "USD",
				minimumFractionDigits: options?.decimalPlaces ?? 2,
				maximumFractionDigits: options?.decimalPlaces ?? 2,
			}).format(num);
		}

		case "date": {
			const dateFormatStr = options?.dateFormat ?? "MM/dd/yyyy";
			const parsed = parseISO(value);
			if (Number.isNaN(parsed.getTime())) {
				return value;
			}
			return formatDate(parsed, dateFormatStr);
		}

		case "percentage": {
			const num = Number.parseFloat(value);
			if (Number.isNaN(num)) {
				return value;
			}
			const places = options?.decimalPlaces ?? 2;
			return `${num.toFixed(places)}%`;
		}

		case "integer": {
			const num = Number.parseInt(value, 10);
			if (Number.isNaN(num)) {
				return value;
			}
			return num.toLocaleString("en-US");
		}

		case "boolean": {
			const truthy = value === "true" || value === "1" || value === "yes";
			const trueLabel = options?.booleanTrueLabel ?? "Yes";
			const falseLabel = options?.booleanFalseLabel ?? "No";
			return truthy ? trueLabel : falseLabel;
		}
		default:
			return value;
	}
}
