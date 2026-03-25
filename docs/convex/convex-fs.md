---
name: convex-fs
description: Manage files in Convex using filesystem-style paths, directories, atomic operations, signed CDN URLs, and expiration-aware storage workflows. Use when working with file storage, path-based file management, uploads, downloads, or CDN-backed file access.
---

# ConvexFS

## Instructions

`convex-fs` is a Convex component that provides filesystem-like file management for Convex applications.

Instead of treating files as opaque blobs only, it gives you path-oriented operations like files, directories, move, copy, delete, and signed access URLs. Use it when your product benefits from a virtual filesystem model rather than ad hoc blob references.

### Installation

Because this project uses Bun, install it with:

```bash
bun add convex-fs
```

Then register the component in `convex/convex.config.ts`:

```ts
import fs from "convex-fs/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(fs);

export default app;
```

### Capabilities

- Manage files using familiar filesystem-style paths
- Support atomic move, copy, and delete operations
- Organize content into logical directories instead of flat blob references
- Generate signed URLs for secure file delivery
- Support file expiration and temporary content lifecycles
- Enable disaster-recovery-friendly delete behavior through soft-delete concepts
- Integrate CDN-backed file delivery patterns for performant downloads
- Centralize file logic in Convex instead of scattering storage conventions across the app

## When to Use It

Reach for `convex-fs` when:

- your app stores many files with meaningful hierarchical paths
- you want file operations to look like filesystem operations
- you need copy/move semantics, not just upload/get/delete blobs
- your product has folders, albums, projects, workspaces, or tenant-specific file trees
- you need secure signed download access
- temporary or expiring files are part of the workflow
- you want a stronger abstraction than raw storage IDs

It is especially useful for:

- document management
- media libraries
- user uploads organized by tenant or workspace
- generated reports and exports
- temporary artifacts
- CDN-backed downloadable assets
- internal file pipelines with path-based conventions

## Examples

### how to add ConvexFS to a Convex app

Register the component in `convex/convex.config.ts`, then create a shared filesystem client in your Convex code.

```ts
import { ConvexFS } from "convex-fs";
import { components } from "./_generated/api";

export const fs = new ConvexFS(components.fs);
```

A shared module like this makes it easier to reuse the same file operations across upload flows, admin tooling, cleanup jobs, and download APIs.

### how to organize files by path in Convex

Use path conventions that reflect your domain model.

Examples:

- `/users/{userId}/avatars/current.png`
- `/organizations/{orgId}/documents/loan-agreement.pdf`
- `/properties/{propertyId}/images/cover.jpg`
- `/exports/{jobId}/report.csv`

This makes files easier to reason about than a flat list of storage references.

### how to use filesystem-style operations in Convex

ConvexFS is designed for file management patterns like:

- create or write files at a path
- move files between paths
- copy files without re-uploading them
- delete files with controlled semantics
- inspect directory-like structures
- generate signed download access

This is a strong fit when product requirements sound like “move this file into another folder” rather than “replace this blob ID.”

### how to model tenant or workspace file trees

A good pattern is to dedicate top-level path prefixes to tenants, orgs, or major resource types.

For example:

- `/tenants/{tenantId}/...`
- `/workspaces/{workspaceId}/...`
- `/users/{userId}/...`

Benefits:

- easier isolation by prefix
- easier cleanup and retention policies
- simpler authorization rules
- clearer operational debugging

### how to use signed urls for secure downloads

Use ConvexFS when you need to generate time-limited download access instead of exposing permanent public file URLs.

This is useful for:

- private documents
- user-specific exports
- internal attachments
- compliance-sensitive downloads
- expiring shared links

Signed URLs are a better fit than public links when access should be temporary or permission-checked.

### how to use file expiration in Convex workflows

Use expiration-aware file handling for:

- one-time exports
- temporary uploads
- draft attachments
- session-scoped artifacts
- generated reports that should disappear after a window
- cleanup of stale intermediate files

This keeps storage from growing indefinitely and helps align file lifecycle with business rules.

### how to use ConvexFS instead of raw storage ids

Prefer ConvexFS over ad hoc storage references when:

- path structure matters to your product
- users expect folder-like organization
- files move between logical locations
- access patterns are path-oriented
- authorization is easier to reason about by prefix

Prefer simpler raw storage handling when:

- files are few in number
- no directory semantics are needed
- a single storage ID is sufficient
- the app does not need move/copy/path abstractions

## Best Practices

- Keep file path design consistent and domain-driven.
- Reserve top-level prefixes for stable entities like users, orgs, properties, or jobs.
- Do authorization in your own wrappers before allowing path operations.
- Avoid letting arbitrary client input become unrestricted filesystem paths.
- Use signed URLs for protected downloads.
- Use expiration for temporary artifacts and exports.
- Store app-level metadata separately if files need richer domain attributes.
- Keep file naming deterministic where idempotency matters.
- Build cleanup and retention rules around predictable prefixes.

## Troubleshooting

**When should I use ConvexFS instead of basic file storage?**

Use ConvexFS when you need path-based organization, move/copy semantics, directory-like reasoning, signed delivery, or stronger lifecycle management. If all you need is “upload a file and keep its ID,” simpler storage may be enough.

**Should I still keep file metadata in my own tables?**

Usually yes. ConvexFS handles filesystem-style storage concerns, but your app may still need tables for ownership, labels, associations, audit context, display names, or domain-specific permissions.

**How should I design paths safely?**

Use deterministic, app-controlled prefixes and avoid trusting arbitrary free-form paths from unvalidated client input. Paths should reflect your domain and authorization model.

**Is this a good fit for tenant-isolated file systems?**

Yes. Tenant or workspace prefixes are one of the strongest use cases because they make organization, cleanup, and authorization much easier to reason about.

**When are signed URLs important?**

They are important whenever files are not meant to be permanently public. Use them for private documents, internal reports, expiring downloads, or user-scoped assets.

**Should I treat this as my authorization layer?**

No. The component helps with file management and secure delivery patterns, but your own Convex functions should still enforce who can read, write, move, or delete files.

## Resources

- [npm package](https://www.npmjs.com/package/convex-fs)
- [Project documentation](https://convexfs.dev)
- [Convex Components Directory](https://www.convex.dev/components/convex-fs)
- [Convex documentation](https://docs.convex.dev)