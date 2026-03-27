import { httpRouter } from "convex/server";
import { authKit } from "./auth";
import { rotessaWebhook } from "./payments/webhooks/rotessa";
import { stripeWebhook } from "./payments/webhooks/stripe";
import { vopayWebhook } from "./payments/webhooks/vopay";

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
http.route({
	path: "/webhooks/pad_vopay",
	method: "POST",
	handler: vopayWebhook,
});

export default http;
