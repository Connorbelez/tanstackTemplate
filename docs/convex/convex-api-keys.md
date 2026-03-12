---
name: convex-api-keys
description: Manage API keys in Convex with creation, validation, rotation, revocation, expiry, idle timeouts, permissions, metadata, and audit-friendly usage patterns. Use when working with API authentication, server-to-server access, machine credentials, or scoped access keys.
---

# Convex API Keys

## Instructions

`convex-api-keys` is a Convex component for API key management in Convex. It lets you create, validate, rotate, and revoke API keys with support for expiry, idle timeout, permissions, metadata, namespaces, and audit-friendly operational patterns.

Use this component whenever you need machine credentials, server-to-server authentication, customer API access, internal service keys, or scoped programmatic access to your Convex-backed application.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-api-keys
```

Then register the component in `convex/convex.config.ts`:

```ts
import apiKeys from "convex-api-keys/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(apiKeys);

export default app;
```

### Capabilities

- Create API keys with optional names, metadata, permissions, and namespaces
- Validate incoming API keys inside Convex queries, mutations, actions, or HTTP flows
- Rotate and revoke keys without inventing custom token lifecycle logic
- Enforce key expiry and idle timeout behavior
- Support scoped permissions and typed metadata patterns
- Separate keys by namespace, such as user, team, environment, or integration
- Fit admin dashboards and self-serve developer settings flows
- Provide a cleaner alternative to storing raw credentials in your own tables

## Quick Start

### how to initialize the API keys client in Convex

Create a shared client in a dedicated module:

```ts
import { ApiKeys } from "convex-api-keys";
import { components } from "./_generated/api.js";

export const apiKeys = new ApiKeys(components.apiKeys);
```

This shared instance can then be reused across key creation, validation, rotation, and revocation flows.

### how to create an API key in a mutation

Use a mutation to issue a key and return the raw token once:

```ts
import { mutation } from "./_generated/server.js";
import { v } from "convex/values";
import { apiKeys } from "./apiKeys.js";

export const createKey = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await apiKeys.create(ctx, {
      name: args.name,
    });
  },
});
```

The returned token should generally be shown once to the user and not exposed again in plaintext later.

### how to validate an API key in Convex

Use validation in a query, mutation, action, or HTTP auth layer:

```ts
import { query } from "./_generated/server.js";
import { v } from "convex/values";
import { apiKeys } from "./apiKeys.js";

export const validateKey = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    return await apiKeys.validate(ctx, {
      token: args.token,
    });
  },
});
```

This is useful for authenticated machine-to-machine requests, partner integrations, and custom API endpoints.

## Patterns

### namespaced API keys for multi-tenant systems

Namespaces are useful when keys should belong to a user, workspace, team, environment, or integration boundary.

Examples:

- `user:123`
- `org:abc`
- `integration:stripe-sync`
- `project:staging`

Use namespaces when you want bulk revocation, clearer ownership boundaries, or safer operational grouping.

### scoped permissions for machine access

Permissions are a good fit when an API key should only perform a limited set of actions.

Examples:

- read-only reporting keys
- write-enabled ingestion keys
- admin automation keys
- environment-specific service keys

A helpful pattern is to keep permissions narrow and explicit rather than issuing broad all-access keys.

### API key metadata for operational context

Metadata can be used to store context such as:

- creation source
- environment
- integration name
- actor who issued the key
- usage purpose

This helps with observability, audits, support workflows, and admin tooling.

### expiry and idle timeout behavior

Use expiry when a key should stop working after a fixed lifetime.

Use idle timeout when a key should automatically become invalid after not being used for some period.

This is useful for:

- temporary contractor access
- short-lived integration testing
- internal operational keys
- reducing the risk of long-forgotten credentials remaining valid forever

## Typed Usage

### how to use typed permissions and metadata

The `ApiKeys` client supports generics for compile-time type safety:

```ts
import { ApiKeys } from "convex-api-keys";
import { components } from "./_generated/api.js";

export const apiKeys = new ApiKeys<{
  namespace: `${string}:${"production" | "testing"}`;
  requireName: true;
  metadata: { source: string };
  permissions: { scope: Array<"read" | "write" | "admin"> };
}>(components.apiKeys, {
  permissionDefaults: {
    scope: ["read"],
  },
  keyDefaults: {
    prefix: "sk_",
    keyLengthBytes: 32,
    ttlMs: 90 * 24 * 60 * 60 * 1000,
    idleTimeoutMs: 30 * 24 * 60 * 60 * 1000,
  },
  logLevel: "debug",
});
```

This is especially useful in larger codebases where API key behavior needs to stay consistent and type-safe.

## Best Practices

- Keep the API keys client in a shared Convex module.
- Return raw keys only once at creation time.
- Store ownership and business rules in your own app logic even if the component stores key records.
- Use namespaces to separate tenants, environments, or integration boundaries.
- Prefer narrow permissions over broad permissions.
- Add expirations or idle timeouts for anything that should not live forever.
- Provide key naming conventions so operators can tell what a key is for.
- Log important issuance and revocation events in your own business audit flows when needed.
- Build self-serve revocation and rotation into admin or developer settings pages.

## When to use this component

Reach for `convex-api-keys` when:

- your app exposes a programmatic API to customers
- you need service-to-service authentication
- you want machine credentials for backend jobs or automations
- you need revocable scoped keys instead of hardcoded shared secrets
- you want better lifecycle handling than a homegrown token table

This component is a strong fit for:

- public developer APIs
- internal admin APIs
- partner integrations
- ingestion endpoints
- webhook verification alternatives in private systems
- scheduled jobs calling protected Convex endpoints

## Troubleshooting

**When should I use API keys instead of user auth sessions?**

Use API keys for machine or service access. Use user auth sessions for interactive end-user authentication. API keys are usually the better fit for scripts, integrations, and backend systems.

**Should I store raw API keys in my own database tables?**

Usually no. Let the component handle token lifecycle and validation. Store only your app-specific ownership, UI, and authorization logic around those keys.

**Can I revoke all keys for a namespace?**

That is one of the main reasons to use namespaces. Grouping keys by namespace makes bulk invalidation and operational cleanup much easier.

**Should I use permissions even if my first version only has one scope?**

Yes, if you expect the API surface to grow. Starting with permission structure early can make later expansion much cleaner.

**What is the difference between expiry and idle timeout?**

Expiry invalidates a key after a fixed timestamp or lifetime. Idle timeout invalidates it after a period of inactivity. You can use one or both depending on your security requirements.

**Is the type configuration runtime validation?**

No. The generic typing is for compile-time safety. You should still make sure your application logic remains compatible with the stored data shape.

**When should I rotate a key instead of revoking and reissuing one manually?**

Use rotation when you want a cleaner credential refresh workflow while preserving surrounding operational context and lifecycle behavior. Revoke and recreate when you want a fully fresh issuance path.

## Resources

- [npm package](https://www.npmjs.com/package/convex-api-keys)
- [GitHub repository](https://github.com/gaganref/convex-api-keys)
- [Convex Components Directory](https://www.convex.dev/components/convex-api-keys)
- [Convex documentation](https://docs.convex.dev)