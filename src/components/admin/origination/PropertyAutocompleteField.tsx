import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";
import {
	buildPropertyAddressLabel,
	buildPropertyLocationLabel,
	type PropertyAutocompleteOption,
} from "./property-autocomplete-model";

interface PropertyAutocompleteFieldProps {
	disabled?: boolean;
	helperText?: string;
	id: string;
	isLoading: boolean;
	label: string;
	noResultsText?: string;
	onClearSelection?: () => void;
	onSearchChange: (nextValue: string) => void;
	onSelectProperty: (property: PropertyAutocompleteOption) => void;
	options: PropertyAutocompleteOption[];
	placeholder?: string;
	search: string;
	selectedPropertyId?: string | null;
}

function buildMortgageBadgeLabel(property: PropertyAutocompleteOption) {
	if (!property.hasExistingMortgage) {
		return null;
	}

	return property.mortgageCount === 1
		? "Existing mortgage"
		: `${property.mortgageCount} mortgages`;
}

export function PropertyAutocompleteField({
	disabled = false,
	helperText,
	id,
	isLoading,
	label,
	noResultsText = "No properties match the current search.",
	onClearSelection,
	onSearchChange,
	onSelectProperty,
	options,
	placeholder = "Search by property address",
	search,
	selectedPropertyId,
}: PropertyAutocompleteFieldProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const hasSelection = Boolean(selectedPropertyId);

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
									Loading properties...
								</div>
							) : options.length === 0 ? (
								<div className="px-3 py-3 text-muted-foreground text-sm">
									{noResultsText}
								</div>
							) : (
								<div className="divide-y">
									{options.map((property) => {
										const checked = selectedPropertyId === property.propertyId;
										const mortgageBadge = buildMortgageBadgeLabel(property);

										return (
											<button
												className={cn(
													"w-full px-3 py-3 text-left transition-colors",
													checked ? "bg-sky-500/10" : "hover:bg-muted/40"
												)}
												key={property.propertyId}
												onMouseDown={(event) => {
													event.preventDefault();
													onSelectProperty(property);
													setIsMenuOpen(false);
												}}
												type="button"
											>
												<div className="flex items-start justify-between gap-3">
													<div className="min-w-0">
														<p className="font-medium text-sm">
															{buildPropertyAddressLabel(property)}
														</p>
														<p className="mt-1 text-muted-foreground text-sm">
															{buildPropertyLocationLabel(property)}
														</p>
													</div>
													<div className="flex shrink-0 items-center gap-2">
														<Badge variant="outline">
															{property.propertyType.replaceAll("_", " ")}
														</Badge>
														{mortgageBadge ? (
															<Badge variant="secondary">{mortgageBadge}</Badge>
														) : null}
													</div>
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
