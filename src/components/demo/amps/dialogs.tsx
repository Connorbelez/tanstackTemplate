import { useAction, useMutation } from "convex/react";
import { LoaderCircle, Plus, Send, Shuffle, Workflow } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	CollectionRuleConfig,
	CollectionRuleKind,
	CollectionRuleStatus,
} from "../../../../convex/payments/collectionPlan/ruleContract";
import { formatCurrency, formatDateOnly } from "./ui";

interface MortgageOption {
	label: string;
	mortgageId: Id<"mortgages">;
}

interface EditableRule {
	code: string;
	config: CollectionRuleConfig;
	description: string;
	displayName: string;
	effectiveFrom?: number;
	effectiveTo?: number;
	kind: CollectionRuleKind;
	priority: number;
	ruleId: Id<"collectionRules">;
	scope:
		| { scopeType: "global" }
		| { mortgageId: Id<"mortgages">; scopeType: "mortgage" };
	status: CollectionRuleStatus;
}

interface WorkoutObligationOption {
	amount: number;
	dueDate: number;
	obligationId: Id<"obligations">;
	paymentNumber: number;
	status: string;
}

interface RuleEditorDraft {
	backoffBaseDays: string;
	blockingDecision: "defer" | "require_operator_review" | "suppress";
	code: string;
	deferDays: string;
	delayDays: string;
	description: string;
	displayName: string;
	effectiveFrom: string;
	effectiveTo: string;
	failureCountThreshold: string;
	kind: CollectionRuleKind;
	lookbackDays: string;
	maxRetries: string;
	mortgageId?: Id<"mortgages">;
	priority: string;
	scopeType: "global" | "mortgage";
	status: CollectionRuleStatus;
}

const RULE_KIND_OPTIONS: CollectionRuleKind[] = [
	"schedule",
	"retry",
	"late_fee",
	"balance_pre_check",
	"reschedule_policy",
	"workout_policy",
];

const RULE_STATUS_OPTIONS: CollectionRuleStatus[] = [
	"draft",
	"active",
	"disabled",
	"archived",
];

function toDateTimeLocalValue(value?: number) {
	if (!value) {
		return "";
	}

	const date = new Date(value);
	const pad = (part: number) => String(part).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string) {
	if (!value) {
		return undefined;
	}
	const timestamp = new Date(value).getTime();
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

function buildInitialRuleDraft(rule?: EditableRule): RuleEditorDraft {
	if (!rule) {
		return {
			backoffBaseDays: "3",
			blockingDecision: "defer",
			code: "",
			deferDays: "3",
			delayDays: "5",
			description: "",
			displayName: "",
			effectiveFrom: "",
			effectiveTo: "",
			failureCountThreshold: "1",
			kind: "schedule",
			lookbackDays: "14",
			maxRetries: "3",
			mortgageId: undefined,
			priority: "10",
			scopeType: "global",
			status: "active",
		};
	}

	const balanceConfig =
		rule.config.kind === "balance_pre_check" && "signalSource" in rule.config
			? rule.config
			: undefined;

	return {
		backoffBaseDays:
			rule.config.kind === "retry" ? String(rule.config.backoffBaseDays) : "3",
		blockingDecision: balanceConfig?.blockingDecision ?? "defer",
		code: rule.code,
		deferDays:
			balanceConfig?.blockingDecision === "defer"
				? String(balanceConfig.deferDays)
				: "3",
		delayDays:
			rule.config.kind === "schedule" ? String(rule.config.delayDays) : "5",
		description: rule.description,
		displayName: rule.displayName,
		effectiveFrom: toDateTimeLocalValue(rule.effectiveFrom),
		effectiveTo: toDateTimeLocalValue(rule.effectiveTo),
		failureCountThreshold: String(balanceConfig?.failureCountThreshold ?? 1),
		kind: rule.kind,
		lookbackDays: String(balanceConfig?.lookbackDays ?? 14),
		maxRetries:
			rule.config.kind === "retry" ? String(rule.config.maxRetries) : "3",
		mortgageId:
			rule.scope.scopeType === "mortgage" ? rule.scope.mortgageId : undefined,
		priority: String(rule.priority),
		scopeType: rule.scope.scopeType,
		status: rule.status,
	};
}

function parsePositiveInteger(value: string, fallback: number) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function describeDialogError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function closeDialog(
	setOpen: Dispatch<SetStateAction<boolean>>,
	reset?: () => void
) {
	setOpen(false);
	reset?.();
}

function useDialogSubmitAction(options?: { onClosed?: () => void }) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!open) {
			options?.onClosed?.();
		}
	}, [open, options]);

	async function run(action: () => Promise<void>) {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(describeDialogError(error));
		} finally {
			setBusy(false);
		}
	}

	return {
		busy,
		open,
		run,
		setOpen,
	};
}

