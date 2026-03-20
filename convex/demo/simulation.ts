import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { calculateServicingFee } from "../dispersal/servicingFee";
import { adminMutation, authedQuery } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import {
	getAvailableBalance,
	getOrCreatePositionAccount,
	getPostedBalance,
	initializeWorldAccount,
} from "../ledger/accounts";
import { TOTAL_SUPPLY } from "../ledger/constants";
import { postEntry } from "../ledger/postEntry";
import { initializeSequenceCounterInternal } from "../ledger/sequenceCounter";
import type { EventSource } from "../ledger/types";

// ── Constants ──────────────────────────────────────────────────────────────

const SIM_CLOCK_ID = "simulation" as const;
const SIM_SOURCE: EventSource = {
	type: "system",
	channel: "scheduler",
};
const SIM_DEMO_SOURCE: {
	channel: "scheduler";
	actorId: string;
	actorType?: "admin" | "member" | "borrower" | "broker" | "system";
	ip?: string;
	sessionId?: string;
} = {
	channel: "scheduler",
	actorId: "simulation",
};

const SIM_MORTGAGES = [
	{
		mortgageId: "sim-mtg-greenfield",
		label: "123 Greenfield Rd — Residential",
		allocations: [
			{ lenderId: "lender-alice", amount: 5000 },
			{ lenderId: "lender-bob", amount: 3000 },
			{ lenderId: "lender-charlie", amount: 2000 },
		],
	},
	{
		mortgageId: "sim-mtg-riverside",
		label: "456 Riverside Dr — Commercial",
		allocations: [
			{ lenderId: "lender-alice", amount: 4000 },
			{ lenderId: "lender-dave", amount: 6000 },
		],
	},
	{
		mortgageId: "sim-mtg-oakwood",
		label: "789 Oakwood Ave — Mixed Use",
		allocations: [
			{ lenderId: "lender-bob", amount: 5000 },
			{ lenderId: "lender-eve", amount: 5000 },
		],
	},
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function todayISO(): string {
	return new Date().toISOString().split("T")[0];
}

function genIdempotencyKey(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDate(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00Z`);
}

function addDays(dateStr: string, days: number): string {
	const date = parseDate(dateStr);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().split("T")[0];
}

function daysBetween(dateA: string, dateB: string): number {
	const a = parseDate(dateA);
	const b = parseDate(dateB);
	return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// Monthly payment per mortgage based on $100K principal at ~7% annual interest
// = $100,000 * 0.07 / 12 = ~$583/month in interest
// For demo amounts (cents), we use proportional amounts
function calculateMonthlyPayment(principal: number, annualRate = 0.07): number {
	// Monthly payment in cents (principal + interest amortized over 24 months)
	const monthlyRate = annualRate / 12;
	const months = 24;
	// PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
	const factor =
		(monthlyRate * (1 + monthlyRate) ** months) /
		((1 + monthlyRate) ** months - 1);
	return Math.round(principal * factor);
}

// ── Queries ────────────────────────────────────────────────────────────────

export const getSimulationState = authedQuery
	.handler(async (ctx) => {
		// Get simulation clock
		const clock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();

		if (!clock) {
			return {
				running: false,
				clockDate: null,
				startedAt: null,
				totalObligations: 0,
				pendingObligations: 0,
				settledObligations: 0,
				mortgages: [],
			};
		}

		// Count obligations
		const allObligations = await ctx.db.query("obligations").collect();
		const simObligations = allObligations.filter(
			(o) =>
				(o as { mortgageId?: string }).mortgageId?.startsWith("sim-mtg-") ??
				false
		);
		const pending = simObligations.filter((o) => o.status === "pending").length;
		const settled = simObligations.filter((o) => o.status !== "pending").length;

		// Get mortgage state
		const allAccounts = await ctx.db.query("ledger_accounts").collect();
		const mortgages: Array<{
			mortgageId: string;
			label: string;
			positions: Array<{
				lenderId: string;
				balance: number;
				availableBalance: number;
			}>;
			invariant: { valid: boolean; total: number };
		}> = [];

		for (const simMig of SIM_MORTGAGES) {
			const treasury = allAccounts.find(
				(a) => a.type === "TREASURY" && a.mortgageId === simMig.mortgageId
			);
			const treasuryBalance = treasury ? Number(getPostedBalance(treasury)) : 0;

			const positions = allAccounts
				.filter(
					(a) =>
						a.type === "POSITION" &&
						(a as { mortgageId?: string }).mortgageId === simMig.mortgageId
				)
				.map((a) => ({
					lenderId: getAccountLenderId(a) ?? "",
					balance: Number(getPostedBalance(a)),
					availableBalance: Number(getAvailableBalance(a)),
				}));

			const positionSum = positions.reduce((sum, p) => sum + p.balance, 0);
			const total = treasuryBalance + positionSum;

			mortgages.push({
				mortgageId: simMig.mortgageId,
				label: simMig.label,
				positions,
				invariant: { valid: total === Number(TOTAL_SUPPLY), total },
			});
		}

		return {
			running: true,
			clockDate: clock.currentDate,
			startedAt: clock.startedAt,
			totalObligations: simObligations.length,
			pendingObligations: pending,
			settledObligations: settled,
			mortgages,
		};
	})
	.public();

export const getUpcomingDispersals = authedQuery
	.handler(async (ctx) => {
		const clock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();

		const allObligations = await ctx.db.query("obligations").collect();
		const simObligations = allObligations
			.filter(
				(o) =>
					(o as { mortgageId?: string }).mortgageId?.startsWith("sim-mtg-") ??
					false
			)
			.filter((o) => o.status === "pending")
			.sort((a, b) => {
				const aDue = (a as { dueDate?: number }).dueDate ?? 0;
				const bDue = (b as { dueDate?: number }).dueDate ?? 0;
				return aDue - bDue;
			});

		const currentDate = clock?.currentDate ?? todayISO();

		return simObligations.map((obligation) => {
			const mortgageId =
				(obligation as { mortgageId?: string }).mortgageId ?? "";
			const seedDef = SIM_MORTGAGES.find((m) => m.mortgageId === mortgageId);
			const dueDateStr = new Date(
				((obligation as { dueDate?: number }).dueDate ?? 0) * 1000
			)
				.toISOString()
				.split("T")[0];

			return {
				_id: obligation._id,
				mortgageId,
				mortgageLabel: seedDef?.label ?? mortgageId,
				dueDate: dueDateStr,
				type: obligation.type as string,
				paymentNumber:
					(obligation as { paymentNumber?: number }).paymentNumber ?? 0,
				amount: calculateMonthlyPayment(Number(TOTAL_SUPPLY)),
				status: obligation.status,
				daysUntilDue: daysBetween(currentDate, dueDateStr),
			};
		});
	})
	.public();

export const getDispersalHistory = authedQuery
	.handler(async (ctx) => {
		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_mortgage")
			.collect();

		const simEntries = entries.filter(
			(e) =>
				(e as { mortgageId?: string }).mortgageId?.startsWith("sim-mtg-") ??
				false
		);

		// Sort by dispersalDate descending
		simEntries.sort((a, b) => {
			if (a.dispersalDate !== b.dispersalDate) {
				return b.dispersalDate.localeCompare(a.dispersalDate);
			}
			return b.createdAt - a.createdAt;
		});

		const totalByLender: Record<string, number> = {};
		for (const entry of simEntries) {
			const lenderId = (entry as { lenderId?: string }).lenderId ?? "";
			totalByLender[lenderId] = (totalByLender[lenderId] ?? 0) + entry.amount;
		}

		return {
			entries: simEntries.map((e) => ({
				_id: e._id,
				mortgageId: (e as { mortgageId?: string }).mortgageId ?? "",
				lenderId: (e as { lenderId?: string }).lenderId ?? "",
				amount: e.amount,
				dispersalDate: e.dispersalDate,
				status: e.status,
			})),
			totalByLender,
			totalEntries: simEntries.length,
			totalAmount: Object.values(totalByLender).reduce((s, v) => s + v, 0),
		};
	})
	.public();

export const getTrialBalance = authedQuery
	.handler(async (ctx) => {
		const allAccounts = await ctx.db.query("ledger_accounts").collect();
		const simAccounts = allAccounts.filter(
			(a) =>
				(a as { mortgageId?: string }).mortgageId?.startsWith("sim-mtg-") ??
				a.type === "WORLD"
		);

		const accounts = simAccounts.map((a) => ({
			accountId: a._id,
			type: a.type,
			mortgageId: (a as { mortgageId?: string }).mortgageId ?? "",
			lenderId: getAccountLenderId(a) ?? "",
			postedBalance: Number(getPostedBalance(a)),
			availableBalance: Number(getAvailableBalance(a)),
			pendingCredits: Number(a.pendingCredits ?? 0n),
			pendingDebits: Number(a.pendingDebits ?? 0n),
		}));

		const totalPosted = accounts.reduce((sum, a) => sum + a.postedBalance, 0);
		const totalPending = accounts.reduce(
			(sum, a) => sum + a.pendingCredits + a.pendingDebits,
			0
		);

		return { accounts, totalPosted, totalPending };
	})
	.public();

// ── Mutations ──────────────────────────────────────────────────────────────

export const seedSimulation = adminMutation
	.handler(async (ctx) => {
		// Check if already seeded
		const existingClock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();
		if (existingClock) {
			return { seeded: false, message: "Simulation already initialized." };
		}

		// Bootstrap sequence counter + WORLD
		await initializeSequenceCounterInternal(ctx);
		const worldAccount = await initializeWorldAccount(ctx);

		// Create a single simulation borrower for all simulation mortgages
		// We need a real borrowerId for obligations
		const borrowerUserId = await ctx.db.insert("users", {
			authId: "sim-borrower-auth",
			email: "simulation-borrower@fairlend.demo",
			firstName: "Simulation",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			userId: borrowerUserId,
			status: "active",
			createdAt: Date.now(),
		});

		// Create a simulation broker for all mortgages
		const brokerUserId = await ctx.db.insert("users", {
			authId: "sim-broker-auth",
			email: "simulation-broker@fairlend.demo",
			firstName: "Simulation",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			userId: brokerUserId,
			status: "active",
			createdAt: Date.now(),
		});

		// Track mortgage ID mappings (string prefix -> actual Convex ID)
		const mortgageIdMap: Record<string, Id<"mortgages">> = {};

		// Seed each mortgage
		for (const mortgage of SIM_MORTGAGES) {
			// Create a property for this mortgage
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: mortgage.label,
				city: "Simulation City",
				province: "ON",
				postalCode: "A1A1A1",
				latitude: 0,
				longitude: 0,
				propertyType: "residential",
				createdAt: Date.now(),
			});

			// Create the mortgage record (required for obligations)
			const simMortgageId = await ctx.db.insert("mortgages", {
				status: "active",
				propertyId,
				principal: Number(TOTAL_SUPPLY),
				interestRate: 0.07,
				rateType: "fixed",
				termMonths: 24,
				amortizationMonths: 240,
				paymentAmount: calculateMonthlyPayment(Number(TOTAL_SUPPLY)),
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				annualServicingRate: 0.01,
				interestAdjustmentDate: "2024-01-01",
				termStartDate: "2024-01-01",
				maturityDate: "2026-01-01",
				firstPaymentDate: "2024-02-01",
				brokerOfRecordId: brokerId,
				fundedAt: Date.now(),
				createdAt: Date.now(),
			});
			mortgageIdMap[mortgage.mortgageId] = simMortgageId;

			// Create TREASURY (uses string mortgageId for ledger filtering)
			const treasuryId = await ctx.db.insert("ledger_accounts", {
				type: "TREASURY",
				mortgageId: mortgage.mortgageId,
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: Date.now(),
			});

			// MINT: WORLD → TREASURY
			await postEntry(ctx, {
				entryType: "MORTGAGE_MINTED",
				mortgageId: mortgage.mortgageId,
				debitAccountId: treasuryId,
				creditAccountId: worldAccount._id,
				amount: Number(TOTAL_SUPPLY),
				effectiveDate: "2024-01-01",
				idempotencyKey: `sim-mint-${mortgage.mortgageId}`,
				source: SIM_SOURCE,
				metadata: { demo: true, source: "simulation" },
			});

			// ISSUE: TREASURY → POSITION per lender
			for (const allocation of mortgage.allocations) {
				const position = await getOrCreatePositionAccount(
					ctx,
					mortgage.mortgageId,
					allocation.lenderId
				);

				await postEntry(ctx, {
					entryType: "SHARES_ISSUED",
					mortgageId: mortgage.mortgageId,
					debitAccountId: position._id,
					creditAccountId: treasuryId,
					amount: allocation.amount,
					effectiveDate: "2024-01-01",
					idempotencyKey: `sim-issue-${mortgage.mortgageId}-${allocation.lenderId}`,
					source: SIM_SOURCE,
					metadata: { demo: true, source: "simulation" },
				});
			}
		}

		// Generate obligations: 24 monthly interest payments per mortgage
		for (const mortgage of SIM_MORTGAGES) {
			const monthlyPayment = calculateMonthlyPayment(Number(TOTAL_SUPPLY));
			const startDate = new Date("2024-01-01T00:00:00Z");
			const realMortgageId = mortgageIdMap[mortgage.mortgageId];

			for (let month = 1; month <= 24; month++) {
				const dueDate = new Date(startDate);
				dueDate.setUTCMonth(dueDate.getUTCMonth() + month);
				dueDate.setUTCDate(1);

				const isLastMonth = month === 24;
				const obligationType = isLastMonth
					? "principal_repayment"
					: "regular_interest";
				const amount = isLastMonth ? Number(TOTAL_SUPPLY) : monthlyPayment;

				await ctx.db.insert("obligations", {
					status: "pending",
					machineContext: null,
					paymentNumber: month,
					type: obligationType,
					mortgageId: realMortgageId,
					borrowerId,
					amount,
					amountSettled: 0,
					dueDate: Math.floor(dueDate.getTime() / 1000),
					gracePeriodEnd:
						Math.floor(dueDate.getTime() / 1000) + 5 * 24 * 60 * 60,
					sourceObligationId: undefined,
					settledAt: undefined,
					createdAt: Date.now(),
				});
			}
		}

		// Initialize simulation clock
		await ctx.db.insert("simulation_clock", {
			clockId: SIM_CLOCK_ID,
			currentDate: "2024-01-01",
			startedAt: Date.now(),
		});

		return {
			seeded: true,
			message: `Simulation initialized with ${SIM_MORTGAGES.length} mortgages and 72 obligations (24 months × 3).`,
		};
	})
	.public();

export const advanceTime = adminMutation
	.input({ days: v.number() })
	.handler(async (ctx, args) => {
		const clock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();

		if (!clock) {
			throw new ConvexError(
				"Simulation not initialized. Call seedSimulation first."
			);
		}

		const newDate = addDays(clock.currentDate, args.days);

		// Find obligations now due
		const allObligations = await ctx.db.query("obligations").collect();
		const simNewlyDue = allObligations.filter((o) => {
			const mortgageId = (o as { mortgageId?: string }).mortgageId ?? "";
			if (!mortgageId.startsWith("sim-mtg-")) {
				return false;
			}
			if (o.status !== "pending") {
				return false;
			}
			const dueDateNum = (o as { dueDate?: number }).dueDate;
			if (dueDateNum === undefined) {
				return false;
			}
			const dueDate = new Date(dueDateNum * 1000).toISOString().split("T")[0];
			return dueDate <= newDate;
		});

		// Update clock
		await ctx.db.patch(clock._id, { currentDate: newDate });

		return {
			newDate,
			obligationsTriggered: simNewlyDue.length,
			newlyDueObligations: simNewlyDue.map((o) => ({
				_id: o._id,
				mortgageId: (o as { mortgageId?: string }).mortgageId ?? "",
				type: o.type as string,
				paymentNumber: (o as { paymentNumber?: number }).paymentNumber ?? 0,
			})),
		};
	})
	.public();

export const triggerDispersal = adminMutation
	.input({
		obligationId: v.id("obligations"),
		settledAmount: v.number(),
	})
	.handler(async (ctx, args) => {
		const clock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();
		if (!clock) {
			throw new ConvexError("Simulation not initialized.");
		}

		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation) {
			throw new ConvexError(`Obligation not found: ${args.obligationId}`);
		}

		// mortgageId is now a typed Id<"mortgages"> (real records created by seedSimulation)
		const mortgageId = obligation.mortgageId;
		if (!mortgageId.startsWith("sim-mtg-")) {
			throw new ConvexError("Not a simulation obligation.");
		}

		if (obligation.status !== "pending") {
			throw new ConvexError(
				`Obligation ${args.obligationId} is already settled.`
			);
		}

		// Validate amount covers servicing fee
		const principal = Number(TOTAL_SUPPLY);
		const servicingFee = calculateServicingFee(0.01, principal);
		if (args.settledAmount < servicingFee) {
			throw new ConvexError(
				`settledAmount ${args.settledAmount} does not cover servicing fee ${servicingFee}`
			);
		}

		// Call createDispersalEntries via ctx.runMutation (it's an internalMutation)
		const idempotencyKey = genIdempotencyKey("sim-dispersal");
		interface DispersalResult {
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
		const result: DispersalResult = await ctx.runMutation(
			internal.dispersal.createDispersalEntries.createDispersalEntries,
			{
				obligationId: args.obligationId,
				mortgageId,
				settledAmount: args.settledAmount,
				settledDate: clock.currentDate,
				idempotencyKey,
				source: SIM_DEMO_SOURCE,
			}
		);

		// Mark obligation as settled
		await ctx.db.patch(args.obligationId, {
			status: "settled",
			amountSettled: args.settledAmount,
			settledAt: Date.now(),
		});

		return {
			created: result.created,
			dispersalEntryIds: result.entries.map(
				(e: { id: Id<"dispersalEntries"> }) => e.id
			),
			servicingFeeEntryId: result.servicingFeeEntryId,
		};
	})
	.public();

export const cleanupSimulation = adminMutation
	.handler(async (ctx) => {
		// Helper to delete docs whose mortgageId starts with a prefix
		const deleteByMortgagePrefix = async (
			table: "obligations" | "dispersalEntries" | "servicingFeeEntries",
			counter: { count: number }
		): Promise<void> => {
			const docs = await ctx.db.query(table).collect();
			for (const doc of docs) {
				const mortgageId = (doc as { mortgageId?: string }).mortgageId ?? "";
				if (mortgageId.startsWith("sim-mtg-")) {
					await ctx.db.delete(doc._id);
					counter.count++;
				}
			}
		};

		// Collect sim account IDs for later deletion
		const allAccounts = await ctx.db.query("ledger_accounts").collect();
		const simAccountIds: Id<"ledger_accounts">[] = [];
		for (const account of allAccounts) {
			const mortgageId = (account as { mortgageId?: string }).mortgageId ?? "";
			if (mortgageId.startsWith("sim-mtg-")) {
				simAccountIds.push(account._id);
			}
		}

		const oblCount = { count: 0 };
		const dispCount = { count: 0 };
		const feeCount = { count: 0 };

		// Delete obligations and track counts
		await deleteByMortgagePrefix("obligations", oblCount);
		const deletedObligations = oblCount.count;

		// Delete dispersal entries and track counts
		await deleteByMortgagePrefix("dispersalEntries", dispCount);
		const deletedDispersals = dispCount.count;

		// Delete servicing fee entries and track counts
		await deleteByMortgagePrefix("servicingFeeEntries", feeCount);
		const deletedFees = feeCount.count;

		// Delete journal entries for sim mortgages
		let deletedEntries = 0;
		for (const mortgageId of SIM_MORTGAGES.map((m) => m.mortgageId)) {
			const entries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
			for (const entry of entries) {
				await ctx.db.delete(entry._id);
				deletedEntries++;
			}
		}

		// Delete accounts
		for (const accountId of simAccountIds) {
			await ctx.db.delete(accountId);
		}

		// Delete simulation clock
		const clock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();
		if (clock) {
			await ctx.db.delete(clock._id);
		}

		return {
			deletedObligations,
			deletedDispersals,
			deletedFees,
			deletedEntries,
			deletedAccounts: simAccountIds.length,
		};
	})
	.public();
