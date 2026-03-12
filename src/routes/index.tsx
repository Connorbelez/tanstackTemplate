import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	getSignInUrl,
	getSignUpUrl,
} from "@workos/authkit-tanstack-react-start";
import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { Button } from "#/components/ui/button";
import { api } from "../../convex/_generated/api";

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
			<h1 className="text-center font-bold text-4xl">
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
		<div className="mx-auto flex w-96 flex-col gap-8">
			<p>Log in to see the numbers</p>
			<a
				className="rounded-md bg-foreground px-4 py-2 text-center text-background"
				href={signInUrl}
			>
				Sign in
			</a>
			<a
				className="rounded-md bg-foreground px-4 py-2 text-center text-background"
				href={signUpUrl}
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
		convexQuery(api.numbers.listNumbers, {
			count: 10,
		})
	);
	const addNumber = useMutation(api.numbers.addNumber);

	return (
		<div className="mx-auto flex max-w-lg flex-col gap-8">
			<p>Welcome {viewer}!</p>
			<p>
				Click the button below and open this page in another window - this data
				is persisted in the Convex cloud database!
			</p>
			<p>
				<Button
					className="rounded-md bg-foreground px-4 py-2 text-background text-sm"
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
				<code className="rounded-md bg-slate-200 px-1 py-0.5 font-bold font-mono text-sm dark:bg-slate-800">
					convex/numbers.ts
				</code>{" "}
				to change your backend
			</p>
			<p>
				Edit{" "}
				<code className="rounded-md bg-slate-200 px-1 py-0.5 font-bold font-mono text-sm dark:bg-slate-800">
					src/routes/index.tsx
				</code>{" "}
				to change your frontend
			</p>
			<p>
				See{" "}
				<Link className="underline hover:no-underline" to="/authenticated">
					/authenticated
				</Link>{" "}
				for an example of a page only available to authenticated users.
			</p>
			<div className="flex flex-col">
				<p className="font-bold text-lg">Useful resources:</p>
				<div className="flex gap-2">
					<div className="flex w-1/2 flex-col gap-2">
						<ResourceCard
							description="Read comprehensive documentation for all Convex features."
							href="https://docs.convex.dev/home"
							title="Convex docs"
						/>
						<ResourceCard
							description="Learn about best practices, use cases, and more from a growing collection of articles, videos, and walkthroughs."
							href="https://stack.convex.dev"
							title="Stack articles"
						/>
					</div>
					<div className="flex w-1/2 flex-col gap-2">
						<ResourceCard
							description="Browse our collection of templates to get started quickly."
							href="https://www.convex.dev/templates"
							title="Templates"
						/>
						<ResourceCard
							description="Join our developer community to ask questions, trade tips & tricks, and show off your projects."
							href="https://www.convex.dev/community"
							title="Discord"
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
		<div className="flex h-28 flex-col gap-2 overflow-auto rounded-md bg-slate-200 p-4 dark:bg-slate-800">
			<a className="text-sm underline hover:no-underline" href={href}>
				{title}
			</a>
			<p className="text-xs">{description}</p>
		</div>
	);
}
