import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useCallback, useState } from "react";
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
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/governed-transitions/")({
	ssr: false,
	component: CommandCenter,
});

const ALL_EVENTS = [
	"SUBMIT",
	"ASSIGN_REVIEWER",
	"APPROVE",
	"REJECT",
	"REQUEST_INFO",
	"RESUBMIT",
	"REOPEN",
	"FUND",
	"CLOSE",
];

const SOURCE_CHANNELS = [
	{ value: "borrower_portal", label: "Borrower Portal" },
	{ value: "broker_portal", label: "Broker Portal" },
	{ value: "admin_dashboard", label: "Admin Dashboard" },
	{ value: "api_webhook", label: "API Webhook" },
	{ value: "scheduler", label: "Scheduler" },
];

const statusColors: Record<
	string,
	"secondary" | "outline" | "default" | "destructive"
> = {
	draft: "secondary",
	submitted: "outline",
	under_review: "default",
	approved: "default",
	rejected: "destructive",
	needs_info: "secondary",
	funded: "default",
	closed: "outline",
};

function CommandCenter() {
	const entities = useQuery(api.demo.governedTransitions.listEntities);
	const [selectedEntityId, setSelectedEntityId] =
		useState<Id<"demo_gt_entities"> | null>(null);
	const validTransitions = useQuery(
		api.demo.governedTransitions.getValidTransitions,
		selectedEntityId ? { entityId: selectedEntityId } : "skip"
	);
	const transitionMut = useMutation(api.demo.governedTransitions.transition);
	const createEntityMut = useMutation(
		api.demo.governedTransitions.createEntity
	);
	const seedMut = useMutation(api.demo.governedTransitions.seedEntities);
	const resetMut = useMutation(api.demo.governedTransitions.resetDemo);
	const runLifecycleMut = useMutation(
		api.demo.governedTransitions.runFullLifecycle
	);

	const [label, setLabel] = useState("");
	const [loanAmount, setLoanAmount] = useState("");
	const [applicantName, setApplicantName] = useState("");
	const [sourceChannel, setSourceChannel] = useState("admin_dashboard");
	const [error, setError] = useState<string | null>(null);

	const handleCreate = useCallback(async () => {
		if (!(label.trim() && loanAmount.trim())) {
			return;
		}
		setError(null);
		try {
			await createEntityMut({
				label: label.trim(),
				loanAmount: Number(loanAmount),
				applicantName: applicantName.trim() || undefined,
			});
			setLabel("");
			setLoanAmount("");
			setApplicantName("");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [createEntityMut, label, loanAmount, applicantName]);

	const handleTransition = useCallback(
		async (entityId: Id<"demo_gt_entities">, eventType: string) => {
			setError(null);
			try {
				await transitionMut({
					entityId,
					eventType,
					source: { channel: sourceChannel },
				});
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[transitionMut, sourceChannel]
	);

	const handleReset = useCallback(async () => {
		setError(null);
		setSelectedEntityId(null);
		try {
			await resetMut({});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [resetMut]);

	const validEventTypes = new Set(
		validTransitions?.map((t) => t.eventType) ?? []
	);

	return (
		<div className="space-y-6">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Left Column -- Create + Actions */}
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Create Application</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div>
								<Label htmlFor="gt-label">Label</Label>
								<Input
									id="gt-label"
									onChange={(e) => setLabel(e.target.value)}
									placeholder="First-Time Buyer Application"
									value={label}
								/>
							</div>
							<div>
								<Label htmlFor="gt-amount">Loan Amount</Label>
								<Input
									id="gt-amount"
									onChange={(e) => setLoanAmount(e.target.value)}
									placeholder="350000"
									type="number"
									value={loanAmount}
								/>
							</div>
							<div>
								<Label htmlFor="gt-applicant">
									Applicant Name{" "}
									<span className="text-muted-foreground">(optional)</span>
								</Label>
								<Input
									id="gt-applicant"
									onChange={(e) => setApplicantName(e.target.value)}
									placeholder="Sarah Chen"
									value={applicantName}
								/>
							</div>
							<Button
								className="w-full"
								disabled={!(label.trim() && loanAmount.trim())}
								onClick={handleCreate}
								size="sm"
							>
								<Plus className="mr-1 size-3.5" />
								Create Application
							</Button>
						</CardContent>
					</Card>

					<div className="flex flex-wrap gap-2">
						<Button onClick={() => seedMut({})} size="sm" variant="outline">
							<Sparkles className="mr-1 size-3.5" />
							Seed Data
						</Button>
						<Button
							onClick={() => runLifecycleMut({})}
							size="sm"
							variant="outline"
						>
							<Zap className="mr-1 size-3.5" />
							Run Full Lifecycle
						</Button>
						<Button onClick={handleReset} size="sm" variant="outline">
							<RotateCcw className="mr-1 size-3.5" />
							Reset Demo
						</Button>
					</div>
				</div>

				{/* Right Column -- Entity List */}
				<div className="space-y-4 lg:col-span-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Entities</CardTitle>
						</CardHeader>
						<CardContent>
							{entities && entities.length === 0 && (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No entities yet. Create one or seed sample data.
								</p>
							)}

							<div className="space-y-3">
								{entities?.map((entity) => {
									const isSelected = selectedEntityId === entity._id;
									return (
										<div
											className={`space-y-3 rounded-md border p-3 transition-colors ${
												isSelected
													? "border-primary bg-muted/30"
													: "hover:bg-muted/20"
											}`}
											key={entity._id}
										>
											<button
												className="flex w-full cursor-pointer items-center justify-between text-left"
												onClick={() =>
													setSelectedEntityId(isSelected ? null : entity._id)
												}
												type="button"
											>
												<div>
													<p className="font-medium text-sm">{entity.label}</p>
													<p className="text-muted-foreground text-xs">
														$
														{(
															(
																entity.data as {
																	loanAmount?: number;
																}
															)?.loanAmount ?? 0
														).toLocaleString()}
													</p>
												</div>
												<Badge
													variant={statusColors[entity.status] ?? "outline"}
												>
													{entity.status}
												</Badge>
											</button>

											{isSelected && (
												<div className="space-y-4 border-t pt-3">
													{/* Source Channel Selector */}
													<div className="max-w-xs">
														<Label className="text-xs">Source Channel</Label>
														<Select
															onValueChange={setSourceChannel}
															value={sourceChannel}
														>
															<SelectTrigger className="h-8 text-xs">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{SOURCE_CHANNELS.map((ch) => (
																	<SelectItem key={ch.value} value={ch.value}>
																		{ch.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>

													{/* Valid Transitions */}
													{validTransitions && validTransitions.length > 0 && (
														<div>
															<p className="mb-2 font-medium text-muted-foreground text-xs">
																Valid Transitions
															</p>
															<div className="flex flex-wrap gap-2">
																{validTransitions.map((t) => (
																	<Button
																		className="bg-green-600 hover:bg-green-700"
																		key={t.eventType}
																		onClick={() =>
																			handleTransition(entity._id, t.eventType)
																		}
																		size="sm"
																		variant="default"
																	>
																		{t.eventType} &rarr; {t.targetState}
																	</Button>
																))}
															</div>
														</div>
													)}

													{/* All Events */}
													<div>
														<p className="mb-2 font-medium text-muted-foreground text-xs">
															Send All Events
														</p>
														<div className="flex flex-wrap gap-2">
															{ALL_EVENTS.map((evt) => {
																const isValid = validEventTypes.has(evt);
																return (
																	<Button
																		className={
																			isValid
																				? "bg-green-600 hover:bg-green-700"
																				: "cursor-not-allowed opacity-50"
																		}
																		key={evt}
																		onClick={() =>
																			handleTransition(entity._id, evt)
																		}
																		size="sm"
																		variant={isValid ? "default" : "secondary"}
																	>
																		{evt}
																	</Button>
																);
															})}
														</div>
													</div>
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
