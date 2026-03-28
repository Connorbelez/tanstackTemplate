import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import workflowSchema from "../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import auditTrailSchema from "../../components/auditTrail/schema";
import schema from "../../schema";
import { createDispersalEntries } from "../createDispersalEntries";

const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);
const workflowModules = import.meta.glob(
	"/node_modules/@convex-dev/workflow/dist/component/**/*.js"
);
const workpoolModules = import.meta.glob(
	"/node_modules/@convex-dev/workpool/dist/component/**/*.js"
);

const DEFAULT_SOURCE = { type: "system" as const, channel: "test" };
const NO_ACTIVE_POSITIONS_PATTERN = /no active positions for mortgage/i;

type TestHarness = ReturnType<typeof createHarness>;

type CreateDispersalEntriesResult = Awaited<
	ReturnType<CreateDispersalEntriesHandler["_handler"]>
>;

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: typeof DEFAULT_SOURCE;
		}
	) => Promise<{
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
	}>;
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;

function createHarness() {
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

async function seedDispersalScenario(
	t: TestHarness,
	options?: {
		positionUnits?: [number, number] | [];
		includeReroute?: boolean;
		paymentFrequency?: Doc<"mortgages">["paymentFrequency"];
		settledDate?: string;
	}
) {
	const positionUnits = options?.positionUnits ?? [6000, 4000];
	const paymentFrequency = options?.paymentFrequency ?? "monthly";
	const settledDate = options?.settledDate ?? "2026-03-01";

	return t.run(async (ctx) => {
		const now = Date.now();

		const brokerUserId = await ctx.db.insert("users", {
			authId: "broker-auth",
			email: "broker@test.com",
			firstName: "Broker",
			lastName: "Tester",
		});
		const borrowerUserId = await ctx.db.insert("users", {
			authId: "borrower-auth",
			email: "borrower@test.com",
			firstName: "Borrower",
			lastName: "Tester",
		});
		const lenderOneUserId = await ctx.db.insert("users", {
			authId: "lender-auth-1",
			email: "lender-one@test.com",
			firstName: "Lender",
			lastName: "One",
		});
		const lenderTwoUserId = await ctx.db.insert("users", {
			authId: "lender-auth-2",
			email: "lender-two@test.com",
			firstName: "Lender",
			lastName: "Two",
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: now,
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});
		const lenderOneId = await ctx.db.insert("lenders", {
			userId: lenderOneUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-one",
			status: "active",
			createdAt: now,
		});
		const lenderTwoId = await ctx.db.insert("lenders", {
			userId: lenderTwoUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-two",
			status: "active",
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
			paymentFrequency,
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2026-12-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});

		const obligationId = await ctx.db.insert("obligations", {
			status: "settled",
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 100_000,
			amountSettled: 100_000,
			dueDate: Date.parse(`${settledDate}T00:00:00Z`),
			gracePeriodEnd: Date.parse(`${settledDate}T00:00:00Z`),
			settledAt: Date.parse(`${settledDate}T00:00:00Z`),
			createdAt: now,
		});

		const lenderAccountIds: Id<"ledger_accounts">[] = [];
		const lenderAuthIds = ["lender-auth-1", "lender-auth-2"] as const;

		for (const [index, units] of positionUnits.entries()) {
			const accountId = await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId,
				lenderId: lenderAuthIds[index],
				cumulativeDebits: BigInt(units),
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 0n,
				createdAt: now,
			});
			lenderAccountIds.push(accountId);
		}

		if (options?.includeReroute) {
			const dealId = await ctx.db.insert("deals", {
				status: "confirmed",
				mortgageId,
				buyerId: "lender-auth-2",
				sellerId: "lender-auth-1",
				fractionalShare: 3000,
				closingDate: Date.parse(`${settledDate}T00:00:00Z`),
				lawyerId: "test-lawyer",
				lawyerType: "platform_lawyer",
				createdAt: now,
				createdBy: "test-admin",
			});
			await ctx.db.insert("dealReroutes", {
				dealId,
				mortgageId,
				fromOwnerId: "lender-auth-1",
				toOwnerId: "lender-auth-2",
				fractionalShare: 3000,
				effectiveAfterDate: settledDate,
				createdAt: now,
			});
		}

		return {
			obligationId,
			mortgageId,
			lenderOneId,
			lenderTwoId,
			lenderAccountIds,
		};
	});
}

async function runCreateDispersal(
	t: TestHarness,
	args: {
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledAmount: number;
		settledDate: string;
		idempotencyKey: string;
	}
): Promise<CreateDispersalEntriesResult> {
	return t.run(async (ctx) =>
		createDispersalEntriesMutation._handler(ctx, {
			...args,
			source: DEFAULT_SOURCE,
		})
	);
}

