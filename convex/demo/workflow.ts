import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../fluent";

const workflow = new WorkflowManager(components.workflow);

const steps = ["validate", "charge", "fulfill", "notify"] as const;

export const processOrder = workflow.define({
	args: { orderId: v.id("demo_workflow_orders") },
	handler: async (step, args) => {
		for (const stepName of steps) {
			await step.runAction(internal.demo.workflow.executeStep, {
				orderId: args.orderId,
				stepName,
			});
		}
		return { success: true };
	},
});

export const executeStep = internalAction({
	args: { orderId: v.id("demo_workflow_orders"), stepName: v.string() },
	handler: async (ctx, args) => {
		// Simulate processing time
		await new Promise((resolve) =>
			setTimeout(resolve, 1000 + Math.random() * 1000)
		);
		await ctx.runMutation(internal.demo.workflow.updateOrderStep, {
			orderId: args.orderId,
			stepName: args.stepName,
		});
	},
});

export const updateOrderStep = internalMutation({
	args: { orderId: v.id("demo_workflow_orders"), stepName: v.string() },
	handler: async (ctx, args) => {
		const order = await ctx.db.get(args.orderId);
		if (!order) {
			return;
		}

		const nextStatus = args.stepName === "notify" ? "completed" : "processing";
		await ctx.db.patch(args.orderId, {
			currentStep: args.stepName,
			status: nextStatus,
		});
	},
});

export const startOrder = authedMutation
	.input({ amount: v.number() })
	.handler(async (ctx, args) => {
		const orderId = await ctx.db.insert("demo_workflow_orders", {
			amount: args.amount,
			status: "pending",
			currentStep: "created",
		});
		const workflowId: string = await workflow.start(
			ctx,
			internal.demo.workflow.processOrder,
			{ orderId }
		);
		return { orderId, workflowId };
	})
	.public();

export const listOrders = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_workflow_orders").order("desc").take(10);
	})
	.public();
