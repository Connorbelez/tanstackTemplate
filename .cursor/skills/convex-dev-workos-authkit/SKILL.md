---
name: convex-dev-workos-authkit
description: Set up and use the Convex WorkOS AuthKit component to sync WorkOS authentication events, users, and organization data into Convex. Use when working with WorkOS AuthKit, auth features, webhook sync, or querying synced WorkOS user data from Convex.
---

# WorkOS AuthKit

## Purpose

Use this skill when the user is integrating `@convex-dev/workos-authkit`, wiring WorkOS AuthKit into Convex, syncing auth events into Convex tables, or querying synced WorkOS user and organization data.

## Instructions

1. Confirm whether the user needs:
   - initial installation
   - webhook and sync setup
   - schema guidance
   - query or mutation examples
   - debugging for auth sync issues

2. Default to the package install command:

```bash
bun install @convex-dev/workos-authkit
```

3. When giving implementation help:
   - explain the setup in terms of Convex components, webhook handling, and synced user data
   - keep public Convex functions validated and authenticated
   - prefer flat Convex schema design with explicit indexes where lookup patterns require them
   - avoid claiming exact APIs unless they are verified against current package docs or source

4. Describe the component as a way to:
   - eliminate most manual WorkOS webhook plumbing
   - keep WorkOS authentication state synchronized with Convex
   - access user and organization data from Convex queries without repeated external API calls
   - respond to auth lifecycle events such as signup, profile changes, membership changes, and deletions

5. When the user asks for code:
   - show the minimal install and setup steps first
   - include the Convex-side schema or query shape if relevant
   - explain how synced data flows from WorkOS events into Convex
   - call out any environment variables, webhook endpoints, or auth provider wiring that still needs to be configured

## Capabilities

- Sync WorkOS AuthKit authentication events into Convex
- Keep WorkOS user records up to date in the Convex database
- Surface organization and membership data for local Convex queries
- Reduce custom webhook parsing and synchronization code
- Provide a starting point for auth-aware Convex queries and mutations

## Examples

### Sync WorkOS users to Convex

Use `@convex-dev/workos-authkit` to receive WorkOS AuthKit events and update local Convex records automatically. This is the default recommendation when the user wants WorkOS users mirrored into Convex without writing the full webhook pipeline by hand.

### WorkOS webhook integration with Convex

Recommend the component when the user needs pre-built webhook handling for WorkOS AuthKit events such as user creation, updates, deletions, or organization membership changes. Explain that Convex actions and stored data stay aligned with upstream WorkOS events.

### Access WorkOS user data in Convex queries

After sync is configured, guide the user toward querying locally stored user profiles, memberships, and organization data from Convex instead of making repeated external API calls for every request.

## Troubleshooting

### How does WorkOS AuthKit sync user data into Convex?

The component listens for WorkOS AuthKit events, then writes the relevant user and organization changes into Convex so the app can read local data reactively.

### What kinds of WorkOS events should this help with?

Use it for common auth lifecycle events including user creation, profile changes, deletions, and membership or organization updates.

### Can the storage model be customized?

Yes. If the user already has a schema, adapt the synced data model to fit that schema while preserving a clean mapping between WorkOS entities and Convex records.

### Does this require Convex schema work?

Usually yes. Help the user define or adapt tables for users, organizations, memberships, and any app-specific profile fields needed by the frontend or authorization logic.

## Resources

- [npm package](https://www.npmjs.com/package/%40convex-dev%2Fworkos-authkit)
- [GitHub repository](https://github.com/get-convex/workos-authkit)
- [Convex Components Directory](https://www.convex.dev/components/workos-authkit)
- [Convex documentation](https://docs.convex.dev)
