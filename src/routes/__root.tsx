import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import type { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { AppErrorComponent } from "../components/error-boundary";
import Footer from "../components/footer";
import Header from "../components/header";
import appCss from "../styles.css?url";

// Suppress known TanStack Start SSR hydration warning (dev-only, harmless)
const SUPPRESS_WARNINGS_SCRIPT = `(function(){if(typeof window!=='undefined'){var ow=console.warn;console.warn=function(){if(typeof arguments[0]==='string'&&arguments[0].indexOf('useRouter must be used inside')!==-1)return;ow.apply(console,arguments)}}})();`;

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

const fetchWorkosAuth = createServerFn({ method: "GET" }).handler(async () => {
	const auth = await getAuth();
	const { user } = auth;

	return {
		userId: user?.id ?? null,
		token: user ? auth.accessToken : null,
	};
});

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
	convexClient: ConvexReactClient;
	convexQueryClient: ConvexQueryClient;
}>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Convex + TanStack Start + WorkOS AuthKit",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/convex.svg" },
		],
	}),
	component: RootComponent,
	errorComponent: ({ error, reset }) => (
		<RootDocument>
			<AppErrorComponent error={error} reset={reset} />
		</RootDocument>
	),
	notFoundComponent: () => (
		<RootDocument>
			<AppErrorComponent
				error={Object.assign(new Error("Page not found"), {
					name: "NotFoundError",
				})}
			/>
		</RootDocument>
	),
	beforeLoad: async (ctx) => {
		const { userId, token } = await fetchWorkosAuth();

		// During SSR only (the only time serverHttpClient exists),
		// set the WorkOS auth token to make HTTP queries with.
		if (token) {
			ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
		}

		return { userId, token };
	},
});

function RootComponent() {
	return (
		<RootDocument>
			<Header />
			<Outlet />
			<Footer />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<ScriptOnce>{SUPPRESS_WARNINGS_SCRIPT}</ScriptOnce>
				<ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
				<HeadContent />
			</head>
			<body className="wrap-anywhere font-sans antialiased selection:bg-[rgba(79,184,178,0.24)]">
				{children}
				<Scripts />
			</body>
		</html>
	);
}
