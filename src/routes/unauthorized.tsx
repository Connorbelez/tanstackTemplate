import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Home, ShieldAlert } from "lucide-react";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/unauthorized")({
	component: UnauthorizedPage,
});

function UnauthorizedPage() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
			<div className="w-full max-w-md text-center">
				<div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/5">
					<ShieldAlert className="size-8 text-amber-600 dark:text-amber-400" />
				</div>
				<h1 className="mb-2 font-bold text-2xl tracking-tight">
					Access Denied
				</h1>
				<p className="mb-8 text-[var(--sea-ink-soft)]">
					You don't have permission to view this page. Contact your
					administrator if you believe this is an error.
				</p>
				<div className="flex justify-center gap-3">
					<Button asChild size="sm" variant="default">
						<Link to="/">
							<Home className="size-3.5" />
							Go Home
						</Link>
					</Button>
					<Button
						onClick={() => window.history.back()}
						size="sm"
						variant="outline"
					>
						<ArrowLeft className="size-3.5" />
						Go Back
					</Button>
				</div>
			</div>
		</div>
	);
}
