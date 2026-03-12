import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { mutation, query } from "../_generated/server";

const presence = new Presence(components.presence);

export const heartbeat = mutation({
	args: {
		roomId: v.string(),
		userId: v.string(),
		sessionId: v.string(),
		interval: v.number(),
	},
	handler: async (ctx, { roomId, userId, sessionId, interval }) => {
		return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
	},
});

export const list = query({
	args: { roomToken: v.string() },
	handler: async (ctx, { roomToken }) => {
		return await presence.list(ctx, roomToken);
	},
});

export const disconnect = mutation({
	args: { sessionToken: v.string() },
	handler: async (ctx, { sessionToken }) => {
		return await presence.disconnect(ctx, sessionToken);
	},
});

export const listRoom = query({
	args: { roomId: v.string() },
	handler: async (ctx, { roomId }) => {
		return await presence.listRoom(ctx, roomId, false, 50);
	},
});

// Chat messages for the demo room
export const sendMessage = mutation({
	args: { room: v.string(), author: v.string(), text: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.insert("demo_presence_messages", {
			room: args.room,
			author: args.author,
			text: args.text,
		});
	},
});

export const listMessages = query({
	args: { room: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("demo_presence_messages")
			.withIndex("by_room", (q) => q.eq("room", args.room))
			.order("desc")
			.take(50);
	},
});
