import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import type { OriginationCollectionsDraft } from "#/lib/admin-origination";
import { cn } from "#/lib/utils";
import { OriginationStepCard } from "./OriginationStepCard";

interface CollectionsStepProps {
	draft?: OriginationCollectionsDraft;
	errors?: readonly string[];
	onChange: (nextDraft: OriginationCollectionsDraft | undefined) => void;
}

const COLLECTION_OPTIONS = [
	{
		value: "none",
		label: "No collection rail yet",
		description:
			"Use this when the case should commit later without immediately enabling recurring collections.",
	},
	{
		value: "app_owned_only",
		label: "App-owned collections later",
		description:
			"Persist the servicing intent now. Activation semantics arrive in the payment-bootstrap phase.",
	},
	{
		value: "provider_managed_now",
		label: "Provider-managed now",
		description:
			"Reserves the future provider-managed branch without contacting Rotessa or creating schedules yet.",
	},
] as const;

export function CollectionsStep({
	draft,
	errors,
	onChange,
}: CollectionsStepProps) {
	const nextDraft = draft ?? {};

	return (
		<OriginationStepCard
			description="This phase only stages collection intent. No provider activation, bank verification, schedules, or plan entries are created."
			errors={errors}
			title="Collections"
		>
			<RadioGroup
				className="grid gap-3"
				onValueChange={(value) =>
					onChange({
						...nextDraft,
						mode: (value as OriginationCollectionsDraft["mode"]) || undefined,
					})
				}
				value={nextDraft.mode ?? ""}
			>
				{COLLECTION_OPTIONS.map((option) => {
					const checked = nextDraft.mode === option.value;
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
								<p className="font-medium text-sm">{option.label}</p>
								<p className="text-muted-foreground text-sm leading-6">
									{option.description}
								</p>
							</div>
						</Label>
					);
				})}
			</RadioGroup>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="providerCode">Provider code</Label>
					<Input
						id="providerCode"
						onChange={(event) =>
							onChange({
								...nextDraft,
								providerCode:
									(event.target
										.value as OriginationCollectionsDraft["providerCode"]) ||
									undefined,
							})
						}
						placeholder="pad_rotessa"
						value={nextDraft.providerCode ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="selectedBankAccountId">
						Selected bank account ID
					</Label>
					<Input
						id="selectedBankAccountId"
						onChange={(event) =>
							onChange({
								...nextDraft,
								selectedBankAccountId: event.target.value || undefined,
							})
						}
						placeholder="bankAccount_..."
						value={nextDraft.selectedBankAccountId ?? ""}
					/>
				</div>
			</div>

			<div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-4 text-muted-foreground text-sm leading-6">
				Collections remain intentionally inert in phase 1. This screen only
				establishes the draft shape that phase 5 will extend with activation,
				health, and provider status.
			</div>
		</OriginationStepCard>
	);
}
