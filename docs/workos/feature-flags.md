---
source_url: "https://workos.com/docs/feature-flags"
title: "Feature Flags"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Feature Flags
Feature Flags
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Ffeature-flags)
[Quick StartQuick Start](https://workos.com/docs/feature-flags)[Slack NotificationsSlack Notifications](https://workos.com/docs/feature-flags/slack-notifications)
[](https://workos.com/docs/reference/feature-flags)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
![](https://images.workoscdn.com/images/21e06a1f-2a0e-4421-acda-2505254088fb.png)
# Feature Flags
Manage rollout of new features for specific users and organizations with Feature Flags.
## On this page
  * [Overview](https://workos.com/docs/feature-flags#overview)
  * [Use cases](https://workos.com/docs/feature-flags#use-cases)
  * [Before getting started](https://workos.com/docs/feature-flags#before-getting-started)
  * [API object definitions](https://workos.com/docs/feature-flags#api-object-definitions)
  * [1. Create a feature flag from the WorkOS dashboard](https://workos.com/docs/feature-flags#1-create-a-feature-flag-from-the-workos-dashboard)
  * [2. Set the users and organizations that should have access](https://workos.com/docs/feature-flags#2-set-the-users-and-organizations-that-should-have-access)
  * [3. Enable the feature flag](https://workos.com/docs/feature-flags#3-enable-the-feature-flag)
  * [4. Use the feature flags in your application](https://workos.com/docs/feature-flags#4-use-the-feature-flags-in-your-application)

## Overview
[](https://workos.com/docs/feature-flags#overview)
Feature flags are a tool that allows teams to control the rollout of features in real time. They enable businesses to separate feature delivery from code deployment, creating a more agile and risk-managed approach to launching and managing product experiences.
WorkOS Feature Flags provides a developer-friendly solution that integrates seamlessly with your existing authentication flow. Create and manage flags through the dashboard then access them through a user’s access token. Feature flags can target organizations or individual users. This approach lets you safely roll out new functionality, enable beta programs for select customers, and manage premium feature access without deploying code changes.
## Use cases
[](https://workos.com/docs/feature-flags#use-cases)
  * **Targeted rollouts:** Enable features for specific organizations before a general release
  * **Beta programs:** Allow early access to new features for select customers
  * **Premium features:** Restrict advanced functionality to organizations on higher-tier plans

## Before getting started
[](https://workos.com/docs/feature-flags#before-getting-started)
To get the most out of these guides, you’ll need:
  * A [WorkOS account](https://dashboard.workos.com/)
  * An existing organization in your WorkOS Dashboard

![WorkOS Dashboard UI showing organization creation](https://images.workoscdn.com/images/1c69fd98-01be-491d-9255-58363bc6a983.png?auto=format&fit=clip&q=50)
## API object definitions
[](https://workos.com/docs/feature-flags#api-object-definitions) [Organization](https://workos.com/docs/reference/organization)
    Describes an organization whose users sign in with a SSO Connection, or whose users are synced with a Directory Sync Connection. [User](https://workos.com/docs/reference/authkit/user)
    Describes a user who can be targeted with feature flags.
##  1. Create a feature flag from the WorkOS dashboard
[](https://workos.com/docs/feature-flags#1-create-a-feature-flag-from-the-workos-dashboard)
  * Sign in to your [WorkOS dashboard](https://dashboard.workos.com/) account and navigate to the Feature Flags page.
  * Click the `Create feature flag` button and enter a name, slug, and description.

![A screenshot showing the WorkOS dashboard feature flags page.](https://images.workoscdn.com/images/9be5d8f6-8956-47fc-aca6-66478bb37881.png?auto=format&fit=clip&q=80)
Feature flags are created across all environments, allowing you to test your feature flag in a sandbox environment before enabling it in production.
##  2. Set the users and organizations that should have access
[](https://workos.com/docs/feature-flags#2-set-the-users-and-organizations-that-should-have-access)
To edit which set of users and organizations should have the feature flag enabled, click `Edit` on the rule for the environment you want to edit. Next, select your desired rule setting between `None`, `Some`, and `All`. Selecting `Some` will allow you select specific users and organizations.
To edit a feature flag’s rules in other environments, click the `Edit in X` button which will update your active dashboard environment to the selected environment, allowing you to update rules in the chosen environment.
![A screenshot showing the configuration of a feature flag organization rule.](https://images.workoscdn.com/images/bf958da9-1288-464c-b087-b54f60f03171.png?auto=format&fit=clip&q=80)
![A screenshot showing the configuration of a feature flag user rule.](https://images.workoscdn.com/images/32f8b6da-d357-4ac7-b9b3-96c9cf3ef60f.png?auto=format&fit=clip&q=80)
##  3. Enable the feature flag
[](https://workos.com/docs/feature-flags#3-enable-the-feature-flag)
Once you’re ready to enable the feature for the configured set of organizations and users, toggle the flag on to start including it in a user’s access token when they authenticate for a configured organization or when the user is individually targeted.
![A screenshot showing the enabling of a feature flag.](https://images.workoscdn.com/images/f526ab53-0ec5-4261-abe5-24f05e92cdd8.png?auto=format&fit=clip&q=80)
##  4. Use the feature flags in your application
[](https://workos.com/docs/feature-flags#4-use-the-feature-flags-in-your-application)
The access token includes the `feature_flags` claim, containing the user’s entitlements. You can use this information to gate access to features in your application.
Feature flags will show up in the access token the next time the user logs in or the session is refreshed. You can manually [refresh the session](https://workos.com/docs/reference/authkit/authentication/refresh-token) after granting the organization access in the dashboard.
Server-sideServer-sideClient-sideClient-side
JavaScript
```

| 
app.get('/api/feature-flags', async (req, res) => {

---|---  

|   // load the original session

|   const [session](https://workos.com/docs/reference/authkit/session-helpers) = workos.userManagement.loadSealedSession[](https://workos.com/docs/reference/authkit/session-helpers)({

|     cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,

|     sessionData: req.cookies['wos-session'],

|   });

| 

|   const { sealedSession, featureFlags } = await session.refresh[](https://workos.com/docs/reference/authkit/session-helpers)();

| 

|   // set the updated refresh session data in a cookie

|   res.cookie('wos-session', sealedSession, {

|     httpOnly: true,

|     sameSite: 'lax',

|     secure: true,

|   });

| 

|   // return the feature flags to the client

|   res.json({

|     featureFlags,

|   });

| 
});

```

[ Slack NotificationsGet notifications about feature flag changes in your Slack workspace Up next ](https://workos.com/docs/feature-flags/slack-notifications)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
