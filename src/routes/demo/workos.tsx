import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useAction, useQuery } from "convex/react";
import {
	Building2,
	KeyRound,
	LogOut,
	RefreshCw,
	Shield,
	User as UserIcon,
	Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { buildSignInRedirect } from "#/lib/auth-redirect";
import { isRouterTeardownSignOutError } from "#/lib/workos-auth";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/workos")({
	ssr: false,
	component: WorkOSDemo,
});

function WorkOSDemo() {
	const { user, loading, signOut } = useAuth();

	if (loading) {
		return (
			<DemoLayout
				description="WorkOS AuthKit integration with webhook-synced organizations, roles, and auth action hooks."
				docsHref="https://www.convex.dev/components/workos-authkit"
				title="WorkOS AuthKit"
			>
				<div className="flex items-center justify-center py-12">
					<p className="text-muted-foreground">Loading authentication...</p>
				</div>
			</DemoLayout>
		);
	}

	if (!user) {
		return <UnauthenticatedView />;
	}

	return <AuthenticatedView signOut={signOut} user={user} />;
}

function UnauthenticatedView() {
	const href = useLocation({
		select: (location) => location.href,
	});

	return (
		<DemoLayout
			description="WorkOS AuthKit integration with webhook-synced organizations, roles, and auth action hooks."
			docsHref="https://www.convex.dev/components/workos-authkit"
			title="WorkOS AuthKit"
		>
			<Card>
				<CardHeader className="text-center">
					<Shield className="mx-auto mb-2 size-10 text-muted-foreground" />
					<CardTitle>Sign in to explore</CardTitle>
					<CardDescription>
						Authenticate with WorkOS AuthKit to view your profile,
						organizations, roles, and auth action logs.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex justify-center">
					<Button asChild>
						<Link {...buildSignInRedirect(href)}>Sign In with AuthKit</Link>
					</Button>
				</CardContent>
			</Card>
		</DemoLayout>
	);
}

interface AuthenticatedViewProps {
	signOut: () => Promise<void>;
	user: {
		id: string;
		email: string;
		firstName: string | null;
		lastName: string | null;
		profilePictureUrl: string | null;
	};
}

function AuthenticatedView({ user, signOut }: AuthenticatedViewProps) {
	return (
		<DemoLayout
			description="WorkOS AuthKit integration with webhook-synced organizations, roles, and auth action hooks."
			docsHref="https://www.convex.dev/components/workos-authkit"
			title="WorkOS AuthKit"
		>
			<Tabs defaultValue="profile">
				<TabsList className="w-full">
					<TabsTrigger value="profile">
						<UserIcon className="size-4" />
						Profile
					</TabsTrigger>
					<TabsTrigger value="orgs">
						<Building2 className="size-4" />
						Organizations & Roles
					</TabsTrigger>
					<TabsTrigger value="actions">
						<Zap className="size-4" />
						Auth Actions
					</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-4 space-y-4" value="profile">
					<ProfileTab signOut={signOut} user={user} />
				</TabsContent>

				<TabsContent className="mt-4 space-y-4" value="orgs">
					<OrganizationsTab userId={user.id} />
				</TabsContent>

				<TabsContent className="mt-4 space-y-4" value="actions">
					<ActionsTab />
				</TabsContent>
			</Tabs>
		</DemoLayout>
	);
}

// ── Profile Tab ──────────────────────────────────────────────────────

function ProfileTab({
	user,
	signOut,
}: {
	user: AuthenticatedViewProps["user"];
	signOut: () => Promise<void>;
}) {
	const initials = [user.firstName?.[0], user.lastName?.[0]]
		.filter(Boolean)
		.join("")
		.toUpperCase();

	return (
		<>
			<div className="flex items-center gap-4">
				<Avatar size="lg">
					{user.profilePictureUrl ? (
						<AvatarImage
							alt={`${user.firstName} ${user.lastName}`}
							src={user.profilePictureUrl}
						/>
					) : null}
					<AvatarFallback>{initials || "?"}</AvatarFallback>
				</Avatar>
				<div>
					<p className="font-semibold text-lg">
						{user.firstName} {user.lastName}
					</p>
					<p className="text-muted-foreground text-sm">{user.email}</p>
				</div>
			</div>

			<Separator />

			<div className="grid gap-3 sm:grid-cols-2">
				<InfoCard label="First Name" value={user.firstName ?? "N/A"} />
				<InfoCard label="Last Name" value={user.lastName ?? "N/A"} />
				<InfoCard label="Email" value={user.email} />
				<InfoCard label="User ID" mono value={user.id} />
			</div>

			<Button
				className="w-full"
				onClick={() =>
					signOut().catch((error) => {
						if (isRouterTeardownSignOutError(error)) {
							window.location.href = "/";
							return;
						}
						throw error;
					})
				}
				variant="outline"
			>
				<LogOut className="size-4" />
				Sign Out
			</Button>
		</>
	);
}

