import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { calculateProRataShares } from "../accrual/interestMath";
import { sourceValidator } from "../engine/validators";
import { resolveServicingFeeConfig } from "../fees/resolver";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getPostedBalance } from "../ledger/accounts";
import {
	postSettlementAllocation,
	type ServicingFeeMetadata,
} from "../payments/cashLedger/integrations";
import { calculatePayoutEligibleDate } from "./holdPeriod";
import { requireLenderIdForAuthId } from "./lenderIdentity";
import { calculateServicingFee } from "./servicingFee";

interface ActivePosition {
	lenderAccountId: Id<"ledger_accounts">;
	lenderAuthId: string;
	units: number;
}

interface DispersalCreationResult {
	created: boolean;
	entries: Array<{
		id: Id<"dispersalEntries">;
		lenderId: Id<"lenders">;
		lenderAccountId: Id<"ledger_accounts">;
		amount: number;
		rawAmount: number;
		units: number;
	}>;
	servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
}

interface LoadedDispersalDocuments {
	mortgage: Doc<"mortgages">;
	obligation: Doc<"obligations">;
}

interface ExistingDispersalState {
	existingEntries: Doc<"dispersalEntries">[];
	existingFee: Doc<"servicingFeeEntries"> | null;
}

interface ServicingSplit {
	distributableAmount: number;
	feeCashApplied: number;
	feeDue: number;
	feeReceivable: number;
	servicingConfig: Awaited<ReturnType<typeof resolveServicingFeeConfig>> | null;
}

async function resolveLenderIdFromAuthId(
	ctx: MutationCtx,
	lenderAuthId: string
): Promise<Id<"lenders">> {
	return requireLenderIdForAuthId(
		ctx.db,
		lenderAuthId,
		"createDispersalEntries"
	);
}

async function resolvePaymentMethodFromCollection(
	ctx: MutationCtx,
	obligationId: Id<"obligations">
): Promise<string | undefined> {
	// Walk: collectionPlanEntries (by_status, obligationIds contains this obligation)
	//     → collectionAttempts (by_plan_entry, confirmed + method, most recent)
	//     → method
	const planEntryBatches = await Promise.all(
		(["planned", "executing", "completed"] as const).map((status) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect()
		)
	);
	const planEntries = planEntryBatches
		.flat()
		.filter((e) => e.obligationIds.includes(obligationId));

	let bestConfirmed: { method: string; creationTime: number } | undefined;
	for (const entry of planEntries) {
		const attempts = await ctx.db
			.query("collectionAttempts")
			.withIndex("by_plan_entry", (q) => q.eq("planEntryId", entry._id))
			.collect();
		for (const a of attempts) {
			if (
				a.status === "confirmed" &&
				a.method &&
				(!bestConfirmed || a._creationTime > bestConfirmed.creationTime)
			) {
				bestConfirmed = { method: a.method, creationTime: a._creationTime };
			}
		}
	}
	if (bestConfirmed) {
		return bestConfirmed.method;
	}

	let bestPlanMethod: { method: string; creationTime: number } | undefined;
	for (const entry of planEntries) {
		if (
			entry.method &&
			(!bestPlanMethod || entry._creationTime > bestPlanMethod.creationTime)
		) {
			bestPlanMethod = {
				method: entry.method,
				creationTime: entry._creationTime,
			};
		}
	}
	return bestPlanMethod?.method;
}

function validateIntegerCents(value: number, label: string) {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new ConvexError(
			`createDispersalEntries: ${label} must be a non-negative integer cent value, got ${value}`
		);
	}
}

function assertValidSettledDate(settledDate: string) {
	const parsedSettledDate = Date.parse(`${settledDate}T00:00:00Z`);
	if (Number.isNaN(parsedSettledDate)) {
		throw new ConvexError(
			`createDispersalEntries: settledDate must be YYYY-MM-DD, got ${settledDate}`
		);
	}
}

