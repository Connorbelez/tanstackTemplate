import { createFileRoute } from "@tanstack/react-router";
import { MortgagePaymentsWorkspacePage } from "./-mortgages.$mortgageId.payments";

export const Route = createFileRoute(
	"/demo/amps/mortgages/$mortgageId/payments"
)({
	component: MortgagePaymentsWorkspacePage,
});
