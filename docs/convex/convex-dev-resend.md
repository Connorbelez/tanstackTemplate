
---
name: convex-dev-resend
description: Official Convex integration for Resend email service with queuing, batching, rate limiting, and guaranteed delivery via durable execution. Use when working with integrations features, email, resend, inbox.
---

# Resend

## Instructions

Resend is a Convex component that provides official convex integration for resend email service with queuing, batching, rate limiting, and guaranteed delivery via durable execution.

### Capabilities

- Send unlimited emails without blocking your application using automatic queuing and batching
- Guarantee exactly-once delivery with built-in idempotency key management and retry logic
- Eliminate email failures from rate limits and network issues with durable Convex workpools
- Scale email sending automatically with Resend's batch API integration for high-volume use cases

## Examples

### how to send transactional emails from Convex functions

The @convex-dev/resend component integrates directly with your Convex mutations and actions to send transactional emails like order confirmations or password resets. It handles queuing and delivery guarantees so your application logic stays fast and reliable.

### bulk email sending with rate limiting in Convex

This component automatically batches large email volumes and respects Resend's API rate limits. You can trigger thousands of emails from a single Convex function without worrying about API throttling or failed deliveries.

### reliable email delivery with retry logic Convex

Using Convex workpools for durable execution, the component automatically retries failed email sends due to network issues or temporary API outages. Idempotency keys prevent duplicate emails during retries, ensuring exactly-once delivery.

## Troubleshooting

**How does the Convex Resend component handle API rate limits?**

The @convex-dev/resend component automatically respects Resend's API rate limits by queuing emails and controlling send rates. It uses Convex's durable execution to retry sends that are throttled, ensuring all emails are eventually delivered without hitting rate limit errors.

**Can I send batch emails without blocking my Convex functions?**

Yes, the Convex Resend component queues all email sends asynchronously using Convex workpools. Your mutations and actions return immediately while emails are processed in the background. Large batches are automatically sent to Resend's batch endpoint for efficiency.

**What happens if Resend is temporarily down when I send emails?**

The @convex-dev/resend component uses Convex's durable execution to automatically retry failed sends due to network outages or API downtime. Emails remain queued and will be delivered once the service recovers, with idempotency keys preventing duplicates.

**How do I prevent duplicate emails when using retries?**

The Convex Resend component automatically manages Resend idempotency keys for every email send. This guarantees exactly-once delivery even when retries occur due to network failures or temporary API issues, preventing accidental spam to your users.

## Resources

- [npm package](https://www.npmjs.com/package/%40convex-dev%2Fresend)
- [GitHub repository](https://github.com/get-convex/resend)
- [Live demo](https://github.com/get-convex/resend-demo?utm_source=yt-convex&utm_medium=video&dub_id=poiVYSbvnlsKYHLg)
- [Convex Components Directory](https://www.convex.dev/components/resend)
- [Convex documentation](https://docs.convex.dev)
