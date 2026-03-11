import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

interface DemoLayoutProps {
	children: ReactNode;
	description: string;
	docsHref?: string;
	title: string;
}

export function DemoLayout({
	title,
	description,
	docsHref,
	children,
}: DemoLayoutProps) {
	return (
		<div className="mx-auto max-w-4xl space-y-6 p-4 py-8">
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between">
						<div>
							<CardTitle className="text-2xl">{title}</CardTitle>
							<CardDescription className="mt-1">{description}</CardDescription>
						</div>
						{docsHref && (
							<a
								className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
								href={docsHref}
								rel="noreferrer"
								target="_blank"
							>
								Docs
								<ExternalLink className="size-3.5" />
							</a>
						)}
					</div>
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</div>
	);
}
