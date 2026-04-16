import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import type {
	OriginationPropertyDraft,
	OriginationValuationDraft,
} from "#/lib/admin-origination";
import { OriginationStepCard } from "./OriginationStepCard";

interface PropertyStepProps {
	errors?: readonly string[];
	onChange: (nextValues: {
		propertyDraft: OriginationPropertyDraft | undefined;
		valuationDraft: OriginationValuationDraft | undefined;
	}) => void;
	propertyDraft?: OriginationPropertyDraft;
	valuationDraft?: OriginationValuationDraft;
}

function parseNumberInput(value: string) {
	if (!value.trim()) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function PropertyStep({
	errors,
	onChange,
	propertyDraft,
	valuationDraft,
}: PropertyStepProps) {
	const nextPropertyDraft = propertyDraft ?? {};
	const createDraft = nextPropertyDraft.create ?? {};
	const nextValuationDraft = valuationDraft ?? {};

	return (
		<OriginationStepCard
			description="Stage either an existing property reference or a new property draft plus the valuation snapshot that later projection logic will consume."
			errors={errors}
			title="Property + valuation"
		>
			<div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Property identity</CardTitle>
						<CardDescription>
							This captures address and type only. No canonical property row is
							created in phase 1.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="propertyId">Existing property ID</Label>
							<Input
								id="propertyId"
								onChange={(event) =>
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											propertyId: event.target.value || undefined,
											create: nextPropertyDraft.create,
										},
										valuationDraft,
									})
								}
								placeholder="property_..."
								value={nextPropertyDraft.propertyId ?? ""}
							/>
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="streetAddress">Street address</Label>
							<Input
								id="streetAddress"
								onChange={(event) =>
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												streetAddress: event.target.value,
											},
										},
										valuationDraft,
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
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												unit: event.target.value,
											},
										},
										valuationDraft,
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
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												propertyType:
													(event.target
														.value as typeof createDraft.propertyType) ||
													undefined,
											},
										},
										valuationDraft,
									})
								}
								value={createDraft.propertyType ?? ""}
							>
								<NativeSelectOption value="">Select type</NativeSelectOption>
								<NativeSelectOption value="residential">
									Residential
								</NativeSelectOption>
								<NativeSelectOption value="commercial">
									Commercial
								</NativeSelectOption>
								<NativeSelectOption value="multi_unit">
									Multi-unit
								</NativeSelectOption>
								<NativeSelectOption value="condo">Condo</NativeSelectOption>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor="city">City</Label>
							<Input
								id="city"
								onChange={(event) =>
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												city: event.target.value,
											},
										},
										valuationDraft,
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
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												province: event.target.value,
											},
										},
										valuationDraft,
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
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												postalCode: event.target.value,
											},
										},
										valuationDraft,
									})
								}
								placeholder="M5H 1J9"
								value={createDraft.postalCode ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="approximateLatitude">Approx. latitude</Label>
							<Input
								id="approximateLatitude"
								onChange={(event) =>
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												approximateLatitude: parseNumberInput(
													event.target.value
												),
											},
										},
										valuationDraft,
									})
								}
								placeholder="43.6487"
								type="number"
								value={createDraft.approximateLatitude ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="approximateLongitude">Approx. longitude</Label>
							<Input
								id="approximateLongitude"
								onChange={(event) =>
									onChange({
										propertyDraft: {
											...nextPropertyDraft,
											create: {
												...createDraft,
												approximateLongitude: parseNumberInput(
													event.target.value
												),
											},
										},
										valuationDraft,
									})
								}
								placeholder="-79.3817"
								type="number"
								value={createDraft.approximateLongitude ?? ""}
							/>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Valuation snapshot</CardTitle>
						<CardDescription>
							Store only the staged appraisal summary now. Projection and public
							disclosure wiring comes later.
						</CardDescription>
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
							<Label htmlFor="relatedDocumentAssetId">
								Related document asset ID
							</Label>
							<Input
								id="relatedDocumentAssetId"
								onChange={(event) =>
									onChange({
										propertyDraft,
										valuationDraft: {
											...nextValuationDraft,
											relatedDocumentAssetId: event.target.value || undefined,
										},
									})
								}
								placeholder="storage_..."
								value={nextValuationDraft.relatedDocumentAssetId ?? ""}
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
