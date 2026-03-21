import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { CommandSource, TransitionResult } from "../engine/types";
import { adminMutation, authedQuery } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getAvailableBalance, getPostedBalance } from "../ledger/accounts";
import { TOTAL_SUPPLY } from "../ledger/constants";
import {
	DEMO_LEDGER_MORTGAGES,
	ensureDemoLedgerSeeded,
	getDemoMortgageLabel,
} from "./demoLedgerSeed";

const SIM_CLOCK_ID = "simulation" as const;
const SIM_BORROWER_AUTH_ID = "simulation-borrower@fairlend.demo";
const SIM_BROKER_AUTH_ID = "simulation-broker@fairlend.demo";
const SIM_LENDER_FIXTURES = [
	{
		authId: "lender-alice",
		email: "lender-alice@fairlend.demo",
		firstName: "Alice",
		lastName: "Lender",
	},
	{
		authId: "lender-bob",
		email: "lender-bob@fairlend.demo",
		firstName: "Bob",
		lastName: "Lender",
	},
	{
		authId: "lender-charlie",
		email: "lender-charlie@fairlend.demo",
		firstName: "Charlie",
		lastName: "Lender",
	},
	{
		authId: "lender-dave",
		email: "lender-dave@fairlend.demo",
		firstName: "Dave",
		lastName: "Lender",
	},
	{
		authId: "lender-eve",
		email: "lender-eve@fairlend.demo",
		firstName: "Eve",
		lastName: "Lender",
	},
] as const;
const UNRESOLVED_OBLIGATION_STATUSES = new Set([
	"upcoming",
	"due",
	"overdue",
	"partially_settled",
]);
const SETTLEABLE_OBLIGATION_STATUSES = new Set([
	"due",
	"overdue",
	"partially_settled",
]);
const DEMO_LEDGER_MORTGAGE_IDS: ReadonlySet<string> = new Set(
	DEMO_LEDGER_MORTGAGES.map((mortgage) => mortgage.ledgerMortgageId)
);
const SIM_COMMAND_SOURCE: CommandSource = {
	channel: "simulation",
	actorId: "simulation",
	actorType: "system",
};

interface SimulationMortgageRecord {
	label: string;
	ledgerMortgageId: string;
	mortgageId: Id<"mortgages">;
	propertyId: Id<"properties">;
}

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

function calculateMonthlyPayment(principal: number, annualRate = 0.07): number {
	const monthlyRate = annualRate / 12;
	const months = 24;
	const factor =
		(monthlyRate * (1 + monthlyRate) ** months) /
		((1 + monthlyRate) ** months - 1);
	return Math.round(principal * factor);
}

function isResolvedObligationStatus(status: string): boolean {
	return status === "settled" || status === "waived";
}

async function getSimulationMortgageRecords(
	ctx: QueryCtx
): Promise<SimulationMortgageRecord[]> {
	const records = await Promise.all(
		DEMO_LEDGER_MORTGAGES.map(async (mortgage) => {
			const record = await ctx.db
				.query("mortgages")
				.withIndex("by_simulation", (q) =>
					q.eq("simulationId", mortgage.ledgerMortgageId)
				)
				.first();
			if (!record) {
				return null;
			}
			return {
				ledgerMortgageId: mortgage.ledgerMortgageId,
				label: mortgage.label,
				mortgageId: record._id,
				propertyId: record.propertyId,
			};
		})
	);

	const simulationRecords: SimulationMortgageRecord[] = [];
	for (const record of records) {
		if (record) {
			simulationRecords.push(record);
		}
	}
	return simulationRecords;
}

async function getLegacySimulationMortgageRecords(
	ctx: QueryCtx
): Promise<
	Array<{ mortgageId: Id<"mortgages">; propertyId: Id<"properties"> }>
> {
	const records = await ctx.db
		.query("mortgages")
		.withIndex("by_simulation", (q) => q.eq("simulationId", SIM_CLOCK_ID))
		.collect();
	return records.map((record) => ({
		mortgageId: record._id,
		propertyId: record.propertyId,
	}));
}

