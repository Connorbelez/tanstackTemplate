---
source_url: "https://workos.com/docs/audit-logs"
title: "Audit Logs"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Audit Logs
Audit Logs
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Faudit-logs)
Getting Started[Quick StartQuick Start](https://workos.com/docs/audit-logs)Going Live[Exporting EventsExporting Events](https://workos.com/docs/audit-logs/exporting-events)[Metadata SchemaMetadata Schema](https://workos.com/docs/audit-logs/metadata-schema)[Editing EventsEditing Events](https://workos.com/docs/audit-logs/editing-events)[Admin PortalAdmin Portal](https://workos.com/docs/audit-logs/admin-portal)[Log StreamsLog Streams](https://workos.com/docs/audit-logs/log-streams)
[](https://workos.com/docs/reference/audit-logs)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
![](https://images.workoscdn.com/docs/icons/audit-logs-20220915.png)
# Audit Logs
Ingest and export Audit Log Events from your application.
## On this page
  * [Introduction](https://workos.com/docs/audit-logs#introduction)
  * [What you’ll build](https://workos.com/docs/audit-logs#what-you-will-build)
  * [Before getting started](https://workos.com/docs/audit-logs#before-getting-started)
  * [API object definitions](https://workos.com/docs/audit-logs#api-object-definitions)
  * [Emit an Audit Log Event](https://workos.com/docs/audit-logs#emit-an-audit-log-event)
    * [Install the WorkOS SDK](https://workos.com/docs/audit-logs#install-the-workos-sdk)
    * [Set secrets](https://workos.com/docs/audit-logs#set-secrets)
    * [Sign in to your WorkOS Dashboard account and configure Audit Log Event schemas](https://workos.com/docs/audit-logs#sign-in-to-your-workos-dashboard-account-and-configure-audit-log-event-schemas)
    * [Get an Organization ID](https://workos.com/docs/audit-logs#get-an-organization-id)
    * [Emit Events](https://workos.com/docs/audit-logs#emit-events)
    * [View ingested events in the Dashboard](https://workos.com/docs/audit-logs#view-ingested-events-in-the-dashboard)

## Introduction
[](https://workos.com/docs/audit-logs#introduction)
Audit Logs are a collection of events that contain information relevant to notable actions taken by users in your application. Every event in the collection contains details regarding what kind of action was taken (`action`), who performed the action (`actor`), what resources were affected by the action (`targets`), and additional details of when and where the action took place.
```

| 
{

---|---  

|   "action": "user.signed_in",

|   "occurred_at": "2022-08-29T19:47:52.336Z",

|   "actor": {

|     "type": "user",

|     "id": "user_01GBNJC3MX9ZZJW1FSTF4C5938"

|   },

|   "targets": [

|     {

|       "type": "team",

|       "id": "team_01GBNJD4MKHVKJGEWK42JNMBGS"

|     }

|   ],

|   "context": {

|     "location": "123.123.123.123",

|     "user_agent": "Chrome/104.0.0.0"

|   }

| 
}

```

These events are similar to application logs and analytic events, but are fundamentally different in their intent. They aren’t typically used for active monitoring/alerting, rather they exist as a paper trail of potentially sensitive actions taken by members of an organization for compliance and security reasons.
## What you’ll build
[](https://workos.com/docs/audit-logs#what-you-will-build)
This guide will show you how to:
  1. Configure and emit Audit Log Events
  2. Export Audit Log Events
  3. Create custom metadata schemas for Audit Log Events
  4. Create new versions of Audit Log Event schemas

## Before getting started
[](https://workos.com/docs/audit-logs#before-getting-started)
To get the most out of this guide, you’ll need:
  * A [WorkOS account](https://dashboard.workos.com/)

## API object definitions
[](https://workos.com/docs/audit-logs#api-object-definitions) [Audit Log Event](https://workos.com/docs/reference/audit-logs/event/create)
    An individual event that represents an action taken by an actor within your app. [Audit Log Export](https://workos.com/docs/reference/audit-logs/export)
    A collection of Audit Log Events that are exported from WorkOS as a CSV file. [Organization](https://workos.com/docs/reference/organization)
    Describes a customer where Audit Log Events originate from.
## Emit an Audit Log Event
[](https://workos.com/docs/audit-logs#emit-an-audit-log-event)
### Install the WorkOS SDK
[](https://workos.com/docs/audit-logs#install-the-workos-sdk)
WorkOS offers native SDKs in several popular programming languages. Choose a language below to see instructions in your application’s language.
Don't see an SDK you need? Contact us to request an SDK!
Install the SDK using the command below.
npmnpmYarnYarn
JavaScript
```

| 
npm install @workos-inc/node

---|---  

```

### Set secrets
[](https://workos.com/docs/audit-logs#set-secrets)
To make calls to WorkOS, provide the API key and, in some cases, the client ID. Store these values as managed secrets, such as `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`, and pass them to the SDKs either as environment variables or directly in your app’s configuration based on your preferences.
Environment variables
```

| 
WORKOS_API_KEY='sk_example_123456789[](https://dashboard.workos.com/api-keys)'

---|---  

| 
WORKOS_CLIENT_ID='client_123456789[](https://dashboard.workos.com/api-keys)'

```

### Sign in to your WorkOS Dashboard account and configure Audit Log Event schemas
[](https://workos.com/docs/audit-logs#sign-in-to-your-workos-dashboard-account-and-configure-audit-log-event-schemas)
Before you can emit any Audit Log Events you must configure the allowed event schemas. To start, click “Create an event” and enter `user.signed_in` for action, `team` for targets, and click “Save event”.
![A screenshot showing how to create an audit log event in the WorkOS dashboard.](https://images.workoscdn.com/images/7658a3b2-1467-4c38-a98f-f99f933c5969.png?auto=format&fit=clip&q=50)
### Get an Organization ID
[](https://workos.com/docs/audit-logs#get-an-organization-id)
All events are scoped to an Organization, so you will need the ID of an Organization in order to emit events.
![A screenshot showing where to find an Organization ID in the WorkOS dashboard.](https://images.workoscdn.com/images/b76c7593-1d85-4f28-951e-24f177b8c233.png?auto=format&fit=clip&q=50)
### Emit Events
[](https://workos.com/docs/audit-logs#emit-events)
Using the ID from the Organization, emit an Audit Log Event with the `action` and `targets` previously configured.
Emit event
JavaScript
```

| 
import { WorkOS } from '@workos-inc/node';

---|---  

| 

| 
const workos = new WorkOS('sk_example_123456789[](https://dashboard.workos.com/api-keys)');

| 

| 
await workos.auditLogs.createEvent[](https://workos.com/docs/reference/audit-logs/create-event)('org_01EHWNCE74X7JSDV0X3SZ3KJNY', {

|   action: 'user.signed_in',

|   occurredAt: new Date(),

|   actor: {

|     type: 'user',

|     id: 'user_01GBNJC3MX9ZZJW1FSTF4C5938',

|   },

|   targets: [

|     {

|       type: 'team',

|       id: 'team_01GBNJD4MKHVKJGEWK42JNMBGS',

|     },

|   ],

|   context: {

|     location: '123.123.123.123',

|     userAgent: 'Chrome/104.0.0.0',

|   },

| 
});

```

#### Idempotency
WorkOS Audit Logs supports idempotency to ensure events are not duplicated when retrying requests. You can provide an `idempotency-key` header with your event creation request. If you don’t provide one, WorkOS will automatically generate one based on the event content.
When you provide an idempotency key:
  * WorkOS creates a hashed key combining your provided key with the event data
  * Subsequent requests with the same idempotency key and event data will return the same response
  * This prevents duplicate events from being created due to network retries or other issues

When you don’t provide an idempotency key:
  * WorkOS automatically generates one using the event content
  * This provides basic duplicate protection based on event data alone

### View ingested events in the Dashboard
[](https://workos.com/docs/audit-logs#view-ingested-events-in-the-dashboard)
Once you have successfully emitted events with the WorkOS SDK, you can view them in the Dashboard under the Organization that the events are associated with.
![A screenshot showing Audit Log events for an organization in the WorkOS dashboard.](https://images.workoscdn.com/images/b03dfaa4-c76a-4d08-a322-53458ba8b24d.png?auto=format&fit=clip&q=50)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
