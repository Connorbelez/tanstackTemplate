import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	products: defineTable({
		title: v.string(),
		imageId: v.string(),
		price: v.number(),
	}),
	todos: defineTable({
		text: v.string(),
		completed: v.boolean(),
	}),
	numbers: defineTable({
		value: v.number(),
	}),
	users: defineTable({
		authId: v.string(),
		email: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		phoneNumber: v.optional(v.string()),
	}).index("authId", ["authId"]),
});