async function getSimulationMortgageIdSet(
	ctx: QueryCtx
): Promise<Set<Id<"mortgages">>> {
	const records = await getSimulationMortgageRecords(ctx);
	return new Set(records.map((record) => record.mortgageId));
}

async function getSimulationMortgageLabelMap(
	ctx: QueryCtx
): Promise<Map<Id<"mortgages">, { label: string; ledgerMortgageId: string }>> {
	const records = await getSimulationMortgageRecords(ctx);
	return new Map(
		records.map((record) => [
			record.mortgageId,
			{
				label: record.label,
				ledgerMortgageId: record.ledgerMortgageId,
			},
		])
	);
}

async function getOrCreateSimulationBorrower(ctx: MutationCtx) {
	let user = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", SIM_BORROWER_AUTH_ID))
		.first();

	if (!user) {
		const userId = await ctx.db.insert("users", {
			authId: SIM_BORROWER_AUTH_ID,
			email: SIM_BORROWER_AUTH_ID,
			firstName: "Simulation",
			lastName: "Borrower",
		});
		user = await ctx.db.get(userId);
	}
	if (!user) {
		throw new Error("Failed to create simulation borrower user");
	}

	const borrower = await ctx.db
		.query("borrowers")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.first();

	if (borrower) {
		return borrower._id;
	}

	return await ctx.db.insert("borrowers", {
		userId: user._id,
		status: "active",
		lastTransitionAt: Date.now(),
		createdAt: Date.now(),
	});
}

async function getOrCreateSimulationBroker(ctx: MutationCtx) {
	let user = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", SIM_BROKER_AUTH_ID))
		.first();

	if (!user) {
		const userId = await ctx.db.insert("users", {
			authId: SIM_BROKER_AUTH_ID,
			email: SIM_BROKER_AUTH_ID,
			firstName: "Simulation",
			lastName: "Broker",
		});
		user = await ctx.db.get(userId);
	}
	if (!user) {
		throw new Error("Failed to create simulation broker user");
	}

	const broker = await ctx.db
		.query("brokers")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.first();

	if (broker) {
		return broker._id;
	}

	return await ctx.db.insert("brokers", {
		userId: user._id,
		status: "active",
		lastTransitionAt: Date.now(),
		createdAt: Date.now(),
	});
}

async function ensureSimulationLenders(
	ctx: MutationCtx,
	brokerId: Id<"brokers">
) {
	for (const fixture of SIM_LENDER_FIXTURES) {
		let user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", fixture.authId))
			.first();

		if (!user) {
			const userId = await ctx.db.insert("users", {
				authId: fixture.authId,
				email: fixture.email,
				firstName: fixture.firstName,
				lastName: fixture.lastName,
			});
			user = await ctx.db.get(userId);
		}
		if (!user) {
			throw new Error(
				`Failed to create simulation lender user ${fixture.authId}`
			);
		}

		const lender = await ctx.db
			.query("lenders")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.first();
		if (lender) {
			continue;
		}

		await ctx.db.insert("lenders", {
			userId: user._id,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "simulation",
			status: "active",
			activatedAt: Date.now(),
			createdAt: Date.now(),
		});
	}
}

async function deleteSimulationProfileByAuthId(
	ctx: MutationCtx,
	authId: string,
	table: "borrowers" | "brokers"
): Promise<{ deletedProfiles: number; deletedUsers: number }> {
	const user = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", authId))
		.first();
	if (!user) {
		return { deletedProfiles: 0, deletedUsers: 0 };
	}

	const profiles = await ctx.db
		.query(table)
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.collect();

	for (const profile of profiles) {
		await ctx.db.delete(profile._id);
	}
	await ctx.db.delete(user._id);

	return {
		deletedProfiles: profiles.length,
		deletedUsers: 1,
	};
}

