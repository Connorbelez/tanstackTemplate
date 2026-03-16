import { v } from "convex/values";
import { ApiKeys } from "convex-api-keys";
import { ApiTokens } from "convex-api-tokens";
import { components } from "../_generated/api";
import { authedMutation, authedQuery } from "../fluent";

const apiKeys = new ApiKeys(components.apiKeys);
const apiTokens = new ApiTokens(components.apiTokens);

// ── API Keys ──────────────────────────────────────────────

export const createKey = authedMutation
	.input({ name: v.string() })
	.handler(async (ctx, args) => {
		return await apiKeys.create(ctx, { name: args.name });
	})
	.public();

export const validateKey = authedQuery
	.input({ token: v.string() })
	.handler(async (ctx, args) => {
		return await apiKeys.validate(ctx, { token: args.token });
	})
	.public();

export const revokeKey = authedMutation
	.input({ keyId: v.string() })
	.handler(async (ctx, args) => {
		// keyId is a branded string from the api-keys component
		// biome-ignore lint/suspicious/noExplicitAny: Component internal ID type
		return await apiKeys.invalidate(ctx, { keyId: args.keyId as any });
	})
	.public();

export const listKeys = authedQuery
	.handler(async (ctx) => {
		return await apiKeys.listKeys(ctx, {
			paginationOpts: { numItems: 25, cursor: null },
		});
	})
	.public();

// ── API Tokens ────────────────────────────────────────────

export const createToken = authedMutation
	.input({ name: v.string(), namespace: v.string() })
	.handler(async (ctx, args) => {
		return await apiTokens.create(ctx, {
			namespace: args.namespace,
			name: args.name,
			metadata: { scopes: ["read"] },
		});
	})
	.public();

export const validateToken = authedMutation
	.input({ token: v.string() })
	.handler(async (ctx, args) => {
		return await apiTokens.validate(ctx, { token: args.token });
	})
	.public();

export const revokeToken = authedMutation
	.input({ token: v.string() })
	.handler(async (ctx, args) => {
		return await apiTokens.invalidate(ctx, { token: args.token });
	})
	.public();

export const rotateToken = authedMutation
	.input({ token: v.string() })
	.handler(async (ctx, args) => {
		return await apiTokens.refresh(ctx, { token: args.token });
	})
	.public();
