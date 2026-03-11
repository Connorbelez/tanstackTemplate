import { redirect } from "@tanstack/react-router";

export function getReturnPathname(redirectTo: unknown) {
	if (typeof redirectTo !== "string") {
		return undefined;
	}

	return redirectTo.startsWith("/") ? redirectTo : undefined;
}

export async function buildSignInRedirect(
	getUrl: (options?: { data: { returnPathname: string } }) => Promise<string>,
	redirectTo: unknown
) {
	const returnPathname = getReturnPathname(redirectTo);
	const href = await getUrl(
		returnPathname
			? {
					data: { returnPathname },
				}
			: undefined
	);

	return redirect({ href });
}

export async function buildSignUpRedirect(
	getUrl: (options?: { data: { returnPathname: string } }) => Promise<string>,
	redirectTo: unknown
) {
	const returnPathname = getReturnPathname(redirectTo);
	const href = await getUrl(
		returnPathname
			? {
					data: { returnPathname },
				}
			: undefined
	);

	return redirect({ href });
}
