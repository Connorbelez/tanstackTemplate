import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation } from "../fluent";
import { validateFieldValue, validateRequiredFields } from "./fieldValidation";
import { fieldTypeToTable } from "./valueRouter";

type FieldDef = Doc<"fieldDefs">;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Validates that a value is a non-null plain object suitable for use as a
 * field-name-to-value map. Throws a `ConvexError` if the value is null,
 * undefined, an array, or any non-object primitive.
 */
function assertPlainObject(
	value: unknown
): asserts value is Record<string, unknown> {
	if (
		value === null ||
		value === undefined ||
		typeof value !== "object" ||
		Array.isArray(value)
	) {
		throw new ConvexError(
			'"values" must be a non-null plain object mapping field names to values'
		);
	}
}

/**
 * Writes a single field value into the correct typed EAV table.
 * Uses a switch on the resolved table name so Convex sees a literal
 * table name at each insert call-site.
 */
export async function writeValue(
	ctx: MutationCtx,
	recordId: Id<"records">,
	fieldDef: FieldDef,
	value: unknown
): Promise<void> {
	const table = fieldTypeToTable(fieldDef.fieldType);
	const base = {
		recordId,
		fieldDefId: fieldDef._id,
		objectDefId: fieldDef.objectDefId,
	};

	switch (table) {
		case "recordValuesText":
			await ctx.db.insert("recordValuesText", {
				...base,
				value: value as string,
			});
			break;
		case "recordValuesNumber":
			await ctx.db.insert("recordValuesNumber", {
				...base,
				value: value as number,
			});
			break;
		case "recordValuesBoolean":
			await ctx.db.insert("recordValuesBoolean", {
				...base,
				value: value as boolean,
			});
			break;
		case "recordValuesDate":
			await ctx.db.insert("recordValuesDate", {
				...base,
				value: value as number,
			});
			break;
		case "recordValuesSelect":
			await ctx.db.insert("recordValuesSelect", {
				...base,
				value: value as string,
			});
			break;
		case "recordValuesMultiSelect":
			await ctx.db.insert("recordValuesMultiSelect", {
				...base,
				value: value as string[],
			});
			break;
		case "recordValuesRichText":
			await ctx.db.insert("recordValuesRichText", {
				...base,
				value: value as string,
			});
			break;
		case "recordValuesUserRef":
			await ctx.db.insert("recordValuesUserRef", {
				...base,
				value: value as string,
			});
			break;
		default: {
			const _exhaustive: never = table;
			throw new ConvexError(`Unknown value table: ${String(_exhaustive)}`);
		}
	}
}

/**
 * Reads the existing value row for a given record + field, or null.
 * Same switch pattern so Convex resolves table names at compile time.
 */
export async function readExistingValue(
	ctx: MutationCtx,
	recordId: Id<"records">,
	fieldDef: FieldDef
): Promise<Doc<
	| "recordValuesText"
	| "recordValuesNumber"
	| "recordValuesBoolean"
	| "recordValuesDate"
	| "recordValuesSelect"
	| "recordValuesMultiSelect"
	| "recordValuesRichText"
	| "recordValuesUserRef"
> | null> {
	const table = fieldTypeToTable(fieldDef.fieldType);

	switch (table) {
		case "recordValuesText":
			return ctx.db
				.query("recordValuesText")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesNumber":
			return ctx.db
				.query("recordValuesNumber")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesBoolean":
			return ctx.db
				.query("recordValuesBoolean")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesDate":
			return ctx.db
				.query("recordValuesDate")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesSelect":
			return ctx.db
				.query("recordValuesSelect")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesMultiSelect":
			return ctx.db
				.query("recordValuesMultiSelect")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesRichText":
			return ctx.db
				.query("recordValuesRichText")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		case "recordValuesUserRef":
			return ctx.db
				.query("recordValuesUserRef")
				.withIndex("by_record_field", (q) =>
					q.eq("recordId", recordId).eq("fieldDefId", fieldDef._id)
				)
				.first();
		default: {
			const _exhaustive: never = table;
			throw new ConvexError(`Unknown value table: ${String(_exhaustive)}`);
		}
	}
}

// ── Mutations ────────────────────────────────────────────────────────

