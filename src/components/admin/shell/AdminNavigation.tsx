"use client";

import {
	AudioWaveform,
	BookOpen,
	Bot,
	Command,
	Frame,
	GalleryVerticalEnd,
	ListChecks,
	Map as MapIcon,
	PieChart,
	SquareTerminal,
} from "lucide-react";
import type * as React from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "#/components/ui/sidebar";
import { NavMain } from "./nav-main";
import { NavProjects } from "./nav-projects";
import { NavUser } from "./nav-user";
import { TeamSwitcher } from "./team-switcher";

//
// ToDo: All this is placeholder!!! Do not go live with this, the sidebar items are basically just lorus ipsum.
const data = {
	user: {
		name: "shadcn",
		email: "m@example.com",
		avatar: "/avatars/shadcn.jpg",
	},
	teams: [
		{
			name: "Acme Inc",
			logo: GalleryVerticalEnd,
			plan: "Enterprise",
		},
		{
			name: "Acme Corp.",
			logo: AudioWaveform,
			plan: "Startup",
		},
		{
			name: "Evil Corp.",
			logo: Command,
			plan: "Free",
		},
	],
	navMain: [
		{
			title: "LMS",
			url: "#",
			icon: SquareTerminal,
			isActive: true,
			items: [
				{
					title: "Mortgages",
					url: "/admin/mortgages",
				},
				{
					title: "Properties",
					url: "/admin/properties",
				},
				{
					title: "Applications",
					url: "/admin/applications",
				},
				{
					title: "Listings",
					url: "/admin/listings",
				},
				{
					title: "Borrowers",
					url: "/admin/borrowers",
				},
				{
					title: "Deals",
					url: "/admin/deals",
				},
				{
					title: "Obligations",
					url: "/admin/obligations",
				},
			],
		},
		{
			title: "User Management",
			url: "#",
			icon: Bot,
			items: [
				{
					title: "Staff",
					url: "#",
				},
				{
					title: "Brokers",
					url: "#",
				},
				{
					title: "Lenders",
					url: "#",
				},
				{
					title: "Lawyers",
					url: "#",
				},
			],
		},
		{
			title: "Deals",
			url: "#",
			icon: BookOpen,
			items: [
				{
					title: "Live Deals",
					url: "#",
				},
				{
					title: "Archived Deals",
					url: "#",
				},
			],
		},
	],
	projects: [
		{
			name: "ledger",
			url: "#",
			icon: Frame,
		},
		{
			name: "Dispersement",
			url: "#",
			icon: PieChart,
		},
		{
			name: "dev",
			url: "#",
			icon: MapIcon,
		},
		{
			name: "Custom Object 4",
			url: "#",
			icon: PieChart,
		},
		{
			name: "Custom Object 5",
			url: "#",
			icon: ListChecks,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<TeamSwitcher teams={data.teams} />
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
				<NavProjects projects={data.projects} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={data.user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
