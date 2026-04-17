import { useQuery } from "convex/react";
import { Badge } from "#/components/ui/badge";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import type { OriginationCollectionsDraft } from "#/lib/admin-origination";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { OriginationStepCard } from "./OriginationStepCard";

interface CollectionsStepProps {
	caseId: string;
	draft?: OriginationCollectionsDraft;
	errors?: readonly string[];
	onChange: (nextDraft: OriginationCollectionsDraft | undefined) => void;
}

const COLLECTION_OPTIONS = [
	{
		value: "none",
		label: "No collection rail yet",
		description:
			"Commit the mortgage with canonical obligations only. No execution rail is staged from origination.",
	},
	{
		value: "app_owned_only",
		label: "FairLend app-owned",
		description:
			"Commit the mortgage with planned FairLend-owned collection entries and keep provider scheduling out of the commit path.",
	},
	{
		value: "provider_managed_now",
		label: "Immediate Rotessa activation",
		description:
			"Commit canonically first, then immediately try to activate the future installment window in Rotessa using the primary borrower’s bank account.",
	},
] as const;

function buildBankAccountLabel(bankAccount: {
	accountLast4: string | null;
	institutionNumber: string | null;
	transitNumber: string | null;
}) {
	const parts = [
		bankAccount.accountLast4 ? `•••• ${bankAccount.accountLast4}` : null,
		bankAccount.institutionNumber && bankAccount.transitNumber
			? `${bankAccount.institutionNumber}-${bankAccount.transitNumber}`
			: null,
	].filter(Boolean);

	return parts.join(" • ") || "Bank account";
}

function formatStatusLabel(value: string) {
	return value
		.split("_")
		.map((segment) =>
			segment.length > 0
				? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
				: segment
		)
		.join(" ");
}

