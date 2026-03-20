import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { attachDefaultFeeSetToMortgage } from "../fees/resolver";
import { adminMutation } from "../fluent";
import {
	addMonthsToDateString,
	ensureMortgageBorrowerLink,
	findMortgageByPropertyId,
	findPropertyByAddress,
	resolveBorrowerIds,
	resolveBrokerIds,
	SEED_SOURCE,
	seedTimestamp,
	writeCreationJournalEntry,
} from "./seedHelpers";

interface MortgageSeedFixture {
	mortgage: {
		amortizationMonths: number;
		annualServicingRate?: number;
		assignedBrokerOffset?: number;
		firstPaymentDate: string;
		interestRate: number;
		lienPosition: number;
		loanType: Doc<"mortgages">["loanType"];
		paymentAmount: number;
		paymentFrequency: Doc<"mortgages">["paymentFrequency"];
		principal: number;
		rateType: Doc<"mortgages">["rateType"];
		termMonths: number;
	};
	property: {
		city: string;
		postalCode: string;
		propertyType: Doc<"properties">["propertyType"];
		streetAddress: string;
		unit?: string;
	};
}

interface SeededMortgageBorrowerLink {
	borrowerId: Id<"borrowers">;
	mortgageId: Id<"mortgages">;
}

const MORTGAGE_FIXTURES: readonly MortgageSeedFixture[] = [
	{
		property: {
			streetAddress: "260 Wellington St W",
			unit: "1801",
			city: "Toronto",
			postalCode: "M5V3P6",
			propertyType: "condo",
		},
		mortgage: {
			principal: 68_000_000,
			interestRate: 0.0695,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 300,
			paymentAmount: 512_400,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: 0.01,
			firstPaymentDate: "2026-02-01",
		},
	},
	{
		property: {
			streetAddress: "44 Front St E",
			city: "Toronto",
			postalCode: "M5E1G2",
			propertyType: "commercial",
		},
		mortgage: {
			principal: 95_000_000,
			interestRate: 0.081,
			rateType: "variable",
			termMonths: 18,
			amortizationMonths: 240,
			paymentAmount: 798_500,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: 0.0125,
			firstPaymentDate: "2026-01-15",
			assignedBrokerOffset: 1,
		},
	},
	{
		property: {
			streetAddress: "12 Garden Ave",
			city: "Mississauga",
			postalCode: "L5B4N2",
			propertyType: "residential",
		},
		mortgage: {
			principal: 44_000_000,
			interestRate: 0.065,
			rateType: "fixed",
			termMonths: 24,
			amortizationMonths: 300,
			paymentAmount: 342_200,
			paymentFrequency: "bi_weekly",
			loanType: "insured",
			lienPosition: 1,
			firstPaymentDate: "2026-03-01",
		},
	},
	{
		property: {
			streetAddress: "308 King William St",
			city: "Hamilton",
			postalCode: "L8R1B2",
			propertyType: "multi_unit",
		},
		mortgage: {
			principal: 122_000_000,
			interestRate: 0.0975,
			rateType: "fixed",
			termMonths: 30,
			amortizationMonths: 300,
			paymentAmount: 1_056_300,
			paymentFrequency: "monthly",
			loanType: "high_ratio",
			lienPosition: 2,
			annualServicingRate: 0.015,
			firstPaymentDate: "2026-02-15",
			assignedBrokerOffset: 1,
		},
	},
	{
		property: {
			streetAddress: "18 Maple Grove Rd",
			city: "Oakville",
			postalCode: "L6J5N1",
			propertyType: "residential",
		},
		mortgage: {
			principal: 57_500_000,
			interestRate: 0.0725,
			rateType: "variable",
			termMonths: 36,
			amortizationMonths: 300,
			paymentAmount: 271_900,
			paymentFrequency: "weekly",
			loanType: "conventional",
			lienPosition: 1,
			firstPaymentDate: "2026-04-01",
		},
	},
];

