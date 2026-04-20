import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

export const Route = createFileRoute("/broker/")({
	component: BrokerWorkspaceIndexRoute,
});

function BrokerWorkspaceIndexRoute() {
	return (
		<div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
			<Card>
				<CardHeader>
					<CardTitle>Broker Workspace</CardTitle>
					<CardDescription>
						Broker deal routes are now available for explicit deal-private
						access. Open a linked deal from workflow context or notifications to
						view package details and signed archives.
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}
