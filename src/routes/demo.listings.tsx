import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/listings")({
	ssr: false,
	component: ListingsDemo,
});

function ListingsDemo() {
	return (
		<section
			className="flex min-h-[calc(100vh-4rem)] w-full flex-col"
			data-testid="listings-page"
		>
			<Outlet />
		</section>
	);
}
