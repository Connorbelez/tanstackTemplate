import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PaymentOperationsPage } from "#/components/admin/financial-ledger/payment-operations-page";
import { parsePaymentOperationsSearch } from "#/components/admin/financial-ledger/search";
import type { PaymentOperationsSearchState } from "#/components/admin/financial-ledger/types";
import { api } from "../../../convex/_generated/api";

const paymentOperationsQueryOptions = convexQuery(
	api.payments.adminDashboard.queries.getPaymentOperationsDashboardSnapshot,
	{}
);

export const Route = createFileRoute("/admin/payment-operations")({
	component: PaymentOperationsRoutePage,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(paymentOperationsQueryOptions);
	},
	validateSearch: (search: Record<string, unknown>) =>
		parsePaymentOperationsSearch(search),
});

function PaymentOperationsRoutePage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const { data, refetch } = useSuspenseQuery(paymentOperationsQueryOptions);

	return (
		<PaymentOperationsPage
			onRefresh={async () => refetch()}
			search={search}
			setSearch={(updater) =>
				void navigate({
					search: (current) => updater(current as PaymentOperationsSearchState),
					to: "/admin/payment-operations",
				})
			}
			snapshot={data}
		/>
	);
}
