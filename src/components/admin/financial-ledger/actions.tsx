import { useMutation } from "convex/react";
import { LoaderCircle, Scissors, Send, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { formatCurrencyCents } from "./format";

const CURRENCY_INPUT_PATTERN = /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/;

function parseCurrencyInputToCents(value: string) {
	const normalized = value.trim().replaceAll(",", "");
	if (normalized.length === 0) {
		return null;
	}

	if (!CURRENCY_INPUT_PATTERN.test(normalized)) {
		return null;
	}

	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) && parsed > 0
		? Math.round(parsed * 100)
		: null;
}

function centsInputValue(value: number) {
	return (value / 100).toFixed(2);
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function useDialogState(reset?: () => void) {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) {
			reset?.();
		}
	}, [open, reset]);

	return { open, setOpen, setSubmitting, submitting };
}

export function WaiveBalanceDialog({
	defaultAmountCents,
	obligationId,
}: {
	defaultAmountCents: number;
	obligationId: Id<"obligations">;
}) {
	const waiveBalance = useMutation(
		api.payments.cashLedger.mutations.waiveObligationBalance
	);
	const [amountInput, setAmountInput] = useState(
		centsInputValue(defaultAmountCents)
	);
	const [reason, setReason] = useState("");
	const { open, setOpen, setSubmitting, submitting } = useDialogState(() => {
		setAmountInput(centsInputValue(defaultAmountCents));
		setReason("");
	});

	async function handleSubmit() {
		const amount = parseCurrencyInputToCents(amountInput);
		if (!amount) {
			toast.error("Enter a valid waiver amount.");
			return;
		}
		if (reason.trim().length === 0) {
			toast.error("Reason is required for a waiver.");
			return;
		}

		setSubmitting(true);
		try {
			await waiveBalance({
				amount,
				obligationId,
				reason: reason.trim(),
			});
			toast.success(
				`Waived ${formatCurrencyCents(amount)} from the obligation.`
			);
			setOpen(false);
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Scissors className="size-4" />
					Waive balance
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Waive obligation balance</DialogTitle>
					<DialogDescription>
						Use the existing cash-ledger waiver mutation. This keeps operator
						corrections on the canonical backend path.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="space-y-2">
						<Label htmlFor="waive-amount">Amount (CAD)</Label>
						<Input
							id="waive-amount"
							inputMode="decimal"
							onChange={(event) => setAmountInput(event.target.value)}
							value={amountInput}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="waive-reason">Reason</Label>
						<Textarea
							id="waive-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="Document the operator rationale for the waiver."
							rows={4}
							value={reason}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button disabled={submitting} onClick={handleSubmit}>
						{submitting ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Scissors className="size-4" />
						)}
						Post waiver
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function WriteOffBalanceDialog({
	defaultAmountCents,
	obligationId,
}: {
	defaultAmountCents: number;
	obligationId: Id<"obligations">;
}) {
	const writeOffBalance = useMutation(
		api.payments.cashLedger.mutations.writeOffObligationBalance
	);
	const [amountInput, setAmountInput] = useState(
		centsInputValue(defaultAmountCents)
	);
	const [reason, setReason] = useState("");
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID()
	);
	const { open, setOpen, setSubmitting, submitting } = useDialogState(() => {
		setAmountInput(centsInputValue(defaultAmountCents));
		setReason("");
		setIdempotencyKey(crypto.randomUUID());
	});

	async function handleSubmit() {
		const amount = parseCurrencyInputToCents(amountInput);
		if (!amount) {
			toast.error("Enter a valid write-off amount.");
			return;
		}
		if (reason.trim().length === 0) {
			toast.error("Reason is required for a write-off.");
			return;
		}

		setSubmitting(true);
		try {
			await writeOffBalance({
				amount,
				idempotencyKey,
				obligationId,
				reason: reason.trim(),
			});
			toast.success(
				`Wrote off ${formatCurrencyCents(amount)} from the obligation balance.`
			);
			setOpen(false);
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Send className="size-4" />
					Write off
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Write off obligation balance</DialogTitle>
					<DialogDescription>
						This action uses the existing write-off mutation and records the
						journal evidence in the cash ledger.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="space-y-2">
						<Label htmlFor="writeoff-amount">Amount (CAD)</Label>
						<Input
							id="writeoff-amount"
							inputMode="decimal"
							onChange={(event) => setAmountInput(event.target.value)}
							value={amountInput}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="writeoff-reason">Reason</Label>
						<Textarea
							id="writeoff-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="Explain why this balance is being written off."
							rows={4}
							value={reason}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button disabled={submitting} onClick={handleSubmit}>
						{submitting ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Shuffle className="size-4" />
						)}
						Post write-off
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
