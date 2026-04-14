import type {
	Auth,
	GenericDatabaseReader,
	GenericDataModel,
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
import type { DataModel } from "./_generated/dataModel";
import { auditAuthFailure } from "./auth/auditAuth";
import { FAIRLEND_STAFF_ORG_ID } from "./constants";

// ── Builder ─────────────────────────────────────────────────────────
export const convex = createBuilder<DataModel>();

export interface Viewer {
	authId: string;
	email: string | undefined;
	firstName: string | undefined;
	isFairLendAdmin: boolean; // role === "admin" && orgId === FAIRLEND_STAFF_ORG_ID
	lastName: string | undefined;
	orgId: string | undefined;
	orgName: string | undefined;
	permissions: Set<string>;
	role: string | undefined;
	roles: Set<string>;
}
// ── Helpers ──────────────────────────────────────────────────────────
const ADMIN_ACCESS_PERMISSION = "admin:access";

// Identity claims like `permissions` / `roles` may arrive as a JSON string,
// an already-parsed array, undefined, or empty string — normalise to string[].
function parseClaimArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === "string");
	}
	if (typeof value === "string" && value.length > 0) {
		try {
			const parsed: unknown = JSON.parse(value);
			return Array.isArray(parsed)
				? parsed.filter((entry): entry is string => typeof entry === "string")
				: [];
		} catch {
			return [];
		}
	}
	return [];
}

function viewerHasPermission(viewer: Viewer, permission: string) {
	return (
		viewer.permissions.has(permission) ||
		viewer.permissions.has(ADMIN_ACCESS_PERMISSION)
	);
}

// ── Auth Middleware (context enrichment) ─────────────────────────────
// Uses $context so it works with queries AND mutations (both have auth + db).
// Extracts JWT identity claims and builds a `Viewer` with roles, permissions,
// and org context. Downstream mutations (e.g. onboarding) query the `users`
// table separately — a missing user row will surface as a ConvexError there.
export const authMiddleware = convex
	.$context<{ auth: Auth; db: GenericDatabaseReader<DataModel> }>()
	.createMiddleware(async (context, next) => {
		const identity = await context.auth.getUserIdentity();
		if (!identity) {
			await auditAuthFailure(context, undefined, {
				middleware: "authMiddleware",
				reason: "No identity found — unauthenticated access attempt",
			});
			throw new ConvexError("Unauthorized: sign in required");
		}
		const {
			subject,
			org_id,
			organization_name,
			permissions,
			role,
			roles,
			user_email,
			user_first_name,
			user_last_name,
		} = identity;
		const permissionsSet = new Set(parseClaimArray(permissions));
		const roleSet = new Set(parseClaimArray(roles));
		return next({
			...context,
			viewer: {
				authId: subject,
				email: user_email,
				orgId: org_id,
				orgName: organization_name,
				firstName: user_first_name,
				lastName: user_last_name,
				role,
				roles: roleSet,
				permissions: permissionsSet,
				isFairLendAdmin:
					org_id === FAIRLEND_STAFF_ORG_ID && roleSet.has("admin"),
			} as Viewer,
		});
	});

export const requireFairLendAdmin = convex
	.$context<{
		db: GenericDatabaseReader<DataModel>;
		auth: Auth;
		viewer: Viewer;
	}>()
	.createMiddleware(async (context, next) => {
		const isFairLendAdmin = context.viewer.isFairLendAdmin;
		if (!isFairLendAdmin) {
			await auditAuthFailure(context, context.viewer, {
				middleware: "requireFairLendAdmin",
				reason: "User is not a FairLend Staff admin",
			});
			throw new ConvexError("Forbidden: fair lend admin role required");
		}
		return next(context);
	});

const UNDERWRITER_ROLES = new Set([
	"sr_underwriter",
	"jr_underwriter",
	"underwriter",
] as const);

function hasUnderwriterRole(viewer: Viewer) {
	for (const role of viewer.roles) {
		if ((UNDERWRITER_ROLES as ReadonlySet<string>).has(role)) {
			return { hasRole: true, role: viewer.role };
		}
	}
	return { hasRole: false, role: viewer.role };
}

