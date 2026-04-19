import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import type { OriginationMortgageDraft } from "#/lib/admin-origination";
import { OriginationStepCard } from "./OriginationStepCard";

interface MortgageTermsStepProps {
	draft?: OriginationMortgageDraft;
	errors?: readonly string[];
	onChange: (nextDraft: OriginationMortgageDraft | undefined) => void;
}

function parseNumberInput(value: string) {
	if (!value.trim()) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function MortgageTermsStep({
	draft,
	errors,
	onChange,
}: MortgageTermsStepProps) {
	const nextDraft = draft ?? {};

	return (
		<OriginationStepCard
			description="Capture staged economics and date cadence exactly once so later commit logic can build the canonical mortgage without re-entering terms."
			errors={errors}
			title="Mortgage terms"
		>
			<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Core economics</CardTitle>
						<CardDescription>
							These fields drive the canonical activation constructor and the
							payment bootstrap that follows commit.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="principal">Principal</Label>
							<Input
								id="principal"
								onChange={(event) =>
									onChange({
										...nextDraft,
										principal: parseNumberInput(event.target.value),
									})
								}
								placeholder="350000"
								type="number"
								value={nextDraft.principal ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="interestRate">Interest rate (%)</Label>
							<Input
								id="interestRate"
								onChange={(event) =>
									onChange({
										...nextDraft,
										interestRate: parseNumberInput(event.target.value),
									})
								}
								placeholder="7.25"
								step="0.01"
								type="number"
								value={nextDraft.interestRate ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="rateType">Rate type</Label>
							<NativeSelect
								id="rateType"
								onChange={(event) =>
									onChange({
										...nextDraft,
										rateType:
											(event.target.value as typeof nextDraft.rateType) ||
											undefined,
									})
								}
								value={nextDraft.rateType ?? ""}
							>
								<NativeSelectOption value="">
									Select rate type
								</NativeSelectOption>
								<NativeSelectOption value="fixed">Fixed</NativeSelectOption>
								<NativeSelectOption value="variable">
									Variable
								</NativeSelectOption>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor="loanType">Loan type</Label>
							<NativeSelect
								id="loanType"
								onChange={(event) =>
									onChange({
										...nextDraft,
										loanType:
											(event.target.value as typeof nextDraft.loanType) ||
											undefined,
									})
								}
								value={nextDraft.loanType ?? ""}
							>
								<NativeSelectOption value="">
									Select loan type
								</NativeSelectOption>
								<NativeSelectOption value="conventional">
									Conventional
								</NativeSelectOption>
								<NativeSelectOption value="insured">Insured</NativeSelectOption>
								<NativeSelectOption value="high_ratio">
									High ratio
								</NativeSelectOption>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor="termMonths">Term (months)</Label>
							<Input
								id="termMonths"
								onChange={(event) =>
									onChange({
										...nextDraft,
										termMonths: parseNumberInput(event.target.value),
									})
								}
								type="number"
								value={nextDraft.termMonths ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="amortizationMonths">Amortization (months)</Label>
							<Input
								id="amortizationMonths"
								onChange={(event) =>
									onChange({
										...nextDraft,
										amortizationMonths: parseNumberInput(event.target.value),
									})
								}
								type="number"
								value={nextDraft.amortizationMonths ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="paymentAmount">Payment amount</Label>
							<Input
								id="paymentAmount"
								onChange={(event) =>
									onChange({
										...nextDraft,
										paymentAmount: parseNumberInput(event.target.value),
									})
								}
								type="number"
								value={nextDraft.paymentAmount ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="paymentFrequency">Payment frequency</Label>
							<NativeSelect
								id="paymentFrequency"
								onChange={(event) =>
									onChange({
										...nextDraft,
										paymentFrequency:
											(event.target
												.value as typeof nextDraft.paymentFrequency) ||
											undefined,
									})
								}
								value={nextDraft.paymentFrequency ?? ""}
							>
								<NativeSelectOption value="">
									Select frequency
								</NativeSelectOption>
								<NativeSelectOption value="monthly">Monthly</NativeSelectOption>
								<NativeSelectOption value="bi_weekly">
									Bi-weekly
								</NativeSelectOption>
								<NativeSelectOption value="accelerated_bi_weekly">
									Accelerated bi-weekly
								</NativeSelectOption>
								<NativeSelectOption value="weekly">Weekly</NativeSelectOption>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor="lienPosition">Lien position</Label>
							<Input
								id="lienPosition"
								onChange={(event) =>
									onChange({
										...nextDraft,
										lienPosition: parseNumberInput(event.target.value),
									})
								}
								type="number"
								value={nextDraft.lienPosition ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="annualServicingRate">
								Annual servicing rate (%)
							</Label>
							<Input
								id="annualServicingRate"
								onChange={(event) =>
									onChange({
										...nextDraft,
										annualServicingRate: parseNumberInput(event.target.value),
									})
								}
								step="0.01"
								type="number"
								value={nextDraft.annualServicingRate ?? ""}
							/>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">
							Dates and servicing context
						</CardTitle>
						<CardDescription>
							Commit uses these dates and cadence to bootstrap canonical
							obligations and planned app-owned collection entries.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="space-y-2">
							<Label htmlFor="termStartDate">Term start date</Label>
							<Input
								id="termStartDate"
								onChange={(event) =>
									onChange({
										...nextDraft,
										termStartDate: event.target.value,
									})
								}
								type="date"
								value={nextDraft.termStartDate ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="firstPaymentDate">First payment date</Label>
							<Input
								id="firstPaymentDate"
								onChange={(event) =>
									onChange({
										...nextDraft,
										firstPaymentDate: event.target.value,
									})
								}
								type="date"
								value={nextDraft.firstPaymentDate ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="maturityDate">Maturity date</Label>
							<Input
								id="maturityDate"
								onChange={(event) =>
									onChange({
										...nextDraft,
										maturityDate: event.target.value,
									})
								}
								type="date"
								value={nextDraft.maturityDate ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="interestAdjustmentDate">
								Interest adjustment date
							</Label>
							<Input
								id="interestAdjustmentDate"
								onChange={(event) =>
									onChange({
										...nextDraft,
										interestAdjustmentDate: event.target.value,
									})
								}
								type="date"
								value={nextDraft.interestAdjustmentDate ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fundedAt">Funded at (timestamp)</Label>
							<Input
								id="fundedAt"
								onChange={(event) =>
									onChange({
										...nextDraft,
										fundedAt: parseNumberInput(event.target.value),
									})
								}
								type="number"
								value={nextDraft.fundedAt ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="priorMortgageId">Prior mortgage ID</Label>
							<Input
								id="priorMortgageId"
								onChange={(event) =>
									onChange({
										...nextDraft,
										priorMortgageId: event.target.value || undefined,
									})
								}
								placeholder="mortgage_..."
								value={nextDraft.priorMortgageId ?? ""}
							/>
						</div>
						<div className="flex items-center gap-3 rounded-xl border border-border/70 px-4 py-3">
							<Checkbox
								checked={Boolean(nextDraft.isRenewal)}
								id="isRenewal"
								onCheckedChange={(checked) =>
									onChange({
										...nextDraft,
										isRenewal: checked === true,
									})
								}
							/>
							<div className="space-y-1">
								<Label htmlFor="isRenewal">Renewal deal</Label>
								<p className="text-muted-foreground text-sm">
									Marks the staged mortgage as a renewal without triggering any
									domain-side renewal flow yet.
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</OriginationStepCard>
	);
}
