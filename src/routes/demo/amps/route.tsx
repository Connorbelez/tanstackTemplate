import { createFileRoute } from "@tanstack/react-router";
import { AmpsDemoLayout } from "./-route";

export const Route = createFileRoute("/demo/amps")({
	ssr: false,
	component: AmpsDemoLayout,
});
