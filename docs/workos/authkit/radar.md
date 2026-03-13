---
source_url: "https://workos.com/docs/authkit/radar"
title: "Radar"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
AuthKit
AuthKit
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fauthkit%2Fradar)
Getting Started[Quick StartQuick Start](https://workos.com/docs/authkit)[CLI InstallerCLI Installer](https://workos.com/docs/authkit/cli-installer)[Example AppsExample Apps](https://workos.com/docs/authkit/example-apps)Modeling Your App[Introduction and conceptsIntroduction and concepts](https://workos.com/docs/authkit/modeling-your-app)[SSO with contractorsSSO with contractors](https://workos.com/docs/authkit/sso-with-contractors)[Invite-only signupInvite-only signup](https://workos.com/docs/authkit/invite-only-signup)Integrating[Users and OrganizationsUsers and Organizations](https://workos.com/docs/authkit/users-organizations)[Hosted UIHosted UI](https://workos.com/docs/authkit/hosted-ui)[SessionsSessions](https://workos.com/docs/authkit/sessions)[BrandingBranding](https://workos.com/docs/authkit/branding)[MigrationsMigrations](https://workos.com/docs/authkit/migrations)[WidgetsWidgets](https://workos.com/docs/widgets)[ActionsActions](https://workos.com/docs/authkit/actions)[MCPMCP](https://workos.com/docs/authkit/mcp)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Authentication[Single Sign-OnSingle Sign-On](https://workos.com/docs/authkit/sso)[Email + PasswordEmail + Password](https://workos.com/docs/authkit/email-password)[PasskeysPasskeys](https://workos.com/docs/authkit/passkeys)[Social LoginSocial Login](https://workos.com/docs/authkit/social-login)[Multi-Factor AuthMulti-Factor Auth](https://workos.com/docs/authkit/mfa)[Magic AuthMagic Auth](https://workos.com/docs/authkit/magic-auth)[CLI AuthCLI Auth](https://workos.com/docs/authkit/cli-auth)Features[API KeysAPI Keys](https://workos.com/docs/authkit/api-keys)[Custom EmailsCustom Emails](https://workos.com/docs/authkit/custom-emails)[Custom Email ProvidersCustom Email Providers](https://workos.com/docs/authkit/custom-email-providers)[Directory ProvisioningDirectory Provisioning](https://workos.com/docs/authkit/directory-provisioning)[Domain VerificationDomain Verification](https://workos.com/docs/authkit/domain-verification)[Email VerificationEmail Verification](https://workos.com/docs/authkit/email-verification)[Identity LinkingIdentity Linking](https://workos.com/docs/authkit/identity-linking)[ImpersonationImpersonation](https://workos.com/docs/authkit/impersonation)[InvitationsInvitations](https://workos.com/docs/authkit/invitations)[JIT ProvisioningJIT Provisioning](https://workos.com/docs/authkit/jit-provisioning)[JWT TemplatesJWT Templates](https://workos.com/docs/authkit/jwt-templates)[Metadata and External IDsMetadata and External IDs](https://workos.com/docs/authkit/metadata)[Organization PoliciesOrganization Policies](https://workos.com/docs/authkit/organization-policies)[RadarRadar](https://workos.com/docs/authkit/radar)[Roles and PermissionsRoles and Permissions](https://workos.com/docs/authkit/roles-and-permissions)WorkOS Connect[Getting StartedGetting Started](https://workos.com/docs/authkit/connect)[OAuth ApplicationsOAuth Applications](https://workos.com/docs/authkit/connect/oauth)[M2M ApplicationsM2M Applications](https://workos.com/docs/authkit/connect/m2m)[StandaloneStandalone](https://workos.com/docs/authkit/connect/standalone)Add-ons[Google AnalyticsGoogle Analytics](https://workos.com/docs/authkit/add-ons/google-analytics)[SegmentSegment](https://workos.com/docs/authkit/add-ons/segment)[StripeStripe](https://workos.com/docs/authkit/add-ons/stripe)
[](https://workos.com/docs/reference)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Radar
Protecting against bots, fraud and abuse.
## On this page
  * [Introduction](https://workos.com/docs/authkit/radar#introduction)
  * [Getting Started](https://workos.com/docs/authkit/radar#getting-started)
  * [Dashboard](https://workos.com/docs/authkit/radar#dashboard)
  * [Event list](https://workos.com/docs/authkit/radar#event-list)
  * [Configuration](https://workos.com/docs/authkit/radar#configuration)
    * [Bot detection](https://workos.com/docs/authkit/radar#bot-detection)
    * [Brute force](https://workos.com/docs/authkit/radar#brute-force)
    * [Impossible travel](https://workos.com/docs/authkit/radar#impossible-travel)
    * [Repeat sign up](https://workos.com/docs/authkit/radar#repeat-sign-up)
    * [Stale accounts](https://workos.com/docs/authkit/radar#stale-accounts)
    * [Unrecognized device](https://workos.com/docs/authkit/radar#unrecognized-device)
  * [Managed lists](https://workos.com/docs/authkit/radar#managed-lists)
    * [Disposable email domains](https://workos.com/docs/authkit/radar#disposable-email-domains)
    * [U.S. Sanctioned countries](https://workos.com/docs/authkit/radar#u-s-sanctioned-countries)
  * [Custom restrictions](https://workos.com/docs/authkit/radar#custom-restrictions)

## Introduction
[](https://workos.com/docs/authkit/radar#introduction)
Radar adds automated protections on top of AuthKit by collecting signals on the behavior of users as they sign in to your app. These signals feed into an engine that identifies abusive or anomalous behavior. When Radar detects a suspicious authentication attempt, it can block or challenge that attempt based on the settings you configure.
Radar leverages device fingerprinting to identify which client is being used to authenticate with AuthKit. This enables Radar to differentiate between legitimate and malicious users, so that automated protections won’t impact your app’s availability during an attack. It’s also a signal for suspicious behavior, such as when a device is used for multiple accounts or multiple devices are using the same account.
## Getting Started
[](https://workos.com/docs/authkit/radar#getting-started)
Radar works with AuthKit without additional integration effort. You can enable Radar directly from the WorkOS dashboard. If you are interested in using Radar but are not an AuthKit customer, please reach out to our team, or for current customers, drop a note in your shared Slack channel.
## Dashboard
[](https://workos.com/docs/authkit/radar#dashboard)
Radar’s dashboard provides a summary of authentication activity in your app. The top chart shows counts of suspicious events that Radar is detecting, along with automated actions that Radar took based on configuration. The counts are updated in real time to make it easy to spot spikes in anomalous behavior. To see historical trends, the time range for the chart can be toggled between 24 hours, 7 days and 30 days.
![Radar dashboard](https://images.workoscdn.com/images/87812b47-e72f-4edb-8164-e171545c9d8d.png?auto=format&fit=clip&q=50)
Below the top chart is a set of cards that show Radar detection activity for different user identifiers. This is helpful to understand which types of devices, locations, users, etc. have been detected most often by Radar. Each card is linked to the events page to drill into a list of individual event activity.
![Radar identifier cards](https://images.workoscdn.com/images/a2239641-2ef4-4742-bf9c-97189069ddaa.png?auto=format&fit=clip&q=50)
## Event list
[](https://workos.com/docs/authkit/radar#event-list)
A complete list of Radar events appears under the “Events” tab. This list can be filtered by detection type, action taken, or a specific user ID or email. By clicking into a single event, you can view all of the metadata related to that action including device, location, user agent and IP address. Reviewing events in Radar can help inform when custom restrictions may be useful, such as allowing a known legitimate user to bypass detections, or blocking an IP range that is abusing your sign-in.
![Radar events](https://images.workoscdn.com/images/bde4e906-d680-4f18-baa5-d33fac803a7d.png?auto=format&fit=clip&q=50)
## Configuration
[](https://workos.com/docs/authkit/radar#configuration)
Radar gives you full control over the automated actions that are taken to suppress suspicious activity. By enabling a detection, you can choose to block or challenge an authentication attempt that exhibits the detection’s behavior.
**Blocking** an attempt will cause the authentication to fail, even if valid credentials are provided. The user will see a message indicating their sign-in was not successful, and can reach out to an administrator for more detail.
**Challenging** an attempt will send the user an email with a one-time passcode (OTP). The user is then prompted to enter that code to continue authentication. Challenging suspicious authentication attempts with an OTP is effective in stopping bots that are capable of solving CAPTCHAs, as well as malicious users who have stolen credentials but don’t have access to the user’s email account.
Radar supports SMS challenges for sign ups in preview. Reach out to support via email or Slack if you are interested in using SMS challenges. Additional fees may apply.
**Notifying** on an attempt will send an informational email to users and/or admins when Radar detects a suspicious behavior. This is helpful to proactively make individuals aware that an attack might be taking place, or their account was compromised.
![Radar configuration](https://images.workoscdn.com/images/f9f112c8-e731-4b8a-9e83-7bcea4527ac9.png?auto=format&fit=clip&q=50)
Out of the box, Radar ships with the following detections:
### Bot detection
[](https://workos.com/docs/authkit/radar#bot-detection)
Block or challenge sign-in attempts that are initiated by a bot or program.
In addition to detecting that the client is a bot, Radar can differentiate between different types of bots such as AI agents or search engine crawlers, giving developers the ability to control which kinds of bots are restricted.
![Radar bot configuration](https://images.workoscdn.com/images/9191ad0f-e898-4044-8947-cfb388ea7952.png?auto=format&fit=clip&q=50)
### Brute force
[](https://workos.com/docs/authkit/radar#brute-force)
Block or challenge sign-in attempts that are part of an attempt to break into accounts using brute force.
These are attacks where a bad actor is trying many sign-ins over a short period of time. Radar leverages the device fingerprint to identify and isolate bad actors from legitimate traffic, ensuring that your users can use your app even when it’s under attack.
![Radar brute force configuration](https://images.workoscdn.com/images/28988276-a698-4517-8d9b-48e75d4e1b2b.png?auto=format&fit=clip&q=50)
### Impossible travel
[](https://workos.com/docs/authkit/radar#impossible-travel)
Block or challenge sign-in attempts that occur from different geolocations in short succession.
By tracking device geolocation, Radar can detect when subsequent authentication requests are spread around the globe. Radar will detect if these attempts happen over a short period where it’s not possible for the person to physically travel that distance
![Radar impossible travel configuration](https://images.workoscdn.com/images/458b59af-a3e8-4646-b8a2-1bc04ae27e8e.png?auto=format&fit=clip&q=50)
### Repeat sign up
[](https://workos.com/docs/authkit/radar#repeat-sign-up)
Block or challenge repeat sign up attempts from the same email. By default, AuthKit fully deletes users.
If your application allows for account deletion and has a free-trial, then users may be able to delete their account and sign up again to get a new free-trial. This protection restricts an email to a max of three uses before denying further sign ups.
![Radar Repeat Sign Up protection modal](https://images.workoscdn.com/images/3e4a6937-c891-4076-b2bf-a2ed829c8004.png?auto=format&fit=clip&q=50)
### Stale accounts
[](https://workos.com/docs/authkit/radar#stale-accounts)
Get notified when an account that has been dormant without use becomes active
In contexts such as financial services, a dormant account becoming active might be an indication that the account has been taken over from the user and is being used for fraud. For these kinds of apps, Radar can notify the user and administrator if an account that hasn’t been used in a while has a sign-in attempt. Accounts are considered stale if there have been no successful sign-in in the past 60 days.
![Radar stale account configuration](https://images.workoscdn.com/images/f7a1a8e9-61ba-4c54-9cdb-d54ae7890092.png?auto=format&fit=clip&q=50)
### Unrecognized device
[](https://workos.com/docs/authkit/radar#unrecognized-device)
Get notified when a device that has never been used before signs in to an account
Using the device fingerprint, Radar checks if the device being used has been part of a successful sign-in before. If it hasn’t, both the user and an administrator can be notified by email.
![Radar unrecognized device configuration](https://images.workoscdn.com/images/f574e3d9-feed-43bc-aadb-2790cbfd2ce0.png?auto=format&fit=clip&q=50)
## Managed lists
[](https://workos.com/docs/authkit/radar#managed-lists)
### Disposable email domains
[](https://workos.com/docs/authkit/radar#disposable-email-domains)
Radar maintains a constantly updated list of email domains known to provide disposable email services. Disposable email services may be used to bypass free account or free trial limits in your application.
You can choose to block or log registrations that match an email domain in this list. Logging is useful to verify no adverse impact will occur before blocking all the domains.
![Radar Disposable Email List Protection](https://images.workoscdn.com/images/33d5c007-a5c3-4451-8da2-745bb4096268.png?auto=format&fit=clip&q=50)
### U.S. Sanctioned countries
[](https://workos.com/docs/authkit/radar#u-s-sanctioned-countries)
Block users from countries under US Sanctions from signing up or logging into your application. Contact support to get the current list of countries.
If you need to block a different set of countries, please reach out to support via email or slack to configure regional blocks. Radar supports any region in the [ISO 3166-1 specification](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes).
![Radar US sanctions country managed lists](https://images.workoscdn.com/images/a2cff432-daf6-4c8f-a192-f33071afacf5.png?auto=format&fit=clip&q=50)
## Custom restrictions
[](https://workos.com/docs/authkit/radar#custom-restrictions)
Specific user identifiers can be configured to always allow or deny an authentication attempt. Examples of using a custom restrictions:
  * Restricting sign-ins to a corporate IP range
  * Allow a script with a specific user agent to bypass bot detection
  * Banning specific devices (i.e. iPods) from using your app
  * Allowing certain users to bypass detections that are false positives

Note: the allow list takes preference – if an user matches an identifier that is in the allow list, they will bypass all other Radar rules.
![Radar restrictions configuration](https://images.workoscdn.com/images/bda02327-1d15-4e9c-b559-08b101930880.png?auto=format&fit=clip&q=50)
[ Roles and PermissionsManage and assign roles and permissions to users Up next ](https://workos.com/docs/authkit/roles-and-permissions)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
