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
import { useAdminPageMetadata } from "./AdminPageMetadataContext";

const adminSegmentLabels: Record<string, string> = {
	admin: "Admin",
	applications: "Applications",
	borrowers: "Borrowers",
	deals: "Deals",
	"document-engine": "Document Engine",
	listings: "Listings",
	mortgages: "Mortgages",
	obligations: "Obligations",
	originations: "Originations",
	"payment-operations": "Payment Operations",
	"financial-ledger": "Financial Ledger",
	properties: "Properties",
	settings: "Settings",
	underwriting: "Underwriting",
};

function formatSegmentLabel(
	segment: string,
	index: number,
	segments: string[]
) {
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

export function getAdminBreadcrumbLabel(args: {
	breadcrumbLabel?: string;
	index: number;
	segment: string;
	segments: string[];
}) {
	if (args.breadcrumbLabel && args.index === args.segments.length - 1) {
		return args.breadcrumbLabel;
	}

	return formatSegmentLabel(args.segment, args.index, args.segments);
}

export function AdminBreadcrumbs() {
	const { breadcrumbLabel } = useAdminPageMetadata();
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
					const label = getAdminBreadcrumbLabel({
						breadcrumbLabel,
						index,
						segment,
						segments: adminSegments,
					});

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
