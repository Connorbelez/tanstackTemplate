import { createFileRoute } from "@tanstack/react-router";
import { AmpsCollectionAttemptsPage } from "./-collection-attempts";

export const Route = createFileRoute("/demo/amps/collection-attempts")({
	component: AmpsCollectionAttemptsPage,
});
