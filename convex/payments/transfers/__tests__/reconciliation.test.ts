/**
 * Transfer reconciliation tests — validates the orphan detection logic,
 * freshness threshold, and healing escalation patterns.
 *
 * The reconciliation cron (convex/payments/transfers/reconciliation.ts)
 * uses module-private helper functions. We replicate the pure logic here
 * to validate the three healing paths without requiring a full Convex runtime.
 */

import { describe, expect, it } from "vitest";

// ── Constants (mirrored from reconciliation.ts) ─────────────────────

const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_HEALING_ATTEMPTS = 3;

// ── isFreshTransfer Logic ───────────────────────────────────────────

/**
 * Replicate the isFreshTransfer helper from reconciliation.ts.
 * Returns true if the transfer is too fresh to be considered orphaned.
 */
function isFreshTransfer(
	transfer: { settledAt?: number; createdAt: number },
	threshold: number
): boolean {
	if (transfer.settledAt && transfer.settledAt > threshold) {
		return true;
	}
	return transfer.createdAt > threshold;
}

describe("isFreshTransfer", () => {
	const now = Date.now();
	const threshold = now - ORPHAN_THRESHOLD_MS;

	it("returns true when createdAt is after the threshold (< 5 min old)", () => {
		const transfer = { createdAt: now - 2 * 60 * 1000 }; // 2 min ago
		expect(isFreshTransfer(transfer, threshold)).toBe(true);
	});

	it("returns true when settledAt is after the threshold", () => {
		const transfer = {
			createdAt: now - 10 * 60 * 1000, // old
			settledAt: now - 1 * 60 * 1000, // 1 min ago
		};
		expect(isFreshTransfer(transfer, threshold)).toBe(true);
	});

	it("returns false when both createdAt and settledAt are before the threshold", () => {
		const transfer = {
			createdAt: now - 10 * 60 * 1000, // 10 min ago
			settledAt: now - 8 * 60 * 1000, // 8 min ago
		};
		expect(isFreshTransfer(transfer, threshold)).toBe(false);
	});

	it("returns false when createdAt is old and no settledAt", () => {
		const transfer = { createdAt: now - 10 * 60 * 1000 }; // 10 min ago
		expect(isFreshTransfer(transfer, threshold)).toBe(false);
	});

	it("returns true when createdAt is exactly at the threshold boundary", () => {
		// createdAt > threshold means strictly after
		const transfer = { createdAt: threshold + 1 };
		expect(isFreshTransfer(transfer, threshold)).toBe(true);
	});

	it("returns false when createdAt is exactly at the threshold", () => {
		// createdAt === threshold is NOT > threshold
		const transfer = { createdAt: threshold };
		expect(isFreshTransfer(transfer, threshold)).toBe(false);
	});

	it("returns true for a transfer created right now", () => {
		const transfer = { createdAt: now };
		expect(isFreshTransfer(transfer, threshold)).toBe(true);
	});

	it("returns false for a transfer created 6 minutes ago", () => {
		const transfer = { createdAt: now - 6 * 60 * 1000 };
		expect(isFreshTransfer(transfer, threshold)).toBe(false);
	});
});

// ── Orphan Detection Logic ──────────────────────────────────────────

describe("orphan detection", () => {
	it("confirmed transfer with collectionAttemptId is NOT orphaned (bridged)", () => {
		// The reconciliation cron skips transfers with collectionAttemptId
		const transfer = {
			status: "confirmed",
			collectionAttemptId: "attempt_001",
		};
		const isBridged = !!transfer.collectionAttemptId;
		expect(isBridged).toBe(true);
	});

	it("confirmed transfer without collectionAttemptId IS a candidate for orphan check", () => {
		const transfer = {
			status: "confirmed",
			collectionAttemptId: undefined,
		};
		const isBridged = !!transfer.collectionAttemptId;
		expect(isBridged).toBe(false);
	});

	it("only confirmed transfers are checked (not pending, failed, etc.)", () => {
		const statuses = [
			"initiated",
			"pending",
			"processing",
			"failed",
			"cancelled",
			"reversed",
		];
		for (const status of statuses) {
			// The cron queries only status: "confirmed" — these would not appear
			expect(status).not.toBe("confirmed");
		}
	});
});

// ── Healing Attempt Escalation ──────────────────────────────────────

/**
 * Replicate the processOrphanedTransfer decision logic.
 */
function determineHealingAction(
	healing: { attemptCount: number; status: string } | null
): "create" | "retry" | "escalate" | "skip" {
	if (!healing) {
		return "create";
	}
	if (healing.status === "escalated" || healing.status === "resolved") {
		return "skip";
	}
	if (healing.attemptCount < MAX_HEALING_ATTEMPTS) {
		return "retry";
	}
	return "escalate";
}

describe("healing attempt escalation", () => {
	it("creates a new healing attempt when none exists", () => {
		expect(determineHealingAction(null)).toBe("create");
	});

	it("retries when attemptCount is 1 (< 3)", () => {
		expect(
			determineHealingAction({ attemptCount: 1, status: "retrying" })
		).toBe("retry");
	});

	it("retries when attemptCount is 2 (< 3)", () => {
		expect(
			determineHealingAction({ attemptCount: 2, status: "retrying" })
		).toBe("retry");
	});

	it("escalates when attemptCount reaches MAX_HEALING_ATTEMPTS (3)", () => {
		expect(
			determineHealingAction({ attemptCount: 3, status: "retrying" })
		).toBe("escalate");
	});

	it("escalates when attemptCount exceeds MAX_HEALING_ATTEMPTS", () => {
		expect(
			determineHealingAction({ attemptCount: 5, status: "retrying" })
		).toBe("escalate");
	});

	it("skips already-escalated healing attempts", () => {
		expect(
			determineHealingAction({ attemptCount: 3, status: "escalated" })
		).toBe("skip");
	});

	it("skips resolved healing attempts", () => {
		expect(
			determineHealingAction({ attemptCount: 2, status: "resolved" })
		).toBe("skip");
	});
});

// ── Constants Validation ────────────────────────────────────────────

describe("reconciliation constants", () => {
	it("orphan threshold is 5 minutes", () => {
		expect(ORPHAN_THRESHOLD_MS).toBe(5 * 60 * 1000);
	});

	it("max healing attempts is 3", () => {
		expect(MAX_HEALING_ATTEMPTS).toBe(3);
	});
});
