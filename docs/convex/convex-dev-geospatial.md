---
name: convex-dev-geospatial
description: Store and query geospatial points with efficient rectangle queries, filters, and sort keys on top of Convex. Use when working with maps, nearby search, coordinates, geospatial indexing.
---

# Geospatial

## Instructions

Geospatial is a Convex component that provides an efficient geospatial index for storing and querying points on the Earth's surface inside Convex.

### Installation

```bash
bun add @convex-dev/geospatial
```

Add the component to your Convex app in `convex/convex.config.ts`:

```ts
import geospatial from "@convex-dev/geospatial/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(geospatial);

export default app;
```

### Capabilities

- Store points with latitude and longitude in a dedicated geospatial index
- Query points efficiently within a geographic area
- Filter results with equality and `IN`-style filter keys
- Control result ordering with an optional sort key
- Keep geospatial data reactive and consistent with the rest of your Convex app
- Support location-aware product features without scanning full tables

## Examples

### how to create a geospatial index in Convex

Create a shared `GeospatialIndex` instance and point it at `components.geospatial`:

```ts
import { GeospatialIndex } from "@convex-dev/geospatial";
import { components } from "./_generated/api";

export const geospatial = new GeospatialIndex(components.geospatial);
```

This is the starting point for storing and querying location data from your own Convex functions.

### how to insert and remove geospatial points in Convex

Use the index from your mutations when records with physical locations are created, updated, or deleted.

```ts
import { mutation } from "./_generated/server";
import { geospatial } from "./geospatialIndex";

export const addMuseum = mutation({
  handler: async (ctx) => {
    const museumId = await ctx.db.insert("museums", {
      name: "American Museum of Natural History",
    });

    await geospatial.insert(
      ctx,
      museumId,
      {
        latitude: 40.7813,
        longitude: -73.9737,
      },
      { category: "museum" },
      28,
    );

    return museumId;
  },
});
```

You can later remove or refresh the indexed point whenever the source record changes.

### how to add filter keys and sort keys to geospatial results

The component supports extra indexed metadata for filtering and ordering.

Typical uses include:

- filtering by category like `restaurant`, `museum`, or `school`
- filtering by tenant or region
- sorting by price, popularity, score, or created time

This is useful when you need location-aware search with product-specific constraints rather than just raw coordinates.

### how to model typed geospatial keys in Convex

If you want stronger type safety, provide type arguments for the stored key and filter shape.

```ts
import { GeospatialIndex } from "@convex-dev/geospatial";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";

export const geospatial = new GeospatialIndex<
  Id<"museums">,
  { category: string; city?: string }
>(components.geospatial);
```

This improves autocomplete and makes it easier to keep filters aligned with your app’s data model.

### when to use geospatial indexing in this codebase

Use this component when you need features such as:

- nearby properties or listings
- branch, ATM, or office locators
- map search with category filters
- geofenced inventory or service areas
- location-aware ranking or discovery flows

Prefer this over ad hoc coordinate filtering in application code when the dataset is large enough that full scans would become expensive.

## Troubleshooting

**When should I use Geospatial instead of a normal table index?**

Use Geospatial when the query is fundamentally based on latitude and longitude. A normal index is good for exact matches and ordered field queries, but it is not designed for efficient geographic area searches.

**What should I use as the geospatial key?**

Usually the key should be the ID of the related document in one of your tables, such as an `Id<"properties">` or `Id<"locations">`. That makes it easy to connect geospatial results back to your main records.

**How should I keep the geospatial index in sync with my tables?**

Update the geospatial index from the same mutations that create, update, or delete the underlying records. Treat the index as a denormalized structure that should stay aligned with your source-of-truth tables.

**What should go in filter keys versus sort key?**

Put exact-match filtering data in `filterKeys`, such as category, tenant, or status. Put the value you want ordered results by in the `sortKey`, such as price or score.

**Can I use this for “near me” features?**

Yes. This component is a strong fit for nearby search, map features, and bounded geographic queries where you need more than exact coordinate equality.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/geospatial)
- [GitHub repository](https://github.com/get-convex/geospatial)
- [Convex Components Directory](https://www.convex.dev/components/geospatial)
- [Convex documentation](https://docs.convex.dev)