import { adminMutation } from "../fluent";
import { initializeWorldAccount } from "./accounts";
import { initializeSequenceCounterInternal } from "./sequenceCounter";

/**
 * System bootstrap mutation: initializes both ledger singletons.
 * - WORLD account (source-of-funds root)
 * - Sequence counter (gap-free journal numbering)
 *
 * Idempotent — safe to call multiple times, no duplicates created.
 * Must run before any ledger operations (mintMortgage, issueShares, etc.).
 */
export const bootstrapLedger = adminMutation
	.input({})
	.handler(async (ctx) => {
		const worldAccount = await initializeWorldAccount(ctx);
		const sequenceCounterId = await initializeSequenceCounterInternal(ctx);

		return {
			worldAccountId: worldAccount._id,
			sequenceCounterId,
		};
	})
	.public();
