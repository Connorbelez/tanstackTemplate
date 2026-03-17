import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { JournalLogTable } from "#/components/ledger/journal-log-table";
import {
	type IssueFormState,
	LedgerActions,
	type RedeemFormState,
	type TransferFormState,
} from "#/components/ledger/ledger-actions";
import { LedgerControls } from "#/components/ledger/ledger-controls";
import { MortgageCard } from "#/components/ledger/mortgage-card";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-ledger")({
	ssr: false,
	component: LedgerDemo,
});

// ── Constants ────────────────────────────────────────────────────

const INTERACTIVE_SOURCE = {
	type: "user" as const,
	actor: "demo-user",
	channel: "demo-ui",
};
const INTERACTIVE_META = { demo: true, source: "interactive" };
const POSITIVE_INTEGER_RE = /^[1-9]\d*$/;

function parseIntegerAmount(value: string): number {
	const trimmed = value.trim();
	if (!POSITIVE_INTEGER_RE.test(trimmed)) {
		throw new Error(
			"Amount must be a positive whole number (zero not allowed)"
		);
	}
	const result = Number(trimmed);
	if (!Number.isSafeInteger(result)) {
		throw new Error(
			"Amount exceeds safe integer range (max 9,007,199,254,740,991)"
		);
	}
	return result;
}

// ── Component ────────────────────────────────────────────────────

