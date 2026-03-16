import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	Building2,
	Clock,
	Eye,
	KeyRound,
	Lock,
	Shield,
	ShieldCheck,
	Users,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { useAppAuth } from "#/hooks/use-app-auth";
import {
	ROLE_COLOR_CLASSES,
	ROLE_DISPLAY_METADATA,
} from "#/lib/rbac-display-metadata";
import { ROLE_PERMISSIONS } from "#/test/auth/permissions";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac-auth/")({
	ssr: false,
	component: SecurityOverview,
});

const TOTAL_PERMISSIONS = Object.keys(
	// Count unique permission slugs across all roles
	Object.values(ROLE_PERMISSIONS)
		.flat()
		.reduce<Record<string, true>>((acc, p) => {
			acc[p] = true;
			return acc;
		}, {})
).length;

const PII_FIELDS = [
	"email",
	"phone",
	"ssn",
	"password",
	"phoneNumber",
	"borrowerEmail",
	"borrowerPhone",
	"borrowerSsn",
];

function SecurityOverview() {
	const stats = useQuery(api.demo.rbacAuth.getSecurityOverviewStats);
	const viewer = useQuery(api.fluent.whoAmI);
	const auth = useAppAuth();

	const roleMeta = viewer?.role
		? ROLE_DISPLAY_METADATA[viewer.role]
		: undefined;
	const roleColors = roleMeta ? ROLE_COLOR_CLASSES[roleMeta.color] : undefined;

	return (
		<div className="space-y-6">
			{/* Stat Cards */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<StatCard
					icon={<Shield className="size-5 text-blue-600" />}
					label="Roles Defined"
					loading={!stats}
					value={stats?.roleCount ?? "—"}
				/>
				<StatCard
					icon={<KeyRound className="size-5 text-indigo-600" />}
					label="Permissions Managed"
					loading={false}
					value={TOTAL_PERMISSIONS}
				/>
				<StatCard
					icon={<Users className="size-5 text-green-600" />}
					label="Active Users"
					loading={!stats}
					value={stats?.userCount ?? "—"}
				/>
				<StatCard
					icon={<Building2 className="size-5 text-purple-600" />}
					label="Organizations"
					loading={!stats}
					value={stats?.orgCount ?? "—"}
				/>
				<StatCard
					icon={<Clock className="size-5 text-amber-600" />}
					label="Pending Approvals"
					loading={!stats}
					value={stats?.pendingRequestCount ?? "—"}
				/>
				<StatCard
					icon={<Lock className="size-5 text-red-600" />}
					label="PII Fields Protected"
					loading={false}
					value={PII_FIELDS.length}
				/>
			</div>

			{/* Three Layers of Security */}
			<div>
				<h2 className="mb-3 font-semibold text-lg">Three Layers of Security</h2>
				<div className="grid gap-4 md:grid-cols-3">
					<SecurityLayerCard
						color="green"
						description="Every API call verified with zero database lookups"
						icon={<ShieldCheck className="size-6 text-green-600" />}
						title="JWT-Based Access"
					/>
					<SecurityLayerCard
						color="blue"
						description="Users only access resources they own or are assigned to"
						icon={<Lock className="size-6 text-blue-600" />}
						title="Resource Ownership"
					/>
					<SecurityLayerCard
						color="purple"
						description="Frontend routes gated before any page renders"
						icon={<Eye className="size-6 text-purple-600" />}
						title="Route Guards"
					/>
				</div>
			</div>

			{/* Current Session */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Your Current Session</CardTitle>
					<CardDescription>
						Live view of your authenticated identity
					</CardDescription>
				</CardHeader>
				<CardContent>
					{viewer ? (
						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
									{(viewer.firstName?.[0] ?? "").toUpperCase()}
									{(viewer.lastName?.[0] ?? "").toUpperCase()}
								</div>
								<div>
									<p className="font-medium">
										{viewer.firstName} {viewer.lastName}
									</p>
									<p className="text-muted-foreground text-sm">
										{viewer.orgName ?? "No organization"}
									</p>
								</div>
							</div>

							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-sm">Role:</span>
									{roleMeta && roleColors ? (
										<Badge className={roleColors.badge} variant="outline">
											{roleMeta.label}
										</Badge>
									) : (
										<Badge variant="secondary">{viewer.role ?? "none"}</Badge>
									)}
								</div>
								<p className="text-muted-foreground text-sm">
									You have{" "}
									<span className="font-semibold text-foreground">
										{viewer.permissions.length}
									</span>{" "}
									of {TOTAL_PERMISSIONS} permissions
								</p>
							</div>
						</div>
					) : (
						<SessionFallback loading={auth.loading} />
					)}
				</CardContent>
			</Card>
		</div>
	);
}

// ── Sub-components ──────────────────────────────────────────────────

function StatCard({
	icon,
	label,
	value,
	loading,
}: {
	icon: React.ReactNode;
	label: string;
	loading: boolean;
	value: number | string;
}) {
	return (
		<Card>
			<CardContent className="flex items-center gap-4 pt-6">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
					{icon}
				</div>
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-bold text-2xl">
						{loading ? (
							<span className="inline-block h-7 w-8 animate-pulse rounded bg-muted" />
						) : (
							value
						)}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function SessionFallback({ loading }: { loading: boolean }) {
	if (loading) {
		return <p className="text-muted-foreground text-sm">Loading session...</p>;
	}
	return <p className="text-muted-foreground text-sm">Not authenticated</p>;
}

function SecurityLayerCard({
	icon,
	title,
	description,
	color,
}: {
	color: string;
	description: string;
	icon: React.ReactNode;
	title: string;
}) {
	const colorMap: Record<string, { bg: string; border: string }> = {
		green: { border: "border-green-200", bg: "bg-green-50" },
		blue: { border: "border-blue-200", bg: "bg-blue-50" },
		purple: { border: "border-purple-200", bg: "bg-purple-50" },
	};
	const { border: borderColor, bg: bgColor } =
		colorMap[color] ?? colorMap.purple;

	return (
		<Card className={`${borderColor} ${bgColor}`}>
			<CardContent className="pt-6">
				<div className="mb-3">{icon}</div>
				<h3 className="font-semibold">{title}</h3>
				<p className="mt-1 text-muted-foreground text-sm">{description}</p>
			</CardContent>
		</Card>
	);
}
