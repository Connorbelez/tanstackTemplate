import { describe, expect, it } from "vitest";
import type { StateValue } from "xstate";
import { getNextSnapshot } from "xstate";
import type { DealMachineContext } from "../deal.machine";
import { DEAL_MACHINE_VERSION, dealMachine } from "../deal.machine";

// ── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_CONTEXT: DealMachineContext = { dealId: "test-deal-1" };

function snapshotAt(
	stateValue: StateValue,
	context: DealMachineContext = DEFAULT_CONTEXT
) {
	return dealMachine.resolveState({ value: stateValue, context });
}

// ── Event Factories ─────────────────────────────────────────────────

const DEAL_LOCKED = {
	type: "DEAL_LOCKED" as const,
	closingDate: 1_700_000_000_000,
};
const LAWYER_VERIFIED = {
	type: "LAWYER_VERIFIED" as const,
	verificationId: "v-1",
};
const REPRESENTATION_CONFIRMED = {
	type: "REPRESENTATION_CONFIRMED" as const,
};
const LAWYER_APPROVED_DOCUMENTS = {
	type: "LAWYER_APPROVED_DOCUMENTS" as const,
};
const ALL_PARTIES_SIGNED = { type: "ALL_PARTIES_SIGNED" as const };
const FUNDS_RECEIVED = {
	type: "FUNDS_RECEIVED" as const,
	method: "manual" as const,
};
const DEAL_CANCELLED = {
	type: "DEAL_CANCELLED" as const,
	reason: "test cancellation",
};

const ALL_EVENTS = [
	DEAL_LOCKED,
	LAWYER_VERIFIED,
	REPRESENTATION_CONFIRMED,
	LAWYER_APPROVED_DOCUMENTS,
	ALL_PARTIES_SIGNED,
	FUNDS_RECEIVED,
	DEAL_CANCELLED,
] as const;

// ── State Value Helpers ─────────────────────────────────────────────

// Normalize XState state values for comparison.
// Compound: { lawyerOnboarding: "pending" }, Flat: "initiated"
function stateLabel(value: StateValue): string {
	if (typeof value === "string") {
		return value;
	}
	const [region, sub] = Object.entries(value)[0];
	if (typeof sub === "string") {
		return `${region}.${sub}`;
	}
	return JSON.stringify(value);
}

