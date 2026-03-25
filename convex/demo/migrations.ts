import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { authedMutation, authedQuery } from "../fluent";

const migrations = new Migrations<DataModel>(components.migrations);

export const addMigratedFlag = migrations.define({
	table: "demo_migrations_items",
	migrateOne: async (ctx, doc) => {
		if (!doc.migrated) {
			await ctx.db.patch(doc._id, { migrated: true });
		}
	},
});

export const runMigration = authedMutation
	.handler(async (ctx) => {
		await migrations.runOne(ctx, internal.demo.migrations.addMigratedFlag);
	})
	.public();

export const seedItems = authedMutation
	.input({ count: v.optional(v.number()) })
	.handler(async (ctx, args) => {
		const count = args.count ?? 50;
		const existing = await ctx.db.query("demo_migrations_items").collect();
		if (existing.length > 0) {
			return { seeded: 0, message: "Items already exist. Clear first." };
		}
		for (let i = 0; i < count; i++) {
			await ctx.db.insert("demo_migrations_items", {
				value: `Item ${i + 1}`,
			});
		}
		return { seeded: count, message: `Seeded ${count} items` };
	})
	.public();

export const clearItems = authedMutation
	.handler(async (ctx) => {
		const items = await ctx.db.query("demo_migrations_items").collect();
		for (const item of items) {
			await ctx.db.delete(item._id);
		}
		return { cleared: items.length };
	})
	.public();

export const listItems = authedQuery
	.handler(async (ctx) => {
		const items = await ctx.db
			.query("demo_migrations_items")
			.order("asc")
			.take(100);
		const returned = items.length;
		const migrated = items.filter((i) => i.migrated === true).length;
		return { items, returned, migrated };
	})
	.public();