async function loadDispersalDocuments(
	ctx: MutationCtx,
	args: {
		mortgageId: Id<"mortgages">;
		obligationId: Id<"obligations">;
	}
): Promise<LoadedDispersalDocuments> {
	const mortgage = (await ctx.db.get(
		args.mortgageId
	)) as Doc<"mortgages"> | null;
	if (!mortgage) {
		throw new ConvexError(
			`createDispersalEntries: mortgage not found: ${args.mortgageId}`
		);
	}

	const obligation = await ctx.db.get(args.obligationId);
	if (!obligation) {
		throw new ConvexError(
			`createDispersalEntries: obligation not found: ${args.obligationId}`
		);
	}

	return { mortgage, obligation };
}

async function loadExistingDispersalState(
	ctx: MutationCtx,
	obligationId: Id<"obligations">
): Promise<ExistingDispersalState> {
	const [existingEntries, existingFee] = await Promise.all([
		ctx.db
			.query("dispersalEntries")
			.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
			.collect(),
		ctx.db
			.query("servicingFeeEntries")
			.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
			.first(),
	]);

	return { existingEntries, existingFee };
}

async function calculateServicingSplit(
	ctx: MutationCtx,
	args: {
		mortgage: Doc<"mortgages">;
		obligation: Doc<"obligations">;
		settledAmount: number;
		settledDate: string;
	}
): Promise<ServicingSplit> {
	const servicingConfig =
		args.obligation.type === "regular_interest"
			? await resolveServicingFeeConfig(ctx.db, args.mortgage, args.settledDate)
			: null;
	// ENG-217: Fee basis is current outstanding principal (mortgage.principal).
	// This means fees decrease as principal is repaid — standard amortizing mortgage behavior.
	// The principalBalance used is stored in servicingFeeEntries for audit verification.
	const feeDue =
		servicingConfig === null
			? 0
			: calculateServicingFee(
					servicingConfig.annualRate,
					args.mortgage.principal,
					args.mortgage.paymentFrequency
				);
	const feeCashApplied = Math.min(args.settledAmount, feeDue);
	return {
		servicingConfig,
		feeDue,
		feeCashApplied,
		feeReceivable: feeDue - feeCashApplied,
		distributableAmount: args.settledAmount - feeCashApplied,
	};
}

async function loadActivePositions(
	ctx: MutationCtx,
	ledgerMortgageId: string
): Promise<ActivePosition[]> {
	const accounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "POSITION").eq("mortgageId", ledgerMortgageId)
		)
		.collect();

	const positions: ActivePosition[] = [];
	for (const account of accounts) {
		const balance = getPostedBalance(account);
		if (balance <= 0n) {
			continue;
		}

		const lenderAuthId = getAccountLenderId(account);
		if (!lenderAuthId) {
			throw new ConvexError(
				`createDispersalEntries: POSITION account ${account._id} is missing lenderId`
			);
		}

		const units = Number(balance);
		if (!Number.isSafeInteger(units)) {
			throw new ConvexError(
				`createDispersalEntries: POSITION account ${account._id} has a balance that does not fit in a safe integer`
			);
		}

		positions.push({
			lenderAccountId: account._id,
			lenderAuthId,
			units,
		});
	}

	return positions;
}

async function applyDealReroutes(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	settledDate: string,
	positions: ActivePosition[]
): Promise<number> {
	let appliedCount = 0;
	const reroutes = await ctx.db
		.query("dealReroutes")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.collect();

	// Sort reroutes by effectiveAfterDate to ensure deterministic processing order
	const sortedReroutes = reroutes.slice().sort((a, b) => {
		const dateCompare = a.effectiveAfterDate.localeCompare(
			b.effectiveAfterDate
		);
		if (dateCompare !== 0) {
			return dateCompare;
		}
		return a._creationTime - b._creationTime;
	});

	for (const reroute of sortedReroutes) {
		if (reroute.effectiveAfterDate > settledDate) {
			continue;
		}

		const fromPosition = positions.find(
			(position) => position.lenderAuthId === reroute.fromOwnerId
		);
		const toPosition = positions.find(
			(position) => position.lenderAuthId === reroute.toOwnerId
		);

		if (!(fromPosition && toPosition)) {
			continue;
		}

		if (!Number.isSafeInteger(reroute.fractionalShare)) {
			throw new ConvexError(
				`createDispersalEntries: deal reroute ${reroute._id} has a non-integer fractionalShare`
			);
		}

		if (reroute.fractionalShare <= 0) {
			throw new ConvexError(
				`createDispersalEntries: reroute ${reroute._id} has invalid fractionalShare ${reroute.fractionalShare} (must be > 0)`
			);
		}

		fromPosition.units -= reroute.fractionalShare;
		toPosition.units += reroute.fractionalShare;
		appliedCount++;

		if (fromPosition.units < 0) {
			throw new ConvexError(
				`createDispersalEntries: reroute ${reroute._id} would make lender ${reroute.fromOwnerId} negative`
			);
		}
	}

	return appliedCount;
}

