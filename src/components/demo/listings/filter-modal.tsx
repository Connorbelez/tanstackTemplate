import {
	Indicator as CheckboxIndicator,
	Root as CheckboxRoot,
} from "@radix-ui/react-checkbox";
import {
	Briefcase,
	Building,
	Building2,
	Calendar,
	CircleCheck,
	DollarSign,
	FileText,
	Filter,
	HelpCircle,
	Home,
	Landmark,
	Layers,
	Percent,
	TrendingUp,
	X,
} from "lucide-react";
import React from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Separator } from "#/components/ui/separator";
import { TooltipProvider } from "#/components/ui/tooltip";
import { DatePicker } from "./date-picker";
import type { FilterableItem } from "./ListingGridShell";
import RangeSliderWithHistogram from "./range-slider-with-histogram";
import {
	DEFAULT_FILTERS,
	FILTER_BOUNDS,
	type FilterState,
	type MortgageType,
	type PropertyType,
} from "./types/listing-filters";

interface FilterModalProps {
	filters: FilterState;
	items?: readonly FilterableItem[];
	onFiltersChange: (filters: FilterState) => void;
}

function PropertyTypeIcon({ type }: { type: PropertyType }) {
	switch (type) {
		case "Detached Home":
		case "Cottage":
		case "Townhouse":
			return <Home className="h-5 w-5" />;
		case "Duplex":
		case "Condo":
			return <Building2 className="h-5 w-5" />;
		case "Triplex":
			return <Building className="h-5 w-5" />;
		case "Apartment":
			return <Landmark className="h-5 w-5" />;
		case "Commercial":
			return <Briefcase className="h-5 w-5" />;
		case "Mixed-Use":
			return <Layers className="h-5 w-5" />;
		default:
			return <HelpCircle className="h-5 w-5" />;
	}
}

