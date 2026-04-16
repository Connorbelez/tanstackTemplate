import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { OriginationStepCard } from "./OriginationStepCard";
import { ORIGINATION_DOCUMENT_SECTION_SHELLS } from "./workflow";

interface DocumentsStepProps {
	errors?: readonly string[];
}

export function DocumentsStep({ errors }: DocumentsStepProps) {
	return (
		<OriginationStepCard
			description="The document stage is visible now so later phases can extend it in place, but authoring, templates, uploads, and signing remain intentionally inactive."
			errors={errors}
			title="Documents"
		>
			<div className="grid gap-4 md:grid-cols-2">
				{ORIGINATION_DOCUMENT_SECTION_SHELLS.map((section) => (
					<Card
						className="border-border/80 border-dashed bg-muted/20"
						key={section.key}
					>
						<CardHeader>
							<CardTitle className="text-base">{section.title}</CardTitle>
							<CardDescription>{section.description}</CardDescription>
						</CardHeader>
						<CardContent className="text-muted-foreground text-sm leading-6">
							Authoring becomes active in the document-blueprint phase. This
							placeholder exists now so downstream work can extend the same
							screen without changing route or layout shape.
						</CardContent>
					</Card>
				))}
			</div>
		</OriginationStepCard>
	);
}
