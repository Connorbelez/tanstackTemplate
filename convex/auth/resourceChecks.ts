import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Viewer } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getPostedBalance } from "../ledger/accounts";
import { hasPermissionGrant } from "./permissionCatalog";

/** The 4 entity types that generatedDocuments can be linked to. */
type DocumentEntityType = Doc<"generatedDocuments">["entityType"];

// ═══════════════════════════════════════════════════════════════════
// Resource-level access checks
//
// Every function returns `boolean` — never throws.
// - Admin shortcut: `viewer.isFairLendAdmin` checked first.
// - Resource not found → false.
// ═══════════════════════════════════════════════════════════════════

// ── Identity resolution helpers ─────────────────────────────────────

async function getUserByAuthId(ctx: { db: QueryCtx["db"] }, authId: string) {
	return ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", authId))
		.unique();
}

async function getBrokerByAuthId(ctx: { db: QueryCtx["db"] }, authId: string) {
	const user = await getUserByAuthId(ctx, authId);
	if (!user) {
		return null;
	}
	return ctx.db
		.query("brokers")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.first();
}

async function getBorrowerByAuthId(
	ctx: { db: QueryCtx["db"] },
	authId: string
) {
	const user = await getUserByAuthId(ctx, authId);
	if (!user) {
		return null;
	}
	return ctx.db
		.query("borrowers")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.first();
}

/**
 * Resolve lender entity from a WorkOS auth ID.
 * Auth boundary note: `authId` is not a domain `Id<"lenders">`.
 */
async function getLenderByAuthId(ctx: { db: QueryCtx["db"] }, authId: string) {
	const user = await getUserByAuthId(ctx, authId);
	if (!user) {
		return null;
	}
	return ctx.db
		.query("lenders")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.first();
}

// ── T-002: getLenderMortgageIds ─────────────────────────────────────
// Returns the set of mortgage IDs where the given lender holds a
// POSITION account with a positive balance.
// `lenderAuthId` is the WorkOS authId string stored in ledger_accounts.lenderId,
// not a domain `Id<"lenders">`.

export async function getLenderMortgageIds(
	ctx: { db: QueryCtx["db"] },
	/** WorkOS auth ID, not a domain lender entity ID. */
	lenderAuthId: string
): Promise<Set<Id<"mortgages">>> {
	// Primary: indexed lookup on lenderId
	const indexedAccounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_lender", (q) => q.eq("lenderId", lenderAuthId))
		.collect();

	// Fallback: scan for legacy accounts that store investorId instead of lenderId.
	// These won't be found by the by_lender index. Mirrors the pattern from
	// getPositionAccount in convex/ledger/internal.ts.
	const allAccounts = await ctx.db.query("ledger_accounts").collect();
	const legacyAccounts = allAccounts.filter(
		(account) =>
			!account.lenderId && getAccountLenderId(account) === lenderAuthId
	);

	const combined = [...indexedAccounts, ...legacyAccounts];

	const mortgageIds = new Set<Id<"mortgages">>();
	for (const account of combined) {
		if (account.type !== "POSITION") {
			continue;
		}
		const balance = getPostedBalance(account);
		if (balance <= 0n) {
			continue;
		}
		const effectiveLenderId = getAccountLenderId(account);
		if (effectiveLenderId !== lenderAuthId) {
			continue;
		}
		const mortgageId = account.mortgageId;
		if (mortgageId) {
			mortgageIds.add(mortgageId as Id<"mortgages">);
		}
	}
	return mortgageIds;
}

// ── T-003: isBrokerForMortgage ──────────────────────────────────────

export async function isBrokerForMortgage(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	mortgageId: Id<"mortgages">
): Promise<boolean> {
	const mortgage = await ctx.db.get(mortgageId);
	if (!mortgage) {
		return false;
	}

	const broker = await getBrokerByAuthId(ctx, viewer.authId);
	if (!broker) {
		return false;
	}

	return (
		mortgage.brokerOfRecordId === broker._id ||
		mortgage.assignedBrokerId === broker._id
	);
}

// ── T-004: canAccessMortgage ────────────────────────────────────────

