import { Filter, Search, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useFiltersStore } from "./contexts/listingContext";
import FilterModal from "./filter-modal";
import { DEFAULT_FILTERS, FILTER_BOUNDS } from "./types/listing-filters";

export function FilterBar() {
	const { filters, setFilters, items } = useFiltersStore();

	const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		setFilters({
			...filters,
			searchQuery: event.target.value,
		});
	};

	const handleClearFilters = () => {
		setFilters(DEFAULT_FILTERS);
	};

	const hasActiveFilters =
		filters.ltvRange[0] > FILTER_BOUNDS.ltvRange[0] ||
		filters.ltvRange[1] < FILTER_BOUNDS.ltvRange[1] ||
		filters.interestRateRange[0] > FILTER_BOUNDS.interestRateRange[0] ||
		filters.interestRateRange[1] < FILTER_BOUNDS.interestRateRange[1] ||
		filters.loanAmountRange[0] > FILTER_BOUNDS.loanAmountRange[0] ||
		filters.loanAmountRange[1] < FILTER_BOUNDS.loanAmountRange[1] ||
		filters.mortgageTypes.length > 0 ||
		filters.propertyTypes.length > 0 ||
		filters.maturityDate !== undefined ||
		filters.searchQuery.length > 0;

	return (
		<div className="z-10 flex flex-col justify-center gap-x-4">
			<div className="flex flex-nowrap items-center justify-start gap-2">
				<div className="relative md:w-64">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground" />
					<Input
						className="rounded-full border-input pl-10 shadow-md"
						onChange={handleSearchChange}
						placeholder="Search ..."
						type="text"
						value={filters.searchQuery}
					/>
				</div>

				<FilterModal
					filters={filters}
					items={items}
					onFiltersChange={setFilters}
				/>

				{hasActiveFilters ? (
					<Button
						aria-label="Clear filters"
						className="px-2"
						onClick={handleClearFilters}
						size="sm"
						variant="destructive"
					>
						<X className="size-3.5" />
						<Filter className="size-3.5" />
					</Button>
				) : null}
			</div>
		</div>
	);
}
