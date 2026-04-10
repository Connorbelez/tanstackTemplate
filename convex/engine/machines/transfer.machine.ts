import { setup } from "xstate";

export const TRANSFER_MACHINE_VERSION = "1.0.0";

export const transferMachine = setup({
	types: {
		context: {} as {
			transferId: string;
			providerRef: string;
			retryCount: number;
		},
		events: {} as
			| { type: "PROVIDER_INITIATED"; providerRef: string }
			| { type: "PROVIDER_ACKNOWLEDGED"; providerRef: string }
			| { type: "PROCESSING_UPDATE"; providerData: Record<string, unknown> }
			| {
					type: "FUNDS_SETTLED";
					settledAt: number;
					providerData: Record<string, unknown>;
			  }
			| { type: "TRANSFER_FAILED"; errorCode: string; reason: string }
			| { type: "TRANSFER_REVERSED"; reversalRef: string; reason: string }
			| { type: "TRANSFER_CANCELLED"; reason: string },
	},
	actions: {
		recordTransferProviderRef: () => {
			/* resolved by GT effect registry */
		},
		publishTransferConfirmed: () => {
			/* resolved by GT effect registry */
		},
		publishTransferCancelled: () => {
			/* resolved by GT effect registry */
		},
		publishTransferFailed: () => {
			/* resolved by GT effect registry */
		},
		publishTransferReversed: () => {
			/* resolved by GT effect registry */
		},
	},
}).createMachine({
	id: "transfer",
	version: TRANSFER_MACHINE_VERSION,
	initial: "initiated",
	context: {
		transferId: "",
		providerRef: "",
		retryCount: 0,
	},
	states: {
		initiated: {
			on: {
				PROVIDER_INITIATED: {
					target: "pending",
					actions: ["recordTransferProviderRef"],
				},
				FUNDS_SETTLED: {
					target: "confirmed",
					actions: ["publishTransferConfirmed"],
				},
				TRANSFER_CANCELLED: {
					target: "cancelled",
					actions: ["publishTransferCancelled"],
				},
			},
		},
		pending: {
			on: {
				PROVIDER_ACKNOWLEDGED: {
					target: "pending",
				},
				PROCESSING_UPDATE: {
					target: "processing",
				},
				FUNDS_SETTLED: {
					target: "confirmed",
					actions: ["publishTransferConfirmed"],
				},
				TRANSFER_FAILED: {
					target: "failed",
					actions: ["publishTransferFailed"],
				},
			},
		},
		processing: {
			on: {
				FUNDS_SETTLED: {
					target: "confirmed",
					actions: ["publishTransferConfirmed"],
				},
				TRANSFER_FAILED: {
					target: "failed",
					actions: ["publishTransferFailed"],
				},
			},
		},
		confirmed: {
			on: {
				TRANSFER_REVERSED: {
					target: "reversed",
					actions: ["publishTransferReversed"],
				},
			},
		},
		failed: { type: "final" },
		cancelled: { type: "final" },
		reversed: { type: "final" },
	},
});
