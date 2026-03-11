import type {
	Auth,
	GenericDatabaseReader,
	GenericDatabaseWriter,
	GenericDataModel,
	Scheduler,
} from "convex/server";
import { ConvexError } from "convex/values";
import type {
	Context,
	ConvexArgsValidator,
	ConvexBuilderDef,
	ConvexReturnsValidator,
	EmptyObject,
	FunctionType,
} from "fluent-convex";
import { ConvexBuilderWithFunctionKind, createBuilder } from "fluent-convex";
import { internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";

// ── Type guard: can this db handle writes? ──────────────────────────
function isDatabaseWriter(
	db: GenericDatabaseReader<DataModel>
): db is GenericDatabaseWriter<DataModel> {
	return "insert" in db;
}

// ── Builder ─────────────────────────────────────────────────────────
export const convex = createBuilder<DataModel>();

// ── Auth Middleware (context enrichment) ─────────────────────────────
// Uses $context so it works with queries AND mutations (both have auth + db).
// Looks up the user doc and enriches context with `user` + `identity`.
// Resilient: if user is authenticated but missing from DB (race condition /
// missed webhook), auto-creates them in mutation context and schedules a
// backfill for orgs/memberships/roles.
export const authMiddleware = convex
	.$context<{ auth: Auth; db: GenericDatabaseReader<DataModel> }>()
	.createMiddleware(async (context, next) => {
		const identity = await context.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError("Unauthorized: sign in required");
		}

		let user = await context.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", identity.subject))
			.unique();

		if (!user && isDatabaseWriter(context.db)) {
			// User is authenticated but missing from DB — auto-create from
			// identity token since we have write access (mutation context).
			console.log(
				`Auto-creating missing user ${identity.subject} from identity token`
			);
			const id = await context.db.insert("users", {
				authId: identity.subject,
				email: identity.email ?? "",
				firstName: identity.givenName ?? "",
				lastName: identity.familyName ?? "",
			});
			user = await context.db.get(id);

			// Schedule backfill for org memberships and roles
			const ctx = context as Record<string, unknown>;
			if ("scheduler" in ctx && ctx.scheduler != null) {
				await (ctx.scheduler as Scheduler).runAfter(
					0,
					internal.auth.syncUserRelatedData,
					{ userId: identity.subject }
				);
			}
		}

		if (!user) {
			throw new ConvexError("User not found in database");
		}

		return next({
			...context,
			user,
			identity,
		});
	});

// ── RBAC: requireAdmin ──────────────────────────────────────────────
// Checks if the authenticated user has at least one membership with
// roleSlug === "admin". Must be used AFTER authMiddleware.
export const requireAdmin = convex
	.$context<{ db: GenericDatabaseReader<DataModel>; user: Doc<"users"> }>()
	.createMiddleware(async (context, next) => {
		const memberships = await context.db
			.query("organizationMemberships")
			.withIndex("byUser", (q) => q.eq("userWorkosId", context.user.authId))
			.collect();

		const isAdmin = memberships.some((m) => m.roleSlug === "admin");
		if (!isAdmin) {
			throw new ConvexError("Forbidden: admin role required");
		}

		return next({ ...context, isAdmin: true as const });
	});

// ── RBAC: requirePermission(permission) factory ─────────────────────
// Returns middleware that checks if ANY of the user's roles grant the
// specified permission string. Collects role slugs from memberships,
// then looks them up in the `roles` table.
export function requirePermission(permission: string) {
	return convex
		.$context<{ db: GenericDatabaseReader<DataModel>; user: Doc<"users"> }>()
		.createMiddleware(async (context, next) => {
			const memberships = await context.db
				.query("organizationMemberships")
				.withIndex("byUser", (q) => q.eq("userWorkosId", context.user.authId))
				.collect();

			const uniqueSlugs = new Set<string>();
			for (const m of memberships) {
				uniqueSlugs.add(m.roleSlug);
				if (m.roleSlugs) {
					for (const s of m.roleSlugs) {
						uniqueSlugs.add(s);
					}
				}
			}

			let hasPermission = false;
			for (const slug of uniqueSlugs) {
				const role = await context.db
					.query("roles")
					.withIndex("slug", (q) => q.eq("slug", slug))
					.unique();
				if (role?.permissions.includes(permission)) {
					hasPermission = true;
					break;
				}
			}

			if (!hasPermission) {
				throw new ConvexError(`Forbidden: permission "${permission}" required`);
			}

			return next({ ...context, permission });
		});
}

// ── Onion Middleware: withLogging ────────────────────────────────────
// Parameterized middleware that wraps the handler, logging start/end
// and catching errors with duration.
export const withLogging = (operationName: string) =>
	convex.createMiddleware(async (context, next) => {
		const start = Date.now();
		console.log(`[${operationName}] Starting...`);
		try {
			const result = await next(context);
			const duration = Date.now() - start;
			console.log(`[${operationName}] Completed in ${duration}ms`);
			return result;
		} catch (error: unknown) {
			const duration = Date.now() - start;
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				`[${operationName}] Failed after ${duration}ms: ${message}`
			);
			throw error;
		}
	});

// ── Custom Plugin: TimedBuilder ─────────────────────────────────────
// Extends ConvexBuilderWithFunctionKind to add a .withTiming(name) method.
// Overrides _clone() so the plugin type survives through .use()/.input() etc.
export class TimedBuilder<
	TDataModel extends GenericDataModel = GenericDataModel,
	TFunctionType extends FunctionType = FunctionType,
	TCurrentContext extends Context = EmptyObject,
	TArgsValidator extends ConvexArgsValidator | undefined = undefined,
	TReturnsValidator extends ConvexReturnsValidator | undefined = undefined,
> extends ConvexBuilderWithFunctionKind<
	TDataModel,
	TFunctionType,
	TCurrentContext,
	TArgsValidator,
	TReturnsValidator
> {
	constructor(
		builderOrDef:
			| ConvexBuilderDef<TFunctionType, TArgsValidator, TReturnsValidator>
			| ConvexBuilderWithFunctionKind<
					TDataModel,
					TFunctionType,
					TCurrentContext,
					TArgsValidator,
					TReturnsValidator
			  >
	) {
		const def =
			builderOrDef instanceof ConvexBuilderWithFunctionKind
				? (
						builderOrDef as unknown as {
							def: ConvexBuilderDef<
								TFunctionType,
								TArgsValidator,
								TReturnsValidator
							>;
						}
					).def
				: builderOrDef;
		super(def);
	}

	protected _clone(
		def: ConvexBuilderDef<TFunctionType, TArgsValidator, TReturnsValidator>
	) {
		return new TimedBuilder(def);
	}

	withTiming(operationName: string) {
		return this.use(async (ctx, next) => {
			const start = Date.now();
			console.log(`[TIMER:${operationName}] Start`);
			try {
				const result = await next(ctx);
				console.log(`[TIMER:${operationName}] Done in ${Date.now() - start}ms`);
				return result;
			} catch (error) {
				console.error(
					`[TIMER:${operationName}] Error after ${Date.now() - start}ms`
				);
				throw error;
			}
		});
	}
}

// ── Reusable Chains ─────────────────────────────────────────────────
// Pre-configured chains with auth middleware baked in.
export const authedQuery = convex.query().use(authMiddleware);
export const authedMutation = convex.mutation().use(authMiddleware);
export const adminMutation = convex
	.mutation()
	.use(authMiddleware)
	.use(requireAdmin);
