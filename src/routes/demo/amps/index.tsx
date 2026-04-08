import { createFileRoute } from "@tanstack/react-router";
import { AmpsOverviewPage } from "./-index";

export const Route = createFileRoute("/demo/amps/")({
	component: AmpsOverviewPage,
});
