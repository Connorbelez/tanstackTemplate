"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import { getAdminEntityByType } from "#/components/admin/shell/entity-registry";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
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
	underwriting: "Underwriting",
};

interface AdminEntityBreadcrumbItem {
	readonly entityType: string;
	readonly key: string;
	readonly label: string;
	readonly route: "entity";
}

interface AdminStaticBreadcrumbItem {
	readonly key: string;
	readonly label: string;
	readonly route?: undefined;
}

type AdminBreadcrumbItem =
	| AdminEntityBreadcrumbItem
	| AdminStaticBreadcrumbItem;

function formatSegmentLabel(segment: string): string {
	const decodedSegment = decodeURIComponent(segment);
	const mappedLabel = adminSegmentLabels[decodedSegment];
	if (mappedLabel) {
		return mappedLabel;
	}

	return decodedSegment
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function getAdminBreadcrumbItems(pathname: string): AdminBreadcrumbItem[] {
	const segments = pathname.split("/").filter(Boolean);
	const adminSegments = segments[0] === "admin" ? segments : ["admin"];
	const items: AdminBreadcrumbItem[] = [
		{
			key: "/admin",
			label: "Admin",
		},
	];

	const entityType = adminSegments[1];
	if (!entityType) {
		return items;
	}

	const entity = getAdminEntityByType(entityType);
	if (entity) {
		items.push({
			entityType: entity.entityType,
			key: entity.route,
			label: entity.pluralLabel,
			route: "entity",
		});

		const recordId = adminSegments[2];
		if (recordId) {
			items.push({
				key: `${entity.route}/${recordId}`,
				label: `Record ${decodeURIComponent(recordId)}`,
			});
		}

		return items;
	}

	items.push({
		key: `/admin/${entityType}`,
		label: formatSegmentLabel(entityType),
		route: undefined,
	});

	return items;
}

export function AdminBreadcrumbs() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const items = getAdminBreadcrumbItems(pathname);

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{items.map((item, index) => {
					const isCurrentPage = index === items.length - 1;

					return (
						<Fragment key={item.key}>
							<BreadcrumbItem>
								{isCurrentPage || !item.route ? (
									<BreadcrumbPage>{item.label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link
											params={{ entitytype: item.entityType }}
											search={EMPTY_ADMIN_DETAIL_SEARCH}
											to="/admin/$entitytype"
											viewTransition
										>
											{item.label}
										</Link>
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
