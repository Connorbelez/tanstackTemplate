import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import schema from "../../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

const PAYMENT_HANDLER_IDENTITY = {
	subject: "test-transfer-handler-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([
		"payment:view",
		"payment:manage",
		"payment:retry",
		"payment:cancel",
	]),
	user_email: "transfer-handler-test@fairlend.ca",
	user_first_name: "Transfer",
	user_last_name: "Handler",
};

const INITIATED_STATUS_RE = /initiated/;
const ONLY_MANUAL_CONFIRM_RE =
	/Only manual transfers can be confirmed manually/;

const ADMIN_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "test-transfer-admin",
	actorType: "admin" as const,
};

type TestHarness = ReturnType<typeof convexTest>;

function createHarness() {
	process.env.DISABLE_GT_HASHCHAIN = "true";
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	return t;
}

function asPaymentUser(t: TestHarness) {
	return t.withIdentity(PAYMENT_HANDLER_IDENTITY);
}

interface SeedCoreResult {
	borrowerId: Id<"borrowers">;
	dealAId: Id<"deals">;
	dealBId: Id<"deals">;
	lenderId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
}

let transferInsertCounter = 0;

async function seedCoreEntities(t: TestHarness): Promise<SeedCoreResult> {
	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: `transfer-broker-${now}`,
			email: `transfer-broker-${now}@fairlend.test`,
			firstName: "Transfer",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: `transfer-borrower-${now}`,
			email: `transfer-borrower-${now}@fairlend.test`,
			firstName: "Transfer",
			lastName: "Borrower",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		const lenderUserId = await ctx.db.insert("users", {
			authId: `transfer-lender-${now}`,
			email: `transfer-lender-${now}@fairlend.test`,
			firstName: "Transfer",
			lastName: "Lender",
		});
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/transfer-lender",
			status: "active",
			createdAt: now,
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Transfer Handler Ave",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 2B2",
			propertyType: "residential",
			createdAt: now,
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			annualServicingRate: 0.01,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2026-12-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});

		const dealAId = await ctx.db.insert("deals", {
			status: "active",
			machineContext: {},
			lastTransitionAt: now,
			mortgageId,
			buyerId: "buyer-transfer-a",
			sellerId: "seller-transfer-a",
			fractionalShare: 1,
			createdAt: now,
			createdBy: "test-transfer-suite",
		});

		const dealBId = await ctx.db.insert("deals", {
			status: "active",
			machineContext: {},
			lastTransitionAt: now,
			mortgageId,
			buyerId: "buyer-transfer-b",
			sellerId: "seller-transfer-b",
			fractionalShare: 1,
			createdAt: now + 1,
			createdBy: "test-transfer-suite",
		});

		return { borrowerId, dealAId, dealBId, lenderId, mortgageId };
	});
}

async function insertTransfer(
	t: TestHarness,
	overrides: Record<string, unknown>
): Promise<Id<"transferRequests">> {
	transferInsertCounter += 1;
	return t.run(async (ctx) => {
		const base = {
			status: "initiated",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: 50_000,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: "counterparty-default",
			providerCode: "manual",
			idempotencyKey: `transfer-idem-${transferInsertCounter}`,
			source: ADMIN_SOURCE,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		};

		return ctx.db.insert("transferRequests", {
			...base,
			...overrides,
		} as Parameters<typeof ctx.db.insert<"transferRequests">>[1]);
	});
}

async function insertCashAccount(
	t: TestHarness,
	fields: {
		family: "TRUST_CASH" | "CASH_CLEARING";
		mortgageId: Id<"mortgages">;
	}
): Promise<Id<"cash_ledger_accounts">> {
	return t.run(async (ctx) => {
		return ctx.db.insert("cash_ledger_accounts", {
			family: fields.family,
			mortgageId: fields.mortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		} as Parameters<typeof ctx.db.insert<"cash_ledger_accounts">>[1]);
	});
}

async function insertAuditTimelineEntry(
	t: TestHarness,
	args: {
		transferId: Id<"transferRequests">;
		eventType: string;
		newState: string;
		previousState: string;
		timestamp: number;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("auditJournal", {
			entityType: "transfer",
			entityId: `${args.transferId}`,
			eventType: args.eventType,
			payload: {},
			previousState: args.previousState,
			newState: args.newState,
			outcome: "transitioned",
			actorId: "test-transfer-admin",
			actorType: "admin",
			channel: "admin_dashboard",
			machineVersion: "1.0.0",
			timestamp: args.timestamp,
		} as Parameters<typeof ctx.db.insert<"auditJournal">>[1]);
	});
}

