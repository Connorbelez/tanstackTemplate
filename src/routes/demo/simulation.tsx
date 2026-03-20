import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import { useCallback, useState } from "react";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Route ───────────────────────────────────────────────────────────────

export const Route = createFileRoute("/demo/simulation")({
	ssr: false,
	component: SimulationDemo,
});

// ── Types ────────────────────────────────────────────────────────────────

interface SimulationState {
	clockDate: string | null;
	mortgages: Array<{
		mortgageId: string;
		label: string;
		positions: Array<{
			lenderId: string;
			balance: number;
			availableBalance: number;
		}>;
		invariant: { valid: boolean; total: number };
	}>;
	pendingObligations: number;
	running: boolean;
	settledObligations: number;
	startedAt: number | null;
	totalObligations: number;
}

interface UpcomingDispersal {
	_id: Id<"obligations">;
	amount: number;
	daysUntilDue: number;
	dueDate: string;
	mortgageId: string;
	mortgageLabel: string;
	paymentNumber: number;
	status: string;
	type: string;
}

interface DispersalHistoryEntry {
	_id: Id<"dispersalEntries">;
	amount: number;
	dispersalDate: string;
	lenderId: string;
	mortgageId: string;
	status: string;
}

interface DispersalHistory {
	entries: DispersalHistoryEntry[];
	totalAmount: number;
	totalByLender: Record<string, number>;
	totalEntries: number;
}

interface TrialBalanceAccount {
	accountId: string;
	availableBalance: number;
	lenderId: string;
	mortgageId: string;
	pendingCredits: number;
	pendingDebits: number;
	postedBalance: number;
	type: string;
}

