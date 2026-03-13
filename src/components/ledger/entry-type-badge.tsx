const ENTRY_TYPE_COLORS: Record<string, string> = {
	MORTGAGE_MINTED: "bg-blue-100 text-blue-800",
	SHARES_ISSUED: "bg-green-100 text-green-800",
	SHARES_TRANSFERRED: "bg-amber-100 text-amber-800",
	SHARES_REDEEMED: "bg-orange-100 text-orange-800",
	MORTGAGE_BURNED: "bg-red-100 text-red-800",
	CORRECTION: "bg-purple-100 text-purple-800",
};

interface EntryTypeBadgeProps {
	entryType: string;
}

export function EntryTypeBadge({ entryType }: EntryTypeBadgeProps) {
	return (
		<span
			className={`inline-block rounded px-2 py-0.5 font-medium text-xs ${ENTRY_TYPE_COLORS[entryType] ?? ""}`}
		>
			{entryType.replace(/_/g, " ")}
		</span>
	);
}
