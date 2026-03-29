import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** WorkOS org id for audit rows when the governing entity carries org scope. */
export function auditOrganizationIdFromEntityDocument(entity: {
	orgId?: string;
	targetOrganizationId?: string;
}): string | undefined {
	return entity.orgId ?? entity.targetOrganizationId;
}

/** Broker must have `orgId` set (canonical WorkOS org for the brokerage). */
export function requireOrgIdFromBroker(
	broker: Doc<"brokers"> | null | undefined
): string {
	const orgId = broker?.orgId;
	if (!orgId) {
		throw new ConvexError(
			"Broker record is missing orgId (WorkOS organization id)"
		);
	}
	return orgId;
}

export async function orgIdFromMortgageId(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">
): Promise<string | undefined> {
	const mortgage = await ctx.db.get(mortgageId);
	return mortgage?.orgId;
}

export interface TransferOrgResolutionRefs {
	borrowerId?: Id<"borrowers">;
	collectionAttemptId?: Id<"collectionAttempts">;
	dealId?: Id<"deals">;
	dispersalEntryId?: Id<"dispersalEntries">;
	lenderId?: Id<"lenders">;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	planEntryId?: Id<"collectionPlanEntries">;
}

async function orgIdFromPlanEntry(
	ctx: MutationCtx,
	planEntryId: Id<"collectionPlanEntries">
): Promise<string | undefined> {
	const plan = await ctx.db.get(planEntryId);
	const firstObligationId = plan?.obligationIds[0];
	if (!firstObligationId) {
		return undefined;
	}
	const obligation = await ctx.db.get(firstObligationId);
	if (obligation?.orgId) {
		return obligation.orgId;
	}
	if (obligation) {
		return orgIdFromMortgageId(ctx, obligation.mortgageId);
	}
	return undefined;
}

async function orgIdFromDispersalEntry(
	ctx: MutationCtx,
	dispersalEntryId: Id<"dispersalEntries">
): Promise<string | undefined> {
	const entry = await ctx.db.get(dispersalEntryId);
	if (!entry) {
		return undefined;
	}
	if (entry.orgId) {
		return entry.orgId;
	}
	return orgIdFromMortgageId(ctx, entry.mortgageId);
}

async function orgIdFromObligation(
	ctx: MutationCtx,
	obligationId: Id<"obligations">
): Promise<string | undefined> {
	const obligation = await ctx.db.get(obligationId);
	if (!obligation) {
		return undefined;
	}
	if (obligation.orgId) {
		return obligation.orgId;
	}
	return orgIdFromMortgageId(ctx, obligation.mortgageId);
}

async function orgIdFromDeal(
	ctx: MutationCtx,
	dealId: Id<"deals">
): Promise<string | undefined> {
	const deal = await ctx.db.get(dealId);
	if (!deal) {
		return undefined;
	}
	if (deal.orgId) {
		return deal.orgId;
	}
	return orgIdFromMortgageId(ctx, deal.mortgageId);
}

async function orgIdFromCollectionAttempt(
	ctx: MutationCtx,
	collectionAttemptId: Id<"collectionAttempts">
): Promise<string | undefined> {
	const attempt = await ctx.db.get(collectionAttemptId);
	if (!attempt) {
		return undefined;
	}
	return orgIdFromPlanEntry(ctx, attempt.planEntryId);
}

async function orgIdFromLender(
	ctx: MutationCtx,
	lenderId: Id<"lenders">
): Promise<string | undefined> {
	const lender = await ctx.db.get(lenderId);
	return lender?.orgId;
}

async function orgIdFromBorrower(
	ctx: MutationCtx,
	borrowerId: Id<"borrowers">
): Promise<string | undefined> {
	const borrower = await ctx.db.get(borrowerId);
	return borrower?.orgId;
}

/**
 * Denormalized org id for a new transfer request, derived from the strongest
 * available graph link. Returns undefined when no row in the chain has org yet
 * (legacy data); schema keeps `orgId` optional on `transferRequests`.
 */
export async function orgIdForTransferRequest(
	ctx: MutationCtx,
	refs: TransferOrgResolutionRefs
): Promise<string | undefined> {
	type TryOrg = () => Promise<string | undefined>;
	const tries: TryOrg[] = [
		() =>
			refs.dispersalEntryId
				? orgIdFromDispersalEntry(ctx, refs.dispersalEntryId)
				: Promise.resolve(undefined),
		() =>
			refs.mortgageId
				? orgIdFromMortgageId(ctx, refs.mortgageId)
				: Promise.resolve(undefined),
		() =>
			refs.obligationId
				? orgIdFromObligation(ctx, refs.obligationId)
				: Promise.resolve(undefined),
		() =>
			refs.dealId
				? orgIdFromDeal(ctx, refs.dealId)
				: Promise.resolve(undefined),
		() =>
			refs.collectionAttemptId
				? orgIdFromCollectionAttempt(ctx, refs.collectionAttemptId)
				: Promise.resolve(undefined),
		() =>
			refs.planEntryId
				? orgIdFromPlanEntry(ctx, refs.planEntryId)
				: Promise.resolve(undefined),
		() =>
			refs.lenderId
				? orgIdFromLender(ctx, refs.lenderId)
				: Promise.resolve(undefined),
		() =>
			refs.borrowerId
				? orgIdFromBorrower(ctx, refs.borrowerId)
				: Promise.resolve(undefined),
	];

	for (const tryOrg of tries) {
		const orgId = await tryOrg();
		if (orgId) {
			return orgId;
		}
	}

	return undefined;
}
