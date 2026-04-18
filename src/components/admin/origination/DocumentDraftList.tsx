import { Archive, Files, FileText } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";

export interface OriginationDocumentDraftListItem {
	_id: string;
	asset?: {
		assetId: string;
		fileRef: string;
		name: string;
		originalFilename: string;
	} | null;
	class: string;
	description?: string;
	displayName: string;
	packageLabel?: string;
	selectedGroup?: {
		groupId: string;
		name: string;
	} | null;
	sourceKind: "asset" | "template_version";
	status: "active" | "archived";
	template?: {
		name: string;
		templateId: string;
	} | null;
	templateVersion?: number;
	validationSummary?: {
		containsSignableFields: boolean;
		requiredPlatformRoles: string[];
		requiredVariableKeys: string[];
		unsupportedPlatformRoles: string[];
		unsupportedVariableKeys: string[];
	};
}

interface DocumentDraftListProps {
	drafts: OriginationDocumentDraftListItem[];
	onArchive: (draftId: string) => void | Promise<void>;
}

function renderValidationSummary(
	summary: OriginationDocumentDraftListItem["validationSummary"]
) {
	if (!summary) {
		return null;
	}

	const notes: string[] = [];
	if (summary.requiredVariableKeys.length > 0) {
		notes.push(`Variables: ${summary.requiredVariableKeys.join(", ")}`);
	}
	if (summary.requiredPlatformRoles.length > 0) {
		notes.push(`Roles: ${summary.requiredPlatformRoles.join(", ")}`);
	}
	if (summary.unsupportedVariableKeys.length > 0) {
		notes.push(
			`Unsupported variables: ${summary.unsupportedVariableKeys.join(", ")}`
		);
	}
	if (summary.unsupportedPlatformRoles.length > 0) {
		notes.push(
			`Unsupported roles: ${summary.unsupportedPlatformRoles.join(", ")}`
		);
	}
	if (notes.length === 0) {
		return null;
	}

	return (
		<div className="mt-2 space-y-1 text-muted-foreground text-xs">
			{notes.map((note) => (
				<p key={note}>{note}</p>
			))}
		</div>
	);
}

export function DocumentDraftList({
	drafts,
	onArchive,
}: DocumentDraftListProps) {
	if (drafts.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nothing staged in this section yet.
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{drafts.map((draft) => (
				<div
					className="rounded-xl border border-border/70 bg-background/80 px-4 py-4"
					key={draft._id}
				>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<p className="font-medium text-sm">{draft.displayName}</p>
								<Badge variant="secondary">
									{draft.sourceKind === "asset" ? "Static PDF" : "Template"}
								</Badge>
								{draft.packageLabel ? (
									<Badge variant="outline">{draft.packageLabel}</Badge>
								) : null}
							</div>
							{draft.description ? (
								<p className="text-muted-foreground text-sm">
									{draft.description}
								</p>
							) : null}
						</div>
						<Button
							onClick={() => onArchive(draft._id)}
							size="sm"
							type="button"
							variant="ghost"
						>
							<Archive className="mr-2 size-4" />
							Archive
						</Button>
					</div>

					<div className="mt-3 grid gap-2 text-muted-foreground text-xs md:grid-cols-2">
						{draft.asset ? (
							<div className="flex items-center gap-2">
								<FileText className="size-4" />
								<span>{draft.asset.originalFilename}</span>
							</div>
						) : null}
						{draft.template ? (
							<div className="flex items-center gap-2">
								<Files className="size-4" />
								<span>
									{draft.template.name}
									{typeof draft.templateVersion === "number"
										? ` v${draft.templateVersion}`
										: ""}
								</span>
							</div>
						) : null}
						{draft.selectedGroup ? (
							<p>Expanded from group: {draft.selectedGroup.name}</p>
						) : null}
					</div>

					{renderValidationSummary(draft.validationSummary)}
				</div>
			))}
		</div>
	);
}
