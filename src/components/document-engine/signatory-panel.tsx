import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	getSignatoryColor,
	getSignatoryLabel,
} from "#/lib/document-engine/signatory-utils";
import type { SignatoryConfig } from "#/lib/document-engine/types";
import { DOMAIN_ROLES } from "#/lib/document-engine/types";

interface SignatoryPanelProps {
	onChange: (signatories: SignatoryConfig[]) => void;
	readOnly?: boolean;
	signatories: SignatoryConfig[];
}

const SIGNATORY_ROLES = [
	{ value: "signatory", label: "Signatory" },
	{ value: "approver", label: "Approver" },
	{ value: "viewer", label: "Viewer" },
] as const;

const CUSTOM_SIGNATORY_VALUE = "__custom__";

export function SignatoryPanel({
	signatories,
	onChange,
	readOnly,
}: SignatoryPanelProps) {
	const [newRole, setNewRole] = useState("");
	const [customLabel, setCustomLabel] = useState("");
	const [showCustomInput, setShowCustomInput] = useState(false);

	const usedRoles = new Set(signatories.map((s) => s.platformRole));
	const availableDomainRoles = DOMAIN_ROLES.filter((r) => !usedRoles.has(r));

	const nextCustomId = (): string => {
		let n = 1;
		while (usedRoles.has(`signatory_${n}`)) {
			n++;
		}
		return `signatory_${n}`;
	};

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

	const handleAddCustom = () => {
		const id = nextCustomId();
		onChange([
			...signatories,
			{
				platformRole: id,
				role: "signatory",
				order: signatories.length,
				label:
					customLabel.trim() ||
					id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
			},
		]);
		setCustomLabel("");
		setShowCustomInput(false);
	};

	const handleRemove = (platformRole: string) => {
		const updated = signatories
			.filter((s) => s.platformRole !== platformRole)
			.map((s, i) => ({ ...s, order: i }));
		onChange(updated);
	};

	const handleRoleChange = (
		platformRole: string,
		role: "signatory" | "approver" | "viewer"
	) => {
		onChange(
			signatories.map((s) =>
				s.platformRole === platformRole ? { ...s, role } : s
			)
		);
	};

	const handleSelectChange = (value: string) => {
		if (value === CUSTOM_SIGNATORY_VALUE) {
			setShowCustomInput(true);
			setNewRole("");
		} else {
			setShowCustomInput(false);
			setNewRole(value);
		}
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
									backgroundColor: getSignatoryColor(sig.platformRole),
								}}
							/>
							<span className="min-w-0 flex-1 truncate text-sm">
								{getSignatoryLabel(sig.platformRole, sig.label)}
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
										handleRoleChange(
											sig.platformRole,
											v as SignatoryConfig["role"]
										)
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

			{!readOnly && (
				<div className="space-y-2">
					<div className="flex gap-2">
						<Select
							onValueChange={handleSelectChange}
							value={showCustomInput ? CUSTOM_SIGNATORY_VALUE : newRole}
						>
							<SelectTrigger className="h-8 text-xs">
								<SelectValue placeholder="Add signatory..." />
							</SelectTrigger>
							<SelectContent>
								{availableDomainRoles.map((role) => (
									<SelectItem key={role} value={role}>
										{getSignatoryLabel(role)}
									</SelectItem>
								))}
								<SelectItem value={CUSTOM_SIGNATORY_VALUE}>
									+ Custom Signatory
								</SelectItem>
							</SelectContent>
						</Select>
						{!showCustomInput && (
							<Button
								disabled={!newRole}
								onClick={handleAdd}
								size="sm"
								variant="outline"
							>
								<Plus className="size-3" />
							</Button>
						)}
					</div>

					{showCustomInput && (
						<div className="flex gap-2">
							<Input
								className="h-8 text-xs"
								onChange={(e) => setCustomLabel(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleAddCustom();
									}
								}}
								placeholder="Display label (e.g. Guarantor)"
								value={customLabel}
							/>
							<Button onClick={handleAddCustom} size="sm" variant="outline">
								<Plus className="size-3" />
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
