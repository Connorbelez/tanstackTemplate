import { useMemo } from "react";

/**
 * Deal status dot-notation format.
 * Examples: "initiated", "lawyerOnboarding.pending", "documentReview.signed"
 */
export type DealStatus =
	| "initiated"
	| "lawyerOnboarding.pending"
	| "lawyerOnboarding.verified"
	| "lawyerOnboarding.complete"
	| "documentReview.pending"
	| "documentReview.signed"
	| "documentReview.complete"
	| "fundsTransfer.pending"
	| "fundsTransfer.complete"
	| "confirmed"
	| "failed";

/**
 * Terminal states where no actions are available.
 */
const TERMINAL_STATES: DealStatus[] = ["confirmed", "failed"];

/**
 * Payment method types for funds receipt.
 */
export type FundsMethod = "vopay" | "wire_receipt" | "manual";

/**
 * Event types for deal actions.
 */
export type DealEventType =
	| "DEAL_LOCKED"
	| "LAWYER_VERIFIED"
	| "REPRESENTATION_CONFIRMED"
	| "LAWYER_APPROVED_DOCUMENTS"
	| "ALL_PARTIES_SIGNED"
	| "FUNDS_RECEIVED"
	| "DEAL_CANCELLED";

/**
 * Payload schemas for each event type.
 */
export interface DealEventPayloads {
	ALL_PARTIES_SIGNED: Record<string, never>;
	DEAL_CANCELLED: { reason: string };
	DEAL_LOCKED: { closingDate: number };
	FUNDS_RECEIVED: { method: FundsMethod };
	LAWYER_APPROVED_DOCUMENTS: Record<string, never>;
	LAWYER_VERIFIED: { verificationId: string };
	REPRESENTATION_CONFIRMED: Record<string, never>;
}

/**
 * Configuration for a single action button.
 */
export interface DealAction {
	/** Event type to fire */
	event: DealEventType;
	/** Whether this is a cancel action (requires reason) */
	isCancel: boolean;
	/** Button label text */
	label: string;
	/** Optional payload schema for type-safe payload access */
	payloadSchema?: keyof DealEventPayloads;
	/** Whether this action requires additional payload data */
	requiresPayload: boolean;
}

/**
 * Hook return type containing available actions for a deal status.
 */
export interface UseDealActionsResult {
	/** Available actions for the current status */
	actions: DealAction[];
	/** Whether the current status is terminal (no actions) */
	isTerminal: boolean;
}

/**
 * Maps deal status to available actions.
 * Each status can have a primary action plus always-available cancel (for non-terminals).
 */
const STATUS_ACTION_MAP: Record<DealStatus, Omit<DealAction, "isCancel">[]> = {
	initiated: [
		{
			label: "Lock Deal",
			event: "DEAL_LOCKED",
			requiresPayload: true,
			payloadSchema: "DEAL_LOCKED",
		},
	],
	"lawyerOnboarding.pending": [
		{
			label: "Verify Lawyer",
			event: "LAWYER_VERIFIED",
			requiresPayload: true,
			payloadSchema: "LAWYER_VERIFIED",
		},
	],
	"lawyerOnboarding.verified": [
		{
			label: "Confirm Representation",
			event: "REPRESENTATION_CONFIRMED",
			requiresPayload: false,
		},
	],
	"lawyerOnboarding.complete": [], // Waiting for documentReview
	"documentReview.pending": [
		{
			label: "Approve Documents",
			event: "LAWYER_APPROVED_DOCUMENTS",
			requiresPayload: false,
		},
	],
	"documentReview.signed": [
		{
			label: "Confirm All Signed",
			event: "ALL_PARTIES_SIGNED",
			requiresPayload: false,
		},
	],
	"documentReview.complete": [], // Waiting for fundsTransfer
	"fundsTransfer.pending": [
		{
			label: "Confirm Funds Received",
			event: "FUNDS_RECEIVED",
			requiresPayload: true,
			payloadSchema: "FUNDS_RECEIVED",
		},
	],
	"fundsTransfer.complete": [], // Waiting for confirmation
	confirmed: [], // Terminal state
	failed: [], // Terminal state
};

/**
 * Cancel action available on all non-terminal states.
 */
const CANCEL_ACTION: DealAction = {
	label: "Cancel Deal",
	event: "DEAL_CANCELLED",
	requiresPayload: true,
	isCancel: true,
	payloadSchema: "DEAL_CANCELLED",
};

/**
 * Hook that returns available actions for a given deal status.
 *
 * @param status - The current deal status in dot-notation format
 * @returns Object containing available actions and terminal state info
 *
 * @example
 * ```ts
 * const { actions, isTerminal } = useDealActions("lawyerOnboarding.pending");
 * // Returns: [{ label: "Verify Lawyer", event: "LAWYER_VERIFIED", ... }, { label: "Cancel Deal", ... }]
 * ```
 */
export function useDealActions(
	status: DealStatus | string
): UseDealActionsResult {
	const normalizedStatus = useMemo(() => {
		// Check for terminal states (case-insensitive) but preserve original casing for map lookup
		const isTerminal = TERMINAL_STATES.some(
			(ts) => ts.toLowerCase() === status.toLowerCase()
		);
		// Only lowercase for terminal states; preserve camelCase for other statuses
		return isTerminal
			? (status.toLowerCase() as DealStatus)
			: (status as DealStatus);
	}, [status]);

	const result = useMemo(() => {
		const isTerminal = TERMINAL_STATES.includes(normalizedStatus as DealStatus);

		if (isTerminal) {
			return {
				actions: [],
				isTerminal: true,
			};
		}

		const statusActions =
			STATUS_ACTION_MAP[normalizedStatus as DealStatus] ?? [];
		const actions: DealAction[] = statusActions.map((action) => ({
			...action,
			isCancel: false,
		}));

		// Add cancel action for all non-terminal states
		actions.push(CANCEL_ACTION);

		return {
			actions,
			isTerminal: false,
		};
	}, [normalizedStatus]);

	return result;
}

/**
 * Get action by event type from available actions.
 *
 * @param actions - Array of available actions
 * @param event - Event type to find
 * @returns The matching action or undefined
 */
export function getActionByEvent(
	actions: DealAction[],
	event: DealEventType
): DealAction | undefined {
	return actions.find((action) => action.event === event);
}
