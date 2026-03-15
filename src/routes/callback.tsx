import { createFileRoute } from "@tanstack/react-router";
import { handleCallbackRoute } from "@workos/authkit-tanstack-react-start";

const innerHandler = handleCallbackRoute({
	onSuccess: async ({ user, authenticationMethod }) => {
		console.log(
			"[callback] SUCCESS — user:",
			user.id,
			user.email,
			"method:",
			authenticationMethod
		);
	},
	onError: ({ error }) => {
		console.error("[callback] ERROR:", error);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	},
});

export const Route = createFileRoute("/callback")({
	server: {
		handlers: {
			GET: async (ctx: { request: Request }) => {
				const response = await innerHandler(ctx);
				console.log("[callback] response status:", response.status);
				console.log(
					"[callback] response headers:",
					Object.fromEntries(response.headers.entries())
				);
				console.log(
					"[callback] has Set-Cookie:",
					response.headers.has("Set-Cookie")
				);
				return response;
			},
		},
	},
});