async function insertCashTimelineEntry(
	t: TestHarness,
	args: {
		debitAccountId: Id<"cash_ledger_accounts">;
		creditAccountId: Id<"cash_ledger_accounts">;
		transferId: Id<"transferRequests">;
		sequenceNumber: bigint;
		timestamp: number;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("cash_ledger_journal_entries", {
			sequenceNumber: args.sequenceNumber,
			entryType: "CASH_RECEIVED",
			transferRequestId: args.transferId,
			effectiveDate: "2026-03-01",
			timestamp: args.timestamp,
			debitAccountId: args.debitAccountId,
			creditAccountId: args.creditAccountId,
			amount: 50_000n,
			idempotencyKey: `timeline-${args.transferId}-${args.sequenceNumber}`,
			source: ADMIN_SOURCE,
		} as Parameters<typeof ctx.db.insert<"cash_ledger_journal_entries">>[1]);
	});
}

describe("transfer handlers integration: mutations", () => {
	it("cancelTransfer transitions initiated -> cancelled", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);

		const transferId = await insertTransfer(t, {
			status: "initiated",
			counterpartyId: `${seeded.borrowerId}`,
			dealId: seeded.dealAId,
			idempotencyKey: "cancel-valid-1",
			createdAt: 1000,
			lastTransitionAt: 1000,
		});

		const result = await auth.mutation(
			api.payments.transfers.mutations.cancelTransfer,
			{
				transferId,
				reason: "cancel integration test",
			}
		);

		expect(result.success).toBe(true);
		expect(result.previousState).toBe("initiated");
		expect(result.newState).toBe("cancelled");

		const updated = await t.run(async (ctx) => ctx.db.get(transferId));
		expect(updated?.status).toBe("cancelled");
	});

	it("cancelTransfer rejects non-initiated statuses", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);

		const transferId = await insertTransfer(t, {
			status: "pending",
			counterpartyId: `${seeded.borrowerId}`,
			dealId: seeded.dealAId,
			idempotencyKey: "cancel-invalid-1",
			createdAt: 2000,
			lastTransitionAt: 2000,
		});

		await expect(
			auth.mutation(api.payments.transfers.mutations.cancelTransfer, {
				transferId,
				reason: "cannot cancel pending",
			})
		).rejects.toThrow(INITIATED_STATUS_RE);
	});

	it("retryTransfer is idempotent for repeated invocation on the same failed transfer", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);

		const failedTransferId = await insertTransfer(t, {
			status: "failed",
			counterpartyId: `${seeded.borrowerId}`,
			dealId: seeded.dealAId,
			providerCode: "manual",
			idempotencyKey: "retry-source-failed",
			createdAt: 3000,
			lastTransitionAt: 3000,
		});

		const firstRetryId = await auth.mutation(
			api.payments.transfers.mutations.retryTransfer,
			{ transferId: failedTransferId }
		);
		const secondRetryId = await auth.mutation(
			api.payments.transfers.mutations.retryTransfer,
			{ transferId: failedTransferId }
		);

		expect(firstRetryId).toBe(secondRetryId);

		const retriedRows = await t.run(async (ctx) => {
			return ctx.db
				.query("transferRequests")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", `retry:${failedTransferId}`)
				)
				.collect();
		});

		expect(retriedRows).toHaveLength(1);
		expect(retriedRows[0]?._id).toBe(firstRetryId);
		expect(retriedRows[0]?.status).toBe("initiated");
		expect(retriedRows[0]?.idempotencyKey).toBe(`retry:${failedTransferId}`);
		expect(
			(retriedRows[0]?.metadata as Record<string, unknown> | undefined)
				?.retryOfTransferId
		).toBe(`${failedTransferId}`);
	});

	it("confirmManualTransfer rejects non-manual providers", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);

		const nonManualTransferId = await insertTransfer(t, {
			status: "initiated",
			providerCode: "pad_vopay",
			counterpartyId: `${seeded.borrowerId}`,
			dealId: seeded.dealAId,
			idempotencyKey: "confirm-manual-guard",
			createdAt: 4000,
			lastTransitionAt: 4000,
		});

		await expect(
			auth.mutation(api.payments.transfers.mutations.confirmManualTransfer, {
				transferId: nonManualTransferId,
			})
		).rejects.toThrow(ONLY_MANUAL_CONFIRM_RE);
	});
});