export const seedMortgage = adminMutation
	.input({
		borrowerIds: v.optional(v.array(v.id("borrowers"))),
		brokerIds: v.optional(v.array(v.id("brokers"))),
	})
	.handler(async (ctx, args) => {
		const borrowerPool = await resolveBorrowerIds(ctx, args.borrowerIds);
		const brokerPool = await resolveBrokerIds(ctx, args.brokerIds);

		if (borrowerPool.length === 0 || brokerPool.length === 0) {
			throw new ConvexError(
				"Borrowers and brokers are required before seeding mortgages."
			);
		}

		const mortgageIds: Id<"mortgages">[] = [];
		const mortgageBorrowers: SeededMortgageBorrowerLink[] = [];
		let createdMortgages = 0;
		let createdProperties = 0;
		let createdLinks = 0;
		let reusedMortgages = 0;
		let reusedProperties = 0;
		let reusedLinks = 0;

		for (let index = 0; index < MORTGAGE_FIXTURES.length; index += 1) {
			const fixture = MORTGAGE_FIXTURES[index];
			const borrowerId = borrowerPool[index % borrowerPool.length];
			const brokerOfRecordId = brokerPool[index % brokerPool.length];
			const assignedBrokerId =
				fixture.mortgage.assignedBrokerOffset === undefined
					? undefined
					: brokerPool[
							(index + fixture.mortgage.assignedBrokerOffset) %
								brokerPool.length
						];

			const existingProperty = await findPropertyByAddress(
				ctx,
				fixture.property
			);
			const propertyId =
				existingProperty?._id ??
				(await ctx.db.insert("properties", {
					...fixture.property,
					province: "ON",
					createdAt: seedTimestamp(21_600_000 + index * 4_500_000),
				}));

			if (existingProperty) {
				reusedProperties += 1;
			} else {
				createdProperties += 1;
			}

			const existingMortgage = await findMortgageByPropertyId(ctx, propertyId);
			const createdAt = seedTimestamp(25_200_000 + index * 4_500_000);
			const maturityDate = addMonthsToDateString(
				fixture.mortgage.firstPaymentDate,
				fixture.mortgage.termMonths
			);
			const mortgageId =
				existingMortgage?._id ??
				(await ctx.db.insert("mortgages", {
					status: "active",
					machineContext: {
						lastPaymentAt: 0,
						missedPayments: 0,
					},
					lastTransitionAt: createdAt,
					propertyId,
					principal: fixture.mortgage.principal,
					interestRate: fixture.mortgage.interestRate,
					rateType: fixture.mortgage.rateType,
					termMonths: fixture.mortgage.termMonths,
					amortizationMonths: fixture.mortgage.amortizationMonths,
					paymentAmount: fixture.mortgage.paymentAmount,
					paymentFrequency: fixture.mortgage.paymentFrequency,
					loanType: fixture.mortgage.loanType,
					lienPosition: fixture.mortgage.lienPosition,
					annualServicingRate: fixture.mortgage.annualServicingRate,
					interestAdjustmentDate: fixture.mortgage.firstPaymentDate,
					termStartDate: fixture.mortgage.firstPaymentDate,
					maturityDate,
					firstPaymentDate: fixture.mortgage.firstPaymentDate,
					brokerOfRecordId,
					assignedBrokerId,
					fundedAt: createdAt + 86_400_000,
					createdAt,
				}));

			if (existingMortgage) {
				await attachDefaultFeeSetToMortgage(
					ctx.db,
					existingMortgage._id,
					existingMortgage.annualServicingRate
				);
				reusedMortgages += 1;
			} else {
				await writeCreationJournalEntry(ctx, {
					entityType: "mortgage",
					entityId: mortgageId,
					initialState: "active",
					source: SEED_SOURCE,
					timestamp: createdAt,
					payload: {
						propertyId,
						borrowerId,
						brokerOfRecordId,
						paymentAmount: fixture.mortgage.paymentAmount,
					},
				});
				createdMortgages += 1;

				const seededMortgage = await ctx.db.get(mortgageId);
				if (seededMortgage) {
					await attachDefaultFeeSetToMortgage(
						ctx.db,
						mortgageId,
						seededMortgage.annualServicingRate
					);
				}
			}

			const { wasCreated: linkCreated } = await ensureMortgageBorrowerLink(
				ctx,
				{
					mortgageId,
					borrowerId,
					role: "primary",
					addedAt: createdAt + 60_000,
				}
			);
			if (linkCreated) {
				createdLinks += 1;
			} else {
				reusedLinks += 1;
			}

			mortgageIds.push(mortgageId);
			mortgageBorrowers.push({ mortgageId, borrowerId });
		}

		return {
			mortgageIds,
			mortgageBorrowers,
			created: {
				mortgages: createdMortgages,
				properties: createdProperties,
				mortgageBorrowers: createdLinks,
			},
			reused: {
				mortgages: reusedMortgages,
				properties: reusedProperties,
				mortgageBorrowers: reusedLinks,
			},
		};
	})
	.public();
