import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";
import type { BorrowerAutocompleteOption } from "./borrower-autocomplete-model";
import { buildBorrowerDisplayLabel } from "./collections-step-model";

interface BorrowerAutocompleteFieldProps {
	disabled?: boolean;
	helperText?: string;
	id: string;
	isLoading: boolean;
	label: string;
	noResultsText?: string;
	onClearSelection?: () => void;
	onSearchChange: (nextValue: string) => void;
	onSelectBorrower: (borrower: BorrowerAutocompleteOption) => void;
	options: BorrowerAutocompleteOption[];
	placeholder?: string;
	search: string;
	selectedBorrowerId?: string | null;
}

export function BorrowerAutocompleteField({
	disabled = false,
	helperText,
	id,
	isLoading,
	label,
	noResultsText = "No borrowers match the current search.",
	onClearSelection,
	onSearchChange,
	onSelectBorrower,
	options,
	placeholder = "Search by borrower name or email",
	search,
	selectedBorrowerId,
}: BorrowerAutocompleteFieldProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const hasSelection = Boolean(selectedBorrowerId);

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
									Loading borrowers...
								</div>
							) : options.length === 0 ? (
								<div className="px-3 py-3 text-muted-foreground text-sm">
									{noResultsText}
								</div>
							) : (
								<div className="divide-y">
									{options.map((borrower) => {
										const checked = selectedBorrowerId === borrower.borrowerId;
										return (
											<button
												className={cn(
													"w-full px-3 py-3 text-left transition-colors",
													checked ? "bg-sky-500/10" : "hover:bg-muted/40"
												)}
												key={borrower.borrowerId}
												onMouseDown={(event) => {
													event.preventDefault();
													onSelectBorrower(borrower);
													setIsMenuOpen(false);
												}}
												type="button"
											>
												<p className="font-medium text-sm">
													{buildBorrowerDisplayLabel(borrower)}
												</p>
												{borrower.email ? (
													<p className="mt-1 text-muted-foreground text-sm">
														{borrower.email}
													</p>
												) : null}
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
