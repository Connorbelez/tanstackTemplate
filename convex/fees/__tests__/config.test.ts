import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import {
	createTestConvex,
	ensureSeededIdentity,
} from "../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN } from "../../../src/test/auth/identities";
import type { Id } from "../../_generated/dataModel";

const OVERLAPPING_FEE_PATTERN = /Overlapping active mortgage fee/i;

const createFeeTemplateRef = makeFunctionReference<
	"mutation",
	{
		name: string;
		description?: string;
		code: "servicing" | "late_fee" | "nsf";
		surface: "waterfall_deduction" | "borrower_charge";
		revenueDestination:
			| "platform_revenue"
			| "investor_distribution"
			| "outside_dispersal";
		calculationType: "annual_rate_principal" | "fixed_amount_cents";
		parameters: {
			annualRate?: number;
			fixedAmountCents?: number;
			dueDays?: number;
			graceDays?: number;
		};
		status: "active" | "inactive";
	},
	Id<"feeTemplates">
>("fees/config:createFeeTemplate");

const updateFeeTemplateRef = makeFunctionReference<
	"mutation",
	{
		id: Id<"feeTemplates">;
		name: string;
		description?: string;
		code: "servicing" | "late_fee" | "nsf";
		surface: "waterfall_deduction" | "borrower_charge";
		revenueDestination:
			| "platform_revenue"
			| "investor_distribution"
			| "outside_dispersal";
		calculationType: "annual_rate_principal" | "fixed_amount_cents";
		parameters: {
			annualRate?: number;
			fixedAmountCents?: number;
			dueDays?: number;
			graceDays?: number;
		};
		status: "active" | "inactive";
	},
	Id<"feeTemplates">
>("fees/config:updateFeeTemplate");

const createFeeSetTemplateRef = makeFunctionReference<
	"mutation",
	{
		name: string;
		description?: string;
		status: "active" | "inactive";
		items: Array<{ feeTemplateId: Id<"feeTemplates">; sortOrder: number }>;
	},
	Id<"feeSetTemplates">
>("fees/config:createFeeSetTemplate");

const attachFeeTemplateToMortgageRef = makeFunctionReference<
	"mutation",
	{
		mortgageId: Id<"mortgages">;
		feeTemplateId: Id<"feeTemplates">;
		effectiveFrom?: string;
		effectiveTo?: string;
	},
	Id<"mortgageFees">
>("fees/config:attachFeeTemplateToMortgage");

const attachFeeSetTemplateToMortgageRef = makeFunctionReference<
	"mutation",
	{
		mortgageId: Id<"mortgages">;
		feeSetTemplateId: Id<"feeSetTemplates">;
		effectiveFrom?: string;
		effectiveTo?: string;
	},
	Id<"mortgageFees">[]
>("fees/config:attachFeeSetTemplateToMortgage");

const listMortgageFeesRef = makeFunctionReference<
	"query",
	{ mortgageId: Id<"mortgages"> },
	Array<{
		_id: Id<"mortgageFees">;
		code: "servicing" | "late_fee" | "nsf";
		surface: "waterfall_deduction" | "borrower_charge";
		parameters: {
			annualRate?: number;
			fixedAmountCents?: number;
			dueDays?: number;
			graceDays?: number;
		};
	}>
>("fees/queries:listMortgageFees");

async function seedMortgageDoc(t: ReturnType<typeof createTestConvex>) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const brokerUserId = await ctx.db.insert("users", {
			authId: `fee-test-broker-${now}`,
			email: `broker-${now}@test.com`,
			firstName: "Fee",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			userId: brokerUserId,
			status: "active",
			createdAt: now,
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: `100 Fee Test Way ${now}`,
			city: "Toronto",
			province: "ON",
			postalCode: "M5V1A1",
			propertyType: "residential",
			createdAt: now,
		});

		return await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: 0.01,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2026-12-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});
	});
}

describe("mortgage fee configuration", () => {
	it("attaches a fee set to a mortgage as immutable snapshots", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const asAdmin = t.withIdentity(FAIRLEND_ADMIN);
		const mortgageId = await seedMortgageDoc(t);

		const servicingTemplateId = await asAdmin.mutation(createFeeTemplateRef, {
			name: "Servicing",
			code: "servicing",
			surface: "waterfall_deduction",
			revenueDestination: "platform_revenue",
			calculationType: "annual_rate_principal",
			parameters: { annualRate: 0.0125 },
			status: "active",
		});
		const lateFeeTemplateId = await asAdmin.mutation(createFeeTemplateRef, {
			name: "Late Fee",
			code: "late_fee",
			surface: "borrower_charge",
			revenueDestination: "platform_revenue",
			calculationType: "fixed_amount_cents",
			parameters: { fixedAmountCents: 6500, dueDays: 30, graceDays: 45 },
			status: "active",
		});
		const feeSetTemplateId = await asAdmin.mutation(createFeeSetTemplateRef, {
			name: "Custom Fee Set",
			status: "active",
			items: [
				{ feeTemplateId: servicingTemplateId, sortOrder: 10 },
				{ feeTemplateId: lateFeeTemplateId, sortOrder: 20 },
			],
		});

		const attachedIds = await asAdmin.mutation(
			attachFeeSetTemplateToMortgageRef,
			{
				mortgageId,
				feeSetTemplateId,
				effectiveFrom: "2026-01-01",
			}
		);
		expect(attachedIds).toHaveLength(2);

		const mortgageFees = await asAdmin.query(listMortgageFeesRef, {
			mortgageId,
		});
		expect(mortgageFees).toHaveLength(2);
		expect(
			mortgageFees.find((fee) => fee.code === "servicing")?.parameters
				.annualRate
		).toBe(0.0125);
		expect(
			mortgageFees.find((fee) => fee.code === "late_fee")?.parameters
				.fixedAmountCents
		).toBe(6500);

		await asAdmin.mutation(updateFeeTemplateRef, {
			id: lateFeeTemplateId,
			name: "Late Fee Updated",
			code: "late_fee",
			surface: "borrower_charge",
			revenueDestination: "platform_revenue",
			calculationType: "fixed_amount_cents",
			parameters: { fixedAmountCents: 9000, dueDays: 30, graceDays: 45 },
			status: "active",
		});

		const updatedMortgageFees = await asAdmin.query(listMortgageFeesRef, {
			mortgageId,
		});
		expect(
			updatedMortgageFees.find((fee) => fee.code === "late_fee")?.parameters
				.fixedAmountCents
		).toBe(6500);
	});

	it("rejects overlapping active mortgage fees for the same code and surface", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const asAdmin = t.withIdentity(FAIRLEND_ADMIN);
		const mortgageId = await seedMortgageDoc(t);

		const servicingTemplateId = await asAdmin.mutation(createFeeTemplateRef, {
			name: "Servicing",
			code: "servicing",
			surface: "waterfall_deduction",
			revenueDestination: "platform_revenue",
			calculationType: "annual_rate_principal",
			parameters: { annualRate: 0.01 },
			status: "active",
		});

		await asAdmin.mutation(attachFeeTemplateToMortgageRef, {
			mortgageId,
			feeTemplateId: servicingTemplateId,
			effectiveFrom: "2026-01-01",
		});

		await expect(
			asAdmin.mutation(attachFeeTemplateToMortgageRef, {
				mortgageId,
				feeTemplateId: servicingTemplateId,
				effectiveFrom: "2026-01-15",
			})
		).rejects.toThrow(OVERLAPPING_FEE_PATTERN);
	});
});