async function deleteSimulationLenderByAuthId(
	ctx: MutationCtx,
	authId: string
): Promise<{ deletedProfiles: number; deletedUsers: number }> {
	const user = await ctx.db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", authId))
		.first();
	if (!user) {
		return { deletedProfiles: 0, deletedUsers: 0 };
	}

	const lenders = await ctx.db
		.query("lenders")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.collect();

	for (const lender of lenders) {
		await ctx.db.delete(lender._id);
	}
	await ctx.db.delete(user._id);

	return {
		deletedProfiles: lenders.length,
		deletedUsers: 1,
	};
}

async function buildSimulationCleanupTargets(ctx: QueryCtx) {
	const currentRecords = await getSimulationMortgageRecords(ctx);
	const legacyRecords = await getLegacySimulationMortgageRecords(ctx);

	return {
		allMortgageIds: new Set<Id<"mortgages">>([
			...currentRecords.map((record) => record.mortgageId),
			...legacyRecords.map((record) => record.mortgageId),
		]),
		propertyIds: new Set<Id<"properties">>([
			...currentRecords.map((record) => record.propertyId),
			...legacyRecords.map((record) => record.propertyId),
		]),
	};
}

async function deleteSimulationMortgageArtifacts(
	ctx: MutationCtx,
	allMortgageIds: ReadonlySet<Id<"mortgages">>,
	propertyIds: ReadonlySet<Id<"properties">>
) {
	let deletedObligations = 0;
	for (const obligation of await ctx.db.query("obligations").collect()) {
		if (allMortgageIds.has(obligation.mortgageId)) {
			await ctx.db.delete(obligation._id);
			deletedObligations++;
		}
	}

	let deletedDispersals = 0;
	for (const entry of await ctx.db.query("dispersalEntries").collect()) {
		if (allMortgageIds.has(entry.mortgageId)) {
			await ctx.db.delete(entry._id);
			deletedDispersals++;
		}
	}

	let deletedFees = 0;
	for (const entry of await ctx.db.query("servicingFeeEntries").collect()) {
		if (allMortgageIds.has(entry.mortgageId)) {
			await ctx.db.delete(entry._id);
			deletedFees++;
		}
	}

	for (const link of await ctx.db.query("mortgageBorrowers").collect()) {
		if (allMortgageIds.has(link.mortgageId)) {
			await ctx.db.delete(link._id);
		}
	}

	for (const mortgageId of allMortgageIds) {
		await ctx.db.delete(mortgageId);
	}
	for (const propertyId of propertyIds) {
		await ctx.db.delete(propertyId);
	}

	return { deletedObligations, deletedDispersals, deletedFees };
}

async function cleanupLegacySimulationLedgerArtifacts(ctx: MutationCtx) {
	let deletedEntries = 0;
	const legacyAccountIds: Id<"ledger_accounts">[] = [];

	for (const account of await ctx.db.query("ledger_accounts").collect()) {
		if (account.mortgageId?.startsWith("sim-mtg-")) {
			legacyAccountIds.push(account._id);
		}
	}

	for (const mortgageId of [
		"sim-mtg-greenfield",
		"sim-mtg-riverside",
		"sim-mtg-oakwood",
	]) {
		const entries = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_mortgage_and_time", (q) => q.eq("mortgageId", mortgageId))
			.collect();
		for (const entry of entries) {
			await ctx.db.delete(entry._id);
			deletedEntries++;
		}
	}

	for (const accountId of legacyAccountIds) {
		await ctx.db.delete(accountId);
	}

	return {
		deletedEntries,
		deletedAccounts: legacyAccountIds.length,
	};
}

