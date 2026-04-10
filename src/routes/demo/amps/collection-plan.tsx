import { createFileRoute } from "@tanstack/react-router";
import { AmpsCollectionPlanPage } from "./-collection-plan";

export const Route = createFileRoute("/demo/amps/collection-plan")({
	component: AmpsCollectionPlanPage,
});
