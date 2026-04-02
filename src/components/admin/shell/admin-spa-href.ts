const ADMIN_HREF_SEPARATOR_PATTERN = /[?#]/;

/** True when `href` is an in-app admin route (SPA navigation + view transitions). */
export function isAdminSpaHref(href: string): boolean {
	const pathname = href.split(ADMIN_HREF_SEPARATOR_PATTERN, 1)[0];
	return pathname === "/admin" || pathname.startsWith("/admin/");
}