async function normalizePositions(
	ctx: MutationCtx,
	activePositions: ActivePosition[]
): Promise<
	Array<{
		lenderAccountId: Id<"ledger_accounts">;
		lenderId: Id<"lenders">;
		units: number;
	}>
> {
	const lenderIdCache = new Map<string, Id<"lenders">>();
	const normalizedPositions: Array<{
		lenderAccountId: Id<"ledger_accounts">;
		lenderId: Id<"lenders">;
		units: number;
	}> = [];

	for (const position of activePositions) {
		if (position.units <= 0) {
			continue;
		}

		const cachedLenderId = lenderIdCache.get(position.lenderAuthId);
		// Auth boundary: ledger POSITION accounts store WorkOS auth IDs.
		// Normalize to domain `Id<"lenders">` once here before persistence.
		const lenderId =
			cachedLenderId ??
			(await resolveLenderIdFromAuthId(ctx, position.lenderAuthId));
		lenderIdCache.set(position.lenderAuthId, lenderId);

		normalizedPositions.push({
			lenderAccountId: position.lenderAccountId,
			lenderId,
			units: position.units,
		});
	}

	return normalizedPositions;
}

function buildReplayResult(
	existingEntries: Doc<"dispersalEntries">[],
	existingFee: Doc<"servicingFeeEntries"> | null
): DispersalCreationResult {
	return {
		created: false,
		entries: existingEntries.map((entry) => ({
			id: entry._id,
			lenderId: entry.lenderId,
			lenderAccountId: entry.lenderAccountId,
			amount: entry.amount,
			rawAmount: entry.calculationDetails.rawAmount,
			units: entry.calculationDetails.ownershipUnits,
		})),
		servicingFeeEntryId: existingFee?._id ?? null,
	};
}

