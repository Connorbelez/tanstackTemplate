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

export async function getLenderMortgageIds(
	ctx: { db: QueryCtx["db"] },
	lenderId: string
): Promise<Set<Id<"mortgages">>> {
	const accounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
		.collect();

	const mortgageIds = new Set<Id<"mortgages">>();
	for (const account of accounts) {
		if (account.type !== "POSITION") {
			continue;
		}
		const balance = computeBalance(account);
		if (balance <= 0n) {
			continue;
		}
		const effectiveLenderId = getAccountLenderId(account);
		if (effectiveLenderId !== lenderId) {
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

	// Broker check
	if (await isBrokerForMortgage(ctx, viewer, mortgageId)) {
		return true;
	}

	// Lender check: viewer → user → lender → getLenderMortgageIds
	const lender = await getLenderByAuthId(ctx, viewer.authId);
	if (lender) {
		const mortgageIds = await getLenderMortgageIds(ctx, lender._id);
		if (mortgageIds.has(mortgageId)) {
			return true;
		}
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

	// Lender check: buyerId or sellerId match viewer.authId
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

	// Lender check
	const lender = await getLenderByAuthId(ctx, viewer.authId);
	if (lender) {
		const mortgageIds = await getLenderMortgageIds(ctx, lender._id);
		if (mortgageIds.has(mortgageId)) {
			return true;
		}
	}

	// Broker check
	if (await isBrokerForMortgage(ctx, viewer, mortgageId)) {
		return true;
	}

	return false;
}

// ── T-007: canAccessAccrual ─────────────────────────────────────────
// investorId here refers to a lender's _id (legacy naming in the ledger).

export async function canAccessAccrual(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	investorId: string
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	// Lender check: the investorId matches the viewer's lender profile
	const lender = await getLenderByAuthId(ctx, viewer.authId);
	if (lender && lender._id === investorId) {
		return true;
	}

	// Broker check: the lender referenced by investorId belongs to viewer's brokerage
	const broker = await getBrokerByAuthId(ctx, viewer.authId);
	if (broker) {
		// Find the lender record that matches investorId
		const targetLender = await ctx.db.get(investorId as Id<"lenders">);
		if (targetLender && targetLender.brokerId === broker._id) {
			return true;
		}
	}

	return false;
}

// ── T-008: canAccessDispersal ───────────────────────────────────────
// investorId here refers to a lender's _id (legacy naming in the ledger).

export async function canAccessDispersal(
	ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	investorId: string
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	// Lender check: the investorId matches the viewer's lender profile
	const lender = await getLenderByAuthId(ctx, viewer.authId);
	if (lender && lender._id === investorId) {
		return true;
	}

	// No broker access for dispersals
	return false;
}

// ── T-009: canAccessDocument (STUB) ─────────────────────────────────
// TODO (ENG-144): The `generatedDocuments` table is not yet defined.
// Once ENG-144 is implemented, this function should resolve the document
// to its parent entity (mortgage, deal, etc.) and delegate to the
// appropriate canAccess* function. For now, only admins have access.

export async function canAccessDocument(
	_ctx: { db: QueryCtx["db"] },
	viewer: Viewer,
	_documentId: string
): Promise<boolean> {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	// Non-admin access blocked until generatedDocuments table exists (ENG-144)
	return false;
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
