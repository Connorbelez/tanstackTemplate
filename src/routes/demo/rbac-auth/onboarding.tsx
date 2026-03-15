import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowRight,
	Check,
	CheckCircle2,
	Circle,
	Clock,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
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
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac-auth/onboarding")({
	ssr: false,
	component: OnboardingPage,
});

const REQUESTABLE_ROLES = [
	"broker",
	"lender",
	"lawyer",
	"admin",
	"jr_underwriter",
	"underwriter",
	"sr_underwriter",
] as const;

const ORG_ASSIGNMENT_RULES: {
	org: string;
	roles: string[];
}[] = [
	{ roles: ["broker"], org: "New organization (provisioned at approval)" },
	{
		roles: ["lender"],
		org: "FairLend Brokerage (or inviting broker's org)",
	},
	{ roles: ["lawyer"], org: "FairLend Lawyers" },
	{
		roles: ["jr_underwriter", "underwriter", "sr_underwriter", "admin"],
		org: "FairLend Staff",
	},
];

const STATE_MACHINE_NODES = [
	{
		id: "signup",
		label: "Sign Up",
		status: "success" as const,
		description: "User creates account",
	},
	{
		id: "member",
		label: "member",
		status: "success" as const,
		description: "Default role assigned",
	},
	{
		id: "request",
		label: "Request Role",
		status: "info" as const,
		description: "User submits role request",
	},
	{
		id: "pending",
		label: "pending_review",
		status: "warning" as const,
		description: "Awaiting admin decision",
	},
	{
		id: "approved",
		label: "approved",
		status: "success" as const,
		description: "Admin approves request",
	},
	{
		id: "assigned",
		label: "role_assigned",
		status: "success" as const,
		description: "Role + org membership granted",
	},
];

