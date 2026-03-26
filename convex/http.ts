import { httpRouter } from "convex/server";
import { authKit } from "./auth";
import { rotessaWebhook } from "./payments/webhooks/rotessa";
import { stripeWebhook } from "./payments/webhooks/stripe";

const http = httpRouter();

authKit.registerRoutes(http);

http.route({
	path: "/webhooks/rotessa",
	method: "POST",
	handler: rotessaWebhook,
});
http.route({
	path: "/webhooks/stripe",
	method: "POST",
	handler: stripeWebhook,
});

export default http;
