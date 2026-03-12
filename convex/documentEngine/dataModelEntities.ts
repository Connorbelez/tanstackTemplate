import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import schema from "../schema";
import { entityFieldValidator } from "./validators";

// ── Helpers ──────────────────────────────────────────────────────────

const CAMEL_BOUNDARY = /([a-z])([A-Z])/g;

function camelToLabel(name: string): string {
	const spaced = name.replace(CAMEL_BOUNDARY, "$1 $2");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Convert a Convex validator to a human-readable type label.
 * Convex validators expose runtime `.kind`, `.fields`, `.tableName`, etc.
 */
function validatorToTypeLabel(validator: unknown): string {
	const v = validator as Record<string, unknown>;
	const kind = v.kind as string | undefined;
	switch (kind) {
		case "string":
			return "string";
		case "float64":
			return "number";
		case "boolean":
			return "boolean";
		case "int64":
			return "int64";
		case "bytes":
			return "bytes";
		case "id":
			return `id(${v.tableName as string})`;
		case "null":
			return "null";
		case "any":
			return "any";
		case "array": {
			const inner = validatorToTypeLabel(v.element);
			return `array(${inner})`;
		}
		case "record": {
			const kType = validatorToTypeLabel(v.key);
			const vType = validatorToTypeLabel(v.value);
			return `record(${kType}, ${vType})`;
		}
		case "object":
			return "object";
		case "union": {
			const members = v.members as unknown[];
			if (
				members.every((m) => (m as Record<string, unknown>).kind === "literal")
			) {
				const literals = members.map((m) =>
					String((m as Record<string, unknown>).value)
				);
				return literals.join(" | ");
			}
			return "union";
		}
		case "literal":
			return String(v.value);
		default:
			return "unknown";
	}
}

// Tables to skip during seed
const SKIP_PREFIXES = ["demo_"];
const SKIP_TABLES = new Set([
	"documentBasePdfs",
	"systemVariables",
	"documentTemplates",
	"documentTemplateVersions",
	"documentTemplateGroups",
	"dataModelEntities",
]);

// ── Queries ──────────────────────────────────────────────────────────

export const list = query({
	args: {},
	handler: async (ctx) => {
		const entities = await ctx.db.query("dataModelEntities").collect();
		return entities
			.filter((e) => !e.hidden)
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});

// ── Mutations ────────────────────────────────────────────────────────

export const seed = mutation({
	args: {},
	handler: async (ctx) => {
		const tables = schema.tables;
		let seeded = 0;

		for (const [tableName, tableDef] of Object.entries(tables)) {
			if (SKIP_PREFIXES.some((p) => tableName.startsWith(p))) {
				continue;
			}
			if (SKIP_TABLES.has(tableName)) {
				continue;
			}

			// Extract fields from the table validator
			const tableValidator = tableDef.validator as unknown as Record<
				string,
				unknown
			>;
			const fieldDefs = tableValidator.fields as
				| Record<string, unknown>
				| undefined;

			if (!fieldDefs) {
				continue;
			}

			const fields: {
				name: string;
				label: string;
				type: string;
				optional: boolean;
			}[] = [];

			for (const [fieldName, fieldValidator] of Object.entries(fieldDefs)) {
				const fv = fieldValidator as Record<string, unknown>;
				const isOptional = fv.isOptional === "optional";
				// For optional validators, the inner type is wrapped
				const innerValidator = isOptional ? (fv.inner ?? fv) : fv;
				fields.push({
					name: fieldName,
					label: camelToLabel(fieldName),
					type: validatorToTypeLabel(innerValidator),
					optional: isOptional,
				});
			}

			// Upsert by name
			const existing = await ctx.db
				.query("dataModelEntities")
				.withIndex("by_name", (q) => q.eq("name", tableName))
				.first();

			const now = Date.now();
			if (existing) {
				await ctx.db.patch(existing._id, {
					fields,
					label: camelToLabel(tableName),
					updatedAt: now,
				});
			} else {
				await ctx.db.insert("dataModelEntities", {
					name: tableName,
					label: camelToLabel(tableName),
					source: "schema",
					hidden: false,
					fields,
					createdAt: now,
					updatedAt: now,
				});
				seeded++;
			}
		}

		return { seeded };
	},
});

export const createCustomEntity = mutation({
	args: {
		name: v.string(),
		label: v.string(),
		fields: v.array(entityFieldValidator),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("dataModelEntities")
			.withIndex("by_name", (q) => q.eq("name", args.name))
			.first();
		if (existing) {
			throw new ConvexError(`Entity "${args.name}" already exists`);
		}

		const now = Date.now();
		return await ctx.db.insert("dataModelEntities", {
			name: args.name,
			label: args.label,
			source: "custom",
			hidden: false,
			fields: args.fields,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const addField = mutation({
	args: {
		entityId: v.id("dataModelEntities"),
		field: entityFieldValidator,
	},
	handler: async (ctx, args) => {
		const entity = await ctx.db.get(args.entityId);
		if (!entity) {
			throw new ConvexError("Entity not found");
		}

		if (entity.fields.some((f) => f.name === args.field.name)) {
			throw new ConvexError(
				`Field "${args.field.name}" already exists on "${entity.name}"`
			);
		}

		await ctx.db.patch(args.entityId, {
			fields: [...entity.fields, args.field],
			updatedAt: Date.now(),
		});
	},
});

export const removeField = mutation({
	args: {
		entityId: v.id("dataModelEntities"),
		fieldName: v.string(),
	},
	handler: async (ctx, args) => {
		const entity = await ctx.db.get(args.entityId);
		if (!entity) {
			throw new ConvexError("Entity not found");
		}

		await ctx.db.patch(args.entityId, {
			fields: entity.fields.filter((f) => f.name !== args.fieldName),
			updatedAt: Date.now(),
		});
	},
});

export const toggleHidden = mutation({
	args: { entityId: v.id("dataModelEntities") },
	handler: async (ctx, args) => {
		const entity = await ctx.db.get(args.entityId);
		if (!entity) {
			throw new ConvexError("Entity not found");
		}

		await ctx.db.patch(args.entityId, {
			hidden: !entity.hidden,
			updatedAt: Date.now(),
		});
	},
});

export const removeEntity = mutation({
	args: { entityId: v.id("dataModelEntities") },
	handler: async (ctx, args) => {
		const entity = await ctx.db.get(args.entityId);
		if (!entity) {
			throw new ConvexError("Entity not found");
		}

		if (entity.source !== "custom") {
			throw new ConvexError("Only custom entities can be deleted");
		}

		await ctx.db.delete(args.entityId);
	},
});
