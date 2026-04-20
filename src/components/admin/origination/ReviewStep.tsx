import { AlertTriangle, FileClock, LoaderCircle } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type {
	OriginationCaseDraftValues,
	OriginationValidationSnapshot,
} from "#/lib/admin-origination";
import { ORIGINATION_DOCUMENT_SECTIONS } from "./document-drafts";
import { OriginationStepCard } from "./OriginationStepCard";
import {
	formatOriginationCurrency,
	getOriginationCommitBlockingErrors,
	getOriginationStepErrors,
	type OriginationWorkspaceCommitState,
} from "./workflow";

interface ReviewStepProps {
	canCommit: boolean;
	commitState: OriginationWorkspaceCommitState;
	committedMortgageId?: string;
	onCommit: () => void;
	onOpenCommittedMortgage?: () => void;
	snapshot?: OriginationValidationSnapshot;
	values: OriginationCaseDraftValues;
}

type ReviewHeroImages = NonNullable<
	OriginationCaseDraftValues["listingOverrides"]
>["heroImages"];

function resolveCommitButtonLabel(args: {
	isCommitted: boolean;
	commitState: OriginationWorkspaceCommitState;
}) {
	if (args.commitState.status === "validating") {
		return "Validating persisted draft";
	}

	if (args.commitState.status === "committing") {
		return "Writing canonical mortgage";
	}

	if (args.isCommitted) {
		return "Open committed mortgage";
	}

	return "Commit origination";
}

function resolveReviewFooterTitle(args: {
	hasCommitBlockingErrors: boolean;
	isCommitted: boolean;
}) {
	if (args.isCommitted) {
		return "Canonical mortgage activated";
	}

	if (args.hasCommitBlockingErrors) {
		return "Resolve the remaining commit blockers";
	}

	return "Canonical activation is ready";
}

function resolveReviewFooterDescription(args: {
	hasCommitBlockingErrors: boolean;
	isCommitted: boolean;
}) {
	if (args.isCommitted) {
		return "This case has already produced its canonical mortgage. Use the mortgage detail page for linked borrower and property context.";
	}

	if (args.hasCommitBlockingErrors) {
		return "The review step only commits persisted data. Clear the participant, property, and mortgage validation blockers above, then try again.";
	}

	return "Commit will create canonical borrower, property, valuation, mortgage, mortgageBorrower, obligations, planned app-owned collection entries, listing projection, ledger genesis, and audit rows. Provider-managed-now cases then immediately attempt Rotessa activation, while blueprint-driven document projection remains a later seam.";
}