export async function canAccessMortgage(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	mortgageId: Id<"mortgages">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const mortgage = await ctx.db.get(mortgageId);
	if (!mortgage) {
		return false;
	}

	// Borrower check: viewer → user → borrower → mortgageBorrowers join
	const borrower = await getBorrowerByAuthId(ctx, viewer.authId);
	if (borrower) {
		const links = await ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_borrower", (q) => q.eq("borrowerId", borrower._id))
			.collect();
		if (links.some((link) => link.mortgageId === mortgageId)) {
			return true;
		}
	}

	// Broker check: inline to reuse already-fetched mortgage
	const broker = await getBrokerByAuthId(ctx, viewer.authId);
	if (
		broker &&
		(mortgage.brokerOfRecordId === broker._id ||
			mortgage.assignedBrokerId === broker._id)
	) {
		return true;
	}

	// Lender check: ledger_accounts.lenderId stores authId strings
	const lenderMortgageIds = await getLenderMortgageIds(ctx, viewer.authId);
	if (lenderMortgageIds.has(mortgageId)) {
		return true;
	}

	// Lawyer check: closingTeamAssignments by_user filtered by mortgageId
	const assignments = await ctx.db
		.query("closingTeamAssignments")
		.withIndex("by_user", (q) => q.eq("userId", viewer.authId))
		.collect();
	if (assignments.some((a) => a.mortgageId === mortgageId)) {
		return true;
	}

	return false;
}

// ── T-005: canAccessDeal ────────────────────────────────────────────

export async function canAccessDeal(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	dealId: Id<"deals">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const deal = await ctx.db.get(dealId);
	if (!deal) {
		return false;
	}

	// Broker check via deal's mortgage
	if (await isBrokerForMortgage(ctx, viewer, deal.mortgageId)) {
		return true;
	}

	// Buyer / Seller check: buyerId or sellerId match viewer.authId
	if (deal.buyerId === viewer.authId || deal.sellerId === viewer.authId) {
		return true;
	}

	// Lawyer check: closingTeamAssignment for the deal's mortgage
	const assignments = await ctx.db
		.query("closingTeamAssignments")
		.withIndex("by_user", (q) => q.eq("userId", viewer.authId))
		.collect();
	if (assignments.some((a) => a.mortgageId === deal.mortgageId)) {
		return true;
	}

	// Lawyer check: dealAccess record with active status
	const dealAccessRecords = await ctx.db
		.query("dealAccess")
		.withIndex("by_user_and_deal", (q) =>
			q.eq("userId", viewer.authId).eq("dealId", dealId)
		)
		.collect();
	if (dealAccessRecords.some((r) => r.status === "active")) {
		return true;
	}

	return false;
}

// ── T-006: canAccessLedgerPosition ──────────────────────────────────

export async function canAccessLedgerPosition(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	mortgageId: Id<"mortgages">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	// Lender check: ledger_accounts.lenderId stores authId strings
	const lenderMortgageIds = await getLenderMortgageIds(ctx, viewer.authId);
	if (lenderMortgageIds.has(mortgageId)) {
		return true;
	}

	// Broker check
	if (await isBrokerForMortgage(ctx, viewer, mortgageId)) {
		return true;
	}

	return false;
}

// ── T-007: canAccessAccrual ─────────────────────────────────────────
// investorId is the WorkOS authId string stored in ledger_accounts.lenderId.

export async function canAccessAccrual(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	investorId: string
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	// Lender check: the investorId is an authId — compare directly
	if (investorId === viewer.authId) {
		return true;
	}

	// Broker check: resolve investorId (authId) → user → lender, then check brokerId
	const broker = await getBrokerByAuthId(ctx, viewer.authId);
	if (broker) {
		const targetLender = await getLenderByAuthId(ctx, investorId);
		if (targetLender && targetLender.brokerId === broker._id) {
			return true;
		}
	}

	return false;
}

// ── T-008: canAccessDispersal ───────────────────────────────────────
// investorId is the WorkOS authId string stored in ledger_accounts.lenderId.

export async function canAccessDispersal(
	_ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	investorId: string
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	// Lender check: the investorId is an authId — compare directly
	if (investorId === viewer.authId) {
		return true;
	}

	// No broker access for dispersals
	return false;
}

// ── Payment / cash-ledger resource checks ───────────────────────────

