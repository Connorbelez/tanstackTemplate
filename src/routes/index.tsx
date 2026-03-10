import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	getSignInUrl,
	getSignUpUrl,
} from "@workos/authkit-tanstack-react-start";
import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({
	component: Home,
	loader: async () => {
		const signInUrl = await getSignInUrl();
		const signUpUrl = await getSignUpUrl();

		return { signInUrl, signUpUrl };
	},
});

function Home() {
	const { signInUrl, signUpUrl } = Route.useLoaderData();
	return <HomeContent signInUrl={signInUrl} signUpUrl={signUpUrl} />;
}

function HomeContent({
	signInUrl,
	signUpUrl,
}: {
	signInUrl: string;
	signUpUrl: string;
}) {
	return (
		<main className="page-wrap flex flex-col gap-8 px-4 py-10 sm:py-12">
			<h1 className="text-center text-4xl font-bold">
				Convex + TanStack Start + WorkOS
			</h1>
			<Authenticated>
				<Content />
			</Authenticated>
			<Unauthenticated>
				<SignInForm signInUrl={signInUrl} signUpUrl={signUpUrl} />
			</Unauthenticated>
		</main>
	);
}

function SignInForm({
	signInUrl,
	signUpUrl,
}: {
	signInUrl: string;
	signUpUrl: string;
}) {
	return (
		<div className="flex flex-col gap-8 w-96 mx-auto">
			<p>Log in to see the numbers</p>
			<a
				href={signInUrl}
				className="bg-foreground text-background px-4 py-2 rounded-md text-center"
			>
				Sign in
			</a>
			<a
				href={signUpUrl}
				className="bg-foreground text-background px-4 py-2 rounded-md text-center"
			>
				Sign up
			</a>
		</div>
	);
}

function Content() {
	const {
		data: { viewer, numbers },
	} = useSuspenseQuery(
		convexQuery(api.myFunctions.listNumbers, {
			count: 10,
		}),
	);
	const addNumber = useMutation(api.myFunctions.addNumber);

	return (
		<div className="flex flex-col gap-8 max-w-lg mx-auto">
			<p>Welcome {viewer}!</p>
			<p>
				Click the button below and open this page in another window - this data
				is persisted in the Convex cloud database!
			</p>
			<p>
				<Button
					className="bg-foreground text-background text-sm px-4 py-2 rounded-md"
					onClick={() => {
						void addNumber({ value: Math.floor(Math.random() * 10) });
					}}
				>
					Add a random number
				</Button>
			</p>
			<p>
				Numbers:{" "}
				{numbers.length === 0 ? "Click the button!" : numbers.join(", ")}
			</p>
			<p>
				Edit{" "}
				<code className="text-sm font-bold font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded-md">
					convex/myFunctions.ts
				</code>{" "}
				to change your backend
			</p>
			<p>
				Edit{" "}
				<code className="text-sm font-bold font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded-md">
					src/routes/index.tsx
				</code>{" "}
				to change your frontend
			</p>
			<p>
				See{" "}
				<Link to="/authenticated" className="underline hover:no-underline">
					/authenticated
				</Link>{" "}
				for an example of a page only available to authenticated users.
			</p>
			<div className="flex flex-col">
				<p className="text-lg font-bold">Useful resources:</p>
				<div className="flex gap-2">
					<div className="flex flex-col gap-2 w-1/2">
						<ResourceCard
							title="Convex docs"
							description="Read comprehensive documentation for all Convex features."
							href="https://docs.convex.dev/home"
						/>
						<ResourceCard
							title="Stack articles"
							description="Learn about best practices, use cases, and more from a growing collection of articles, videos, and walkthroughs."
							href="https://stack.convex.dev"
						/>
					</div>
					<div className="flex flex-col gap-2 w-1/2">
						<ResourceCard
							title="Templates"
							description="Browse our collection of templates to get started quickly."
							href="https://www.convex.dev/templates"
						/>
						<ResourceCard
							title="Discord"
							description="Join our developer community to ask questions, trade tips & tricks, and show off your projects."
							href="https://www.convex.dev/community"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function ResourceCard({
	title,
	description,
	href,
}: {
	title: string;
	description: string;
	href: string;
}) {
	return (
		<div className="flex flex-col gap-2 bg-slate-200 dark:bg-slate-800 p-4 rounded-md h-28 overflow-auto">
			<a href={href} className="text-sm underline hover:no-underline">
				{title}
			</a>
			<p className="text-xs">{description}</p>
		</div>
	);
}
