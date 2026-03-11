import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Globe, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-geospatial")({
	ssr: false,
	component: GeospatialDemo,
});

function GeospatialDemo() {
	const places = useQuery(api.demo.geospatial.listPlaces);
	const seedPlaces = useMutation(api.demo.geospatial.seedPlaces);
	const addPlace = useMutation(api.demo.geospatial.addPlace);
	const removePlace = useMutation(api.demo.geospatial.removePlace);

	const [name, setName] = useState("");
	const [lat, setLat] = useState("");
	const [lng, setLng] = useState("");
	const [category, setCategory] = useState("landmark");

	// Search bounds
	const [bounds, setBounds] = useState({
		west: "-125",
		south: "25",
		east: "-66",
		north: "50",
	});
	const searchResults = useQuery(api.demo.geospatial.searchArea, {
		west: Number(bounds.west),
		south: Number(bounds.south),
		east: Number(bounds.east),
		north: Number(bounds.north),
	});

	const handleAdd = useCallback(async () => {
		if (!(name.trim() && lat && lng)) {
			return;
		}
		await addPlace({
			name: name.trim(),
			latitude: Number(lat),
			longitude: Number(lng),
			category,
		});
		setName("");
		setLat("");
		setLng("");
	}, [addPlace, name, lat, lng, category]);

	return (
		<DemoLayout
			description="Store and query geospatial points with efficient rectangle queries, filters, and sort keys."
			docsHref="https://www.convex.dev/components/geospatial"
			title="Geospatial"
		>
			<div className="space-y-6">
				{/* Seed / Add */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Globe className="size-4" />
							Places
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Button
							disabled={places && places.length > 0}
							onClick={() => seedPlaces()}
							variant="outline"
						>
							Seed Sample Places
						</Button>
						<div className="flex flex-wrap gap-2">
							<Input
								className="w-40"
								onChange={(e) => setName(e.target.value)}
								placeholder="Name"
								value={name}
							/>
							<Input
								className="w-24"
								onChange={(e) => setLat(e.target.value)}
								placeholder="Lat"
								type="number"
								value={lat}
							/>
							<Input
								className="w-24"
								onChange={(e) => setLng(e.target.value)}
								placeholder="Lng"
								type="number"
								value={lng}
							/>
							<select
								className="rounded-md border px-2 py-1 text-sm"
								onChange={(e) => setCategory(e.target.value)}
								value={category}
							>
								<option value="landmark">Landmark</option>
								<option value="park">Park</option>
								<option value="beach">Beach</option>
								<option value="monument">Monument</option>
								<option value="district">District</option>
							</select>
							<Button
								disabled={!(name.trim() && lat && lng)}
								onClick={handleAdd}
							>
								<Plus className="mr-1 size-4" />
								Add
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Bounding box search */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Search className="size-4" />
							Rectangle Search
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex flex-wrap gap-2">
							{(["west", "south", "east", "north"] as const).map((key) => (
								<div className="flex items-center gap-1" key={key}>
									<span className="text-muted-foreground text-xs capitalize">
										{key}
									</span>
									<Input
										className="w-20"
										onChange={(e) =>
											setBounds((b) => ({ ...b, [key]: e.target.value }))
										}
										type="number"
										value={bounds[key]}
									/>
								</div>
							))}
						</div>
						<p className="text-muted-foreground text-sm">
							Found: <strong>{searchResults?.results?.length ?? 0}</strong>{" "}
							points in bounding box
						</p>
					</CardContent>
				</Card>

				{/* Place list */}
				{places && places.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								All Places ({places.length})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{places.map((place) => (
									<div
										className="flex items-center gap-3 rounded-md border p-3"
										key={place._id}
									>
										<MapPin className="size-4 shrink-0 text-red-500" />
										<div className="min-w-0 flex-1">
											<p className="font-medium">{place.name}</p>
											<p className="font-mono text-muted-foreground text-xs">
												{place.latitude.toFixed(4)},{" "}
												{place.longitude.toFixed(4)}
											</p>
										</div>
										<Badge variant="outline">{place.category}</Badge>
										<Button
											onClick={() => removePlace({ id: place._id })}
											size="icon"
											variant="ghost"
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</DemoLayout>
	);
}