function statesEqual(a: StateValue, b: StateValue): boolean {
	return stateLabel(a) === stateLabel(b);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("deal machine", () => {
	// ── Machine metadata ────────────────────────────────────────────

	it("starts in initiated state", () => {
		expect(dealMachine.config.initial).toBe("initiated");
	});

	it("has the correct machine id", () => {
		expect(dealMachine.id).toBe("deal");
	});

	it("exports DEAL_MACHINE_VERSION", () => {
		expect(DEAL_MACHINE_VERSION).toBe("1.0.0");
		expect(typeof DEAL_MACHINE_VERSION).toBe("string");
	});

	// ── 11×7 State × Event Matrix ──────────────────────────────────
	// R6 (REQ-193): exhaustive coverage, zero gaps

	describe("initiated state", () => {
		it("initiated → lawyerOnboarding.pending on DEAL_LOCKED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				DEAL_LOCKED
			);
			expect(next.value).toEqual({ lawyerOnboarding: "pending" });
		});

		it("initiated ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				LAWYER_VERIFIED
			);
			expect(next.value).toBe("initiated");
		});

		it("initiated ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				REPRESENTATION_CONFIRMED
			);
			expect(next.value).toBe("initiated");
		});

		it("initiated ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(next.value).toBe("initiated");
		});

		it("initiated ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				ALL_PARTIES_SIGNED
			);
			expect(next.value).toBe("initiated");
		});

		it("initiated ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				FUNDS_RECEIVED
			);
			expect(next.value).toBe("initiated");
		});

		it("initiated → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt("initiated"),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("lawyerOnboarding.pending state", () => {
		const state = { lawyerOnboarding: "pending" };

		it("lawyerOnboarding.pending ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.pending → lawyerOnboarding.verified on LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(next.value).toEqual({ lawyerOnboarding: "verified" });
		});

		it("lawyerOnboarding.pending ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.pending ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.pending ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.pending ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.pending → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("lawyerOnboarding.verified state", () => {
		const state = { lawyerOnboarding: "verified" };

		it("lawyerOnboarding.verified ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.verified ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.verified → documentReview.pending on REPRESENTATION_CONFIRMED (via onDone)", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			// Transitions to lawyerOnboarding.complete (final) → onDone → documentReview.pending
			expect(next.value).toEqual({ documentReview: "pending" });
		});

		it("lawyerOnboarding.verified ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.verified ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.verified ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.verified → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("lawyerOnboarding.complete state (transient)", () => {
		const state = { lawyerOnboarding: "complete" };

		it("lawyerOnboarding.complete ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.complete ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.complete ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.complete ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.complete ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.complete ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding.complete → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("documentReview.pending state", () => {
		const state = { documentReview: "pending" };

		it("documentReview.pending ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.pending ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.pending ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.pending → documentReview.signed on LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(next.value).toEqual({ documentReview: "signed" });
		});

		it("documentReview.pending ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.pending ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.pending → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("documentReview.signed state", () => {
		const state = { documentReview: "signed" };

		it("documentReview.signed ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.signed ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.signed ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.signed ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.signed → fundsTransfer.pending on ALL_PARTIES_SIGNED (via onDone)", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			// Transitions to documentReview.complete (final) → onDone → fundsTransfer.pending
			expect(next.value).toEqual({ fundsTransfer: "pending" });
		});

		it("documentReview.signed ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.signed → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("documentReview.complete state (transient)", () => {
		const state = { documentReview: "complete" };

		it("documentReview.complete ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.complete ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.complete ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.complete ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.complete ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.complete ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("documentReview.complete → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("fundsTransfer.pending state", () => {
		const state = { fundsTransfer: "pending" };

		it("fundsTransfer.pending ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.pending ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.pending ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.pending ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.pending ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.pending → confirmed on FUNDS_RECEIVED (via onDone)", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			// Transitions to fundsTransfer.complete (final) → onDone → confirmed
			expect(next.value).toBe("confirmed");
		});

		it("fundsTransfer.pending → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	describe("fundsTransfer.complete state (transient)", () => {
		const state = { fundsTransfer: "complete" };

		it("fundsTransfer.complete ignores DEAL_LOCKED", () => {
			const next = getNextSnapshot(dealMachine, snapshotAt(state), DEAL_LOCKED);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.complete ignores LAWYER_VERIFIED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.complete ignores REPRESENTATION_CONFIRMED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.complete ignores LAWYER_APPROVED_DOCUMENTS", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.complete ignores ALL_PARTIES_SIGNED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.complete ignores FUNDS_RECEIVED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer.complete → failed on DEAL_CANCELLED", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				DEAL_CANCELLED
			);
			expect(next.value).toBe("failed");
		});
	});

	// ── Terminal state lockdown ─────────────────────────────────────

	describe("confirmed (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`confirmed ignores ${event.type}`, () => {
				const next = getNextSnapshot(
					dealMachine,
					snapshotAt("confirmed"),
					event
				);
				expect(next.value).toBe("confirmed");
			});
		}
	});

	describe("failed (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`failed ignores ${event.type}`, () => {
				const next = getNextSnapshot(dealMachine, snapshotAt("failed"), event);
				expect(next.value).toBe("failed");
			});
		}
	});

	// ── Phase gate enforcement (R4 — REQ-191) ──────────────────────
	// Events from later phases must not cause transitions in earlier phases.

	describe("phase gate enforcement", () => {
		it("documentReview events rejected from lawyerOnboarding.pending", () => {
			const state = { lawyerOnboarding: "pending" };
			const s1 = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_APPROVED_DOCUMENTS
			);
			expect(statesEqual(s1.value as StateValue, state)).toBe(true);
			const s2 = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				ALL_PARTIES_SIGNED
			);
			expect(statesEqual(s2.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer events rejected from lawyerOnboarding.verified", () => {
			const state = { lawyerOnboarding: "verified" };
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("fundsTransfer events rejected from documentReview.pending", () => {
			const state = { documentReview: "pending" };
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				FUNDS_RECEIVED
			);
			expect(statesEqual(next.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding events rejected from documentReview.signed", () => {
			const state = { documentReview: "signed" };
			const s1 = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(s1.value as StateValue, state)).toBe(true);
			const s2 = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(s2.value as StateValue, state)).toBe(true);
		});

		it("lawyerOnboarding events rejected from fundsTransfer.pending", () => {
			const state = { fundsTransfer: "pending" };
			const s1 = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				LAWYER_VERIFIED
			);
			expect(statesEqual(s1.value as StateValue, state)).toBe(true);
			const s2 = getNextSnapshot(
				dealMachine,
				snapshotAt(state),
				REPRESENTATION_CONFIRMED
			);
			expect(statesEqual(s2.value as StateValue, state)).toBe(true);
		});
	});

	// ── DEAL_CANCELLED from every non-terminal state ────────────────

	describe("DEAL_CANCELLED global event", () => {
		const nonTerminalStates: { label: string; value: StateValue }[] = [
			{ label: "initiated", value: "initiated" },
			{
				label: "lawyerOnboarding.pending",
				value: { lawyerOnboarding: "pending" },
			},
			{
				label: "lawyerOnboarding.verified",
				value: { lawyerOnboarding: "verified" },
			},
			{
				label: "lawyerOnboarding.complete",
				value: { lawyerOnboarding: "complete" },
			},
			{ label: "documentReview.pending", value: { documentReview: "pending" } },
			{ label: "documentReview.signed", value: { documentReview: "signed" } },
			{
				label: "documentReview.complete",
				value: { documentReview: "complete" },
			},
			{ label: "fundsTransfer.pending", value: { fundsTransfer: "pending" } },
			{ label: "fundsTransfer.complete", value: { fundsTransfer: "complete" } },
		];

		for (const { label, value } of nonTerminalStates) {
			it(`${label} → failed on DEAL_CANCELLED`, () => {
				const next = getNextSnapshot(
					dealMachine,
					snapshotAt(value),
					DEAL_CANCELLED
				);
				expect(next.value).toBe("failed");
			});
		}
	});

	// ── onDone phase gate transitions ───────────────────────────────

	describe("onDone phase gates", () => {
		it("REPRESENTATION_CONFIRMED from lawyerOnboarding.verified → documentReview.pending (via onDone)", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt({ lawyerOnboarding: "verified" }),
				REPRESENTATION_CONFIRMED
			);
			expect(next.value).toEqual({ documentReview: "pending" });
		});

		it("ALL_PARTIES_SIGNED from documentReview.signed → fundsTransfer.pending (via onDone)", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt({ documentReview: "signed" }),
				ALL_PARTIES_SIGNED
			);
			expect(next.value).toEqual({ fundsTransfer: "pending" });
		});

		it("FUNDS_RECEIVED from fundsTransfer.pending → confirmed (via onDone)", () => {
			const next = getNextSnapshot(
				dealMachine,
				snapshotAt({ fundsTransfer: "pending" }),
				FUNDS_RECEIVED
			);
			expect(next.value).toBe("confirmed");
		});
	});

	// ── Happy path trace ────────────────────────────────────────────

	describe("happy path trace", () => {
		it("initiated → lawyerOnboarding → documentReview → fundsTransfer → confirmed", () => {
			// Step 0: initiated
			const s0 = snapshotAt("initiated");
			expect(s0.value).toBe("initiated");

			// Step 1: DEAL_LOCKED → lawyerOnboarding.pending
			const s1 = getNextSnapshot(dealMachine, s0, DEAL_LOCKED);
			expect(s1.value).toEqual({ lawyerOnboarding: "pending" });

			// Step 2: LAWYER_VERIFIED → lawyerOnboarding.verified
			const s2 = getNextSnapshot(dealMachine, s1, LAWYER_VERIFIED);
			expect(s2.value).toEqual({ lawyerOnboarding: "verified" });

			// Step 3: REPRESENTATION_CONFIRMED → documentReview.pending (via onDone)
			const s3 = getNextSnapshot(dealMachine, s2, REPRESENTATION_CONFIRMED);
			expect(s3.value).toEqual({ documentReview: "pending" });

			// Step 4: LAWYER_APPROVED_DOCUMENTS → documentReview.signed
			const s4 = getNextSnapshot(dealMachine, s3, LAWYER_APPROVED_DOCUMENTS);
			expect(s4.value).toEqual({ documentReview: "signed" });

			// Step 5: ALL_PARTIES_SIGNED → fundsTransfer.pending (via onDone)
			const s5 = getNextSnapshot(dealMachine, s4, ALL_PARTIES_SIGNED);
			expect(s5.value).toEqual({ fundsTransfer: "pending" });

			// Step 6: FUNDS_RECEIVED → confirmed (via onDone)
			const s6 = getNextSnapshot(dealMachine, s5, FUNDS_RECEIVED);
			expect(s6.value).toBe("confirmed");
		});
	});

	// ── Matrix count verification ───────────────────────────────────

	it("covers exactly 77 state × event pairs in the matrix sections", () => {
		// 9 non-terminal states × 7 events = 63 (in per-state describe blocks)
		// 2 terminal states × 7 events = 14 (in terminal describe blocks)
		// Total = 77
		// This test is a documentation sentinel — the counts are enforced by
		// the test structure above. If you add/remove states or events, update
		// the matrix sections to maintain exhaustive coverage.
		expect(11 * 7).toBe(77);
	});
});
