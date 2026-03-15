import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	DOMAIN_COLORS,
	DOMAIN_LABELS,
	PERMISSION_DISPLAY_METADATA,
	ROLE_COLOR_CLASSES,
	ROLE_DISPLAY_METADATA,
} from "#/lib/rbac-display-metadata";
import { ROLE_PERMISSIONS } from "#/test/auth/permissions";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac-auth/roles")({
	ssr: false,
	component: RolesPage,
});

const ROLE_ORDER = [
	"admin",
	"broker",
	"lender",
	"borrower",
	"lawyer",
	"jr_underwriter",
	"underwriter",
	"sr_underwriter",
	"member",
];

const UW_ROLES = ["jr_underwriter", "underwriter", "sr_underwriter"] as const;

function RolesPage() {
	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const viewer = useQuery(api.fluent.whoAmI);

	const selectedPermissions = useMemo(() => {
		if (!selectedRole) {
			return [];
		}
		const perms = ROLE_PERMISSIONS[selectedRole] ?? [];
		// Group by domain
		const grouped: Record<string, string[]> = {};
		for (const slug of perms) {
			const meta = PERMISSION_DISPLAY_METADATA[slug];
			const domain = meta?.domain ?? "other";
			if (!grouped[domain]) {
				grouped[domain] = [];
			}
			grouped[domain].push(slug);
		}
		return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
	}, [selectedRole]);

	return (
		<div className="space-y-6">
			{/* Role Cards Grid */}
			<div>
				<h2 className="mb-3 font-semibold text-lg">
					Platform Roles ({ROLE_ORDER.length})
				</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{ROLE_ORDER.map((slug) => {
						const meta = ROLE_DISPLAY_METADATA[slug];
						if (!meta) {
							return null;
						}
						const colors = ROLE_COLOR_CLASSES[meta.color];
						const permCount = ROLE_PERMISSIONS[slug]?.length ?? 0;
						const isSelected = selectedRole === slug;
						const isViewerRole = viewer?.role === slug;

						return (
							<button
								className={`rounded-lg border p-4 text-left transition-all ${
									isSelected
										? `ring-2 ring-primary ${colors?.bg ?? ""} ${colors?.border ?? ""}`
										: `hover:shadow-sm ${colors?.border ?? "border-border"}`
								}`}
								key={slug}
								onClick={() => setSelectedRole(isSelected ? null : slug)}
								type="button"
							>
								<div className="flex items-start justify-between">
									<div>
										<div className="flex items-center gap-2">
											<span className="font-semibold">{meta.label}</span>
											{isViewerRole && (
												<Badge className="text-xs" variant="secondary">
													You
												</Badge>
											)}
										</div>
										<p className="mt-1 text-muted-foreground text-xs">
											{meta.description}
										</p>
									</div>
									<ChevronRight
										className={`size-4 text-muted-foreground transition-transform ${
											isSelected ? "rotate-90" : ""
										}`}
									/>
								</div>
								<div className="mt-3">
									<Badge className={colors?.badge} variant="outline">
										{permCount} permission{permCount !== 1 ? "s" : ""}
									</Badge>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{/* Selected Role Detail */}
			{selectedRole && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							{ROLE_DISPLAY_METADATA[selectedRole]?.label} — Permissions
						</CardTitle>
						<CardDescription>
							Grouped by domain. {ROLE_PERMISSIONS[selectedRole]?.length} total
							permissions.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{selectedPermissions.map(([domain, slugs]) => {
								const domainColor = DOMAIN_COLORS[domain];
								return (
									<div key={domain}>
										<h4 className="mb-2 font-medium text-sm">
											{DOMAIN_LABELS[domain] ?? domain}
										</h4>
										<div className="flex flex-wrap gap-2">
											{slugs.map((slug) => {
												const pMeta = PERMISSION_DISPLAY_METADATA[slug];
												return (
													<span
														className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${
															domainColor
																? `${domainColor.bg} ${domainColor.text}`
																: "bg-muted text-muted-foreground"
														}`}
														key={slug}
														title={pMeta?.description ?? slug}
													>
														{pMeta?.name ?? slug}
													</span>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Underwriter Hierarchy */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Underwriter Hierarchy</CardTitle>
					<CardDescription>
						Progressive permission unlocks from Junior → Mid → Senior
					</CardDescription>
				</CardHeader>
				<CardContent>
					<UnderwriterHierarchy />
				</CardContent>
			</Card>
		</div>
	);
}

function UnderwriterHierarchy() {
	const uwPermSets = UW_ROLES.map((role) => ({
		role,
		meta: ROLE_DISPLAY_METADATA[role],
		perms: new Set(ROLE_PERMISSIONS[role] ?? []),
	}));

	// Shared = intersection of all three
	const shared = [...uwPermSets[0].perms].filter(
		(p) => uwPermSets[1].perms.has(p) && uwPermSets[2].perms.has(p)
	);

	return (
		<div className="space-y-4">
			{/* Shared permissions */}
			<div>
				<h4 className="mb-2 font-medium text-muted-foreground text-sm">
					Shared by all underwriters ({shared.length})
				</h4>
				<div className="flex flex-wrap gap-1.5">
					{shared.map((slug) => (
						<span
							className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs"
							key={slug}
						>
							{PERMISSION_DISPLAY_METADATA[slug]?.name ?? slug}
						</span>
					))}
				</div>
			</div>

			{/* Per-tier unique permissions */}
			<div className="grid gap-4 md:grid-cols-3">
				{uwPermSets.map(({ role, meta, perms }) => {
					const unique = [...perms].filter((p) => !shared.includes(p));
					const colors = meta ? ROLE_COLOR_CLASSES[meta.color] : undefined;
					return (
						<div
							className={`rounded-lg border p-3 ${colors?.bg ?? ""} ${colors?.border ?? ""}`}
							key={role}
						>
							<h4 className="font-semibold text-sm">{meta?.label ?? role}</h4>
							<p className="mb-2 text-muted-foreground text-xs">
								+{unique.length} unique permission
								{unique.length !== 1 ? "s" : ""}
							</p>
							<div className="flex flex-wrap gap-1.5">
								{unique.length > 0 ? (
									unique.map((slug) => (
										<span
											className={`rounded-full border px-2 py-0.5 text-xs ${colors?.badge ?? "bg-muted"}`}
											key={slug}
										>
											{PERMISSION_DISPLAY_METADATA[slug]?.name ?? slug}
										</span>
									))
								) : (
									<span className="text-muted-foreground text-xs italic">
										No unique permissions
									</span>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
