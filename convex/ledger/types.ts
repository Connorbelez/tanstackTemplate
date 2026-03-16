// ── Entry Types ─────────────────────────────────────────────────────
export const ENTRY_TYPES = [
	"MORTGAGE_MINTED",
	"SHARES_ISSUED",
	"SHARES_TRANSFERRED",
	"SHARES_REDEEMED",
	"MORTGAGE_BURNED",
	"SHARES_RESERVED",
	"SHARES_COMMITTED",
	"SHARES_VOIDED",
	"CORRECTION",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

// ── Account Types ───────────────────────────────────────────────────
export const ACCOUNT_TYPES = ["WORLD", "TREASURY", "POSITION"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// ── Reservation Status ──────────────────────────────────────────────
export const RESERVATION_STATUSES = ["pending", "committed", "voided"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

// ── Event Source ────────────────────────────────────────────────────
export const EVENT_SOURCE_TYPES = [
	"user",
	"system",
	"webhook",
	"cron",
] as const;
export type EventSourceType = (typeof EVENT_SOURCE_TYPES)[number];

export interface EventSource {
	actor?: string;
	channel?: string;
	type: EventSourceType;
}

// ── Entry-Type-to-Account-Type Mapping ──────────────────────────────
// Defines the required (debitAccountType, creditAccountType) for each
// entry type. Used in the TYPE_CHECK step of the postEntry pipeline.
//
// Convention (D-7): debitAccountId = account RECEIVING units,
//                   creditAccountId = account GIVING units.

interface AccountTypeConstraint {
	credit: readonly AccountType[];
	debit: readonly AccountType[];
}

const ALL_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;

export const ENTRY_TYPE_ACCOUNT_MAP: Record<EntryType, AccountTypeConstraint> =
	{
		MORTGAGE_MINTED: { debit: ["TREASURY"], credit: ["WORLD"] },
		SHARES_ISSUED: { debit: ["POSITION"], credit: ["TREASURY"] },
		SHARES_TRANSFERRED: { debit: ["POSITION"], credit: ["POSITION"] },
		SHARES_REDEEMED: { debit: ["TREASURY"], credit: ["POSITION"] },
		MORTGAGE_BURNED: { debit: ["WORLD"], credit: ["TREASURY"] },
		SHARES_RESERVED: { debit: ["POSITION"], credit: ["POSITION"] },
		SHARES_COMMITTED: { debit: ["POSITION"], credit: ["POSITION"] },
		SHARES_VOIDED: { debit: ["POSITION"], credit: ["POSITION"] },
		CORRECTION: { debit: ALL_ACCOUNT_TYPES, credit: ALL_ACCOUNT_TYPES },
	};
