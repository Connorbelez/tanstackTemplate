import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import poweredByGoogleImage from "#/assets/powered-by-google-on-white.png";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import type {
	OriginationPropertyDraft,
	OriginationValuationDraft,
} from "#/lib/admin-origination";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { OriginationStepCard } from "./OriginationStepCard";
import { PropertyAutocompleteField } from "./PropertyAutocompleteField";
import {
	buildFallbackPropertyOption,
	buildPropertyAddressLabel,
	buildPropertyDraftFromSelection,
	buildPropertyLocationLabel,
	listPropertyAutocompleteOptions,
	type PropertyAutocompleteOption,
	resolveSelectedPropertyOption,
} from "./property-autocomplete-model";
import {
	buildCoordinatesLabel,
	buildGoogleSelectionLabel,
	formatGoogleResultTypeLabel,
	hasGoogleGeocodeResult,
} from "./property-step-model";

interface PropertyStepProps {
	caseId: string;
	errors?: readonly string[];
	onChange: (nextValues: {
		propertyDraft: OriginationPropertyDraft | undefined;
		valuationDraft: OriginationValuationDraft | undefined;
	}) => void;
	propertyDraft?: OriginationPropertyDraft;
	valuationDraft?: OriginationValuationDraft;
}

interface PropertySearchContext {
	searchResults: PropertyAutocompleteOption[];
}

interface GoogleAddressSuggestion {
	fullText: string;
	placeId: string;
	primaryText: string;
	secondaryText?: string;
}

interface GoogleAddressSearchResult {
	suggestions: GoogleAddressSuggestion[];
}

interface GoogleResolvedAddressResult {
	formattedAddress: string | null;
	resolvedDraft: NonNullable<OriginationPropertyDraft["create"]>;
}

const COMPLETE_DECIMAL_INPUT_PATTERN = /^-?(?:\d+\.?\d*|\d*\.\d+)$/;

function formatPropertyTypeLabel(propertyType: string) {
	return propertyType.replaceAll("_", " ");
}

