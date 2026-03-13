---
source_url: "https://workos.com/docs/authkit/metadata"
title: "Metadata and External IDs"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
AuthKit
AuthKit
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fauthkit%2Fmetadata)
Getting Started[Quick StartQuick Start](https://workos.com/docs/authkit)[CLI InstallerCLI Installer](https://workos.com/docs/authkit/cli-installer)[Example AppsExample Apps](https://workos.com/docs/authkit/example-apps)Modeling Your App[Introduction and conceptsIntroduction and concepts](https://workos.com/docs/authkit/modeling-your-app)[SSO with contractorsSSO with contractors](https://workos.com/docs/authkit/sso-with-contractors)[Invite-only signupInvite-only signup](https://workos.com/docs/authkit/invite-only-signup)Integrating[Users and OrganizationsUsers and Organizations](https://workos.com/docs/authkit/users-organizations)[Hosted UIHosted UI](https://workos.com/docs/authkit/hosted-ui)[SessionsSessions](https://workos.com/docs/authkit/sessions)[BrandingBranding](https://workos.com/docs/authkit/branding)[MigrationsMigrations](https://workos.com/docs/authkit/migrations)[WidgetsWidgets](https://workos.com/docs/widgets)[ActionsActions](https://workos.com/docs/authkit/actions)[MCPMCP](https://workos.com/docs/authkit/mcp)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Authentication[Single Sign-OnSingle Sign-On](https://workos.com/docs/authkit/sso)[Email + PasswordEmail + Password](https://workos.com/docs/authkit/email-password)[PasskeysPasskeys](https://workos.com/docs/authkit/passkeys)[Social LoginSocial Login](https://workos.com/docs/authkit/social-login)[Multi-Factor AuthMulti-Factor Auth](https://workos.com/docs/authkit/mfa)[Magic AuthMagic Auth](https://workos.com/docs/authkit/magic-auth)[CLI AuthCLI Auth](https://workos.com/docs/authkit/cli-auth)Features[API KeysAPI Keys](https://workos.com/docs/authkit/api-keys)[Custom EmailsCustom Emails](https://workos.com/docs/authkit/custom-emails)[Custom Email ProvidersCustom Email Providers](https://workos.com/docs/authkit/custom-email-providers)[Directory ProvisioningDirectory Provisioning](https://workos.com/docs/authkit/directory-provisioning)[Domain VerificationDomain Verification](https://workos.com/docs/authkit/domain-verification)[Email VerificationEmail Verification](https://workos.com/docs/authkit/email-verification)[Identity LinkingIdentity Linking](https://workos.com/docs/authkit/identity-linking)[ImpersonationImpersonation](https://workos.com/docs/authkit/impersonation)[InvitationsInvitations](https://workos.com/docs/authkit/invitations)[JIT ProvisioningJIT Provisioning](https://workos.com/docs/authkit/jit-provisioning)[JWT TemplatesJWT Templates](https://workos.com/docs/authkit/jwt-templates)[Metadata and External IDsMetadata and External IDs](https://workos.com/docs/authkit/metadata)[Organization PoliciesOrganization Policies](https://workos.com/docs/authkit/organization-policies)[RadarRadar](https://workos.com/docs/authkit/radar)[Roles and PermissionsRoles and Permissions](https://workos.com/docs/authkit/roles-and-permissions)WorkOS Connect[Getting StartedGetting Started](https://workos.com/docs/authkit/connect)[OAuth ApplicationsOAuth Applications](https://workos.com/docs/authkit/connect/oauth)[M2M ApplicationsM2M Applications](https://workos.com/docs/authkit/connect/m2m)[StandaloneStandalone](https://workos.com/docs/authkit/connect/standalone)Add-ons[Google AnalyticsGoogle Analytics](https://workos.com/docs/authkit/add-ons/google-analytics)[SegmentSegment](https://workos.com/docs/authkit/add-ons/segment)[StripeStripe](https://workos.com/docs/authkit/add-ons/stripe)
[](https://workos.com/docs/reference)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Metadata and External IDs
Store additional information about users and organizations.
## On this page
  * [Introduction](https://workos.com/docs/authkit/metadata#introduction)
  * [External identifiers](https://workos.com/docs/authkit/metadata#external-identifiers)
  * [Metadata](https://workos.com/docs/authkit/metadata#metadata)
  * [Set an external identifier](https://workos.com/docs/authkit/metadata#set-an-external-identifier)
  * [Query by external identifier](https://workos.com/docs/authkit/metadata#query-by-external-identifier)
  * [Add and update metadata](https://workos.com/docs/authkit/metadata#add-and-update-metadata)
  * [Exposing metadata in JWTs](https://workos.com/docs/authkit/metadata#exposing-metadata-in-jwts)

## Introduction
[](https://workos.com/docs/authkit/metadata#introduction)
Metadata is an attribute of organizations and users that allows you to store additional information about these objects, structured as key-value pairs. For example, you can use metadata to store information about a user’s profile picture, or the organization’s address.
External identifiers allow you to associate organizations and users with an identifier in your own system.
## External identifiers
[](https://workos.com/docs/authkit/metadata#external-identifiers)
External identifiers are an attribute of organizations and users that allows you to associate these objects with an identifier in your own system. Once you have set an external identifier for an object, you can query on it via dedicated endpoints in the WorkOS API.
External identifiers must be unique within your environment and are limited to 64 characters.
## Metadata
[](https://workos.com/docs/authkit/metadata#metadata)
You can add up to 10 key-value pairs to an organization or user within these data limits:
  * **Key** : Up to 40 characters long. ASCII only.
  * **Value** : Up to 600 characters long. ASCII only.

If your integration requires more than 10 key-value pairs, consider storing the additional data in your own external database and use an external identifier to associate the data with an organization or user.
Never store sensitive information in metadata such as passwords, API keys, or other private information.
Metadata is returned in the response body for backend API operations that return organization or user objects, but not in the response body of the [User Authentication](https://workos.com/docs/reference/authkit/authentication) operations. If you want to publicly expose metadata properties from users or organizations in your access tokens, you can use JWT templates to customize claims in your application’s access tokens.
## Set an external identifier
[](https://workos.com/docs/authkit/metadata#set-an-external-identifier)
To set an external identifier for an organization or user, include the `external_id` property in the request body of the [Create an organization](https://workos.com/docs/reference/organization/create) or [Create a user](https://workos.com/docs/reference/authkit/user/create) endpoints.
RequestRequestResponseResponse
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
const [organization](https://workos.com/docs/reference/organization) = await workos.organizations.createOrganization[](https://workos.com/docs/reference/organization/create)({

|   name: 'Foo Corp',

|   externalId: '2fe01467-f7ea-4dd2-8b79-c2b4f56d0191',

| 
});

```

To update an external identifier, include the `external_id` property in the request body of the [Update an organization](https://workos.com/docs/reference/organization/update) or [Update a user](https://workos.com/docs/reference/authkit/user/update) endpoints.
## Query by external identifier
[](https://workos.com/docs/authkit/metadata#query-by-external-identifier)
To query an organization or user by their external identifier, use the [Get organization by external identifier](https://workos.com/docs/reference/organization/get-by-external-id) or [Get user by external identifier](https://workos.com/docs/reference/authkit/user/get-by-external-id) endpoints.
## Add and update metadata
[](https://workos.com/docs/authkit/metadata#add-and-update-metadata)
Updates to metadata are partial. This means that you only need to include the metadata attributes that you want to update.
Metadata can be included in the request body of the following endpoints:
  * [Create an organization](https://workos.com/docs/reference/organization/create)
  * [Update an organization](https://workos.com/docs/reference/organization/update)
  * [Create a user](https://workos.com/docs/reference/authkit/user/create)
  * [Update a user](https://workos.com/docs/reference/authkit/user/update)

To add a metadata attribute to an entity, include the key and value pair in the `metadata` object of the request body.
```

| 
{

---|---  

|   "metadata": {

|     "key": "value"

|   }

| 
}

```

To update a metadata attribute, include the key and value pair in the `metadata` object of the request body.
```

| 
{

---|---  

|   "metadata": {

|     "key": "new_value"

|   }

| 
}

```

To delete a metadata attribute, set the key to `null` in the `metadata` object of the request body.
```

| 
{

---|---  

|   "metadata": {

|     "key": null

|   }

| 
}

```

To delete all metadata attributes, set the `metadata` property an empty object.
```

| 
{

---|---  

|   "metadata": {}

| 
}

```

## Exposing metadata in JWTs
[](https://workos.com/docs/authkit/metadata#exposing-metadata-in-jwts)
Custom metadata and external identifiers can be exposed as claims in JWTs using [JWT Templates](https://workos.com/docs/authkit/jwt-templates).
TemplateTemplateContextContextOutputOutput
JavaScript
```

| 
{

---|---  

|   "urn:myapp:user_external_id" : {{ user.external_id }},

|   "urn:myapp:manager_id": {{ user.metadata.manager_id }}

| 
}

```

[ Organization Authentication PoliciesCustomize available authentication methods for each organization Up next ](https://workos.com/docs/authkit/organization-policies)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