export const getSimulationState = authedQuery
	.handler(async (ctx) => {
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

		const simMtgIdSet = await getSimulationMortgageIdSet(ctx);
		const allObligations = await ctx.db.query("obligations").collect();
		const simObligations = allObligations.filter((obligation) =>
			simMtgIdSet.has(obligation.mortgageId)
		);
		const pending = simObligations.filter((obligation) =>
			UNRESOLVED_OBLIGATION_STATUSES.has(obligation.status)
		).length;
		const settled = simObligations.filter((obligation) =>
			isResolvedObligationStatus(obligation.status)
		).length;

		const allAccounts = await ctx.db.query("ledger_accounts").collect();
		const mortgages = DEMO_LEDGER_MORTGAGES.map((mortgage) => {
			const treasury = allAccounts.find(
				(account) =>
					account.type === "TREASURY" &&
					account.mortgageId === mortgage.ledgerMortgageId
			);
			const treasuryBalance = treasury ? Number(getPostedBalance(treasury)) : 0;

			const positions = allAccounts
				.filter(
					(account) =>
						account.type === "POSITION" &&
						account.mortgageId === mortgage.ledgerMortgageId
				)
				.map((account) => ({
					lenderId: getAccountLenderId(account) ?? "",
					balance: Number(getPostedBalance(account)),
					availableBalance: Number(getAvailableBalance(account)),
				}));

			const positionSum = positions.reduce(
				(sum, position) => sum + position.balance,
				0
			);
			const total = treasuryBalance + positionSum;

			return {
				mortgageId: mortgage.ledgerMortgageId,
				label: mortgage.label,
				positions,
				invariant: { valid: total === Number(TOTAL_SUPPLY), total },
			};
		});

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

		const simMtgIdSet = await getSimulationMortgageIdSet(ctx);
		const mortgageLabelMap = await getSimulationMortgageLabelMap(ctx);
		const allObligations = await ctx.db.query("obligations").collect();
		const simObligations = allObligations
			.filter((obligation) => simMtgIdSet.has(obligation.mortgageId))
			.filter((obligation) =>
				UNRESOLVED_OBLIGATION_STATUSES.has(obligation.status)
			)
			.sort((a, b) => a.dueDate - b.dueDate);

		const currentDate = clock?.currentDate ?? todayISO();

		return simObligations.map((obligation) => {
			const mortgage = mortgageLabelMap.get(obligation.mortgageId);
			const dueDate = new Date(obligation.dueDate * 1000)
				.toISOString()
				.split("T")[0];

			return {
				_id: obligation._id,
				mortgageId: mortgage?.ledgerMortgageId ?? "",
				mortgageLabel:
					mortgage?.label ??
					getDemoMortgageLabel(mortgage?.ledgerMortgageId ?? ""),
				dueDate,
				type: obligation.type,
				paymentNumber: obligation.paymentNumber,
				amount: Math.max(0, obligation.amount - obligation.amountSettled),
				status: obligation.status,
				daysUntilDue: daysBetween(currentDate, dueDate),
			};
		});
	})
	.public();

export const getDispersalHistory = authedQuery
	.handler(async (ctx) => {
		const simMtgIdSet = await getSimulationMortgageIdSet(ctx);
		const mortgageLabelMap = await getSimulationMortgageLabelMap(ctx);

		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_mortgage")
			.collect();
		const simEntries = entries.filter((entry) =>
			simMtgIdSet.has(entry.mortgageId)
		);

		simEntries.sort((a, b) => {
			if (a.dispersalDate !== b.dispersalDate) {
				return b.dispersalDate.localeCompare(a.dispersalDate);
			}
			return b.createdAt - a.createdAt;
		});

		const totalByLender: Record<string, number> = {};
		for (const entry of simEntries) {
			totalByLender[entry.lenderId] =
				(totalByLender[entry.lenderId] ?? 0) + entry.amount;
		}

		return {
			entries: simEntries.map((entry) => ({
				_id: entry._id,
				mortgageId:
					mortgageLabelMap.get(entry.mortgageId)?.ledgerMortgageId ?? "",
				lenderId: entry.lenderId,
				amount: entry.amount,
				dispersalDate: entry.dispersalDate,
				status: entry.status,
			})),
			totalByLender,
			totalEntries: simEntries.length,
			totalAmount: Object.values(totalByLender).reduce(
				(sum, value) => sum + value,
				0
			),
		};
	})
	.public();

