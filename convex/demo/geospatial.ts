import { GeospatialIndex } from "@convex-dev/geospatial";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { authedMutation, authedQuery } from "../fluent";

const geo = new GeospatialIndex<
	Id<"demo_geospatial_places">,
	{ category: string }
>(components.geospatial);

export const addPlace = authedMutation
	.input({
		name: v.string(),
		latitude: v.number(),
		longitude: v.number(),
		category: v.string(),
	})
	.handler(async (ctx, args) => {
		const id = await ctx.db.insert("demo_geospatial_places", {
			name: args.name,
			latitude: args.latitude,
			longitude: args.longitude,
			category: args.category,
		});
		await geo.insert(
			ctx,
			id,
			{ latitude: args.latitude, longitude: args.longitude },
			{ category: args.category },
			0
		);
		return id;
	})
	.public();

export const removePlace = authedMutation
	.input({ id: v.id("demo_geospatial_places") })
	.handler(async (ctx, args) => {
		const doc = await ctx.db.get(args.id);
		if (!doc) {
			throw new Error("Place not found");
		}
		await geo.remove(ctx, args.id);
		await ctx.db.delete(args.id);
	})
	.public();

export const listPlaces = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_geospatial_places").order("desc").take(50);
	})
	.public();

export const searchArea = authedQuery
	.input({
		west: v.number(),
		south: v.number(),
		east: v.number(),
		north: v.number(),
	})
	.handler(async (ctx, args) => {
		const results = await geo.query(ctx, {
			shape: {
				type: "rectangle",
				rectangle: {
					west: args.west,
					south: args.south,
					east: args.east,
					north: args.north,
				},
			},
			limit: 50,
		});
		return results;
	})
	.public();

export const seedPlaces = authedMutation
	.handler(async (ctx) => {
		const existing = await ctx.db.query("demo_geospatial_places").take(1);
		if (existing.length > 0) {
			return { seeded: 0 };
		}

		const places = [
			{
				name: "Central Park",
				latitude: 40.7829,
				longitude: -73.9654,
				category: "park",
			},
			{
				name: "Golden Gate Bridge",
				latitude: 37.8199,
				longitude: -122.4783,
				category: "landmark",
			},
			{
				name: "Space Needle",
				latitude: 47.6205,
				longitude: -122.3493,
				category: "landmark",
			},
			{
				name: "Lincoln Memorial",
				latitude: 38.8893,
				longitude: -77.0502,
				category: "monument",
			},
			{
				name: "Millennium Park",
				latitude: 41.8826,
				longitude: -87.6226,
				category: "park",
			},
			{
				name: "Venice Beach",
				latitude: 33.985,
				longitude: -118.4695,
				category: "beach",
			},
			{
				name: "French Quarter",
				latitude: 29.9584,
				longitude: -90.0644,
				category: "district",
			},
			{
				name: "Freedom Trail",
				latitude: 42.3554,
				longitude: -71.0603,
				category: "landmark",
			},
		];

		for (const place of places) {
			const id = await ctx.db.insert("demo_geospatial_places", place);
			await geo.insert(
				ctx,
				id,
				{ latitude: place.latitude, longitude: place.longitude },
				{ category: place.category },
				0
			);
		}
		return { seeded: places.length };
	})
	.public();
