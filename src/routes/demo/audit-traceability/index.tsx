import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, Plus, Sparkles, X, Zap } from "lucide-react";
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
import { Label } from "#/components/ui/label";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/audit-traceability/")({
	ssr: false,
	component: TransfersPage,
});

const STATUS_CONFIG: Record<
	string,
	{
		label: string;
		variant: "default" | "secondary" | "destructive" | "outline";
	}
> = {
	active: { label: "Active", variant: "default" },
	transfer_initiated: { label: "Initiated", variant: "secondary" },
	transfer_approved: { label: "Approved", variant: "outline" },
	transfer_completed: { label: "Completed", variant: "default" },
	transfer_rejected: { label: "Rejected", variant: "destructive" },
};

function TransfersPage() {
	const mortgages = useQuery(api.demo.auditTraceability.listMortgages);
	const createMortgage = useMutation(api.demo.auditTraceability.createMortgage);
	const initiateTransfer = useMutation(
		api.demo.auditTraceability.initiateTransfer
	);
	const approveTransfer = useMutation(
		api.demo.auditTraceability.approveTransfer
	);
	const completeTransfer = useMutation(
		api.demo.auditTraceability.completeTransfer
	);
	const rejectTransfer = useMutation(api.demo.auditTraceability.rejectTransfer);
	const seedData = useMutation(api.demo.auditTraceability.seedData);
	const tracedLifecycle = useMutation(
		api.demo.auditTraceability.tracedTransferLifecycle
	);

	const [label, setLabel] = useState("");
	const [ownerId, setOwnerId] = useState("");
	const [loanAmount, setLoanAmount] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [ssn, setSsn] = useState("");
	const [address, setAddress] = useState("");
	const [error, setError] = useState<string | null>(null);

	const [transferTarget, setTransferTarget] =
		useState<Id<"demo_audit_mortgages"> | null>(null);
	const [newOwnerId, setNewOwnerId] = useState("");
	const [transferPct, setTransferPct] = useState("100");

	const handleCreate = useCallback(async () => {
		if (!(label.trim() && ownerId.trim() && loanAmount.trim())) {
			return;
		}
		setError(null);
		try {
			await createMortgage({
				label: label.trim(),
				currentOwnerId: ownerId.trim(),
				loanAmount: Number(loanAmount),
				borrowerEmail: email || undefined,
				borrowerPhone: phone || undefined,
				borrowerSsn: ssn || undefined,
				propertyAddress: address || undefined,
			});
			setLabel("");
			setOwnerId("");
			setLoanAmount("");
			setEmail("");
			setPhone("");
			setSsn("");
			setAddress("");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [createMortgage, label, ownerId, loanAmount, email, phone, ssn, address]);

	const handleInitiate = useCallback(
		async (id: Id<"demo_audit_mortgages">) => {
			if (!newOwnerId.trim()) {
				return;
			}
			setError(null);
			try {
				await initiateTransfer({
					id,
					newOwnerId: newOwnerId.trim(),
					ownershipPercentage: Number(transferPct) || 100,
				});
				setTransferTarget(null);
				setNewOwnerId("");
				setTransferPct("100");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[initiateTransfer, newOwnerId, transferPct]
	);

	const handleAction = useCallback(
		async (
			action: "approve" | "complete" | "reject",
			id: Id<"demo_audit_mortgages">
		) => {
			setError(null);
			try {
				if (action === "approve") {
					await approveTransfer({ id });
				} else if (action === "complete") {
					await completeTransfer({ id });
				} else {
					await rejectTransfer({ id });
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[approveTransfer, completeTransfer, rejectTransfer]
	);

	return (
		<div className="space-y-6">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Create Mortgage Form */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Create Mortgage</CardTitle>
						<CardDescription>
							PII fields will be redacted in audit records
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div>
							<Label htmlFor="label">Label</Label>
							<Input
								id="label"
								onChange={(e) => setLabel(e.target.value)}
								placeholder="123 Main St Mortgage"
								value={label}
							/>
						</div>
						<div>
							<Label htmlFor="ownerId">Owner ID</Label>
							<Input
								id="ownerId"
								onChange={(e) => setOwnerId(e.target.value)}
								placeholder="owner-alice"
								value={ownerId}
							/>
						</div>
						<div>
							<Label htmlFor="loanAmount">Loan Amount</Label>
							<Input
								id="loanAmount"
								onChange={(e) => setLoanAmount(e.target.value)}
								placeholder="450000"
								type="number"
								value={loanAmount}
							/>
						</div>
						<div className="space-y-2 rounded-md border border-dashed p-3">
							<p className="font-medium text-muted-foreground text-xs">
								PII Fields (for redaction demo)
							</p>
							<Input
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Email"
								value={email}
							/>
							<Input
								onChange={(e) => setPhone(e.target.value)}
								placeholder="Phone"
								value={phone}
							/>
							<Input
								onChange={(e) => setSsn(e.target.value)}
								placeholder="SSN"
								value={ssn}
							/>
							<Input
								onChange={(e) => setAddress(e.target.value)}
								placeholder="Property Address"
								value={address}
							/>
						</div>
						<Button
							className="w-full"
							disabled={!(label.trim() && ownerId.trim() && loanAmount.trim())}
							onClick={handleCreate}
							size="sm"
						>
							<Plus className="mr-1 size-3.5" />
							Create Mortgage
						</Button>
					</CardContent>
				</Card>

				{/* Mortgage List */}
				<div className="space-y-4 lg:col-span-2">
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-base">Mortgages</CardTitle>
								<div className="flex gap-2">
									<Button
										onClick={() =>
											tracedLifecycle({ __traceContext: undefined })
										}
										size="sm"
										variant="outline"
									>
										<Zap className="mr-1 size-3.5" />
										Traced Lifecycle
									</Button>
									<Button
										onClick={() => seedData({})}
										size="sm"
										variant="outline"
									>
										<Sparkles className="mr-1 size-3.5" />
										Seed
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							{mortgages && mortgages.length === 0 && (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No mortgages yet. Create one or seed sample data.
								</p>
							)}

							<div className="space-y-3">
								{mortgages?.map((m) => {
									const cfg = STATUS_CONFIG[m.status] ?? {
										label: m.status,
										variant: "outline" as const,
									};
									return (
										<div
											className="space-y-2 rounded-md border p-3"
											key={m._id}
										>
											<div className="flex items-center justify-between">
												<div>
													<p className="font-medium text-sm">{m.label}</p>
													<p className="text-muted-foreground text-xs">
														Owner: {m.currentOwnerId}
														{m.newOwnerId && (
															<>
																{" "}
																<ArrowRight className="inline size-3" />{" "}
																{m.newOwnerId} ({m.ownershipPercentage}%)
															</>
														)}
														{" | "}${m.loanAmount.toLocaleString()}
													</p>
												</div>
												<Badge variant={cfg.variant}>{cfg.label}</Badge>
											</div>

											{/* Transfer initiation */}
											{m.status === "active" &&
												(transferTarget === m._id ? (
													<div className="flex items-end gap-2">
														<div className="flex-1">
															<Label className="text-xs">New Owner</Label>
															<Input
																onChange={(e) => setNewOwnerId(e.target.value)}
																placeholder="owner-new"
																value={newOwnerId}
															/>
														</div>
														<div className="w-20">
															<Label className="text-xs">%</Label>
															<Input
																onChange={(e) => setTransferPct(e.target.value)}
																type="number"
																value={transferPct}
															/>
														</div>
														<Button
															disabled={!newOwnerId.trim()}
															onClick={() => handleInitiate(m._id)}
															size="sm"
														>
															Go
														</Button>
														<Button
															onClick={() => setTransferTarget(null)}
															size="sm"
															variant="ghost"
														>
															<X className="size-3.5" />
														</Button>
													</div>
												) : (
													<Button
														onClick={() => setTransferTarget(m._id)}
														size="sm"
														variant="outline"
													>
														Initiate Transfer
													</Button>
												))}

											{/* Approve / Reject */}
											{m.status === "transfer_initiated" && (
												<div className="flex gap-2">
													<Button
														onClick={() => handleAction("approve", m._id)}
														size="sm"
													>
														<Check className="mr-1 size-3.5" />
														Approve
													</Button>
													<Button
														onClick={() => handleAction("reject", m._id)}
														size="sm"
														variant="destructive"
													>
														<X className="mr-1 size-3.5" />
														Reject
													</Button>
												</div>
											)}

											{/* Complete */}
											{m.status === "transfer_approved" && (
												<div className="flex gap-2">
													<Button
														onClick={() => handleAction("complete", m._id)}
														size="sm"
													>
														<Check className="mr-1 size-3.5" />
														Complete Transfer
													</Button>
													<Button
														onClick={() => handleAction("reject", m._id)}
														size="sm"
														variant="destructive"
													>
														<X className="mr-1 size-3.5" />
														Reject
													</Button>
												</div>
											)}
										</div>
									);
								})}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