describe("transfer handlers integration: queries", () => {
	it("listTransfersByCounterparty returns filtered, sorted transfers", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);
		const borrowerCounterparty = `${seeded.borrowerId}`;

		const t1 = await insertTransfer(t, {
			status: "failed",
			counterpartyType: "borrower",
			counterpartyId: borrowerCounterparty,
			dealId: seeded.dealAId,
			idempotencyKey: "counterparty-1",
			createdAt: 1000,
			lastTransitionAt: 1000,
		});
		const t2 = await insertTransfer(t, {
			status: "failed",
			counterpartyType: "borrower",
			counterpartyId: borrowerCounterparty,
			dealId: seeded.dealAId,
			idempotencyKey: "counterparty-2",
			createdAt: 3000,
			lastTransitionAt: 3000,
		});
		const t3 = await insertTransfer(t, {
			status: "failed",
			counterpartyType: "borrower",
			counterpartyId: borrowerCounterparty,
			dealId: seeded.dealBId,
			idempotencyKey: "counterparty-3",
			createdAt: 2000,
			lastTransitionAt: 2000,
		});
		await insertTransfer(t, {
			status: "failed",
			counterpartyType: "borrower",
			counterpartyId: "different-counterparty",
			dealId: seeded.dealAId,
			idempotencyKey: "counterparty-other",
			createdAt: 4000,
			lastTransitionAt: 4000,
		});

		const rows = await auth.query(
			api.payments.transfers.queries.listTransfersByCounterparty,
			{
				counterpartyType: "borrower",
				counterpartyId: borrowerCounterparty,
				status: "failed",
				limit: 10,
			}
		);

		expect(rows.map((row) => row._id)).toEqual([t2, t3, t1]);
	});

	it("listTransfersByDeal returns filtered, sorted transfers", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);
		const borrowerCounterparty = `${seeded.borrowerId}`;

		const t1 = await insertTransfer(t, {
			status: "failed",
			counterpartyId: borrowerCounterparty,
			dealId: seeded.dealAId,
			idempotencyKey: "deal-1",
			createdAt: 1000,
			lastTransitionAt: 1000,
		});
		const t2 = await insertTransfer(t, {
			status: "failed",
			counterpartyId: borrowerCounterparty,
			dealId: seeded.dealAId,
			idempotencyKey: "deal-2",
			createdAt: 3000,
			lastTransitionAt: 3000,
		});
		await insertTransfer(t, {
			status: "failed",
			counterpartyId: borrowerCounterparty,
			dealId: seeded.dealBId,
			idempotencyKey: "deal-other",
			createdAt: 2000,
			lastTransitionAt: 2000,
		});
		const t4 = await insertTransfer(t, {
			status: "failed",
			counterpartyId: "different-counterparty",
			dealId: seeded.dealAId,
			idempotencyKey: "deal-4",
			createdAt: 4000,
			lastTransitionAt: 4000,
		});

		const rows = await auth.query(
			api.payments.transfers.queries.listTransfersByDeal,
			{
				dealId: seeded.dealAId,
				status: "failed",
				limit: 10,
			}
		);

		expect(rows.map((row) => row._id)).toEqual([t4, t2, t1]);
	});

	it("getTransferTimeline returns transfer, audit entries, and cash ledger entries in timestamp order", async () => {
		const t = createHarness();
		const auth = asPaymentUser(t);
		const seeded = await seedCoreEntities(t);

		const transferId = await insertTransfer(t, {
			status: "confirmed",
			counterpartyId: `${seeded.borrowerId}`,
			dealId: seeded.dealAId,
			idempotencyKey: "timeline-transfer",
			createdAt: 1000,
			lastTransitionAt: 1000,
		});

		await insertAuditTimelineEntry(t, {
			transferId,
			eventType: "PROVIDER_INITIATED",
			previousState: "initiated",
			newState: "pending",
			timestamp: 100,
		});
		await insertAuditTimelineEntry(t, {
			transferId,
			eventType: "FUNDS_SETTLED",
			previousState: "pending",
			newState: "confirmed",
			timestamp: 300,
		});

		const debitAccountId = await insertCashAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
		});
		const creditAccountId = await insertCashAccount(t, {
			family: "CASH_CLEARING",
			mortgageId: seeded.mortgageId,
		});
		await insertCashTimelineEntry(t, {
			debitAccountId,
			creditAccountId,
			transferId,
			sequenceNumber: 1n,
			timestamp: 200,
		});

		const result = await auth.query(
			api.payments.transfers.queries.getTransferTimeline,
			{ transferId }
		);

		expect(result).not.toBeNull();
		expect(result?.transfer._id).toBe(transferId);
		expect(result?.auditJournalEntries).toHaveLength(2);
		expect(result?.cashLedgerEntries).toHaveLength(1);
		expect(
			result?.timeline.map((entry) => ({
				source: entry.source,
				eventType: entry.eventType,
				timestamp: entry.timestamp,
			}))
		).toEqual([
			{
				source: "audit_journal",
				eventType: "PROVIDER_INITIATED",
				timestamp: 100,
			},
			{ source: "cash_ledger", eventType: "CASH_RECEIVED", timestamp: 200 },
			{ source: "audit_journal", eventType: "FUNDS_SETTLED", timestamp: 300 },
		]);
	});
});
