import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { EntryTypeBadge } from "#/components/ledger/entry-type-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/prod-ledger")({
	ssr: false,
	component: ProdLedgerDemo,
});

// ── Types (explicit, independent of codegen timing) ──────────────

interface PositionOverview {
	availableBalance: number;
	balance: number;
	lenderId: string;
	pendingCredits: number;
	pendingDebits: number;
}

interface MortgageOverview {
	entryCount: number;
	invariant: { valid: boolean; total: number };
	label: string;
	mortgageId: string;
	positions: PositionOverview[];
	treasuryBalance: number;
}

interface LedgerOverview {
	mortgages: MortgageOverview[];
	reservationSummary: { pending: number; committed: number; voided: number };
	totalEntries: number;
	worldBalance: number;
}

interface JournalEntry {
	_id: Id<"ledger_journal_entries">;
	amount: number | bigint;
	creditLabel: string;
	debitLabel: string;
	effectiveDate: string;
	entryType: string;
	mortgageId: Id<"mortgages">;
	reservationId?: Id<"ledger_reservations"> | null;
	sequenceNumber: number;
	source: { type: string; actor?: string; channel?: string };
	timestamp: number;
}

interface Reservation {
	_id: Id<"ledger_reservations">;
	amount: number;
	buyerLenderId: string;
	createdAt: number;
	dealId?: Id<"deals">;
	mortgageId: Id<"mortgages">;
	resolvedAt?: number;
	sellerLenderId: string;
	status: string;
}

// ── Constants ────────────────────────────────────────────────────

const INTERACTIVE_SOURCE = {
	type: "user" as const,
	actor: "demo-user",
	channel: "prod-demo-ui",
};

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

function todayISO(): string {
	return new Date().toISOString().split("T")[0];
}

function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncateId(id: string, len = 12): string {
	return id.length > len ? `${id.slice(0, len)}...` : id;
}

function numColor(value: number): string {
	if (value > 0) {
		return "text-green-700";
	}
	if (value < 0) {
		return "text-red-700";
	}
	return "text-muted-foreground";
}

// ── Component ────────────────────────────────────────────────────

