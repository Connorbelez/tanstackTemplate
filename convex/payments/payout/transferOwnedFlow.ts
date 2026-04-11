import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { CommandSource } from "../../engine/types";
import type { ManualSettlementDetails } from "../transfers/interface";
import type { ProviderCode } from "../transfers/types";

export interface TransferOwnedPayoutFailure {
	dispersalEntryId: string;
	error: string;
	mortgageId: string;
}

interface TransferOwnedPayoutCtx
	extends Pick<ActionCtx, "runAction" | "runMutation" | "runQuery"> {}

function buildManualSettlement(args: {
	entry: Doc<"dispersalEntries">;
	occurredAt: number;
	source: CommandSource;
}): ManualSettlementDetails {
	return {
		enteredBy: args.source.actorId ?? "system",
		externalReference: `dispersal:${args.entry._id}:transfer-owned`,
		instrumentType: "journal",
		location: args.source.channel,
		settlementOccurredAt: args.occurredAt,
	};
}

export async function executeTransferOwnedPayout(args: {
	confirmSettlement: boolean;
	ctx: TransferOwnedPayoutCtx;
	entry: Doc<"dispersalEntries">;
	providerCode: ProviderCode;
	source: CommandSource;
}): Promise<{
	amount: number;
	confirmed: boolean;
	created: boolean;
	transferId: Id<"transferRequests">;
}> {
	const { transferId, created } = await args.ctx.runMutation(
		internal.dispersal.disbursementBridge.processSingleDisbursement,
		{
			dispersalEntryId: args.entry._id,
			providerCode: args.providerCode,
		}
	);

	await args.ctx.runAction(
		internal.payments.transfers.mutations.initiateTransferInternal,
		{
			transferId,
		}
	);

	let transfer = await args.ctx.runQuery(
		internal.payments.transfers.queries.getTransferInternal,
		{ transferId }
	);
	if (!transfer) {
		throw new ConvexError(
			`Transfer request ${transferId} not found after initiation`
		);
	}

	if (
		args.confirmSettlement &&
		transfer.status !== "confirmed" &&
		(transfer.providerCode === "manual" ||
			transfer.providerCode === "manual_review")
	) {
		const occurredAt = Date.now();
		await args.ctx.runMutation(
			internal.payments.transfers.mutations.confirmManualTransferInternal,
			{
				manualSettlement: buildManualSettlement({
					entry: args.entry,
					occurredAt,
					source: args.source,
				}),
				source: args.source,
				transferId,
			}
		);

		transfer = await args.ctx.runQuery(
			internal.payments.transfers.queries.getTransferInternal,
			{ transferId }
		);
		if (!transfer) {
			throw new ConvexError(
				`Transfer request ${transferId} not found after manual confirmation`
			);
		}
	}

	return {
		amount: args.entry.amount,
		confirmed: transfer.status === "confirmed",
		created,
		transferId,
	};
}