interface TrialBalance {
	accounts: TrialBalanceAccount[];
	totalPending: number;
	totalPosted: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function centsToDollars(cents: number): string {
	return (cents / 100).toLocaleString("en-CA", {
		style: "currency",
		currency: "CAD",
		minimumFractionDigits: 2,
	});
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

function daysUntilDueColor(days: number): string {
	if (days < 0) {
		return "text-red-700";
	}
	if (days === 0) {
		return "font-bold text-yellow-700";
	}
	return "text-muted-foreground";
}

function daysUntilDueLabel(days: number): string {
	if (days < 0) {
		return `${Math.abs(days)}d overdue`;
	}
	if (days === 0) {
		return "TODAY";
	}
	return `${days}d`;
}

function accountTypeColor(type: string): string {
	if (type === "WORLD") {
		return "bg-red-100 text-red-800";
	}
	if (type === "TREASURY") {
		return "bg-amber-100 text-amber-800";
	}
	return "bg-green-100 text-green-800";
}

function truncateId(id: string, len = 10): string {
	if (!id) {
		return "—";
	}
	return id.length > len ? `${id.slice(0, len)}…` : id;
}

function daysLabel(clockDate: string | null, startedAt: number | null): string {
	if (!(clockDate && startedAt)) {
		return "—";
	}
	const start = new Date(startedAt);
	const current = new Date(`${clockDate}T00:00:00Z`);
	const days = Math.floor(
		(current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
	);
	return `Day ${days}`;
}

function buildActionMessage(label: string, result: unknown): string {
	if (result && typeof result === "object" && "message" in result) {
		return (result as { message: string }).message;
	}
	if (result && typeof result === "object" && "seeded" in result) {
		const seededResult = result as { message?: string; seeded: boolean };
		return (
			seededResult.message ??
			(seededResult.seeded ? "Simulation started." : "Already initialized.")
		);
	}
	return label;
}

function resolveJumpDays(
	jumpDate: string,
	currentClockDate: string | null | undefined
): { error: string } | { days: number } | null {
	if (!jumpDate) {
		return null;
	}
	const parts = jumpDate.split("-");
	if (parts.length !== 3) {
		return { error: "Invalid date format. Use YYYY-MM-DD." };
	}
	const target = new Date(`${jumpDate}T00:00:00Z`);
	if (Number.isNaN(target.getTime())) {
		return { error: "Invalid date." };
	}
	const current = currentClockDate ?? "2024-01-01";
	const diffMs = target.getTime() - new Date(`${current}T00:00:00Z`).getTime();
	return { days: Math.round(diffMs / (1000 * 60 * 60 * 24)) };
}

function resolveSettlementAmount(
	settledAmount: string
): { error: string } | { amount: number } | null {
	if (!settledAmount) {
		return null;
	}
	const amount = Number.parseInt(settledAmount, 10);
	if (Number.isNaN(amount) || amount <= 0) {
		return { error: "Enter a valid positive amount in cents." };
	}
	return { amount };
}

function getSettledObligationsClass(
	pendingObligations: number
): string | undefined {
	return pendingObligations === 0 ? "text-green-700" : undefined;
}

function getPendingDispersalsClass(pendingObligations: number): string {
	return pendingObligations > 0 ? "text-yellow-700" : "text-green-700";
}

function obligationTypeColor(type: string): string {
	if (type === "principal_repayment") {
		return "bg-purple-100 text-purple-800";
	}
	if (type === "late_fee") {
		return "bg-red-100 text-red-800";
	}
	return "bg-blue-100 text-blue-800";
}

function obligationTypeLabel(type: string): string {
	if (type === "principal_repayment") {
		return "Principal";
	}
	if (type === "regular_interest") {
		return "Interest";
	}
	if (type === "late_fee") {
		return "Late Fee";
	}
	if (type === "arrears_cure") {
		return "Arrears Cure";
	}
	return type;
}

function obligationStatusColor(status: string): string {
	if (status === "upcoming") {
		return "bg-slate-100 text-slate-800";
	}
	if (status === "due") {
		return "bg-yellow-100 text-yellow-800";
	}
	if (status === "overdue") {
		return "bg-red-100 text-red-800";
	}
	if (status === "partially_settled") {
		return "bg-blue-100 text-blue-800";
	}
	return "bg-green-100 text-green-800";
}

function canSettleObligation(status: string): boolean {
	return (
		status === "due" || status === "overdue" || status === "partially_settled"
	);
}

interface RunningSimulationViewProps {
	handleAdvance: (days: number) => void;
	handleJumpToDate: () => void;
	handleTriggerDispersal: () => void;
	history: DispersalHistory | undefined;
	jumpDate: string;
	loading: boolean;
	selectedObligation: UpcomingDispersal | null;
	setJumpDate: (value: string) => void;
	setSelectedObligation: (value: UpcomingDispersal | null) => void;
	setSettledAmount: (value: string) => void;
	settledAmount: string;
	simState: SimulationState;
	trialBalance: TrialBalance | undefined;
	upcoming: UpcomingDispersal[] | undefined;
}

// ── Component ────────────────────────────────────────────────────────────

function SimulationDemo() {
	const simState = useQuery(api.demo.simulation.getSimulationState) as
		| SimulationState
		| undefined;
	const upcoming = useQuery(api.demo.simulation.getUpcomingDispersals) as
		| UpcomingDispersal[]
		| undefined;
	const history = useQuery(api.demo.simulation.getDispersalHistory) as
		| DispersalHistory
		| undefined;
	const trialBalance = useQuery(api.demo.simulation.getTrialBalance) as
		| TrialBalance
		| undefined;

	const seed = useMutation(api.demo.simulation.seedSimulation);
	const advance = useMutation(api.demo.simulation.advanceTime);
	const trigger = useMutation(api.demo.simulation.triggerDispersal);
	const cleanup = useMutation(api.demo.simulation.cleanupSimulation);

	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [jumpDate, setJumpDate] = useState("");
	const [selectedObligation, setSelectedObligation] =
		useState<UpcomingDispersal | null>(null);
	const [settledAmount, setSettledAmount] = useState("");

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
				setSuccessMsg(buildActionMessage(label, result));
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setLoading(false);
			}
		},
		[clearMessages]
	);

	const handleAdvance = useCallback(
		(days: number) => {
			runAction(`Advanced ${days} day(s)`, () =>
				advance({ days }).then((r) => {
					const r2 = r as { obligationsTriggered?: number; newDate?: string };
					return {
						message: `Date: ${r2.newDate}, obligations auto-due: ${r2.obligationsTriggered ?? 0}`,
					};
				})
			);
		},
		[advance, runAction]
	);

