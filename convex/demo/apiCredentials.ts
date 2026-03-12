import { v } from "convex/values";
import { ApiKeys } from "convex-api-keys";
import { ApiTokens } from "convex-api-tokens";
import { components } from "../_generated/api";
import { mutation, query } from "../_generated/server";

const apiKeys = new ApiKeys(components.apiKeys);
const apiTokens = new ApiTokens(components.apiTokens);

// ── API Keys ──────────────────────────────────────────────

export const createKey = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		return await apiKeys.create(ctx, { name: args.name });
	},
});

export const validateKey = query({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		return await apiKeys.validate(ctx, { token: args.token });
	},
});

export const revokeKey = mutation({
	args: { keyId: v.string() },
	handler: async (ctx, args) => {
		// keyId is a branded string from the api-keys component
		// biome-ignore lint/suspicious/noExplicitAny: Component internal ID type
		return await apiKeys.invalidate(ctx, { keyId: args.keyId as any });
	},
});

export const listKeys = query({
	args: {},
	handler: async (ctx) => {
		return await apiKeys.listKeys(ctx, {
			paginationOpts: { numItems: 25, cursor: null },
		});
	},
});

// ── API Tokens ────────────────────────────────────────────

export const createToken = mutation({
	args: { name: v.string(), namespace: v.string() },
	handler: async (ctx, args) => {
		return await apiTokens.create(ctx, {
			namespace: args.namespace,
			name: args.name,
			metadata: { scopes: ["read"] },
		});
	},
});

export const validateToken = mutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		return await apiTokens.validate(ctx, { token: args.token });
	},
});

export const revokeToken = mutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		return await apiTokens.invalidate(ctx, { token: args.token });
	},
});

export const rotateToken = mutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		return await apiTokens.refresh(ctx, { token: args.token });
	},
});
