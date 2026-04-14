import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FinancialLedgerPage } from "#/components/admin/financial-ledger/financial-ledger-page";
import { parseFinancialLedgerSearch } from "#/components/admin/financial-ledger/search";
import type { FinancialLedgerSearchState } from "#/components/admin/financial-ledger/types";
import { api } from "../../../convex/_generated/api";

const financialLedgerQueryOptions = convexQuery(
	api.payments.adminDashboard.queries.getFinancialLedgerDashboardSnapshot,
	{}
);

const paymentOperationsQueryOptions = convexQuery(
	api.payments.adminDashboard.queries.getPaymentOperationsDashboardSnapshot,
	{}
);

export const Route = createFileRoute("/admin/financial-ledger")({
	component: FinancialLedgerRoutePage,
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(financialLedgerQueryOptions),
			context.queryClient.ensureQueryData(paymentOperationsQueryOptions),
		]);
	},
	validateSearch: (search: Record<string, unknown>) =>
		parseFinancialLedgerSearch(search),
});

function FinancialLedgerRoutePage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const { data: financialSnapshot, refetch: refetchFinancialSnapshot } =
		useSuspenseQuery(financialLedgerQueryOptions);
	const { data: paymentOperationsSnapshot, refetch: refetchPaymentOperations } =
		useSuspenseQuery(paymentOperationsQueryOptions);

	return (
		<FinancialLedgerPage
			onRefresh={async () =>
				Promise.all([refetchFinancialSnapshot(), refetchPaymentOperations()])
			}
			paymentOperationsSnapshot={paymentOperationsSnapshot}
			search={search}
			setSearch={(updater) =>
				void navigate({
					search: (current) => updater(current as FinancialLedgerSearchState),
					to: "/admin/financial-ledger",
				})
			}
			snapshot={financialSnapshot}
		/>
	);
}