	const handleJumpToDate = useCallback(() => {
		const result = resolveJumpDays(jumpDate, simState?.clockDate);
		if (!result) {
			return;
		}
		if ("error" in result) {
			setError(result.error);
			return;
		}
		setJumpDate("");
		handleAdvance(result.days);
	}, [jumpDate, simState?.clockDate, handleAdvance]);

	const handleTriggerDispersal = useCallback(() => {
		if (!(selectedObligation && settledAmount)) {
			return;
		}
		const amountResult = resolveSettlementAmount(settledAmount);
		if (!amountResult) {
			return;
		}
		if ("error" in amountResult) {
			setError(amountResult.error);
			return;
		}
		runAction("Payment applied", () =>
			trigger({
				obligationId: selectedObligation._id,
				settledAmount: amountResult.amount,
			})
		);
		setSelectedObligation(null);
		setSettledAmount("");
	}, [selectedObligation, settledAmount, trigger, runAction]);

	const isRunning = simState?.running ?? false;

	return (
		<div className="mx-auto max-w-7xl space-y-4 p-4 py-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="font-bold text-2xl tracking-tight">
						Marketplace Simulation
					</h1>
					<p className="text-muted-foreground text-sm">
						2-year mortgage marketplace simulation — step through time to verify
						ledger correctness
					</p>
				</div>
				<div className="flex items-center gap-3">
					{isRunning && (
						<div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
							<Clock className="size-4 text-muted-foreground" />
							<span className="font-mono text-sm">{simState?.clockDate}</span>
							<Badge
								className="bg-muted text-muted-foreground"
								variant="secondary"
							>
								{daysLabel(
									simState?.clockDate ?? null,
									simState?.startedAt ?? null
								)}
							</Badge>
						</div>
					)}
					{!isRunning && (
						<Button
							disabled={loading}
							onClick={() => runAction("Seeding simulation…", () => seed())}
							size="sm"
							variant="default"
						>
							Start Simulation
						</Button>
					)}
					{isRunning && (
						<Button
							disabled={loading}
							onClick={() =>
								runAction("Cleaned up", () =>
									cleanup().then((r) => {
										const r2 = r as {
											deletedObligations?: number;
											deletedDispersals?: number;
										};
										return {
											message: `Deleted ${r2.deletedObligations} obligations, ${r2.deletedDispersals} dispersals.`,
										};
									})
								)
							}
							size="sm"
							variant="destructive"
						>
							Cleanup
						</Button>
					)}
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

			{/* Loading / Not started */}
			{simState === undefined && (
				<div className="py-12 text-center text-muted-foreground">
					Loading simulation state…
				</div>
			)}

			{simState !== undefined && !isRunning && (
				<div className="py-12 text-center text-muted-foreground">
					No simulation running. Click <strong>Start Simulation</strong> to
					initialize 3 mortgages with 24 months of obligations each.
				</div>
			)}

			{simState !== undefined && isRunning && (
				<RunningSimulationView
					handleAdvance={handleAdvance}
					handleJumpToDate={handleJumpToDate}
					handleTriggerDispersal={handleTriggerDispersal}
					history={history}
					jumpDate={jumpDate}
					loading={loading}
					selectedObligation={selectedObligation}
					setJumpDate={setJumpDate}
					setSelectedObligation={setSelectedObligation}
					setSettledAmount={setSettledAmount}
					settledAmount={settledAmount}
					simState={simState}
					trialBalance={trialBalance}
					upcoming={upcoming}
				/>
			)}
		</div>
	);
}

