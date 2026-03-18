/**
 * Shared seeding helpers for engine integration tests.
 *
 * Provides entity creation for mortgages, obligations, and their FK
 * dependencies (properties, broker/borrower profiles) so that tests
 * can exercise the full transition pipeline on non-onboarding entities.
 */

import type { Id } from "../../../../convex/_generated/dataModel";
import type { MortgageMachineContext } from "../../../../convex/engine/machines/mortgage.machine";
import type { EntityType } from "../../../../convex/engine/types";
import type { GovernedTestConvex } from "../onboarding/helpers";
import { ensureSeededIdentity } from "../../auth/helpers";
import { BORROWER, BROKER } from "../../auth/identities";

// ── Property Seeding ────────────────────────────────────────────────

export async function seedProperty(
	t: GovernedTestConvex
): Promise<Id<"properties">> {
	return t.run(async (ctx) =>
		ctx.db.insert("properties", {
			streetAddress: "123 Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 3A8",
			propertyType: "residential",
			createdAt: Date.now(),
		})
	);
}

// ── Broker Profile Seeding ──────────────────────────────────────────

export async function seedBrokerProfile(
	t: GovernedTestConvex
): Promise<Id<"brokers">> {
	const userId = await ensureSeededIdentity(t, BROKER);
	return t.run(async (ctx) => {
		const existing = await ctx.db
			.query("brokers")
			.filter((q) => q.eq(q.field("userId"), userId))
			.first();
		if (existing) return existing._id;
		return ctx.db.insert("brokers", {
			userId,
			status: "active",
			createdAt: Date.now(),
		});
	});
}

// ── Borrower Profile Seeding ────────────────────────────────────────

export async function seedBorrowerProfile(
	t: GovernedTestConvex
): Promise<Id<"borrowers">> {
	const userId = await ensureSeededIdentity(t, BORROWER);
	return t.run(async (ctx) => {
		const existing = await ctx.db
			.query("borrowers")
			.filter((q) => q.eq(q.field("userId"), userId))
			.first();
		if (existing) return existing._id;
		return ctx.db.insert("borrowers", {
			userId,
			status: "active",
			createdAt: Date.now(),
		});
	});
}

// ── Mortgage Seeding ────────────────────────────────────────────────

export async function seedMortgage(
	t: GovernedTestConvex,
	overrides?: {
		status?: string;
		machineContext?: MortgageMachineContext;
		propertyId?: Id<"properties">;
		brokerOfRecordId?: Id<"brokers">;
	}
): Promise<Id<"mortgages">> {
	const propertyId = overrides?.propertyId ?? (await seedProperty(t));
	const brokerOfRecordId =
		overrides?.brokerOfRecordId ?? (await seedBrokerProfile(t));

	return t.run(async (ctx) =>
		ctx.db.insert("mortgages", {
			status: overrides?.status ?? "active",
			machineContext: overrides?.machineContext ?? {
				missedPayments: 0,
				lastPaymentAt: 0,
			},
			lastTransitionAt: Date.now(),
			propertyId,
			principal: 500_000_00, // $500k in cents
			interestRate: 5.5,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 300,
			paymentAmount: 3_000_00,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-15",
			maturityDate: "2027-01-15",
			firstPaymentDate: "2026-02-15",
			brokerOfRecordId,
			createdAt: Date.now(),
		})
	);
}

// ── Obligation Seeding ──────────────────────────────────────────────

export async function seedObligation(
	t: GovernedTestConvex,
	mortgageId: Id<"mortgages">,
	borrowerId: Id<"borrowers">,
	overrides?: { status?: string }
): Promise<Id<"obligations">> {
	return t.run(async (ctx) =>
		ctx.db.insert("obligations", {
			status: overrides?.status ?? "upcoming",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 3_000_00,
			amountSettled: 0,
			dueDate: new Date("2026-02-15T12:00:00.000Z").getTime(),
			gracePeriodEnd: new Date("2026-02-25T12:00:00.000Z").getTime(),
			createdAt: Date.now(),
		})
	);
}

// ── Generic Entity Getter ───────────────────────────────────────────

export async function getEntity<TableName extends string>(
	t: GovernedTestConvex,
	id: Id<TableName>
) {
	return t.run(async (ctx) => ctx.db.get(id));
}

// ── Audit Journal Query (any entity type) ───────────────────────────

export async function getAuditJournalForEntity(
	t: GovernedTestConvex,
	entityType: EntityType,
	entityId: string
) {
	return t.run(async (ctx) =>
		ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", entityType).eq("entityId", entityId)
			)
			.collect()
	);
}
