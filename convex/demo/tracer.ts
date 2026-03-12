import { v } from "convex/values";
import { Tracer } from "convex-tracer";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

const { tracedMutation } = new Tracer<DataModel>(components.tracer, {
	sampleRate: 1.0, // Sample everything for the demo
	preserveErrors: true,
	retentionMinutes: 60,
});

export const runTracedOperation = tracedMutation({
	name: "demoTracedOperation",
	args: { label: v.string() },
	handler: async (ctx, args) => {
		await ctx.tracer.info("Starting demo operation", { label: args.label });

		const createResult = await ctx.tracer.withSpan("create", async (span) => {
			await span.updateMetadata({ step: "create", label: args.label });
			// Simulate creating something
			const id = await ctx.db.insert("todos", {
				text: `[Tracer Demo] ${args.label}`,
				completed: false,
			});
			await ctx.tracer.info("Created item", { id });
			return id;
		});

		await ctx.tracer.withSpan("validate", async (span) => {
			await span.updateMetadata({ step: "validate", itemId: createResult });
			// Simulate validation
			const item = await ctx.db.get(createResult);
			if (!item) {
				throw new Error("Item not found");
			}
			await ctx.tracer.info("Validation passed");
		});

		await ctx.tracer.withSpan("finalize", async (span) => {
			await span.updateMetadata({ step: "finalize", itemId: createResult });
			await ctx.db.patch(createResult, { completed: true });
			await ctx.tracer.info("Finalized item");
		});

		// Clean up the test item
		await ctx.db.delete(createResult);

		return {
			success: true,
			message: `Traced operation "${args.label}" completed with 3 spans`,
		};
	},
});
