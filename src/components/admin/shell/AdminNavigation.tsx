"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import type { ComponentProps } from "react";
import { EntityIcon } from "#/components/admin/shell/entity-icon";
import {
	getAdminNavigationSections,
	isAdminRouteActive,
} from "#/components/admin/shell/entity-registry";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "#/components/ui/sidebar";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { cn } from "#/lib/utils";
import { AdminUserMenu } from "./AdminUserMenu";

function AdminSidebarLink({
	collapsed = false,
	item,
}: {
	collapsed?: boolean;
	item: ReturnType<typeof getAdminNavigationSections>[number]["items"][number];
}) {
	if (item.kind === "entity") {
		return (
			<Link
				className={cn(
					"flex w-full min-w-0 items-center gap-3",
					collapsed ? "justify-center" : "justify-start"
				)}
				params={{ entitytype: item.entityType }}
				search={EMPTY_ADMIN_DETAIL_SEARCH}
				to="/admin/$entitytype"
				viewTransition
			>
				<EntityIcon
					className={cn("shrink-0", collapsed ? "size-5" : "size-4")}
					iconName={item.iconName}
				/>
				{collapsed ? (
					<span className="sr-only">{item.label}</span>
				) : (
					<span className="truncate">{item.label}</span>
				)}
			</Link>
		);
	}

	return (
		<Link
			className={cn(
				"flex w-full min-w-0 items-center gap-3",
				collapsed ? "justify-center" : "justify-start"
			)}
			search={EMPTY_ADMIN_DETAIL_SEARCH}
			to="/admin"
			viewTransition
		>
			<EntityIcon
				className={cn("shrink-0", collapsed ? "size-5" : "size-4")}
				iconName={item.iconName}
			/>
			{collapsed ? (
				<span className="sr-only">{item.label}</span>
			) : (
				<span className="truncate">{item.label}</span>
			)}
		</Link>
	);
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const { state } = useSidebar();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const isCollapsed = state === "collapsed";
	const navigationSections = getAdminNavigationSections();
	const navigationItems = navigationSections.flatMap(
		(section) => section.items
	);

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader className={cn(isCollapsed ? "px-2 py-3" : "px-3 py-3")}>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className={cn(
								"h-11 rounded-xl",
								isCollapsed ? "mx-auto h-11 px-0" : "px-3"
							)}
							tooltip="FairLend Admin"
						>
							<Link
								className={cn(
									"flex w-full min-w-0 items-center",
									isCollapsed ? "justify-center" : "gap-3"
								)}
								search={EMPTY_ADMIN_DETAIL_SEARCH}
								to="/admin"
								viewTransition
							>
								<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
									<Shield className={cn(isCollapsed ? "size-5" : "size-4")} />
								</div>
								{isCollapsed ? null : (
									<div className="grid flex-1 text-left leading-tight">
										<span className="font-semibold text-sm">
											FairLend Admin
										</span>
										<span className="text-sidebar-foreground/70 text-xs">
											Backoffice shell
										</span>
									</div>
								)}
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent className={cn(isCollapsed ? "px-2" : "px-3 pb-3")}>
				{isCollapsed ? (
					<SidebarMenu className="gap-2">
						{navigationItems.map((item) => {
							const isActive = isAdminRouteActive(pathname, item.route);

							return (
								<SidebarMenuItem key={item.route}>
									<SidebarMenuButton
										asChild
										className={cn(
											"h-11 w-full justify-center rounded-xl px-0",
											isActive &&
												"bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
										)}
										isActive={isActive}
										tooltip={item.label}
									>
										<AdminSidebarLink collapsed item={item} />
									</SidebarMenuButton>
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				) : (
					navigationSections.map((section) => (
						<SidebarGroup className="p-0" key={section.domain}>
							<SidebarGroupLabel className="px-3 pb-1 font-semibold text-[11px] text-sidebar-foreground/55 uppercase tracking-[0.14em]">
								{section.label}
							</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu className="gap-1.5">
									{section.items.map((item) => {
										const isActive = isAdminRouteActive(pathname, item.route);

										return (
											<SidebarMenuItem key={item.route}>
												<SidebarMenuButton
													asChild
													className={cn(
														"h-10 rounded-xl px-3 text-sidebar-foreground/80 text-sm hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border))]"
													)}
													isActive={isActive}
												>
													<AdminSidebarLink item={item} />
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))
				)}
			</SidebarContent>
			<SidebarFooter
				className={cn(
					"mt-auto border-sidebar-border/60 border-t",
					isCollapsed ? "px-2 py-3" : "px-3 py-3"
				)}
			>
				<AdminUserMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
