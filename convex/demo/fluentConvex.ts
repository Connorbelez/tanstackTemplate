import { ConvexError, v } from "convex/values";
import { WithZod } from "fluent-convex/zod";
import { z } from "zod/v4";
import {
	adminMutation,
	authedQuery,
	authMiddleware,
	convex,
	requirePermission,
	TimedBuilder,
	withLogging,
} from "../fluent";

// ═══════════════════════════════════════════════════════════════════
// 3a. Builder Basics
// ═══════════════════════════════════════════════════════════════════

export const listWidgets = convex
	.query()
	.input({ limit: v.optional(v.number()) })
	.handler(async (ctx, input) => {
		return await ctx.db
			.query("demo_fluent_widgets")
			.order("desc")
			.take(input.limit ?? 50);
	})
	.public();

export const createWidget = convex
	.mutation()
	.input({ name: v.string() })
	.handler(async (ctx, input) => {
		return await ctx.db.insert("demo_fluent_widgets", {
			name: input.name,
			createdBy: "anonymous",
			createdAt: Date.now(),
		});
	})
	.public();

export const deleteWidget = convex
	.mutation()
	.input({ id: v.id("demo_fluent_widgets") })
	.handler(async (ctx, input) => {
		// Also clean up any widget users
		const widgetUsers = await ctx.db
			.query("demo_fluent_widget_users")
			.withIndex("by_widget", (q) => q.eq("widgetId", input.id))
			.collect();
		for (const wu of widgetUsers) {
			await ctx.db.delete(wu._id);
		}
		await ctx.db.delete(input.id);
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3b. Middleware Demo
// ═══════════════════════════════════════════════════════════════════

export const getMyProfile = authedQuery
	.input({})
	.handler(async (ctx) => {
		const name =
			`${ctx.viewer.firstName ?? ""} ${ctx.viewer.lastName ?? ""}`.trim() ||
			ctx.viewer.email ||
			"Unknown";
		return {
			name,
			email: ctx.viewer.email,
			authId: ctx.viewer.authId,
		};
	})
	.public();

export const createWidgetLogged = convex
	.mutation()
	.use(authMiddleware)
	.use(withLogging("createWidget"))
	.input({ name: v.string() })
	.handler(async (ctx, input) => {
		return await ctx.db.insert("demo_fluent_widgets", {
			name: input.name,
			createdBy: ctx.viewer.email ?? "anonymous",
			createdAt: Date.now(),
		});
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3c. Validation — 3 Approaches
// ═══════════════════════════════════════════════════════════════════

// Approach 1: Property validators
export const validateProperty = convex
	.query()
	.input({ count: v.number(), name: v.string() })
	.handler(async (_ctx, input) => {
		return { count: input.count, name: input.name, method: "property" };
	})
	.public();

// Approach 2: Object validators + .returns()
export const validateObject = convex
	.query()
	.input(v.object({ count: v.number(), name: v.string() }))
	.returns(
		v.object({
			count: v.number(),
			name: v.string(),
			method: v.string(),
		})
	)
	.handler(async (_ctx, input) => {
		return { count: input.count, name: input.name, method: "object" };
	})
	.public();

// Approach 3: Zod schemas with refinements
export const validateZod = convex
	.query()
	.extend(WithZod)
	.input(
		z.object({
			count: z.number().int().min(1).max(100),
			email: z.string().email(),
		})
	)
	.returns(
		z.object({
			count: z.number(),
			email: z.string(),
			method: z.string(),
		})
	)
	.handler(async (_ctx, input) => {
		return { count: input.count, email: input.email, method: "zod" };
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3d. Zod Refinements
// ═══════════════════════════════════════════════════════════════════

export const addPositiveWidget = convex
	.mutation()
	.extend(WithZod)
	.input(
		z.object({
			name: z.string().min(1).max(50),
			score: z.number().positive("Score must be positive"),
		})
	)
	.handler(async (ctx, input) => {
		return await ctx.db.insert("demo_fluent_widgets", {
			name: `${input.name} (score: ${input.score})`,
			createdBy: "zod-demo",
			createdAt: Date.now(),
		});
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3e. RBAC: Admin Role Check
// ═══════════════════════════════════════════════════════════════════

export const resetWidgets = adminMutation
	.use(withLogging("resetWidgets"))
	.input({})
	.handler(async (ctx) => {
		const widgets = await ctx.db.query("demo_fluent_widgets").collect();
		const widgetUsers = await ctx.db
			.query("demo_fluent_widget_users")
			.collect();

		for (const wu of widgetUsers) {
			await ctx.db.delete(wu._id);
		}
		for (const w of widgets) {
			await ctx.db.delete(w._id);
		}

		return { deleted: widgets.length + widgetUsers.length };
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3f. RBAC: Permission Check
// ═══════════════════════════════════════════════════════════════════

export const addWidgetUser = convex
	.mutation()
	.use(authMiddleware)
	.use(requirePermission("widgets:users-table:manage"))
	.input({
		widgetId: v.id("demo_fluent_widgets"),
		userId: v.string(),
		role: v.string(),
	})
	.handler(async (ctx, input) => {
		return await ctx.db.insert("demo_fluent_widget_users", {
			widgetId: input.widgetId,
			userId: input.userId,
			role: input.role,
		});
	})
	.public();

export const listWidgetUsers = authedQuery
	.input({ widgetId: v.id("demo_fluent_widgets") })
	.handler(async (ctx, input) => {
		return await ctx.db
			.query("demo_fluent_widget_users")
			.withIndex("by_widget", (q) => q.eq("widgetId", input.widgetId))
			.collect();
	})
	.public();

export const removeWidgetUser = convex
	.mutation()
	.use(authMiddleware)
	.use(requirePermission("widgets:users-table:manage"))
	.input({ id: v.id("demo_fluent_widget_users") })
	.handler(async (ctx, input) => {
		await ctx.db.delete(input.id);
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3g. Callables Demo
// ═══════════════════════════════════════════════════════════════════

// Callable — NOT registered, reusable building block
const getWidgetCount = convex
	.query()
	.input({})
	.handler(async (ctx) => {
		const widgets = await ctx.db.query("demo_fluent_widgets").collect();
		return { count: widgets.length };
	});

// Direct registration of the callable
export const widgetCount = getWidgetCount.public();

// Call callable inside another handler, add timestamp
export const widgetSummary = convex
	.query()
	.input({})
	.handler(async (ctx) => {
		const { count } = await getWidgetCount(ctx, {});
		return { count, timestamp: Date.now() };
	})
	.public();

// Same callable with auth middleware layered on
export const widgetCountProtected = getWidgetCount.use(authMiddleware).public();

// ═══════════════════════════════════════════════════════════════════
// 3h. Custom Plugin Demo
// ═══════════════════════════════════════════════════════════════════

export const timedWidgetList = convex
	.query()
	.extend(TimedBuilder)
	.withTiming("timedWidgetList")
	.input({})
	.handler(async (ctx) => {
		const widgets = await ctx.db.query("demo_fluent_widgets").collect();
		return { widgets, fetchedAt: Date.now() };
	})
	.public();

// ═══════════════════════════════════════════════════════════════════
// 3i. Seed Data
// ═══════════════════════════════════════════════════════════════════

export const seedWidgets = convex
	.mutation()
	.input({})
	.handler(async (ctx) => {
		const existing = await ctx.db.query("demo_fluent_widgets").first();
		if (existing) {
			throw new ConvexError("Widgets already exist — clear first");
		}

		const names = ["Alpha Widget", "Beta Widget", "Gamma Widget"];
		let seeded = 0;
		for (const name of names) {
			await ctx.db.insert("demo_fluent_widgets", {
				name,
				createdBy: "seed",
				createdAt: Date.now(),
			});
			seeded++;
		}
		return { seeded };
	})
	.public();
