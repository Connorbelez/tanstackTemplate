import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { PlatformRole } from "#/lib/document-engine/types";
import { PLATFORM_ROLE_LABELS, SIGNATORY_COLORS } from "./signatory-colors";

interface Signatory {
	order: number;
	platformRole: PlatformRole;
	role: "signatory" | "approver" | "viewer";
}

interface SignatoryPanelProps {
	onChange: (signatories: Signatory[]) => void;
	readOnly?: boolean;
	signatories: Signatory[];
}

const ALL_ROLES: PlatformRole[] = [
	"fairlend_broker",
	"lender_lawyer",
	"lender",
	"seller_lawyer",
	"borrower_lawyer",
	"borrower",
];

const SIGNATORY_ROLES = [
	{ value: "signatory", label: "Signatory" },
	{ value: "approver", label: "Approver" },
	{ value: "viewer", label: "Viewer" },
] as const;

export function SignatoryPanel({
	signatories,
	onChange,
	readOnly,
}: SignatoryPanelProps) {
	const [newRole, setNewRole] = useState<PlatformRole | "">("");

	const usedRoles = new Set(signatories.map((s) => s.platformRole));
	const availableRoles = ALL_ROLES.filter((r) => !usedRoles.has(r));

	const handleAdd = () => {
		if (!newRole) {
			return;
		}
		onChange([
			...signatories,
			{
				platformRole: newRole,
				role: "signatory",
				order: signatories.length,
			},
		]);
		setNewRole("");
	};

	const handleRemove = (platformRole: PlatformRole) => {
		const updated = signatories
			.filter((s) => s.platformRole !== platformRole)
			.map((s, i) => ({ ...s, order: i }));
		onChange(updated);
	};

	const handleRoleChange = (
		platformRole: PlatformRole,
		role: "signatory" | "approver" | "viewer"
	) => {
		onChange(
			signatories.map((s) =>
				s.platformRole === platformRole ? { ...s, role } : s
			)
		);
	};

	return (
		<div className="space-y-3">
			{signatories.length === 0 && (
				<p className="text-muted-foreground text-xs">
					No signatories added yet.
				</p>
			)}

			<div className="space-y-2">
				{signatories.map((sig) => (
					<div className="rounded-md border p-2" key={sig.platformRole}>
						<div className="flex items-center gap-2">
							<GripVertical className="size-4 shrink-0 text-muted-foreground" />
							<div
								className="size-3 shrink-0 rounded-full"
								style={{
									backgroundColor: SIGNATORY_COLORS[sig.platformRole],
								}}
							/>
							<span className="min-w-0 flex-1 truncate text-sm">
								{PLATFORM_ROLE_LABELS[sig.platformRole]}
							</span>
							{!readOnly && (
								<Button
									className="shrink-0"
									onClick={() => handleRemove(sig.platformRole)}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="size-3" />
								</Button>
							)}
						</div>
						{readOnly ? (
							<div className="mt-1 pl-9">
								<Badge variant="outline">{sig.role}</Badge>
							</div>
						) : (
							<div className="mt-1 pl-9">
								<Select
									onValueChange={(v) =>
										handleRoleChange(sig.platformRole, v as Signatory["role"])
									}
									value={sig.role}
								>
									<SelectTrigger className="h-7 text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SIGNATORY_ROLES.map((r) => (
											<SelectItem key={r.value} value={r.value}>
												{r.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				))}
			</div>

			{!readOnly && availableRoles.length > 0 && (
				<div className="flex gap-2">
					<Select
						onValueChange={(v) => setNewRole(v as PlatformRole)}
						value={newRole}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue placeholder="Add signatory..." />
						</SelectTrigger>
						<SelectContent>
							{availableRoles.map((role) => (
								<SelectItem key={role} value={role}>
									{PLATFORM_ROLE_LABELS[role]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						disabled={!newRole}
						onClick={handleAdd}
						size="sm"
						variant="outline"
					>
						<Plus className="size-3" />
					</Button>
				</div>
			)}
		</div>
	);
}