function buildRuleConfigFromDraft(
	draft: RuleEditorDraft
): CollectionRuleConfig {
	switch (draft.kind) {
		case "schedule":
			return {
				kind: "schedule",
				delayDays: parsePositiveInteger(draft.delayDays, 5),
			};
		case "retry":
			return {
				kind: "retry",
				backoffBaseDays: parsePositiveInteger(draft.backoffBaseDays, 3),
				maxRetries: parsePositiveInteger(draft.maxRetries, 3),
			};
		case "late_fee":
			return {
				kind: "late_fee",
				feeCode: "late_fee",
				feeSurface: "borrower_charge",
			};
		case "balance_pre_check":
			if (draft.blockingDecision === "defer") {
				return {
					kind: "balance_pre_check",
					signalSource: "recent_transfer_failures",
					lookbackDays: parsePositiveInteger(draft.lookbackDays, 14),
					failureCountThreshold: parsePositiveInteger(
						draft.failureCountThreshold,
						1
					),
					blockingDecision: "defer",
					deferDays: parsePositiveInteger(draft.deferDays, 3),
				};
			}

			return {
				kind: "balance_pre_check",
				signalSource: "recent_transfer_failures",
				lookbackDays: parsePositiveInteger(draft.lookbackDays, 14),
				failureCountThreshold: parsePositiveInteger(
					draft.failureCountThreshold,
					1
				),
				blockingDecision: draft.blockingDecision,
			};
		case "reschedule_policy":
			return {
				kind: "reschedule_policy",
				mode: "placeholder",
			};
		case "workout_policy":
			return {
				kind: "workout_policy",
				mode: "placeholder",
			};
		default:
			return {
				kind: "workout_policy",
				mode: "placeholder",
			};
	}
}

function describeExecuteResult(
	result: Awaited<
		ReturnType<
			ReturnType<
				typeof useAction<
					typeof api.payments.collectionPlan.admin.executeCollectionPlanEntry
				>
			>
		>
	>
) {
	switch (result.outcome) {
		case "attempt_created":
			return `Created attempt ${result.collectionAttemptId} for the selected plan entry.`;
		case "already_executed":
			return "This plan entry was already executed; the demo is showing the existing attempt.";
		case "not_eligible":
		case "noop":
		case "rejected":
			return "reasonDetail" in result
				? (result.reasonDetail ?? "Execution did not proceed.")
				: "Execution did not proceed.";
		default:
			return "Execution did not proceed.";
	}
}