export const createDispersalEntries = internalMutation({
	args: {
		obligationId: v.id("obligations"),
		mortgageId: v.id("mortgages"),
		settledAmount: v.number(),
		settledDate: v.string(),
		idempotencyKey: v.string(),
		source: sourceValidator,
		paymentMethod: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<DispersalCreationResult> => {
		validateIntegerCents(args.settledAmount, "settledAmount");
		assertValidSettledDate(args.settledDate);

		const { mortgage, obligation } = await loadDispersalDocuments(ctx, args);
		const { existingEntries, existingFee } = await loadExistingDispersalState(
			ctx,
			args.obligationId
		);
		const {
			servicingConfig,
			feeDue,
			feeCashApplied,
			feeReceivable,
			distributableAmount,
		} = await calculateServicingSplit(ctx, {
			mortgage,
			obligation,
			settledAmount: args.settledAmount,
			settledDate: args.settledDate,
		});

		const ledgerMortgageId = mortgage.simulationId ?? String(args.mortgageId);
		const activePositions = await loadActivePositions(ctx, ledgerMortgageId);
		if (activePositions.length === 0) {
			throw new ConvexError(
				`createDispersalEntries: no active positions for mortgage ${args.mortgageId}`
			);
		}

		const reroutesAppliedCount = await applyDealReroutes(
			ctx,
			args.mortgageId,
			args.settledDate,
			activePositions
		);

		const normalizedPositions = await normalizePositions(ctx, activePositions);

		if (normalizedPositions.length === 0) {
			throw new ConvexError(
				`createDispersalEntries: no positive positions remain after reroutes for mortgage ${args.mortgageId}`
			);
		}

		const totalUnits = normalizedPositions.reduce(
			(sum, position) => sum + position.units,
			0
		);

		const shares = calculateProRataShares(
			normalizedPositions,
			distributableAmount
		).filter((share) => share.amount > 0);

		if (existingFee || existingEntries.length > 0) {
			const expectedEntryCount = shares.length;
			const isConsistentReplay =
				(existingFee !== null || feeDue === 0) &&
				existingEntries.length === expectedEntryCount;

			if (!isConsistentReplay) {
				throw new ConvexError(
					`createDispersalEntries: inconsistent replay state for obligation ${args.obligationId}`
				);
			}

			return buildReplayResult(existingEntries, existingFee);
		}

		// Resolve payment method for hold period calculation
		const resolvedMethod =
			args.paymentMethod ??
			(await resolvePaymentMethodFromCollection(ctx, args.obligationId)) ??
			"manual";
		const payoutEligibleAfter = calculatePayoutEligibleDate(
			args.settledDate,
			resolvedMethod
		);

		const entries: DispersalCreationResult["entries"] = [];
		const createdAt = Date.now();
		for (const share of shares) {
			const entryId = await ctx.db.insert("dispersalEntries", {
				mortgageId: args.mortgageId,
				lenderId: share.lenderId,
				lenderAccountId: share.lenderAccountId,
				amount: share.amount,
				dispersalDate: args.settledDate,
				obligationId: args.obligationId,
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: `${args.idempotencyKey}:${share.lenderId}`,
				paymentMethod: resolvedMethod,
				payoutEligibleAfter,
				calculationDetails: {
					settledAmount: args.settledAmount,
					servicingFee: feeCashApplied,
					distributableAmount,
					feeDue,
					feeCashApplied,
					feeReceivable,
					ownershipUnits: share.units,
					totalUnits,
					ownershipFraction: totalUnits === 0 ? 0 : share.units / totalUnits,
					policyVersion: servicingConfig?.policyVersion,
					rawAmount: share.rawAmount,
					roundedAmount: share.amount,
					sourceObligationType: obligation.type,
					mortgageFeeId: servicingConfig?.mortgageFeeId,
					feeCode: servicingConfig?.code,
					ownershipSnapshotDate: args.settledDate,
					reroutesAppliedCount,
				},
				createdAt,
			});
			entries.push({
				id: entryId,
				lenderId: share.lenderId,
				lenderAccountId: share.lenderAccountId,
				amount: share.amount,
				rawAmount: share.rawAmount,
				units: share.units,
			});
		}

		const newServicingFeeEntryId =
			feeDue > 0
				? await ctx.db.insert("servicingFeeEntries", {
						mortgageId: args.mortgageId,
						obligationId: args.obligationId,
						amount: feeCashApplied,
						annualRate: servicingConfig?.annualRate ?? 0,
						principalBalance: mortgage.principal,
						date: args.settledDate,
						createdAt,
						feeDue,
						feeCashApplied,
						feeReceivable,
						policyVersion: servicingConfig?.policyVersion,
						sourceObligationType: obligation.type,
						mortgageFeeId: servicingConfig?.mortgageFeeId,
						feeCode: servicingConfig?.code,
					})
				: null;

		let feeMetadata: ServicingFeeMetadata | undefined;
		if (feeCashApplied > 0) {
			if (!servicingConfig) {
				throw new ConvexError(
					`createDispersalEntries: feeCashApplied=${feeCashApplied} but servicingConfig is null for obligation ${args.obligationId}. Cannot post fee without audit metadata.`
				);
			}
			feeMetadata = {
				annualRate: servicingConfig.annualRate,
				principalBalance: mortgage.principal,
				paymentFrequency: mortgage.paymentFrequency,
				policyVersion: servicingConfig.policyVersion,
				feeCode: servicingConfig.code,
				mortgageFeeId: servicingConfig.mortgageFeeId
					? String(servicingConfig.mortgageFeeId)
					: undefined,
				feeDue,
				feeCashApplied,
				feeReceivable,
			};
		}

		await postSettlementAllocation(ctx, {
			obligationId: args.obligationId,
			mortgageId: args.mortgageId,
			settledDate: args.settledDate,
			settledAmount: args.settledAmount,
			servicingFee: feeCashApplied,
			entries: entries.map((entry) => ({
				dispersalEntryId: entry.id,
				lenderId: entry.lenderId,
				amount: entry.amount,
			})),
			source: args.source,
			...(feeMetadata ? { feeMetadata } : {}),
		});

		return {
			created: true,
			entries,
			servicingFeeEntryId: newServicingFeeEntryId,
		};
	},
});
