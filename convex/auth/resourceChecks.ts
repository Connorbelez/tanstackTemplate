import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Viewer } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { computeBalance } from "../ledger/internal";

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
// `lenderAuthId` is the WorkOS authId string stored in ledger_accounts.lenderId.

export async function getLenderMortgageIds(
	ctx: { db: QueryCtx["db"] },
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
		const balance = computeBalance(account);
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
	entityType: string,
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

	// applicationPackage / provisionalApplication are pre-deal entities —
	// entity-level access (underwriting RBAC) is sufficient for all tiers.
	return true;
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
		return viewer.permissions.has("documents:sensitive_access");
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
		viewer.permissions.has("underwriting:review_decisions") &&
		pkg.status === "decision_pending_review"
	) {
		return true;
	}

	return false;
}
