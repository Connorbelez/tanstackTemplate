import { createFileRoute } from "@tanstack/react-router";
import { AmpsRulesPage } from "./-rules";

export const Route = createFileRoute("/demo/amps/rules")({
	component: AmpsRulesPage,
});
