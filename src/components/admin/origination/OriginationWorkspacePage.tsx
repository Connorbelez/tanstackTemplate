import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, FolderKanban } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminBreadcrumbLabel } from "#/components/admin/shell/AdminPageMetadataContext";
import {
	AdminNotFoundState,
	AdminPageSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
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
import { OriginationWorkspaceHero } from "./OriginationWorkspaceHero";
import { ParticipantsStep } from "./ParticipantsStep";
import { PropertyStep } from "./PropertyStep";
import { ReviewStep } from "./ReviewStep";
import {
	buildOriginationStepperItems,
	buildOriginationWorkspaceTitle,
	createOriginationDraftPatch,
	extractOriginationDraft,
	getOriginationCommitBlockingErrors,
	getOriginationStepErrors,
	type OriginationCasePatch,
	type OriginationWorkspaceCommitState,
	type OriginationWorkspaceRecord,
	type OriginationWorkspaceSaveState,
	resolveOriginationCommitStateFromRecord,
	resolveOriginationReviewValues,
} from "./workflow";

interface OriginationWorkspacePageProps {
	caseId: string;
}

const SAVE_DEBOUNCE_MS = 450;

function resolveErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function resolveSettledSaveState(
	currentVersion: number,
	targetVersion: number,
	settledState: Extract<OriginationWorkspaceSaveState, "error" | "saved">
): OriginationWorkspaceSaveState {
	return currentVersion > targetVersion ? "pending" : settledState;
}

function resolveEffectiveCommitState(args: {
	caseRecord: OriginationWorkspaceRecord | null | undefined;
	commitState: OriginationWorkspaceCommitState;
}): OriginationWorkspaceCommitState {
	if (args.commitState.status !== "idle") {
		return args.commitState;
	}

	return resolveOriginationCommitStateFromRecord(args.caseRecord);
}

function renderOriginationStepContent(args: {
	applyDraftUpdate: (
		updater: (current: OriginationCasePatch) => OriginationCasePatch,
		options?: { immediate?: boolean }
	) => void;
	canCommit: boolean;
	caseRecord: OriginationWorkspaceRecord;
	commitState: OriginationWorkspaceCommitState;
	currentStep: OriginationStepKey;
	currentStepErrors: string[];
	draft: OriginationCasePatch;
	handleCommit: () => void;
	openCommittedMortgage: (mortgageId: string) => void;
}) {
	switch (args.currentStep) {
		case "participants":
			return (
				<ParticipantsStep
					caseId={args.caseRecord._id}
					draft={args.draft.participantsDraft}
					errors={args.currentStepErrors}
					onChange={(participantsDraft) =>
						args.applyDraftUpdate((current) => ({
							...current,
							participantsDraft,
						}))
					}
				/>
			);
		case "property":
			return (
				<PropertyStep
					caseId={args.caseRecord._id}
					errors={args.currentStepErrors}
					onChange={({ propertyDraft, valuationDraft }) =>
						args.applyDraftUpdate((current) => ({
							...current,
							propertyDraft,
							valuationDraft,
						}))
					}
					propertyDraft={args.draft.propertyDraft}
					valuationDraft={args.draft.valuationDraft}
				/>
			);
		case "mortgageTerms":
			return (
				<MortgageTermsStep
					draft={args.draft.mortgageDraft}
					errors={args.currentStepErrors}
					onChange={(mortgageDraft) =>
						args.applyDraftUpdate((current) => ({
							...current,
							mortgageDraft,
						}))
					}
				/>
			);
		case "collections":
			return (
				<CollectionsStep
					caseId={args.caseRecord._id}
					draft={args.draft.collectionsDraft}
					errors={args.currentStepErrors}
					mortgageDraft={args.draft.mortgageDraft}
					onChange={(collectionsDraft) =>
						args.applyDraftUpdate((current) => ({
							...current,
							collectionsDraft,
						}))
					}
					onDraftHydration={(patch) =>
						args.applyDraftUpdate((current) => ({
							...current,
							mortgageDraft: patch.mortgageDraft ?? current.mortgageDraft,
							participantsDraft:
								patch.participantsDraft ?? current.participantsDraft,
						}))
					}
					participantsDraft={args.draft.participantsDraft}
				/>
			);
		case "documents":
			return (
				<DocumentsStep
					caseId={args.caseRecord._id}
					errors={args.currentStepErrors}
				/>
			);
		case "listingCuration":
			return (
				<ListingCurationStep
					draft={args.draft.listingOverrides}
					errors={args.currentStepErrors}
					onChange={(listingOverrides) =>
						args.applyDraftUpdate((current) => ({
							...current,
							listingOverrides,
						}))
					}
				/>
			);
		case "review": {
			const committedMortgageId =
				args.commitState.status === "committed"
					? args.commitState.committedMortgageId
					: args.caseRecord.committedMortgageId;
			return (
				<ReviewStep
					canCommit={args.canCommit}
					commitState={args.commitState}
					committedMortgageId={committedMortgageId}
					onCommit={args.handleCommit}
					onOpenCommittedMortgage={
						committedMortgageId
							? () => args.openCommittedMortgage(committedMortgageId)
							: undefined
					}
					snapshot={args.caseRecord.validationSnapshot}
					values={resolveOriginationReviewValues(args.caseRecord, args.draft)}
				/>
			);
		}
		default:
			return null;
	}
}

export function OriginationWorkspacePage({
	caseId,
}: OriginationWorkspacePageProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const navigate = useNavigate({ from: "/admin/originations/$caseId" });
	const caseRecord = useQuery(api.admin.origination.cases.getCase, {
		caseId: typedCaseId,
	});
	const commitCase = useAction(api.admin.origination.commit.commitCase);
	const patchCase = useMutation(api.admin.origination.cases.patchCase);
	const [draft, setDraft] = useState<OriginationCasePatch>(() =>
		extractOriginationDraft(undefined)
	);
	const [commitState, setCommitState] =
		useState<OriginationWorkspaceCommitState>({
			status: "idle",
		});
	const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(undefined);
	const [saveError, setSaveError] = useState<string | undefined>(undefined);
	const [saveState, setSaveState] =
		useState<OriginationWorkspaceSaveState>("idle");
	const hydratedCaseIdRef = useRef<string | undefined>(undefined);
	const latestDraftRef = useRef<OriginationCasePatch>(draft);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveInFlightRef = useRef(false);
	const savePromiseRef = useRef<Promise<void> | null>(null);
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
		setCommitState((current) =>
			current.status === "validating" || current.status === "committing"
				? current
				: resolveOriginationCommitStateFromRecord(caseRecord)
		);
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
		(targetVersion: number) => {
			const savePromise = (async () => {
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
					setSaveError(resolveErrorMessage(error, "Unable to save draft"));
					setSaveState(
						resolveSettledSaveState(versionRef.current, targetVersion, "error")
					);
					throw error;
				} finally {
					saveInFlightRef.current = false;
					if (versionRef.current > lastSavedVersionRef.current) {
						queueSaveRef.current(true);
					}
				}
			})();

			const trackedSavePromise = savePromise.finally(() => {
				if (savePromiseRef.current === trackedSavePromise) {
					savePromiseRef.current = null;
				}
			});
			savePromiseRef.current = trackedSavePromise;
			return trackedSavePromise;
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

					void persistDraft(targetVersion).catch(() => undefined);
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
			setCommitState({ status: "idle" });
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
	const commitBlockingErrors = getOriginationCommitBlockingErrors(
		caseRecord?.validationSnapshot
	);
	const canCommit =
		commitBlockingErrors.length === 0 && caseRecord?.status !== "committed";
	const effectiveCommitState = resolveEffectiveCommitState({
		caseRecord: caseRecord as OriginationWorkspaceRecord | null | undefined,
		commitState,
	});
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

	const openCommittedMortgage = useCallback(
		async (mortgageId: string) => {
			await navigate({
				to: "/admin/mortgages/$recordid",
				params: { recordid: mortgageId },
				replace: true,
				search: EMPTY_ADMIN_DETAIL_SEARCH,
			});
		},
		[navigate]
	);

	const flushDraftBeforeCommit = useCallback(async () => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}

		if (savePromiseRef.current) {
			await savePromiseRef.current;
		}

		const targetVersion = versionRef.current;
		if (targetVersion > lastSavedVersionRef.current) {
			await persistDraft(targetVersion);
		}
	}, [persistDraft]);

	const handleCommit = useCallback(async () => {
		if (!caseRecord) {
			return;
		}

		setCommitState({ status: "validating" });

		try {
			await flushDraftBeforeCommit();
			setCommitState({ status: "committing" });
			const result = await commitCase({ caseId: typedCaseId });

			if (result.status === "awaiting_identity_sync") {
				setCommitState({
					pendingIdentities: result.pendingIdentities,
					status: "awaiting_identity_sync",
				});
				return;
			}

			setCommitState({
				committedMortgageId: result.committedMortgageId,
				status: "committed",
			});
			await openCommittedMortgage(result.committedMortgageId);
		} catch (error) {
			setCommitState({
				message: resolveErrorMessage(error, "Unable to commit origination"),
				status: "failed",
			});
		}
	}, [
		caseRecord,
		commitCase,
		flushDraftBeforeCommit,
		openCommittedMortgage,
		typedCaseId,
	]);

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

	return (
		<div className="space-y-6">
			<OriginationWorkspaceHero
				actions={
					<Button asChild type="button" variant="outline">
						<Link search={EMPTY_ADMIN_DETAIL_SEARCH} to="/admin/originations">
							<FolderKanban className="mr-2 size-4" />
							Back to drafts
						</Link>
					</Button>
				}
				caseStatus={caseRecord.status}
				currentStepLabel={
					ORIGINATION_STEPS[currentStepIndex]?.label ?? "Participants"
				}
				lastSavedAt={lastSavedAt}
				pageTitle={pageTitle}
				saveError={saveError}
				saveState={saveState}
			/>

			<div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
				<div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
					<OriginationStepper
						currentStep={currentStep}
						items={stepperItems}
						onSelectStep={goToStep}
					/>
				</div>

				<div className="space-y-6">
					{renderOriginationStepContent({
						applyDraftUpdate,
						canCommit,
						caseRecord: caseRecord as OriginationWorkspaceRecord,
						commitState: effectiveCommitState,
						currentStep,
						currentStepErrors,
						draft,
						handleCommit: () => void handleCommit(),
						openCommittedMortgage: (mortgageId) =>
							void openCommittedMortgage(mortgageId),
					})}

					<div className="flex flex-col gap-4 rounded-[2rem] border border-border/70 bg-card px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="font-medium text-sm">
								{currentStepErrors.length > 0
									? `${currentStepErrors.length} validation issue${
											currentStepErrors.length === 1 ? "" : "s"
										} on this step`
									: "This step has no saved validation blockers"}
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
