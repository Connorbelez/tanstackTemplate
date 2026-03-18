import { useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type { MortgagePosition } from "./mortgage-card";

export interface MortgageSummary {
	label: string;
	mortgageId: string;
	positions: MortgagePosition[];
	treasuryBalance: number;
}

export interface TransferFormState {
	amount: string;
	buyer: string;
	mortgage: string;
	seller: string;
}

export interface IssueFormState {
	amount: string;
	lender: string;
	mortgage: string;
}

export interface RedeemFormState {
	amount: string;
	lender: string;
	mortgage: string;
}

export interface LedgerActionsProps {
	issueForm: IssueFormState;
	loading: boolean;
	mortgages: MortgageSummary[];
	onIssue: () => void;
	onIssueChange: (form: Partial<IssueFormState>) => void;
	onRedeem: () => void;
	onRedeemChange: (form: Partial<RedeemFormState>) => void;
	onTransfer: () => void;
	onTransferChange: (form: Partial<TransferFormState>) => void;
	redeemForm: RedeemFormState;
	transferForm: TransferFormState;
}

export function LedgerActions({
	mortgages,
	loading,
	transferForm,
	issueForm,
	redeemForm,
	onTransferChange,
	onIssueChange,
	onRedeemChange,
	onTransfer,
	onIssue,
	onRedeem,
}: LedgerActionsProps) {
	const [isCreatingBuyer, setIsCreatingBuyer] = useState(false);

	const getPositions = (mortgageId: string) =>
		mortgages.find((m) => m.mortgageId === mortgageId)?.positions ?? [];

	const allLenders = useMemo(() => {
		const seen = new Map<string, string>();
		for (const m of mortgages) {
			for (const p of m.positions) {
				if (!seen.has(p.lenderId)) {
					seen.set(p.lenderId, p.displayName);
				}
			}
		}
		return [...seen.entries()].map(([lenderId, displayName]) => ({
			lenderId,
			displayName,
		}));
	}, [mortgages]);

	const isTransferValid =
		transferForm.mortgage &&
		transferForm.seller &&
		transferForm.buyer &&
		transferForm.amount;

	const isIssueValid =
		issueForm.mortgage && issueForm.lender && issueForm.amount;

	const isRedeemValid =
		redeemForm.mortgage && redeemForm.lender && redeemForm.amount;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Interactive Actions</CardTitle>
				<p className="text-muted-foreground text-sm">
					Execute real ledger mutations. Entries created here are tagged as{" "}
					<Badge className="text-xs" variant="outline">
						interactive
					</Badge>
				</p>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="transfer">
					<TabsList>
						<TabsTrigger value="transfer">Transfer</TabsTrigger>
						<TabsTrigger value="issue">Issue</TabsTrigger>
						<TabsTrigger value="redeem">Redeem</TabsTrigger>
					</TabsList>

					{/* Transfer Tab */}
					<TabsContent className="space-y-4 pt-4" value="transfer">
						<div className="grid gap-3 sm:grid-cols-2">
							<div>
								<Label>Mortgage</Label>
								<Select
									onValueChange={(v) =>
										onTransferChange({ mortgage: v, seller: "" })
									}
									value={transferForm.mortgage}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select mortgage" />
									</SelectTrigger>
									<SelectContent>
										{mortgages.map((m) => (
											<SelectItem key={m.mortgageId} value={m.mortgageId}>
												{m.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Seller</Label>
								<Select
									onValueChange={(v) => onTransferChange({ seller: v })}
									value={transferForm.seller}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select seller" />
									</SelectTrigger>
									<SelectContent>
										{getPositions(transferForm.mortgage).map((p) => (
											<SelectItem key={p.lenderId} value={p.lenderId}>
												{p.displayName} ({p.balance.toLocaleString()})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Buyer</Label>
								{isCreatingBuyer ? (
									<div className="flex gap-2">
										<Input
											autoFocus
											onChange={(e) =>
												onTransferChange({ buyer: e.target.value })
											}
											placeholder="demo-inv-new"
											value={transferForm.buyer}
										/>
										<Button
											className="shrink-0"
											onClick={() => {
												setIsCreatingBuyer(false);
												onTransferChange({ buyer: "" });
											}}
											size="icon"
											type="button"
											variant="ghost"
										>
											&times;
										</Button>
									</div>
								) : (
									<Select
										onValueChange={(v) => {
											if (v === "__new__") {
												setIsCreatingBuyer(true);
												onTransferChange({ buyer: "" });
											} else {
												onTransferChange({ buyer: v });
											}
										}}
										value={transferForm.buyer}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select buyer" />
										</SelectTrigger>
										<SelectContent>
											{allLenders
												.filter((l) => l.lenderId !== transferForm.seller)
												.map((l) => (
													<SelectItem key={l.lenderId} value={l.lenderId}>
														{l.displayName}
													</SelectItem>
												))}
											<SelectItem value="__new__">
												+ Create new lender
											</SelectItem>
										</SelectContent>
									</Select>
								)}
							</div>
							<div>
								<Label>Amount (units)</Label>
								<Input
									min={1000}
									onChange={(e) => onTransferChange({ amount: e.target.value })}
									placeholder="e.g. 1000"
									type="number"
									value={transferForm.amount}
								/>
							</div>
						</div>
						<Button disabled={!isTransferValid || loading} onClick={onTransfer}>
							Execute Transfer
						</Button>
						<p className="text-muted-foreground text-xs">
							Min position: 1,000 units (10%). Full exit to 0 is allowed.
						</p>
					</TabsContent>

					{/* Issue Tab */}
					<TabsContent className="space-y-4 pt-4" value="issue">
						<div className="grid gap-3 sm:grid-cols-2">
							<div>
								<Label>Mortgage</Label>
								<Select
									onValueChange={(v) => onIssueChange({ mortgage: v })}
									value={issueForm.mortgage}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select mortgage" />
									</SelectTrigger>
									<SelectContent>
										{mortgages
											.filter((m) => m.treasuryBalance > 0)
											.map((m) => (
												<SelectItem key={m.mortgageId} value={m.mortgageId}>
													{m.label} (treasury:{" "}
													{m.treasuryBalance.toLocaleString()})
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Lender ID</Label>
								<Input
									onChange={(e) => onIssueChange({ lender: e.target.value })}
									placeholder="demo-lender-..."
									value={issueForm.lender}
								/>
							</div>
							<div>
								<Label>Amount (units)</Label>
								<Input
									min={1000}
									onChange={(e) => onIssueChange({ amount: e.target.value })}
									placeholder="e.g. 1000"
									type="number"
									value={issueForm.amount}
								/>
							</div>
						</div>
						<Button disabled={!isIssueValid || loading} onClick={onIssue}>
							Issue Shares
						</Button>
					</TabsContent>

					{/* Redeem Tab */}
					<TabsContent className="space-y-4 pt-4" value="redeem">
						<div className="grid gap-3 sm:grid-cols-2">
							<div>
								<Label>Mortgage</Label>
								<Select
									onValueChange={(v) =>
										onRedeemChange({ mortgage: v, lender: "" })
									}
									value={redeemForm.mortgage}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select mortgage" />
									</SelectTrigger>
									<SelectContent>
										{mortgages.map((m) => (
											<SelectItem key={m.mortgageId} value={m.mortgageId}>
												{m.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Lender</Label>
								<Select
									onValueChange={(v) => onRedeemChange({ lender: v })}
									value={redeemForm.lender}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select lender" />
									</SelectTrigger>
									<SelectContent>
										{getPositions(redeemForm.mortgage).map((p) => (
											<SelectItem key={p.lenderId} value={p.lenderId}>
												{p.displayName} ({p.balance.toLocaleString()})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Amount (units)</Label>
								<Input
									min={1000}
									onChange={(e) => onRedeemChange({ amount: e.target.value })}
									placeholder="e.g. 1000"
									type="number"
									value={redeemForm.amount}
								/>
							</div>
						</div>
						<Button
							disabled={!isRedeemValid || loading}
							onClick={onRedeem}
							variant="outline"
						>
							Redeem Shares
						</Button>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
