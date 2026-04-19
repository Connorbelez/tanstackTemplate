import {
	ROTESSA_AUTHORIZATION_TYPES,
	ROTESSA_BANK_ACCOUNT_TYPES,
	ROTESSA_CUSTOMER_TYPES,
	ROTESSA_REPORT_STATUS_FILTERS,
	ROTESSA_SCHEDULE_FREQUENCIES,
	ROTESSA_STATUS_REASONS,
	ROTESSA_TRANSACTION_STATUSES,
	type RotessaManifest,
} from "./types";

const addressFields = {
	address_1: {
		type: "string",
		required: false,
		description: "Street address line 1.",
	},
	address_2: {
		type: "string",
		required: false,
		description: "Street address line 2.",
	},
	city: {
		type: "string",
		required: false,
		description: "City.",
	},
	province_code: {
		type: "string",
		required: false,
		description: "Province or state code.",
	},
	postal_code: {
		type: "string",
		required: false,
		description: "Postal or zip code.",
	},
} as const;

export const ROTESSA_MANIFEST = {
	customers: {
		list: {
			method: "GET",
			path: "/customers",
		},
		get: {
			method: "GET",
			path: "/customers/{id}",
			params: {
				path: {
					id: {
						type: "number",
						required: true,
						description: "Customer ID.",
					},
				},
			},
		},
		getByCustomIdentifier: {
			method: "POST",
			path: "/customers/show_with_custom_identifier",
			params: {
				body: {
					custom_identifier: {
						type: "string",
						required: true,
						description: "Customer custom identifier.",
					},
				},
			},
		},
		create: {
			method: "POST",
			path: "/customers",
			params: {
				body: {
					name: {
						type: "string",
						required: true,
						description: "Customer name.",
					},
					custom_identifier: {
						type: "string",
						required: false,
						description: "Optional external identifier.",
					},
					email: {
						type: "string",
						required: true,
						description: "Customer email.",
					},
					home_phone: {
						type: "string",
						required: false,
						description: "Customer home phone.",
					},
					phone: {
						type: "string",
						required: false,
						description: "Customer phone.",
					},
					bank_name: {
						type: "string",
						required: false,
						description: "Bank name.",
					},
					institution_number: {
						type: "string",
						required: false,
						description: "Canadian institution number.",
					},
					transit_number: {
						type: "string",
						required: false,
						description: "Canadian transit number.",
					},
					bank_account_type: {
						type: "string",
						required: false,
						options: ROTESSA_BANK_ACCOUNT_TYPES,
						description: "US bank account type.",
					},
					authorization_type: {
						type: "string",
						required: true,
						options: ROTESSA_AUTHORIZATION_TYPES,
						description: "Customer authorization type.",
					},
					routing_number: {
						type: "string",
						required: false,
						description: "US routing number.",
					},
					account_number: {
						type: "string",
						required: true,
						description: "Bank account number.",
					},
					address: {
						type: "object",
						required: false,
						description: "Customer address object.",
						fields: addressFields,
					},
					customer_type: {
						type: "string",
						required: false,
						options: ROTESSA_CUSTOMER_TYPES,
						description: "Customer type.",
					},
				},
			},
		},
		update: {
			method: "PATCH",
			path: "/customers/{id}",
			params: {
				path: {
					id: {
						type: "number",
						required: true,
						description: "Customer ID.",
					},
				},
				body: {
					name: {
						type: "string",
						required: false,
						description: "Customer name.",
					},
					custom_identifier: {
						type: "string",
						required: false,
						description: "Optional external identifier.",
					},
					email: {
						type: "string",
						required: false,
						description: "Customer email.",
					},
					home_phone: {
						type: "string",
						required: false,
						description: "Customer home phone.",
					},
					phone: {
						type: "string",
						required: false,
						description: "Customer phone.",
					},
					bank_name: {
						type: "string",
						required: false,
						description: "Bank name.",
					},
					institution_number: {
						type: "string",
						required: false,
						description: "Canadian institution number.",
					},
					transit_number: {
						type: "string",
						required: false,
						description: "Canadian transit number.",
					},
					bank_account_type: {
						type: "string",
						required: false,
						options: ROTESSA_BANK_ACCOUNT_TYPES,
						description: "US bank account type.",
					},
					authorization_type: {
						type: "string",
						required: false,
						options: ROTESSA_AUTHORIZATION_TYPES,
						description: "Customer authorization type.",
					},
					routing_number: {
						type: "string",
						required: false,
						description: "US routing number.",
					},
					account_number: {
						type: "string",
						required: false,
						description: "Bank account number.",
					},
					address: {
						type: "object",
						required: false,
						description: "Customer address object.",
						fields: addressFields,
					},
					customer_type: {
						type: "string",
						required: false,
						options: ROTESSA_CUSTOMER_TYPES,
						description: "Customer type.",
					},
				},
			},
			notes: ["Docs list PATCH /customers, but examples use /customers/{id}."],
		},
		updateViaPost: {
			method: "POST",
			path: "/customers/update_via_post",
			params: {
				body: {
					id: {
						type: "number",
						required: true,
						description: "Customer ID.",
					},
					name: {
						type: "string",
						required: false,
						description: "Customer name.",
					},
					custom_identifier: {
						type: "string",
						required: false,
						description: "Optional external identifier.",
					},
					email: {
						type: "string",
						required: false,
						description: "Customer email.",
					},
					home_phone: {
						type: "string",
						required: false,
						description: "Customer home phone.",
					},
					phone: {
						type: "string",
						required: false,
						description: "Customer phone.",
					},
					bank_name: {
						type: "string",
						required: false,
						description: "Bank name.",
					},
					institution_number: {
						type: "string",
						required: false,
						description: "Canadian institution number.",
					},
					transit_number: {
						type: "string",
						required: false,
						description: "Canadian transit number.",
					},
					bank_account_type: {
						type: "string",
						required: false,
						options: ROTESSA_BANK_ACCOUNT_TYPES,
						description: "US bank account type.",
					},
					authorization_type: {
						type: "string",
						required: false,
						options: ROTESSA_AUTHORIZATION_TYPES,
						description: "Customer authorization type.",
					},
					routing_number: {
						type: "string",
						required: false,
						description: "US routing number.",
					},
					account_number: {
						type: "string",
						required: false,
						description: "Bank account number.",
					},
					address: {
						type: "object",
						required: false,
						description: "Customer address object.",
						fields: addressFields,
					},
					customer_type: {
						type: "string",
						required: false,
						options: ROTESSA_CUSTOMER_TYPES,
						description: "Customer type.",
					},
				},
			},
		},
	},
	transactionSchedules: {
		get: {
			method: "GET",
			path: "/transaction_schedules/{id}",
			params: {
				path: {
					id: {
						type: "number",
						required: true,
						description: "Transaction schedule ID.",
					},
				},
			},
		},
		create: {
			method: "POST",
			path: "/transaction_schedules",
			params: {
				body: {
					customer_id: {
						type: "number",
						required: true,
						description: "Customer ID.",
					},
					amount: {
						type: "number",
						required: true,
						description: "Transaction amount.",
					},
					frequency: {
						type: "string",
						required: true,
						options: ROTESSA_SCHEDULE_FREQUENCIES,
						description: "Schedule frequency.",
					},
					process_date: {
						type: "string",
						required: true,
						description: "Process date (YYYY-MM-DD).",
					},
					installments: {
						type: "number",
						required: false,
						description: "Optional number of installments.",
					},
					comment: {
						type: "string",
						required: false,
						description: "Optional comment.",
					},
				},
			},
		},
		createWithCustomIdentifier: {
			method: "POST",
			path: "/transaction_schedules/create_with_custom_identifier",
			params: {
				body: {
					custom_identifier: {
						type: "string",
						required: true,
						description: "Customer custom identifier.",
					},
					amount: {
						type: "number",
						required: true,
						description: "Transaction amount.",
					},
					frequency: {
						type: "string",
						required: true,
						options: ROTESSA_SCHEDULE_FREQUENCIES,
						description: "Schedule frequency.",
					},
					process_date: {
						type: "string",
						required: true,
						description: "Process date (YYYY-MM-DD).",
					},
					installments: {
						type: "number",
						required: false,
						description: "Optional number of installments.",
					},
					comment: {
						type: "string",
						required: false,
						description: "Optional comment.",
					},
				},
			},
			notes: [
				"Docs show a stray space in the example path; use /transaction_schedules/create_with_custom_identifier.",
			],
		},
		update: {
			method: "PATCH",
			path: "/transaction_schedules/{id}",
			params: {
				path: {
					id: {
						type: "number",
						required: true,
						description: "Transaction schedule ID.",
					},
				},
				body: {
					amount: {
						type: "number",
						required: false,
						description: "Updated amount.",
					},
					comment: {
						type: "string",
						required: false,
						description: "Updated comment.",
					},
				},
			},
		},
		updateViaPost: {
			method: "POST",
			path: "/transaction_schedules/update_via_post",
			params: {
				body: {
					id: {
						type: "number",
						required: true,
						description: "Transaction schedule ID.",
					},
					amount: {
						type: "number",
						required: false,
						description: "Updated amount.",
					},
					comment: {
						type: "string",
						required: false,
						description: "Updated comment.",
					},
				},
			},
		},
		delete: {
			method: "DELETE",
			path: "/transaction_schedules/{id}",
			params: {
				path: {
					id: {
						type: "number",
						required: true,
						description: "Transaction schedule ID.",
					},
				},
			},
		},
	},
	transactionReport: {
		list: {
			method: "GET",
			path: "/transaction_report",
			params: {
				query: {
					start_date: {
						type: "string",
						required: true,
						description: "Start date (YYYY-MM-DD).",
					},
					end_date: {
						type: "string",
						required: false,
						description: "End date (YYYY-MM-DD).",
					},
					status: {
						type: "string",
						required: false,
						options: ROTESSA_REPORT_STATUS_FILTERS,
						description: "Status filter.",
					},
					filter: {
						type: "string",
						required: false,
						options: ROTESSA_REPORT_STATUS_FILTERS,
						description: "Alternate status filter parameter.",
					},
					page: {
						type: "number",
						required: false,
						description: "Page number.",
					},
				},
			},
			notes: [
				`Financial transaction status values: ${ROTESSA_TRANSACTION_STATUSES.join(", ")}.`,
				`Status reason values: ${ROTESSA_STATUS_REASONS.join(", ")}.`,
			],
		},
	},
} as const satisfies RotessaManifest;
