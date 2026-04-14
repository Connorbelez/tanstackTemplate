import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import { useBrokerWhiteLabelStore } from "../-lib/store";
import type { MortgageApplicationFieldSet } from "../-lib/types";

const MORTGAGE_STEP_COUNT = 5;

const STEP_LABELS = [
	"Property Details",
	"Financial Information",
	"Loan Terms",
	"Document Upload",
	"Review & Submit",
] as const;

const STEP_COPY: { description: string; title: string }[] = [
	{
		title: "Property Details",
		description: "Tell us about the property securing this mortgage.",
	},
	{
		title: "Financial Information",
		description:
			"Provide your income and employment details to help us assess your application.",
	},
	{
		title: "Loan Terms",
		description: "Outline the structure you are seeking for this mortgage.",
	},
	{
		title: "Document Upload",
		description:
			"Note which documents you will provide. This demo does not accept file uploads.",
	},
	{
		title: "Review & Submit",
		description:
			"Confirm your details before submitting this mock application.",
	},
];

const EMPLOYMENT_STATUSES = [
	"Full-time employed",
	"Self-employed",
	"Part-time employed",
	"Contract",
	"Retired",
	"Other",
] as const;

const PAYMENT_FREQUENCIES = [
	"Monthly",
	"Semi-monthly",
	"Bi-weekly",
	"Weekly",
] as const;

const AMORTIZATION_OPTIONS = ["15", "20", "25", "30"] as const;

const maFieldIds: Record<keyof MortgageApplicationFieldSet, string> = {
	propertyAddress: "broker-ma-property-address",
	propertyType: "broker-ma-property-type",
	estimatedPropertyValue: "broker-ma-estimated-value",
	mortgageAmount: "broker-ma-mortgage-amount",
	annualGrossIncome: "broker-ma-annual-income",
	employmentStatus: "broker-ma-employment-status",
	employerName: "broker-ma-employer",
	yearsAtEmployer: "broker-ma-years-employer",
	otherIncomeSources: "broker-ma-other-income-src",
	otherIncomeAmount: "broker-ma-other-income-amt",
	creditCheckConsent: "broker-ma-credit-consent",
	amortizationYears: "broker-ma-amortization",
	paymentFrequency: "broker-ma-pay-freq",
	documentNotes: "broker-ma-doc-notes",
};

const maInputClass =
	"h-11 rounded-[var(--broker-radius-button)] border border-[var(--broker-border)] bg-[var(--broker-surface)] px-3.5 text-[15px] text-[var(--broker-text)] shadow-none placeholder:text-[var(--broker-text-muted)] md:text-sm";

const maLabelClass = "font-medium text-[13px] text-[var(--broker-text)]";

type MortgageFieldUpdater = <K extends keyof MortgageApplicationFieldSet>(
	field: K,
	value: MortgageApplicationFieldSet[K]
) => void;

function parseMoney(value: string): number {
	const digits = value.replace(/[^\d.]/g, "");
	if (digits === "") {
		return Number.NaN;
	}
	const n = Number.parseFloat(digits);
	return Number.isFinite(n) ? n : Number.NaN;
}

function formatLtv(mortgage: string, value: string): string | null {
	const m = parseMoney(mortgage);
	const v = parseMoney(value);
	if (!(v > 0 && m >= 0)) {
		return null;
	}
	return `${((m / v) * 100).toFixed(1)}%`;
}

function formatMoneyDisplay(raw: string): string {
	const n = parseMoney(raw);
	if (!Number.isFinite(n)) {
		return "—";
	}
	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency: "CAD",
		maximumFractionDigits: 0,
	}).format(n);
}

