import { AlertTriangle, FileClock } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import type {
	OriginationCaseDraftValues,
	OriginationValidationSnapshot,
} from "#/lib/admin-origination";
import { OriginationStepCard } from "./OriginationStepCard";
import {
	formatOriginationCurrency,
	getOriginationStepErrors,
	ORIGINATION_DOCUMENT_SECTION_SHELLS,
} from "./workflow";

interface ReviewStepProps {
	snapshot?: OriginationValidationSnapshot;
	values: OriginationCaseDraftValues;
}

function ReviewField({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-1">
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
				{label}
			</p>
			<p className="text-sm leading-6">{value}</p>
		</div>
	);
}

function joinValues(values: Array<string | undefined>) {
	const presentValues = values.filter((value): value is string =>
		Boolean(value && value.trim().length > 0)
	);

	return presentValues.length > 0 ? presentValues.join(", ") : "Not staged";
}

export function ReviewStep({ snapshot, values }: ReviewStepProps) {
	const reviewWarnings = snapshot?.reviewWarnings ?? [];
	const stepErrors = [
		...getOriginationStepErrors(snapshot, "participants"),
		...getOriginationStepErrors(snapshot, "property"),
		...getOriginationStepErrors(snapshot, "mortgageTerms"),
		...getOriginationStepErrors(snapshot, "collections"),
		...getOriginationStepErrors(snapshot, "listingCuration"),
	];

	return (
		<OriginationStepCard
			description="Review the exact staged payload that is currently persisted on the case. Commit intentionally stays disabled until later phases implement the canonical constructor."
			errors={stepErrors}
			title="Review + commit"
		>
			{reviewWarnings.length > 0 ? (
				<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
					<div className="flex items-start gap-3">
						<AlertTriangle className="mt-0.5 size-5 text-amber-700" />
						<div className="space-y-2">
							<p className="font-medium text-amber-800 text-sm">
								Commit is still blocked
							</p>
							<ul className="list-disc space-y-1 pl-5 text-amber-900 text-sm">
								{reviewWarnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			) : null}

			<div className="grid gap-4 lg:grid-cols-2">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Participants</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<ReviewField
							label="Primary borrower"
							value={joinValues([
								values.participantsDraft?.primaryBorrower?.fullName,
								values.participantsDraft?.primaryBorrower?.email,
							])}
						/>
						<ReviewField
							label="Co-borrowers"
							value={
								values.participantsDraft?.coBorrowers?.length
									? values.participantsDraft.coBorrowers
											.map(
												(participant) =>
													participant.fullName ??
													participant.email ??
													"Unnamed co-borrower"
											)
											.join(", ")
									: "None"
							}
						/>
						<ReviewField
							label="Guarantors"
							value={
								values.participantsDraft?.guarantors?.length
									? values.participantsDraft.guarantors
											.map(
												(participant) =>
													participant.fullName ??
													participant.email ??
													"Unnamed guarantor"
											)
											.join(", ")
									: "None"
							}
						/>
						<ReviewField
							label="Broker refs"
							value={joinValues([
								values.participantsDraft?.brokerOfRecordId,
								values.participantsDraft?.assignedBrokerId,
							])}
						/>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Property + valuation</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<ReviewField
							label="Property"
							value={joinValues([
								values.propertyDraft?.create?.streetAddress,
								values.propertyDraft?.create?.city,
								values.propertyDraft?.create?.province,
								values.propertyDraft?.create?.postalCode,
							])}
						/>
						<ReviewField
							label="Property type"
							value={values.propertyDraft?.create?.propertyType ?? "Not staged"}
						/>
						<ReviewField
							label="Valuation"
							value={formatOriginationCurrency(
								values.valuationDraft?.valueAsIs
							)}
						/>
						<ReviewField
							label="Visibility"
							value={values.valuationDraft?.visibilityHint ?? "Not staged"}
						/>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Mortgage terms</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<ReviewField
							label="Principal"
							value={formatOriginationCurrency(values.mortgageDraft?.principal)}
						/>
						<ReviewField
							label="Rate"
							value={joinValues([
								values.mortgageDraft?.interestRate
									? `${values.mortgageDraft.interestRate}%`
									: undefined,
								values.mortgageDraft?.rateType,
							])}
						/>
						<ReviewField
							label="Term / amortization"
							value={joinValues([
								values.mortgageDraft?.termMonths
									? `${values.mortgageDraft.termMonths} months`
									: undefined,
								values.mortgageDraft?.amortizationMonths
									? `${values.mortgageDraft.amortizationMonths} months amortization`
									: undefined,
							])}
						/>
						<ReviewField
							label="Payment cadence"
							value={joinValues([
								values.mortgageDraft?.paymentAmount
									? formatOriginationCurrency(
											values.mortgageDraft.paymentAmount
										)
									: undefined,
								values.mortgageDraft?.paymentFrequency,
							])}
						/>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Collections</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<ReviewField
							label="Mode"
							value={values.collectionsDraft?.mode ?? "Not staged"}
						/>
						<ReviewField
							label="Provider"
							value={values.collectionsDraft?.providerCode ?? "Not staged"}
						/>
						<ReviewField
							label="Bank account ref"
							value={
								values.collectionsDraft?.selectedBankAccountId ?? "Not staged"
							}
						/>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Documents</CardTitle>
						<CardDescription>
							These sections are intentionally placeholder-only in phase 1.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 text-sm leading-6">
						{ORIGINATION_DOCUMENT_SECTION_SHELLS.map((section) => (
							<div
								className="rounded-xl border border-dashed px-4 py-3"
								key={section.key}
							>
								<p className="font-medium">{section.title}</p>
								<p className="text-muted-foreground">{section.description}</p>
							</div>
						))}
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Listing curation</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<ReviewField
							label="Title"
							value={values.listingOverrides?.title ?? "Not staged"}
						/>
						<ReviewField
							label="Description"
							value={values.listingOverrides?.description ?? "Not staged"}
						/>
						<ReviewField
							label="Hero images"
							value={
								values.listingOverrides?.heroImages?.length
									? values.listingOverrides.heroImages.join(", ")
									: "Not staged"
							}
						/>
						<ReviewField
							label="Merchandising"
							value={joinValues([
								values.listingOverrides?.featured ? "Featured" : undefined,
								typeof values.listingOverrides?.displayOrder === "number"
									? `Display order ${values.listingOverrides.displayOrder}`
									: undefined,
								values.listingOverrides?.seoSlug,
							])}
						/>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-border/70 bg-muted/20 px-5 py-5 md:flex-row md:items-center">
				<div className="flex items-start gap-3">
					<FileClock className="mt-0.5 size-5 text-muted-foreground" />
					<div className="space-y-1">
						<p className="font-medium text-sm">
							Commit stays disabled in phase 1
						</p>
						<p className="max-w-2xl text-muted-foreground text-sm leading-6">
							This workspace persists the staging aggregate only. Canonical
							borrower, property, mortgage, listing, payment, and document rows
							remain untouched until later phases implement the single commit
							path.
						</p>
					</div>
				</div>
				<Button disabled type="button">
					Commit origination
				</Button>
			</div>
		</OriginationStepCard>
	);
}