export async function canAccessLenderEntity(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	lenderId: Id<"lenders">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const targetLender = await ctx.db.get(lenderId);
	if (!targetLender) {
		return false;
	}

	const viewerLender = await getLenderByAuthId(ctx, viewer.authId);
	if (viewerLender?._id === lenderId) {
		return true;
	}

	const broker = await getBrokerByAuthId(ctx, viewer.authId);
	return broker !== null && targetLender.brokerId === broker._id;
}

export async function canAccessBorrowerEntity(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	borrowerId: Id<"borrowers">,
	mortgageId?: Id<"mortgages">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const viewerBorrower = await getBorrowerByAuthId(ctx, viewer.authId);
	if (viewerBorrower?._id === borrowerId) {
		return true;
	}

	if (!mortgageId) {
		return false;
	}

	const links = await ctx.db
		.query("mortgageBorrowers")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.collect();

	if (!links.some((link) => link.borrowerId === borrowerId)) {
		return false;
	}

	return canAccessMortgage(ctx, viewer, mortgageId);
}

export async function canAccessObligation(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	obligationId: Id<"obligations">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const obligation = await ctx.db.get(obligationId);
	if (!obligation) {
		return false;
	}

	return canAccessMortgage(ctx, viewer, obligation.mortgageId);
}

export async function canAccessCounterpartyResource(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	ownerType: Doc<"bankAccounts">["ownerType"],
	ownerId: string
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	switch (ownerType) {
		case "borrower":
			return canAccessBorrowerEntity(ctx, viewer, ownerId as Id<"borrowers">);
		case "lender":
		case "investor":
			return canAccessLenderEntity(ctx, viewer, ownerId as Id<"lenders">);
		case "trust":
			return false;
		default:
			return false;
	}
}

export async function canAccessTransferRequest(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	transferId: Id<"transferRequests">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const transfer = await ctx.db.get(transferId);
	if (!transfer) {
		return false;
	}

	if (transfer.dealId && (await canAccessDeal(ctx, viewer, transfer.dealId))) {
		return true;
	}

	if (
		transfer.mortgageId &&
		(await canAccessMortgage(ctx, viewer, transfer.mortgageId))
	) {
		return true;
	}

	if (
		transfer.obligationId &&
		(await canAccessObligation(ctx, viewer, transfer.obligationId))
	) {
		return true;
	}

	if (
		transfer.lenderId &&
		(await canAccessLenderEntity(ctx, viewer, transfer.lenderId))
	) {
		return true;
	}

	if (
		transfer.borrowerId &&
		(await canAccessBorrowerEntity(
			ctx,
			viewer,
			transfer.borrowerId,
			transfer.mortgageId ?? undefined
		))
	) {
		return true;
	}

	return canAccessCounterpartyResource(
		ctx,
		viewer,
		transfer.counterpartyType,
		transfer.counterpartyId
	);
}

export async function canAccessCashLedgerAccount(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	accountId: Id<"cash_ledger_accounts">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const account = await ctx.db.get(accountId);
	if (!account) {
		return false;
	}

	if (
		account.mortgageId &&
		(await canAccessMortgage(ctx, viewer, account.mortgageId))
	) {
		return true;
	}

	if (
		account.obligationId &&
		(await canAccessObligation(ctx, viewer, account.obligationId))
	) {
		return true;
	}

	if (
		account.lenderId &&
		(await canAccessLenderEntity(ctx, viewer, account.lenderId))
	) {
		return true;
	}

	if (
		account.borrowerId &&
		(await canAccessBorrowerEntity(
			ctx,
			viewer,
			account.borrowerId,
			account.mortgageId ?? undefined
		))
	) {
		return true;
	}

	return false;
}

export async function canAccessWorkoutPlan(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	workoutPlanId: Id<"workoutPlans">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const workoutPlan = await ctx.db.get(workoutPlanId);
	if (!workoutPlan) {
		return false;
	}

	return canAccessMortgage(ctx, viewer, workoutPlan.mortgageId);
}

// ── T-009: canAccessDocument ─────────────────────────────────────────
// Resolves a generatedDocument to its parent entity via the polymorphic
// entityType/entityId linkage, then applies the three-tier sensitivity
// model from ENG-144:
//   public    → entity-level access is sufficient
//   private   → entity access + dealAccess record required
//   sensitive → entity access + dealAccess + documents:sensitive_access permission