function validateMortgageStep(
	stepIndex: number,
	fields: MortgageApplicationFieldSet
): string | null {
	switch (stepIndex) {
		case 0: {
			if (
				!(
					fields.propertyAddress.trim() &&
					fields.propertyType.trim() &&
					fields.estimatedPropertyValue.trim() &&
					fields.mortgageAmount.trim()
				)
			) {
				return "Please complete all property fields.";
			}
			return null;
		}
		case 1: {
			if (
				!(
					fields.annualGrossIncome.trim() &&
					fields.employmentStatus.trim() &&
					fields.employerName.trim() &&
					fields.yearsAtEmployer.trim()
				)
			) {
				return "Please complete income and employment fields.";
			}
			if (!fields.creditCheckConsent) {
				return "Consent to a credit check is required to continue.";
			}
			return null;
		}
		case 2: {
			if (
				!(fields.amortizationYears.trim() && fields.paymentFrequency.trim())
			) {
				return "Select amortization and payment frequency.";
			}
			return null;
		}
		default:
			return null;
	}
}

function continueLabel(stepIndex: number): string {
	switch (stepIndex) {
		case 0:
			return "Continue to Financial Information";
		case 1:
			return "Continue to Loan Terms";
		case 2:
			return "Continue to Document Upload";
		case 3:
			return "Continue to Review";
		default:
			return "Submit application";
	}
}

function MortgageSidebarStepRow({
	currentStep,
	index,
	label,
}: {
	currentStep: number;
	index: number;
	label: string;
}) {
	const isComplete = currentStep > index;
	const isActive = currentStep === index;

	const rowClass =
		"flex items-center gap-3 rounded-[var(--broker-radius-button)] px-3 py-2.5 transition-colors";

	let rowStyle: CSSProperties = { color: "var(--broker-text-muted)" };
	if (isActive) {
		rowStyle = {
			backgroundColor: "var(--broker-primary)",
			color: "var(--broker-primary-foreground)",
		};
	} else if (isComplete) {
		rowStyle = {
			backgroundColor:
				"color-mix(in srgb, var(--broker-success) 14%, var(--broker-surface-muted))",
			color: "var(--broker-primary)",
		};
	}

	let badgeClass =
		"flex size-6 shrink-0 items-center justify-center rounded-full border-2 font-bold text-xs";
	if (isActive) {
		badgeClass = cn(
			badgeClass,
			"border-white bg-white text-[var(--broker-primary)]"
		);
	} else if (isComplete) {
		badgeClass = cn(
			badgeClass,
			"border-[var(--broker-primary)] bg-[var(--broker-primary)] text-white"
		);
	} else {
		badgeClass = cn(
			badgeClass,
			"border-[var(--broker-border)] bg-transparent text-[var(--broker-text-muted)]"
		);
	}

	const labelWeight = isActive || isComplete ? "font-semibold" : "font-medium";

	return (
		<div className={rowClass} style={rowStyle}>
			<div className={badgeClass}>
				{isComplete ? (
					<Check aria-hidden className="size-3 stroke-[3]" />
				) : (
					index + 1
				)}
			</div>
			<span className={cn("text-sm", labelWeight)}>{label}</span>
		</div>
	);
}

function MortgageApplicationSidebar({ currentStep }: { currentStep: number }) {
	return (
		<aside
			className="flex w-full shrink-0 flex-col gap-2 border-b p-5 md:p-7 lg:w-64 lg:border-r lg:border-b-0"
			style={{
				backgroundColor: "var(--broker-surface-muted)",
				borderColor: "var(--broker-border)",
			}}
		>
			<p
				className="pb-2 font-bold text-base"
				style={{
					color: "var(--broker-text)",
					fontFamily: "var(--broker-font-display)",
				}}
			>
				Application steps
			</p>
			{STEP_LABELS.map((label, index) => (
				<MortgageSidebarStepRow
					currentStep={currentStep}
					index={index}
					key={label}
					label={label}
				/>
			))}
		</aside>
	);
}

