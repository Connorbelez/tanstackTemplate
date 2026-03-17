import { adminMutation } from "../fluent";
import { initializeWorldAccount } from "./accounts";
import { initializeSequenceCounterInternal } from "./sequenceCounter";

/**
 * System bootstrap mutation: initializes both ledger singletons.
 * - WORLD account (source-of-funds root)
 * - Sequence counter (gap-free journal numbering)
 *
 * Idempotent — safe to call multiple times. Each init function uses a
 * check-then-insert pattern (query for existing → insert if absent) which
 * relies on Convex's serialized transactions (OCC) to prevent duplicate
 * creation. Concurrent calls that read the same rows will be retried by
 * the runtime, so at most one insert succeeds per singleton.
 *
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
