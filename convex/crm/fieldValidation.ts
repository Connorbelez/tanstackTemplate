import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

type FieldDef = Doc<"fieldDefs">;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;

/**
 * Validates a single field value against its field definition.
 * Throws a `ConvexError` when the value does not satisfy the field type's constraints.
 */
export function validateFieldValue(fieldDef: FieldDef, value: unknown): void {
	const { name, fieldType } = fieldDef;

	switch (fieldType) {
		case "text":
		case "rich_text": {
			if (typeof value !== "string") {
				throw new ConvexError(`Field "${name}" requires a string value`);
			}
			break;
		}

		case "email": {
			if (typeof value !== "string") {
				throw new ConvexError(`Field "${name}" requires a string value`);
			}
			if (!EMAIL_REGEX.test(value)) {
				throw new ConvexError(`Field "${name}" requires a valid email address`);
			}
			break;
		}

		case "phone": {
			if (typeof value !== "string") {
				throw new ConvexError(`Field "${name}" requires a string value`);
			}
			if (!PHONE_REGEX.test(value)) {
				throw new ConvexError(`Field "${name}" requires a valid phone number`);
			}
			break;
		}

		case "url": {
			if (typeof value !== "string") {
				throw new ConvexError(`Field "${name}" requires a string value`);
			}
			try {
				new URL(value);
			} catch {
				throw new ConvexError(`Field "${name}" requires a valid URL`);
			}
			break;
		}

		case "number":
		case "currency":
		case "percentage": {
			if (typeof value !== "number" || Number.isNaN(value)) {
				throw new ConvexError(`Field "${name}" requires a numeric value`);
			}
			break;
		}

		case "boolean": {
			if (typeof value !== "boolean") {
				throw new ConvexError(`Field "${name}" requires a boolean value`);
			}
			break;
		}

		case "date":
		case "datetime": {
			if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
				throw new ConvexError(
					`Field "${name}" requires a valid timestamp (positive number in unix ms)`
				);
			}
			break;
		}

		case "select": {
			if (typeof value !== "string") {
				throw new ConvexError(`Field "${name}" requires a string value`);
			}
			if (fieldDef.options) {
				const allowed = fieldDef.options.map((o) => o.value);
				if (!allowed.includes(value)) {
					throw new ConvexError(
						`Field "${name}" value "${value}" is not a valid option. Allowed: ${allowed.join(", ")}`
					);
				}
			}
			break;
		}

		case "multi_select": {
			if (!Array.isArray(value)) {
				throw new ConvexError(`Field "${name}" requires an array of strings`);
			}
			for (const item of value) {
				if (typeof item !== "string") {
					throw new ConvexError(
						`Field "${name}" requires all items to be strings`
					);
				}
			}
			if (fieldDef.options) {
				const allowed = fieldDef.options.map((o) => o.value);
				for (const item of value as string[]) {
					if (!allowed.includes(item)) {
						throw new ConvexError(
							`Field "${name}" value "${item}" is not a valid option. Allowed: ${allowed.join(", ")}`
						);
					}
				}
			}
			break;
		}

		case "user_ref": {
			if (typeof value !== "string") {
				throw new ConvexError(`Field "${name}" requires a string value`);
			}
			break;
		}

		default: {
			const _exhaustive: never = fieldType;
			throw new ConvexError(
				`Field "${name}" has unknown field type: ${String(_exhaustive)}`
			);
		}
	}
}

/**
 * Validates that all required (and active) fields have values present in the provided map.
 * Throws a single `ConvexError` listing every missing required field name.
 */
export function validateRequiredFields(
	fieldDefs: FieldDef[],
	values: Record<string, unknown>
): void {
	const missing = fieldDefs
		.filter((fd) => fd.isRequired && fd.isActive)
		.filter((fd) => !(fd.name in values))
		.map((fd) => fd.name);

	if (missing.length > 0) {
		throw new ConvexError(`Missing required fields: ${missing.join(", ")}`);
	}
}
