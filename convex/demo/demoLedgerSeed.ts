import type { MutationCtx } from "../_generated/server";
import {
	getOrCreatePositionAccount,
	initializeWorldAccount,
} from "../ledger/accounts";
import { TOTAL_SUPPLY } from "../ledger/constants";
import { postEntry } from "../ledger/postEntry";
import { initializeSequenceCounterInternal } from "../ledger/sequenceCounter";
import type { EventSource } from "../ledger/types";

export const DEMO_LEDGER_PREFIX = "prod-mtg-";

export const DEMO_LEDGER_MORTGAGES = [
	{
		ledgerMortgageId: "prod-mtg-greenfield",
		label: "123 Greenfield Rd — Residential",
		propertyType: "residential",
		allocations: [
			{ lenderId: "lender-alice", amount: 5000 },
			{ lenderId: "lender-bob", amount: 3000 },
			{ lenderId: "lender-charlie", amount: 2000 },
		],
	},
	{
		ledgerMortgageId: "prod-mtg-riverside",
		label: "456 Riverside Dr — Commercial",
		propertyType: "commercial",
		allocations: [
			{ lenderId: "lender-alice", amount: 4000 },
			{ lenderId: "lender-dave", amount: 6000 },
		],
	},
	{
		ledgerMortgageId: "prod-mtg-oakwood",
		label: "789 Oakwood Ave — Mixed Use",
		propertyType: "multi_unit",
		allocations: [
			{ lenderId: "lender-bob", amount: 5000 },
			{ lenderId: "lender-eve", amount: 5000 },
		],
	},
] as const;

const DEMO_LEDGER_SOURCE: EventSource = {
	type: "system",
	channel: "simulation",
};

function todayISO(): string {
	return new Date().toISOString().split("T")[0];
}

export function getDemoMortgageLabel(ledgerMortgageId: string): string {
	return (
		DEMO_LEDGER_MORTGAGES.find(
			(mortgage) => mortgage.ledgerMortgageId === ledgerMortgageId
		)?.label ?? ledgerMortgageId
	);
}

export async function ensureDemoLedgerSeeded(
	ctx: MutationCtx
): Promise<{ seeded: boolean }> {
	const existingTreasuries = await Promise.all(
		DEMO_LEDGER_MORTGAGES.map((mortgage) =>
			ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", mortgage.ledgerMortgageId)
				)
				.first()
		)
	);

	const existingCount = existingTreasuries.filter(Boolean).length;
	if (existingCount === DEMO_LEDGER_MORTGAGES.length) {
		return { seeded: false };
	}
	if (existingCount > 0) {
		throw new Error(
			"Demo ledger accounts are partially seeded. Clean them up before reseeding."
		);
	}

	await initializeSequenceCounterInternal(ctx);
	const worldAccount = await initializeWorldAccount(ctx);
	const effectiveDate = todayISO();

	for (const mortgage of DEMO_LEDGER_MORTGAGES) {
		const treasuryId = await ctx.db.insert("ledger_accounts", {
			type: "TREASURY",
			mortgageId: mortgage.ledgerMortgageId,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: Date.now(),
		});

		const mintEntry = await postEntry(ctx, {
			entryType: "MORTGAGE_MINTED",
			mortgageId: mortgage.ledgerMortgageId,
			debitAccountId: treasuryId,
			creditAccountId: worldAccount._id,
			amount: Number(TOTAL_SUPPLY),
			effectiveDate,
			idempotencyKey: `demo-ledger-mint-${mortgage.ledgerMortgageId}`,
			source: DEMO_LEDGER_SOURCE,
			metadata: { demo: true, source: "demo-ledger-seed" },
		});

		for (const allocation of mortgage.allocations) {
			const position = await getOrCreatePositionAccount(
				ctx,
				mortgage.ledgerMortgageId,
				allocation.lenderId
			);

			await postEntry(ctx, {
				entryType: "SHARES_ISSUED",
				mortgageId: mortgage.ledgerMortgageId,
				debitAccountId: position._id,
				creditAccountId: treasuryId,
				amount: allocation.amount,
				effectiveDate,
				idempotencyKey: `demo-ledger-issue-${mortgage.ledgerMortgageId}-${allocation.lenderId}`,
				source: DEMO_LEDGER_SOURCE,
				causedBy: mintEntry._id,
				metadata: { demo: true, source: "demo-ledger-seed" },
			});
		}
	}

	return { seeded: true };
}
