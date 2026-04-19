import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type {
	OriginationParticipantDraft,
	OriginationParticipantsDraft,
} from "#/lib/admin-origination";
import { createOriginationDraftId } from "#/lib/admin-origination";
import { OriginationStepCard } from "./OriginationStepCard";

interface ParticipantsStepProps {
	draft?: OriginationParticipantsDraft;
	errors?: readonly string[];
	onChange: (nextDraft: OriginationParticipantsDraft | undefined) => void;
}

function ParticipantFields({
	description,
	draft,
	onChange,
	onRemove,
	title,
}: {
	description: string;
	draft?: OriginationParticipantDraft;
	onChange: (nextDraft: OriginationParticipantDraft | undefined) => void;
	onRemove?: () => void;
	title: string;
}) {
	const nextDraft = draft ?? {};
	const idPrefix = useId();

	return (
		<Card className="border-border/70">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div className="space-y-1">
					<CardTitle className="text-base">{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</div>
				{onRemove ? (
					<Button onClick={onRemove} size="icon" type="button" variant="ghost">
						<Trash2 className="size-4" />
						<span className="sr-only">Remove {title}</span>
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-existingBorrowerId`}>
						Existing borrower ID
					</Label>
					<Input
						id={`${idPrefix}-existingBorrowerId`}
						onChange={(event) =>
							onChange({
								...nextDraft,
								existingBorrowerId: event.target.value || undefined,
							})
						}
						placeholder="borrower_..."
						value={nextDraft.existingBorrowerId ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-fullName`}>Full name</Label>
					<Input
						id={`${idPrefix}-fullName`}
						onChange={(event) =>
							onChange({
								...nextDraft,
								fullName: event.target.value,
							})
						}
						placeholder="Ada Lovelace"
						value={nextDraft.fullName ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-email`}>Email</Label>
					<Input
						id={`${idPrefix}-email`}
						onChange={(event) =>
							onChange({
								...nextDraft,
								email: event.target.value,
							})
						}
						placeholder="ada@example.com"
						type="email"
						value={nextDraft.email ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
					<Input
						id={`${idPrefix}-phone`}
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
	draft,
	errors,
	onChange,
}: ParticipantsStepProps) {
	const currentDraft = draft ?? {};
	const coBorrowers = currentDraft.coBorrowers ?? [];
	const guarantors = currentDraft.guarantors ?? [];

	return (
		<OriginationStepCard
			description="Stage borrower identity, supporting parties, and broker assignment without creating canonical borrower rows yet."
			errors={errors}
			title="Participants"
		>
			<ParticipantFields
				description="This borrower label drives the case name until canonical identity sync exists."
				draft={currentDraft.primaryBorrower}
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
					<div>
						<h3 className="font-semibold text-base">Co-borrowers</h3>
						<p className="text-muted-foreground text-sm">
							Add secondary borrower drafts now; phase 2 later decides whether
							they map to existing borrower profiles.
						</p>
					</div>
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
								description="Optional supporting borrower for the staged mortgage."
								draft={coBorrower}
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
					<div>
						<h3 className="font-semibold text-base">Guarantors</h3>
						<p className="text-muted-foreground text-sm">
							Use this for third-party support without triggering any downstream
							legal-package behavior yet.
						</p>
					</div>
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
								description="Optional guarantor draft staged for later commitment logic."
								draft={guarantor}
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
					<CardDescription>
						Keep broker references at the draft layer until the canonical
						mortgage constructor exists.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="brokerOfRecordId">Broker of record ID</Label>
						<Input
							id="brokerOfRecordId"
							onChange={(event) =>
								onChange({
									...currentDraft,
									brokerOfRecordId: event.target.value || undefined,
								})
							}
							placeholder="broker_..."
							value={currentDraft.brokerOfRecordId ?? ""}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="assignedBrokerId">Assigned broker ID</Label>
						<Input
							id="assignedBrokerId"
							onChange={(event) =>
								onChange({
									...currentDraft,
									assignedBrokerId: event.target.value || undefined,
								})
							}
							placeholder="broker_..."
							value={currentDraft.assignedBrokerId ?? ""}
						/>
					</div>
				</CardContent>
			</Card>
		</OriginationStepCard>
	);
}
