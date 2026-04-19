import { useAction, useMutation, useQuery } from "convex/react";
import { LoaderCircle, Plus, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BorrowerAutocompleteField } from "#/components/admin/origination/BorrowerAutocompleteField";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { Textarea } from "#/components/ui/textarea";
import type {
	OriginationCollectionsDraft,
	OriginationMortgageDraft,
	OriginationParticipantsDraft,
	OriginationPaymentFrequency,
} from "#/lib/admin-origination";
import {
	defaultDocumentAssetName,
	uploadDocumentAsset,
} from "#/lib/documents/uploadDocumentAsset";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	type BorrowerAutocompleteOption,
	listBorrowerAutocompleteOptions,
	resolveSelectedBorrowerOption,
} from "./borrower-autocomplete-model";
import {
	buildBankAccountLabel,
	buildBorrowerDisplayLabel,
	buildIntentDraft,
	buildMortgageHydration,
	buildParticipantsHydration,
	buildProviderManagedDraft,
	COLLECTION_OPTIONS,
	formatCurrency,
	formatStatusLabel,
	resolveExecutionIntent,
} from "./collections-step-model";
import { OriginationStepCard } from "./OriginationStepCard";

interface CollectionsAvailableSchedule {
	bankAccountSummary: string | null;
	disabledReason: string | null;
	firstPaymentDate: string | null;
	frequencySummary: string;
	isAssignedToMortgage: boolean;
	isReservedForCurrentCase: boolean;
	label: string;
	nextProcessDate: string | null;
	originationPaymentFrequency: OriginationPaymentFrequency | null;
	paymentAmountCents: number | null;
	scheduleId: string;
	status: string;
}

interface CollectionsBankAccountOption {
	accountLast4: string | null;
	bankAccountId: string;
	eligibilityErrors: string[];
	hasRotessaCustomerReference: boolean;
	institutionNumber: string | null;
	isDefaultInbound: boolean;
	mandateStatus: string;
	status: string;
	transitNumber: string | null;
	validationMethod: string | null;
}

interface CollectionsSetupContext {
	activationStatus: "active" | "activating" | "failed" | "pending" | null;
	availableSchedules: CollectionsAvailableSchedule[];
	bankAccounts: CollectionsBankAccountOption[];
	mortgageTerms: {
		firstPaymentDate: string | null;
		paymentAmount: number | null;
		paymentFrequency: OriginationPaymentFrequency | null;
	} | null;
	preflightErrors: string[];
	primaryBorrower: {
		borrowerId: string | null;
		email: string | null;
		fullName: string | null;
		message: string;
		state: string;
	} | null;
	providerCode: "pad_rotessa";
	searchResults: BorrowerAutocompleteOption[];
	selectedBankAccount: CollectionsBankAccountOption | null;
}

interface CreatedBorrowerResult {
	bankAccountId?: string;
	borrowerId: string;
	email: string;
	fullName: string;
}

interface CreatedScheduleResult {
	borrower: {
		_id: string;
		email: string;
		fullName: string;
	};
	firstPaymentDate: string;
	paymentAmountCents: number;
	paymentFrequency: OriginationPaymentFrequency | null | undefined;
	providerScheduleId: string;
}

interface DraftHydrationPatch {
	mortgageDraft?: OriginationMortgageDraft;
	participantsDraft?: OriginationParticipantsDraft;
}

interface CollectionsStepProps {
	caseId: string;
	draft?: OriginationCollectionsDraft;
	errors?: readonly string[];
	mortgageDraft?: OriginationMortgageDraft;
	onChange: (nextDraft: OriginationCollectionsDraft | undefined) => void;
	onDraftHydration?: (patch: DraftHydrationPatch) => void;
	participantsDraft?: OriginationParticipantsDraft;
}

interface CreateBorrowerFormState {
	accountNumber: string;
	email: string;
	fullName: string;
	institutionNumber: string;
	phone: string;
	transitNumber: string;
}

const INITIAL_CREATE_BORROWER_FORM: CreateBorrowerFormState = {
	accountNumber: "",
	email: "",
	fullName: "",
	institutionNumber: "",
	phone: "",
	transitNumber: "",
};

function buildExistingScheduleCardClass(args: {
	checked: boolean;
	disabled: boolean;
}) {
	if (args.disabled) {
		return "cursor-not-allowed border-border/70 bg-muted/40 text-muted-foreground opacity-70";
	}

	if (args.checked) {
		return "border-sky-500/40 bg-sky-500/10";
	}

	return "border-border/70 hover:bg-muted/50";
}

function buildBankAccountOptionClass(args: {
	checked: boolean;
	isDisabled: boolean;
}) {
	if (args.isDisabled) {
		return "cursor-not-allowed border-border/70 bg-muted/40 opacity-70";
	}

	if (args.checked) {
		return "border-sky-500/40 bg-sky-500/10";
	}

	return "cursor-pointer border-border/70 hover:bg-muted/50";
}