function ReviewWarningsBanner({
	reviewWarnings,
}: {
	reviewWarnings: string[];
}) {
	if (reviewWarnings.length === 0) {
		return null;
	}

	return (
		<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
			<div className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 size-5 text-amber-700" />
				<div className="space-y-2">
					<p className="font-medium text-amber-800 text-sm">Review warnings</p>
					<ul className="list-disc space-y-1 pl-5 text-amber-900 text-sm">
						{reviewWarnings.map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

function IdentitySyncBanner({
	pendingIdentities,
}: {
	pendingIdentities: Array<{ email: string; fullName?: string; role: string }>;
}) {
	return (
		<div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-4">
			<div className="space-y-2">
				<p className="font-medium text-sky-900 text-sm">
					Identity sync is still pending
				</p>
				<p className="text-sky-950/90 text-sm leading-6">
					WorkOS users were provisioned, but their Convex <code>users</code>{" "}
					rows have not landed yet. Canonical writes are paused at{" "}
					<code>awaiting_identity_sync</code>.
				</p>
				{pendingIdentities.length > 0 ? (
					<ul className="list-disc space-y-1 pl-5 text-sky-950 text-sm">
						{pendingIdentities.map((identity) => (
							<li key={`${identity.email}:${identity.role}`}>
								{identity.fullName
									? `${identity.fullName} (${identity.email})`
									: identity.email}
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}

function CommitErrorBanner({ message }: { message: string }) {
	return (
		<div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4">
			<p className="font-medium text-destructive text-sm">Commit failed</p>
			<p className="mt-2 text-destructive/90 text-sm leading-6">{message}</p>
		</div>
	);
}

function ReviewCommitStateBanners(args: {
	commitState: OriginationWorkspaceCommitState;
	pendingIdentities: Array<{ email: string; fullName?: string; role: string }>;
}) {
	return (
		<>
			{args.commitState.status === "validating" ? (
				<div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-4">
					<p className="font-medium text-sm">Validating persisted draft</p>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						The workspace is flushing autosave and rechecking the saved case
						before any canonical writes begin.
					</p>
				</div>
			) : null}
			{args.commitState.status === "committing" ? (
				<div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-4">
					<p className="font-medium text-sm">
						Canonical activation in progress
					</p>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						FairLend is writing the canonical borrower, property, valuation,
						mortgage, ledger, and audit rows now.
					</p>
				</div>
			) : null}
			{args.commitState.status === "awaiting_identity_sync" ? (
				<IdentitySyncBanner pendingIdentities={args.pendingIdentities} />
			) : null}
			{args.commitState.status === "failed" ? (
				<CommitErrorBanner message={args.commitState.message} />
			) : null}
		</>
	);
}

function ReviewCommitFooter(args: {
	canCommit: boolean;
	commitButtonLabel: string;
	hasCommitBlockingErrors: boolean;
	isCommitted: boolean;
	isBusy: boolean;
	onCommit: () => void;
	onOpenCommittedMortgage?: () => void;
}) {
	return (
		<div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-border/70 bg-muted/20 px-5 py-5 md:flex-row md:items-center">
			<div className="flex items-start gap-3">
				<FileClock className="mt-0.5 size-5 text-muted-foreground" />
				<div className="space-y-1">
					<p className="font-medium text-sm">
						{resolveReviewFooterTitle({
							hasCommitBlockingErrors: args.hasCommitBlockingErrors,
							isCommitted: args.isCommitted,
						})}
					</p>
					<p className="max-w-2xl text-muted-foreground text-sm leading-6">
						{resolveReviewFooterDescription({
							hasCommitBlockingErrors: args.hasCommitBlockingErrors,
							isCommitted: args.isCommitted,
						})}
					</p>
				</div>
			</div>
			{args.isCommitted ? (
				<Button
					disabled={!args.onOpenCommittedMortgage}
					onClick={args.onOpenCommittedMortgage}
					type="button"
				>
					{args.commitButtonLabel}
				</Button>
			) : (
				<Button
					disabled={!args.canCommit || args.isBusy}
					onClick={args.onCommit}
					type="button"
				>
					{args.isBusy ? (
						<LoaderCircle className="mr-2 size-4 animate-spin" />
					) : null}
					{args.commitButtonLabel}
				</Button>
			)}
		</div>
	);
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

function describeHeroImages(heroImages: ReviewHeroImages | undefined) {
	if (!(heroImages && heroImages.length > 0)) {
		return "Not staged";
	}

	return heroImages
		.map((image, index) =>
			typeof image === "string"
				? `Image ${index + 1}`
				: image.caption?.trim() || `Image ${index + 1}`
		)
		.join(", ");
}

function resolveCollectionsExecutionIntent(
	values: OriginationCaseDraftValues["collectionsDraft"]
) {
	if (values?.executionIntent) {
		return values.executionIntent;
	}

	switch (values?.mode) {
		case "app_owned_only":
			return "app_owned";
		case "provider_managed_now":
			return "provider_managed_now";
		default:
			return undefined;
	}
}

function formatCollectionsExecutionIntent(
	values: OriginationCaseDraftValues["collectionsDraft"]
) {
	const executionIntent = resolveCollectionsExecutionIntent(values);
	switch (executionIntent) {
		case "app_owned":
			return "App managed via manual";
		case "provider_managed_now":
			return "Provider managed via Rotessa payment schedule";
		default:
			return "Not staged";
	}
}

function formatCollectionsFlowSummary(
	values: OriginationCaseDraftValues["collectionsDraft"]
) {
	let borrowerSource: string | undefined;
	if (values?.borrowerSource === "existing") {
		borrowerSource = "Existing borrower";
	} else if (values?.borrowerSource === "create") {
		borrowerSource = "New borrower";
	}

	let scheduleSource: string | undefined;
	if (values?.scheduleSource === "existing") {
		scheduleSource = "Existing Rotessa schedule";
	} else if (values?.scheduleSource === "create") {
		scheduleSource = "New Rotessa schedule";
	}

	return joinValues([borrowerSource, scheduleSource]);
}

function formatPadAuthorizationSummary(
	values: OriginationCaseDraftValues["collectionsDraft"]
) {
	let padAuthorizationSource: string | undefined;
	if (values?.padAuthorizationSource === "uploaded") {
		padAuthorizationSource = "Signed PAD uploaded";
	} else if (values?.padAuthorizationSource === "admin_override") {
		padAuthorizationSource = "Admin override";
	}

	return joinValues([
		padAuthorizationSource,
		values?.padAuthorizationAssetId,
		values?.padAuthorizationOverrideReason,
	]);
}

export function ReviewStep({
	canCommit,
	commitState,
	committedMortgageId,
	onCommit,
	onOpenCommittedMortgage,
	snapshot,
	values,
}: ReviewStepProps) {
	const reviewWarnings = snapshot?.reviewWarnings ?? [];
	const stepErrors = [
		...getOriginationStepErrors(snapshot, "participants"),
		...getOriginationStepErrors(snapshot, "property"),
		...getOriginationStepErrors(snapshot, "mortgageTerms"),
	];
	const commitBlockingErrors = getOriginationCommitBlockingErrors(snapshot);
	const isBusy =
		commitState.status === "validating" || commitState.status === "committing";
	const isCommitted =
		commitState.status === "committed" || Boolean(committedMortgageId);
	const pendingIdentities =
		commitState.status === "awaiting_identity_sync"
			? commitState.pendingIdentities
			: [];
	const commitButtonLabel = resolveCommitButtonLabel({
		commitState,
		isCommitted,
	});

	return (
		<OriginationStepCard errors={stepErrors} title="Review + commit">
			<ReviewWarningsBanner reviewWarnings={reviewWarnings} />

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
							label="Broker of record"
							value={
								values.participantsDraft?.brokerOfRecordLabel ??
								values.participantsDraft?.brokerOfRecordId ??
								"Not staged"
							}
						/>
						<ReviewField
							label="Assigned broker"
							value={
								values.participantsDraft?.assignedBrokerLabel ??
								values.participantsDraft?.assignedBrokerId ??
								"Not staged"
							}
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
							label="Execution intent"
							value={formatCollectionsExecutionIntent(values.collectionsDraft)}
						/>
						<ReviewField
							label="Execution strategy"
							value={values.collectionsDraft?.executionStrategy ?? "Not staged"}
						/>
						<ReviewField
							label="Provider"
							value={values.collectionsDraft?.providerCode ?? "Not staged"}
						/>
						<ReviewField
							label="Borrower / schedule"
							value={formatCollectionsFlowSummary(values.collectionsDraft)}
						/>
						<ReviewField
							label="PAD authorization"
							value={formatPadAuthorizationSummary(values.collectionsDraft)}
						/>
						<ReviewField
							label="Selected rail details"
							value={joinValues([
								values.collectionsDraft?.selectedBorrowerId,
								values.collectionsDraft?.selectedProviderScheduleId,
								values.collectionsDraft?.selectedExistingExternalScheduleId,
								values.collectionsDraft?.selectedBankAccountId,
							])}
						/>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Documents</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm leading-6">
						{ORIGINATION_DOCUMENT_SECTIONS.map((section) => (
							<div
								className="rounded-xl border border-dashed px-4 py-3"
								key={section.documentClass}
							>
								<p className="font-medium">{section.label}</p>
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
							value={describeHeroImages(values.listingOverrides?.heroImages)}
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

			<ReviewCommitStateBanners
				commitState={commitState}
				pendingIdentities={pendingIdentities}
			/>
			<ReviewCommitFooter
				canCommit={canCommit}
				commitButtonLabel={commitButtonLabel}
				hasCommitBlockingErrors={commitBlockingErrors.length > 0}
				isBusy={isBusy}
				isCommitted={isCommitted}
				onCommit={onCommit}
				onOpenCommittedMortgage={onOpenCommittedMortgage}
			/>
		</OriginationStepCard>
	);
}