async function hasActiveDealAccess(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	entityType: DocumentEntityType,
	entityId: string
): Promise<boolean> {
	if (entityType === "deal") {
		const records = await ctx.db
			.query("dealAccess")
			.withIndex("by_user_and_deal", (q) =>
				q.eq("userId", viewer.authId).eq("dealId", entityId as Id<"deals">)
			)
			.collect();
		return records.some((r) => r.status === "active");
	}

	if (entityType === "mortgage") {
		const deals = await ctx.db
			.query("deals")
			.withIndex("by_mortgage", (q) =>
				q.eq("mortgageId", entityId as Id<"mortgages">)
			)
			.collect();
		for (const deal of deals) {
			const records = await ctx.db
				.query("dealAccess")
				.withIndex("by_user_and_deal", (q) =>
					q.eq("userId", viewer.authId).eq("dealId", deal._id)
				)
				.collect();
			if (records.some((r) => r.status === "active")) {
				return true;
			}
		}
		return false;
	}

	// applicationPackage / provisionalApplication are pre-deal entities with no
	// deal linkage. Since there is no deal, there is no dealAccess record to
	// check against — the private/sensitive gate cannot be satisfied. In practice
	// this means pre-deal entities should only carry `public`-tier documents;
	// the entity-level RBAC (underwriting roles) provides sufficient restriction.
	return false;
}

export async function canAccessDocument(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	documentId: Id<"generatedDocuments">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const doc = await ctx.db.get(documentId);
	if (!doc) {
		return false;
	}

	// Step 1: entity-level access check
	let hasEntityAccess = false;
	switch (doc.entityType) {
		case "mortgage":
			hasEntityAccess = await canAccessMortgage(
				ctx,
				viewer,
				doc.entityId as Id<"mortgages">
			);
			break;
		case "deal":
			hasEntityAccess = await canAccessDeal(
				ctx,
				viewer,
				doc.entityId as Id<"deals">
			);
			break;
		case "applicationPackage":
			hasEntityAccess = await canAccessApplicationPackage(
				ctx,
				viewer,
				doc.entityId as Id<"applicationPackages">
			);
			break;
		case "provisionalApplication":
			// No dedicated canAccess* for provisional apps — check broker/borrower ownership
			{
				const app = await ctx.db.get(
					doc.entityId as Id<"provisionalApplications">
				);
				if (app) {
					const broker = await getBrokerByAuthId(ctx, viewer.authId);
					const borrower = await getBorrowerByAuthId(ctx, viewer.authId);
					hasEntityAccess =
						(broker !== null && broker._id === app.brokerId) ||
						(borrower !== null && borrower._id === app.borrowerId);
				}
			}
			break;
		default:
			break;
	}

	if (!hasEntityAccess) {
		return false;
	}

	// Step 2: public tier — entity access is sufficient
	if (doc.sensitivityTier === "public") {
		return true;
	}

	// Step 3: private/sensitive — require dealAccess for deal-scoped entities
	const hasDealAccessResult = await hasActiveDealAccess(
		ctx,
		viewer,
		doc.entityType,
		doc.entityId
	);
	if (!hasDealAccessResult) {
		return false;
	}

	// Step 4: sensitive — additionally require permission
	if (doc.sensitivityTier === "sensitive") {
		return hasPermissionGrant(viewer.permissions, "document:review");
	}

	// private tier satisfied
	return true;
}

// ── T-010: canAccessApplicationPackage ──────────────────────────────

export async function canAccessApplicationPackage(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	packageId: Id<"applicationPackages">
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	const pkg = await ctx.db.get(packageId);
	if (!pkg) {
		return false;
	}

	// sr_underwriter always has access
	if (viewer.roles.has("sr_underwriter")) {
		return true;
	}

	// jr_underwriter / underwriter: see pool (assembled) and own claims (under_review)
	if (viewer.roles.has("jr_underwriter") || viewer.roles.has("underwriter")) {
		if (pkg.status === "assembled") {
			return true;
		}
		if (pkg.status === "under_review") {
			const machineContext = pkg.machineContext as
				| { claimedBy?: string }
				| undefined;
			if (machineContext?.claimedBy === viewer.authId) {
				return true;
			}
		}
	}

	// underwriting:review_decisions permission sees decision_pending_review
	if (
		hasPermissionGrant(viewer.permissions, "underwriting:review_decisions") &&
		pkg.status === "decision_pending_review"
	) {
		return true;
	}

	return false;
}
