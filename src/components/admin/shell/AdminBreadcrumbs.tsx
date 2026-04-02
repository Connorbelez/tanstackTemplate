"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const adminSegmentLabels: Record<string, string> = {
	admin: "Admin",
	applications: "Applications",
	borrowers: "Borrowers",
	deals: "Deals",
	listings: "Listings",
	mortgages: "Mortgages",
	obligations: "Obligations",
	properties: "Properties",
	underwriting: "Underwriting",
};

function formatSegmentLabel(
	segment: string,
	index: number,
	segments: string[]
): string {
	const decodedSegment = decodeURIComponent(segment);
	const mappedLabel = adminSegmentLabels[decodedSegment];

	if (mappedLabel) {
		return mappedLabel;
	}

	if (index >= 2 && index === segments.length - 1) {
		return `Record ${decodedSegment}`;
	}

	return decodedSegment
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AdminBreadcrumbs() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	const segments = pathname.split("/").filter(Boolean);
	const adminSegments =
		segments[0] === "admin" ? segments : ["admin", ...segments];

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{adminSegments.map((segment, index) => {
					const href = `/${adminSegments.slice(0, index + 1).join("/")}`;
					const isCurrentPage = index === adminSegments.length - 1;
					const label = formatSegmentLabel(segment, index, adminSegments);

					return (
						<Fragment key={href}>
							<BreadcrumbItem>
								{isCurrentPage ? (
									<BreadcrumbPage>{label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link to={href}>{label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
							{isCurrentPage ? null : <BreadcrumbSeparator />}
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
