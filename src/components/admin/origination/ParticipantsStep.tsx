import { useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BorrowerAutocompleteField } from "#/components/admin/origination/BorrowerAutocompleteField";
import { BrokerAutocompleteField } from "#/components/admin/origination/BrokerAutocompleteField";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type {
	OriginationParticipantDraft,
	OriginationParticipantsDraft,
} from "#/lib/admin-origination";
import { createOriginationDraftId } from "#/lib/admin-origination";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	type BorrowerAutocompleteOption,
	listBorrowerAutocompleteOptions,
	resolveSelectedBorrowerOption,
} from "./borrower-autocomplete-model";
import {
	type BrokerAutocompleteOption,
	buildBrokerDisplayLabel,
	buildFallbackBrokerOption,
	listBrokerAutocompleteOptions,
	resolveSelectedBrokerOption,
} from "./broker-autocomplete-model";
import { buildBorrowerDisplayLabel } from "./collections-step-model";
import { OriginationStepCard } from "./OriginationStepCard";
import {
	buildParticipantBorrowerDraft,
	clearParticipantBorrowerSelection,
} from "./participants-step-model";

interface ParticipantsStepProps {
	caseId: string;
	draft?: OriginationParticipantsDraft;
	errors?: readonly string[];
	onChange: (nextDraft: OriginationParticipantsDraft | undefined) => void;
}

interface ParticipantsBorrowerSearchContext {
	searchResults: BorrowerAutocompleteOption[];
}

interface ParticipantsBrokerSearchContext {
	searchResults: BrokerAutocompleteOption[];
}

