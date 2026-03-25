import type { GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import {
	customCtx,
	customMutation,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../_generated/dataModel";
// biome-ignore lint/style/noRestrictedImports: Triggers require raw mutation for customMutation with wrapDB
import { mutation as rawMutation } from "../_generated/server";
import { authedQuery } from "../fluent";

const triggers = new Triggers<DataModel>();

// ── Trigger 1: Computed fullName ────────────────────────────────────
triggers.register("demo_triggers_contacts", async (ctx, change) => {
	if (change.newDoc) {
		const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
		if (change.newDoc.fullName !== fullName) {
			await ctx.db.patch(change.id, { fullName });
		}
	}
});

// ── Trigger 2: Email validation ─────────────────────────────────────
triggers.register("demo_triggers_contacts", async (_ctx, change) => {
	if (change.newDoc && !change.newDoc.email.includes("@")) {
		throw new Error(`Invalid email: "${change.newDoc.email}" must contain @`);
	}
});

// ── Trigger 3: Denormalized category counts ─────────────────────────
triggers.register("demo_triggers_contacts", async (ctx, change) => {
	if (change.operation === "insert") {
		await adjustCount(ctx, change.newDoc.category, 1);
	} else if (change.operation === "delete") {
		await adjustCount(ctx, change.oldDoc.category, -1);
	} else if (
		change.operation === "update" &&
		change.oldDoc.category !== change.newDoc.category
	) {
		await adjustCount(ctx, change.oldDoc.category, -1);
		await adjustCount(ctx, change.newDoc.category, 1);
	}
});

async function adjustCount(
	ctx: { innerDb: GenericDatabaseWriter<DataModel> },
	category: string,
	delta: number
) {
	// Use innerDb to avoid triggering triggers recursively
	const existing = await ctx.innerDb
		.query("demo_triggers_stats")
		.withIndex("by_category", (q) => q.eq("category", category))
		.unique();

	if (existing) {
		const newCount = existing.count + delta;
		if (newCount <= 0) {
			await ctx.innerDb.delete(existing._id);
		} else {
			await ctx.innerDb.patch(existing._id, { count: newCount });
		}
	} else if (delta > 0) {
		await ctx.innerDb.insert("demo_triggers_stats", {
			category,
			count: delta,
		});
	}
}

// ── Trigger 4: Audit log ────────────────────────────────────────────
triggers.register("demo_triggers_contacts", async (ctx, change) => {
	let summary: string;
	if (change.operation === "insert") {
		const fullName =
			`${change.newDoc.firstName} ${change.newDoc.lastName}`.trim();
		summary = `Added "${fullName}" (${change.newDoc.category})`;
	} else if (change.operation === "update") {
		const changes: string[] = [];
		if (change.oldDoc.firstName !== change.newDoc.firstName) {
			changes.push(
				`firstName: "${change.oldDoc.firstName}" → "${change.newDoc.firstName}"`
			);
		}
		if (change.oldDoc.lastName !== change.newDoc.lastName) {
			changes.push(
				`lastName: "${change.oldDoc.lastName}" → "${change.newDoc.lastName}"`
			);
		}
		if (change.oldDoc.email !== change.newDoc.email) {
			changes.push(
				`email: "${change.oldDoc.email}" → "${change.newDoc.email}"`
			);
		}
		if (change.oldDoc.category !== change.newDoc.category) {
			changes.push(
				`category: "${change.oldDoc.category}" → "${change.newDoc.category}"`
			);
		}
		summary = `Updated "${change.newDoc.fullName}": ${changes.join(", ") || "computed fields"}`;
	} else {
		summary = `Deleted "${change.oldDoc.fullName}"`;
	}
	await ctx.innerDb.insert("demo_triggers_log", {
		contactId: change.id,
		operation: change.operation,
		summary,
		timestamp: Date.now(),
	});
});

// ── Wrap mutation with triggers ─────────────────────────────────────
const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

// ── Mutations ───────────────────────────────────────────────────────
export const addContact = mutation({
	args: {
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		category: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("demo_triggers_contacts", {
			firstName: args.firstName,
			lastName: args.lastName,
			email: args.email,
			category: args.category,
			fullName: "", // computed by trigger
		});
	},
});

export const updateContact = mutation({
	args: {
		id: v.id("demo_triggers_contacts"),
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		category: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			firstName: args.firstName,
			lastName: args.lastName,
			email: args.email,
			category: args.category,
		});
	},
});

export const deleteContact = mutation({
	args: { id: v.id("demo_triggers_contacts") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

export const seedContacts = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query("demo_triggers_contacts").first();
		if (existing) {
			return;
		}

		const contacts = [
			{
				firstName: "Alice",
				lastName: "Johnson",
				email: "alice@work.com",
				category: "work",
			},
			{
				firstName: "Bob",
				lastName: "Smith",
				email: "bob@personal.me",
				category: "personal",
			},
			{
				firstName: "Carol",
				lastName: "Williams",
				email: "carol@work.com",
				category: "work",
			},
			{
				firstName: "Dave",
				lastName: "Brown",
				email: "dave@other.org",
				category: "other",
			},
			{
				firstName: "Eve",
				lastName: "Davis",
				email: "eve@personal.me",
				category: "personal",
			},
		];
		for (const c of contacts) {
			await ctx.db.insert("demo_triggers_contacts", { ...c, fullName: "" });
		}
	},
});

// ── Queries ─────────────────────────────────────────────────────────
export const listContacts = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_triggers_contacts").order("desc").collect();
	})
	.public();

export const getStats = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_triggers_stats").collect();
	})
	.public();

export const getLog = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_triggers_log").order("desc").take(50);
	})
	.public();
