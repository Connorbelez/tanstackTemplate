import { httpRouter } from "convex/server";
import { authKit } from "./auth";
import { eftVopayWebhook } from "./payments/webhooks/eftVopay";
import { rotessaWebhook } from "./payments/webhooks/rotessa";
import { rotessaPadWebhook } from "./payments/webhooks/rotessaPad";
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
	path: "/webhooks/pad_rotessa",
	method: "POST",
	handler: rotessaPadWebhook,
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
http.route({
	path: "/webhooks/eft_vopay",
	method: "POST",
	handler: eftVopayWebhook,
});

export default http;