export default function FilterModal({
	filters,
	onFiltersChange,
	items = [],
}: FilterModalProps) {
	const [isOpen, setIsOpen] = React.useState(false);

	React.useEffect(() => {
		if (!isOpen) {
			return;
		}

		const style = document.createElement("style");
		style.textContent = `
      [data-radix-tooltip-content] {
        z-index: 9999 !important;
      }
    `;
		style.id = "tooltip-z-index-fix";
		document.head.appendChild(style);

		return () => {
			document.getElementById("tooltip-z-index-fix")?.remove();
		};
	}, [isOpen]);

	const calculateHistogram = React.useCallback(
		(
			field: "ltv" | "apr" | "principal",
			min: number,
			max: number,
			barCount: number
		): number[] => {
			const buckets = new Array(barCount).fill(0);
			const bucketSize = (max - min) / barCount;

			for (const item of items) {
				const value = item[field];
				if (value !== undefined && value >= min && value <= max) {
					const bucketIndex = Math.min(
						Math.floor((value - min) / bucketSize),
						barCount - 1
					);
					buckets[bucketIndex] += 1;
				}
			}

			return buckets;
		},
		[items]
	);

	const ltvHistogram = React.useMemo(
		() =>
			calculateHistogram(
				"ltv",
				FILTER_BOUNDS.ltvRange[0],
				FILTER_BOUNDS.ltvRange[1],
				20
			),
		[calculateHistogram]
	);
	const aprHistogram = React.useMemo(
		() =>
			calculateHistogram(
				"apr",
				FILTER_BOUNDS.interestRateRange[0],
				FILTER_BOUNDS.interestRateRange[1],
				20
			),
		[calculateHistogram]
	);
	const principalHistogram = React.useMemo(
		() =>
			calculateHistogram(
				"principal",
				FILTER_BOUNDS.loanAmountRange[0],
				FILTER_BOUNDS.loanAmountRange[1],
				20
			),
		[calculateHistogram]
	);

	const handleMortgageTypeToggle = (type: MortgageType) => {
		const newTypes = filters.mortgageTypes.includes(type)
			? filters.mortgageTypes.filter((item) => item !== type)
			: [...filters.mortgageTypes, type];

		onFiltersChange({
			...filters,
			mortgageTypes: newTypes,
		});
	};

	const handlePropertyTypeToggle = (type: PropertyType) => {
		const newTypes = filters.propertyTypes.includes(type)
			? filters.propertyTypes.filter((item) => item !== type)
			: [...filters.propertyTypes, type];

		onFiltersChange({
			...filters,
			propertyTypes: newTypes,
		});
	};

	const handleClearFilters = () => {
		onFiltersChange(DEFAULT_FILTERS);
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
		filters.maturityDate !== undefined;

	const mortgageTypeOptions: Array<{
		displayLabel: string;
		label: string;
		value: MortgageType;
	}> = [
		{ value: "First", label: "1st", displayLabel: "1st" },
		{ value: "Second", label: "2nd", displayLabel: "2nd" },
		{ value: "Other", label: "3+", displayLabel: "3+" },
	];

	const propertyTypeOptions: Array<{
		label: string;
		value: PropertyType;
	}> = [
		{ value: "Detached Home", label: "Detached" },
		{ value: "Duplex", label: "Duplex" },
		{ value: "Triplex", label: "Triplex" },
		{ value: "Apartment", label: "Apartment" },
		{ value: "Condo", label: "Condo" },
		{ value: "Cottage", label: "Cottage" },
		{ value: "Townhouse", label: "Townhouse" },
		{ value: "Commercial", label: "Commercial" },
		{ value: "Mixed-Use", label: "Mixed-Use" },
		{ value: "Other", label: "Other" },
	];

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			<DialogTrigger asChild>
				<Button className="rounded-full" size="lg" variant="outline">
					Filters
					<Filter className="ml-2 h-4 w-4" />
				</Button>
			</DialogTrigger>
			<TooltipProvider delayDuration={0}>
				<DialogContent className="z-[101] max-h-[80vh] min-w-[300px] max-w-[calc(100vw-1rem)] overflow-y-auto px-2 sm:max-w-4xl sm:px-6">
					<DialogHeader>
						<DialogTitle className="text-center font-medium text-2xl">
							Filters
						</DialogTitle>
						<DialogDescription className="sr-only">
							Adjust investor listing filters by LTV, rate, loan amount,
							mortgage type, property type, and maturity date.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3 px-1 py-1 sm:px-0">
						<Separator />

						<div className="space-y-2">
							<h2 className="flex items-center justify-center gap-2 text-center font-medium text-foreground/50 text-lg sm:text-xl">
								<Percent className="h-5 w-5" />
								LTV
							</h2>
							<div className="relative z-[105] w-full overflow-x-hidden">
								<RangeSliderWithHistogram
									className="w-full"
									defaultValue={filters.ltvRange}
									formatValue={(value) => `${value}%`}
									histogramData={ltvHistogram}
									max={FILTER_BOUNDS.ltvRange[1]}
									min={FILTER_BOUNDS.ltvRange[0]}
									onValueChange={(values) =>
										onFiltersChange({ ...filters, ltvRange: values })
									}
									showTitle={false}
									step={1}
									targetBarCount={20}
									variant="compact"
								/>
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<h2 className="flex items-center justify-center gap-2 text-center font-medium text-foreground/50 text-lg sm:text-xl">
								<TrendingUp className="h-5 w-5" />
								Interest Rate
							</h2>
							<div className="relative z-[105] w-full overflow-x-hidden">
								<RangeSliderWithHistogram
									className="w-full"
									defaultValue={filters.interestRateRange}
									formatValue={(value) => `${value}%`}
									histogramData={aprHistogram}
									max={FILTER_BOUNDS.interestRateRange[1]}
									min={FILTER_BOUNDS.interestRateRange[0]}
									onValueChange={(values) =>
										onFiltersChange({
											...filters,
											interestRateRange: values,
										})
									}
									showTitle={false}
									step={0.1}
									targetBarCount={20}
									variant="compact"
								/>
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<h2 className="flex items-center justify-center gap-2 text-center font-medium text-foreground/50 text-lg sm:text-xl">
								<DollarSign className="h-5 w-5" />
								Loan Amount
							</h2>
							<div className="relative z-[105] w-full overflow-x-hidden">
								<RangeSliderWithHistogram
									className="w-full"
									defaultValue={filters.loanAmountRange}
									formatValue={(value) => `$${value.toLocaleString()}`}
									histogramData={principalHistogram}
									max={FILTER_BOUNDS.loanAmountRange[1]}
									min={FILTER_BOUNDS.loanAmountRange[0]}
									onValueChange={(values) =>
										onFiltersChange({ ...filters, loanAmountRange: values })
									}
									showTitle={false}
									step={10_000}
									targetBarCount={20}
									variant="compact"
								/>
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<h2 className="flex items-center justify-center gap-2 text-center font-medium text-foreground/50 text-lg sm:text-xl">
								<FileText className="h-5 w-5" />
								Mortgage Type
							</h2>
							<div className="grid grid-cols-1 items-center justify-center gap-2 py-4 sm:grid-cols-3 sm:gap-3">
								{mortgageTypeOptions.map((option) => (
									<CheckboxRoot
										checked={filters.mortgageTypes.includes(option.value)}
										className="relative rounded-lg px-2 py-2 text-center text-muted-foreground ring-[1px] ring-border transition-all data-[state=checked]:text-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary sm:px-4 sm:py-3"
										key={option.value}
										onCheckedChange={() =>
											handleMortgageTypeToggle(option.value)
										}
									>
										<div className="flex flex-col items-center gap-2">
											<span className="font-semibold text-2xl">
												{option.label}
											</span>
											<span className="font-medium text-sm tracking-tight">
												{option.displayLabel}
											</span>
										</div>
										<CheckboxIndicator className="absolute top-2 right-2">
											<CircleCheck className="h-5 w-5 fill-primary text-primary-foreground" />
										</CheckboxIndicator>
									</CheckboxRoot>
								))}
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<h2 className="flex items-center justify-center gap-2 text-center font-medium text-foreground/50 text-lg sm:text-xl">
								<Building className="h-5 w-5" />
								Property Type
							</h2>
							<div className="grid grid-cols-1 items-center justify-center gap-2 py-4 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
								{propertyTypeOptions.map((option) => (
									<CheckboxRoot
										checked={filters.propertyTypes.includes(option.value)}
										className="relative h-16 rounded-lg px-4 py-3 text-center text-muted-foreground ring-[1px] ring-border transition-all data-[state=checked]:text-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
										key={option.value}
										onCheckedChange={() =>
											handlePropertyTypeToggle(option.value)
										}
									>
										<div className="flex h-full flex-col items-center justify-center gap-2">
											<PropertyTypeIcon type={option.value} />
											<span className="font-semibold text-xs leading-tight sm:text-sm">
												{option.label}
											</span>
										</div>
										<CheckboxIndicator className="absolute top-2 right-2">
											<CircleCheck className="h-4 w-4 fill-primary text-primary-foreground" />
										</CheckboxIndicator>
									</CheckboxRoot>
								))}
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<h2 className="flex items-center justify-center gap-2 text-center font-medium text-foreground/50 text-lg sm:text-xl">
								<Calendar className="h-5 w-5" />
								Maturity Date
							</h2>
							<div className="flex justify-center">
								<DatePicker
									date={filters.maturityDate}
									onDateChange={(date) =>
										onFiltersChange({ ...filters, maturityDate: date })
									}
								/>
							</div>
						</div>
					</div>

					<DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
						<Button
							onClick={() => setIsOpen(false)}
							size="sm"
							variant="outline"
						>
							Close
						</Button>
						{hasActiveFilters ? (
							<Button
								onClick={handleClearFilters}
								size="sm"
								variant="destructive"
							>
								<X className="mr-2 h-4 w-4" />
								Clear Filters
							</Button>
						) : null}
						<Button onClick={() => setIsOpen(false)} size="sm">
							Apply
						</Button>
					</DialogFooter>
				</DialogContent>
			</TooltipProvider>
		</Dialog>
	);
}