describe("createDispersalEntries", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = createHarness();
	});

	it("creates servicing fee and pro-rata dispersal entries in cents", async () => {
		const seeded = await seedDispersalScenario(t);

		const result = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:happy-path",
		});

		expect(result.created).toBe(true);
		expect(result.entries).toHaveLength(2);
		expect(result.servicingFeeEntryId).toBeTruthy();
		expect(result.entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(
			91_667
		);

		const byLender = new Map(
			result.entries.map((entry) => [entry.lenderId, entry] as const)
		);

		expect(byLender.get(seeded.lenderOneId)?.amount).toBe(55_000);
		expect(byLender.get(seeded.lenderOneId)?.rawAmount).toBeCloseTo(
			55_000.2,
			8
		);
		expect(byLender.get(seeded.lenderTwoId)?.amount).toBe(36_667);
		expect(byLender.get(seeded.lenderTwoId)?.rawAmount).toBeCloseTo(
			36_666.8,
			8
		);

		const persistedEntries = (
			await t.run(async (ctx) =>
				Promise.all(result.entries.map((entry) => ctx.db.get(entry.id)))
			)
		).filter((entry) => entry !== null);
		const feeEntry = await t.run(async (ctx) =>
			result.servicingFeeEntryId ? ctx.db.get(result.servicingFeeEntryId) : null
		);

		expect(persistedEntries).toHaveLength(2);
		expect(feeEntry?.amount).toBe(8333);
		expect(feeEntry?.feeDue).toBe(8333);
		expect(feeEntry?.feeCashApplied).toBe(8333);
		expect(feeEntry?.feeReceivable).toBe(0);
		expect(feeEntry?.annualRate).toBe(0.01);
		expect(feeEntry?.principalBalance).toBe(10_000_000);
		expect(feeEntry?.feeCode).toBe("servicing");
		expect(
			persistedEntries.every((entry) => entry.servicingFeeDeducted === 0)
		).toBe(true);
		expect(
			persistedEntries.reduce(
				(sum, entry) => sum + entry.servicingFeeDeducted,
				0
			)
		).toBe(0);

		const persistedByLender = new Map(
			persistedEntries.map((entry) => [entry.lenderId, entry] as const)
		);
		expect(
			persistedByLender.get(seeded.lenderOneId)?.calculationDetails
				.ownershipUnits
		).toBe(6000);
		expect(
			persistedByLender.get(seeded.lenderTwoId)?.calculationDetails
				.ownershipUnits
		).toBe(4000);
	});

	it("uses mortgage payment frequency when calculating bi-weekly servicing fees", async () => {
		const seeded = await seedDispersalScenario(t, {
			paymentFrequency: "bi_weekly",
		});

		const result = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:bi-weekly-fee",
		});

		const feeEntry = await t.run(async (ctx) =>
			result.servicingFeeEntryId ? ctx.db.get(result.servicingFeeEntryId) : null
		);

		expect(feeEntry?.amount).toBe(3846);
		expect(result.entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(
			96_154
		);
	});

	it("applies deal reroutes before calculating ownership shares", async () => {
		const seeded = await seedDispersalScenario(t, {
			positionUnits: [7000, 3000],
			includeReroute: true,
			settledDate: "2026-03-15",
		});

		const result = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-15",
			idempotencyKey: "dispersal:test:reroute",
		});

		const byLender = new Map(
			result.entries.map((entry) => [entry.lenderId, entry] as const)
		);

		expect(byLender.get(seeded.lenderOneId)?.amount).toBe(36_667);
		expect(byLender.get(seeded.lenderTwoId)?.amount).toBe(55_000);

		const persistedEntries = (
			await t.run(async (ctx) =>
				Promise.all(result.entries.map((entry) => ctx.db.get(entry.id)))
			)
		).filter((entry) => entry !== null);
		const persistedByLender = new Map(
			persistedEntries.map((entry) => [entry.lenderId, entry] as const)
		);

		expect(
			persistedByLender.get(seeded.lenderOneId)?.calculationDetails
				.ownershipUnits
		).toBe(4000);
		expect(
			persistedByLender.get(seeded.lenderTwoId)?.calculationDetails
				.ownershipUnits
		).toBe(6000);
	});

	it("returns existing entries on repeated calls for the same obligation", async () => {
		const seeded = await seedDispersalScenario(t);

		const first = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:idempotent",
		});
		const second = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:idempotent:retry",
		});

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.servicingFeeEntryId).toBe(first.servicingFeeEntryId);
		expect(second.entries.map((entry) => String(entry.id)).sort()).toEqual(
			first.entries.map((entry) => String(entry.id)).sort()
		);
	});

	it("fails when the mortgage has no positive position accounts", async () => {
		const seeded = await seedDispersalScenario(t, { positionUnits: [] });

		await expect(
			runCreateDispersal(t, {
				obligationId: seeded.obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "dispersal:test:no-positions",
			})
		).rejects.toThrow(NO_ACTIVE_POSITIONS_PATTERN);
	});

	it("computes lower servicing fee when mortgage principal decreases (ENG-217)", async () => {
		const seeded = await seedDispersalScenario(t);

		// First dispersal at default principal (10_000_000 cents = $100k)
		const firstResult = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:principal-sensitivity-1",
		});

		const firstFeeEntry = await t.run(async (ctx) =>
			firstResult.servicingFeeEntryId
				? ctx.db.get(firstResult.servicingFeeEntryId)
				: null
		);

		expect(firstFeeEntry).not.toBeNull();
		expect(firstFeeEntry?.principalBalance).toBe(10_000_000);

		// Reduce mortgage principal to 8_000_000 (simulating principal paydown)
		await t.run(async (ctx) => {
			await ctx.db.patch(seeded.mortgageId, { principal: 8_000_000 });
		});

		// Create a second obligation for the same mortgage
		const secondObligationId = await t.run(async (ctx) => {
			const priorObligation = await ctx.db.get(seeded.obligationId);
			if (!priorObligation) {
				throw new Error("seeded obligation not found");
			}
			return ctx.db.insert("obligations", {
				status: "settled",
				mortgageId: seeded.mortgageId,
				borrowerId: priorObligation.borrowerId,
				paymentNumber: 2,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 100_000,
				dueDate: Date.parse("2026-04-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-04-01T00:00:00Z"),
				settledAt: Date.parse("2026-04-01T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		// Second dispersal at reduced principal (8_000_000 cents = $80k)
		const secondResult = await runCreateDispersal(t, {
			obligationId: secondObligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-04-01",
			idempotencyKey: "dispersal:test:principal-sensitivity-2",
		});

		const secondFeeEntry = await t.run(async (ctx) =>
			secondResult.servicingFeeEntryId
				? ctx.db.get(secondResult.servicingFeeEntryId)
				: null
		);

		expect(secondFeeEntry).not.toBeNull();
		expect(secondFeeEntry?.principalBalance).toBe(8_000_000);

		if (firstFeeEntry === null || secondFeeEntry === null) {
			throw new Error("expected servicing fee entries");
		}
		if (
			firstFeeEntry.feeDue === undefined ||
			secondFeeEntry.feeDue === undefined
		) {
			throw new Error("expected feeDue on servicing fee entries");
		}

		// Fee should decrease proportionally with principal
		expect(secondFeeEntry.feeDue).toBeLessThan(firstFeeEntry.feeDue);

		// Verify exact values: 0.01 * principal / 12
		// First: round(0.01 * 10_000_000 / 12) = round(8333.33) = 8333
		// Second: round(0.01 * 8_000_000 / 12) = round(6666.67) = 6667
		expect(firstFeeEntry.feeDue).toBe(8333);
		expect(secondFeeEntry.feeDue).toBe(6667);
	});

	it("records servicing receivable when the fee exceeds collected cash", async () => {
		const seeded = await seedDispersalScenario(t);

		const first = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 8000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:fee-too-large",
		});

		expect(first.created).toBe(true);
		expect(first.entries).toHaveLength(0);
		expect(first.servicingFeeEntryId).toBeTruthy();

		const feeEntry = await t.run(async (ctx) =>
			first.servicingFeeEntryId ? ctx.db.get(first.servicingFeeEntryId) : null
		);
		expect(feeEntry?.amount).toBe(8000);
		expect(feeEntry?.feeDue).toBe(8333);
		expect(feeEntry?.feeCashApplied).toBe(8000);
		expect(feeEntry?.feeReceivable).toBe(333);

		const persistedEntries = await t.run(async (ctx) =>
			ctx.db
				.query("dispersalEntries")
				.filter((q) => q.eq(q.field("obligationId"), seeded.obligationId))
				.collect()
		);
		expect(persistedEntries).toHaveLength(0);

		const retry = await runCreateDispersal(t, {
			obligationId: seeded.obligationId,
			mortgageId: seeded.mortgageId,
			settledAmount: 8000,
			settledDate: "2026-03-01",
			idempotencyKey: "dispersal:test:fee-too-large:retry",
		});
		expect(retry.created).toBe(false);
		expect(retry.entries).toHaveLength(0);
		expect(retry.servicingFeeEntryId).toBe(first.servicingFeeEntryId);
	});
});
