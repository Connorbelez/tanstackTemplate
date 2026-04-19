import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { RotessaReconciliationPage } from "#/components/admin/payments/RotessaReconciliationPage";
import { guardRouteAccess } from "#/lib/auth";
import { api } from "../../../convex/_generated/api";

const rotessaReconciliationQueryOptions = convexQuery(
	api.admin.origination.collections.getRotessaReconciliationSnapshot,
	{}
);

export const Route = createFileRoute("/admin/rotessa-reconciliation")({
	beforeLoad: guardRouteAccess("adminRotessaReconciliation"),
	component: RotessaReconciliationRoutePage,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			rotessaReconciliationQueryOptions
		);
	},
});

function RotessaReconciliationRoutePage() {
	const { data, refetch } = useSuspenseQuery(rotessaReconciliationQueryOptions);
	const syncNow = useAction(
		api.admin.origination.collections.syncRotessaReadModelNow
	);
	const linkCustomerToBorrower = useMutation(
		api.admin.origination.collections.linkRotessaCustomerToBorrower
	);
	const createBorrowerFromCustomer = useAction(
		api.admin.origination.collections.createBorrowerFromRotessaCustomer
	);
	const suppressItem = useMutation(
		api.admin.origination.collections.suppressRotessaReconciliationItem
	);

	return (
		<RotessaReconciliationPage
			createBorrowerFromCustomer={createBorrowerFromCustomer}
			linkCustomerToBorrower={linkCustomerToBorrower}
			onRefresh={async () => refetch()}
			snapshot={data}
			suppressItem={suppressItem}
			syncNow={syncNow}
		/>
	);
}
