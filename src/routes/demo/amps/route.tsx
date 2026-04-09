import { createFileRoute } from "@tanstack/react-router";
import { guardFairLendAdmin } from "#/lib/auth";
import { AmpsDemoLayout } from "./-route";

export const Route = createFileRoute("/demo/amps")({
	beforeLoad: guardFairLendAdmin(),
	ssr: false,
	component: AmpsDemoLayout,
});
