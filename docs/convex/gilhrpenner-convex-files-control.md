---
name: gilhrpenner-convex-files-control
description: Secure file upload and download management for Convex with access control, grants, cleanup, optional HTTP routes, and support for Convex storage or Cloudflare R2.
---

# Convex Files Control

## Instructions

`@gilhrpenner/convex-files-control` is a Convex component for secure file uploads, access control, download grants, lifecycle cleanup, and optional HTTP upload/download routes. Use it when you need controlled file handling on top of Convex storage or Cloudflare R2.

### Installation

```bash
bun add @gilhrpenner/convex-files-control
```

Add the component to `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import convexFilesControl from "@gilhrpenner/convex-files-control/convex.config";

const app = defineApp();
app.use(convexFilesControl);

export default app;
```

### Capabilities

- Generate secure upload URLs for Convex storage or Cloudflare R2.
- Finalize uploads with access keys and optional expirations.
- Create controlled download grants with max uses, expiry, and optional password protection.
- Register optional HTTP upload and download routes for app-facing file flows.
- Clean up expired uploads, grants, and managed file state automatically.

## Examples

### how to generate secure upload urls in Convex

Use the component from your own mutation wrappers so your app enforces authentication and stores any app-specific file metadata separately.

```ts
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";

export const generateUploadUrl = mutation({
  args: {
    provider: v.union(v.literal("convex"), v.literal("r2")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }

    return await ctx.runMutation(
      components.convexFilesControl.upload.generateUploadUrl,
      {
        provider: args.provider,
      },
    );
  },
});
```

### how to finalize file uploads with access control

Finalize the upload through the component and attach access keys derived from your authenticated user or tenant model.

```ts
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";

export const finalizeUpload = mutation({
  args: {
    uploadToken: v.string(),
    storageId: v.string(),
    fileName: v.string(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    metadata: v.optional(
      v.object({
        size: v.number(),
        sha256: v.string(),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }

    const { fileName, ...componentArgs } = args;

    const result = await ctx.runMutation(
      components.convexFilesControl.upload.finalizeUpload,
      {
        ...componentArgs,
        accessKeys: [identity.subject],
      },
    );

    // Store your own app-level file metadata here if needed.
    // await ctx.db.insert("files", { ... });

    return result;
  },
});
```

### how to register optional http routes for uploads and downloads

If you want direct HTTP endpoints such as `/files/upload` and `/files/download`, register the component routes in `convex/http.ts`.

```ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";

const http = httpRouter();

registerRoutes(http, components.convexFilesControl, {
  pathPrefix: "files",
});

export default http;
```

### how to use download grants for secure sharing

Use download grants when you need temporary or restricted access to files, such as expiring links or limited-use downloads.

- Create grants with expiration times.
- Limit the number of uses.
- Optionally require a password.
- Share the resulting link without exposing permanent raw access.

## Troubleshooting

**Should I call component functions directly from the client?**

No. Wrap component functions in your own Convex queries, mutations, or actions so you can enforce your application's auth rules and keep file metadata aligned with your domain model.

**Does this component replace my app's file metadata table?**

No. The component manages secure upload and access-control mechanics. You should still store your own file records for things like ownership, labels, business associations, and UI metadata.

**When should I use Convex storage vs Cloudflare R2?**

Use Convex storage for simpler native Convex file flows. Use R2 when you need separate object storage infrastructure, larger-scale external storage workflows, or storage patterns already built around Cloudflare.

**How do access keys work?**

Access keys are identifiers you attach to a file, such as a user ID, org ID, or tenant ID. Your app decides which access keys to assign and which authenticated users are allowed to resolve or use them.

**Do I need the HTTP router?**

No. The HTTP routes are optional. You can use the component entirely through your own wrapped Convex functions if that fits your app architecture better.

## Resources

- [npm package](https://www.npmjs.com/package/@gilhrpenner/convex-files-control)
- [GitHub repository](https://github.com/gilhrpenner/convex-files-control)
- [Convex Components Directory](https://www.convex.dev/components/gilhrpenner/convex-files-control)
- [Convex documentation](https://docs.convex.dev)