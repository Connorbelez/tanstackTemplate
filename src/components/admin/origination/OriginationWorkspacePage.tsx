import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronLeft,
	ChevronRight,
	FileClock,
	FolderKanban,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminBreadcrumbLabel } from "#/components/admin/shell/AdminPageMetadataContext";
import {
	AdminNotFoundState,
	AdminPageSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import {
	INITIAL_ORIGINATION_STEP,
	ORIGINATION_STEPS,
	type OriginationStepKey,
} from "#/lib/admin-origination";
import { releaseOriginationBootstrapForCase } from "#/lib/admin-origination-bootstrap";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CollectionsStep } from "./CollectionsStep";
import { DocumentsStep } from "./DocumentsStep";
import { ListingCurationStep } from "./ListingCurationStep";
import { MortgageTermsStep } from "./MortgageTermsStep";
import { OriginationStepper } from "./OriginationStepper";
import { ParticipantsStep } from "./ParticipantsStep";
import { PropertyStep } from "./PropertyStep";
import { ReviewStep } from "./ReviewStep";
import { SaveStateIndicator } from "./SaveStateIndicator";
import {
	buildOriginationStepperItems,
	buildOriginationWorkspaceSubtitle,
	buildOriginationWorkspaceTitle,
	createOriginationDraftPatch,
	extractOriginationDraft,
	formatOriginationDateTime,
	getOriginationStepErrors,
	type OriginationCasePatch,
	type OriginationWorkspaceSaveState,
	resolveOriginationReviewValues,
} from "./workflow";

interface OriginationWorkspacePageProps {
	caseId: string;
}

const SAVE_DEBOUNCE_MS = 450;

function resolveSaveErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Unable to save draft";
}

function resolveSettledSaveState(
	currentVersion: number,
	targetVersion: number,
	settledState: Extract<OriginationWorkspaceSaveState, "error" | "saved">
): OriginationWorkspaceSaveState {
	return currentVersion > targetVersion ? "pending" : settledState;
}