export const getTrialBalance = authedQuery
	.handler(async (ctx) => {
		const allAccounts = await ctx.db.query("ledger_accounts").collect();
		const simAccounts = allAccounts.filter(
			(account) =>
				account.type === "WORLD" ||
				(account.mortgageId !== undefined &&
					DEMO_LEDGER_MORTGAGE_IDS.has(account.mortgageId))
		);

		const accounts = simAccounts.map((account) => ({
			accountId: account._id,
			type: account.type,
			mortgageId: account.mortgageId ?? "",
			lenderId: getAccountLenderId(account) ?? "",
			postedBalance: Number(getPostedBalance(account)),
			availableBalance: Number(getAvailableBalance(account)),
			pendingCredits: Number(account.pendingCredits ?? 0n),
			pendingDebits: Number(account.pendingDebits ?? 0n),
		}));

		const totalPosted = accounts.reduce(
			(sum, account) => sum + account.postedBalance,
			0
		);
		const totalPending = accounts.reduce(
			(sum, account) => sum + account.pendingCredits + account.pendingDebits,
			0
		);

		return { accounts, totalPosted, totalPending };
	})
	.public();

export const seedSimulation = adminMutation
	.handler(async (ctx) => {
		const existingClock = await ctx.db
			.query("simulation_clock")
			.withIndex("by_clockId", (q) => q.eq("clockId", SIM_CLOCK_ID))
			.first();
		if (existingClock) {
			return { seeded: false, message: "Simulation already initialized." };
		}

		await ensureDemoLedgerSeeded(ctx);
		const borrowerId = await getOrCreateSimulationBorrower(ctx);
		const brokerId = await getOrCreateSimulationBroker(ctx);
		await ensureSimulationLenders(ctx, brokerId);
		const mortgageIdMap: Record<string, Id<"mortgages">> = {};
		const monthlyPayment = calculateMonthlyPayment(Number(TOTAL_SUPPLY));

		for (const mortgage of DEMO_LEDGER_MORTGAGES) {
			const existingMortgage = await ctx.db
				.query("mortgages")
				.withIndex("by_simulation", (q) =>
					q.eq("simulationId", mortgage.ledgerMortgageId)
				)
				.first();

			if (existingMortgage) {
				mortgageIdMap[mortgage.ledgerMortgageId] = existingMortgage._id;
				continue;
			}

			const propertyId = await ctx.db.insert("properties", {
				streetAddress: mortgage.label,
				city: "Simulation City",
				province: "ON",
				postalCode: "A1A1A1",
				latitude: 0,
				longitude: 0,
				propertyType: mortgage.propertyType,
				createdAt: Date.now(),
			});

			const mortgageId = await ctx.db.insert("mortgages", {
				status: "active",
				machineContext: { missedPayments: 0, lastPaymentAt: 0 },
				lastTransitionAt: Date.now(),
				propertyId,
				principal: Number(TOTAL_SUPPLY),
				interestRate: 0.07,
				rateType: "fixed",
				termMonths: 24,
				amortizationMonths: 240,
				paymentAmount: monthlyPayment,
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
				simulationId: mortgage.ledgerMortgageId,
			});

			mortgageIdMap[mortgage.ledgerMortgageId] = mortgageId;
		}

		for (const mortgage of DEMO_LEDGER_MORTGAGES) {
			const mortgageId = mortgageIdMap[mortgage.ledgerMortgageId];
			const existingObligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();

			if (existingObligations.length > 0) {
				continue;
			}

			const startDate = new Date("2024-01-01T00:00:00Z");
			for (let month = 1; month <= 24; month++) {
				const dueDate = new Date(startDate);
				dueDate.setUTCMonth(dueDate.getUTCMonth() + month);
				dueDate.setUTCDate(1);

				const isLastMonth = month === 24;
				await ctx.runMutation(internal.obligations.mutations.createObligation, {
					mortgageId,
					borrowerId,
					paymentNumber: month,
					type: isLastMonth ? "principal_repayment" : "regular_interest",
					amount: isLastMonth ? Number(TOTAL_SUPPLY) : monthlyPayment,
					amountSettled: 0,
					dueDate: Math.floor(dueDate.getTime() / 1000),
					gracePeriodEnd:
						Math.floor(dueDate.getTime() / 1000) + 5 * 24 * 60 * 60,
					sourceObligationId: undefined,
					status: "upcoming",
				});
			}
		}

		await ctx.db.insert("simulation_clock", {
			clockId: SIM_CLOCK_ID,
			currentDate: "2024-01-01",
			startedAt: Date.now(),
		});

		return {
			seeded: true,
			message: `Simulation initialized with ${DEMO_LEDGER_MORTGAGES.length} mortgages and 72 obligations.`,
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
		const asOfTimestamp = Math.floor(parseDate(newDate).getTime() / 1000);
		await ctx.db.patch(clock._id, { currentDate: newDate });

		const simMtgIdSet = await getSimulationMortgageIdSet(ctx);
		const mortgageLabelMap = await getSimulationMortgageLabelMap(ctx);
		const allObligations = await ctx.db.query("obligations").collect();
		const simObligations = allObligations.filter((obligation) =>
			simMtgIdSet.has(obligation.mortgageId)
		);

		const newlyDue = simObligations.filter(
			(obligation) =>
				obligation.status === "upcoming" && obligation.dueDate <= asOfTimestamp
		);
		const pastGrace = simObligations.filter(
			(obligation) =>
				obligation.status === "due" &&
				obligation.gracePeriodEnd <= asOfTimestamp
		);

		let becameDueCount = 0;
		for (const obligation of newlyDue) {
			try {
				const result: TransitionResult = await ctx.runMutation(
					internal.engine.commands.transitionObligation,
					{
						entityId: obligation._id,
						eventType: "BECAME_DUE",
						payload: {},
						source: SIM_COMMAND_SOURCE,
					}
				);
				if (result.success) {
					becameDueCount++;
				}
			} catch (error) {
				console.error(
					`[advanceTime] BECAME_DUE failed for ${obligation._id}:`,
					error
				);
			}
		}

		let becameOverdueCount = 0;
		for (const obligation of pastGrace) {
			try {
				const result: TransitionResult = await ctx.runMutation(
					internal.engine.commands.transitionObligation,
					{
						entityId: obligation._id,
						eventType: "GRACE_PERIOD_EXPIRED",
						payload: {},
						source: SIM_COMMAND_SOURCE,
					}
				);
				if (result.success) {
					becameOverdueCount++;
				}
			} catch (error) {
				console.error(
					`[advanceTime] GRACE_PERIOD_EXPIRED failed for ${obligation._id}:`,
					error
				);
			}
		}

		await ctx.scheduler.runAfter(
			0,
			internal.engine.reconciliationAction.dailyReconciliation,
			{}
		);

		return {
			newDate,
			obligationsTriggered: becameDueCount + becameOverdueCount,
			becameDue: becameDueCount,
			becameOverdue: becameOverdueCount,
			newlyDueObligations: newlyDue.map((obligation) => ({
				_id: obligation._id,
				mortgageId:
					mortgageLabelMap.get(obligation.mortgageId)?.ledgerMortgageId ?? "",
				type: obligation.type,
				paymentNumber: obligation.paymentNumber,
			})),
			becameOverdueObligations: pastGrace.map((obligation) => ({
				_id: obligation._id,
				mortgageId:
					mortgageLabelMap.get(obligation.mortgageId)?.ledgerMortgageId ?? "",
				type: obligation.type,
				paymentNumber: obligation.paymentNumber,
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

		const simMtgIdSet = await getSimulationMortgageIdSet(ctx);
		if (!simMtgIdSet.has(obligation.mortgageId)) {
			throw new ConvexError("Not a simulation obligation.");
		}

		if (!SETTLEABLE_OBLIGATION_STATUSES.has(obligation.status)) {
			throw new ConvexError(
				`Obligation ${args.obligationId} is ${obligation.status}. Only due, overdue, or partially settled obligations can be paid.`
			);
		}
		if (!Number.isSafeInteger(args.settledAmount) || args.settledAmount <= 0) {
			throw new ConvexError("settledAmount must be a positive integer amount.");
		}

		const remainingAmount = obligation.amount - obligation.amountSettled;
		if (args.settledAmount > remainingAmount) {
			throw new ConvexError(
				`settledAmount ${args.settledAmount} exceeds remaining balance ${remainingAmount}.`
			);
		}

		const result: TransitionResult = await ctx.runMutation(
			internal.engine.commands.transitionObligation,
			{
				entityId: args.obligationId,
				eventType: "PAYMENT_APPLIED",
				payload: {
					amount: args.settledAmount,
					attemptId: genIdempotencyKey("sim-payment"),
					currentAmountSettled: obligation.amountSettled,
					totalAmount: obligation.amount,
				},
				source: SIM_COMMAND_SOURCE,
			}
		);

		if (!result.success) {
			throw new ConvexError(
				result.reason ?? "Simulation payment could not be applied."
			);
		}

		if (result.newState === "settled") {
			const updatedObligation = await ctx.db.get(args.obligationId);
			if (!updatedObligation) {
				throw new ConvexError(
					`Obligation disappeared after settlement: ${args.obligationId}`
				);
			}

			const settledDate = updatedObligation.settledAt
				? new Date(updatedObligation.settledAt).toISOString().slice(0, 10)
				: clock.currentDate;

			await ctx.runMutation(
				internal.dispersal.createDispersalEntries.createDispersalEntries,
				{
					mortgageId: updatedObligation.mortgageId,
					obligationId: updatedObligation._id,
					settledAmount: updatedObligation.amountSettled,
					settledDate,
					idempotencyKey: `dispersal:${args.obligationId}`,
					source: SIM_COMMAND_SOURCE,
				}
			);
		}

		return {
			newState: result.newState,
			effectsScheduled: result.effectsScheduled ?? [],
			message:
				result.newState === "settled"
					? "Payment applied. Dispersal scheduled."
					: "Partial payment applied. Obligation remains open.",
		};
	})
	.public();

export const cleanupSimulation = adminMutation
	.handler(async (ctx) => {
		const { allMortgageIds, propertyIds } =
			await buildSimulationCleanupTargets(ctx);
		const { deletedObligations, deletedDispersals, deletedFees } =
			await deleteSimulationMortgageArtifacts(ctx, allMortgageIds, propertyIds);
		const legacyCleanup = await cleanupLegacySimulationLedgerArtifacts(ctx);

		const borrowerCleanup = await deleteSimulationProfileByAuthId(
			ctx,
			SIM_BORROWER_AUTH_ID,
			"borrowers"
		);
		const brokerCleanup = await deleteSimulationProfileByAuthId(
			ctx,
			SIM_BROKER_AUTH_ID,
			"brokers"
		);
		let deletedLenders = 0;
		let deletedLenderUsers = 0;
		for (const fixture of SIM_LENDER_FIXTURES) {
			const lenderCleanup = await deleteSimulationLenderByAuthId(
				ctx,
				fixture.authId
			);
			deletedLenders += lenderCleanup.deletedProfiles;
			deletedLenderUsers += lenderCleanup.deletedUsers;
		}

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
			deletedEntries: legacyCleanup.deletedEntries,
			deletedAccounts: legacyCleanup.deletedAccounts,
			deletedMortgages: allMortgageIds.size,
			deletedProperties: propertyIds.size,
			deletedBorrowers: borrowerCleanup.deletedProfiles,
			deletedBrokers: brokerCleanup.deletedProfiles,
			deletedLenders,
			deletedUsers:
				borrowerCleanup.deletedUsers +
				brokerCleanup.deletedUsers +
				deletedLenderUsers,
		};
	})
	.public();