function OnboardingPage() {
	const auth = useAppAuth();
	const canReview = auth.permissions.includes("onboarding:review");
	const isMember =
		auth.role === "member" || (auth.roles.length === 0 && !auth.loading);

	return (
		<div className="space-y-6">
			{/* State Machine Diagram */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Onboarding State Machine</CardTitle>
					<CardDescription>
						Every user follows this governance workflow from signup to role
						assignment
					</CardDescription>
				</CardHeader>
				<CardContent>
					<StateMachineDiagram />
				</CardContent>
			</Card>

			{/* Requestable Roles */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Requestable Roles</CardTitle>
					<CardDescription>
						Roles available through the onboarding approval flow (borrower is
						auto-assigned)
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						{REQUESTABLE_ROLES.map((slug) => {
							const meta = ROLE_DISPLAY_METADATA[slug];
							const colors = meta ? ROLE_COLOR_CLASSES[meta.color] : undefined;
							return (
								<Badge className={colors?.badge} key={slug} variant="outline">
									{meta?.label ?? slug}
								</Badge>
							);
						})}
					</div>
				</CardContent>
			</Card>

			{/* Org Assignment Rules */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Organization Assignment Rules
					</CardTitle>
					<CardDescription>
						Where each role gets placed upon approval
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{ORG_ASSIGNMENT_RULES.map((rule) => (
							<div
								className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
								key={rule.org}
							>
								<div className="flex flex-wrap gap-1.5">
									{rule.roles.map((slug) => {
										const meta = ROLE_DISPLAY_METADATA[slug];
										const colors = meta
											? ROLE_COLOR_CLASSES[meta.color]
											: undefined;
										return (
											<Badge
												className={colors?.badge}
												key={slug}
												variant="outline"
											>
												{meta?.label ?? slug}
											</Badge>
										);
									})}
								</div>
								<span className="text-muted-foreground text-sm">
									→ {rule.org}
								</span>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Live Section */}
			<LiveOnboardingSection
				canReview={canReview}
				isMember={isMember}
				role={auth.role}
			/>
		</div>
	);
}

function LiveOnboardingSection({
	canReview,
	isMember,
	role,
}: {
	canReview: boolean;
	isMember: boolean;
	role: string | null;
}) {
	if (canReview) {
		return <AdminReviewSection />;
	}
	if (isMember) {
		return <MemberRequestSection />;
	}
	return (
		<Card className="border-dashed">
			<CardContent className="py-8 text-center">
				<p className="text-muted-foreground text-sm">
					You have the <Badge variant="secondary">{role ?? "unknown"}</Badge>{" "}
					role. Admins with{" "}
					<code className="rounded bg-muted px-1 text-xs">
						onboarding:review
					</code>{" "}
					permission see pending requests here. Members see a role request form.
				</p>
			</CardContent>
		</Card>
	);
}

// ── State Machine Diagram ───────────────────────────────────────────

const STATUS_NODE_STYLES: Record<string, string> = {
	success: "border-green-200 bg-green-50",
	warning: "border-amber-200 bg-amber-50",
	info: "border-blue-200 bg-blue-50",
};

function statusNodeStyles(status: string) {
	return STATUS_NODE_STYLES[status] ?? STATUS_NODE_STYLES.info;
}

function StatusNodeIcon({ status }: { status: string }) {
	if (status === "success") {
		return <CheckCircle2 className="size-3.5 text-green-600" />;
	}
	if (status === "warning") {
		return <Clock className="size-3.5 text-amber-600" />;
	}
	return <Circle className="size-3.5 text-blue-600" />;
}

function StateMachineDiagram() {
	return (
		<div className="space-y-4">
			{/* Main flow */}
			<div className="flex flex-wrap items-center gap-2">
				{STATE_MACHINE_NODES.map((node, i) => (
					<div className="flex items-center gap-2" key={node.id}>
						<div
							className={`rounded-lg border px-3 py-2 ${statusNodeStyles(node.status)}`}
						>
							<div className="flex items-center gap-1.5">
								<StatusNodeIcon status={node.status} />
								<span className="font-medium font-mono text-xs">
									{node.label}
								</span>
							</div>
							<p className="mt-0.5 text-[10px] text-muted-foreground">
								{node.description}
							</p>
						</div>
						{i < STATE_MACHINE_NODES.length - 1 && (
							<ArrowRight className="size-4 shrink-0 text-muted-foreground" />
						)}
					</div>
				))}
			</div>

			{/* Reject branch */}
			<div className="ml-4 flex items-center gap-2 border-red-200 border-l-2 border-dashed pl-4">
				<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
					<div className="flex items-center gap-1.5">
						<XCircle className="size-3.5 text-red-500" />
						<span className="font-medium font-mono text-xs">rejected</span>
					</div>
					<p className="mt-0.5 text-[10px] text-muted-foreground">
						Admin declines with reason
					</p>
				</div>
				<span className="text-muted-foreground text-xs">
					(from pending_review)
				</span>
			</div>
		</div>
	);
}

// ── Admin Review Section ────────────────────────────────────────────

interface PendingRequestItem {
	request: { _id: string; requestedRole: string };
	user: {
		email?: string;
		firstName?: string;
		lastName?: string;
	} | null;
}

function AdminReviewSection() {
	const listPending = useMutation(api.onboarding.queries.listPendingRequests);
	const approve = useMutation(api.onboarding.mutations.approveRequest);
	const reject = useMutation(api.onboarding.mutations.rejectRequest);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectionReason, setRejectionReason] = useState("");
	const [requests, setRequests] = useState<PendingRequestItem[]>([]);
	const [loaded, setLoaded] = useState(false);

	const fetchRequests = useCallback(async () => {
		const result = await listPending({});
		setRequests(result as PendingRequestItem[]);
		setLoaded(true);
	}, [listPending]);

	useEffect(() => {
		fetchRequests();
	}, [fetchRequests]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Pending Requests (Admin)</CardTitle>
				<CardDescription>
					Review and approve or reject pending role requests
				</CardDescription>
			</CardHeader>
			<CardContent>
				{loaded ? (
					<PendingRequestsContent
						onApprove={async (requestId) => {
							await approve({ requestId: requestId as never });
							fetchRequests();
						}}
						onReject={async (requestId, reason) => {
							await reject({
								requestId: requestId as never,
								rejectionReason: reason,
							});
							fetchRequests();
						}}
						onSetRejectingId={setRejectingId}
						onSetRejectionReason={setRejectionReason}
						rejectingId={rejectingId}
						rejectionReason={rejectionReason}
						requests={requests}
					/>
				) : (
					<p className="text-muted-foreground text-sm">Loading...</p>
				)}
			</CardContent>
		</Card>
	);
}

function PendingRequestsContent({
	requests,
	rejectingId,
	rejectionReason,
	onApprove,
	onReject,
	onSetRejectingId,
	onSetRejectionReason,
}: {
	requests: PendingRequestItem[];
	rejectingId: string | null;
	rejectionReason: string;
	onApprove: (requestId: string) => void;
	onReject: (requestId: string, reason: string) => void;
	onSetRejectingId: (id: string | null) => void;
	onSetRejectionReason: (reason: string) => void;
}) {
	if (requests.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No pending requests.</p>
		);
	}
	return (
		<div className="space-y-3">
			{requests.map(({ request, user }) => {
				const roleMeta = ROLE_DISPLAY_METADATA[request.requestedRole];
				const colors = roleMeta
					? ROLE_COLOR_CLASSES[roleMeta.color]
					: undefined;
				const isRejecting = rejectingId === request._id;

				return (
					<div className="rounded-lg border p-3" key={request._id}>
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-sm">
									{user?.firstName} {user?.lastName}
								</p>
								<p className="text-muted-foreground text-xs">
									{user?.email} • Requested{" "}
									<Badge className={colors?.badge} variant="outline">
										{roleMeta?.label ?? request.requestedRole}
									</Badge>
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									onClick={() => onApprove(request._id)}
									size="sm"
									variant="outline"
								>
									<Check className="mr-1 size-3" />
									Approve
								</Button>
								<Button
									onClick={() =>
										isRejecting
											? onSetRejectingId(null)
											: onSetRejectingId(request._id)
									}
									size="sm"
									variant="outline"
								>
									<X className="mr-1 size-3" />
									Reject
								</Button>
							</div>
						</div>
						{isRejecting && (
							<div className="mt-3 flex gap-2">
								<input
									className="flex-1 rounded border px-2 py-1 text-sm"
									onChange={(e) => onSetRejectionReason(e.target.value)}
									placeholder="Rejection reason..."
									value={rejectionReason}
								/>
								<Button
									disabled={!rejectionReason.trim()}
									onClick={() => {
										onReject(request._id, rejectionReason);
										onSetRejectingId(null);
										onSetRejectionReason("");
									}}
									size="sm"
									variant="destructive"
								>
									Confirm
								</Button>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ── Member Request Section ──────────────────────────────────────────

function MemberRequestSection() {
	const myRequests = useQuery(api.onboarding.queries.getMyOnboardingRequest);
	const requestRole = useMutation(api.onboarding.mutations.requestRole);
	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const hasPending = myRequests?.some(
		(r) => r.status === "pending_review" || r.status === "approved"
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Request a Role</CardTitle>
				<CardDescription>
					You currently have the member role. Select a role to request.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{hasPending ? (
					<div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
						<Clock className="size-4 text-amber-600" />
						<p className="text-sm">
							You already have a pending request. An admin will review it
							shortly.
						</p>
					</div>
				) : (
					<div className="space-y-4">
						<div className="flex flex-wrap gap-2">
							{REQUESTABLE_ROLES.map((slug) => {
								const meta = ROLE_DISPLAY_METADATA[slug];
								const colors = meta
									? ROLE_COLOR_CLASSES[meta.color]
									: undefined;
								const isSelected = selectedRole === slug;
								return (
									<button
										className={`rounded-full border px-3 py-1 text-sm transition-all ${
											isSelected
												? `ring-2 ring-primary ${colors?.badge ?? ""}`
												: `${colors?.badge ?? "bg-muted"} opacity-70 hover:opacity-100`
										}`}
										key={slug}
										onClick={() => setSelectedRole(slug)}
										type="button"
									>
										{meta?.label ?? slug}
									</button>
								);
							})}
						</div>
						{selectedRole && (
							<div className="space-y-2">
								<p className="text-muted-foreground text-sm">
									{ROLE_DISPLAY_METADATA[selectedRole]?.description}
								</p>
								<Button
									disabled={submitting}
									onClick={async () => {
										setSubmitting(true);
										try {
											await requestRole({
												requestedRole:
													selectedRole as (typeof REQUESTABLE_ROLES)[number],
												referralSource: "self_signup",
											});
										} finally {
											setSubmitting(false);
										}
									}}
									size="sm"
								>
									Submit Request
								</Button>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
