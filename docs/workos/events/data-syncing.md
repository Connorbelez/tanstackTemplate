---
source_url: "https://workos.com/docs/events/data-syncing"
title: "Data syncing"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Events
Events
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fevents%2Fdata-syncing)
[Event typesEvent types](https://workos.com/docs/events)Data syncing[OverviewOverview](https://workos.com/docs/events/data-syncing)[Syncing with events APISyncing with events API](https://workos.com/docs/events/data-syncing/events-api)[Syncing with webhooksSyncing with webhooks](https://workos.com/docs/events/data-syncing/webhooks)[Data reconciliationData reconciliation](https://workos.com/docs/events/data-syncing/data-reconciliation)Observability[Streaming to DatadogStreaming to Datadog](https://workos.com/docs/events/observability/datadog)
[](https://workos.com/docs/reference)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Data syncing
Keep your app in sync with WorkOS.
## On this page
  * [Introduction](https://workos.com/docs/events/data-syncing#introduction)
  * [Sync using the events API](https://workos.com/docs/events/data-syncing#sync-using-the-events-api)
  * [Sync using webhooks](https://workos.com/docs/events/data-syncing#sync-using-webhooks)
  * [API vs. webhooks](https://workos.com/docs/events/data-syncing#api-vs-webhooks)

## Introduction
[](https://workos.com/docs/events/data-syncing#introduction)
Syncing your app data with WorkOS is done using events. Events represent activity that has occurred within WorkOS or within third-party identity and directory providers that interact with WorkOS.
When important activity occurs, we record an event. For example, a new SSO connection being activated is an event. A user being created, assigned membership to an organization, or successfully signing in are all events as well. Events are activity that your application might be interested in for the purposes of syncing data or extending your application’s business logic.
Your app can consume events from WorkOS via either the events API or webhooks.
A sample event
JSON
```

| 
{

---|---  

|   "object": "event",

|   "id": "event_07FKJ843CVE8F7BXQSPFH0M53V",

|   "event": "dsync.user.updated",

|   "data": {

|     "id": "directory_user_01E1X1B89NH8Z3SDFJR4H7RGX7",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "idp_id": "8931",

|     "first_name": "Lela",

|     "last_name": "Block",

|     "email": "lela.block@example.com",

|     "state": "active",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "custom_attributes": {

|       "department": "Engineering",

|       "job_title": "Software Engineer"

|     },

|     "role": { "slug": "member" }

|   },

|   "created_at": "2023-04-28 20:05:31.093"

| 
}

```

## Sync using the events API
[](https://workos.com/docs/events/data-syncing#sync-using-the-events-api)
With the events API, your application retrieves events from WorkOS. The events API offers a more robust data synchronization solution compared to webhooks, ensuring seamless synchronization of your system state with WorkOS. To sync data using the events API, continue to the [events API guide](https://workos.com/docs/events/data-syncing/events-api).
## Sync using webhooks
[](https://workos.com/docs/events/data-syncing#sync-using-webhooks)
With webhooks, WorkOS automatically notifies your app when an event occurs by invoking an endpoint hosted within your application. To sync data using webhooks, continue to the [webhooks guide](https://workos.com/docs/events/data-syncing/webhooks).
## API vs. webhooks
[](https://workos.com/docs/events/data-syncing#api-vs-webhooks)
We recommend using the Events API instead of webhooks to keep your data in sync – especially for [user](https://workos.com/docs/events/user) and [directory](https://workos.com/docs/events/directory-sync) events. With the Events API, you control how often and how much data you ingest. Webhooks, on the other hand, require your endpoint to handle unpredictable spikes in event volume, which can make them harder to manage at scale. That said, webhooks may still be the better fit depending on your use case. Here’s how the two compare:
Aspect | Events API | Webhooks  
---|---|---  
Timing | Controlled by your app. Your server can process events at its own pace. | Real-time. Webhooks trigger as soon as an event occurs.  
Order | A consistent order is guaranteed. | No guarantee of order on receipt. Events contain timestamps to determine order.  
Reconciliation | Replayable. Can go back to a specific point in time and reprocess events. | Failed requests are retried with exponential back-off for up to 3 days.  
Security | Authentication, confidentiality, and integrity protection by default. | You must expose a public endpoint and validate webhook signatures.  
[ Sync data using the events APIA step-by-step guide on how to start syncing data using the API Up next ](https://workos.com/docs/events/data-syncing/events-api)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
