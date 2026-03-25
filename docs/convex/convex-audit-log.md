---
name: convex-audit-log
description: Track user actions, API calls, and system events in Convex with audit trails, change diffs, PII redaction, querying, anomaly detection, and compliance-oriented retention controls. Use when working with audits, compliance, security logging, or destructive/admin actions.
---

# Convex Audit Log

## Instructions

`convex-audit-log` is a Convex component for structured audit logging inside your Convex app.

Use it when you need durable records of who did what, when they did it, what changed, and how to query or export that activity later. It is a strong fit for compliance-sensitive features, admin tools, security monitoring, destructive operations, permission changes, and high-trust workflows.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-audit-log
```

Then register the component in `convex/convex.config.ts`:

```ts
import auditLog from "convex-audit-log/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(auditLog);

export default app;
```

### Capabilities

- Log structured audit events for user actions, API calls, and system events
- Record before/after states for mutations and generate diffs automatically
- Redact configured PII fields from stored audit payloads
- Query logs by actor, resource, severity, time range, and other dimensions
- Watch important events in realtime for operational or security monitoring
- Detect suspicious patterns through anomaly-oriented queries
- Export audit data as JSON or CSV for compliance or reporting workflows
- Configure retention and cleanup behavior for long-term log management

## Examples

### how to initialize the audit log client in Convex

Create a shared client in a dedicated Convex module:

```ts
import { AuditLog } from "convex-audit-log";
import { components } from "./_generated/api";

export const auditLog = new AuditLog(components.auditLog, {
  piiFields: ["email", "phone", "ssn", "password"],
});
```

This is a good place to centralize audit logging behavior, redaction settings, and any shared helper patterns.

### how to log a change with before and after state

Use `logChange` in mutations where you want a clear audit trail of what changed.

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { auditLog } from "./auditLog";

export const updateUserProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.userId);

    await ctx.db.patch(args.userId, {
      name: args.name,
      email: args.email,
    });

    const after = await ctx.db.get(args.userId);

    await auditLog.logChange(ctx, {
      action: "user.profile.updated",
      actorId: (await ctx.auth.getUserIdentity())?.subject,
      resourceType: "users",
      resourceId: args.userId,
      before,
      after,
      generateDiff: true,
      severity: "info",
    });

    return after;
  },
});
```

This works especially well for profile updates, permission changes, billing changes, configuration edits, and admin-controlled writes.

### how to query audit logs for a specific resource

Use resource queries when you want a document history or entity-specific audit trail.

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { auditLog } from "./auditLog";

export const getDocumentHistory = query({
  args: {
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await auditLog.queryByResource(ctx, {
      resourceType: "documents",
      resourceId: args.documentId,
      limit: 50,
    });
  },
});
```

This is useful for document history, case management, underwriting records, loan state transitions, or admin review screens.

### how to query audit activity by actor

Use actor queries to understand what a user, admin, API key, or system identity has done.

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { auditLog } from "./auditLog";

export const getUserActivity = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await auditLog.queryByActor(ctx, {
      actorId: args.userId,
      limit: 50,
    });
  },
});
```

This is helpful for support tooling, abuse investigations, security reviews, and internal admin auditing.

### how to watch critical events in realtime

Use realtime monitoring for warnings, errors, or critical security-sensitive events.

```ts
import { query } from "./_generated/server";
import { auditLog } from "./auditLog";

export const watchSecurityEvents = query({
  args: {},
  handler: async (ctx) => {
    return await auditLog.watchCritical(ctx, {
      severity: ["warning", "error", "critical"],
      limit: 20,
    });
  },
});
```

This is useful for security dashboards, operational alert views, fraud tooling, and internal admin consoles.

### how to use audit logging for destructive actions

Audit logging is especially important for destructive operations like:

- deleting users
- deleting organizations
- revoking access
- changing permissions
- updating billing state
- modifying underwriting or compliance-sensitive records

A good pattern is:

1. authorize the action
2. fetch the relevant current state
3. perform the mutation
4. write an audit event with actor, resource, severity, and change details

### how to use audit logging for compliance workflows

Use this component when you need evidence of actions over time, especially for:

- admin access reviews
- customer support interventions
- data access tracking
- financial workflow changes
- policy enforcement
- incident response
- internal compliance reporting

## Severity levels

Use severity consistently so logs remain queryable and operationally useful:

- `info` for normal operations like profile edits or successful state updates
- `warning` for elevated-risk actions like permission changes or suspicious behavior
- `error` for failed operations and unexpected issues
- `critical` for high-sensitivity events such as unauthorized access attempts or serious security incidents

## Best Practices

- Keep the audit log client in a shared Convex module.
- Log actions with stable `action` names like `user.profile.updated` or `loan.status.changed`.
- Include the acting identity whenever possible.
- Capture both resource type and resource ID for reliable querying.
- Use `before` and `after` payloads only where they add meaningful history.
- Redact PII and secrets aggressively.
- Treat audit logging as append-only evidence, not as user-facing business state.
- Use clear severity conventions across the codebase.
- Add audit logging to admin tools and destructive mutations by default.

## Troubleshooting

**When should I use audit logging instead of regular app logs?**

Use audit logging when the record needs to be queryable, attributable, durable, and useful for compliance, support, or investigations. Regular logs are better for transient debugging and operational detail.

**Should I log every mutation?**

Not necessarily. Focus on important business events, security-sensitive actions, admin operations, destructive changes, access changes, and compliance-relevant workflows.

**Why use before/after state instead of just an event name?**

Before/after snapshots make it much easier to understand what changed and to generate diffs for admin review, support, or investigations.

**How should I handle sensitive fields?**

Use the component’s PII redaction features and avoid storing secrets or unnecessary sensitive payloads in audit entries. Redaction should be intentional and conservative.

**Can I use this for realtime monitoring too?**

Yes. The component supports realtime-style monitoring patterns for important events, which is useful for internal dashboards and security review tooling.

**What kinds of actions should be audited first in this codebase?**

Start with:
- authentication or authorization changes
- admin-only mutations
- destructive deletes
- billing and subscription changes
- compliance-sensitive record updates
- API key or token issuance/revocation
- data export or privacy-related actions

## Resources

- [npm package](https://www.npmjs.com/package/convex-audit-log)
- [Convex Components Directory](https://www.convex.dev/components/convex-audit-log)
- [Project site](https://audit-log.devwithbobby.com)
- [Convex documentation](https://docs.convex.dev)