function RunningSimulationView({
	handleAdvance,
	handleJumpToDate,
	handleTriggerDispersal,
	history,
	jumpDate,
	loading,
	selectedObligation,
	setJumpDate,
	setSelectedObligation,
	setSettledAmount,
	settledAmount,
	simState,
	trialBalance,
	upcoming,
}: RunningSimulationViewProps) {
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard label="Simulation Date" value={simState.clockDate ?? "—"} />
				<StatCard
					label="Obligations"
					value={`${simState.settledObligations} / ${simState.totalObligations} settled`}
					valueClassName={getSettledObligationsClass(
						simState.pendingObligations
					)}
				/>
				<StatCard
					label="Pending Dispersals"
					value={String(simState.pendingObligations)}
					valueClassName={getPendingDispersalsClass(
						simState.pendingObligations
					)}
				/>
				<StatCard
					label="Total Dispersed"
					value={
						history ? centsToDollars(history.totalAmount) : centsToDollars(0)
					}
				/>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Time Controls</CardTitle>
					<CardDescription className="text-xs">
						Advance the simulation clock. Upcoming obligations transition to
						due, then overdue after their grace period.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-2">
					<Button
						disabled={loading}
						onClick={() => handleAdvance(1)}
						size="sm"
						variant="outline"
					>
						+1 Day
					</Button>
					<Button
						disabled={loading}
						onClick={() => handleAdvance(7)}
						size="sm"
						variant="outline"
					>
						+7 Days
					</Button>
					<Button
						disabled={loading}
						onClick={() => handleAdvance(30)}
						size="sm"
						variant="outline"
					>
						+30 Days
					</Button>
					<Button
						disabled={loading}
						onClick={() => handleAdvance(90)}
						size="sm"
						variant="outline"
					>
						+90 Days
					</Button>
					<div className="ml-4 flex items-center gap-2">
						<span className="text-muted-foreground text-sm">Jump to:</span>
						<Input
							className="w-36 font-mono text-sm"
							onChange={(e) => setJumpDate(e.target.value)}
							placeholder="YYYY-MM-DD"
							value={jumpDate}
						/>
						<Button
							disabled={loading || !jumpDate}
							onClick={handleJumpToDate}
							size="sm"
							variant="secondary"
						>
							Go
						</Button>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
				<SimulationEventRail />
				<Tabs defaultValue="overview">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="obligations">
							Obligations
							{simState.pendingObligations > 0 && (
								<span className="ml-1 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">
									{simState.pendingObligations}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="dispersals">
							Dispersals
							{history && history.totalEntries > 0 && (
								<span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
									{history.totalEntries}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
					</TabsList>

					<TabsContent value="overview">
						<OverviewTab mortgages={simState.mortgages} />
					</TabsContent>

					<TabsContent value="obligations">
						<ObligationsTab
							onCancel={() => {
								setSelectedObligation(null);
								setSettledAmount("");
							}}
							onConfirmTrigger={handleTriggerDispersal}
							onTrigger={(obligation) => {
								setSelectedObligation(obligation);
								setSettledAmount(String(obligation.amount));
							}}
							selectedObligation={selectedObligation}
							setSettledAmount={setSettledAmount}
							settledAmount={settledAmount}
							upcoming={upcoming ?? []}
						/>
					</TabsContent>

					<TabsContent value="dispersals">
						<DispersalsTab
							history={
								history ?? {
									entries: [],
									totalByLender: {},
									totalEntries: 0,
									totalAmount: 0,
								}
							}
						/>
					</TabsContent>

					<TabsContent value="trial-balance">
						<TrialBalanceTab
							trialBalance={
								trialBalance ?? {
									accounts: [],
									totalPosted: 0,
									totalPending: 0,
								}
							}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}

function SimulationEventRail() {
	const actions = [
		"Originate Mortgage",
		"Sell Position",
		"Trade Mortgage",
		"Default Mortgage",
		"Payoff Mortgage",
		"Renew Mortgage",
	];

	return (
		<Card className="h-fit">
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Event Triggers</CardTitle>
				<CardDescription className="text-xs">
					The simulation now mirrors the real obligation lifecycle. Additional
					cross-entity event macros are shown here to match the target spec
					layout.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{actions.map((action) => (
					<div
						className="flex items-center justify-between rounded-md border px-3 py-2"
						key={action}
					>
						<span className="text-sm">{action}</span>
						<Badge
							className="bg-muted text-muted-foreground"
							variant="secondary"
						>
							Planned
						</Badge>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

// ── Stat Card ────────────────────────────────────────────────────────────

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

// ── Overview Tab ─────────────────────────────────────────────────────────

function OverviewTab({
	mortgages,
}: {
	mortgages: SimulationState["mortgages"];
}) {
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
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[160px]">Account</TableHead>
								<TableHead className="w-[80px]">Type</TableHead>
								<TableHead className="text-right">Posted Balance</TableHead>
								<TableHead className="text-right">Available</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow className="bg-muted/30">
								<TableCell className="font-mono text-xs">TREASURY</TableCell>
								<TableCell>
									<span className="inline-block rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 text-xs">
										TREASURY
									</span>
								</TableCell>
								<TableCell
									className={`text-right font-mono text-xs ${numColor(m.invariant.total)}`}
								>
									{m.invariant.total.toLocaleString()}
								</TableCell>
								<TableCell className="text-right font-mono text-muted-foreground text-xs">
									—
								</TableCell>
							</TableRow>
							{m.positions.map((p, idx) => (
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
									<TableCell
										className={`text-right font-mono text-xs ${numColor(p.balance)}`}
									>
										{p.balance.toLocaleString()}
									</TableCell>
									<TableCell
										className={`text-right font-mono text-xs ${numColor(p.availableBalance)}`}
									>
										{p.availableBalance.toLocaleString()}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			))}
			<div className="rounded-md border bg-muted/30 p-3">
				<p className="text-muted-foreground text-xs">
					<strong>Total Supply Invariant:</strong> TREASURY + sum(POSITION) ={" "}
					{TOTAL_SUPPLY_FMT} per mortgage at all times. Invariant violations
					indicate a ledger accounting error.
				</p>
			</div>
		</div>
	);
}

const TOTAL_SUPPLY_FMT = "10,000 ownership units";

// ── Obligations Tab ────────────────────────────────────────────────────────

function ObligationsTab({
	upcoming,
	onTrigger,
	selectedObligation,
	settledAmount,
	setSettledAmount,
	onConfirmTrigger,
	onCancel,
}: {
	upcoming: UpcomingDispersal[];
	selectedObligation: UpcomingDispersal | null;
	settledAmount: string;
	onTrigger: (ob: UpcomingDispersal) => void;
} & {
	selectedObligation: UpcomingDispersal | null;
	settledAmount: string;
	setSettledAmount: (v: string) => void;
	onConfirmTrigger: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="mt-3 space-y-4">
			{/* Trigger modal */}
			{selectedObligation && (
				<Card className="border-blue-200 bg-blue-50/50">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">Apply Payment</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<span className="text-muted-foreground">Mortgage: </span>
								<span className="font-medium">
									{selectedObligation.mortgageLabel}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Type: </span>
								<span className="font-medium">
									{obligationTypeLabel(selectedObligation.type)}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Due: </span>
								<span className="font-medium">
									{selectedObligation.dueDate}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Payment #: </span>
								<span className="font-medium">
									{selectedObligation.paymentNumber}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Outstanding: </span>
								<span className="font-medium font-mono">
									{centsToDollars(selectedObligation.amount)}
								</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<label
								className="text-muted-foreground text-sm"
								htmlFor="settled-amount"
							>
								Settled amount (¢):
							</label>
							<Input
								className="w-40 font-mono text-sm"
								id="settled-amount"
								onChange={(e) => setSettledAmount(e.target.value)}
								placeholder="payment in cents"
								value={settledAmount}
							/>
							<Button onClick={onConfirmTrigger} size="sm" variant="default">
								Apply Payment
							</Button>
							<Button onClick={onCancel} size="sm" variant="outline">
								Cancel
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{upcoming.length === 0 ? (
				<div className="py-8 text-center text-muted-foreground text-sm">
					No open obligations. All obligations have been settled or waived.
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Mortgage</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>#</TableHead>
							<TableHead>Due Date</TableHead>
							<TableHead>Days Until Due</TableHead>
							<TableHead className="text-right">Amount</TableHead>
							<TableHead>Status</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{upcoming.map((ob) => (
							<TableRow key={String(ob._id)}>
								<TableCell className="font-medium text-xs">
									{ob.mortgageLabel}
								</TableCell>
								<TableCell>
									<span
										className={`inline-block rounded px-2 py-0.5 font-medium text-xs ${obligationTypeColor(
											ob.type
										)}`}
									>
										{obligationTypeLabel(ob.type)}
									</span>
								</TableCell>
								<TableCell className="font-mono text-muted-foreground text-xs">
									{ob.paymentNumber}
								</TableCell>
								<TableCell className="font-mono text-xs">
									{ob.dueDate}
								</TableCell>
								<TableCell
									className={`font-mono text-xs ${daysUntilDueColor(ob.daysUntilDue)}`}
								>
									{daysUntilDueLabel(ob.daysUntilDue)}
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									{centsToDollars(ob.amount)}
								</TableCell>
								<TableCell>
									<Badge
										className={obligationStatusColor(ob.status)}
										variant="secondary"
									>
										{ob.status}
									</Badge>
								</TableCell>
								<TableCell>
									<Button
										disabled={!canSettleObligation(ob.status)}
										onClick={() => onTrigger(ob)}
										size="sm"
										variant="outline"
									>
										Pay
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}

// ── Dispersals Tab ──────────────────────────────────────────────────────

function DispersalsTab({ history }: { history: DispersalHistory }) {
	if (history.totalEntries === 0) {
		return (
			<div className="mt-3 py-8 text-center text-muted-foreground text-sm">
				No dispersals yet. Settle obligations from the Obligations tab.
			</div>
		);
	}

	return (
		<div className="mt-3 space-y-4">
			{/* Summary by lender */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
				{Object.entries(history.totalByLender).map(([lenderId, total]) => (
					<Card className="py-2" key={lenderId}>
						<CardHeader className="px-3 py-0 pb-1">
							<CardDescription className="text-xs">{lenderId}</CardDescription>
						</CardHeader>
						<CardContent className="px-3 py-0">
							<p className="font-mono font-semibold text-sm">
								{centsToDollars(total)}
							</p>
						</CardContent>
					</Card>
				))}
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date</TableHead>
						<TableHead>Mortgage</TableHead>
						<TableHead>Lender</TableHead>
						<TableHead className="text-right">Amount</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{history.entries.map((entry) => (
						<TableRow key={String(entry._id)}>
							<TableCell className="font-mono text-xs">
								{entry.dispersalDate}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{truncateId(entry.mortgageId)}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{truncateId(entry.lenderId)}
							</TableCell>
							<TableCell
								className={`text-right font-mono text-xs ${numColor(entry.amount)}`}
							>
								{centsToDollars(entry.amount)}
							</TableCell>
							<TableCell>
								<Badge
									className={
										entry.status === "settled"
											? "bg-green-100 text-green-800"
											: "bg-yellow-100 text-yellow-800"
									}
									variant="secondary"
								>
									{entry.status}
								</Badge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// ── Trial Balance Tab ────────────────────────────────────────────────────

function TrialBalanceTab({ trialBalance }: { trialBalance: TrialBalance }) {
	return (
		<div className="mt-3 space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold text-sm">All Simulation Accounts</h3>
				<div className="flex gap-4 text-xs">
					<span className="text-muted-foreground">
						Total Posted:{" "}
						<span className="font-medium font-mono">
							{trialBalance.totalPosted.toLocaleString()}
						</span>
					</span>
					<span className="text-muted-foreground">
						Total Pending:{" "}
						<span className="font-medium font-mono text-yellow-700">
							{trialBalance.totalPending.toLocaleString()}
						</span>
					</span>
				</div>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Account ID</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Mortgage</TableHead>
						<TableHead>Lender</TableHead>
						<TableHead className="text-right">Posted</TableHead>
						<TableHead className="text-right">Available</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{trialBalance.accounts.map((account) => (
						<TableRow key={account.accountId}>
							<TableCell className="font-mono text-xs">
								{truncateId(account.accountId, 16)}
							</TableCell>
							<TableCell>
								<span
									className={`inline-block rounded px-2 py-0.5 font-medium text-xs ${accountTypeColor(account.type)}`}
								>
									{account.type}
								</span>
							</TableCell>
							<TableCell className="font-mono text-xs">
								{account.mortgageId ? truncateId(account.mortgageId, 16) : "—"}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{account.lenderId ? truncateId(account.lenderId, 16) : "—"}
							</TableCell>
							<TableCell
								className={`text-right font-mono text-xs ${numColor(account.postedBalance)}`}
							>
								{account.postedBalance.toLocaleString()}
							</TableCell>
							<TableCell
								className={`text-right font-mono text-xs ${numColor(account.availableBalance)}`}
							>
								{account.availableBalance.toLocaleString()}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