function LedgerDemo() {
	const demoState = useQuery(api.demo.ledger.getDemoState);
	const journal = useQuery(api.demo.ledger.getDemoJournal);

	const seed = useMutation(api.demo.ledger.seedData);
	const cleanupMut = useMutation(api.demo.ledger.cleanup);

	const transferShares = useMutation(api.demo.ledger.demoTransferShares);
	const issueSharesMut = useMutation(api.demo.ledger.demoIssueShares);
	const redeemSharesMut = useMutation(api.demo.ledger.demoRedeemShares);

	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	// Form state
	const [transferForm, setTransferForm] = useState<TransferFormState>({
		mortgage: "",
		seller: "",
		buyer: "demo-inv-",
		amount: "",
	});
	const [issueForm, setIssueForm] = useState<IssueFormState>({
		mortgage: "",
		lender: "demo-inv-",
		amount: "",
	});
	const [redeemForm, setRedeemForm] = useState<RedeemFormState>({
		mortgage: "",
		lender: "",
		amount: "",
	});

	const hasDemoData = (demoState?.mortgages.length ?? 0) > 0;

	const clearMessages = useCallback(() => {
		setError(null);
		setSuccessMsg(null);
	}, []);

	const handleSeed = useCallback(async () => {
		clearMessages();
		setLoading(true);
		try {
			const result = await seed();
			setSuccessMsg(result.message);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [seed, clearMessages]);

	const handleCleanup = useCallback(async () => {
		clearMessages();
		setLoading(true);
		try {
			const result = await cleanupMut();
			setSuccessMsg(
				`Cleaned up ${result.deletedEntries} entries and ${result.deletedAccounts} accounts.`
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [cleanupMut, clearMessages]);

	const handleTransfer = useCallback(async () => {
		clearMessages();
		if (
			!(
				transferForm.mortgage &&
				transferForm.seller &&
				transferForm.buyer &&
				transferForm.amount
			)
		) {
			return;
		}
		setLoading(true);
		try {
			await transferShares({
				mortgageId: transferForm.mortgage,
				sellerLenderId: transferForm.seller,
				buyerLenderId: transferForm.buyer,
				amount: parseIntegerAmount(transferForm.amount),
				effectiveDate: new Date().toISOString().split("T")[0],
				idempotencyKey: crypto.randomUUID(),
				source: INTERACTIVE_SOURCE,
				metadata: INTERACTIVE_META,
			});
			setSuccessMsg(
				`Transferred ${transferForm.amount} units from ${transferForm.seller} to ${transferForm.buyer}`
			);
			setTransferForm((prev) => ({ ...prev, amount: "" }));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [transferForm, transferShares, clearMessages]);

	const handleIssue = useCallback(async () => {
		clearMessages();
		if (!(issueForm.mortgage && issueForm.lender && issueForm.amount)) {
			return;
		}
		setLoading(true);
		try {
			await issueSharesMut({
				mortgageId: issueForm.mortgage,
				lenderId: issueForm.lender,
				amount: parseIntegerAmount(issueForm.amount),
				effectiveDate: new Date().toISOString().split("T")[0],
				idempotencyKey: crypto.randomUUID(),
				source: INTERACTIVE_SOURCE,
				metadata: INTERACTIVE_META,
			});
			setSuccessMsg(`Issued ${issueForm.amount} units to ${issueForm.lender}`);
			setIssueForm((prev) => ({ ...prev, amount: "" }));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [issueForm, issueSharesMut, clearMessages]);

	const handleRedeem = useCallback(async () => {
		clearMessages();
		if (!(redeemForm.mortgage && redeemForm.lender && redeemForm.amount)) {
			return;
		}
		setLoading(true);
		try {
			await redeemSharesMut({
				mortgageId: redeemForm.mortgage,
				lenderId: redeemForm.lender,
				amount: parseIntegerAmount(redeemForm.amount),
				effectiveDate: new Date().toISOString().split("T")[0],
				idempotencyKey: crypto.randomUUID(),
				source: INTERACTIVE_SOURCE,
				metadata: INTERACTIVE_META,
			});
			setSuccessMsg(
				`Redeemed ${redeemForm.amount} units from ${redeemForm.lender}`
			);
			setRedeemForm((prev) => ({ ...prev, amount: "" }));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [redeemForm, redeemSharesMut, clearMessages]);

	const mortgageSummaries =
		demoState?.mortgages.map((m) => ({
			mortgageId: m.mortgageId,
			label: m.label,
			treasuryBalance: m.treasuryBalance,
			positions: m.positions,
		})) ?? [];

	return (
		<DemoLayout
			description="Double-entry ownership ledger with 10,000 units per mortgage. Seed data, transfer shares between lenders, and watch balances update in real time."
			title="Mortgage Ownership Ledger"
		>
			<div className="space-y-6">
				{/* Messages */}
				{error && (
					<div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
						<AlertCircle className="size-4 shrink-0" />
						{error}
					</div>
				)}
				{successMsg && (
					<div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm">
						<CheckCircle2 className="size-4 shrink-0" />
						{successMsg}
					</div>
				)}

				{/* Controls */}
				<LedgerControls
					entryCount={demoState?.totalEntries}
					hasDemoData={hasDemoData}
					loading={loading}
					mortgageCount={demoState?.mortgages.length}
					onCleanup={handleCleanup}
					onSeed={handleSeed}
				/>

				{/* Mortgage Cards */}
				{hasDemoData && (
					<div className="grid gap-4 md:grid-cols-2">
						{demoState?.mortgages.map((m) => (
							<MortgageCard
								entryCount={m.entryCount}
								invariantValid={m.invariantValid}
								key={m.mortgageId}
								label={m.label}
								mortgageId={m.mortgageId}
								positions={m.positions}
								total={m.total}
								treasuryBalance={m.treasuryBalance}
							/>
						))}
					</div>
				)}

				{/* Interactive Actions */}
				{hasDemoData && (
					<LedgerActions
						issueForm={issueForm}
						loading={loading}
						mortgages={mortgageSummaries}
						onIssue={handleIssue}
						onIssueChange={(partial) =>
							setIssueForm((prev) => ({ ...prev, ...partial }))
						}
						onRedeem={handleRedeem}
						onRedeemChange={(partial) =>
							setRedeemForm((prev) => ({ ...prev, ...partial }))
						}
						onTransfer={handleTransfer}
						onTransferChange={(partial) =>
							setTransferForm((prev) => ({ ...prev, ...partial }))
						}
						redeemForm={redeemForm}
						transferForm={transferForm}
					/>
				)}

				{/* Journal Log */}
				{journal && <JournalLogTable entries={journal} />}
			</div>
		</DemoLayout>
	);
}
