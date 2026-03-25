/**
 * TopNav Component
 *
 * Main desktop navigation with logo, links, and user menu.
 *
 * Located on: Listing Detail Page, Listings Page
 *
 * @example
 * ```tsx
 * import { TopNav } from '@/components/navigation';
 *
 * <TopNav
 *   logo="/logo.svg"
 *   links={[
 *     { label: 'Listings', href: '/listings' },
 *     { label: 'Dashboard', href: '/dashboard' }
 *   ]}
 *   userMenu={{
 *     avatar: 'https://example.com/avatar.jpg',
 *     name: 'John Doe',
 *     onSignOut: () => {}
 *   }}
 * />
 * ```
 */
export interface TopNavProps {
	links: Array<{
		label: string;
		href: string;
		active?: boolean;
	}>;
	logo?: string;
	userMenu?: {
		avatar?: string;
		name: string;
		email?: string;
		onSignOut?: () => void;
		onProfile?: () => void;
	};
	variant?: "default" | "transparent";
}

export function TopNav({
	logo: _logo,
	links: _links,
	userMenu: _userMenu,
	variant: _variant = "default",
}: TopNavProps) {
	// Implementation placeholder - design analysis only
	throw new Error("TopNav not implemented yet");
}