function InfoCard({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<Card>
			<CardContent className="p-3">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p
					className={`mt-0.5 truncate text-sm ${mono ? "font-mono text-xs" : ""}`}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

// ── Organizations & Roles Tab ────────────────────────────────────────

function OrganizationsTab({ userId }: { userId: string }) {
	const auth = useAuth();
	const userOrgs = useQuery(api.demo.workosAuth.getUserOrganizations, {
		userWorkosId: userId,
	});
	const allRoles = useQuery(api.demo.workosAuth.listRoles);
	const syncAll = useAction(api.demo.workosAuth.syncAllFromWorkosApi);
	const [refreshing, setRefreshing] = useState(false);
	const [syncResult, setSyncResult] = useState<{
		userCount: number;
		orgCount: number;
		membershipCount: number;
		roleCount: number;
	} | null>(null);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		setSyncResult(null);
		try {
			const result = await syncAll();
			setSyncResult(result);
		} catch (e) {
			console.error("Failed to sync from WorkOS API:", e);
		} finally {
			setRefreshing(false);
		}
	}, [syncAll]);

	return (
		<>
			{/* Session context from JWT */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Session Context</CardTitle>
					<CardDescription>
						Live data from the WorkOS JWT via useAuth() — reflects the currently
						active organization and role.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<SessionField label="Organization ID" value={auth.organizationId} />
					<SessionField label="Role" value={auth.role} />
					<SessionField label="Roles" value={auth.roles?.join(", ")} />
					<SessionField
						label="Permissions"
						value={auth.permissions?.join(", ")}
					/>
				</CardContent>
			</Card>

			{/* Webhook-synced memberships */}
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between">
						<div>
							<CardTitle className="text-base">Synced Data</CardTitle>
							<CardDescription>
								Organizations and memberships synced to Convex via webhooks or
								API pull.
							</CardDescription>
							{syncResult && (
								<p className="mt-1 text-muted-foreground text-xs">
									Synced {syncResult.userCount} user, {syncResult.orgCount}{" "}
									orgs, {syncResult.membershipCount} memberships,{" "}
									{syncResult.roleCount} roles
								</p>
							)}
						</div>
						<Button
							disabled={refreshing}
							onClick={handleRefresh}
							size="sm"
							variant="outline"
						>
							<RefreshCw
								className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
							/>
							Sync from API
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<OrgsList userOrgs={userOrgs} />
				</CardContent>
			</Card>

			{/* Synced roles */}
			{allRoles && allRoles.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Synced Roles</CardTitle>
						<CardDescription>
							Roles synced to Convex via WorkOS webhooks.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{allRoles.map((role) => (
								<div
									className="flex items-center justify-between rounded-lg border p-3"
									key={role._id}
								>
									<p className="font-medium text-sm">{role.slug}</p>
									<div className="flex flex-wrap gap-1">
										{role.permissions.map((perm) => (
											<Badge key={perm} variant="outline">
												<KeyRound className="mr-1 size-3" />
												{perm}
											</Badge>
										))}
										{role.permissions.length === 0 && (
											<span className="text-muted-foreground text-xs">
												No permissions
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</>
	);
}

function SessionField({
	label,
	value,
}: {
	label: string;
	value: string | undefined;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-muted-foreground text-sm">{label}</span>
			{value ? (
				<Badge variant="secondary">{value}</Badge>
			) : (
				<span className="text-muted-foreground text-xs italic">none</span>
			)}
		</div>
	);
}

function OrgsList({
	userOrgs,
}: {
	userOrgs:
		| Array<{
				membership: {
					_id: string;
					organizationWorkosId: string;
					organizationName?: string;
					roleSlug: string;
					status: string;
				};
				organization: { name: string } | undefined;
		  }>
		| undefined;
}) {
	if (userOrgs === undefined) {
		return <p className="text-muted-foreground text-sm">Loading...</p>;
	}
	if (userOrgs.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center">
				<Building2 className="mx-auto mb-2 size-8 text-muted-foreground" />
				<p className="font-medium text-sm">No organizations</p>
				<p className="mt-1 text-muted-foreground text-xs">
					This user has no organization memberships. Configure organizations in
					the{" "}
					<a
						className="underline"
						href="https://dashboard.workos.com"
						rel="noreferrer"
						target="_blank"
					>
						WorkOS Dashboard
					</a>
					.
				</p>
			</div>
		);
	}
	return (
		<div className="space-y-2">
			{userOrgs.map(({ membership, organization }) => (
				<div
					className="flex items-center justify-between rounded-lg border p-3"
					key={membership._id}
				>
					<div>
						<p className="font-medium text-sm">
							{organization?.name ?? membership.organizationName}
						</p>
						<p className="font-mono text-muted-foreground text-xs">
							{membership.organizationWorkosId}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant="secondary">{membership.roleSlug}</Badge>
						<Badge
							variant={membership.status === "active" ? "default" : "outline"}
						>
							{membership.status}
						</Badge>
					</div>
				</div>
			))}
		</div>
	);
}

function ActionLogsList({
	actionLogs,
}: {
	actionLogs:
		| Array<{
				_id: string;
				actionType: string;
				email: string;
				verdict: string;
				message?: string;
				timestamp: number;
		  }>
		| undefined;
}) {
	if (actionLogs === undefined) {
		return <p className="text-muted-foreground text-sm">Loading...</p>;
	}
	if (actionLogs.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center">
				<Zap className="mx-auto mb-2 size-8 text-muted-foreground" />
				<p className="font-medium text-sm">No action logs yet</p>
				<p className="mt-1 text-muted-foreground text-xs">
					Action logs appear here when users sign in or attempt to register.
				</p>
			</div>
		);
	}
	return (
		<div className="space-y-2">
			{actionLogs.map((log) => (
				<div
					className="flex items-center justify-between rounded-lg border p-3"
					key={log._id}
				>
					<div>
						<div className="flex items-center gap-2">
							<Badge variant="outline">{log.actionType}</Badge>
							<span className="text-sm">{log.email}</span>
						</div>
						{log.message && (
							<p className="mt-0.5 text-muted-foreground text-xs">
								{log.message}
							</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Badge
							variant={log.verdict === "Allow" ? "default" : "destructive"}
						>
							{log.verdict}
						</Badge>
						<span className="text-muted-foreground text-xs">
							{new Date(log.timestamp).toLocaleTimeString()}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}

// ── Auth Actions Tab ─────────────────────────────────────────────────

function ActionsTab() {
	const actionLogs = useQuery(api.demo.workosAuth.getActionLogs);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Auth Action Hooks</CardTitle>
					<CardDescription>
						Server-side hooks that run after WorkOS authentication events. These
						are configured in <code>convex/auth.ts</code> via{" "}
						<code>authKit.actions()</code>.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex items-start justify-between rounded-lg border p-3">
						<div>
							<p className="font-medium text-sm">User Registration</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								Blocks @gmail.com signups; allows all other domains.
							</p>
						</div>
						<Badge variant="default">Configured</Badge>
					</div>
					<div className="flex items-start justify-between rounded-lg border p-3">
						<div>
							<p className="font-medium text-sm">Authentication</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								Allows all authentication attempts and logs them.
							</p>
						</div>
						<Badge variant="default">Configured</Badge>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Action Log</CardTitle>
					<CardDescription>
						Live log of auth action events. Populates when users sign in or
						register via WorkOS.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ActionLogsList actionLogs={actionLogs} />
				</CardContent>
			</Card>
		</>
	);
}
