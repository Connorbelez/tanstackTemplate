"use client";

import { Link } from "@tanstack/react-router";
import {
	BadgeCheck,
	Building2,
	ChevronsUpDown,
	LogOut,
	Shield,
} from "lucide-react";
import { useMemo } from "react";
import { useAppAuth } from "#/hooks/use-app-auth";
import { isRouterTeardownSignOutError } from "#/lib/workos-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";

const WHITESPACE_REGEX = /\s+/;

function getInitials(name: string): string {
	const parts = name
		.split(WHITESPACE_REGEX)
		.map((part) => part.trim())
		.filter(Boolean)
		.slice(0, 2);

	if (parts.length === 0) {
		return "FL";
	}

	return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function AdminUserMenu() {
	const { state } = useSidebar();
	const { orgId, role, signOut, user } = useAppAuth();
	const isCollapsed = state === "collapsed";

	const displayName = useMemo(() => {
		const fullName = [user?.firstName, user?.lastName]
			.filter(Boolean)
			.join(" ");
		return fullName || user?.email || "Admin User";
	}, [user?.email, user?.firstName, user?.lastName]);

	const initials = useMemo(() => getInitials(displayName), [displayName]);

	const handleSignOut = () => {
		void signOut().catch((error) => {
			if (isRouterTeardownSignOutError(error)) {
				window.location.href = "/";
				return;
			}

			console.error("Sign out failed:", error);
		});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className={
						isCollapsed
							? "h-11 w-full rounded-xl px-0"
							: "h-auto w-full min-w-0 justify-start gap-3 rounded-xl px-3 py-2"
					}
					type="button"
					variant="ghost"
				>
					<Avatar className="h-9 w-9 shrink-0 border">
						<AvatarImage
							alt={displayName}
							src={user?.profilePictureUrl ?? undefined}
						/>
						<AvatarFallback>{initials}</AvatarFallback>
					</Avatar>
					{isCollapsed ? (
						<span className="sr-only">{displayName}</span>
					) : (
						<>
							<div className="min-w-0 flex-1 text-left">
								<p className="truncate font-medium text-sm">{displayName}</p>
								<p className="truncate text-muted-foreground text-xs">
									{role ?? "admin"}
								</p>
							</div>
							<ChevronsUpDown className="size-4 text-muted-foreground" />
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={isCollapsed ? "start" : "end"}
				className="w-72"
				side={isCollapsed ? "right" : "top"}
			>
				<DropdownMenuLabel className="space-y-3 p-3">
					<div className="flex items-center gap-3">
						<Avatar className="h-10 w-10 border">
							<AvatarImage
								alt={displayName}
								src={user?.profilePictureUrl ?? undefined}
							/>
							<AvatarFallback>{initials}</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<p className="truncate font-medium text-sm">{displayName}</p>
							<p className="truncate text-muted-foreground text-xs">
								{user?.email ?? "No email"}
							</p>
						</div>
					</div>
					<div className="grid gap-2 text-muted-foreground text-xs">
						<div className="flex items-center gap-2">
							<Shield className="size-3.5" />
							<span>Role: {role ?? "admin"}</span>
						</div>
						<div className="flex items-center gap-2">
							<Building2 className="size-3.5" />
							<span>Org: {orgId ?? "No organization"}</span>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/about" viewTransition>
						<BadgeCheck className="size-4" />
						About FairLend
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleSignOut}>
					<LogOut className="size-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
