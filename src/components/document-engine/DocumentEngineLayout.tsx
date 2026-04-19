"use client";

import { Link, Outlet, useMatches } from "@tanstack/react-router";
import {
	FileText,
	FolderOpen,
	LayoutDashboard,
	Library,
	Play,
	Variable,
} from "lucide-react";
import type { ReactNode } from "react";

interface DocumentEngineLayoutPaths {
	dashboard: "/admin/document-engine" | "/demo/document-engine";
	generate?: "/demo/document-engine/generate";
	groups: "/admin/document-engine/groups" | "/demo/document-engine/groups";
	library: "/admin/document-engine/library" | "/demo/document-engine/library";
	templates:
		| "/admin/document-engine/templates"
		| "/demo/document-engine/templates";
	variables:
		| "/admin/document-engine/variables"
		| "/demo/document-engine/variables";
}

interface DocumentEngineLayoutProps {
	children?: ReactNode;
	description: string;
	paths: DocumentEngineLayoutPaths;
	title: string;
}

export function DocumentEngineLayout({
	children,
	description,
	paths,
	title,
}: DocumentEngineLayoutProps) {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";
	const isDesignerRoute = currentPath.startsWith(
		`${paths.dashboard}/designer/`
	);
	const navItems = [
		{ icon: LayoutDashboard, label: "Dashboard", to: paths.dashboard },
		{ icon: Library, label: "Library", to: paths.library },
		{ icon: Variable, label: "Variables", to: paths.variables },
		{ icon: FileText, label: "Templates", to: paths.templates },
		{ icon: FolderOpen, label: "Groups", to: paths.groups },
		...(paths.generate
			? [{ icon: Play, label: "Generate", to: paths.generate }]
			: []),
	] as const;

	if (isDesignerRoute) {
		return (
			<div className="w-full px-4 py-4 lg:px-6">{children ?? <Outlet />}</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl p-4 py-8">
			<div className="mb-6">
				<h1 className="font-bold text-2xl">{title}</h1>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>

			<nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
				{navItems.map((item) => {
					const isActive =
						item.to === paths.dashboard
							? currentPath === paths.dashboard ||
								currentPath === `${paths.dashboard}/`
							: currentPath.startsWith(item.to);

					return (
						<Link
							className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 font-medium text-sm transition-colors ${
								isActive
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							key={item.to}
							to={item.to}
						>
							<item.icon className="size-4" />
							{item.label}
						</Link>
					);
				})}
			</nav>

			{children ?? <Outlet />}
		</div>
	);
}
