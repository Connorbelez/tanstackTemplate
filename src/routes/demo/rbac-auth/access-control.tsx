import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { hasPermission, ISLAND_PERMISSIONS } from "#/lib/auth";
import {
	DOMAIN_COLORS,
	DOMAIN_LABELS,
	PERMISSION_DISPLAY_METADATA,
	ROLE_COLOR_CLASSES,
	ROLE_DISPLAY_METADATA,
} from "#/lib/rbac-display-metadata";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac-auth/access-control")({
	ssr: false,
	component: AccessControlPage,
});

const ISLANDS = [
	{
		name: "Admin Dashboard",
		key: "admin" as const,
		description: "System management, user admin, platform configuration",
	},
	{
		name: "Broker Portal",
		key: "broker" as const,
		description: "Application creation, offer management, mortgage servicing",
	},
	{
		name: "Borrower Portal",
		key: "borrower" as const,
		description: "Mortgage view, payment management, document signing",
	},
	{
		name: "Lender Portal",
		key: "lender" as const,
		description: "Marketplace listings, portfolio management, investments",
	},
	{
		name: "Underwriting Suite",
		key: "underwriter" as const,
		description: "Underwriting queue, decision engine, team metrics",
	},
	{
		name: "Lawyer Portal",
		key: "lawyer" as const,
		description: "Deal review, legal oversight, transaction review",
	},
] as const;

const MIDDLEWARE_STEPS = [
	{
		name: "authMiddleware",
		description:
			"Extracts JWT identity, builds Viewer with roles & permissions",
		color: "text-green-600",
	},
	{
		name: "requireOrgContext",
		description: "Ensures user has an active organization membership",
		color: "text-blue-600",
	},
	{
		name: "requirePermission",
		description: "Checks viewer's permission set for the required permission",
		color: "text-purple-600",
	},
];

function AccessControlPage() {
	const viewer = useQuery(api.fluent.whoAmI);

	const roleMeta = viewer?.role
		? ROLE_DISPLAY_METADATA[viewer.role]
		: undefined;
	const roleColors = roleMeta ? ROLE_COLOR_CLASSES[roleMeta.color] : undefined;

	// Group viewer's permissions by domain
	const permissionsByDomain: Record<string, string[]> = {};
	for (const perm of viewer?.permissions ?? []) {
		const meta = PERMISSION_DISPLAY_METADATA[perm];
		const domain = meta?.domain ?? "other";
		if (!permissionsByDomain[domain]) {
			permissionsByDomain[domain] = [];
		}
		permissionsByDomain[domain].push(perm);
	}

	return (
		<div className="space-y-6">
			{/* Current Identity */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Your Identity</CardTitle>
					<CardDescription>How the system sees you right now</CardDescription>
				</CardHeader>
				<CardContent>
					{viewer ? (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center gap-4">
								<div>
									<p className="font-medium">
										{viewer.firstName} {viewer.lastName}
									</p>
									<p className="text-muted-foreground text-sm">
										{viewer.orgName ?? "No organization"}
									</p>
								</div>
								{roleMeta && roleColors && (
									<Badge className={roleColors.badge} variant="outline">
										{roleMeta.label}
									</Badge>
								)}
							</div>

							<div className="space-y-2">
								{Object.entries(permissionsByDomain)
									.sort(([a], [b]) => a.localeCompare(b))
									.map(([domain, perms]) => {
										const dc = DOMAIN_COLORS[domain];
										return (
											<div key={domain}>
												<span className="font-medium text-muted-foreground text-xs">
													{DOMAIN_LABELS[domain] ?? domain}
												</span>
												<div className="mt-1 flex flex-wrap gap-1.5">
													{perms.map((slug) => (
														<span
															className={`rounded-full border px-2 py-0.5 text-xs ${
																dc
																	? `${dc.bg} ${dc.text}`
																	: "bg-muted text-muted-foreground"
															}`}
															key={slug}
														>
															{PERMISSION_DISPLAY_METADATA[slug]?.name ?? slug}
														</span>
													))}
												</div>
											</div>
										);
									})}
							</div>
						</div>
					) : (
						<p className="text-muted-foreground text-sm">Loading identity...</p>
					)}
				</CardContent>
			</Card>

			{/* Access Control Matrix */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Access Control Matrix</CardTitle>
					<CardDescription>
						Which application islands you can access based on your current
						permissions
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{ISLANDS.map((island) => {
							const requiredPerm = ISLAND_PERMISSIONS[island.key];
							const hasAccess = hasPermission(
								viewer?.permissions ?? [],
								requiredPerm
							);

							return (
								<div
									className={`flex items-center justify-between rounded-lg border p-3 ${
										hasAccess
											? "border-green-200 bg-green-50"
											: "border-red-100 bg-red-50/50"
									}`}
									key={island.key}
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm">{island.name}</span>
											{hasAccess ? (
												<CheckCircle2 className="size-4 text-green-600" />
											) : (
												<XCircle className="size-4 text-red-500" />
											)}
										</div>
										<p className="text-muted-foreground text-xs">
											{island.description}
										</p>
									</div>
									<div className="ml-4 shrink-0 text-right">
										{hasAccess ? (
											<span className="font-medium text-green-700 text-xs">
												Access granted
											</span>
										) : (
											<span className="text-red-600 text-xs">
												Requires{" "}
												<code className="rounded bg-red-100 px-1">
													{requiredPerm}
												</code>
											</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>

			{/* Middleware Pipeline */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Middleware Pipeline</CardTitle>
					<CardDescription>
						Every protected API call passes through this chain before executing
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
						{MIDDLEWARE_STEPS.map((step, i) => (
							<div className="flex items-center" key={step.name}>
								<div className="rounded-lg border bg-background p-3">
									<p
										className={`font-mono font-semibold text-sm ${step.color}`}
									>
										{step.name}
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										{step.description}
									</p>
								</div>
								{i < MIDDLEWARE_STEPS.length - 1 && (
									<ArrowRight className="mx-2 hidden size-4 shrink-0 text-muted-foreground sm:block" />
								)}
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Denial Behavior */}
			<Card className="border-amber-200 bg-amber-50">
				<CardContent className="flex items-start gap-3 pt-6">
					<ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
					<div>
						<p className="font-semibold text-sm">What happens on denial?</p>
						<p className="mt-1 text-muted-foreground text-sm">
							Backend returns{" "}
							<code className="rounded bg-amber-100 px-1 text-amber-800">
								ConvexError("Forbidden")
							</code>
							, the attempt is audit-logged with the viewer's identity and the
							required permission, and the frontend redirects to{" "}
							<code className="rounded bg-amber-100 px-1 text-amber-800">
								/unauthorized
							</code>
							.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
