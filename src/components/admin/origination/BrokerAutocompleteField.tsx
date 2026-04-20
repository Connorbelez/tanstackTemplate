import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";
import type { BrokerAutocompleteOption } from "./broker-autocomplete-model";

interface BrokerAutocompleteFieldProps {
	disabled?: boolean;
	helperText?: string;
	id: string;
	isLoading: boolean;
	label: string;
	noResultsText?: string;
	onClearSelection?: () => void;
	onSearchChange: (nextValue: string) => void;
	onSelectBroker: (broker: BrokerAutocompleteOption) => void;
	options: BrokerAutocompleteOption[];
	placeholder?: string;
	search: string;
	selectedBrokerId?: string | null;
}

export function BrokerAutocompleteField({
	disabled = false,
	helperText,
	id,
	isLoading,
	label,
	noResultsText = "No brokers match the current search.",
	onClearSelection,
	onSearchChange,
	onSelectBroker,
	options,
	placeholder = "Search by broker name or email",
	search,
	selectedBrokerId,
}: BrokerAutocompleteFieldProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const hasSelection = Boolean(selectedBrokerId);

	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<div className="relative flex-1">
					<Input
						disabled={disabled}
						id={id}
						onBlur={() => {
							window.setTimeout(() => {
								setIsMenuOpen(false);
							}, 100);
						}}
						onChange={(event) => {
							onSearchChange(event.target.value);
							setIsMenuOpen(true);
						}}
						onFocus={() => {
							if (!disabled) {
								setIsMenuOpen(true);
							}
						}}
						placeholder={placeholder}
						value={search}
					/>
					{isMenuOpen && !disabled ? (
						<div className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border bg-popover shadow-md">
							{isLoading ? (
								<div className="px-3 py-3 text-muted-foreground text-sm">
									Loading brokers...
								</div>
							) : options.length === 0 ? (
								<div className="px-3 py-3 text-muted-foreground text-sm">
									{noResultsText}
								</div>
							) : (
								<div className="divide-y">
									{options.map((broker) => {
										const checked = selectedBrokerId === broker.brokerId;
										return (
											<button
												className={cn(
													"w-full px-3 py-3 text-left transition-colors",
													checked ? "bg-sky-500/10" : "hover:bg-muted/40"
												)}
												key={broker.brokerId}
												onMouseDown={(event) => {
													event.preventDefault();
													onSelectBroker(broker);
													setIsMenuOpen(false);
												}}
												type="button"
											>
												<div className="flex items-start justify-between gap-3">
													<div className="min-w-0">
														<p className="font-medium text-sm">
															{broker.fullName}
														</p>
														<p className="mt-1 text-muted-foreground text-sm">
															{[broker.email, broker.brokerageName]
																.filter(Boolean)
																.join(" • ")}
														</p>
													</div>
													{broker.licenseId ? (
														<Badge className="shrink-0" variant="outline">
															{broker.licenseId}
														</Badge>
													) : null}
												</div>
											</button>
										);
									})}
								</div>
							)}
						</div>
					) : null}
				</div>
				{hasSelection && onClearSelection ? (
					<Button
						disabled={disabled}
						onClick={onClearSelection}
						type="button"
						variant="outline"
					>
						Clear selection
					</Button>
				) : null}
			</div>
			{helperText ? (
				<p className="text-muted-foreground text-xs leading-5">{helperText}</p>
			) : null}
		</div>
	);
}
