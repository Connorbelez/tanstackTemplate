import type { CSSProperties, ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AppSidebar } from "./AdminNavigation";

export interface AdminLayoutProps {
	children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width-icon": "4rem",
				} as CSSProperties
			}
		>
			<AppSidebar />
			<SidebarInset>
				<div className="flex min-h-svh flex-col">
					<header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
						<div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
							<div className="flex min-w-0 items-center gap-2">
								<SidebarTrigger className="-ml-1" />
								<Separator
									className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block"
									orientation="vertical"
								/>
								<div className="min-w-0">
									<AdminBreadcrumbs />
								</div>
							</div>
						</div>
					</header>
					<div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
						{children}
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
