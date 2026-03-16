---
source_url: "https://workos.com/docs/sso"
title: "Single Sign-On"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Single Sign-On
Single Sign-On
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fsso)
Getting Started[Quick StartQuick Start](https://workos.com/docs/sso)[Test SSOTest SSO](https://workos.com/docs/sso/test-sso)[Example AppsExample Apps](https://workos.com/docs/sso/example-apps)User Experience[Sign-InSign-In](https://workos.com/docs/sso/ux/sign-in)[SSO SessionsSSO Sessions](https://workos.com/docs/sso/ux/sessions)Going Live[Login FlowsLogin Flows](https://workos.com/docs/sso/login-flows)[Redirect URIsRedirect URIs](https://workos.com/docs/sso/redirect-uris)[DomainsDomains](https://workos.com/docs/sso/domains)[Signing CertificatesSigning Certificates](https://workos.com/docs/sso/signing-certificates)[JIT ProvisioningJIT Provisioning](https://workos.com/docs/sso/jit-provisioning)[Profile AttributesProfile Attributes](https://workos.com/docs/sso/attributes)[Launch ChecklistLaunch Checklist](https://workos.com/docs/sso/launch-checklist)[FAQ for IT teamsFAQ for IT teams](https://workos.com/docs/sso/it-team-faq)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Security[SAML SecuritySAML Security](https://workos.com/docs/sso/saml-security)[Sign-in ConsentSign-in Consent](https://workos.com/docs/sso/sign-in-consent)Mapping Roles[IdP Role AssignmentIdP Role Assignment](https://workos.com/docs/sso/identity-provider-role-assignment)
[](https://workos.com/docs/reference/sso)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
![](https://images.workoscdn.com/docs/icons/sso-20220915.png)
# Single Sign-On
Facilitate greater security, easier account management, and accelerated application onboarding and adoption.
## On this page
  * [Choose your integration approach](https://workos.com/docs/sso#choose-your-integration-approach)
    * [A. With the standalone SSO API](https://workos.com/docs/sso#a-with-the-standalone-sso-api)
    * [B. Using WorkOS AuthKit](https://workos.com/docs/sso#b-using-workos-authkit)
  * [How Single Sign-On works](https://workos.com/docs/sso#how-single-sign-on-works)
  * [What you’ll build](https://workos.com/docs/sso#what-you-will-build)
  * [Before getting started](https://workos.com/docs/sso#before-getting-started)
  * [API object definitions](https://workos.com/docs/sso#api-object-definitions)
  * [1. Add SSO to your app](https://workos.com/docs/sso#1-add-sso-to-your-app)
    * [Install the WorkOS SDK](https://workos.com/docs/sso#install-the-workos-sdk)
    * [Set secrets](https://workos.com/docs/sso#set-secrets)
    * [Add an endpoint to initiate SSO](https://workos.com/docs/sso#add-an-endpoint-to-initiate-sso)
    * [Add a callback endpoint](https://workos.com/docs/sso#add-a-callback-endpoint)
  * [2. Configure a redirect URI](https://workos.com/docs/sso#2-configure-a-redirect-uri)
    * [Identity provider-initiated SSO](https://workos.com/docs/sso#identity-provider-initiated-sso)
  * [3. Test end-to-end](https://workos.com/docs/sso#3-test-end-to-end)

## Choose your integration approach
[](https://workos.com/docs/sso#choose-your-integration-approach)
There are two ways to integrate Single Sign-On (SSO) with WorkOS:
###  A. With the standalone SSO API
[](https://workos.com/docs/sso#a-with-the-standalone-sso-api)
The standalone API (covered in this document), is a standalone API for integrating into an existing auth stack.
###  B. Using WorkOS AuthKit
[](https://workos.com/docs/sso#b-using-workos-authkit)
[AuthKit](https://workos.com/docs/authkit) is a complete authentication platform which includes SSO out of the box.
## How Single Sign-On works
[](https://workos.com/docs/sso#how-single-sign-on-works)
Single Sign-On is the most frequently asked for requirement by organizations looking to adopt new SaaS applications. SSO enables authentication via an organization’s [identity provider (IdP)](https://workos.com/docs/glossary/idp).
This service is compatible with any IdP that supports either the [SAML](https://workos.com/docs/glossary/saml) or [OIDC](https://workos.com/docs/glossary/oidc) protocols. It’s modeled to meet the [OAuth 2.0](https://workos.com/docs/glossary/oauth-2-0) framework specification, abstracting away the underlying authentication handshakes between different IdPs.
![Authentication Flow Diagram](https://images.workoscdn.com/images/90b84f08-3363-446a-8610-f7b2bd2ee2ca.png?auto=format&fit=clip&q=80)
WorkOS SSO API acts as authentication middleware and intentionally does not handle user database management for your application.
## What you’ll build
[](https://workos.com/docs/sso#what-you-will-build)
In this guide, we’ll take you from learning about Single Sign-On and POC-ing all the way through to authenticating your first user via the WorkOS SSO API.
## Before getting started
[](https://workos.com/docs/sso#before-getting-started)
To get the most out of this guide, you’ll need:
  * A [WorkOS account](https://dashboard.workos.com/)
  * A local app to integrate SSO with.

Reference these [example apps](https://workos.com/docs/sso/example-apps) as you follow this guide.
## API object definitions
[](https://workos.com/docs/sso#api-object-definitions) [Connection](https://workos.com/docs/reference/sso/connection)
    The method by which a group of users (typically in a single organization) sign in to your application. [Profile](https://workos.com/docs/reference/sso/profile)
    Represents an authenticated user. The Profile object contains information relevant to a user in the form of normalized and raw attributes.
##  1. Add SSO to your app
[](https://workos.com/docs/sso#1-add-sso-to-your-app)
Let’s build the SSO authentication workflow into your app.
### Install the WorkOS SDK
[](https://workos.com/docs/sso#install-the-workos-sdk)
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
[](https://workos.com/docs/sso#set-secrets)
To make calls to WorkOS, provide the API key and, in some cases, the client ID. Store these values as managed secrets, such as `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`, and pass them to the SDKs either as environment variables or directly in your app’s configuration based on your preferences.
Environment variables
```

| 
WORKOS_API_KEY='sk_example_123456789[](https://dashboard.workos.com/api-keys)'

---|---  

| 
WORKOS_CLIENT_ID='client_123456789[](https://dashboard.workos.com/api-keys)'

```

The code examples use your staging API keys when [signed in](https://dashboard.workos.com)
### Add an endpoint to initiate SSO
[](https://workos.com/docs/sso#add-an-endpoint-to-initiate-sso)
The endpoint to initiate SSO via the WorkOS API is responsible for handing off the rest of the authentication workflow to WorkOS. There are a couple configuration options shown below.
You can use the optional `state` parameter to encode arbitrary information to help restore application state between redirects.
Using organization IDUsing organization IDUsing connection IDUsing connection IDUsing providerUsing provider
Use the organization parameter when authenticating a user by their specific organization. This is the preferred parameter for SAML and OIDC connections.
The example below uses the Test Organization that is available in your staging environment and uses a mock identity provider. It’s created to help you test your SSO integration without having to go through the process of setting up an account with a real identity provider.
Next.jsNext.jsNext.js (App Router)Next.js (App Router)ExpressExpress
JavaScript
```

| 
import type { NextApiRequest, NextApiResponse } from 'next';

---|---  

| 
import { WorkOS } from '@workos-inc/node';

| 

| 
const workos = new WorkOS(process.env.WORKOS_API_KEY);

| 
const clientId = process.env.WORKOS_CLIENT_ID;

| 

| 
export default (_req: NextApiRequest, res: NextApiResponse) => {

|   // Use the Test Organization ID to get started. Replace it with

|   // the user’s real organization ID when you finish the integration.

|   const organization = 'org_test_idp';

| 

|   // The callback URI WorkOS should redirect to after the authentication

|   const redirectUri = 'https://dashboard.my-app.com';

| 

|   const authorizationUrl = workos.sso.getAuthorizationUrl[](https://workos.com/docs/reference/sso/get-authorization-url)({

|     organization,

|     redirectUri,

|     clientId,

|   });

| 

|   res.redirect(authorizationUrl);

| 
};

```

You can also use the connection parameter for SAML or OIDC connections when authenticating a user by their connection ID.
Next.jsNext.jsNext.js (App Router)Next.js (App Router)ExpressExpress
JavaScript
```

| 
import type { NextApiRequest, NextApiResponse } from 'next';

---|---  

| 
import { WorkOS } from '@workos-inc/node';

| 

| 
const workos = new WorkOS(process.env.WORKOS_API_KEY);

| 
const clientId = process.env.WORKOS_CLIENT_ID;

| 

| 
export default (_req: NextApiRequest, res: NextApiResponse) => {

|   // A WorkOS Connection ID

|   const connection = 'connection_123';

| 

|   // The callback URI WorkOS should redirect to after the authentication

|   const redirectUri = 'https://dashboard.my-app.com';

| 

|   const authorizationUrl = workos.sso.getAuthorizationUrl[](https://workos.com/docs/reference/sso/get-authorization-url)({

|     connection,

|     clientId,

|     redirectUri,

|   });

| 

|   res.redirect(authorizationUrl);

| 
};

```

The provider parameter is used for OAuth connections which are configured at the environment level.
The supported `provider` values are `GoogleOAuth`, `MicrosoftOAuth`, `GitHubOAuth`, and `AppleOAuth`.
Next.jsNext.jsNext.js (App Router)Next.js (App Router)ExpressExpress
JavaScript
```

| 
import type { NextApiRequest, NextApiResponse } from 'next';

---|---  

| 
import { WorkOS } from '@workos-inc/node';

| 

| 
const workos = new WorkOS(process.env.WORKOS_API_KEY);

| 
const clientId = process.env.WORKOS_CLIENT_ID;

| 

| 
export default (_req: NextApiRequest, res: NextApiResponse) => {

|   // The provider to authenticate with

|   const provider = 'GoogleOAuth';

| 

|   // The callback URI WorkOS should redirect to after the authentication

|   const redirectUri = 'https://dashboard.my-app.com';

| 

|   const authorizationUrl = workos.sso.getAuthorizationUrl[](https://workos.com/docs/reference/sso/get-authorization-url)({

|     provider,

|     redirectUri,

|     clientId,

|   });

| 

|   res.redirect(authorizationUrl);

| 
};

```

If there is an issue generating an authorization URL, WorkOS will return the redirect URI as is. Read the [API Reference](https://workos.com/docs/reference/sso/get-authorization-url) for more details.
### Add a callback endpoint
[](https://workos.com/docs/sso#add-a-callback-endpoint)
Next, let’s add the redirect endpoint which will handle the callback from WorkOS after a user has authenticated with their identity provider. This endpoint should exchange the authorization code returned by WorkOS with the authenticated user’s profile. The authorization code is valid for 10 minutes.
Next.jsNext.jsNext.js (App Router)Next.js (App Router)ExpressExpress
JavaScript
```

| 
import type { NextApiRequest, NextApiResponse } from 'next';

---|---  

| 
import { WorkOS } from '@workos-inc/node';

| 

| 
const workos = new WorkOS(process.env.WORKOS_API_KEY);

| 
const clientId = process.env.WORKOS_CLIENT_ID;

| 

| 
export default async (req: NextApiRequest, res: NextApiResponse) => {

|   const { code } = req.query;

| 

|   const { [profile](https://workos.com/docs/reference/sso/profile) } = await workos.sso.getProfileAndToken[](https://workos.com/docs/reference/sso/profile/get-profile-and-token)({

|     code,

|     clientId,

|   });

| 

|   // Use the Test Organization ID to get started. Replace it with

|   // the user’s real organization ID when you finish the integration.

|   const organization = 'org_test_idp';

| 

|   // Validate that this profile belongs to the organization used for authentication

|   if (profile.organizationId !== organization) {

|     return res.status(401).send({

|       message: 'Unauthorized',

|     });

|   }

| 

|   // Use the information in `profile` for further business logic.

| 

|   res.redirect('/');

| 
};

```

When adding your callback endpoint, it is important to always validate the returned profile’s organization ID. It’s unsafe to validate using email domains as organizations might allow email addresses from outside their corporate domain (e.g. for guest users).
##  2. Configure a redirect URI
[](https://workos.com/docs/sso#2-configure-a-redirect-uri)
Go to the [Redirects](https://dashboard.workos.com/redirects) page in the dashboard to configure allowed redirect URIs. This is your callback endpoint you used in the previous section.
Multi-tenant apps will typically have a single redirect URI specified. You can set multiple redirect URIs for single-tenant apps. You’ll need to be sure to specify which redirect URI to use in the WorkOS client call to fetch the authorization URL.
More information about wildcard characters support can be found in the [Redirect URIs](https://workos.com/docs/sso/redirect-uris/wildcard-characters) guide.
![Redirects in the Dashboard](https://images.workoscdn.com/images/195dbff3-adbf-4010-b07c-ffc73ceeca68.png?auto=format&fit=clip&q=90)
### Identity provider-initiated SSO
[](https://workos.com/docs/sso#identity-provider-initiated-sso)
Normally, the default redirect URI you configure in the WorkOS dashboard is going to be used for all identity provider-initiated SSO sessions. This is because the WorkOS client is not used to initiate the authentication flow.
However, your customer can specify a separate redirect URI to be used for all their IdP-initiated sessions as a `RelayState` parameter in the SAML settings on their side.
Learn more about configuring IdP-initiated SSO in the [Login Flows](https://workos.com/docs/sso/login-flows/idp-initiated-sso/configure-idp-initiated-sso) guide.
##  3. Test end-to-end
[](https://workos.com/docs/sso#3-test-end-to-end)
If you followed this guide, you used the Test Organization available in your staging environment to initiate SSO. With that, you can already test your integration end-to-end.
![Test SSO WorkOs Dashboard](https://images.workoscdn.com/images/7b7407d7-dcc7-4fd4-859f-4ee4214d69c2.png?auto=format&fit=clip&q=80)
Head to the _Test SSO_ page in the [WorkOS Dashboard](https://dashboard.workos.com/) to get started with testing common login flows, or read on about that in detail in the next guide.
[ Test SSOLearn how to test your Single Sign-On integration end-to-end.  Up next ](https://workos.com/docs/sso/test-sso)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
