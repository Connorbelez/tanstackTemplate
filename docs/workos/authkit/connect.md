---
source_url: "https://workos.com/docs/authkit/connect"
title: "Connect"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
AuthKit
AuthKit
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fauthkit%2Fconnect)
Getting Started[Quick StartQuick Start](https://workos.com/docs/authkit)[CLI InstallerCLI Installer](https://workos.com/docs/authkit/cli-installer)[Example AppsExample Apps](https://workos.com/docs/authkit/example-apps)Modeling Your App[Introduction and conceptsIntroduction and concepts](https://workos.com/docs/authkit/modeling-your-app)[SSO with contractorsSSO with contractors](https://workos.com/docs/authkit/sso-with-contractors)[Invite-only signupInvite-only signup](https://workos.com/docs/authkit/invite-only-signup)Integrating[Users and OrganizationsUsers and Organizations](https://workos.com/docs/authkit/users-organizations)[Hosted UIHosted UI](https://workos.com/docs/authkit/hosted-ui)[SessionsSessions](https://workos.com/docs/authkit/sessions)[BrandingBranding](https://workos.com/docs/authkit/branding)[MigrationsMigrations](https://workos.com/docs/authkit/migrations)[WidgetsWidgets](https://workos.com/docs/widgets)[ActionsActions](https://workos.com/docs/authkit/actions)[MCPMCP](https://workos.com/docs/authkit/mcp)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Authentication[Single Sign-OnSingle Sign-On](https://workos.com/docs/authkit/sso)[Email + PasswordEmail + Password](https://workos.com/docs/authkit/email-password)[PasskeysPasskeys](https://workos.com/docs/authkit/passkeys)[Social LoginSocial Login](https://workos.com/docs/authkit/social-login)[Multi-Factor AuthMulti-Factor Auth](https://workos.com/docs/authkit/mfa)[Magic AuthMagic Auth](https://workos.com/docs/authkit/magic-auth)[CLI AuthCLI Auth](https://workos.com/docs/authkit/cli-auth)Features[API KeysAPI Keys](https://workos.com/docs/authkit/api-keys)[Custom EmailsCustom Emails](https://workos.com/docs/authkit/custom-emails)[Custom Email ProvidersCustom Email Providers](https://workos.com/docs/authkit/custom-email-providers)[Directory ProvisioningDirectory Provisioning](https://workos.com/docs/authkit/directory-provisioning)[Domain VerificationDomain Verification](https://workos.com/docs/authkit/domain-verification)[Email VerificationEmail Verification](https://workos.com/docs/authkit/email-verification)[Identity LinkingIdentity Linking](https://workos.com/docs/authkit/identity-linking)[ImpersonationImpersonation](https://workos.com/docs/authkit/impersonation)[InvitationsInvitations](https://workos.com/docs/authkit/invitations)[JIT ProvisioningJIT Provisioning](https://workos.com/docs/authkit/jit-provisioning)[JWT TemplatesJWT Templates](https://workos.com/docs/authkit/jwt-templates)[Metadata and External IDsMetadata and External IDs](https://workos.com/docs/authkit/metadata)[Organization PoliciesOrganization Policies](https://workos.com/docs/authkit/organization-policies)[RadarRadar](https://workos.com/docs/authkit/radar)[Roles and PermissionsRoles and Permissions](https://workos.com/docs/authkit/roles-and-permissions)WorkOS Connect[Getting StartedGetting Started](https://workos.com/docs/authkit/connect)[OAuth ApplicationsOAuth Applications](https://workos.com/docs/authkit/connect/oauth)[M2M ApplicationsM2M Applications](https://workos.com/docs/authkit/connect/m2m)[StandaloneStandalone](https://workos.com/docs/authkit/connect/standalone)Add-ons[Google AnalyticsGoogle Analytics](https://workos.com/docs/authkit/add-ons/google-analytics)[SegmentSegment](https://workos.com/docs/authkit/add-ons/segment)[StripeStripe](https://workos.com/docs/authkit/add-ons/stripe)
[](https://workos.com/docs/reference)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Connect
Enable other applications to access your users and their identities.
## On this page
  * [Introduction](https://workos.com/docs/authkit/connect#introduction)
  * [Common use-cases](https://workos.com/docs/authkit/connect#common-use-cases)
  * [Getting started](https://workos.com/docs/authkit/connect#getting-started)
    * [OAuth applications](https://workos.com/docs/authkit/connect#oauth-applications)
    * [M2M applications](https://workos.com/docs/authkit/connect#m2m-applications)
  * [Concepts](https://workos.com/docs/authkit/connect#concepts)
    * [Participants](https://workos.com/docs/authkit/connect#participants)
    * [Credentials](https://workos.com/docs/authkit/connect#credentials)

## Introduction
[](https://workos.com/docs/authkit/connect#introduction)
Connect is a set of controls and APIs that developers can use to allow different types of applications to access their users’ identity and resources. Connect is built on top of industry-standard specifications like OAuth 2.0 and OpenID Connect in order to support many common use-cases out of the box.
Unlike AuthKit’s other features that help users sign into **your application** , Connect enables **other applications** to authenticate and access your users’ data through secure, managed APIs.
## Common use-cases
[](https://workos.com/docs/authkit/connect#common-use-cases) **Customer applications**
    Enable your customers to build custom integrations with your platform. This can include allowing them to add a “Sign in with [your app]” button on their login page. **Auxiliary applications**
    Allow secondary applications that support your primary application, such as support tools or discussion forums, to authenticate using the same user identities in AuthKit. **Partner integrations**
    Issue credentials for trusted partners to authenticate with when calling your application’s API.
## Getting started
[](https://workos.com/docs/authkit/connect#getting-started)
Each Connect integration is defined as an Application, which can be created inside of the WorkOS Dashboard.
When creating an application, you first choose the type of integration: **OAuth** or Machine-to-Machine (**M2M**).
### OAuth applications
[](https://workos.com/docs/authkit/connect#oauth-applications)
Select OAuth when building web or mobile applications where the actor being authenticated is a [User](https://workos.com/docs/reference/authkit/user). Integrating with an OAuth application uses the underlying `authorization_code` OAuth flow which is supported by many libraries and frameworks out of the box.
Upon successful authorization, the issued tokens will contain information about the user who signed in.
[Learn more about OAuth applications →](https://workos.com/docs/authkit/connect/oauth)
### M2M applications
[](https://workos.com/docs/authkit/connect#m2m-applications)
Select M2M when the application will be a third-party service, such as one of your customer’s applications. Integrating with an M2M application uses the underlying `client_credentials` flow.
Unlike OAuth applications, the actor being authenticated is not an individual user. Instead issued access tokens will contain an `org_id` claim which represents the customer you are granting access to via the M2M application.
The M2M application will use its `client_id` and `client_secret` to authenticate requests to your application’s API or services.
[Learn more about M2M applications →](https://workos.com/docs/authkit/connect/m2m)
## Concepts
[](https://workos.com/docs/authkit/connect#concepts)
All Connect applications share the following concepts:
### Participants
[](https://workos.com/docs/authkit/connect#participants)
When using Connect, there are several actors involved with the integration of each Application:
  * **Relying Party** : The application that receives Connect-issued tokens and identity information. It may also use the access token to make requests to your API.
  * **Resource server** : The service (generally your app) that allows other clients to authenticate using the Connect-issued tokens.
  * **Authorization server** : This is Connect, the issuer of identity and access tokens to requesting clients after authenticating the user.

### Credentials
[](https://workos.com/docs/authkit/connect#credentials)
Applications can have up to 5 credentials. These are only shown once upon creation and do not expire. The application `client_id` and `client_secret` from a credential can be used to authenticate to the [Connect APIs](https://workos.com/docs/reference/workos-connect).
When sharing app credentials with an external party, use a secure method – like encrypted email or file sharing – and make sure the recipient is properly authenticated.
[ OAuth ApplicationsIntegrate OAuth applications with WorkOS Connect for web and mobile authentication Up next ](https://workos.com/docs/authkit/connect/oauth)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
