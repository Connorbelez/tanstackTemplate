"use client";

import { useMutation, useQuery } from "convex/react";
import { Building2, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AdminPageSkeleton,
	AdminTableSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Separator } from "#/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { api } from "../../../../convex/_generated/api";
import type {
	AdminOrgMemberSummary,
	AdminOrgSettingsSnapshot,
} from "../../../../convex/admin/settings/queries";

function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return "Something went wrong while bootstrapping CRM objects.";
}

function formatMemberName(member: AdminOrgMemberSummary): string {
	const joined = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();
	if (joined.length > 0) {
		return joined;
	}
	return member.email ?? member.userWorkosId;
}

function OrganizationCard({
	organization,
}: {
	readonly organization: AdminOrgSettingsSnapshot["organization"];
}) {
	if (!organization) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Current organization</CardTitle>
					<CardDescription>
						No organization record is synced for this session yet.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const metadataEntries = Object.entries(organization.metadata ?? {});

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Building2 className="size-5" />
						</div>
						<div>
							<CardTitle>{organization.name}</CardTitle>
							<CardDescription>
								Active organization synced from WorkOS AuthKit.
							</CardDescription>
						</div>
					</div>
					<Badge variant="outline">WorkOS org</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4 text-sm">
				<dl className="grid gap-3 sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide">
							WorkOS ID
						</dt>
						<dd className="break-all font-mono text-xs">
							{organization.workosId}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide">
							External ID
						</dt>
						<dd className="break-all font-mono text-xs">
							{organization.externalId ?? "—"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide">
							Profiles outside organization
						</dt>
						<dd>
							{organization.allowProfilesOutsideOrganization
								? "Allowed"
								: "Disallowed"}
						</dd>
					</div>
				</dl>
				{metadataEntries.length > 0 ? (
					<>
						<Separator />
						<div className="space-y-2">
							<p className="font-medium text-xs uppercase tracking-wide">
								Metadata
							</p>
							<dl className="grid gap-2 sm:grid-cols-2">
								{metadataEntries.map(([key, value]) => (
									<div key={key}>
										<dt className="text-muted-foreground text-xs">{key}</dt>
										<dd className="break-words">{value}</dd>
									</div>
								))}
							</dl>
						</div>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}

function MembersCard({
	members,
}: {
	readonly members: readonly AdminOrgMemberSummary[];
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-3">
					<div>
						<CardTitle>Organization members</CardTitle>
						<CardDescription>
							People with a WorkOS membership in this organization.
						</CardDescription>
					</div>
					<Badge variant="outline">
						{members.length} {members.length === 1 ? "member" : "members"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				{members.length === 0 ? (
					<Empty className="rounded-xl border border-border/70 border-dashed p-6">
						<EmptyHeader>
							<EmptyTitle>No members synced</EmptyTitle>
							<EmptyDescription>
								WorkOS has not synced any memberships for this organization yet.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{members.map((member) => (
								<TableRow key={member.membershipWorkosId}>
									<TableCell className="font-medium">
										{formatMemberName(member)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{member.email ?? "—"}
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{member.roleSlugs.map((role) => (
												<Badge
													key={`${member.membershipWorkosId}-${role}`}
													variant={role === "admin" ? "default" : "secondary"}
												>
													{role}
												</Badge>
											))}
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{member.status}</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function BootstrapCard({
	bootstrapStatus,
}: {
	readonly bootstrapStatus: AdminOrgSettingsSnapshot["bootstrapStatus"];
}) {
	const bootstrap = useMutation(
		api.crm.systemAdapters.bootstrap.adminBootstrap
	);
	const [isSeeding, setIsSeeding] = useState(false);

	async function handleSeed() {
		setIsSeeding(true);
		try {
			const result = await bootstrap({});
			const createdCount = result.created.length;
			const repairedCount = result.repaired.length;
			toast.success(
				`CRM system objects ready — ${createdCount} created, ${repairedCount} repaired.`
			);
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setIsSeeding(false);
		}
	}

	const showSeedButton = !bootstrapStatus.isBootstrapped;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Sparkles className="size-5" />
						</div>
						<div>
							<CardTitle>CRM system objects</CardTitle>
							<CardDescription>
								Seed the canonical object definitions, fields, and default views
								that back the admin view engine.
							</CardDescription>
						</div>
					</div>
					{bootstrapStatus.isBootstrapped ? (
						<Badge className="gap-1" variant="default">
							<CheckCircle2 className="size-3.5" />
							Seeded
						</Badge>
					) : (
						<Badge variant="secondary">Not seeded</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4 text-sm">
				<dl className="grid gap-3 sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide">
							Seeded
						</dt>
						<dd>
							{bootstrapStatus.seededSystemObjectCount} /{" "}
							{bootstrapStatus.expectedSystemObjectCount} system objects
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide">
							Missing
						</dt>
						<dd>
							{bootstrapStatus.missingSystemObjectNames.length === 0
								? "None"
								: bootstrapStatus.missingSystemObjectNames.join(", ")}
						</dd>
					</div>
				</dl>
				{showSeedButton ? (
					<div className="flex flex-col gap-3 rounded-xl border border-border/70 border-dashed bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-muted-foreground text-sm">
							Bootstrap will create any missing object definitions, fields, and
							default table views for this organization.
						</p>
						<Button
							disabled={isSeeding}
							onClick={() => {
								void handleSeed();
							}}
							type="button"
						>
							{isSeeding ? (
								<>
									<LoaderCircle className="size-4 animate-spin" />
									Seeding…
								</>
							) : (
								<>
									<Sparkles className="size-4" />
									Seed CRM objects
								</>
							)}
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

export function AdminSettingsPage() {
	const snapshot = useQuery(api.admin.settings.queries.getOrgSettings);

	if (snapshot === undefined) {
		return (
			<AdminPageSkeleton descriptionWidth="w-80" titleWidth="w-40">
				<AdminTableSkeleton columnCount={4} rowCount={5} />
			</AdminPageSkeleton>
		);
	}

	if (snapshot === null) {
		return (
			<Empty className="rounded-2xl border border-border/70 border-dashed p-8">
				<EmptyHeader>
					<EmptyTitle>No organization context</EmptyTitle>
					<EmptyDescription>
						This session is not associated with a WorkOS organization. Switch to
						an organization to manage its settings.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm">
					Manage the active organization, members, and CRM bootstrap state.
				</p>
			</header>
			<OrganizationCard organization={snapshot.organization} />
			<MembersCard members={snapshot.members} />
			<BootstrapCard bootstrapStatus={snapshot.bootstrapStatus} />
		</div>
	);
}