function ProdLedgerDemo() {
	const overview = useQuery(api.demo.prodLedger.getLedgerOverview) as
		| LedgerOverview
		| undefined;
	const journal = useQuery(api.demo.prodLedger.getJournalRegister) as
		| JournalEntry[]
		| undefined;
	const reservations = useQuery(api.demo.prodLedger.getReservations) as
		| Reservation[]
		| undefined;

	const seed = useMutation(api.demo.prodLedger.seedProdData);
	const cleanup = useMutation(api.demo.prodLedger.cleanupProdData);
	const reserveShares = useMutation(api.demo.prodLedger.demoReserveShares);
	const commitReservation = useMutation(
		api.demo.prodLedger.demoCommitReservation
	);
	const voidReservation = useMutation(api.demo.prodLedger.demoVoidReservation);
	const transferShares = useMutation(api.ledger.mutations.transferShares);
	const redeemShares = useMutation(api.ledger.mutations.redeemShares);

	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	// Void reason inline state
	const [voidTarget, setVoidTarget] =
		useState<Id<"ledger_reservations"> | null>(null);
	const [voidReason, setVoidReason] = useState("");

	const clearMessages = useCallback(() => {
		setError(null);
		setSuccessMsg(null);
	}, []);

	const runAction = useCallback(
		async (label: string, fn: () => Promise<unknown>) => {
			clearMessages();
			setLoading(true);
			try {
				const result = await fn();
				const msg =
					result &&
					typeof result === "object" &&
					"message" in result &&
					typeof (result as Record<string, unknown>).message === "string"
						? (result as { message: string }).message
						: label;
				setSuccessMsg(msg);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setLoading(false);
			}
		},
		[clearMessages]
	);

	const hasDemoData = (overview?.mortgages.length ?? 0) > 0;

	return (
		<div className="mx-auto max-w-7xl space-y-4 p-4 py-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="font-bold text-2xl tracking-tight">
						Ownership Ledger
					</h1>
					<p className="text-muted-foreground text-sm">
						Production implementation — all writes flow through postEntry
						validation pipeline
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						disabled={loading || hasDemoData}
						onClick={() => runAction("Seeded demo data", () => seed())}
						size="sm"
						variant="outline"
					>
						Seed Data
					</Button>
					<Button
						disabled={loading || !hasDemoData}
						onClick={() => runAction("Cleaned up demo data", () => cleanup())}
						size="sm"
						variant="destructive"
					>
						Cleanup
					</Button>
				</div>
			</div>

			{/* Messages */}
			{error && (
				<div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
					<AlertCircle className="size-4 shrink-0" />
					<span className="flex-1">{error}</span>
					<button
						className="text-red-600 hover:text-red-900"
						onClick={() => setError(null)}
						type="button"
					>
						<X className="size-4" />
					</button>
				</div>
			)}
			{successMsg && (
				<div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm">
					<CheckCircle2 className="size-4 shrink-0" />
					<span className="flex-1">{successMsg}</span>
					<button
						className="text-green-600 hover:text-green-900"
						onClick={() => setSuccessMsg(null)}
						type="button"
					>
						<X className="size-4" />
					</button>
				</div>
			)}

			{/* Loading state */}
			{overview === undefined && (
				<div className="py-12 text-center text-muted-foreground">
					Loading ledger data...
				</div>
			)}

			{overview !== undefined && !hasDemoData && (
				<div className="py-12 text-center text-muted-foreground">
					No data — click <strong>Seed Data</strong> to populate the ledger with
					demo mortgages.
				</div>
			)}

			{overview !== undefined && hasDemoData && (
				<>
					{/* Summary Stats */}
					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
						<StatCard
							label="Total Mortgages"
							value={String(overview.mortgages.length)}
						/>
						<StatCard
							label="Journal Entries"
							value={overview.totalEntries.toLocaleString()}
						/>
						<StatCard
							label="World Account"
							value={overview.worldBalance.toLocaleString()}
							valueClassName="text-red-700"
						/>
						<StatCard
							label="Reservations"
							value={`${overview.reservationSummary.pending} pend / ${overview.reservationSummary.committed} done / ${overview.reservationSummary.voided} void`}
						/>
					</div>

					{/* Tabs */}
					<Tabs defaultValue="trial-balance">
						<TabsList>
							<TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
							<TabsTrigger value="journal">Journal Register</TabsTrigger>
							<TabsTrigger value="reservations">Reservations</TabsTrigger>
							<TabsTrigger value="actions">Actions</TabsTrigger>
						</TabsList>

						<TabsContent value="trial-balance">
							<TrialBalanceTab mortgages={overview.mortgages} />
						</TabsContent>

						<TabsContent value="journal">
							<JournalRegisterTab entries={journal ?? []} />
						</TabsContent>

						<TabsContent value="reservations">
							<ReservationsTab
								commitReservation={commitReservation}
								loading={loading}
								reservations={reservations ?? []}
								runAction={runAction}
								setVoidReason={setVoidReason}
								setVoidTarget={setVoidTarget}
								voidReason={voidReason}
								voidReservation={voidReservation}
								voidTarget={voidTarget}
							/>
						</TabsContent>

						<TabsContent value="actions">
							<ActionsTab
								loading={loading}
								mortgages={overview.mortgages}
								redeemShares={redeemShares}
								reserveShares={reserveShares}
								runAction={runAction}
								transferShares={transferShares}
							/>
						</TabsContent>
					</Tabs>
				</>
			)}
		</div>
	);
}

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: string;
	valueClassName?: string;
}) {
	return (
		<Card className="gap-2 py-3">
			<CardHeader className="px-4 py-0">
				<CardDescription className="text-xs">{label}</CardDescription>
			</CardHeader>
			<CardContent className="px-4 py-0">
				<p
					className={`font-mono font-semibold text-lg ${valueClassName ?? ""}`}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

// ── Trial Balance Tab ────────────────────────────────────────────

function TrialBalanceTab({ mortgages }: { mortgages: MortgageOverview[] }) {
	return (
		<div className="mt-3 space-y-4">
			{mortgages.map((m) => (
				<div key={m.mortgageId}>
					<div className="mb-1 flex items-center gap-2">
						<h3 className="font-semibold text-sm">{m.label}</h3>
						<span className="font-mono text-muted-foreground text-xs">
							{m.mortgageId}
						</span>
						{m.invariant.valid ? (
							<Badge
								className="bg-green-100 text-green-800"
								variant="secondary"
							>
								Invariant OK
							</Badge>
						) : (
							<Badge className="bg-red-100 text-red-800" variant="secondary">
								INVARIANT VIOLATION
							</Badge>
						)}
						<span className="ml-auto font-mono text-muted-foreground text-xs">
							{m.entryCount} entries
						</span>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[160px]">Account</TableHead>
								<TableHead className="w-[80px]">Type</TableHead>
								<TableHead className="w-[100px] text-right">
									Cum. Debits
								</TableHead>
								<TableHead className="w-[100px] text-right">
									Cum. Credits
								</TableHead>
								<TableHead className="w-[100px] text-right">
									Posted Balance
								</TableHead>
								<TableHead className="w-[90px] text-right">
									Pending Out
								</TableHead>
								<TableHead className="w-[100px] text-right">
									Available
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{/* Treasury row */}
							<TableRow className="bg-muted/30">
								<TableCell className="font-mono text-xs">TREASURY</TableCell>
								<TableCell>
									<EntryTypeBadge entryType="TREASURY" />
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									—
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									—
								</TableCell>
								<TableCell
									className={`text-right font-mono text-xs ${numColor(m.treasuryBalance)}`}
								>
									{m.treasuryBalance.toLocaleString()}
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									—
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									—
								</TableCell>
							</TableRow>
							{/* Position rows */}
							{m.positions.map((p: PositionOverview, idx: number) => (
								<TableRow
									className={idx % 2 === 0 ? "" : "bg-muted/20"}
									key={p.lenderId}
								>
									<TableCell className="font-mono text-xs">
										{p.lenderId}
									</TableCell>
									<TableCell>
										<span className="inline-block rounded bg-green-100 px-2 py-0.5 font-medium text-green-800 text-xs">
											POSITION
										</span>
									</TableCell>
									<TableCell className="text-right font-mono text-xs">
										—
									</TableCell>
									<TableCell className="text-right font-mono text-xs">
										—
									</TableCell>
									<TableCell
										className={`text-right font-mono text-xs ${numColor(p.balance)}`}
									>
										{p.balance.toLocaleString()}
									</TableCell>
									<TableCell className="text-right font-mono text-xs">
										{p.pendingDebits > 0 ? (
											<span className="text-yellow-700">
												{p.pendingDebits.toLocaleString()}
											</span>
										) : (
											"—"
										)}
									</TableCell>
									<TableCell
										className={`text-right font-mono text-xs ${numColor(p.availableBalance)}`}
									>
										{p.availableBalance.toLocaleString()}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
						<TableFooter>
							<TableRow>
								<TableCell className="font-semibold text-xs" colSpan={4}>
									TOTAL (Treasury + Positions)
								</TableCell>
								<TableCell
									className={`text-right font-mono font-semibold text-xs ${m.invariant.valid ? "text-green-700" : "text-red-700"}`}
								>
									{m.invariant.total.toLocaleString()}
								</TableCell>
								<TableCell />
								<TableCell />
							</TableRow>
						</TableFooter>
					</Table>
				</div>
			))}
		</div>
	);
}

// ── Journal Register Tab ─────────────────────────────────────────

function JournalRegisterTab({ entries }: { entries: JournalEntry[] }) {
	if (entries.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground text-sm">
				No journal entries yet.
			</div>
		);
	}

	return (
		<div className="mt-3 max-h-[600px] overflow-y-auto rounded border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[60px]">Seq #</TableHead>
						<TableHead className="w-[140px]">Date</TableHead>
						<TableHead className="w-[140px]">Entry Type</TableHead>
						<TableHead className="w-[130px]">Mortgage</TableHead>
						<TableHead className="w-[120px]">DR Account</TableHead>
						<TableHead className="w-[120px]">CR Account</TableHead>
						<TableHead className="w-[90px] text-right">Amount</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{entries.map((entry: JournalEntry, idx: number) => (
						<TableRow
							className={idx % 2 === 0 ? "" : "bg-muted/20"}
							key={entry._id}
						>
							<TableCell className="font-mono text-xs">
								{entry.sequenceNumber}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{formatTimestamp(entry.timestamp)}
							</TableCell>
							<TableCell>
								<EntryTypeBadge entryType={entry.entryType} />
							</TableCell>
							<TableCell className="font-mono text-xs" title={entry.mortgageId}>
								{truncateId(entry.mortgageId)}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{entry.debitLabel}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{entry.creditLabel}
							</TableCell>
							<TableCell className="text-right font-mono text-xs">
								{Number(entry.amount).toLocaleString()}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// ── Reservations Tab ─────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	committed: "bg-green-100 text-green-800",
	voided: "bg-red-100 text-red-800",
};

function ReservationsTab({
	reservations,
	commitReservation,
	voidReservation,
	runAction,
	loading,
	voidTarget,
	setVoidTarget,
	voidReason,
	setVoidReason,
}: {
	commitReservation: (args: {
		reservationId: Id<"ledger_reservations">;
	}) => Promise<unknown>;
	loading: boolean;
	reservations: Reservation[];
	runAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
	setVoidReason: (v: string) => void;
	setVoidTarget: (v: Id<"ledger_reservations"> | null) => void;
	voidReason: string;
	voidReservation: (args: {
		reservationId: Id<"ledger_reservations">;
		reason: string;
	}) => Promise<unknown>;
	voidTarget: Id<"ledger_reservations"> | null;
}) {
	if (reservations.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground text-sm">
				No reservations yet. Create one from the Actions tab.
			</div>
		);
	}

	return (
		<div className="mt-3 rounded border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[130px]">Mortgage</TableHead>
						<TableHead className="w-[180px]">Seller → Buyer</TableHead>
						<TableHead className="w-[90px] text-right">Amount</TableHead>
						<TableHead className="w-[90px]">Status</TableHead>
						<TableHead className="w-[140px]">Created</TableHead>
						<TableHead className="w-[140px]">Resolved</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{reservations.map((r: Reservation, idx: number) => (
						<TableRow
							className={idx % 2 === 0 ? "" : "bg-muted/20"}
							key={r._id}
						>
							<TableCell className="font-mono text-xs" title={r.mortgageId}>
								{truncateId(r.mortgageId)}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{r.sellerLenderId} → {r.buyerLenderId}
							</TableCell>
							<TableCell className="text-right font-mono text-xs">
								{Number(r.amount).toLocaleString()}
							</TableCell>
							<TableCell>
								<span
									className={`inline-block rounded px-2 py-0.5 font-medium text-xs ${STATUS_BADGE[r.status] ?? ""}`}
								>
									{r.status}
								</span>
							</TableCell>
							<TableCell className="font-mono text-xs">
								{formatTimestamp(r.createdAt)}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{r.resolvedAt ? formatTimestamp(r.resolvedAt) : "—"}
							</TableCell>
							<TableCell>
								{r.status === "pending" && (
									<div className="flex items-center gap-1">
										<Button
											disabled={loading}
											onClick={() =>
												runAction("Committed reservation", () =>
													commitReservation({
														reservationId: r._id,
													})
												)
											}
											size="xs"
											variant="outline"
										>
											Commit
										</Button>
										{voidTarget === r._id ? (
											<div className="flex items-center gap-1">
												<Input
													className="h-6 w-32 text-xs"
													onChange={(e) => setVoidReason(e.target.value)}
													placeholder="Reason..."
													value={voidReason}
												/>
												<Button
													disabled={loading || !voidReason}
													onClick={() => {
														runAction("Voided reservation", () =>
															voidReservation({
																reservationId: r._id,
																reason: voidReason,
															})
														);
														setVoidTarget(null);
														setVoidReason("");
													}}
													size="xs"
													variant="destructive"
												>
													Void
												</Button>
												<Button
													onClick={() => {
														setVoidTarget(null);
														setVoidReason("");
													}}
													size="xs"
													variant="ghost"
												>
													<X className="size-3" />
												</Button>
											</div>
										) : (
											<Button
												disabled={loading}
												onClick={() => setVoidTarget(r._id)}
												size="xs"
												variant="ghost"
											>
												Void...
											</Button>
										)}
									</div>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// ── Actions Tab ──────────────────────────────────────────────────

function ActionsTab({
	mortgages,
	transferShares,
	redeemShares,
	reserveShares,
	runAction,
	loading,
}: {
	loading: boolean;
	mortgages: MortgageOverview[];
	redeemShares: (args: {
		mortgageId: string;
		lenderId: string;
		amount: number;
		effectiveDate: string;
		idempotencyKey: string;
		source: { type: "user"; actor: string; channel: string };
	}) => Promise<unknown>;
	reserveShares: (args: {
		mortgageId: string;
		sellerLenderId: string;
		buyerLenderId: string;
		amount: number;
		dealId?: string;
	}) => Promise<unknown>;
	runAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
	transferShares: (args: {
		mortgageId: string;
		sellerLenderId: string;
		buyerLenderId: string;
		amount: number;
		effectiveDate: string;
		idempotencyKey: string;
		source: { type: "user"; actor: string; channel: string };
	}) => Promise<unknown>;
}) {
	// Transfer form
	const [transferMortgage, setTransferMortgage] = useState("");
	const [transferSeller, setTransferSeller] = useState("");
	const [transferBuyer, setTransferBuyer] = useState("");
	const [transferAmount, setTransferAmount] = useState("");

	// Reserve form
	const [reserveMortgage, setReserveMortgage] = useState("");
	const [reserveSeller, setReserveSeller] = useState("");
	const [reserveBuyer, setReserveBuyer] = useState("");
	const [reserveAmount, setReserveAmount] = useState("");
	const [reserveDealId, setReserveDealId] = useState("");

	// Redeem form
	const [redeemMortgage, setRedeemMortgage] = useState("");
	const [redeemLender, setRedeemLender] = useState("");
	const [redeemAmount, setRedeemAmount] = useState("");

	const transferPositions =
		mortgages.find((m) => m.mortgageId === transferMortgage)?.positions ?? [];
	const reservePositions =
		mortgages.find((m) => m.mortgageId === reserveMortgage)?.positions ?? [];
	const redeemPositions =
		mortgages.find((m) => m.mortgageId === redeemMortgage)?.positions ?? [];

	return (
		<div className="mt-3 grid gap-4 md:grid-cols-3">
			{/* Transfer Shares */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Transfer Shares</CardTitle>
					<CardDescription className="text-xs">
						Move shares from one lender to another
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<MortgageSelect
						mortgages={mortgages}
						onValueChange={(v) => {
							setTransferMortgage(v);
							setTransferSeller("");
						}}
						value={transferMortgage}
					/>
					{transferMortgage && (
						<PositionSelect
							label="Seller"
							onValueChange={setTransferSeller}
							positions={transferPositions}
							value={transferSeller}
						/>
					)}
					<Input
						onChange={(e) => setTransferBuyer(e.target.value)}
						placeholder="Buyer lender ID"
						value={transferBuyer}
					/>
					<Input
						onChange={(e) => setTransferAmount(e.target.value)}
						placeholder="Amount"
						type="number"
						value={transferAmount}
					/>
					<Button
						className="w-full"
						disabled={
							loading ||
							!transferMortgage ||
							!transferSeller ||
							!transferBuyer ||
							!transferAmount
						}
						onClick={() =>
							runAction(
								`Transferred ${transferAmount} from ${transferSeller} to ${transferBuyer}`,
								() =>
									transferShares({
										mortgageId: transferMortgage,
										sellerLenderId: transferSeller,
										buyerLenderId: transferBuyer,
										amount: parseIntegerAmount(transferAmount),
										effectiveDate: todayISO(),
										idempotencyKey: crypto.randomUUID(),
										source: INTERACTIVE_SOURCE,
									})
							)
						}
						size="sm"
					>
						Transfer
					</Button>
				</CardContent>
			</Card>

			{/* Reserve Shares */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Reserve Shares</CardTitle>
					<CardDescription className="text-xs">
						Create a two-phase reservation (pending → commit/void)
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<MortgageSelect
						mortgages={mortgages}
						onValueChange={(v) => {
							setReserveMortgage(v);
							setReserveSeller("");
						}}
						value={reserveMortgage}
					/>
					{reserveMortgage && (
						<PositionSelect
							label="Seller"
							onValueChange={setReserveSeller}
							positions={reservePositions}
							value={reserveSeller}
						/>
					)}
					<Input
						onChange={(e) => setReserveBuyer(e.target.value)}
						placeholder="Buyer lender ID"
						value={reserveBuyer}
					/>
					<Input
						onChange={(e) => setReserveAmount(e.target.value)}
						placeholder="Amount"
						type="number"
						value={reserveAmount}
					/>
					<Input
						onChange={(e) => setReserveDealId(e.target.value)}
						placeholder="Deal ID (optional)"
						value={reserveDealId}
					/>
					<Button
						className="w-full"
						disabled={
							loading ||
							!reserveMortgage ||
							!reserveSeller ||
							!reserveBuyer ||
							!reserveAmount
						}
						onClick={() =>
							runAction(
								`Reserved ${reserveAmount} from ${reserveSeller} → ${reserveBuyer}`,
								() =>
									reserveShares({
										mortgageId: reserveMortgage,
										sellerLenderId: reserveSeller,
										buyerLenderId: reserveBuyer,
										amount: parseIntegerAmount(reserveAmount),
										dealId: reserveDealId || undefined,
									})
							)
						}
						size="sm"
					>
						Reserve
					</Button>
				</CardContent>
			</Card>

			{/* Redeem Shares */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Redeem Shares</CardTitle>
					<CardDescription className="text-xs">
						Return shares from a lender back to treasury
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<MortgageSelect
						mortgages={mortgages}
						onValueChange={(v) => {
							setRedeemMortgage(v);
							setRedeemLender("");
						}}
						value={redeemMortgage}
					/>
					{redeemMortgage && (
						<PositionSelect
							label="Lender"
							onValueChange={setRedeemLender}
							positions={redeemPositions}
							value={redeemLender}
						/>
					)}
					<Input
						onChange={(e) => setRedeemAmount(e.target.value)}
						placeholder="Amount"
						type="number"
						value={redeemAmount}
					/>
					<Button
						className="w-full"
						disabled={
							loading || !redeemMortgage || !redeemLender || !redeemAmount
						}
						onClick={() =>
							runAction(`Redeemed ${redeemAmount} from ${redeemLender}`, () =>
								redeemShares({
									mortgageId: redeemMortgage,
									lenderId: redeemLender,
									amount: parseIntegerAmount(redeemAmount),
									effectiveDate: todayISO(),
									idempotencyKey: crypto.randomUUID(),
									source: INTERACTIVE_SOURCE,
								})
							)
						}
						size="sm"
					>
						Redeem
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

// ── Shared Select Components ─────────────────────────────────────

function MortgageSelect({
	mortgages,
	value,
	onValueChange,
}: {
	mortgages: MortgageOverview[];
	onValueChange: (v: string) => void;
	value: string;
}) {
	return (
		<Select onValueChange={onValueChange} value={value}>
			<SelectTrigger className="w-full">
				<SelectValue placeholder="Select mortgage..." />
			</SelectTrigger>
			<SelectContent>
				{mortgages.map((m) => (
					<SelectItem key={m.mortgageId} value={m.mortgageId}>
						{m.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function PositionSelect({
	positions,
	value,
	onValueChange,
	label,
}: {
	label: string;
	onValueChange: (v: string) => void;
	positions: PositionOverview[];
	value: string;
}) {
	return (
		<Select onValueChange={onValueChange} value={value}>
			<SelectTrigger className="w-full">
				<SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
			</SelectTrigger>
			<SelectContent>
				{positions.map((p: PositionOverview) => (
					<SelectItem key={p.lenderId} value={p.lenderId}>
						{p.lenderId} ({p.balance.toLocaleString()})
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
