import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle, Circle, Loader2, Play, Workflow } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-workflow")({
	ssr: false,
	component: WorkflowDemo,
});

const STEPS = ["created", "validate", "charge", "fulfill", "notify"] as const;

function WorkflowDemo() {
	const [amount, setAmount] = useState("99");
	const orders = useQuery(api.demo.workflow.listOrders);
	const startOrder = useMutation(api.demo.workflow.startOrder);

	const handleStart = useCallback(async () => {
		const parsedAmount = Number(amount);
		if (!amount || Number.isNaN(parsedAmount)) {
			return;
		}
		await startOrder({ amount: parsedAmount });
	}, [startOrder, amount]);

	return (
		<DemoLayout
			description="Execute durable multi-step workflows with built-in retries, delays, and state persistence across function interruptions."
			docsHref="https://www.convex.dev/components/workflow"
			title="Workflow"
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Workflow className="size-4" />
							Start a Workflow
						</CardTitle>
						<p className="text-muted-foreground text-sm">
							Creates an order that flows through: validate → charge → fulfill →
							notify
						</p>
					</CardHeader>
					<CardContent>
						<div className="flex gap-3">
							<div className="flex items-center gap-1">
								<span className="text-muted-foreground text-sm">$</span>
								<Input
									className="w-24"
									onChange={(e) => setAmount(e.target.value)}
									type="number"
									value={amount}
								/>
							</div>
							<Button onClick={handleStart}>
								<Play className="mr-2 size-4" />
								Start Order
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Orders list */}
				{orders && orders.length > 0 && (
					<div className="space-y-4">
						{orders.map((order) => {
							const currentStepIdx = STEPS.indexOf(
								order.currentStep as (typeof STEPS)[number]
							);
							return (
								<Card key={order._id}>
									<CardContent className="pt-6">
										<div className="mb-3 flex items-center justify-between">
											<span className="font-medium">Order ${order.amount}</span>
											<Badge
												variant={
													order.status === "completed"
														? "default"
														: order.status === "processing"
															? "secondary"
															: "outline"
												}
											>
												{order.status}
											</Badge>
										</div>
										<div className="flex items-center gap-2">
											{STEPS.map((step, i) => (
												<div className="flex items-center gap-1" key={step}>
													{i <= currentStepIdx ? (
														i === currentStepIdx &&
														order.status === "processing" ? (
															<Loader2 className="size-4 animate-spin text-blue-500" />
														) : (
															<CheckCircle className="size-4 text-green-500" />
														)
													) : (
														<Circle className="size-4 text-muted-foreground" />
													)}
													<span
														className={`text-xs ${i <= currentStepIdx ? "font-medium" : "text-muted-foreground"}`}
													>
														{step}
													</span>
													{i < STEPS.length - 1 && (
														<span className="mx-1 text-muted-foreground">
															→
														</span>
													)}
												</div>
											))}
										</div>
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}
			</div>
		</DemoLayout>
	);
}
