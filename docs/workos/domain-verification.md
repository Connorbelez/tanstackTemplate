---
source_url: "https://workos.com/docs/domain-verification"
title: "Domain Verification"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Domain Verification
Domain Verification
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fdomain-verification)
[Quick StartQuick Start](https://workos.com/docs/domain-verification)[APIAPI](https://workos.com/docs/domain-verification/api)
[](https://workos.com/docs/reference/domain-verification)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
![](https://images.workoscdn.com/images/e7d34bcd-09a5-457c-b894-c77e7164b4d2.png)
# Domain Verification
Self-serve domain verification
# Introduction
## On this page
  * [Before getting started](https://workos.com/docs/domain-verification#before-getting-started)
    * [API object definitions](https://workos.com/docs/domain-verification#api-object-definitions)
  * [A. Setup link from the WorkOS dashboard](https://workos.com/docs/domain-verification#a-setup-link-from-the-workos-dashboard)
  * [B. Integrate with your app](https://workos.com/docs/domain-verification#b-integrate-with-your-app)
  * [Admin Portal domain verification](https://workos.com/docs/domain-verification#admin-portal-domain-verification)

Domain Verification allows your customers to claim ownership of a domain. Once they have claimed ownership, features that require a higher level of trust and security can be activated.
WorkOS Domain Verification provides a self-serve flow through the Admin Portal in which IT admins can prove ownership through the creation of DNS TXT records.
## Before getting started
[](https://workos.com/docs/domain-verification#before-getting-started)
You’ll need a [WorkOS account](https://dashboard.workos.com/).
### API object definitions
[](https://workos.com/docs/domain-verification#api-object-definitions) [Organization](https://workos.com/docs/reference/organization)
    Describes an organization whose users sign in with a SSO Connection, or whose users are synced with a Directory Sync Connection. [Organization Domain](https://workos.com/docs/reference/domain-verification)
    Describes a domain associated to an organization, verified or unverified. [Portal Link](https://workos.com/docs/reference/admin-portal/portal-link)
    A temporary link to initiate an Admin Portal session. Valid for 5 minutes.
All domains belong to an [Organization](https://workos.com/docs/reference/organization). In order to create and verify a domain through the Admin Portal, an Organization must first be [created](https://workos.com/docs/reference/organization/create).
##  A. Setup link from the WorkOS dashboard
[](https://workos.com/docs/domain-verification#a-setup-link-from-the-workos-dashboard)
  * Sign in to your [WorksOS dashboard](https://dashboard.workos.com/) account and create or locate an Organization.
  * Click the “Invite Admin” button, select **Domain Verification** then click “Next.” Enter the email of the IT admin for the organization to automatically send them a setup link, or click “Copy setup link”.

If you chose to copy the setup link you can share it over email, Slack or direct message. We also recommend including details on what the link does and how long the link is active.
![A screenshot showing the workOS dashboard admin invite.](https://images.workoscdn.com/images/c9196bbf-3860-4a9a-be8c-83b503ae4e3d.png?auto=format&fit=clip&q=80)
##  B. Integrate with your app
[](https://workos.com/docs/domain-verification#b-integrate-with-your-app)
Admin Portal links can also be programmatically generated for the domain verification flow. This can be used to provide a link to the Admin Portal flow directly in your application.
You’ll have to generate the link with the `domain_verification` intent:
Create Admin Portal Link for Domain Verification
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
const { link } = await workos.portal.generateLink[](https://workos.com/docs/reference/admin-portal/portal-link/generate)({

|   organization: 'org_01EHZNVPK3SFK441A1RGBFSHRT',

|   intent: 'domain_verification',

| 
});

| 

| 
// Redirect to link

```

Please refer to the [Admin Portal Integration Guide](https://workos.com/docs/admin-portal/b-integrate-with-your-app) for additional integration details.
## Admin Portal domain verification
[](https://workos.com/docs/domain-verification#admin-portal-domain-verification)
After receiving the invitation and clicking on the setup link, the organization’s admin is prompted to enter the domain they wish to verify.
![A screenshot show the Admin portal domain entry form.](https://images.workoscdn.com/images/e7e719d6-579b-4567-8c80-772bc2f77563.png?auto=format&fit=clip&q=80)
If the domain is valid, we identify the DNS service provider and offer custom setup instructions.
The admin will find instruction to add a DNS TXT record with a token generated by our system.
![A screenshot showing the Admin Portal domain DNS instructions.](https://images.workoscdn.com/images/9ab7e2a4-8b11-4a03-8203-d95d1c1abb07.png?auto=format&fit=clip&q=80)
When we detect and verify the DNS record, we will mark the domain as `verified` and dispatch a [domain verification event](https://workos.com/docs/events) to inform your application.
[ APIProgrammatic domain verification Up next ](https://workos.com/docs/domain-verification/api)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
