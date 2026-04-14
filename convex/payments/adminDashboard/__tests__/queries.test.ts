import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
} from "../../../../src/test/auth/identities";
import {
	createGovernedTestConvex,
	ensureBorrowerReceivableAccount,
	seedBorrowerProfile,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "../../../../src/test/convex/payments/helpers";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

async function insertTransferRequest(
	t: GovernedTestConvex,
	args: {
		borrowerId: Id<"borrowers">;
		confirmedAt?: number;
		direction: "inbound" | "outbound";
		lenderId?: string;
		mortgageId: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		status: string;
	}
) {
	const now = Date.now();
	return t.run(async (ctx) =>
		ctx.db.insert("transferRequests", {
			status: args.status,
			direction: args.direction,
			transferType:
				args.direction === "outbound"
					? "lender_payout"
					: "borrower_interest_collection",
			amount: 25_000,
			currency: "CAD",
			counterpartyType: args.direction === "outbound" ? "lender" : "borrower",
			counterpartyId:
				args.direction === "outbound"
					? (args.lenderId ?? "lender_support_row")
					: String(args.borrowerId),
			providerCode: "manual",
			idempotencyKey: `admin-dashboard-transfer:${args.direction}:${args.status}:${now}`,
			source: {
				channel: "admin_dashboard",
				actorId: FAIRLEND_ADMIN.subject,
				actorType: "admin",
			},
			borrowerId: args.borrowerId,
			confirmedAt: args.confirmedAt,
			createdAt: now,
			lastTransitionAt: now,
			lenderId: undefined,
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
		} as Parameters<typeof ctx.db.insert<"transferRequests">>[1])
	);
}

async function insertScheduleSyncError(
	t: GovernedTestConvex,
	args: {
		bankAccountId: Id<"bankAccounts">;
		borrowerId: Id<"borrowers">;
		coveredPlanEntryId: Id<"collectionPlanEntries">;
		mortgageId: Id<"mortgages">;
	}
) {
	const now = Date.now();
	return t.run(async (ctx) =>
		ctx.db.insert("externalCollectionSchedules", {
			status: "sync_error",
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			providerCode: "pad_rotessa",
			bankAccountId: args.bankAccountId,
			externalScheduleRef: "rotessa-sync-error-001",
			activationIdempotencyKey: "admin-dashboard-sync-error-001",
			startDate: now,
			endDate: now + 86_400_000,
			cadence: "Monthly",
			coveredFromPlanEntryId: args.coveredPlanEntryId,
			coveredToPlanEntryId: args.coveredPlanEntryId,
			activatedAt: now - 86_400_000,
			lastSyncedAt: now - 1000,
			lastSyncAttemptAt: now - 1000,
			lastSyncErrorAt: now,
			lastSyncErrorMessage: "provider timeout",
			consecutiveSyncFailures: 2,
			lastProviderScheduleStatus: "active",
			providerData: { source: "test" },
			source: "test",
			createdAt: now - 86_400_000,
			lastTransitionAt: now,
		} as Parameters<typeof ctx.db.insert<"externalCollectionSchedules">>[1])
	);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
	vi.stubEnv("DISABLE_CASH_LEDGER_HASHCHAIN", "true");
	vi.stubEnv("DISABLE_GT_HASHCHAIN", "true");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("admin dashboard queries", () => {
	it("requires the FairLend admin chain for every admin dashboard snapshot", async () => {
		const t = createBackendTestConvex();

		await expect(
			t
				.withIdentity(EXTERNAL_ORG_ADMIN)
				.query(
					api.payments.adminDashboard.queries
						.getPaymentOperationsDashboardSnapshot,
					{}
				)
		).rejects.toThrow("Forbidden: fair lend admin role required");
		await expect(
			t
				.withIdentity(EXTERNAL_ORG_ADMIN)
				.query(
					api.payments.adminDashboard.queries.getFinancialLedgerSupportSnapshot,
					{}
				)
		).rejects.toThrow("Forbidden: fair lend admin role required");
		await expect(
			t
				.withIdentity(EXTERNAL_ORG_ADMIN)
				.query(
					api.payments.adminDashboard.queries
						.getFinancialLedgerDashboardSnapshot,
					{}
				)
		).rejects.toThrow("Forbidden: fair lend admin role required");
	});

	it("marks journal drift and missing transfer ledger links in the payment operations snapshot", async () => {
		const t = createBackendTestConvex();
		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "due",
		});

		await t.run((ctx) =>
			ctx.db.patch(obligationId, {
				amountSettled: 50_000,
			})
		);
		await ensureBorrowerReceivableAccount(t, {
			initialDebitBalance: 200_000n,
			obligationId,
		});
		const transferId = await insertTransferRequest(t, {
			borrowerId,
			confirmedAt: Date.now(),
			direction: "inbound",
			mortgageId,
			obligationId,
			status: "confirmed",
		});

		const snapshot = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(
				api.payments.adminDashboard.queries
					.getPaymentOperationsDashboardSnapshot,
				{}
			);

		const obligationRow = snapshot.obligations.find(
			(row) => row.obligationId === String(obligationId)
		);
		expect(obligationRow?.hasJournalDrift).toBe(true);
		expect(obligationRow?.journalOutstandingBalance).toBe(200_000);
		expect(obligationRow?.projectedOutstandingBalance).toBe(250_000);

		const transferRow = snapshot.transfers.find(
			(row) => row.transferId === String(transferId)
		);
		expect(transferRow?.journalIntegrity).toBe("missing");
	});

	it("rolls sync errors and healing attempts into financial ops-health summaries", async () => {
		const t = createBackendTestConvex();
		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "due",
		});
		const planEntryId = await seedPlanEntry(t, {
			amount: 300_000,
			method: "manual",
			obligationIds: [obligationId],
			scheduledDate: Date.now(),
			status: "planned",
			source: "default_schedule",
		});

		const bankAccountId = await t.run(async (ctx) =>
			ctx.db.insert("bankAccounts", {
				ownerType: "borrower",
				ownerId: String(borrowerId),
				institutionNumber: "001",
				transitNumber: "00011",
				accountLast4: "6789",
				status: "validated",
				validationMethod: "provider_verified",
				mandateStatus: "active",
				isDefaultInbound: true,
				country: "CA",
				currency: "CAD",
				createdAt: Date.now(),
			})
		);
		await insertScheduleSyncError(t, {
			bankAccountId,
			borrowerId,
			coveredPlanEntryId: planEntryId,
			mortgageId,
		});

		const transferId = await insertTransferRequest(t, {
			borrowerId,
			confirmedAt: Date.now(),
			direction: "inbound",
			mortgageId,
			obligationId,
			status: "confirmed",
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("transferHealingAttempts", {
				transferRequestId: transferId,
				attemptCount: 4,
				lastAttemptAt: Date.now() - 1000,
				escalatedAt: Date.now() - 500,
				status: "escalated",
				createdAt: Date.now() - 5000,
			});
			await ctx.db.insert("dispersalHealingAttempts", {
				obligationId,
				attemptCount: 2,
				lastAttemptAt: Date.now() - 2000,
				status: "retrying",
				createdAt: Date.now() - 6000,
			});
			await ctx.db.insert("obligationCronMonitoring", {
				jobName: "obligation-transition-cron",
				lastRunBusinessDate: "2026-04-14",
				newlyDueOverflowStreak: 1,
				pastGraceOverflowStreak: 0,
				lastNewlyDueCount: 75,
				lastPastGraceCount: 0,
				updatedAt: Date.now(),
			});
		});

		const snapshot = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(
				api.payments.adminDashboard.queries.getFinancialLedgerDashboardSnapshot,
				{}
			);

		expect(snapshot.opsHealth.summary.activeIncidents).toBe(3);
		expect(snapshot.opsHealth.summary.escalatedHealingAttempts).toBe(1);
		expect(snapshot.opsHealth.summary.failedRunsLast24h).toBe(2);
		expect(snapshot.opsHealth.summary.openIntegrityDefects).toBe(1);
		expect(snapshot.opsHealth.summary.schedulesInSyncError).toBe(1);

		expect(
			snapshot.opsHealth.jobs.find(
				(job) => job.jobKey === "dispersal-self-healing"
			)?.status
		).toBe("warning");
		expect(
			snapshot.opsHealth.jobs.find(
				(job) => job.jobKey === "transfer-reconciliation"
			)?.status
		).toBe("error");
		expect(
			snapshot.opsHealth.jobs.find(
				(job) => job.jobKey === "recurring-schedule-poller"
			)?.status
		).toBe("error");
		expect(
			snapshot.opsHealth.jobs.find(
				(job) => job.jobKey === "obligation-transition-cron"
			)?.status
		).toBe("warning");
		expect(snapshot.opsHealth.events.map((event) => event.title)).toEqual(
			expect.arrayContaining([
				"Recurring schedule sync error",
				"Transfer integrity defect escalated",
				"Dispersal healing retrying",
			])
		);
	});
});