export function CollectionsStep({
	caseId,
	draft,
	errors,
	mortgageDraft,
	onChange,
	onDraftHydration,
	participantsDraft,
}: CollectionsStepProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const setupContext = useQuery(
		api.admin.origination.collections.getCollectionsSetupContext,
		{
			caseId: typedCaseId,
		}
	) as CollectionsSetupContext | undefined;
	const createBorrower = useAction(
		api.admin.origination.collections.createBorrowerForCollections
	);
	const createRotessaSchedule = useAction(
		api.admin.origination.collections.createRotessaScheduleForCase
	);
	const generateUploadUrl = useMutation(api.documents.assets.generateUploadUrl);
	const extractPdfMetadata = useAction(api.documents.assets.extractPdfMetadata);
	const createAsset = useMutation(api.documents.assets.create);

	const nextDraft = draft ?? {};
	const executionIntent = resolveExecutionIntent(nextDraft);
	const isAppOwned = executionIntent === "app_owned";
	const isProviderManagedNow = executionIntent === "provider_managed_now";
	const [borrowerSearch, setBorrowerSearch] = useState("");
	const [isCreateBorrowerOpen, setIsCreateBorrowerOpen] = useState(false);
	const [createBorrowerForm, setCreateBorrowerForm] = useState(
		INITIAL_CREATE_BORROWER_FORM
	);
	const [isCreatingBorrower, setIsCreatingBorrower] = useState(false);
	const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
	const [isUploadingPad, setIsUploadingPad] = useState(false);
	const [padFile, setPadFile] = useState<File | null>(null);
	const [optimisticBorrower, setOptimisticBorrower] =
		useState<BorrowerAutocompleteOption | null>(null);
	const [optimisticSchedule, setOptimisticSchedule] =
		useState<CollectionsAvailableSchedule | null>(null);

	const primaryBorrower = setupContext?.primaryBorrower ?? null;
	const searchResults = useMemo(() => {
		const results = setupContext?.searchResults ?? [];
		if (
			optimisticBorrower &&
			!results.some(
				(borrower) => borrower.borrowerId === optimisticBorrower.borrowerId
			)
		) {
			return [optimisticBorrower, ...results];
		}
		return results;
	}, [optimisticBorrower, setupContext?.searchResults]);
	const availableSchedules = useMemo(() => {
		const schedules = setupContext?.availableSchedules ?? [];
		if (
			optimisticSchedule &&
			!schedules.some(
				(schedule) => schedule.scheduleId === optimisticSchedule.scheduleId
			)
		) {
			return [optimisticSchedule, ...schedules];
		}
		return schedules;
	}, [optimisticSchedule, setupContext?.availableSchedules]);
	const mortgageTerms = setupContext?.mortgageTerms ?? null;
	const setupBankAccounts = setupContext?.bankAccounts ?? [];
	const effectiveBorrowerId = nextDraft.selectedBorrowerId ?? undefined;
	const stagedPrimaryBorrower = useMemo(
		() =>
			resolveSelectedBorrowerOption({
				borrowerOptions: searchResults,
				fallbackBorrower:
					primaryBorrower?.borrowerId === null
						? null
						: {
								borrowerId: primaryBorrower?.borrowerId ?? "",
								email: primaryBorrower?.email ?? null,
								fullName: primaryBorrower?.fullName ?? null,
							},
				selectedBorrowerId: primaryBorrower?.borrowerId ?? undefined,
			}),
		[primaryBorrower, searchResults]
	);
	const selectedBorrower = useMemo(
		() =>
			resolveSelectedBorrowerOption({
				borrowerOptions: searchResults,
				fallbackBorrower:
					nextDraft.selectedBorrowerId === undefined
						? null
						: {
								borrowerId: nextDraft.selectedBorrowerId,
								email: participantsDraft?.primaryBorrower?.email ?? null,
								fullName: participantsDraft?.primaryBorrower?.fullName ?? null,
							},
				selectedBorrowerId: nextDraft.selectedBorrowerId,
			}),
		[
			nextDraft.selectedBorrowerId,
			participantsDraft?.primaryBorrower?.email,
			participantsDraft?.primaryBorrower?.fullName,
			searchResults,
		]
	);
	const filteredBorrowers = useMemo(() => {
		return listBorrowerAutocompleteOptions({
			borrowerOptions: searchResults,
			search: borrowerSearch,
			selectedBorrower,
		});
	}, [borrowerSearch, searchResults, selectedBorrower]);
	const selectedSchedule =
		availableSchedules.find(
			(schedule) =>
				schedule.scheduleId ===
				(nextDraft.selectedProviderScheduleId ??
					nextDraft.selectedExistingExternalScheduleId)
		) ?? null;
	const providerActivationStatus =
		nextDraft.providerManagedActivationStatus ?? nextDraft.activationStatus;

	useEffect(() => {
		if (selectedBorrower) {
			setBorrowerSearch(buildBorrowerDisplayLabel(selectedBorrower));
		}
	}, [selectedBorrower]);

	const hydrateBorrower = (borrower: {
		borrowerId: string;
		email: string | null;
		fullName: string | null;
	}) => {
		onDraftHydration?.({
			participantsDraft: buildParticipantsHydration(
				participantsDraft,
				borrower
			),
		});
	};

	const hydrateSchedule = (
		schedule: Pick<
			CollectionsAvailableSchedule,
			"firstPaymentDate" | "originationPaymentFrequency" | "paymentAmountCents"
		>
	) => {
		onDraftHydration?.({
			mortgageDraft: buildMortgageHydration(mortgageDraft, schedule),
		});
	};

	const selectBorrower = (
		borrower: BorrowerAutocompleteOption,
		source: "create" | "existing",
		nextSelectedBankAccountId?: string
	) => {
		setBorrowerSearch(buildBorrowerDisplayLabel(borrower));
		onChange(
			buildProviderManagedDraft(nextDraft, {
				borrowerSource: source,
				scheduleSource: source === "create" ? "create" : "existing",
				selectedBankAccountId: nextSelectedBankAccountId,
				selectedBorrowerId: borrower.borrowerId,
				selectedExistingExternalScheduleId: undefined,
				selectedProviderScheduleId: undefined,
			})
		);
		hydrateBorrower(borrower);
	};

	const clearSelectedBorrower = (nextSearch = "") => {
		setBorrowerSearch(nextSearch);
		onChange(
			buildProviderManagedDraft(nextDraft, {
				borrowerSource: undefined,
				scheduleSource: undefined,
				selectedBankAccountId: undefined,
				selectedBorrowerId: undefined,
				selectedExistingExternalScheduleId: undefined,
				selectedProviderScheduleId: undefined,
			})
		);
	};

	const selectExistingSchedule = (schedule: CollectionsAvailableSchedule) => {
		if (!effectiveBorrowerId) {
			return;
		}
		onChange(
			buildProviderManagedDraft(nextDraft, {
				borrowerSource: nextDraft.borrowerSource ?? "existing",
				scheduleSource: "existing",
				selectedExistingExternalScheduleId: schedule.scheduleId,
				selectedProviderScheduleId: schedule.scheduleId,
			})
		);
		if (selectedBorrower) {
			hydrateBorrower(selectedBorrower);
		}
		hydrateSchedule(schedule);
	};

	const showCreateSchedule =
		effectiveBorrowerId && nextDraft.scheduleSource === "create";
	const selectedPadAssetId = nextDraft.padAuthorizationAssetId ?? "";

	async function uploadPadDocument(): Promise<string> {
		if (!padFile) {
			throw new Error("Choose a signed PAD PDF before uploading.");
		}

		setIsUploadingPad(true);
		try {
			const createdAsset = await uploadDocumentAsset(
				{
					createAsset,
					extractPdfMetadata,
					generateUploadUrl,
				},
				{
					file: padFile,
					name:
						defaultDocumentAssetName(padFile) ||
						`${selectedBorrower?.fullName ?? "Borrower"} PAD authorization`,
				}
			);
			onChange(
				buildProviderManagedDraft(nextDraft, {
					padAuthorizationAssetId: createdAsset.assetId,
					padAuthorizationSource: "uploaded",
				})
			);
			toast.success(
				createdAsset.duplicate
					? "Signed PAD already existed and was linked."
					: "Signed PAD uploaded."
			);
			return createdAsset.assetId;
		} finally {
			setIsUploadingPad(false);
		}
	}

	async function handleCreateBorrower() {
		const fullName = createBorrowerForm.fullName.trim();
		const email = createBorrowerForm.email.trim();
		const accountNumber = createBorrowerForm.accountNumber.trim();
		const institutionNumber = createBorrowerForm.institutionNumber.trim();
		const transitNumber = createBorrowerForm.transitNumber.trim();
		if (
			!(
				fullName &&
				email &&
				accountNumber &&
				institutionNumber &&
				transitNumber
			)
		) {
			toast.error(
				"Full name, email, account number, institution number, and transit number are required."
			);
			return;
		}

		setIsCreatingBorrower(true);
		try {
			const created = (await createBorrower({
				accountNumber,
				caseId: typedCaseId,
				email,
				fullName,
				institutionNumber,
				phone: createBorrowerForm.phone.trim() || undefined,
				transitNumber,
			})) as CreatedBorrowerResult;

			const borrower = {
				borrowerId: created.borrowerId,
				email: created.email,
				fullName: created.fullName,
			};
			setOptimisticBorrower(borrower);
			selectBorrower(borrower, "create", created.bankAccountId);
			setCreateBorrowerForm(INITIAL_CREATE_BORROWER_FORM);
			setIsCreateBorrowerOpen(false);
			toast.success("Borrower created and staged for Rotessa schedule setup.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create borrower."
			);
		} finally {
			setIsCreatingBorrower(false);
		}
	}

	async function handleCreateSchedule() {
		if (!effectiveBorrowerId) {
			toast.error("Select or create a borrower first.");
			return;
		}
		if (!nextDraft.selectedBankAccountId) {
			toast.error("Select a borrower bank account before creating a schedule.");
			return;
		}
		if (!nextDraft.padAuthorizationSource) {
			toast.error(
				"Choose PAD authorization evidence before creating a schedule."
			);
			return;
		}

		setIsCreatingSchedule(true);
		try {
			let padAuthorizationAssetId = nextDraft.padAuthorizationAssetId;
			if (
				nextDraft.padAuthorizationSource === "uploaded" &&
				!padAuthorizationAssetId
			) {
				padAuthorizationAssetId = await uploadPadDocument();
			}

			const created = (await createRotessaSchedule({
				bankAccountId: nextDraft.selectedBankAccountId as Id<"bankAccounts">,
				borrowerId: effectiveBorrowerId as Id<"borrowers">,
				caseId: typedCaseId,
				padAuthorizationAssetId:
					padAuthorizationAssetId === undefined
						? undefined
						: (padAuthorizationAssetId as Id<"documentAssets">),
				padAuthorizationOverrideReason:
					nextDraft.padAuthorizationOverrideReason?.trim() || undefined,
				padAuthorizationSource: nextDraft.padAuthorizationSource,
			})) as CreatedScheduleResult;

			setOptimisticSchedule({
				bankAccountSummary: setupBankAccounts.find(
					(account) => account.bankAccountId === nextDraft.selectedBankAccountId
				)
					? buildBankAccountLabel(
							setupBankAccounts.find(
								(account) =>
									account.bankAccountId === nextDraft.selectedBankAccountId
							) as CollectionsBankAccountOption
						)
					: null,
				disabledReason: null,
				firstPaymentDate: created.firstPaymentDate,
				frequencySummary: [
					created.paymentFrequency
						? formatStatusLabel(created.paymentFrequency)
						: "Frequency unavailable",
					formatCurrency(created.paymentAmountCents),
				].join(" • "),
				isAssignedToMortgage: false,
				isReservedForCurrentCase: true,
				label: `Rotessa ${created.providerScheduleId.slice(-6).toUpperCase()}`,
				nextProcessDate: created.firstPaymentDate,
				originationPaymentFrequency: created.paymentFrequency ?? null,
				paymentAmountCents: created.paymentAmountCents,
				scheduleId: created.providerScheduleId,
				status: "reserved",
			});
			onChange(
				buildProviderManagedDraft(nextDraft, {
					borrowerSource: nextDraft.borrowerSource ?? "existing",
					scheduleSource: "create",
					selectedExistingExternalScheduleId: created.providerScheduleId,
					selectedProviderScheduleId: created.providerScheduleId,
				})
			);
			hydrateBorrower({
				borrowerId: created.borrower._id,
				email: created.borrower.email,
				fullName: created.borrower.fullName,
			});
			hydrateSchedule({
				firstPaymentDate: created.firstPaymentDate,
				originationPaymentFrequency: created.paymentFrequency ?? null,
				paymentAmountCents: created.paymentAmountCents,
			});
			toast.success("Rotessa payment schedule created and staged.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create schedule."
			);
		} finally {
			setIsCreatingSchedule(false);
		}
	}

	return (
		<OriginationStepCard errors={errors} title="Collections">
			<RadioGroup
				className="grid gap-3"
				onValueChange={(value) =>
					onChange(
						buildIntentDraft(
							nextDraft,
							value as "app_owned" | "provider_managed_now"
						)
					)
				}
				value={executionIntent ?? ""}
			>
				{COLLECTION_OPTIONS.map((option) => {
					const checked = executionIntent === option.value;
					const optionId = `collection-mode-${option.value}`;

					return (
						<Label
							className={cn(
								"flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
								checked
									? "border-sky-500/40 bg-sky-500/10"
									: "border-border/70 hover:bg-muted/50"
							)}
							htmlFor={optionId}
							key={option.value}
						>
							<RadioGroupItem id={optionId} value={option.value} />
							<div className="space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-medium text-sm">{option.label}</p>
									{option.value === "provider_managed_now" ? (
										<Badge variant="outline">Rotessa</Badge>
									) : (
										<Badge variant="outline">Manual</Badge>
									)}
								</div>
								<p className="text-muted-foreground text-sm leading-6">
									{option.description}
								</p>
							</div>
						</Label>
					);
				})}
			</RadioGroup>

			{isAppOwned ? (
				<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium text-sm">App-owned collection strategy</p>
						<Badge variant="outline">Manual</Badge>
					</div>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						App-owned collections are explicitly staged as manual servicing for
						cash, cheque, wire, and other non-API payment workflows.
					</p>
				</div>
			) : null}

			{isProviderManagedNow ? (
				<div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
					<div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 px-4 py-4">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<p className="font-medium text-sm">1. Select borrower</p>
								<Badge variant="outline">Autocomplete</Badge>
							</div>
							<p className="text-muted-foreground text-sm leading-6">
								Start with a canonical borrower in this left column. Use an
								existing borrower or create a new borrower with the bank details
								required for a new Rotessa payment schedule.
							</p>
						</div>

						<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
							<p className="font-medium text-sm">Primary borrower context</p>
							<p className="mt-2 text-muted-foreground text-sm leading-6">
								{primaryBorrower?.message ??
									"Resolving the staged primary borrower and eligible borrower profiles."}
							</p>
							{stagedPrimaryBorrower && !selectedBorrower ? (
								<Button
									className="mt-3"
									onClick={() =>
										selectBorrower(stagedPrimaryBorrower, "existing")
									}
									type="button"
									variant="outline"
								>
									Use staged primary borrower
								</Button>
							) : null}
						</div>

						<div className="flex flex-col gap-3 sm:flex-row">
							<div className="flex-1">
								<BorrowerAutocompleteField
									helperText="Select a borrower in this left column first. The payment schedule column stays disabled until that borrower is explicitly chosen here."
									id="collections-borrower-search"
									isLoading={setupContext === undefined}
									label="Search borrower"
									onClearSelection={() => clearSelectedBorrower()}
									onSearchChange={(nextSearch) => {
										setBorrowerSearch(nextSearch);
										if (
											selectedBorrower &&
											nextSearch !== buildBorrowerDisplayLabel(selectedBorrower)
										) {
											clearSelectedBorrower(nextSearch);
										}
									}}
									onSelectBorrower={(borrower) =>
										selectBorrower(borrower, "existing")
									}
									options={filteredBorrowers}
									search={borrowerSearch}
									selectedBorrowerId={selectedBorrower?.borrowerId}
								/>
							</div>
							<div className="flex items-end">
								<Button
									onClick={() => setIsCreateBorrowerOpen(true)}
									type="button"
									variant="outline"
								>
									<Plus className="mr-2 size-4" />
									Create borrower
								</Button>
							</div>
						</div>

						{selectedBorrower ? (
							<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
								<p className="font-medium text-sm">Selected borrower</p>
								<p className="mt-2 text-sm">
									{buildBorrowerDisplayLabel(selectedBorrower)}
								</p>
								{selectedBorrower.email ? (
									<p className="mt-1 text-muted-foreground text-sm">
										{selectedBorrower.email}
									</p>
								) : null}
							</div>
						) : null}
					</div>

					<div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 px-4 py-4">
						<div className="space-y-1">
							<p className="font-medium text-sm">
								2. Select or create payment schedule
							</p>
							<p className="text-muted-foreground text-sm leading-6">
								This right column unlocks after a borrower is explicitly chosen.
								Reuse an eligible Rotessa schedule for that borrower or create a
								new one from the staged Core Economics data.
							</p>
						</div>

						{effectiveBorrowerId ? (
							<>
								<div className="flex flex-wrap gap-2">
									<Button
										onClick={() =>
											onChange(
												buildProviderManagedDraft(nextDraft, {
													borrowerSource:
														nextDraft.borrowerSource ?? "existing",
													scheduleSource: "existing",
													selectedBankAccountId: undefined,
												})
											)
										}
										type="button"
										variant={
											nextDraft.scheduleSource !== "create"
												? "default"
												: "outline"
										}
									>
										Use existing schedule
									</Button>
									<Button
										onClick={() =>
											onChange(
												buildProviderManagedDraft(nextDraft, {
													borrowerSource:
														nextDraft.borrowerSource ?? "existing",
													scheduleSource: "create",
													selectedExistingExternalScheduleId: undefined,
													selectedProviderScheduleId: undefined,
												})
											)
										}
										type="button"
										variant={
											nextDraft.scheduleSource === "create"
												? "default"
												: "outline"
										}
									>
										Create new payment schedule
									</Button>
								</div>

								{nextDraft.scheduleSource !== "create" ? (
									<div className="space-y-3">
										{availableSchedules.length === 0 ? (
											<div className="rounded-2xl border border-border/70 border-dashed px-4 py-4 text-muted-foreground text-sm leading-6">
												No surfaced Rotessa schedules are currently reusable for
												this borrower.
											</div>
										) : (
											availableSchedules.map((schedule) => {
												const disabled = Boolean(schedule.disabledReason);
												const checked =
													(nextDraft.selectedProviderScheduleId ??
														nextDraft.selectedExistingExternalScheduleId) ===
													schedule.scheduleId;
												return (
													<button
														className={cn(
															"w-full rounded-2xl border px-4 py-3 text-left transition-colors",
															buildExistingScheduleCardClass({
																checked,
																disabled,
															})
														)}
														disabled={disabled}
														key={schedule.scheduleId}
														onClick={() => selectExistingSchedule(schedule)}
														type="button"
													>
														<div className="flex flex-wrap items-center gap-2">
															<p className="font-medium text-sm">
																{schedule.label}
															</p>
															<Badge variant="outline">
																{formatStatusLabel(schedule.status)}
															</Badge>
															{schedule.isReservedForCurrentCase ? (
																<Badge variant="secondary">
																	Reserved for this case
																</Badge>
															) : null}
															{schedule.disabledReason ? (
																<Badge variant="secondary">Unavailable</Badge>
															) : null}
														</div>
														<p className="mt-2 text-sm">
															{schedule.frequencySummary}
														</p>
														<p className="mt-1 text-muted-foreground text-sm">
															Next process date:{" "}
															{schedule.nextProcessDate ?? "Unknown"}
														</p>
														{schedule.bankAccountSummary ? (
															<p className="mt-1 text-muted-foreground text-sm">
																Bank: {schedule.bankAccountSummary}
															</p>
														) : null}
														{schedule.disabledReason ? (
															<p className="mt-2 text-destructive text-sm">
																{schedule.disabledReason}
															</p>
														) : null}
													</button>
												);
											})
										)}
									</div>
								) : null}

								{nextDraft.scheduleSource === "existing" ? (
									<div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
										<p className="font-medium text-sm">PAD authorization</p>
										<p className="text-muted-foreground text-sm leading-6">
											Uploading signed PAD evidence or recording an audited
											admin override is still required before the imported
											Rotessa schedule can be committed onto this mortgage.
										</p>
										<RadioGroup
											className="grid gap-3"
											onValueChange={(value) =>
												onChange(
													buildProviderManagedDraft(nextDraft, {
														padAuthorizationAssetId:
															value === "uploaded"
																? nextDraft.padAuthorizationAssetId
																: undefined,
														padAuthorizationOverrideReason:
															value === "admin_override"
																? nextDraft.padAuthorizationOverrideReason
																: undefined,
														padAuthorizationSource: value as
															| "admin_override"
															| "uploaded",
													})
												)
											}
											value={nextDraft.padAuthorizationSource ?? ""}
										>
											<Label
												className={cn(
													"flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
													nextDraft.padAuthorizationSource === "uploaded"
														? "border-sky-500/40 bg-sky-500/10"
														: "border-border/70 hover:bg-muted/50"
												)}
												htmlFor="existing-pad-authorization-uploaded"
											>
												<RadioGroupItem
													id="existing-pad-authorization-uploaded"
													value="uploaded"
												/>
												<div className="space-y-1">
													<p className="font-medium text-sm">
														Uploaded signed PAD
													</p>
													<p className="text-muted-foreground text-sm leading-6">
														Attach the borrower&apos;s signed PAD PDF to this
														provider-managed setup.
													</p>
												</div>
											</Label>
											<Label
												className={cn(
													"flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
													nextDraft.padAuthorizationSource === "admin_override"
														? "border-sky-500/40 bg-sky-500/10"
														: "border-border/70 hover:bg-muted/50"
												)}
												htmlFor="existing-pad-authorization-override"
											>
												<RadioGroupItem
													id="existing-pad-authorization-override"
													value="admin_override"
												/>
												<div className="space-y-1">
													<p className="font-medium text-sm">
														Admin override with reason
													</p>
													<p className="text-muted-foreground text-sm leading-6">
														Use only when PAD evidence was confirmed outside the
														upload workflow.
													</p>
												</div>
											</Label>
										</RadioGroup>

										{nextDraft.padAuthorizationSource === "uploaded" ? (
											<div className="space-y-3">
												<Label htmlFor="existing-schedule-pad-file">
													Signed PAD PDF
												</Label>
												<Input
													accept="application/pdf"
													id="existing-schedule-pad-file"
													onChange={(event) =>
														setPadFile(event.target.files?.[0] ?? null)
													}
													type="file"
												/>
												<div className="flex flex-wrap items-center gap-2">
													<Button
														disabled={isUploadingPad || !padFile}
														onClick={() => void uploadPadDocument()}
														type="button"
														variant="outline"
													>
														{isUploadingPad ? (
															<LoaderCircle className="mr-2 size-4 animate-spin" />
														) : (
															<Upload className="mr-2 size-4" />
														)}
														Upload PAD
													</Button>
													{selectedPadAssetId ? (
														<Badge variant="outline">
															Asset {selectedPadAssetId}
														</Badge>
													) : null}
												</div>
											</div>
										) : null}

										{nextDraft.padAuthorizationSource === "admin_override" ? (
											<div className="space-y-2">
												<Label htmlFor="existing-schedule-pad-override-reason">
													Override reason
												</Label>
												<Textarea
													id="existing-schedule-pad-override-reason"
													onChange={(event) =>
														onChange(
															buildProviderManagedDraft(nextDraft, {
																padAuthorizationOverrideReason:
																	event.target.value || undefined,
															})
														)
													}
													placeholder="Explain the compliance basis for bypassing uploaded PAD evidence."
													value={nextDraft.padAuthorizationOverrideReason ?? ""}
												/>
											</div>
										) : null}
									</div>
								) : null}

								{showCreateSchedule ? (
									<div className="space-y-4">
										<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
											<div className="flex items-center gap-2">
												<p className="font-medium text-sm">
													Seeded from Core Economics
												</p>
												<Badge variant="outline">Auto-fill source</Badge>
											</div>
											<p className="mt-2 text-sm leading-6">
												Amount: {formatCurrency(mortgageTerms?.paymentAmount)} •
												Frequency:{" "}
												{mortgageTerms?.paymentFrequency
													? formatStatusLabel(mortgageTerms.paymentFrequency)
													: "Not staged"}{" "}
												• First payment:{" "}
												{mortgageTerms?.firstPaymentDate ?? "Not staged"}
											</p>
										</div>

										<div className="space-y-3">
											<p className="font-medium text-sm">
												Borrower bank account
											</p>
											{setupBankAccounts.length === 0 ? (
												<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-6">
													No borrower-owned bank accounts are ready for Rotessa
													schedule creation yet.
												</div>
											) : (
												<RadioGroup
													className="grid gap-3"
													onValueChange={(selectedBankAccountId) =>
														onChange(
															buildProviderManagedDraft(nextDraft, {
																borrowerSource:
																	nextDraft.borrowerSource ?? "existing",
																scheduleSource: "create",
																selectedBankAccountId,
															})
														)
													}
													value={nextDraft.selectedBankAccountId ?? ""}
												>
													{setupBankAccounts.map((bankAccount) => {
														const checked =
															nextDraft.selectedBankAccountId ===
															bankAccount.bankAccountId;
														const optionId = `collections-bank-${bankAccount.bankAccountId}`;
														const isDisabled =
															bankAccount.eligibilityErrors.length > 0;

														return (
															<Label
																className={cn(
																	"flex items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
																	buildBankAccountOptionClass({
																		checked,
																		isDisabled,
																	})
																)}
																htmlFor={optionId}
																key={bankAccount.bankAccountId}
															>
																<RadioGroupItem
																	disabled={isDisabled}
																	id={optionId}
																	value={bankAccount.bankAccountId}
																/>
																<div className="space-y-2">
																	<div className="flex flex-wrap items-center gap-2">
																		<p className="font-medium text-sm">
																			{buildBankAccountLabel(bankAccount)}
																		</p>
																		{bankAccount.isDefaultInbound ? (
																			<Badge variant="outline">
																				Default inbound
																			</Badge>
																		) : null}
																	</div>
																	<p className="text-muted-foreground text-sm">
																		{formatStatusLabel(bankAccount.status)} •
																		mandate{" "}
																		{formatStatusLabel(
																			bankAccount.mandateStatus
																		)}
																		{bankAccount.validationMethod
																			? ` • ${formatStatusLabel(bankAccount.validationMethod)}`
																			: ""}
																	</p>
																	{bankAccount.eligibilityErrors.length > 0 ? (
																		<ul className="list-disc space-y-1 pl-5 text-destructive text-sm">
																			{bankAccount.eligibilityErrors.map(
																				(error) => (
																					<li key={error}>{error}</li>
																				)
																			)}
																		</ul>
																	) : (
																		<p className="text-emerald-700 text-sm">
																			Eligible for immediate Rotessa schedule
																			creation.
																		</p>
																	)}
																</div>
															</Label>
														);
													})}
												</RadioGroup>
											)}
										</div>

										<div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
											<p className="font-medium text-sm">PAD authorization</p>
											<p className="text-muted-foreground text-sm leading-6">
												A signed PAD upload or an audited admin override is
												mandatory before a new Rotessa schedule can be created.
											</p>
											<RadioGroup
												className="grid gap-3"
												onValueChange={(value) =>
													onChange(
														buildProviderManagedDraft(nextDraft, {
															padAuthorizationAssetId:
																value === "uploaded"
																	? nextDraft.padAuthorizationAssetId
																	: undefined,
															padAuthorizationOverrideReason:
																value === "admin_override"
																	? nextDraft.padAuthorizationOverrideReason
																	: undefined,
															padAuthorizationSource: value as
																| "admin_override"
																| "uploaded",
														})
													)
												}
												value={nextDraft.padAuthorizationSource ?? ""}
											>
												<Label
													className={cn(
														"flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
														nextDraft.padAuthorizationSource === "uploaded"
															? "border-sky-500/40 bg-sky-500/10"
															: "border-border/70 hover:bg-muted/50"
													)}
													htmlFor="pad-authorization-uploaded"
												>
													<RadioGroupItem
														id="pad-authorization-uploaded"
														value="uploaded"
													/>
													<div className="space-y-1">
														<p className="font-medium text-sm">
															Uploaded signed PAD
														</p>
														<p className="text-muted-foreground text-sm leading-6">
															Upload the signed PAD PDF into the canonical
															document asset store.
														</p>
													</div>
												</Label>
												<Label
													className={cn(
														"flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
														nextDraft.padAuthorizationSource ===
															"admin_override"
															? "border-sky-500/40 bg-sky-500/10"
															: "border-border/70 hover:bg-muted/50"
													)}
													htmlFor="pad-authorization-override"
												>
													<RadioGroupItem
														id="pad-authorization-override"
														value="admin_override"
													/>
													<div className="space-y-1">
														<p className="font-medium text-sm">
															Admin override with reason
														</p>
														<p className="text-muted-foreground text-sm leading-6">
															Use only when mandate evidence was confirmed
															outside the upload workflow.
														</p>
													</div>
												</Label>
											</RadioGroup>

											{nextDraft.padAuthorizationSource === "uploaded" ? (
												<div className="space-y-3">
													<Label htmlFor="collections-pad-file">
														Signed PAD PDF
													</Label>
													<Input
														accept="application/pdf"
														id="collections-pad-file"
														onChange={(event) =>
															setPadFile(event.target.files?.[0] ?? null)
														}
														type="file"
													/>
													<div className="flex flex-wrap items-center gap-2">
														<Button
															disabled={isUploadingPad || !padFile}
															onClick={() => void uploadPadDocument()}
															type="button"
															variant="outline"
														>
															{isUploadingPad ? (
																<LoaderCircle className="mr-2 size-4 animate-spin" />
															) : (
																<Upload className="mr-2 size-4" />
															)}
															Upload PAD
														</Button>
														{selectedPadAssetId ? (
															<Badge variant="outline">
																Asset {selectedPadAssetId}
															</Badge>
														) : null}
													</div>
												</div>
											) : null}

											{nextDraft.padAuthorizationSource === "admin_override" ? (
												<div className="space-y-2">
													<Label htmlFor="collections-pad-override-reason">
														Override reason
													</Label>
													<Textarea
														id="collections-pad-override-reason"
														onChange={(event) =>
															onChange(
																buildProviderManagedDraft(nextDraft, {
																	padAuthorizationOverrideReason:
																		event.target.value || undefined,
																})
															)
														}
														placeholder="Explain the compliance basis for bypassing uploaded PAD evidence."
														value={
															nextDraft.padAuthorizationOverrideReason ?? ""
														}
													/>
												</div>
											) : null}
										</div>

										<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
											<div className="space-y-1">
												<p className="font-medium text-sm">
													Create Rotessa schedule atomically
												</p>
												<p className="text-muted-foreground text-sm leading-6">
													If the provider call or local reservation fails, the
													user sees an immediate error and the new schedule is
													not staged on the case.
												</p>
											</div>
											<Button
												disabled={isCreatingSchedule}
												onClick={() => void handleCreateSchedule()}
												type="button"
											>
												{isCreatingSchedule ? (
													<LoaderCircle className="mr-2 size-4 animate-spin" />
												) : null}
												Create Rotessa schedule
											</Button>
										</div>
									</div>
								) : null}

								{selectedSchedule ? (
									<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
										<div className="flex flex-wrap items-center gap-2">
											<p className="font-medium text-sm">
												Selected payment schedule
											</p>
											<Badge variant="outline">
												{formatStatusLabel(selectedSchedule.status)}
											</Badge>
										</div>
										<p className="mt-2 text-sm">
											{selectedSchedule.frequencySummary}
										</p>
										<p className="mt-1 text-muted-foreground text-sm">
											Next process date:{" "}
											{selectedSchedule.nextProcessDate ?? "Unknown"}
										</p>
										{selectedSchedule.bankAccountSummary ? (
											<p className="mt-1 text-muted-foreground text-sm">
												Bank: {selectedSchedule.bankAccountSummary}
											</p>
										) : null}
									</div>
								) : null}

								<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
									<p className="font-medium text-sm">Provider-managed checks</p>
									<ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
										<li>
											One imported Rotessa schedule cannot be linked to multiple
											active mortgages.
										</li>
										<li>
											Borrower identity is sourced from canonical borrower
											records, not free-text schedule metadata.
										</li>
										<li>
											Schedules already linked elsewhere stay visible but
											unselectable.
										</li>
									</ul>
									{providerActivationStatus ? (
										<p className="mt-3 text-muted-foreground text-sm">
											Activation status:{" "}
											{formatStatusLabel(providerActivationStatus)}
										</p>
									) : null}
									{setupContext?.preflightErrors.length ? (
										<ul className="mt-3 list-disc space-y-1 pl-5 text-destructive text-sm leading-6">
											{setupContext.preflightErrors.map((error) => (
												<li key={error}>{error}</li>
											))}
										</ul>
									) : null}
								</div>
							</>
						) : (
							<div className="rounded-2xl border border-border/70 border-dashed px-4 py-4 text-muted-foreground text-sm leading-6">
								Select or create a borrower in the first column to unlock
								existing schedules and the new-schedule creation path.
							</div>
						)}
					</div>
				</div>
			) : null}

			{executionIntent === undefined ? (
				<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-6">
					Choose one of the two supported collection strategies for this
					origination.
				</div>
			) : null}

			<Dialog
				onOpenChange={setIsCreateBorrowerOpen}
				open={isCreateBorrowerOpen}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Create borrower for Rotessa</DialogTitle>
						<DialogDescription>
							This track provisions the borrower canonically and captures the
							bank details needed to create a new Rotessa payment schedule.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="create-borrower-full-name">Full name</Label>
							<Input
								id="create-borrower-full-name"
								onChange={(event) =>
									setCreateBorrowerForm((current) => ({
										...current,
										fullName: event.target.value,
									}))
								}
								value={createBorrowerForm.fullName}
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="create-borrower-email">Email</Label>
							<Input
								id="create-borrower-email"
								onChange={(event) =>
									setCreateBorrowerForm((current) => ({
										...current,
										email: event.target.value,
									}))
								}
								type="email"
								value={createBorrowerForm.email}
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="create-borrower-phone">Phone</Label>
							<Input
								id="create-borrower-phone"
								onChange={(event) =>
									setCreateBorrowerForm((current) => ({
										...current,
										phone: event.target.value,
									}))
								}
								value={createBorrowerForm.phone}
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="create-borrower-account-number">
								Account number
							</Label>
							<Input
								id="create-borrower-account-number"
								onChange={(event) =>
									setCreateBorrowerForm((current) => ({
										...current,
										accountNumber: event.target.value,
									}))
								}
								value={createBorrowerForm.accountNumber}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-borrower-institution-number">
								Institution
							</Label>
							<Input
								id="create-borrower-institution-number"
								onChange={(event) =>
									setCreateBorrowerForm((current) => ({
										...current,
										institutionNumber: event.target.value,
									}))
								}
								value={createBorrowerForm.institutionNumber}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-borrower-transit-number">Transit</Label>
							<Input
								id="create-borrower-transit-number"
								onChange={(event) =>
									setCreateBorrowerForm((current) => ({
										...current,
										transitNumber: event.target.value,
									}))
								}
								value={createBorrowerForm.transitNumber}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							onClick={() => {
								setCreateBorrowerForm(INITIAL_CREATE_BORROWER_FORM);
								setIsCreateBorrowerOpen(false);
							}}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={isCreatingBorrower}
							onClick={() => void handleCreateBorrower()}
							type="button"
						>
							{isCreatingBorrower ? (
								<LoaderCircle className="mr-2 size-4 animate-spin" />
							) : null}
							Create borrower
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</OriginationStepCard>
	);
}