function MortgageFormStepProperty({
	fields,
	updateField,
}: {
	fields: MortgageApplicationFieldSet;
	updateField: MortgageFieldUpdater;
}) {
	return (
		<div className="grid gap-5 md:grid-cols-2">
			<div className="space-y-1.5 md:col-span-2">
				<Label className={maLabelClass} htmlFor={maFieldIds.propertyAddress}>
					Property address
				</Label>
				<Input
					className={maInputClass}
					id={maFieldIds.propertyAddress}
					onChange={(e) => updateField("propertyAddress", e.target.value)}
					placeholder="123 Maple Drive"
					value={fields.propertyAddress}
				/>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.propertyType}>
					Property type
				</Label>
				<Input
					className={maInputClass}
					id={maFieldIds.propertyType}
					onChange={(e) => updateField("propertyType", e.target.value)}
					placeholder="Detached home"
					value={fields.propertyType}
				/>
			</div>
			<div className="space-y-1.5">
				<Label
					className={maLabelClass}
					htmlFor={maFieldIds.estimatedPropertyValue}
				>
					Estimated value
				</Label>
				<Input
					className={cn(maInputClass, "font-mono")}
					id={maFieldIds.estimatedPropertyValue}
					onChange={(e) =>
						updateField("estimatedPropertyValue", e.target.value)
					}
					placeholder="$690,000"
					value={fields.estimatedPropertyValue}
				/>
			</div>
			<div className="space-y-1.5 md:col-span-2">
				<Label className={maLabelClass} htmlFor={maFieldIds.mortgageAmount}>
					Mortgage amount
				</Label>
				<Input
					className={cn(maInputClass, "font-mono")}
					id={maFieldIds.mortgageAmount}
					onChange={(e) => updateField("mortgageAmount", e.target.value)}
					placeholder="$450,000"
					value={fields.mortgageAmount}
				/>
			</div>
		</div>
	);
}

function MortgageFormStepFinancial({
	fields,
	updateField,
}: {
	fields: MortgageApplicationFieldSet;
	updateField: MortgageFieldUpdater;
}) {
	return (
		<div className="grid gap-5 md:grid-cols-2">
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.annualGrossIncome}>
					Annual gross income
				</Label>
				<Input
					className={cn(maInputClass, "font-mono")}
					id={maFieldIds.annualGrossIncome}
					onChange={(e) => updateField("annualGrossIncome", e.target.value)}
					placeholder="$145,000"
					value={fields.annualGrossIncome}
				/>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.employmentStatus}>
					Employment status
				</Label>
				<Select
					onValueChange={(v) => updateField("employmentStatus", v)}
					value={fields.employmentStatus || undefined}
				>
					<SelectTrigger
						className={cn(
							maInputClass,
							"w-full justify-between border-[var(--broker-border)]"
						)}
						id={maFieldIds.employmentStatus}
					>
						<SelectValue placeholder="Select status" />
					</SelectTrigger>
					<SelectContent>
						{EMPLOYMENT_STATUSES.map((s) => (
							<SelectItem key={s} value={s}>
								{s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.employerName}>
					Employer name
				</Label>
				<Input
					className={maInputClass}
					id={maFieldIds.employerName}
					onChange={(e) => updateField("employerName", e.target.value)}
					placeholder="Acme Financial Corp."
					value={fields.employerName}
				/>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.yearsAtEmployer}>
					Years at employer
				</Label>
				<Input
					className={maInputClass}
					id={maFieldIds.yearsAtEmployer}
					onChange={(e) => updateField("yearsAtEmployer", e.target.value)}
					placeholder="4 years"
					value={fields.yearsAtEmployer}
				/>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.otherIncomeSources}>
					Other income sources
				</Label>
				<Input
					className={maInputClass}
					id={maFieldIds.otherIncomeSources}
					onChange={(e) => updateField("otherIncomeSources", e.target.value)}
					placeholder="e.g. rental income, investments"
					value={fields.otherIncomeSources}
				/>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.otherIncomeAmount}>
					Other income amount
				</Label>
				<Input
					className={cn(maInputClass, "font-mono")}
					id={maFieldIds.otherIncomeAmount}
					onChange={(e) => updateField("otherIncomeAmount", e.target.value)}
					placeholder="$0"
					value={fields.otherIncomeAmount}
				/>
			</div>
			<div className="flex items-start gap-2 md:col-span-2">
				<Checkbox
					checked={fields.creditCheckConsent}
					className="mt-0.5 border-[var(--broker-border)] data-[state=checked]:border-[var(--broker-primary)] data-[state=checked]:bg-[var(--broker-primary)]"
					id={maFieldIds.creditCheckConsent}
					onCheckedChange={(c) => updateField("creditCheckConsent", c === true)}
				/>
				<Label
					className="font-normal text-[var(--broker-text-muted)] text-sm leading-snug"
					htmlFor={maFieldIds.creditCheckConsent}
				>
					I consent to a credit check for this application
				</Label>
			</div>
		</div>
	);
}

