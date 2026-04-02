/** True when `href` is an in-app admin route (SPA navigation + view transitions). */
export function isAdminSpaHref(href: string): boolean {
	return href === "/admin" || href.startsWith("/admin/");
}
