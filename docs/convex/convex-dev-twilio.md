---
name: convex-dev-twilio
description: Send and receive SMS messages in Convex using Twilio with action-based delivery, webhook route registration, and synced messaging workflows. Use when working with SMS, phone messaging, notifications, Twilio, OTP, or inbound message handling.
---

# Twilio

## Instructions

Twilio is a Convex component that provides SMS sending and receiving inside your Convex app through Twilio.

Use this component whenever you need phone-based messaging, including transactional SMS, OTP delivery, support inboxes, inbound keyword handling, alerts, reminders, or other Twilio-powered notification flows.

### Installation

Because this project uses Bun, install it with:

```bash
bun add @convex-dev/twilio
```

Then add the component to `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import twilio from "@convex-dev/twilio/convex.config";

const app = defineApp();

app.use(workOSAuthKit);
app.use(twilio);

export default app;
```

### Environment Variables

Set the required Twilio credentials in your Convex deployment environment:

- `TWILIO_ACCOUNT_SID` - Your Twilio account SID
- `TWILIO_AUTH_TOKEN` - Your Twilio auth token
- `TWILIO_PHONE_NUMBER` - The Twilio phone number you want to send from

### Capabilities

- Send outbound SMS messages from Convex actions
- Receive inbound Twilio webhook events inside Convex
- Centralize message sending logic in backend code
- Support default sender configuration for simpler outbound messaging
- Build OTP, alerts, reminders, support, and notification flows
- Keep messaging logic close to your app's existing Convex domain logic

## Examples

### how to initialize the Twilio client in Convex

Create a shared Twilio client in your Convex code:

```ts
import { Twilio } from "@convex-dev/twilio";
import { components } from "./_generated/api";

export const twilio = new Twilio(components.twilio, {
  defaultFrom: process.env.TWILIO_PHONE_NUMBER!,
});
```

This shared module is a good place to centralize sender configuration and reuse the same client across multiple actions.

### how to register Twilio webhook routes in Convex

Register the HTTP routes using the shared Twilio client:

```ts
import { httpRouter } from "convex/server";
import { twilio } from "./twilioClient";

const http = httpRouter();

twilio.registerRoutes(http);

export default http;
```

Use this when your app needs to receive inbound messages, Twilio status callbacks, or other webhook-driven SMS workflows.

### how to send an SMS from a Convex action

Create an internal action or action that sends a message:

```ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { twilio } from "./twilioClient";

export const sendSms = internalAction({
  args: {
    to: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    return await twilio.sendMessage(ctx, {
      to: args.to,
      body: args.body,
    });
  },
});
```

This pattern works well for app-triggered messages such as reminders, alerts, verification codes, and account notifications.

### how to build OTP or verification flows with Twilio

Twilio is a good fit for:

- one-time passcodes
- signup verification
- phone number confirmation
- password recovery
- MFA prompts

A common pattern is:

1. Generate a short-lived code in Convex
2. Store it with expiration metadata
3. Send it by SMS with Twilio
4. Verify the submitted code in a mutation
5. Invalidate the code after successful use

### how to use Twilio for reminders and notifications

Use this component when you need:

- repayment reminders
- application status updates
- support responses
- risk or fraud alerts
- delivery or appointment notifications
- operational paging to internal teams

Put domain rules in your own actions and call Twilio only after the app decides a message should actually be sent.

### how to handle inbound SMS messages

Register the webhook routes and then build your app logic around inbound events if users can reply by text.

This is useful for flows like:

- SMS keywords such as `STOP`, `START`, or custom commands
- support inboxes
- reply-based confirmations
- simple mobile-first workflows

Keep authorization and business interpretation in your own Convex code rather than scattering Twilio-specific logic throughout the app.

## Best Practices

- Keep the Twilio client in a shared Convex module.
- Use internal actions for sensitive or system-triggered sends.
- Validate phone numbers before sending.
- Store app-level message metadata if delivery history matters to your product.
- Separate business decisions from message transport.
- Rate limit SMS-triggering actions when abuse is possible.
- Avoid sending secrets or highly sensitive data in plain SMS.
- Add retry or fallback logic only where product requirements justify it.

## Troubleshooting

**Why are messages not sending?**

Check that `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are set correctly in the Convex deployment environment and that the configured number is valid for your Twilio account.

**Why are inbound messages not reaching Convex?**

Make sure the HTTP routes are registered in `convex/http.ts` and that your Twilio webhook configuration points to the correct Convex deployment URL.

**Should I call Twilio directly from the frontend?**

No. Keep Twilio usage in Convex actions or internal actions so credentials stay on the server and message sending remains governed by your backend rules.

**When should I use Twilio instead of email?**

Use Twilio when immediacy, phone-based verification, or SMS-native workflows matter. Use email when you need richer formatting, attachments, inbox history, or lower-cost non-urgent communication.

**Should I store sent messages in my own tables?**

Usually yes if messaging history is part of your product. The component handles Twilio integration, but your app may still need its own records for audits, customer support, analytics, and UI timelines.

**Do I need a Twilio API key?**

You need Twilio credentials, specifically your account SID and auth token. These should be stored securely in Convex environment variables and never hardcoded in the codebase.

## Resources

- [npm package](https://www.npmjs.com/package/@convex-dev/twilio)
- [GitHub repository](https://github.com/get-convex/twilio)
- [Convex Components Directory](https://www.convex.dev/components/twilio)
- [Twilio documentation](https://www.twilio.com/docs)
- [Convex documentation](https://docs.convex.dev)