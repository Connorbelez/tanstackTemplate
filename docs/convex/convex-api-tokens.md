---
name: convex-api-tokens
description: Manage API token issuance, validation, rotation, revocation, and encrypted third-party credential storage in Convex. Use when working with API authentication, machine-to-machine access, token rotation, secure credentials, or protected HTTP endpoints.
---

# API Tokens

## Instructions

`convex-api-tokens` is a Convex component for issuing, validating, rotating, and revoking API tokens inside your Convex app.

Use it when your app needs machine-to-machine authentication, user-managed API keys, backend token validation, protected HTTP endpoints, or secure storage for third-party credentials.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-api-tokens
```

Then register the component in `convex/convex.config.ts`:

```ts
import apiTokens from "convex-api-tokens/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(apiTokens);

export default app;
```

### Optional Environment Variables

If you want to use encrypted third-party key storage, set this in your Convex deployment environment:

- `API_TOKENS_ENCRYPTION_KEY` - Encryption key used for protected credential storage

### Capabilities

- Issue API tokens with namespaces, metadata, expiration, and idle timeout rules
- Validate tokens with explicit failure reasons such as expired, revoked, invalid, or idle timeout
- Rotate tokens while preserving metadata and management workflows
- Revoke single tokens or invalidate groups of tokens
- Securely store third-party credentials with encryption
- Protect HTTP endpoints and mutations with token-auth middleware patterns
- Support admin or self-serve token management dashboards
- Keep token auth logic in Convex instead of scattering it across multiple services

## Examples

### how to initialize API tokens in Convex

Create a shared client in your Convex code:

```ts
import { ApiTokens } from "convex-api-tokens";
import { components } from "./_generated/api";

export const apiTokens = new ApiTokens(components.apiTokens);
```

If you need encrypted credential storage, pass the encryption key:

```ts
import { ApiTokens } from "convex-api-tokens";
import { components } from "./_generated/api";

export const apiTokens = new ApiTokens(components.apiTokens, {
  API_TOKENS_ENCRYPTION_KEY: process.env.API_TOKENS_ENCRYPTION_KEY,
});
```

### how to create an API token in Convex

Use a mutation to mint a token for the current user, workspace, or system namespace.

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { apiTokens } from "./tokens";

export const createToken = mutation({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = "user_123";

    return await apiTokens.create(ctx, {
      namespace: userId,
      name: args.name ?? "Default API Token",
      metadata: {
        scopes: ["read", "write"],
      },
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      maxIdleMs: 30 * 24 * 60 * 60 * 1000,
    });
  },
});
```

This is a strong fit for developer API keys, backend service access, CLI authentication, or customer-issued automation tokens.

### how to validate an incoming API token in Convex

Validate tokens in a mutation or action before performing protected work.

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { apiTokens } from "./tokens";

export const validateToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await apiTokens.validate(ctx, {
      token: args.token,
    });

    if (!result.ok) {
      throw new Error(`Token invalid: ${result.reason}`);
    }

    return {
      namespace: result.namespace,
      metadata: result.metadata,
    };
  },
});
```

Typical invalid reasons include:

- `expired`
- `idle_timeout`
- `revoked`
- `invalid`

### how to rotate an API token in Convex

Use rotation when you want to replace a token without forcing the user to recreate all of its settings from scratch.

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { apiTokens } from "./tokens";

export const rotateToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await apiTokens.refresh(ctx, {
      token: args.token,
    });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result;
  },
});
```

This is useful for security hygiene, incident response, and periodic credential refresh workflows.

### how to revoke API tokens in Convex

Revoke individual tokens or whole namespaces depending on your product needs.

```ts
await apiTokens.invalidate(ctx, { token: rawToken });
await apiTokens.invalidateById(ctx, { tokenId: "token_id_here" });
await apiTokens.invalidateAll(ctx, { namespace: userId });
```

Use this for:

- account compromise response
- offboarding
- disconnecting integrations
- invalidating leaked credentials
- tenant-wide lockouts

### how to use API tokens for machine-to-machine authentication

This component works well when external systems need to call your Convex-backed APIs.

Typical examples:

- a customer backend calling your API
- CLI tools authenticating to your service
- scheduled jobs hitting internal endpoints
- partner integrations
- webhooks or external automation workers

A common pattern is:

1. issue a token scoped to a namespace
2. attach metadata like scopes or environment
3. validate the token on each protected request
4. enforce authorization from the token metadata
5. rotate or revoke as needed

### how to store third-party credentials securely

Use encrypted storage when your app needs to keep provider secrets such as:

- Stripe API keys
- OpenAI keys
- vendor access tokens
- integration secrets
- workspace-level external credentials

This is useful when a customer connects an external service and your app needs to store the secret securely for later backend use.

### how to protect HTTP endpoints with token auth

This component includes middleware-oriented patterns for protecting HTTP endpoints and mutations with token validation logic.

Use it when:

- requests come from non-browser clients
- bearer tokens are your auth model
- auth must work outside your normal session-based login flow
- you need per-token namespaces and metadata-driven authorization

## Best Practices

- Keep the `ApiTokens` client in a shared Convex module.
- Use namespaces to isolate tokens by user, tenant, workspace, or system.
- Store authorization-relevant scopes in metadata and validate them explicitly.
- Show raw tokens only once at creation or rotation time.
- Prefer short-lived tokens where practical.
- Combine expiry and idle timeout for better security.
- Revoke tokens immediately when compromise is suspected.
- Use encrypted storage for third-party credentials instead of plain-text fields.
- Keep token auth separate from end-user session auth when the use cases differ.

## Troubleshooting

**When should I use API tokens instead of session authentication?**

Use API tokens when access comes from machines, scripts, CLIs, partner backends, or long-lived integrations. Use session auth for interactive end-user browser sessions.

**What is a namespace for?**

A namespace groups tokens by ownership or domain, such as a user ID, workspace ID, or environment key. This makes it easier to revoke or query related tokens together.

**Should I store raw tokens in my own tables?**

No. Treat the raw token like a secret shown once to the caller. Use the component’s management APIs and returned identifiers or prefixes for display and administration.

**What happens when a token expires or goes idle?**

Validation will fail with a reason like `expired` or `idle_timeout`. Your app can then ask the user to rotate, recreate, or re-authenticate.

**When should I rotate instead of revoke?**

Rotate when access should continue but the secret value should change. Revoke when access should end entirely.

**Do I need an encryption key?**

Only if you use the encrypted third-party credential storage features. If you do, the encryption key must be set securely in your Convex environment and never hardcoded.

**Can I use this for customer-facing API key management?**

Yes. It is a good fit for self-serve developer settings, personal access tokens, workspace integration keys, and admin-managed service tokens.

## Resources

- [npm package](https://www.npmjs.com/package/convex-api-tokens)
- [GitHub repository](https://github.com/TimpiaAI/convex-api-tokens)
- [Convex Components Directory](https://www.convex.dev/components/convex-api-tokens)
- [Convex documentation](https://docs.convex.dev)