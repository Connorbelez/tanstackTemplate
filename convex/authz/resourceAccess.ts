import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
	canAccessAccrual,
	canAccessBorrowerEntity,
	canAccessCashLedgerAccount,
	canAccessCounterpartyResource,
	canAccessDeal,
	canAccessDispersal,
	canAccessDocument,
	canAccessLenderEntity,
	canAccessMortgage,
	canAccessObligation,
	canAccessTransferRequest,
	canAccessWorkoutPlan,
} from "../auth/resourceChecks";
import type { Viewer } from "../fluent";

type ViewerContext = Pick<QueryCtx, "db"> & { viewer: Viewer };

async function assertResourceAccess<TArgs extends readonly unknown[]>(args: {
	check: (
		ctx: Pick<QueryCtx, "db">,
		viewer: Viewer,
		...resourceArgs: TArgs
	) => Promise<boolean>;
	ctx: ViewerContext;
	deniedMessage: string;
	resourceArgs: TArgs;
}) {
	const allowed = await args.check(
		args.ctx,
		args.ctx.viewer,
		...args.resourceArgs
	);
	if (allowed) {
		return;
	}

	throw new ConvexError(args.deniedMessage);
}

export async function assertMortgageAccess(
	ctx: ViewerContext,
	mortgageId: Id<"mortgages">
) {
	return assertResourceAccess({
		check: canAccessMortgage,
		ctx,
		deniedMessage: `Forbidden: no mortgage access for ${String(mortgageId)}`,
		resourceArgs: [mortgageId] as const,
	});
}

export async function assertDealAccess(
	ctx: ViewerContext,
	dealId: Id<"deals">
) {
	return assertResourceAccess({
		check: canAccessDeal,
		ctx,
		deniedMessage: `Forbidden: no deal access for ${String(dealId)}`,
		resourceArgs: [dealId] as const,
	});
}

export async function assertLenderEntityAccess(
	ctx: ViewerContext,
	lenderId: Id<"lenders">
) {
	return assertResourceAccess({
		check: canAccessLenderEntity,
		ctx,
		deniedMessage: `Forbidden: no lender access for ${String(lenderId)}`,
		resourceArgs: [lenderId] as const,
	});
}

export async function assertBorrowerEntityAccess(
	ctx: ViewerContext,
	borrowerId: Id<"borrowers">
) {
	return assertResourceAccess({
		check: canAccessBorrowerEntity,
		ctx,
		deniedMessage: `Forbidden: no borrower access for ${String(borrowerId)}`,
		resourceArgs: [borrowerId] as const,
	});
}

export async function assertObligationAccess(
	ctx: ViewerContext,
	obligationId: Id<"obligations">
) {
	return assertResourceAccess({
		check: canAccessObligation,
		ctx,
		deniedMessage: `Forbidden: no obligation access for ${String(obligationId)}`,
		resourceArgs: [obligationId] as const,
	});
}

export async function assertCashLedgerAccountAccess(
	ctx: ViewerContext,
	accountId: Id<"cash_ledger_accounts">
) {
	return assertResourceAccess({
		check: canAccessCashLedgerAccount,
		ctx,
		deniedMessage: `Forbidden: no cash-ledger account access for ${String(accountId)}`,
		resourceArgs: [accountId] as const,
	});
}

export async function assertTransferRequestAccess(
	ctx: ViewerContext,
	transferId: Id<"transferRequests">
) {
	return assertResourceAccess({
		check: canAccessTransferRequest,
		ctx,
		deniedMessage: `Forbidden: no transfer access for ${String(transferId)}`,
		resourceArgs: [transferId] as const,
	});
}

export async function assertCounterpartyResourceAccess(
	ctx: ViewerContext,
	args: {
		ownerId: string;
		ownerType: Parameters<typeof canAccessCounterpartyResource>[2];
	}
) {
	return assertResourceAccess({
		check: canAccessCounterpartyResource,
		ctx,
		deniedMessage: `Forbidden: no ${args.ownerType} access for ${args.ownerId}`,
		resourceArgs: [args.ownerType, args.ownerId] as const,
	});
}

export async function assertWorkoutPlanAccess(
	ctx: ViewerContext,
	workoutPlanId: Id<"workoutPlans">
) {
	return assertResourceAccess({
		check: canAccessWorkoutPlan,
		ctx,
		deniedMessage: `Forbidden: no workout plan access for ${String(workoutPlanId)}`,
		resourceArgs: [workoutPlanId] as const,
	});
}

export async function assertDocumentAccess(
	ctx: ViewerContext,
	documentId: Id<"generatedDocuments">
) {
	return assertResourceAccess({
		check: canAccessDocument,
		ctx,
		deniedMessage: `Forbidden: no document access for ${String(documentId)}`,
		resourceArgs: [documentId] as const,
	});
}

export async function assertAccrualAccess(
	ctx: ViewerContext,
	lenderAuthId: string
) {
	return assertResourceAccess({
		check: canAccessAccrual,
		ctx,
		deniedMessage: `Forbidden: no accrual access for lender ${lenderAuthId}`,
		resourceArgs: [lenderAuthId] as const,
	});
}

async function resolveLenderAuthIdOrThrow(
	ctx: Pick<QueryCtx, "db">,
	lenderId: Id<"lenders">
) {
	const lender = await ctx.db.get(lenderId);
	if (!lender) {
		throw new ConvexError("Lender not found");
	}

	const user = await ctx.db.get(lender.userId);
	if (!user) {
		throw new ConvexError("Lender user not found");
	}

	return user.authId;
}

export async function assertLenderDispersalAccess(
	ctx: ViewerContext,
	lenderId: Id<"lenders">
) {
	const lenderAuthId = await resolveLenderAuthIdOrThrow(ctx, lenderId);
	return assertResourceAccess({
		check: canAccessDispersal,
		ctx,
		deniedMessage: "No access to this dispersal data",
		resourceArgs: [lenderAuthId] as const,
	});
}

export function assertFairLendAdminAccess(
	viewer: Pick<Viewer, "isFairLendAdmin">,
	message = "Forbidden: fair lend admin role required"
) {
	if (viewer.isFairLendAdmin) {
		return;
	}

	throw new ConvexError(message);
}