export const requireOrgContext = convex
	.$context<{
		db: GenericDatabaseReader<DataModel>;
		auth: Auth;
		viewer: Viewer;
	}>()
	.createMiddleware(async (context, next) => {
		const org_id = context.viewer.orgId;

		if (!(org_id || hasUnderwriterRole(context.viewer).hasRole)) {
			await auditAuthFailure(context, context.viewer, {
				middleware: "requireOrgContext",
				reason: "Missing org context and not an underwriter",
			});
			throw new ConvexError("Forbidden: org context required");
		}
		return next(context);
	});

// ── RBAC: requireAdmin ──────────────────────────────────────────────
// Checks if the authenticated user has at least one membership with
// roleSlug === "admin". Must be used AFTER authMiddleware.
export const requireAdmin = convex
	.$context<{
		db: GenericDatabaseReader<DataModel>;
		auth: Auth;
		viewer: Viewer;
	}>()
	.createMiddleware(async (context, next) => {
		const isAdmin = context.viewer.roles.has("admin");
		if (!isAdmin) {
			await auditAuthFailure(context, context.viewer, {
				middleware: "requireAdmin",
				reason: "User does not have admin role",
			});
			throw new ConvexError("Forbidden: admin role required");
		}

		return next({ ...context, isAdmin: true as const });
	});

// ── RBAC: requirePermission(permission) factory ─────────────────────
// Returns middleware that checks whether the authenticated viewer already has
// the required permission in their JWT-derived permission set.
export function requirePermission(permission: string) {
	return convex
		.$context<{ db: GenericDatabaseReader<DataModel>; viewer: Viewer }>()
		.createMiddleware(async (context, next) => {
			if (!viewerHasPermission(context.viewer, permission)) {
				await auditAuthFailure(context, context.viewer, {
					middleware: "requirePermission",
					required: permission,
					reason: `Missing permission: ${permission}`,
				});
				throw new ConvexError(`Forbidden: permission "${permission}" required`);
			}
			return next({ ...context, permission });
		});
}

/**
 * Action-safe permission middleware.
 * Actions do not expose `db`, so this variant relies on `auditAuthFailure`'s
 * action-compatible fallback when recording permission denials.
 */
export function requirePermissionAction(permission: string) {
	return convex
		.$context<{ viewer: Viewer }>()
		.createMiddleware(async (context, next) => {
			if (!viewerHasPermission(context.viewer, permission)) {
				await auditAuthFailure(context, context.viewer, {
					middleware: "requirePermissionAction",
					required: permission,
					reason: `Missing permission: ${permission}`,
				});
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

// ── Action Auth Middleware (no db — cannot audit) ───────────────────
// Actions lack ctx.db, so we can't call auditAuthFailure. This middleware
// mirrors authMiddleware's Viewer construction without the DB-dependent audit.
export const actionAuthMiddleware = convex
	.$context<{ auth: Auth }>()
	.createMiddleware(async (context, next) => {
		const identity = await context.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError("Unauthorized: sign in required");
		}
		const {
			subject,
			org_id,
			organization_name,
			permissions,
			role,
			roles,
			user_email,
			user_first_name,
			user_last_name,
		} = identity;
		const permissionsSet = new Set(parseClaimArray(permissions));
		const roleSet = new Set(parseClaimArray(roles));
		return next({
			...context,
			viewer: {
				authId: subject,
				email: user_email,
				orgId: org_id,
				orgName: organization_name,
				firstName: user_first_name,
				lastName: user_last_name,
				role,
				roles: roleSet,
				permissions: permissionsSet,
				isFairLendAdmin:
					org_id === FAIRLEND_STAFF_ORG_ID && roleSet.has("admin"),
			} as Viewer,
		});
	});

export const requireFairLendAdminAction = convex
	.$context<{
		viewer: Viewer;
	}>()
	.createMiddleware(async (context, next) => {
		if (!context.viewer.isFairLendAdmin) {
			await auditAuthFailure(context, context.viewer, {
				middleware: "requireFairLendAdminAction",
				reason: "User is not a FairLend Staff admin",
			});
			throw new ConvexError("Forbidden: fair lend admin role required");
		}
		return next(context);
	});

// ── Reusable Chains ─────────────────────────────────────────────────
// Pre-configured chains with auth middleware baked in.
export const authedQuery = convex.query().use(authMiddleware);
export const authedMutation = convex.mutation().use(authMiddleware);
export const authedAction = convex.action().use(actionAuthMiddleware);
export const adminAction = authedAction.use(requireFairLendAdminAction);
export const adminMutation = convex
	.mutation()
	.use(authMiddleware)
	.use(requireFairLendAdmin);
export const brokerQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("broker:access"));
export const brokerMutation = authedMutation
	.use(requireOrgContext)
	.use(requirePermission("broker:access"));
export const borrowerQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("borrower:access"));
export const borrowerMutation = authedMutation
	.use(requireOrgContext)
	.use(requirePermission("borrower:access"));
export const lenderQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("lender:access"));
export const lenderMutation = authedMutation
	.use(requireOrgContext)
	.use(requirePermission("lender:access"));