function parseNumberInput(value: string) {
	if (!value.trim()) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function isCompleteDecimalInput(value: string) {
	return COMPLETE_DECIMAL_INPUT_PATTERN.test(value.trim());
}

function formatDecimalDraftValue(value: number | undefined) {
	return typeof value === "number" ? String(value) : "";
}

interface DecimalDraftInputProps {
	id: string;
	onValueChange: (nextValue: number | undefined) => void;
	placeholder?: string;
	value?: number;
}

function DecimalDraftInput({
	id,
	onValueChange,
	placeholder,
	value,
}: DecimalDraftInputProps) {
	const [inputValue, setInputValue] = useState(() =>
		formatDecimalDraftValue(value)
	);

	useEffect(() => {
		setInputValue(formatDecimalDraftValue(value));
	}, [value]);

	return (
		<Input
			id={id}
			inputMode="decimal"
			onBlur={() => {
				const trimmedValue = inputValue.trim();
				if (!trimmedValue) {
					onValueChange(undefined);
					setInputValue("");
					return;
				}

				if (!isCompleteDecimalInput(trimmedValue)) {
					setInputValue(formatDecimalDraftValue(value));
				}
			}}
			onChange={(event) => {
				const nextValue = event.target.value;
				setInputValue(nextValue);

				const trimmedValue = nextValue.trim();
				if (!trimmedValue) {
					onValueChange(undefined);
					return;
				}

				if (!isCompleteDecimalInput(trimmedValue)) {
					return;
				}

				const parsed = Number(trimmedValue);
				if (Number.isFinite(parsed)) {
					onValueChange(parsed);
				}
			}}
			placeholder={placeholder}
			type="text"
			value={inputValue}
		/>
	);
}

export function PropertyStep({
	caseId,
	errors,
	onChange,
	propertyDraft,
	valuationDraft,
}: PropertyStepProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const searchContext = useQuery(
		api.admin.origination.properties.getPropertySearchContext,
		{
			caseId: typedCaseId,
		}
	) as PropertySearchContext | null | undefined;
	const searchGoogleAddressPredictions = useAction(
		api.admin.origination.properties.searchGoogleAddressPredictions
	);
	const resolveGoogleAddressPrediction = useAction(
		api.admin.origination.properties.resolveGoogleAddressPrediction
	);
	const nextPropertyDraft = propertyDraft ?? {};
	const createDraft = nextPropertyDraft.create ?? {};
	const nextValuationDraft = valuationDraft ?? {};
	const [propertyMode, setPropertyMode] = useState<"create" | "existing">(
		nextPropertyDraft.propertyId ? "existing" : "create"
	);
	const [propertySearch, setPropertySearch] = useState("");
	const [googleAddressSearch, setGoogleAddressSearch] = useState("");
	const [googleSuggestions, setGoogleSuggestions] = useState<
		GoogleAddressSuggestion[]
	>([]);
	const [isGoogleMenuOpen, setIsGoogleMenuOpen] = useState(false);
	const [isSearchingGoogle, setIsSearchingGoogle] = useState(false);
	const [isResolvingGoogleAddress, setIsResolvingGoogleAddress] =
		useState(false);
	const latestGoogleSearchRequestRef = useRef(0);
	const lastGoogleErrorRef = useRef<string | null>(null);
	const propertyOptions = searchContext?.searchResults ?? [];
	const isPropertySearchLoading = searchContext === undefined;
	const fallbackProperty = useMemo(
		() => buildFallbackPropertyOption({ propertyDraft }),
		[propertyDraft]
	);
	const selectedProperty = useMemo(
		() =>
			resolveSelectedPropertyOption({
				fallbackProperty,
				propertyOptions,
				selectedPropertyId: nextPropertyDraft.propertyId,
			}),
		[fallbackProperty, nextPropertyDraft.propertyId, propertyOptions]
	);
	const filteredPropertyOptions = useMemo(
		() =>
			listPropertyAutocompleteOptions({
				propertyOptions,
				search: propertySearch,
				selectedProperty,
			}),
		[propertyOptions, propertySearch, selectedProperty]
	);
	const hasResolvedGooglePlace = hasGoogleGeocodeResult(createDraft);
	const googleResultTypeLabels = useMemo(
		() =>
			(createDraft.googlePlaceData?.types ?? []).map(
				formatGoogleResultTypeLabel
			),
		[createDraft.googlePlaceData?.types]
	);

	useEffect(() => {
		if (nextPropertyDraft.propertyId) {
			setPropertyMode("existing");
		}
	}, [nextPropertyDraft.propertyId]);

	useEffect(() => {
		if (selectedProperty) {
			setPropertySearch(buildPropertyAddressLabel(selectedProperty));
		}
	}, [selectedProperty]);

	useEffect(() => {
		if (propertyMode !== "create") {
			latestGoogleSearchRequestRef.current += 1;
			setGoogleSuggestions([]);
			setIsGoogleMenuOpen(false);
			setIsSearchingGoogle(false);
			return;
		}

		const input = googleAddressSearch.trim();
		if (input.length < 3) {
			latestGoogleSearchRequestRef.current += 1;
			setGoogleSuggestions([]);
			setIsSearchingGoogle(false);
			return;
		}

		const requestId = latestGoogleSearchRequestRef.current + 1;
		latestGoogleSearchRequestRef.current = requestId;
		setIsSearchingGoogle(true);
		const timeoutId = window.setTimeout(() => {
			void searchGoogleAddressPredictions({
				caseId: typedCaseId,
				input,
			})
				.then((result) => {
					if (latestGoogleSearchRequestRef.current !== requestId) {
						return;
					}
					const nextSuggestions = (
						result as GoogleAddressSearchResult | null | undefined
					)?.suggestions;
					setGoogleSuggestions(nextSuggestions ?? []);
					lastGoogleErrorRef.current = null;
				})
				.catch((error) => {
					if (latestGoogleSearchRequestRef.current !== requestId) {
						return;
					}
					setGoogleSuggestions([]);
					const message =
						error instanceof Error
							? error.message
							: "Unable to search Google Maps addresses.";
					if (lastGoogleErrorRef.current !== message) {
						toast.error(message);
						lastGoogleErrorRef.current = message;
					}
				})
				.finally(() => {
					if (latestGoogleSearchRequestRef.current === requestId) {
						setIsSearchingGoogle(false);
					}
				});
		}, 250);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [
		googleAddressSearch,
		propertyMode,
		searchGoogleAddressPredictions,
		typedCaseId,
	]);

	useEffect(() => {
		if (propertyMode !== "create" || !createDraft.googlePlaceData?.placeId) {
			return;
		}

		const label = buildGoogleSelectionLabel(createDraft);
		if (label) {
			setGoogleAddressSearch(label);
		}
	}, [createDraft, createDraft.googlePlaceData?.placeId, propertyMode]);

	function updateCreateDraft(
		patch: Partial<NonNullable<OriginationPropertyDraft["create"]>>
	) {
		onChange({
			propertyDraft: {
				create: {
					...createDraft,
					...patch,
				},
			},
			valuationDraft,
		});
	}

	function handlePropertyModeChange(nextMode: "create" | "existing") {
		setPropertyMode(nextMode);
		setPropertySearch("");
		setGoogleAddressSearch("");
		setGoogleSuggestions([]);
		setIsGoogleMenuOpen(false);
		if (nextMode === "existing") {
			onChange({
				propertyDraft: undefined,
				valuationDraft,
			});
			return;
		}

		onChange({
			propertyDraft: {
				create: nextPropertyDraft.propertyId
					? { propertyType: createDraft.propertyType }
					: createDraft,
			},
			valuationDraft,
		});
	}

	async function handleGoogleSuggestionSelection(
		suggestion: GoogleAddressSuggestion
	) {
		setGoogleAddressSearch(suggestion.fullText);
		setGoogleSuggestions([]);
		setIsGoogleMenuOpen(false);
		setIsResolvingGoogleAddress(true);
		try {
			const result = (await resolveGoogleAddressPrediction({
				caseId: typedCaseId,
				placeId: suggestion.placeId,
			})) as GoogleResolvedAddressResult | null;
			if (!result) {
				throw new Error("Origination case no longer exists.");
			}

			onChange({
				propertyDraft: {
					create: {
						...createDraft,
						...result.resolvedDraft,
						propertyType: createDraft.propertyType,
						unit: result.resolvedDraft.unit ?? createDraft.unit,
					},
				},
				valuationDraft,
			});
			lastGoogleErrorRef.current = null;
			toast.success("Property address imported from Google Maps.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to resolve the selected Google Maps address."
			);
		} finally {
			setIsResolvingGoogleAddress(false);
		}
	}

	function renderGoogleSuggestionsMenu() {
		if (!isGoogleMenuOpen) {
			return null;
		}

		if (isSearchingGoogle) {
			return (
				<div className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border bg-popover shadow-md">
					<div className="px-3 py-3 text-muted-foreground text-sm">
						Searching Google Maps...
					</div>
				</div>
			);
		}

		if (googleAddressSearch.trim().length < 3) {
			return (
				<div className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border bg-popover shadow-md">
					<div className="px-3 py-3 text-muted-foreground text-sm">
						Type at least 3 characters to search Google Maps.
					</div>
				</div>
			);
		}

		if (googleSuggestions.length === 0) {
			return (
				<div className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border bg-popover shadow-md">
					<div className="px-3 py-3 text-muted-foreground text-sm">
						No Google Maps addresses match the current search.
					</div>
				</div>
			);
		}

		return (
			<div className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border bg-popover shadow-md">
				<div className="divide-y">
					{googleSuggestions.map((suggestion) => (
						<button
							className={cn(
								"w-full px-3 py-3 text-left transition-colors hover:bg-muted/40"
							)}
							key={suggestion.placeId}
							onMouseDown={(event) => {
								event.preventDefault();
								void handleGoogleSuggestionSelection(suggestion);
							}}
							type="button"
						>
							<p className="font-medium text-sm">{suggestion.primaryText}</p>
							<p className="mt-1 text-muted-foreground text-sm">
								{suggestion.secondaryText ?? suggestion.fullText}
							</p>
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<OriginationStepCard errors={errors} title="Property + valuation">
			<div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Property</CardTitle>
					</CardHeader>
					<CardContent className="space-y-5">
						<RadioGroup
							className="grid gap-3 md:grid-cols-2"
							onValueChange={(value) =>
								handlePropertyModeChange(value as "create" | "existing")
							}
							value={propertyMode}
						>
							<label
								className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 px-4 py-4"
								htmlFor="property-source-existing"
							>
								<RadioGroupItem
									className="mt-1"
									id="property-source-existing"
									value="existing"
								/>
								<div className="space-y-1">
									<p className="font-medium text-sm">Use existing property</p>
									<p className="text-muted-foreground text-sm leading-5">
										Search the canonical property record by address and reuse it
										for this origination.
									</p>
								</div>
							</label>
							<label
								className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 px-4 py-4"
								htmlFor="property-source-create"
							>
								<RadioGroupItem
									className="mt-1"
									id="property-source-create"
									value="create"
								/>
								<div className="space-y-1">
									<p className="font-medium text-sm">Create new property</p>
									<p className="text-muted-foreground text-sm leading-5">
										Use Google Maps address autocomplete, capture coordinates,
										then stage the remaining property fields.
									</p>
								</div>
							</label>
						</RadioGroup>

						{propertyMode === "existing" ? (
							<div className="space-y-4">
								<PropertyAutocompleteField
									helperText="Search by address. Properties that already have mortgages stay visible and are clearly flagged."
									id="property-search"
									isLoading={isPropertySearchLoading}
									label="Existing property"
									onClearSelection={() => {
										setPropertySearch("");
										onChange({
											propertyDraft: undefined,
											valuationDraft,
										});
									}}
									onSearchChange={setPropertySearch}
									onSelectProperty={(property) =>
										onChange({
											propertyDraft: buildPropertyDraftFromSelection(property),
											valuationDraft,
										})
									}
									options={filteredPropertyOptions}
									search={propertySearch}
									selectedPropertyId={selectedProperty?.propertyId ?? null}
								/>
								{selectedProperty ? (
									<div className="rounded-2xl border border-border/70 px-4 py-4">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="space-y-1">
												<p className="font-medium">
													{buildPropertyAddressLabel(selectedProperty)}
												</p>
												<p className="text-muted-foreground text-sm">
													{buildPropertyLocationLabel(selectedProperty)}
												</p>
											</div>
											<div className="flex flex-wrap gap-2">
												<Badge variant="outline">
													{formatPropertyTypeLabel(
														selectedProperty.propertyType
													)}
												</Badge>
												{selectedProperty.hasExistingMortgage ? (
													<Badge variant="secondary">
														{selectedProperty.mortgageCount === 1
															? "Existing mortgage"
															: `${selectedProperty.mortgageCount} mortgages`}
													</Badge>
												) : (
													<Badge variant="secondary">No mortgage on file</Badge>
												)}
											</div>
										</div>
									</div>
								) : (
									<div className="rounded-2xl border border-border/70 border-dashed px-4 py-6 text-muted-foreground text-sm">
										Select an address from the autocomplete list to reuse an
										existing property record.
									</div>
								)}
							</div>
						) : (
							<div className="space-y-5">
								<div className="space-y-2">
									<Label htmlFor="google-property-search">Address lookup</Label>
									<div className="flex flex-col gap-2 sm:flex-row">
										<div className="relative flex-1">
											<Input
												id="google-property-search"
												onBlur={() => {
													window.setTimeout(() => {
														setIsGoogleMenuOpen(false);
													}, 100);
												}}
												onChange={(event) => {
													setGoogleAddressSearch(event.target.value);
													setIsGoogleMenuOpen(true);
												}}
												onFocus={() => setIsGoogleMenuOpen(true)}
												placeholder="Search address with Google Maps"
												value={googleAddressSearch}
											/>
											{renderGoogleSuggestionsMenu()}
										</div>
										<Button
											onClick={() => {
												setGoogleAddressSearch("");
												setGoogleSuggestions([]);
												setIsGoogleMenuOpen(false);
												updateCreateDraft({
													googlePlaceData: undefined,
												});
											}}
											type="button"
											variant="outline"
										>
											Use manual entry
										</Button>
									</div>
									<div className="flex items-center justify-between gap-3">
										<p className="text-muted-foreground text-xs leading-5">
											Selecting a Google Maps result fills the staged property
											fields, but every field below stays editable. If Google
											can't return the address cleanly, enter it directly.
										</p>
										<img
											alt="Powered by Google"
											className="h-4 w-auto shrink-0"
											height={18}
											src={poweredByGoogleImage}
											width={59}
										/>
									</div>
								</div>

								{hasResolvedGooglePlace ? (
									<div className="space-y-4 rounded-2xl border border-border/70 px-4 py-4">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="space-y-1">
												<p className="font-medium text-sm">
													Google geocoding result
												</p>
												<p className="text-muted-foreground text-sm">
													Review what Google returned, then edit the staged
													property fields below if needed.
												</p>
											</div>
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="secondary">Google Maps source</Badge>
												{isResolvingGoogleAddress ? (
													<Badge variant="outline">
														Resolving Google address
													</Badge>
												) : null}
											</div>
										</div>
										<div className="grid gap-4 md:grid-cols-2">
											<div className="space-y-1 md:col-span-2">
												<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
													Formatted address
												</p>
												<p className="text-sm">
													{createDraft.googlePlaceData?.formattedAddress ??
														"Google did not return a formatted address."}
												</p>
											</div>
											<div className="space-y-1">
												<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
													Place ID
												</p>
												<p className="font-mono text-sm">
													{createDraft.googlePlaceData?.placeId}
												</p>
											</div>
											<div className="space-y-1">
												<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
													Coordinates returned
												</p>
												<p className="text-sm">
													{buildCoordinatesLabel({
														approximateLatitude:
															createDraft.googlePlaceData?.location?.latitude,
														approximateLongitude:
															createDraft.googlePlaceData?.location?.longitude,
													})}
												</p>
											</div>
											<div className="space-y-1 md:col-span-2">
												<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
													Result types
												</p>
												{googleResultTypeLabels.length > 0 ? (
													<div className="flex flex-wrap gap-2">
														{googleResultTypeLabels.map((typeLabel) => (
															<Badge key={typeLabel} variant="outline">
																{typeLabel}
															</Badge>
														))}
													</div>
												) : (
													<p className="text-sm">
														Google did not return result types.
													</p>
												)}
											</div>
										</div>
										<div className="flex justify-end">
											<Button
												onClick={() => {
													setGoogleAddressSearch("");
													setGoogleSuggestions([]);
													setIsGoogleMenuOpen(false);
													updateCreateDraft({
														googlePlaceData: undefined,
													});
												}}
												type="button"
												variant="outline"
											>
												Remove Google source
											</Button>
										</div>
									</div>
								) : (
									<div className="rounded-2xl border border-border/70 border-dashed px-4 py-4">
										<div className="space-y-1">
											<p className="font-medium text-sm">
												Manual entry is available
											</p>
											<p className="text-muted-foreground text-sm leading-6">
												Use Google Maps when it helps, but you can stage the
												property directly below when the address is missing,
												private, new construction, or the geocoder response
												needs correction.
											</p>
										</div>
									</div>
								)}

								<div className="space-y-4 rounded-2xl border border-border/70 px-4 py-4">
									<div className="space-y-1">
										<p className="font-medium text-sm">
											Staged property fields
										</p>
										<p className="text-muted-foreground text-sm">
											These are the values that will be committed for the
											property. They remain editable whether they came from
											Google or manual entry.
										</p>
									</div>
									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2 md:col-span-2">
											<Label htmlFor="streetAddress">Street address</Label>
											<Input
												id="streetAddress"
												onChange={(event) =>
													updateCreateDraft({
														streetAddress: event.target.value,
													})
												}
												placeholder="123 King St W"
												value={createDraft.streetAddress ?? ""}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="unit">Unit</Label>
											<Input
												id="unit"
												onChange={(event) =>
													updateCreateDraft({
														unit: event.target.value,
													})
												}
												placeholder="Suite 500"
												value={createDraft.unit ?? ""}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="propertyType">Property type</Label>
											<NativeSelect
												id="propertyType"
												onChange={(event) =>
													updateCreateDraft({
														propertyType:
															(event.target
																.value as typeof createDraft.propertyType) ||
															undefined,
													})
												}
												value={createDraft.propertyType ?? ""}
											>
												<NativeSelectOption value="">
													Select type
												</NativeSelectOption>
												<NativeSelectOption value="residential">
													Residential
												</NativeSelectOption>
												<NativeSelectOption value="commercial">
													Commercial
												</NativeSelectOption>
												<NativeSelectOption value="multi_unit">
													Multi-unit
												</NativeSelectOption>
												<NativeSelectOption value="condo">
													Condo
												</NativeSelectOption>
											</NativeSelect>
										</div>
										<div className="space-y-2">
											<Label htmlFor="city">City</Label>
											<Input
												id="city"
												onChange={(event) =>
													updateCreateDraft({
														city: event.target.value,
													})
												}
												placeholder="Toronto"
												value={createDraft.city ?? ""}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="province">Province</Label>
											<Input
												id="province"
												onChange={(event) =>
													updateCreateDraft({
														province: event.target.value,
													})
												}
												placeholder="ON"
												value={createDraft.province ?? ""}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="postalCode">Postal code</Label>
											<Input
												id="postalCode"
												onChange={(event) =>
													updateCreateDraft({
														postalCode: event.target.value,
													})
												}
												placeholder="M5H 1J9"
												value={createDraft.postalCode ?? ""}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="approximateLatitude">Latitude</Label>
											<DecimalDraftInput
												id="approximateLatitude"
												onValueChange={(nextValue) =>
													updateCreateDraft({
														approximateLatitude: nextValue,
													})
												}
												placeholder="43.648700"
												value={createDraft.approximateLatitude}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="approximateLongitude">Longitude</Label>
											<DecimalDraftInput
												id="approximateLongitude"
												onValueChange={(nextValue) =>
													updateCreateDraft({
														approximateLongitude: nextValue,
													})
												}
												placeholder="-79.381700"
												value={createDraft.approximateLongitude}
											/>
										</div>
									</div>
									<p className="text-muted-foreground text-xs leading-5">
										Coordinates auto-fill from Google when available, but they
										can also be entered or corrected directly here.
									</p>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Valuation snapshot</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="space-y-2">
							<Label htmlFor="valueAsIs">Value as-is</Label>
							<Input
								id="valueAsIs"
								onChange={(event) =>
									onChange({
										propertyDraft,
										valuationDraft: {
											...nextValuationDraft,
											valueAsIs: parseNumberInput(event.target.value),
										},
									})
								}
								placeholder="425000"
								type="number"
								value={nextValuationDraft.valueAsIs ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="valuationDate">Valuation date</Label>
							<Input
								id="valuationDate"
								onChange={(event) =>
									onChange({
										propertyDraft,
										valuationDraft: {
											...nextValuationDraft,
											valuationDate: event.target.value,
										},
									})
								}
								type="date"
								value={nextValuationDraft.valuationDate ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="visibilityHint">Visibility hint</Label>
							<NativeSelect
								id="visibilityHint"
								onChange={(event) =>
									onChange({
										propertyDraft,
										valuationDraft: {
											...nextValuationDraft,
											visibilityHint:
												(event.target
													.value as typeof nextValuationDraft.visibilityHint) ||
												undefined,
										},
									})
								}
								value={nextValuationDraft.visibilityHint ?? ""}
							>
								<NativeSelectOption value="">
									Select visibility
								</NativeSelectOption>
								<NativeSelectOption value="public">Public</NativeSelectOption>
								<NativeSelectOption value="private">Private</NativeSelectOption>
							</NativeSelect>
						</div>
					</CardContent>
				</Card>
			</div>
		</OriginationStepCard>
	);
}
