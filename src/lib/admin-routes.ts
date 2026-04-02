export function isAdminPathname(pathname: string): boolean {
	return pathname === "/admin" || pathname.startsWith("/admin/");
}