export function OriginationWorkspacePage({
	caseId,
}: OriginationWorkspacePageProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const caseRecord = useQuery(api.admin.origination.cases.getCase, {
		caseId: typedCaseId,
	});
	const patchCase = useMutation(api.admin.origination.cases.patchCase);
	const [draft, setDraft] = useState<OriginationCasePatch>(() =>
		extractOriginationDraft(undefined)
	);
	const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(undefined);
	const [saveError, setSaveError] = useState<string | undefined>(undefined);
	const [saveState, setSaveState] =
		useState<OriginationWorkspaceSaveState>("idle");
	const hydratedCaseIdRef = useRef<string | undefined>(undefined);
	const latestDraftRef = useRef<OriginationCasePatch>(draft);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveInFlightRef = useRef(false);
	const versionRef = useRef(0);
	const lastSavedVersionRef = useRef(0);
	const queueSaveRef = useRef<(immediate?: boolean) => void>(() => undefined);

	useEffect(() => {
		latestDraftRef.current = draft;
	}, [draft]);

	useEffect(() => {
		if (!caseRecord || hydratedCaseIdRef.current === caseRecord._id) {
			return;
		}

		const nextDraft = extractOriginationDraft(caseRecord);
		hydratedCaseIdRef.current = caseRecord._id;
		latestDraftRef.current = nextDraft;
		setDraft(nextDraft);
		setLastSavedAt(caseRecord.updatedAt);
		setSaveError(undefined);
		setSaveState("saved");
		versionRef.current = 0;
		lastSavedVersionRef.current = 0;
	}, [caseRecord]);

	useEffect(() => {
		if (!caseRecord?._id) {
			return;
		}

		releaseOriginationBootstrapForCase(caseRecord._id);
	}, [caseRecord?._id]);

	const persistDraft = useCallback(
		async (targetVersion: number) => {
			saveInFlightRef.current = true;
			setSaveState("saving");
			setSaveError(undefined);

			try {
				const updated = await patchCase({
					caseId: typedCaseId,
					patch: createOriginationDraftPatch(
						latestDraftRef.current
					) as Parameters<typeof patchCase>[0]["patch"],
				});

				lastSavedVersionRef.current = targetVersion;
				setLastSavedAt(updated.updatedAt);
				setSaveState(
					resolveSettledSaveState(versionRef.current, targetVersion, "saved")
				);
			} catch (error) {
				setSaveError(resolveSaveErrorMessage(error));
				setSaveState(
					resolveSettledSaveState(versionRef.current, targetVersion, "error")
				);
			} finally {
				saveInFlightRef.current = false;
				if (versionRef.current > lastSavedVersionRef.current) {
					queueSaveRef.current(true);
				}
			}
		},
		[patchCase, typedCaseId]
	);

	const queueSave = useCallback(
		(immediate = false) => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
			}

			saveTimerRef.current = setTimeout(
				() => {
					if (saveInFlightRef.current) {
						return;
					}

					const targetVersion = versionRef.current;
					if (targetVersion <= lastSavedVersionRef.current) {
						return;
					}

					void persistDraft(targetVersion);
				},
				immediate ? 0 : SAVE_DEBOUNCE_MS
			);
		},
		[persistDraft]
	);

	useEffect(() => {
		queueSaveRef.current = queueSave;
	}, [queueSave]);

	useEffect(
		() => () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
			}
		},
		[]
	);

	const applyDraftUpdate = useCallback(
		(
			updater: (current: OriginationCasePatch) => OriginationCasePatch,
			options?: { immediate?: boolean }
		) => {
			setDraft((current) => {
				const nextDraft = updater(current);
				latestDraftRef.current = nextDraft;
				return nextDraft;
			});
			versionRef.current += 1;
			setSaveError(undefined);
			setSaveState("pending");
			queueSave(options?.immediate === true);
		},
		[queueSave]
	);

	const currentStep =
		draft.currentStep ??
		caseRecord?.currentStep ??
		caseRecord?.recommendedStep ??
		INITIAL_ORIGINATION_STEP;
	const currentStepIndex = ORIGINATION_STEPS.findIndex(
		(step) => step.key === currentStep
	);
	const currentStepErrors = getOriginationStepErrors(
		caseRecord?.validationSnapshot,
		currentStep
	);
	const stepperItems = useMemo(
		() =>
			buildOriginationStepperItems({
				currentStep,
				snapshot: caseRecord?.validationSnapshot,
				values: draft,
			}),
		[currentStep, caseRecord?.validationSnapshot, draft]
	);

	const pageTitle = buildOriginationWorkspaceTitle({
		caseId,
		label: caseRecord?.label,
		values: draft,
	});

	useAdminBreadcrumbLabel(pageTitle);

	if (caseRecord === undefined) {
		return (
			<AdminPageSkeleton titleWidth="w-80">
				<div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
					<Card className="h-72 border-border/70" />
					<Card className="h-[34rem] border-border/70" />
				</div>
			</AdminPageSkeleton>
		);
	}

	if (caseRecord === null) {
		return (
			<AdminNotFoundState entityType="origination case" variant="record" />
		);
	}

	const goToStep = (step: OriginationStepKey) => {
		applyDraftUpdate(
			(current) => ({
				...current,
				currentStep: step,
			}),
			{ immediate: true }
		);
	};

	const previousStep =
		currentStepIndex > 0 ? ORIGINATION_STEPS[currentStepIndex - 1]?.key : null;
	const nextStep =
		currentStepIndex >= 0 && currentStepIndex < ORIGINATION_STEPS.length - 1
			? ORIGINATION_STEPS[currentStepIndex + 1]?.key
			: null;

	const commonStepDescription = (
		<div className="grid gap-4 sm:grid-cols-2">
			<div className="rounded-2xl border border-border/70 px-4 py-4">
				<p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">
					Case ID
				</p>
				<p className="mt-2 font-semibold">
					{buildOriginationWorkspaceSubtitle(caseId)}
				</p>
			</div>
			<div className="rounded-2xl border border-border/70 px-4 py-4">
				<p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">
					Last persisted
				</p>
				<p className="mt-2 font-semibold">
					{formatOriginationDateTime(lastSavedAt)}
				</p>
			</div>
		</div>
	);

	return (
		<div className="space-y-6">
			<div className="rounded-[2rem] border border-border/70 bg-card px-6 py-6 shadow-sm">
				<div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<Badge className="border border-border/70" variant="outline">
								{caseRecord.status}
							</Badge>
							<Badge className="border border-border/70" variant="outline">
								{ORIGINATION_STEPS[currentStepIndex]?.label ?? "Participants"}
							</Badge>
						</div>
						<div className="space-y-2">
							<p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.18em]">
								Phase 1 workspace
							</p>
							<h1 className="font-semibold text-3xl tracking-tight">
								{pageTitle}
							</h1>
							<p className="max-w-3xl text-muted-foreground text-sm leading-6">
								Stage every origination input in one backoffice aggregate. Later
								phases enable identity sync, canonical mortgage construction,
								listing projection, payments, and documents from this exact
								route family.
							</p>
						</div>
					</div>
					<div className="flex flex-col items-start gap-3 xl:items-end">
						<SaveStateIndicator
							errorMessage={saveError}
							lastSavedAt={lastSavedAt}
							state={saveState}
						/>
						<Button asChild type="button" variant="outline">
							<Link search={EMPTY_ADMIN_DETAIL_SEARCH} to="/admin/originations">
								<FolderKanban className="mr-2 size-4" />
								Back to drafts
							</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
				<div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
					<OriginationStepper
						currentStep={currentStep}
						items={stepperItems}
						onSelectStep={goToStep}
					/>
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="text-base">Draft contract</CardTitle>
							<CardDescription>
								This page persists a staging aggregate only. It intentionally
								creates zero canonical domain rows.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm leading-6">
							<div className="flex items-start gap-3">
								<FileClock className="mt-0.5 size-4 text-muted-foreground" />
								<p>
									Refresh restores the saved draft exactly from{" "}
									<code>adminOriginationCases</code>.
								</p>
							</div>
							<div className="flex items-start gap-3">
								<FileClock className="mt-0.5 size-4 text-muted-foreground" />
								<p>
									Collections and documents are phase-1 shells only, but the
									route and payload shape are now stable for downstream work.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-6">
					{commonStepDescription}

					{currentStep === "participants" ? (
						<ParticipantsStep
							draft={draft.participantsDraft}
							errors={currentStepErrors}
							onChange={(participantsDraft) =>
								applyDraftUpdate((current) => ({
									...current,
									participantsDraft,
								}))
							}
						/>
					) : null}
					{currentStep === "property" ? (
						<PropertyStep
							errors={currentStepErrors}
							onChange={({ propertyDraft, valuationDraft }) =>
								applyDraftUpdate((current) => ({
									...current,
									propertyDraft,
									valuationDraft,
								}))
							}
							propertyDraft={draft.propertyDraft}
							valuationDraft={draft.valuationDraft}
						/>
					) : null}
					{currentStep === "mortgageTerms" ? (
						<MortgageTermsStep
							draft={draft.mortgageDraft}
							errors={currentStepErrors}
							onChange={(mortgageDraft) =>
								applyDraftUpdate((current) => ({
									...current,
									mortgageDraft,
								}))
							}
						/>
					) : null}
					{currentStep === "collections" ? (
						<CollectionsStep
							draft={draft.collectionsDraft}
							errors={currentStepErrors}
							onChange={(collectionsDraft) =>
								applyDraftUpdate((current) => ({
									...current,
									collectionsDraft,
								}))
							}
						/>
					) : null}
					{currentStep === "documents" ? (
						<DocumentsStep errors={currentStepErrors} />
					) : null}
					{currentStep === "listingCuration" ? (
						<ListingCurationStep
							draft={draft.listingOverrides}
							errors={currentStepErrors}
							onChange={(listingOverrides) =>
								applyDraftUpdate((current) => ({
									...current,
									listingOverrides,
								}))
							}
						/>
					) : null}
					{currentStep === "review" ? (
						<ReviewStep
							snapshot={caseRecord.validationSnapshot}
							values={resolveOriginationReviewValues(caseRecord, draft)}
						/>
					) : null}

					<div className="flex flex-col gap-4 rounded-[2rem] border border-border/70 bg-card px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<p className="font-medium text-sm">
								{currentStepErrors.length > 0
									? `${currentStepErrors.length} validation issue${
											currentStepErrors.length === 1 ? "" : "s"
										} on this step`
									: "This step has no saved validation blockers"}
							</p>
							<p className="text-muted-foreground text-sm">
								Navigation is persistent. Step changes save immediately so
								refresh reopens the same part of the workflow.
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Button
								disabled={!previousStep}
								onClick={() => previousStep && goToStep(previousStep)}
								type="button"
								variant="outline"
							>
								<ChevronLeft className="mr-2 size-4" />
								Back
							</Button>
							<Button
								disabled={!nextStep}
								onClick={() => nextStep && goToStep(nextStep)}
								type="button"
							>
								Next step
								<ChevronRight className="ml-2 size-4" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