export function ExecutePlanEntryDialog({
	planEntryId,
	triggerLabel = "Execute entry",
}: {
	planEntryId: Id<"collectionPlanEntries">;
	triggerLabel?: string;
}) {
	const executePlanEntry = useAction(
		api.payments.collectionPlan.admin.executeCollectionPlanEntry
	);
	const [reason, setReason] = useState("");
	const { busy, open, run, setOpen } = useDialogSubmitAction({
		onClosed: () => setReason(""),
	});

	async function handleSubmit() {
		await run(async () => {
			const result = await executePlanEntry({
				planEntryId,
				reason: reason.trim() || undefined,
			});

			if (result.outcome === "attempt_created") {
				toast.success(describeExecuteResult(result));
				closeDialog(setOpen);
				return;
			}

			if (result.outcome === "already_executed") {
				toast.message(describeExecuteResult(result));
				closeDialog(setOpen);
				return;
			}

			toast.error(describeExecuteResult(result));
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button className="rounded-full" size="sm">
					<Send className="size-4" />
					{triggerLabel}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Manual Execute Collection Entry</DialogTitle>
					<DialogDescription>
						This uses the canonical `executeCollectionPlanEntry` action and
						keeps the demo on the real AMPS execution path.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-2">
						<Label htmlFor="execute-reason">Operator note</Label>
						<Textarea
							id="execute-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="Optional walkthrough note for why this entry is being executed manually."
							rows={4}
							value={reason}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button disabled={busy} onClick={handleSubmit}>
						{busy ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Send className="size-4" />
						)}
						Run canonical execution
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ReschedulePlanEntryDialog({
	planEntryId,
	scheduledDate,
}: {
	planEntryId: Id<"collectionPlanEntries">;
	scheduledDate?: number;
}) {
	const reschedule = useAction(
		api.payments.collectionPlan.admin.rescheduleCollectionPlanEntry
	);
	const [reason, setReason] = useState("");
	const [newScheduledDate, setNewScheduledDate] = useState(
		toDateTimeLocalValue(scheduledDate)
	);
	const { busy, open, run, setOpen } = useDialogSubmitAction({
		onClosed: () => {
			setReason("");
			setNewScheduledDate(toDateTimeLocalValue(scheduledDate));
		},
	});

	async function handleSubmit() {
		const parsedTimestamp = fromDateTimeLocalValue(newScheduledDate);
		if (!parsedTimestamp) {
			toast.error("Choose a valid replacement scheduled date.");
			return;
		}

		await run(async () => {
			const result = await reschedule({
				planEntryId,
				newScheduledDate: parsedTimestamp,
				reason,
			});
			if (result.outcome === "rescheduled") {
				toast.success(
					`Created replacement entry ${result.replacementPlanEntryId} scheduled for ${formatDateOnly(result.replacementScheduledDate)}.`
				);
				closeDialog(setOpen);
				return;
			}

			toast.error(result.reasonDetail);
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button className="rounded-full" size="sm" variant="outline">
					<Shuffle className="size-4" />
					Reschedule
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Reschedule Strategy Entry</DialogTitle>
					<DialogDescription>
						The original entry will be superseded and replaced through the
						canonical reschedule mutation.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="space-y-2">
						<Label htmlFor="reschedule-date">New scheduled date</Label>
						<Input
							id="reschedule-date"
							onChange={(event) => setNewScheduledDate(event.target.value)}
							type="datetime-local"
							value={newScheduledDate}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="reschedule-reason">Reschedule reason</Label>
						<Textarea
							id="reschedule-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="Explain the borrower or operations reason for moving this entry."
							rows={4}
							value={reason}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={busy || reason.trim().length === 0}
						onClick={handleSubmit}
					>
						{busy ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Shuffle className="size-4" />
						)}
						Apply canonical reschedule
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function WorkoutLifecycleDialog({
	mode,
	workoutPlanId,
}: {
	mode: "activate" | "cancel" | "complete";
	workoutPlanId: Id<"workoutPlans">;
}) {
	const activateWorkoutPlan = useAction(
		api.payments.collectionPlan.admin.activateWorkoutPlan
	);
	const cancelWorkoutPlan = useAction(
		api.payments.collectionPlan.admin.cancelWorkoutPlan
	);
	const completeWorkoutPlan = useAction(
		api.payments.collectionPlan.admin.completeWorkoutPlan
	);
	const [reason, setReason] = useState("");
	const { busy, open, run, setOpen } = useDialogSubmitAction({
		onClosed: () => setReason(""),
	});

	const dialogCopy = {
		activate: {
			title: "Activate workout",
			description:
				"Activation supersedes covered future plan entries and makes the workout strategy live.",
			button: "Activate workout",
		},
		cancel: {
			title: "Cancel workout",
			description:
				"Cancellation exits the workout and restores canonical default scheduling for uncovered obligations.",
			button: "Cancel workout",
		},
		complete: {
			title: "Complete workout",
			description:
				"Completion exits the workout and restores default scheduling without mutating mortgage lifecycle truth.",
			button: "Complete workout",
		},
	}[mode];

	async function handleSubmit() {
		await run(async () => {
			if (mode === "activate") {
				const result = await activateWorkoutPlan({ workoutPlanId });
				if (result.outcome === "activated") {
					toast.success("Workout strategy is now active.");
					closeDialog(setOpen);
					return;
				}
				if (result.outcome === "already_active") {
					toast.message("Workout is already active.");
					closeDialog(setOpen);
					return;
				}
				toast.error(result.reasonDetail);
			}

			if (mode === "complete") {
				const result = await completeWorkoutPlan({ workoutPlanId });
				if (
					result.outcome === "completed" ||
					result.outcome === "already_completed"
				) {
					toast.success(
						"Workout exited through the canonical completion path."
					);
					closeDialog(setOpen);
					return;
				}
				toast.error(result.reasonDetail);
			}

			if (mode === "cancel") {
				const result = await cancelWorkoutPlan({
					workoutPlanId,
					reason: reason.trim() || undefined,
				});
				if (
					result.outcome === "cancelled" ||
					result.outcome === "already_cancelled"
				) {
					toast.success("Workout cancelled and default scheduling restored.");
					closeDialog(setOpen);
					return;
				}
				toast.error(result.reasonDetail);
			}
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button
					className="rounded-full"
					size="sm"
					variant={mode === "activate" ? "default" : "outline"}
				>
					<Workflow className="size-4" />
					{dialogCopy.button}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{dialogCopy.title}</DialogTitle>
					<DialogDescription>{dialogCopy.description}</DialogDescription>
				</DialogHeader>
				{mode === "cancel" ? (
					<div className="space-y-2">
						<Label htmlFor="cancel-workout-reason">Cancellation reason</Label>
						<Textarea
							id="cancel-workout-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="Optional note for why the workout should be cancelled."
							rows={4}
							value={reason}
						/>
					</div>
				) : null}
				<DialogFooter>
					<Button disabled={busy} onClick={handleSubmit}>
						{busy ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Workflow className="size-4" />
						)}
						{dialogCopy.button}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function CreateWorkoutPlanDialog({
	mortgageId,
	obligations,
}: {
	mortgageId: Id<"mortgages">;
	obligations: WorkoutObligationOption[];
}) {
	const createWorkoutPlan = useAction(
		api.payments.collectionPlan.admin.createWorkoutPlan
	);
	const [name, setName] = useState("Demo hardship extension");
	const [rationale, setRationale] = useState(
		"Demo-created workout that shows strategy override without changing obligation truth."
	);
	const { busy, open, run, setOpen } = useDialogSubmitAction();

	const installments = useMemo(() => {
		if (obligations.length === 0) {
			return [];
		}

		const now = Date.now();
		const [first, ...rest] = obligations;
		const nextInstallments = [
			{
				amount: first.amount,
				method: "manual",
				obligationIds: [first.obligationId],
				scheduledDate: now + 7 * 86_400_000,
			},
		];

		if (rest.length > 0) {
			nextInstallments.push({
				amount: rest.reduce(
					(total, obligation) => total + obligation.amount,
					0
				),
				method: "manual",
				obligationIds: rest.map((obligation) => obligation.obligationId),
				scheduledDate: now + 21 * 86_400_000,
			});
		}

		return nextInstallments;
	}, [obligations]);

	async function handleSubmit() {
		if (installments.length === 0) {
			toast.error(
				"This mortgage has no eligible obligations for a demo workout."
			);
			return;
		}

		await run(async () => {
			const result = await createWorkoutPlan({
				mortgageId,
				name,
				rationale,
				installments,
			});
			if (result.outcome === "created") {
				toast.success("Draft workout created.");
				closeDialog(setOpen);
				return;
			}
			toast.error(result.reasonDetail);
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button className="rounded-full" size="sm" variant="outline">
					<Plus className="size-4" />
					Create workout
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create demo workout</DialogTitle>
					<DialogDescription>
						This creates a draft workout through the canonical backend. The
						default schedule is only superseded after activation.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="space-y-2">
						<Label htmlFor="workout-name">Workout name</Label>
						<Input
							id="workout-name"
							onChange={(event) => setName(event.target.value)}
							value={name}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="workout-rationale">Rationale</Label>
						<Textarea
							id="workout-rationale"
							onChange={(event) => setRationale(event.target.value)}
							rows={4}
							value={rationale}
						/>
					</div>
					<div className="rounded-3xl border border-border/60 bg-muted/30 p-4">
						<div className="flex items-center gap-2">
							<Badge variant="secondary">Installment preview</Badge>
							<span className="text-muted-foreground text-xs">
								Grouped from upcoming obligations only
							</span>
						</div>
						<div className="mt-3 space-y-3">
							{installments.map((installment, index) => (
								<div
									className="rounded-2xl border border-border/60 bg-background/80 p-3"
									key={`${installment.scheduledDate}-${installment.obligationIds.join("-")}`}
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="font-medium text-sm">
											Installment {index + 1}
										</p>
										<Badge variant="outline">
											{formatDateOnly(installment.scheduledDate)}
										</Badge>
									</div>
									<p className="mt-2 text-muted-foreground text-sm">
										{formatCurrency(installment.amount)} across{" "}
										{installment.obligationIds.length} obligation
										{installment.obligationIds.length === 1 ? "" : "s"}
									</p>
								</div>
							))}
							{installments.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No upcoming obligations are available for workout creation on
									this mortgage.
								</p>
							) : null}
						</div>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={
							busy || name.trim().length === 0 || rationale.trim().length === 0
						}
						onClick={handleSubmit}
					>
						{busy ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Plus className="size-4" />
						)}
						Create draft workout
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function RuleEditorDialog({
	initialRule,
	mode,
	mortgageOptions,
	triggerLabel,
}: {
	initialRule?: EditableRule;
	mode: "create" | "update";
	mortgageOptions: MortgageOption[];
	triggerLabel: string;
}) {
	const createRule = useMutation(
		api.payments.collectionPlan.admin.createCollectionRule
	);
	const updateRule = useMutation(
		api.payments.collectionPlan.admin.updateCollectionRule
	);
	const [draft, setDraft] = useState<RuleEditorDraft>(() =>
		buildInitialRuleDraft(initialRule)
	);
	const { busy, open, run, setOpen } = useDialogSubmitAction();

	useEffect(() => {
		if (open) {
			setDraft(buildInitialRuleDraft(initialRule));
		}
	}, [initialRule, open]);

	async function handleSubmit() {
		const config = buildRuleConfigFromDraft(draft);
		const scope =
			draft.scopeType === "mortgage" && draft.mortgageId
				? { scopeType: "mortgage" as const, mortgageId: draft.mortgageId }
				: { scopeType: "global" as const };

		const basePayload = {
			config,
			description: draft.description.trim(),
			displayName: draft.displayName.trim(),
			effectiveFrom: fromDateTimeLocalValue(draft.effectiveFrom),
			effectiveTo: fromDateTimeLocalValue(draft.effectiveTo),
			priority: parsePositiveInteger(draft.priority, 10),
			scope,
			status: draft.status,
		};

		await run(async () => {
			if (mode === "create") {
				const result = await createRule({
					...basePayload,
					code: draft.code.trim(),
					kind: draft.kind,
				});
				if (result.outcome === "created") {
					toast.success("Rule created through the canonical admin mutation.");
					closeDialog(setOpen);
					return;
				}
				toast.error(result.reasonDetail);
			} else if (initialRule) {
				const result = await updateRule({
					...basePayload,
					ruleId: initialRule.ruleId,
				});
				if (result.outcome === "updated") {
					toast.success("Rule updated.");
					closeDialog(setOpen);
					return;
				}
				toast.error(result.reasonDetail);
			}
		});
	}

	let submitIcon = <Workflow className="size-4" />;
	if (busy) {
		submitIcon = <LoaderCircle className="size-4 animate-spin" />;
	} else if (mode === "create") {
		submitIcon = <Plus className="size-4" />;
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button
					className="rounded-full"
					size="sm"
					variant={mode === "create" ? "default" : "outline"}
				>
					{mode === "create" ? (
						<Plus className="size-4" />
					) : (
						<Workflow className="size-4" />
					)}
					{triggerLabel}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create"
							? "Create collection rule"
							: "Update collection rule"}
					</DialogTitle>
					<DialogDescription>
						Manage typed rule config through the real collection admin contract.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="rule-kind">Rule kind</Label>
						<select
							className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={mode === "update"}
							id="rule-kind"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									kind: event.target.value as CollectionRuleKind,
								}))
							}
							value={draft.kind}
						>
							{RULE_KIND_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-status">Status</Label>
						<select
							className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							id="rule-status"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									status: event.target.value as CollectionRuleStatus,
								}))
							}
							value={draft.status}
						>
							{RULE_STATUS_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-code">Rule code</Label>
						<Input
							disabled={mode === "update"}
							id="rule-code"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									code: event.target.value,
								}))
							}
							value={draft.code}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-priority">Priority</Label>
						<Input
							id="rule-priority"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									priority: event.target.value,
								}))
							}
							type="number"
							value={draft.priority}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-display-name">Display name</Label>
						<Input
							id="rule-display-name"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									displayName: event.target.value,
								}))
							}
							value={draft.displayName}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-scope-type">Scope</Label>
						<select
							className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							id="rule-scope-type"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									scopeType: event.target.value as "global" | "mortgage",
									mortgageId:
										event.target.value === "global"
											? undefined
											: current.mortgageId,
								}))
							}
							value={draft.scopeType}
						>
							<option value="global">Global</option>
							<option value="mortgage">Mortgage scoped</option>
						</select>
					</div>
					{draft.scopeType === "mortgage" ? (
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="rule-mortgage">Mortgage</Label>
							<select
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								id="rule-mortgage"
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										mortgageId: event.target.value as Id<"mortgages">,
									}))
								}
								value={draft.mortgageId ?? ""}
							>
								<option value="">Select a mortgage</option>
								{mortgageOptions.map((option) => (
									<option key={option.mortgageId} value={option.mortgageId}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					) : null}
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="rule-description">Description</Label>
						<Textarea
							id="rule-description"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									description: event.target.value,
								}))
							}
							rows={3}
							value={draft.description}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-effective-from">Effective from</Label>
						<Input
							id="rule-effective-from"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									effectiveFrom: event.target.value,
								}))
							}
							type="datetime-local"
							value={draft.effectiveFrom}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rule-effective-to">Effective to</Label>
						<Input
							id="rule-effective-to"
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									effectiveTo: event.target.value,
								}))
							}
							type="datetime-local"
							value={draft.effectiveTo}
						/>
					</div>
				</div>

				<div className="rounded-3xl border border-border/60 bg-muted/30 p-4">
					<p className="font-medium text-sm">Typed config</p>
					<div className="mt-4 grid gap-4 md:grid-cols-2">
						{draft.kind === "schedule" ? (
							<div className="space-y-2">
								<Label htmlFor="delay-days">Delay days</Label>
								<Input
									id="delay-days"
									onChange={(event) =>
										setDraft((current) => ({
											...current,
											delayDays: event.target.value,
										}))
									}
									type="number"
									value={draft.delayDays}
								/>
							</div>
						) : null}
						{draft.kind === "retry" ? (
							<>
								<div className="space-y-2">
									<Label htmlFor="max-retries">Max retries</Label>
									<Input
										id="max-retries"
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												maxRetries: event.target.value,
											}))
										}
										type="number"
										value={draft.maxRetries}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="backoff-days">Backoff base days</Label>
									<Input
										id="backoff-days"
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												backoffBaseDays: event.target.value,
											}))
										}
										type="number"
										value={draft.backoffBaseDays}
									/>
								</div>
							</>
						) : null}
						{draft.kind === "balance_pre_check" ? (
							<>
								<div className="space-y-2">
									<Label htmlFor="blocking-decision">Blocking decision</Label>
									<select
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
										id="blocking-decision"
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												blockingDecision: event.target.value as
													| "defer"
													| "require_operator_review"
													| "suppress",
											}))
										}
										value={draft.blockingDecision}
									>
										<option value="defer">defer</option>
										<option value="require_operator_review">
											require_operator_review
										</option>
										<option value="suppress">suppress</option>
									</select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="lookback-days">Lookback days</Label>
									<Input
										id="lookback-days"
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												lookbackDays: event.target.value,
											}))
										}
										type="number"
										value={draft.lookbackDays}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="failure-threshold">Failure threshold</Label>
									<Input
										id="failure-threshold"
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												failureCountThreshold: event.target.value,
											}))
										}
										type="number"
										value={draft.failureCountThreshold}
									/>
								</div>
								{draft.blockingDecision === "defer" ? (
									<div className="space-y-2">
										<Label htmlFor="defer-days">Defer days</Label>
										<Input
											id="defer-days"
											onChange={(event) =>
												setDraft((current) => ({
													...current,
													deferDays: event.target.value,
												}))
											}
											type="number"
											value={draft.deferDays}
										/>
									</div>
								) : null}
							</>
						) : null}
						{draft.kind === "late_fee" ? (
							<div className="md:col-span-2">
								<Badge variant="secondary">
									Late fee rules use the canonical `late_fee` borrower-charge
									config.
								</Badge>
							</div>
						) : null}
						{draft.kind === "reschedule_policy" ||
						draft.kind === "workout_policy" ? (
							<div className="md:col-span-2">
								<Badge variant="secondary">
									This rule kind still uses the placeholder typed config on the
									backend.
								</Badge>
							</div>
						) : null}
					</div>
				</div>

				<DialogFooter>
					<Button
						disabled={
							busy ||
							draft.displayName.trim().length === 0 ||
							draft.description.trim().length === 0 ||
							(mode === "create" && draft.code.trim().length === 0) ||
							(draft.scopeType === "mortgage" && !draft.mortgageId)
						}
						onClick={handleSubmit}
					>
						{submitIcon}
						{mode === "create" ? "Create rule" : "Update rule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