export const underwriterQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("underwriter:access"));
export const underwriterMutation = authedMutation
	.use(requireOrgContext)
	.use(requirePermission("underwriter:access"));
export const lawyerQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("lawyer:access"));
export const lawyerMutation = authedMutation
	.use(requireOrgContext)
	.use(requirePermission("lawyer:access"));

export const adminQuery = authedQuery.use(requireFairLendAdmin);
// Underwriting
export const uwQuery = authedQuery
	.use(requireOrgContext)
	.use(requirePermission("underwriter:access"));
export const uwMutation = authedMutation
	.use(requireOrgContext)
	.use(requirePermission("underwriter:access"));

// Domain-specific (for downstream projects)
export const dealQuery = authedQuery.use(requirePermission("deal:view"));
export const dealMutation = authedMutation.use(
	requirePermission("deal:manage")
);
export const ledgerQuery = authedQuery.use(requirePermission("ledger:view"));
export const ledgerMutation = authedMutation.use(
	requirePermission("ledger:correct")
);
export const cashLedgerQuery = adminQuery.use(
	requirePermission("cash_ledger:view")
);
export const cashLedgerMutation = authedMutation.use(
	requirePermission("cash_ledger:correct")
);
export const paymentQuery = adminQuery.use(requirePermission("payment:view"));
export const paymentMutation = authedMutation.use(
	requirePermission("payment:manage")
);
export const paymentRetryMutation = authedMutation.use(
	requirePermission("payment:retry")
);
export const paymentCancelMutation = authedMutation.use(
	requirePermission("payment:cancel")
);
export const paymentAction = authedAction.use(
	requirePermissionAction("payment:manage")
);
export const paymentOwnQuery = authedQuery.use(
	requirePermission("payment:view_own")
);
export const paymentWebhookMutation = authedMutation.use(
	requirePermission("payment:webhook_process")
);
export const paymentWebhookAction = authedAction.use(
	requirePermissionAction("payment:webhook_process")
);

// ── Document Engine Chains ──────────────────────────────────────────
// Document authoring/generation remains staff-only until the product has a
// dedicated non-admin document operations role model.
export const documentQuery = adminQuery.use(
	requirePermission("document:review")
);
export const documentUploadMutation = adminMutation.use(
	requirePermission("document:upload")
);
export const documentUploadAction = adminAction.use(
	requirePermissionAction("document:upload")
);
export const documentGenerateAction = adminAction.use(
	requirePermissionAction("document:generate")
);

// ── CRM Chains ──────────────────────────────────────────────────────
// Control Plane mutations (admin + org context)
export const crmAdminMutation = authedMutation
	.use(requireOrgContext)
	.use(requireAdmin);

export const crmAdminQuery = authedQuery
	.use(requireOrgContext)
	.use(requireAdmin);

// Data plane remains admin-only until viewer/editor permission splits exist.
export const crmQuery = crmAdminQuery;
export const crmMutation = crmAdminMutation;

export const whoAmI = convex
	.query()
	.use(authMiddleware)
	.handler(async (ctx) => {
		return {
			...ctx.viewer,
			roles: [...ctx.viewer.roles],
			permissions: [...ctx.viewer.permissions],
		};
	})
	.public();