// ── createRecord ─────────────────────────────────────────────────────
export const createRecord = crmMutation
	.input({
		objectDefId: v.id("objectDefs"),
		values: v.any(),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// Load + verify objectDef
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
			throw new ConvexError("Object not found or access denied");
		}

		// Load active fieldDefs for this object
		const allFieldDefs = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
			.collect();
		const activeFieldDefs = allFieldDefs.filter((fd) => fd.isActive);

		// Build fieldsByName lookup
		const fieldsByName = new Map<string, FieldDef>();
		for (const fd of activeFieldDefs) {
			fieldsByName.set(fd.name, fd);
		}

		// Validate shape and required fields
		assertPlainObject(args.values);
		const values = args.values;
		validateRequiredFields(activeFieldDefs, values);

		for (const [fieldName, value] of Object.entries(values)) {
			const fieldDef = fieldsByName.get(fieldName);
			if (!fieldDef) {
				throw new ConvexError(`Unknown field: "${fieldName}"`);
			}
			validateFieldValue(fieldDef, value);
		}

		// Determine labelValue: first active text field (by displayOrder) with a value
		const textFields = activeFieldDefs
			.filter((fd) => fd.fieldType === "text")
			.sort((a, b) => a.displayOrder - b.displayOrder);
		let labelValue: string | undefined;
		for (const tf of textFields) {
			const val = values[tf.name];
			if (typeof val === "string" && val.length > 0) {
				labelValue = val;
				break;
			}
		}

		// Insert the record row
		const now = Date.now();
		const recordId = await ctx.db.insert("records", {
			orgId,
			objectDefId: args.objectDefId,
			labelValue,
			isDeleted: false,
			createdAt: now,
			updatedAt: now,
			createdBy: ctx.viewer.authId,
		});

		// Fan-out: write each value into its typed table
		for (const [fieldName, value] of Object.entries(values)) {
			const fieldDef = fieldsByName.get(fieldName);
			if (!fieldDef) {
				continue; // already validated above
			}
			await writeValue(ctx, recordId, fieldDef, value);
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.record.created",
			actorId: ctx.viewer.authId,
			resourceType: "records",
			resourceId: recordId,
			severity: "info",
			metadata: {
				objectDefId: args.objectDefId,
				objectName: objectDef.name,
				fieldCount: Object.keys(values).length,
				orgId,
			},
		});

		return recordId;
	})
	.public();

// ── updateRecord ─────────────────────────────────────────────────────
export const updateRecord = crmMutation
	.input({
		recordId: v.id("records"),
		values: v.any(),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// Load + verify record
		const record = await ctx.db.get(args.recordId);
		if (!record || record.orgId !== orgId || record.isDeleted) {
			throw new ConvexError("Record not found or access denied");
		}

		// Load objectDef
		const objectDef = await ctx.db.get(record.objectDefId);
		if (!objectDef) {
			throw new ConvexError("Object definition not found");
		}

		// Load active fieldDefs, build fieldsByName
		const allFieldDefs = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", record.objectDefId))
			.collect();
		const activeFieldDefs = allFieldDefs.filter((fd) => fd.isActive);

		const fieldsByName = new Map<string, FieldDef>();
		for (const fd of activeFieldDefs) {
			fieldsByName.set(fd.name, fd);
		}

		// Validate shape
		assertPlainObject(args.values);
		const values = args.values;

		// Collect before/after for audit diff
		const beforeValues: Record<string, unknown> = {};
		const afterValues: Record<string, unknown> = {};

		// Process each changed field
		for (const [fieldName, newValue] of Object.entries(values)) {
			const fieldDef = fieldsByName.get(fieldName);
			if (!fieldDef) {
				throw new ConvexError(`Unknown field: "${fieldName}"`);
			}
			validateFieldValue(fieldDef, newValue);

			// Read existing value
			const existingRow = await readExistingValue(ctx, args.recordId, fieldDef);
			beforeValues[fieldName] = existingRow ? existingRow.value : null;

			// Delete existing row if present
			if (existingRow) {
				await ctx.db.delete(existingRow._id);
			}

			// Write new value
			await writeValue(ctx, args.recordId, fieldDef, newValue);
			afterValues[fieldName] = newValue;
		}

		// Update labelValue if the first text field was modified
		const textFields = activeFieldDefs
			.filter((fd) => fd.fieldType === "text")
			.sort((a, b) => a.displayOrder - b.displayOrder);
		const firstTextField = textFields[0];

		const patch: { updatedAt: number; labelValue?: string } = {
			updatedAt: Date.now(),
		};

		if (firstTextField && firstTextField.name in values) {
			const newLabel = values[firstTextField.name];
			patch.labelValue =
				typeof newLabel === "string" && newLabel.length > 0
					? newLabel
					: undefined;
		}

		await ctx.db.patch(args.recordId, patch);

		// Audit with diff
		await auditLog.logChange(ctx, {
			action: "crm.record.updated",
			actorId: ctx.viewer.authId,
			resourceType: "records",
			resourceId: args.recordId,
			before: beforeValues,
			after: afterValues,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

// ── deleteRecord ─────────────────────────────────────────────────────
// Soft-delete: sets isDeleted=true. Value rows are preserved for audit trail.
export const deleteRecord = crmMutation
	.input({ recordId: v.id("records") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const record = await ctx.db.get(args.recordId);
		if (!record || record.orgId !== orgId) {
			throw new ConvexError("Record not found or access denied");
		}

		// Soft-delete
		await ctx.db.patch(args.recordId, {
			isDeleted: true,
			updatedAt: Date.now(),
		});

		// Audit
		await auditLog.log(ctx, {
			action: "crm.record.deleted",
			actorId: ctx.viewer.authId,
			resourceType: "records",
			resourceId: args.recordId,
			severity: "warning",
			metadata: {
				objectDefId: record.objectDefId,
				orgId,
			},
		});
	})
	.public();