function ParticipantFields({
	borrowerOptions,
	draft,
	isBorrowerSearchLoading,
	onChange,
	onRemove,
	title,
}: {
	borrowerOptions: BorrowerAutocompleteOption[];
	draft?: OriginationParticipantDraft;
	isBorrowerSearchLoading: boolean;
	onChange: (nextDraft: OriginationParticipantDraft | undefined) => void;
	onRemove?: () => void;
	title: string;
}) {
	const nextDraft = draft ?? {};
	const fieldId = title.toLowerCase().replace(/\s+/g, "-");
	const [borrowerSearch, setBorrowerSearch] = useState("");
	const selectedBorrower = useMemo(
		() =>
			resolveSelectedBorrowerOption({
				borrowerOptions,
				fallbackBorrower: nextDraft.existingBorrowerId
					? {
							borrowerId: nextDraft.existingBorrowerId,
							email: nextDraft.email ?? null,
							fullName: nextDraft.fullName ?? null,
						}
					: null,
				selectedBorrowerId: nextDraft.existingBorrowerId,
			}),
		[
			borrowerOptions,
			nextDraft.email,
			nextDraft.existingBorrowerId,
			nextDraft.fullName,
		]
	);
	const selectedBorrowerLabel = selectedBorrower
		? buildBorrowerDisplayLabel(selectedBorrower)
		: "";
	const filteredBorrowers = useMemo(
		() =>
			listBorrowerAutocompleteOptions({
				borrowerOptions,
				search: borrowerSearch,
				selectedBorrower,
			}),
		[borrowerOptions, borrowerSearch, selectedBorrower]
	);

	useEffect(() => {
		setBorrowerSearch(selectedBorrowerLabel);
	}, [selectedBorrowerLabel]);

	const hasExistingBorrowerSelection = Boolean(selectedBorrower);

	const applyBorrowerSelection = (borrower: BorrowerAutocompleteOption) => {
		setBorrowerSearch(buildBorrowerDisplayLabel(borrower));
		onChange(buildParticipantBorrowerDraft(nextDraft, borrower));
	};

	const clearBorrowerSelection = (nextSearch = "") => {
		setBorrowerSearch(nextSearch);
		onChange(clearParticipantBorrowerSelection(nextDraft));
	};

	return (
		<Card className="border-border/70">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<CardTitle className="text-base">{title}</CardTitle>
				{onRemove ? (
					<Button onClick={onRemove} size="icon" type="button" variant="ghost">
						<Trash2 className="size-4" />
						<span className="sr-only">Remove {title}</span>
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="grid gap-4 md:grid-cols-2">
				<div className="md:col-span-2">
					<BorrowerAutocompleteField
						helperText="Select a canonical borrower here, or leave this blank to stage a new borrower identity manually."
						id={`${fieldId}-existing-borrower`}
						isLoading={isBorrowerSearchLoading}
						label="Existing borrower"
						onClearSelection={() => clearBorrowerSelection()}
						onSearchChange={(nextSearch) => {
							setBorrowerSearch(nextSearch);
							if (
								hasExistingBorrowerSelection &&
								nextSearch !== selectedBorrowerLabel
							) {
								clearBorrowerSelection(nextSearch);
							}
						}}
						onSelectBorrower={applyBorrowerSelection}
						options={filteredBorrowers}
						search={borrowerSearch}
						selectedBorrowerId={selectedBorrower?.borrowerId}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${fieldId}-fullName`}>Full name</Label>
					<Input
						id={`${fieldId}-fullName`}
						onChange={(event) =>
							onChange({
								...nextDraft,
								fullName: event.target.value,
							})
						}
						placeholder="Ada Lovelace"
						readOnly={hasExistingBorrowerSelection}
						value={nextDraft.fullName ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${fieldId}-email`}>Email</Label>
					<Input
						id={`${fieldId}-email`}
						onChange={(event) =>
							onChange({
								...nextDraft,
								email: event.target.value,
							})
						}
						placeholder="ada@example.com"
						readOnly={hasExistingBorrowerSelection}
						type="email"
						value={nextDraft.email ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${fieldId}-phone`}>Phone</Label>
					<Input
						id={`${fieldId}-phone`}
						onChange={(event) =>
							onChange({
								...nextDraft,
								phone: event.target.value,
							})
						}
						placeholder="416-555-0101"
						value={nextDraft.phone ?? ""}
					/>
				</div>
				{hasExistingBorrowerSelection ? (
					<p className="text-muted-foreground text-xs leading-5 md:col-span-2">
						Name and email are auto-filled from the selected canonical borrower.
						Clear the selection to stage a new borrower instead.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function updateArrayEntry(
	current: OriginationParticipantDraft[] | undefined,
	index: number,
	value: OriginationParticipantDraft | undefined
) {
	const next = [...(current ?? [])];
	if (value) {
		next[index] = value;
	}
	return next.filter(Boolean);
}

function createParticipantDraft(prefix: string): OriginationParticipantDraft {
	return {
		draftId: createOriginationDraftId(prefix),
	};
}

export function ParticipantsStep({
	caseId,
	draft,
	errors,
	onChange,
}: ParticipantsStepProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const searchContext = useQuery(
		api.admin.origination.collections.getCollectionsSetupContext,
		{
			caseId: typedCaseId,
		}
	) as ParticipantsBorrowerSearchContext | null | undefined;
	const brokerSearchContext = useQuery(
		api.admin.origination.participants.getBrokerSearchContext,
		{
			caseId: typedCaseId,
		}
	) as ParticipantsBrokerSearchContext | null | undefined;
	const currentDraft = draft ?? {};
	const coBorrowers = currentDraft.coBorrowers ?? [];
	const guarantors = currentDraft.guarantors ?? [];
	const borrowerOptions = searchContext?.searchResults ?? [];
	const brokerOptions = brokerSearchContext?.searchResults ?? [];
	const isBorrowerSearchLoading = searchContext === undefined;
	const isBrokerSearchLoading = brokerSearchContext === undefined;
	const [brokerOfRecordSearch, setBrokerOfRecordSearch] = useState("");
	const [assignedBrokerSearch, setAssignedBrokerSearch] = useState("");
	const selectedBrokerOfRecord = useMemo(
		() =>
			resolveSelectedBrokerOption({
				brokerOptions,
				fallbackBroker: buildFallbackBrokerOption({
					brokerId: currentDraft.brokerOfRecordId,
					label: currentDraft.brokerOfRecordLabel,
				}),
				selectedBrokerId: currentDraft.brokerOfRecordId,
			}),
		[
			brokerOptions,
			currentDraft.brokerOfRecordId,
			currentDraft.brokerOfRecordLabel,
		]
	);
	const selectedAssignedBroker = useMemo(
		() =>
			resolveSelectedBrokerOption({
				brokerOptions,
				fallbackBroker: buildFallbackBrokerOption({
					brokerId: currentDraft.assignedBrokerId,
					label: currentDraft.assignedBrokerLabel,
				}),
				selectedBrokerId: currentDraft.assignedBrokerId,
			}),
		[
			brokerOptions,
			currentDraft.assignedBrokerId,
			currentDraft.assignedBrokerLabel,
		]
	);
	const filteredBrokerOfRecordOptions = useMemo(
		() =>
			listBrokerAutocompleteOptions({
				brokerOptions,
				search: brokerOfRecordSearch,
				selectedBroker: selectedBrokerOfRecord,
			}),
		[brokerOfRecordSearch, brokerOptions, selectedBrokerOfRecord]
	);
	const filteredAssignedBrokerOptions = useMemo(
		() =>
			listBrokerAutocompleteOptions({
				brokerOptions,
				search: assignedBrokerSearch,
				selectedBroker: selectedAssignedBroker,
			}),
		[assignedBrokerSearch, brokerOptions, selectedAssignedBroker]
	);

	useEffect(() => {
		setBrokerOfRecordSearch(
			selectedBrokerOfRecord
				? buildBrokerDisplayLabel(selectedBrokerOfRecord)
				: (currentDraft.brokerOfRecordLabel ?? "")
		);
	}, [currentDraft.brokerOfRecordLabel, selectedBrokerOfRecord]);

	useEffect(() => {
		setAssignedBrokerSearch(
			selectedAssignedBroker
				? buildBrokerDisplayLabel(selectedAssignedBroker)
				: (currentDraft.assignedBrokerLabel ?? "")
		);
	}, [currentDraft.assignedBrokerLabel, selectedAssignedBroker]);

	return (
		<OriginationStepCard errors={errors} title="Participants">
			<ParticipantFields
				borrowerOptions={borrowerOptions}
				draft={currentDraft.primaryBorrower}
				isBorrowerSearchLoading={isBorrowerSearchLoading}
				onChange={(primaryBorrower) =>
					onChange({
						...currentDraft,
						primaryBorrower,
					})
				}
				title="Primary borrower"
			/>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-base">Co-borrowers</h3>
					<Button
						onClick={() =>
							onChange({
								...currentDraft,
								coBorrowers: [
									...coBorrowers,
									createParticipantDraft("co-borrower"),
								],
							})
						}
						type="button"
						variant="outline"
					>
						<Plus className="mr-2 size-4" />
						Add co-borrower
					</Button>
				</div>
				{coBorrowers.length > 0 ? (
					<div className="space-y-4">
						{coBorrowers.map((coBorrower, index) => (
							<ParticipantFields
								borrowerOptions={borrowerOptions}
								draft={coBorrower}
								isBorrowerSearchLoading={isBorrowerSearchLoading}
								key={
									coBorrower.draftId ??
									coBorrower.existingBorrowerId ??
									coBorrower.email ??
									coBorrower.fullName ??
									coBorrower.phone ??
									"co-borrower"
								}
								onChange={(nextValue) =>
									onChange({
										...currentDraft,
										coBorrowers: updateArrayEntry(
											currentDraft.coBorrowers,
											index,
											nextValue
										),
									})
								}
								onRemove={() =>
									onChange({
										...currentDraft,
										coBorrowers: coBorrowers.filter(
											(_, itemIndex) => itemIndex !== index
										),
									})
								}
								title={`Co-borrower ${index + 1}`}
							/>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="py-6 text-muted-foreground text-sm">
							No co-borrowers staged yet.
						</CardContent>
					</Card>
				)}
			</section>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-base">Guarantors</h3>
					<Button
						onClick={() =>
							onChange({
								...currentDraft,
								guarantors: [
									...guarantors,
									createParticipantDraft("guarantor"),
								],
							})
						}
						type="button"
						variant="outline"
					>
						<Plus className="mr-2 size-4" />
						Add guarantor
					</Button>
				</div>
				{guarantors.length > 0 ? (
					<div className="space-y-4">
						{guarantors.map((guarantor, index) => (
							<ParticipantFields
								borrowerOptions={borrowerOptions}
								draft={guarantor}
								isBorrowerSearchLoading={isBorrowerSearchLoading}
								key={
									guarantor.draftId ??
									guarantor.existingBorrowerId ??
									guarantor.email ??
									guarantor.fullName ??
									guarantor.phone ??
									"guarantor"
								}
								onChange={(nextValue) =>
									onChange({
										...currentDraft,
										guarantors: updateArrayEntry(
											currentDraft.guarantors,
											index,
											nextValue
										),
									})
								}
								onRemove={() =>
									onChange({
										...currentDraft,
										guarantors: guarantors.filter(
											(_, itemIndex) => itemIndex !== index
										),
									})
								}
								title={`Guarantor ${index + 1}`}
							/>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="py-6 text-muted-foreground text-sm">
							No guarantors staged yet.
						</CardContent>
					</Card>
				)}
			</section>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="text-base">Broker assignment</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<BrokerAutocompleteField
						helperText="Broker of record is required. Search by broker name, email, or brokerage."
						id="broker-of-record-search"
						isLoading={isBrokerSearchLoading}
						label="Broker of record"
						onClearSelection={() =>
							onChange({
								...currentDraft,
								brokerOfRecordId: undefined,
								brokerOfRecordLabel: undefined,
							})
						}
						onSearchChange={setBrokerOfRecordSearch}
						onSelectBroker={(broker) =>
							onChange({
								...currentDraft,
								brokerOfRecordId: broker.brokerId,
								brokerOfRecordLabel: buildBrokerDisplayLabel(broker),
							})
						}
						options={filteredBrokerOfRecordOptions}
						search={brokerOfRecordSearch}
						selectedBrokerId={selectedBrokerOfRecord?.brokerId ?? null}
					/>
					<BrokerAutocompleteField
						helperText="Assigned broker is optional and can differ from the broker of record."
						id="assigned-broker-search"
						isLoading={isBrokerSearchLoading}
						label="Assigned broker"
						onClearSelection={() =>
							onChange({
								...currentDraft,
								assignedBrokerId: undefined,
								assignedBrokerLabel: undefined,
							})
						}
						onSearchChange={setAssignedBrokerSearch}
						onSelectBroker={(broker) =>
							onChange({
								...currentDraft,
								assignedBrokerId: broker.brokerId,
								assignedBrokerLabel: buildBrokerDisplayLabel(broker),
							})
						}
						options={filteredAssignedBrokerOptions}
						search={assignedBrokerSearch}
						selectedBrokerId={selectedAssignedBroker?.brokerId ?? null}
					/>
				</CardContent>
			</Card>
		</OriginationStepCard>
	);
}
