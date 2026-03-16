import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { authedMutation, authedQuery } from "../fluent";

const presence = new Presence(components.presence);

export const heartbeat = authedMutation
	.input({
		roomId: v.string(),
		userId: v.string(),
		sessionId: v.string(),
		interval: v.number(),
	})
	.handler(async (ctx, { roomId, userId, sessionId, interval }) => {
		return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
	})
	.public();

export const list = authedQuery
	.input({ roomToken: v.string() })
	.handler(async (ctx, { roomToken }) => {
		return await presence.list(ctx, roomToken);
	})
	.public();

export const disconnect = authedMutation
	.input({ sessionToken: v.string() })
	.handler(async (ctx, { sessionToken }) => {
		return await presence.disconnect(ctx, sessionToken);
	})
	.public();

export const listRoom = authedQuery
	.input({ roomId: v.string() })
	.handler(async (ctx, { roomId }) => {
		return await presence.listRoom(ctx, roomId, false, 50);
	})
	.public();

// Chat messages for the demo room
export const sendMessage = authedMutation
	.input({ room: v.string(), author: v.string(), text: v.string() })
	.handler(async (ctx, args) => {
		await ctx.db.insert("demo_presence_messages", {
			room: args.room,
			author: args.author,
			text: args.text,
		});
	})
	.public();

export const listMessages = authedQuery
	.input({ room: v.string() })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("demo_presence_messages")
			.withIndex("by_room", (q) => q.eq("room", args.room))
			.order("desc")
			.take(50);
	})
	.public();
