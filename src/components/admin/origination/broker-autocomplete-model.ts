export interface BrokerAutocompleteOption {
	brokerageName: string | null;
	brokerId: string;
	email: string;
	fullName: string;
	licenseId: string | null;
}

export function buildBrokerDisplayLabel(
	broker: Pick<BrokerAutocompleteOption, "email" | "fullName">
) {
	return broker.fullName.trim() || broker.email;
}

export function buildFallbackBrokerOption(args: {
	brokerId?: string | null;
	label?: string | null;
}) {
	if (!(args.brokerId && args.label?.trim())) {
		return null;
	}

	return {
		brokerId: args.brokerId,
		brokerageName: null,
		email: "",
		fullName: args.label.trim(),
		licenseId: null,
	} satisfies BrokerAutocompleteOption;
}

export function resolveSelectedBrokerOption(args: {
	brokerOptions: BrokerAutocompleteOption[];
	fallbackBroker?: BrokerAutocompleteOption | null;
	selectedBrokerId?: string | null;
}) {
	if (!args.selectedBrokerId) {
		return null;
	}

	return (
		args.brokerOptions.find(
			(broker) => broker.brokerId === args.selectedBrokerId
		) ??
		args.fallbackBroker ??
		null
	);
}

export function listBrokerAutocompleteOptions(args: {
	brokerOptions: BrokerAutocompleteOption[];
	search: string;
	selectedBroker: BrokerAutocompleteOption | null;
}) {
	const searchableBrokerOptions =
		args.selectedBroker &&
		!args.brokerOptions.some(
			(broker) => broker.brokerId === args.selectedBroker?.brokerId
		)
			? [args.selectedBroker, ...args.brokerOptions]
			: args.brokerOptions;
	const normalizedQuery = args.search.trim().toLowerCase();

	if (!normalizedQuery) {
		return searchableBrokerOptions.slice(0, 8);
	}

	return searchableBrokerOptions
		.filter((broker) =>
			[
				broker.email,
				broker.fullName,
				broker.brokerageName ?? "",
				broker.licenseId ?? "",
			]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery)
		)
		.slice(0, 8);
}