export function CollectionsStep({
	caseId,
	draft,
	errors,
	onChange,
}: CollectionsStepProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const setupContext = useQuery(
		api.admin.origination.collections.getCollectionsSetupContext,
		{
			caseId: typedCaseId,
		}
	);
	const primaryBorrower = setupContext?.primaryBorrower ?? null;
	const setupBankAccounts = setupContext?.bankAccounts ?? [];
	const nextDraft = draft ?? {};
	const isProviderManagedNow = nextDraft.mode === "provider_managed_now";

	return (
		<OriginationStepCard
			description="Collections mode is staged on the origination case. Canonical mortgage activation always happens first, then phase-5 can immediately hand the future schedule to Rotessa when the primary borrower bank setup is ready."
			errors={errors}
			title="Collections"
		>
			<RadioGroup
				className="grid gap-3"
				onValueChange={(value) =>
					onChange({
						...nextDraft,
						activationStatus:
							value === "provider_managed_now" ? "pending" : undefined,
						externalCollectionScheduleId: undefined,
						lastAttemptAt: undefined,
						lastError: undefined,
						mode: (value as OriginationCollectionsDraft["mode"]) || undefined,
						providerCode:
							value === "provider_managed_now" ? "pad_rotessa" : undefined,
						retryCount: undefined,
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
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-medium text-sm">{option.label}</p>
									{option.value === "provider_managed_now" ? (
										<Badge variant="outline">Rotessa</Badge>
									) : null}
								</div>
								<p className="text-muted-foreground text-sm leading-6">
									{option.description}
								</p>
							</div>
						</Label>
					);
				})}
			</RadioGroup>

			{isProviderManagedNow ? (
				<div className="space-y-4">
					<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="outline">Provider</Badge>
							<Badge variant="outline">
								{setupContext?.providerCode
									? formatStatusLabel(setupContext.providerCode)
									: "Pad Rotessa"}
							</Badge>
						</div>
						<p className="mt-3 text-sm leading-6">
							Only the staged primary borrower can supply the immediate
							provider-managed bank account. The selected account must be
							validated, have an active PAD mandate, and already carry a Rotessa
							customer reference in metadata.
						</p>
					</div>

					<div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-4">
						<p className="font-medium text-sm">Primary borrower context</p>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							{primaryBorrower?.message ??
								"Resolving the staged primary borrower and eligible bank accounts."}
						</p>
						{primaryBorrower?.fullName || primaryBorrower?.email ? (
							<p className="mt-2 text-sm">
								{primaryBorrower.fullName ?? primaryBorrower.email}
								{primaryBorrower.email && primaryBorrower.fullName
									? ` (${primaryBorrower.email})`
									: ""}
							</p>
						) : null}
					</div>

					<div className="space-y-3">
						<p className="font-medium text-sm">Primary borrower bank account</p>
						{setupContext === undefined ? (
							<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-6">
								Loading eligible borrower bank accounts.
							</div>
						) : setupBankAccounts.length === 0 ? (
							<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-6">
								No borrower-owned bank accounts are available for immediate
								Rotessa activation yet.
							</div>
						) : (
							<RadioGroup
								className="grid gap-3"
								onValueChange={(selectedBankAccountId) =>
									onChange({
										...nextDraft,
										activationStatus: nextDraft.activationStatus ?? "pending",
										mode: "provider_managed_now",
										providerCode: "pad_rotessa",
										selectedBankAccountId,
									})
								}
								value={nextDraft.selectedBankAccountId ?? ""}
							>
								{setupBankAccounts.map((bankAccount) => {
									const checked =
										nextDraft.selectedBankAccountId ===
										bankAccount.bankAccountId;
									const optionId = `collections-bank-${bankAccount.bankAccountId}`;

									return (
										<Label
											className={cn(
												"flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
												checked
													? "border-sky-500/40 bg-sky-500/10"
													: "border-border/70 hover:bg-muted/50"
											)}
											htmlFor={optionId}
											key={bankAccount.bankAccountId}
										>
											<RadioGroupItem
												id={optionId}
												value={bankAccount.bankAccountId}
											/>
											<div className="space-y-2">
												<div className="flex flex-wrap items-center gap-2">
													<p className="font-medium text-sm">
														{buildBankAccountLabel(bankAccount)}
													</p>
													{bankAccount.isDefaultInbound ? (
														<Badge variant="outline">Default inbound</Badge>
													) : null}
												</div>
												<p className="text-muted-foreground text-sm">
													{formatStatusLabel(bankAccount.status)} • mandate{" "}
													{formatStatusLabel(bankAccount.mandateStatus)}
													{bankAccount.validationMethod
														? ` • ${formatStatusLabel(bankAccount.validationMethod)}`
														: ""}
												</p>
												{bankAccount.eligibilityErrors.length > 0 ? (
													<ul className="list-disc space-y-1 pl-5 text-destructive text-sm">
														{bankAccount.eligibilityErrors.map((error) => (
															<li key={error}>{error}</li>
														))}
													</ul>
												) : (
													<p className="text-emerald-700 text-sm">
														Eligible for immediate Rotessa activation.
													</p>
												)}
											</div>
										</Label>
									);
								})}
							</RadioGroup>
						)}
					</div>

					<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
						<p className="font-medium text-sm">
							Immediate activation preflight
						</p>
						<ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
							<li>
								Canonical mortgage commit always finishes before provider
								activation starts.
							</li>
							<li>
								If Rotessa activation fails, the case stays committed and the
								mortgage detail page exposes retry.
							</li>
							<li>
								Only future planned app-owned entries are handed to Rotessa.
							</li>
						</ul>
						{setupContext?.preflightErrors.length ? (
							<ul className="mt-3 list-disc space-y-1 pl-5 text-destructive text-sm leading-6">
								{setupContext.preflightErrors.map((error) => (
									<li key={error}>{error}</li>
								))}
							</ul>
						) : null}
					</div>
				</div>
			) : (
				<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-6">
					FairLend will commit the canonical mortgage, bootstrap obligations,
					and keep collection execution inside the app until you explicitly
					choose immediate Rotessa activation.
				</div>
			)}
		</OriginationStepCard>
	);
}
