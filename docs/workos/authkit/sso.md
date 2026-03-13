---
source_url: "https://workos.com/docs/authkit/sso"
title: "Single Sign-On"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
AuthKit
AuthKit
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fauthkit%2Fsso)
Getting Started[Quick StartQuick Start](https://workos.com/docs/authkit)[CLI InstallerCLI Installer](https://workos.com/docs/authkit/cli-installer)[Example AppsExample Apps](https://workos.com/docs/authkit/example-apps)Modeling Your App[Introduction and conceptsIntroduction and concepts](https://workos.com/docs/authkit/modeling-your-app)[SSO with contractorsSSO with contractors](https://workos.com/docs/authkit/sso-with-contractors)[Invite-only signupInvite-only signup](https://workos.com/docs/authkit/invite-only-signup)Integrating[Users and OrganizationsUsers and Organizations](https://workos.com/docs/authkit/users-organizations)[Hosted UIHosted UI](https://workos.com/docs/authkit/hosted-ui)[SessionsSessions](https://workos.com/docs/authkit/sessions)[BrandingBranding](https://workos.com/docs/authkit/branding)[MigrationsMigrations](https://workos.com/docs/authkit/migrations)[WidgetsWidgets](https://workos.com/docs/widgets)[ActionsActions](https://workos.com/docs/authkit/actions)[MCPMCP](https://workos.com/docs/authkit/mcp)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Authentication[Single Sign-OnSingle Sign-On](https://workos.com/docs/authkit/sso)[Email + PasswordEmail + Password](https://workos.com/docs/authkit/email-password)[PasskeysPasskeys](https://workos.com/docs/authkit/passkeys)[Social LoginSocial Login](https://workos.com/docs/authkit/social-login)[Multi-Factor AuthMulti-Factor Auth](https://workos.com/docs/authkit/mfa)[Magic AuthMagic Auth](https://workos.com/docs/authkit/magic-auth)[CLI AuthCLI Auth](https://workos.com/docs/authkit/cli-auth)Features[API KeysAPI Keys](https://workos.com/docs/authkit/api-keys)[Custom EmailsCustom Emails](https://workos.com/docs/authkit/custom-emails)[Custom Email ProvidersCustom Email Providers](https://workos.com/docs/authkit/custom-email-providers)[Directory ProvisioningDirectory Provisioning](https://workos.com/docs/authkit/directory-provisioning)[Domain VerificationDomain Verification](https://workos.com/docs/authkit/domain-verification)[Email VerificationEmail Verification](https://workos.com/docs/authkit/email-verification)[Identity LinkingIdentity Linking](https://workos.com/docs/authkit/identity-linking)[ImpersonationImpersonation](https://workos.com/docs/authkit/impersonation)[InvitationsInvitations](https://workos.com/docs/authkit/invitations)[JIT ProvisioningJIT Provisioning](https://workos.com/docs/authkit/jit-provisioning)[JWT TemplatesJWT Templates](https://workos.com/docs/authkit/jwt-templates)[Metadata and External IDsMetadata and External IDs](https://workos.com/docs/authkit/metadata)[Organization PoliciesOrganization Policies](https://workos.com/docs/authkit/organization-policies)[RadarRadar](https://workos.com/docs/authkit/radar)[Roles and PermissionsRoles and Permissions](https://workos.com/docs/authkit/roles-and-permissions)WorkOS Connect[Getting StartedGetting Started](https://workos.com/docs/authkit/connect)[OAuth ApplicationsOAuth Applications](https://workos.com/docs/authkit/connect/oauth)[M2M ApplicationsM2M Applications](https://workos.com/docs/authkit/connect/m2m)[StandaloneStandalone](https://workos.com/docs/authkit/connect/standalone)Add-ons[Google AnalyticsGoogle Analytics](https://workos.com/docs/authkit/add-ons/google-analytics)[SegmentSegment](https://workos.com/docs/authkit/add-ons/segment)[StripeStripe](https://workos.com/docs/authkit/add-ons/stripe)
[](https://workos.com/docs/reference)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Single Sign-On
Facilitate greater security, easier account management, and accelerated application onboarding and adoption.
## On this page
  * [Introduction](https://workos.com/docs/authkit/sso#introduction)
  * [Getting started](https://workos.com/docs/authkit/sso#getting-started)
  * [1. Enable SSO](https://workos.com/docs/authkit/sso#1-enable-sso)
  * [2. Test with the Test Identity Provider](https://workos.com/docs/authkit/sso#2-test-with-the-test-identity-provider)
    * [Getting started](https://workos.com/docs/authkit/sso#getting-started)
    * [Service provider-initiated SSO](https://workos.com/docs/authkit/sso#service-provider-initiated-sso)
    * [Identity provider-initiated SSO](https://workos.com/docs/authkit/sso#identity-provider-initiated-sso)
    * [Guest email domain](https://workos.com/docs/authkit/sso#guest-email-domain)
    * [Error response](https://workos.com/docs/authkit/sso#error-response)
  * [3. Test with other identity providers](https://workos.com/docs/authkit/sso#3-test-with-other-identity-providers)
    * [Create an organization](https://workos.com/docs/authkit/sso#create-an-organization)
    * [Create a connection](https://workos.com/docs/authkit/sso#create-a-connection)
    * [Follow the Admin Portal instructions](https://workos.com/docs/authkit/sso#follow-the-admin-portal-instructions)
  * [Integrating via the API](https://workos.com/docs/authkit/sso#integrating-via-the-api)

## Introduction
[](https://workos.com/docs/authkit/sso#introduction)
Single Sign-On is the most frequently asked for requirement by organizations looking to adopt new SaaS applications. SSO enables authentication via an organization’s [identity provider (IdP)](https://workos.com/docs/glossary/idp).
This service is compatible with any IdP and supports both the [SAML](https://workos.com/docs/glossary/saml) and [OIDC](https://workos.com/docs/glossary/oidc) protocols. It’s modeled to meet the [OAuth 2.0](https://workos.com/docs/glossary/oauth-2-0) framework specification, abstracting away the underlying authentication handshakes between different IdPs.
## Getting started
[](https://workos.com/docs/authkit/sso#getting-started)
AuthKit greatly simplifies the process of integrating SSO into your application. AuthKit will make the necessary API calls automatically and handle the routing of SSO users when their account is associated with an existing SSO connection.
##  1. Enable SSO
[](https://workos.com/docs/authkit/sso#1-enable-sso)
Navigate to the _Authentication_ settings section in the [WorkOS Dashboard](https://dashboard.workos.com/) and enable Single Sign-On.
![Dashboard demonstrating how to enable Single Sign-On](https://images.workoscdn.com/images/09c9b3c5-833e-4fe0-985b-f5b1934e4284.png?auto=format&fit=clip&q=80)
AuthKit will now automatically detect when a user is attempting to sign in via SSO and redirect them to the appropriate IdP.
##  2. Test with the Test Identity Provider
[](https://workos.com/docs/authkit/sso#2-test-with-the-test-identity-provider)
To confirm your Single Sign-On integration works correctly you can use the Test Identity Provider to simulate login flows end-to-end. Your staging environment includes a default Test Organization and active SSO connection configured with the Test Identity Provider.
![WorkOS Test Identity Provider](https://images.workoscdn.com/images/7b7407d7-dcc7-4fd4-859f-4ee4214d69c2.png?auto=format&fit=clip&q=80)
### Getting started
[](https://workos.com/docs/authkit/sso#getting-started)
Log into the [WorkOS Dashboard](https://dashboard.workos.com/) and navigate to the _Test SSO_ page to get started with the Test IdP. This page outlines a number of different SSO scenarios you can follow and provides all the necessary information to complete the tests.
![Test SSO WorkOs Dashboard](https://images.workoscdn.com/images/7b7407d7-dcc7-4fd4-859f-4ee4214d69c2.png?auto=format&fit=clip&q=80)
### Service provider-initiated SSO
[](https://workos.com/docs/authkit/sso#service-provider-initiated-sso)
This case is likely the first [login flow](https://workos.com/docs/sso/login-flows/sp-initiated-sso) you would test when implementing SSO in your app. The test simulates users initiating authentication from your sign-in page. In this scenario, the user enters their email in your app, gets redirected to the identity provider, and then is redirected back to your application.
### Identity provider-initiated SSO
[](https://workos.com/docs/authkit/sso#identity-provider-initiated-sso)
This test simulates users initiating authentication from their identity provider. It is a common [login flow](https://workos.com/docs/sso/login-flows/idp-initiated-sso) that developers forget to consider. In the scenario, users log in to the identity provider directly, select your application from their list of SSO-enabled apps, and are redirected to your application upon successful authentication.
### Guest email domain
[](https://workos.com/docs/authkit/sso#guest-email-domain)
This test simulates users authenticating with an email domain different from the verified domain of the test organization, `example.com`. A relevant scenario is authenticating freelance users, whose email domain is not owned by the company.
### Error response
[](https://workos.com/docs/authkit/sso#error-response)
This test simulates a generic [error response](https://workos.com/docs/reference/sso/get-authorization-url/error-codes) from the user’s identity provider. In this scenario, SSO authentication has failed for the user. Below is an example of the error-related parameters passed to the [redirect URI](https://workos.com/docs/sso/redirect-uris) in your application.
##  3. Test with other identity providers
[](https://workos.com/docs/authkit/sso#3-test-with-other-identity-providers)
Test Identity Provider saves time by providing an out of the box experience compared to the configuration process that someone using a real identity provider would have to go through to enable Single Sign-On for your app.
If your integration works with the Test Identity Provider, you can be sure it will work with other identity providers. However, it may be helpful to also learn about the setup process that your customers will go through on their side, which varies depending on a specific identity provider.
### Create an organization
[](https://workos.com/docs/authkit/sso#create-an-organization)
To get started, you will need to [create an organization](https://dashboard.workos.com/organizations) in the WorkOS Dashboard. Organizations in WorkOS represent your customer, so by creating an organization, you can test your SSO connection the way your customers will experience it.
![Create an organization dialog](https://images.workoscdn.com/images/2ef3565c-526a-42e6-9830-622e83b67ee5.png?auto=format&fit=clip&q=80)
### Create a connection
[](https://workos.com/docs/authkit/sso#create-a-connection)
Go to the organization you created and click _Invite admin_. Select _Single Sign-On_ from the list of features. In the next step, enter an email address to send the setup link to, or click _Copy setup link_.
The setup link goes to Admin Portal, where your customers get the exact instructions for every step they need to take to enable Single Sign-On with your app.
You can also integrate [Admin Portal](https://workos.com/docs/admin-portal) directly into your app to enable self-serve setup of Single Sign-On and other enterprise features for your users.
![Invite an admin dialog](https://images.workoscdn.com/images/b9ab80fc-606a-417c-bade-3483ef48c2ae.png?auto=format&fit=clip&q=80)
### Follow the Admin Portal instructions
[](https://workos.com/docs/authkit/sso#follow-the-admin-portal-instructions)
To complete the integration, you’ll have to also create an account with the identity provider you want to test with. After you have signed up with an identity provider of your choice, follow the corresponding Admin Portal instructions from the setup link. Once done, you can start testing your SSO integration with that identity provider.
![Admin Portal setup instructions](https://images.workoscdn.com/images/0ee15c3d-5356-4f41-a26a-440f95355b28.png?auto=format&fit=clip&q=80)
The setup instructions you’ve seen in the Admin Portal are also available directly in the docs if you want to create a connection manually:
### [Okta SAML Configure a connection to Okta via SAML. ](https://workos.com/docs/integrations/okta-saml)### [Entra ID (Azure AD) SAML Configure an Entra ID SAML connection. ](https://workos.com/docs/integrations/entra-id-saml)### [Google Workspace SAML Configure a Google Workspace SAML connection. ](https://workos.com/docs/integrations/google-saml)### [All integrations Choose from dozens of other identity providers. ](https://workos.com/docs/integrations)
## Integrating via the API
[](https://workos.com/docs/authkit/sso#integrating-via-the-api)
If you’d prefer to build and manage your own authentication UI, you can do so via the AuthKit [Authentication API](https://workos.com/docs/reference/authkit/authentication).
Examples of building custom UI are also [available on GitHub](https://github.com/workos/authkit).
[ Email + PasswordConfiguring email and password authentication and requirements Up next ](https://workos.com/docs/authkit/email-password)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