function MortgageFormStepLoanTerms({
	fields,
	updateField,
}: {
	fields: MortgageApplicationFieldSet;
	updateField: MortgageFieldUpdater;
}) {
	return (
		<div className="grid max-w-xl gap-5 md:grid-cols-2">
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.amortizationYears}>
					Amortization (years)
				</Label>
				<Select
					onValueChange={(v) => updateField("amortizationYears", v)}
					value={fields.amortizationYears || undefined}
				>
					<SelectTrigger
						className={cn(
							maInputClass,
							"w-full justify-between border-[var(--broker-border)]"
						)}
						id={maFieldIds.amortizationYears}
					>
						<SelectValue placeholder="Select amortization" />
					</SelectTrigger>
					<SelectContent>
						{AMORTIZATION_OPTIONS.map((y) => (
							<SelectItem key={y} value={y}>
								{y} years
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-1.5">
				<Label className={maLabelClass} htmlFor={maFieldIds.paymentFrequency}>
					Payment frequency
				</Label>
				<Select
					onValueChange={(v) => updateField("paymentFrequency", v)}
					value={fields.paymentFrequency || undefined}
				>
					<SelectTrigger
						className={cn(
							maInputClass,
							"w-full justify-between border-[var(--broker-border)]"
						)}
						id={maFieldIds.paymentFrequency}
					>
						<SelectValue placeholder="Select frequency" />
					</SelectTrigger>
					<SelectContent>
						{PAYMENT_FREQUENCIES.map((f) => (
							<SelectItem key={f} value={f}>
								{f}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

function MortgageFormStepDocuments({
	fields,
	updateField,
}: {
	fields: MortgageApplicationFieldSet;
	updateField: MortgageFieldUpdater;
}) {
	return (
		<div className="max-w-xl space-y-1.5">
			<Label className={maLabelClass} htmlFor={maFieldIds.documentNotes}>
				Documents you will upload
			</Label>
			<Textarea
				className="min-h-[120px] rounded-[var(--broker-radius-button)] border border-[var(--broker-border)] bg-[var(--broker-surface)] text-[15px] text-[var(--broker-text)] shadow-none placeholder:text-[var(--broker-text-muted)] md:text-sm"
				id={maFieldIds.documentNotes}
				onChange={(e) => updateField("documentNotes", e.target.value)}
				placeholder="e.g. pay stubs, T4s, notice of assessment…"
				value={fields.documentNotes}
			/>
		</div>
	);
}

function MortgageFormStepReview({
	fields,
	ltv,
}: {
	fields: MortgageApplicationFieldSet;
	ltv: string | null;
}) {
	const rows: [string, string][] = [
		["Property", fields.propertyAddress],
		["Type", fields.propertyType],
		["Est. value", formatMoneyDisplay(fields.estimatedPropertyValue)],
		["Mortgage", formatMoneyDisplay(fields.mortgageAmount)],
		["LTV", ltv ?? "—"],
		["Income", fields.annualGrossIncome],
		["Employment", fields.employmentStatus],
		["Employer", fields.employerName],
		[
			"Amortization",
			fields.amortizationYears ? `${fields.amortizationYears} years` : "—",
		],
		["Payments", fields.paymentFrequency || "—"],
	];

	return (
		<div className="grid gap-3 text-sm">
			{rows.map(([k, v]) => (
				<div
					className="flex justify-between gap-4 border-[var(--broker-border)] border-b py-2 last:border-0"
					key={k}
				>
					<span className="text-[var(--broker-text-muted)]">{k}</span>
					<span className="max-w-[60%] text-right font-medium text-[var(--broker-text)]">
						{v || "—"}
					</span>
				</div>
			))}
		</div>
	);
}

function mortgageStepBody(
	currentStep: number,
	fields: MortgageApplicationFieldSet,
	updateField: MortgageFieldUpdater,
	ltv: string | null
): ReactNode {
	switch (currentStep) {
		case 0:
			return (
				<MortgageFormStepProperty fields={fields} updateField={updateField} />
			);
		case 1:
			return (
				<MortgageFormStepFinancial fields={fields} updateField={updateField} />
			);
		case 2:
			return (
				<MortgageFormStepLoanTerms fields={fields} updateField={updateField} />
			);
		case 3:
			return (
				<MortgageFormStepDocuments fields={fields} updateField={updateField} />
			);
		case 4:
			return <MortgageFormStepReview fields={fields} ltv={ltv} />;
		default:
			return null;
	}
}

function MortgageApplicationSummaryPanel({
	currentStep,
	fields,
	ltv,
	progressPct,
}: {
	currentStep: number;
	fields: MortgageApplicationFieldSet;
	ltv: string | null;
	progressPct: number;
}) {
	return (
		<aside
			className="w-full shrink-0 border-t p-6 md:p-7 lg:w-72 lg:border-t-0 lg:border-l"
			style={{
				backgroundColor: "var(--broker-surface-muted)",
				borderColor: "var(--broker-border)",
			}}
		>
			<p
				className="font-bold text-sm uppercase tracking-wider"
				style={{
					color: "var(--broker-text)",
					fontFamily: "var(--broker-font-display)",
				}}
			>
				Application summary
			</p>
			<div
				className="mt-4 space-y-3 rounded-[var(--broker-radius-button)] border p-4 text-xs"
				style={{
					backgroundColor: "var(--broker-surface)",
					borderColor: "var(--broker-border)",
				}}
			>
				<div className="flex justify-between gap-2">
					<span className="text-[var(--broker-text-muted)]">Property</span>
					<span className="max-w-[55%] text-right font-medium text-[var(--broker-text)]">
						{fields.propertyAddress || "—"}
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span className="text-[var(--broker-text-muted)]">Type</span>
					<span className="max-w-[55%] text-right font-medium text-[var(--broker-text)]">
						{fields.propertyType || "—"}
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span className="text-[var(--broker-text-muted)]">Est. value</span>
					<span
						className="font-mono font-semibold text-[var(--broker-text)]"
						style={{ fontFamily: "var(--broker-font-mono)" }}
					>
						{formatMoneyDisplay(fields.estimatedPropertyValue)}
					</span>
				</div>
				<div
					className="h-px"
					style={{ backgroundColor: "var(--broker-border)" }}
				/>
				<div className="flex justify-between gap-2">
					<span className="text-[var(--broker-text-muted)]">Mortgage amt</span>
					<span
						className="font-mono font-semibold text-[var(--broker-text)]"
						style={{ fontFamily: "var(--broker-font-mono)" }}
					>
						{formatMoneyDisplay(fields.mortgageAmount)}
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span className="text-[var(--broker-text-muted)]">LTV</span>
					<span
						className="font-mono font-semibold"
						style={{
							color: ltv ? "var(--broker-success)" : "var(--broker-text)",
							fontFamily: "var(--broker-font-mono)",
						}}
					>
						{ltv ?? "—"}
					</span>
				</div>
			</div>
			<div className="mt-5 space-y-2">
				<p
					className="font-medium text-xs"
					style={{ color: "var(--broker-text-muted)" }}
				>
					Completion
				</p>
				<div
					className="h-1.5 overflow-hidden rounded-sm"
					style={{ backgroundColor: "var(--broker-border)" }}
				>
					<div
						className="h-full rounded-sm transition-[width] duration-300 ease-out"
						style={{
							width: `${progressPct}%`,
							backgroundColor: "var(--broker-primary)",
						}}
					/>
				</div>
				<p
					className="text-[11px]"
					style={{ color: "var(--broker-text-muted)" }}
				>
					{currentStep + 1} of {MORTGAGE_STEP_COUNT} steps complete
				</p>
			</div>
		</aside>
	);
}

function MortgageApplicationSuccessPanel({
	onReset,
	reduceMotion,
}: {
	onReset: () => void;
	reduceMotion: boolean | null;
}) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="flex flex-col items-center gap-4 px-6 py-16 text-center md:px-10"
			exit={{ opacity: 0, y: 8 }}
			initial={{ opacity: 0, y: 12 }}
			key="ma-success"
			transition={reduceMotion ? { duration: 0.2 } : { duration: 0.35 }}
		>
			<div
				className="flex size-14 items-center justify-center rounded-full"
				style={{ backgroundColor: "#F0FDF4" }}
			>
				<Check className="size-7" style={{ color: "var(--broker-success)" }} />
			</div>
			<h3
				className="max-w-lg text-balance font-black text-2xl tracking-tight md:text-3xl"
				style={{
					color: "var(--broker-text)",
					fontFamily: "var(--broker-font-display)",
				}}
			>
				Application received (demo)
			</h3>
			<p
				className="max-w-md text-sm leading-7"
				style={{ color: "var(--broker-text-muted)" }}
			>
				In production this would create a broker-scoped record and route to
				underwriting. Here, everything resets when you start again.
			</p>
			<Button
				className="mt-2 rounded-[var(--broker-radius-button)] px-6 font-semibold"
				onClick={onReset}
				style={{
					backgroundColor: "var(--broker-primary)",
					color: "var(--broker-primary-foreground)",
				}}
				type="button"
			>
				Start another application
			</Button>
		</motion.div>
	);
}

export function MortgageApplicationSection() {
	const reduceMotion = useReducedMotion();
	const mortgageApplication = useBrokerWhiteLabelStore(
		(s) => s.mortgageApplication
	);
	const updateField = useBrokerWhiteLabelStore(
		(s) => s.updateMortgageApplicationField
	);
	const nextStep = useBrokerWhiteLabelStore(
		(s) => s.nextMortgageApplicationStep
	);
	const previousStep = useBrokerWhiteLabelStore(
		(s) => s.previousMortgageApplicationStep
	);
	const submit = useBrokerWhiteLabelStore((s) => s.submitMortgageApplication);
	const resetMortgage = useBrokerWhiteLabelStore(
		(s) => s.resetMortgageApplication
	);

	const [localError, setLocalError] = useState<string | null>(null);

	const { currentStep, fields, isSubmitted } = mortgageApplication;
	const ltv = formatLtv(fields.mortgageAmount, fields.estimatedPropertyValue);

	function handlePrimary() {
		if (currentStep < 4) {
			const err = validateMortgageStep(currentStep, fields);
			if (err) {
				setLocalError(err);
				return;
			}
			setLocalError(null);
			nextStep();
			return;
		}
		const err =
			validateMortgageStep(0, fields) ??
			validateMortgageStep(1, fields) ??
			validateMortgageStep(2, fields);
		if (err) {
			setLocalError(err);
			return;
		}
		setLocalError(null);
		submit();
	}

	const progressPct = Math.round(
		((currentStep + 1) / MORTGAGE_STEP_COUNT) * 100
	);

	const stepMeta = STEP_COPY[currentStep] ?? STEP_COPY[0];

	return (
		<section
			className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 lg:py-14 xl:px-16"
			id="mortgage-application"
		>
			<div className="mb-8 max-w-2xl space-y-2">
				<p
					className="font-bold text-sm uppercase tracking-[0.15em]"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					Mortgage application
				</p>
				<h2
					className="text-balance font-black text-3xl tracking-tight md:text-4xl"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					Apply in guided steps
				</h2>
				<p
					className="text-sm leading-7 md:text-base"
					style={{ color: "var(--broker-text-muted)" }}
				>
					This mock flow mirrors a full broker-branded intake. Your entries stay
					in local demo state only.
				</p>
			</div>

			<div
				className="overflow-hidden rounded-[var(--broker-radius-card)] border text-[var(--broker-text)] shadow-sm transition-[box-shadow] duration-300 hover:shadow-md"
				style={{
					backgroundColor: "var(--broker-surface)",
					borderColor: "var(--broker-border)",
				}}
			>
				<AnimatePresence mode="wait">
					{isSubmitted ? (
						<MortgageApplicationSuccessPanel
							onReset={() => {
								setLocalError(null);
								resetMortgage();
							}}
							reduceMotion={reduceMotion}
						/>
					) : (
						<motion.div
							animate={{ opacity: 1 }}
							className="flex flex-col lg:flex-row"
							exit={{ opacity: 0 }}
							initial={{ opacity: 1 }}
							key="ma-flow"
							transition={{ duration: reduceMotion ? 0.12 : 0.2 }}
						>
							<MortgageApplicationSidebar currentStep={currentStep} />

							<div className="flex min-h-[480px] flex-1 flex-col gap-6 overflow-hidden px-5 py-8 md:px-10">
								<header className="space-y-1.5">
									<h3
										className="font-extrabold text-[22px] tracking-tight"
										style={{
											color: "var(--broker-text)",
											fontFamily: "var(--broker-font-display)",
										}}
									>
										{stepMeta.title}
									</h3>
									<p
										className="text-sm leading-5"
										style={{ color: "var(--broker-text-muted)" }}
									>
										{stepMeta.description}
									</p>
								</header>

								{localError ? (
									<p className="font-medium text-red-600 text-sm">
										{localError}
									</p>
								) : null}

								<div className="flex flex-1 flex-col gap-5">
									{mortgageStepBody(currentStep, fields, updateField, ltv)}
								</div>

								<div
									className="mt-auto flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
									style={{ borderColor: "var(--broker-border)" }}
								>
									<Button
										className="h-11 gap-1.5 rounded-[var(--broker-radius-button)] border px-5 font-medium shadow-none"
										disabled={currentStep === 0}
										onClick={() => {
											setLocalError(null);
											previousStep();
										}}
										style={{
											backgroundColor: "var(--broker-surface-muted)",
											borderColor: "var(--broker-border)",
											color: "var(--broker-text-muted)",
										}}
										type="button"
										variant="outline"
									>
										<ArrowLeft className="size-3.5" />
										Back
									</Button>
									<Button
										className="h-11 gap-1.5 rounded-[var(--broker-radius-button)] px-6 font-semibold shadow-none"
										onClick={handlePrimary}
										style={{
											backgroundColor: "var(--broker-primary)",
											color: "var(--broker-primary-foreground)",
										}}
										type="button"
									>
										{continueLabel(currentStep)}
										<ArrowRight className="size-3.5" />
									</Button>
								</div>
							</div>

							<MortgageApplicationSummaryPanel
								currentStep={currentStep}
								fields={fields}
								ltv={ltv}
								progressPct={progressPct}
							/>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</section>
	);
}
