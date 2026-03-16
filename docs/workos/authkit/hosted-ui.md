---
source_url: "https://workos.com/docs/authkit/hosted-ui"
title: "Hosted UI"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
AuthKit
AuthKit
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fauthkit%2Fhosted-ui)
Getting Started[Quick StartQuick Start](https://workos.com/docs/authkit)[CLI InstallerCLI Installer](https://workos.com/docs/authkit/cli-installer)[Example AppsExample Apps](https://workos.com/docs/authkit/example-apps)Modeling Your App[Introduction and conceptsIntroduction and concepts](https://workos.com/docs/authkit/modeling-your-app)[SSO with contractorsSSO with contractors](https://workos.com/docs/authkit/sso-with-contractors)[Invite-only signupInvite-only signup](https://workos.com/docs/authkit/invite-only-signup)Integrating[Users and OrganizationsUsers and Organizations](https://workos.com/docs/authkit/users-organizations)[Hosted UIHosted UI](https://workos.com/docs/authkit/hosted-ui)[SessionsSessions](https://workos.com/docs/authkit/sessions)[BrandingBranding](https://workos.com/docs/authkit/branding)[MigrationsMigrations](https://workos.com/docs/authkit/migrations)[WidgetsWidgets](https://workos.com/docs/widgets)[ActionsActions](https://workos.com/docs/authkit/actions)[MCPMCP](https://workos.com/docs/authkit/mcp)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Authentication[Single Sign-OnSingle Sign-On](https://workos.com/docs/authkit/sso)[Email + PasswordEmail + Password](https://workos.com/docs/authkit/email-password)[PasskeysPasskeys](https://workos.com/docs/authkit/passkeys)[Social LoginSocial Login](https://workos.com/docs/authkit/social-login)[Multi-Factor AuthMulti-Factor Auth](https://workos.com/docs/authkit/mfa)[Magic AuthMagic Auth](https://workos.com/docs/authkit/magic-auth)[CLI AuthCLI Auth](https://workos.com/docs/authkit/cli-auth)Features[API KeysAPI Keys](https://workos.com/docs/authkit/api-keys)[Custom EmailsCustom Emails](https://workos.com/docs/authkit/custom-emails)[Custom Email ProvidersCustom Email Providers](https://workos.com/docs/authkit/custom-email-providers)[Directory ProvisioningDirectory Provisioning](https://workos.com/docs/authkit/directory-provisioning)[Domain VerificationDomain Verification](https://workos.com/docs/authkit/domain-verification)[Email VerificationEmail Verification](https://workos.com/docs/authkit/email-verification)[Identity LinkingIdentity Linking](https://workos.com/docs/authkit/identity-linking)[ImpersonationImpersonation](https://workos.com/docs/authkit/impersonation)[InvitationsInvitations](https://workos.com/docs/authkit/invitations)[JIT ProvisioningJIT Provisioning](https://workos.com/docs/authkit/jit-provisioning)[JWT TemplatesJWT Templates](https://workos.com/docs/authkit/jwt-templates)[Metadata and External IDsMetadata and External IDs](https://workos.com/docs/authkit/metadata)[Organization PoliciesOrganization Policies](https://workos.com/docs/authkit/organization-policies)[RadarRadar](https://workos.com/docs/authkit/radar)[Roles and PermissionsRoles and Permissions](https://workos.com/docs/authkit/roles-and-permissions)WorkOS Connect[Getting StartedGetting Started](https://workos.com/docs/authkit/connect)[OAuth ApplicationsOAuth Applications](https://workos.com/docs/authkit/connect/oauth)[M2M ApplicationsM2M Applications](https://workos.com/docs/authkit/connect/m2m)[StandaloneStandalone](https://workos.com/docs/authkit/connect/standalone)Add-ons[Google AnalyticsGoogle Analytics](https://workos.com/docs/authkit/add-ons/google-analytics)[SegmentSegment](https://workos.com/docs/authkit/add-ons/segment)[StripeStripe](https://workos.com/docs/authkit/add-ons/stripe)
[](https://workos.com/docs/reference)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Hosted UI
Customizable sign-in UI that abstracts away all of the complexity associated with building secure authentication flows.
## On this page
  * [Introduction](https://workos.com/docs/authkit/hosted-ui#introduction)
  * [Authentication flow](https://workos.com/docs/authkit/hosted-ui#authentication-flow)
  * [Authentication methods](https://workos.com/docs/authkit/hosted-ui#authentication-methods)
  * [Localization](https://workos.com/docs/authkit/hosted-ui#localization)
  * [Integrating](https://workos.com/docs/authkit/hosted-ui#integrating)
    * [A. Integrate with AuthKit’s Hosted UI](https://workos.com/docs/authkit/hosted-ui#a-integrate-with-authkits-hosted-ui)
    * [B. Build your own authentication flows](https://workos.com/docs/authkit/hosted-ui#b-build-your-own-authentication-flows)

## Introduction
[](https://workos.com/docs/authkit/hosted-ui#introduction)
Implementing authentication flows that handle every possible error state and edge case across multiple identity providers can be a daunting task. AuthKit makes this easy by providing a hosted, pre-built, customizable authentication UI with automatic handling of:
  * Sign up, sign in, password reset, and [email verification](https://workos.com/docs/authkit/email-verification) flows.
  * Enterprise [SSO](https://workos.com/docs/authkit/sso) routing and [MFA](https://workos.com/docs/authkit/mfa) enrollment.
  * Automatic bot detection and blocking, to protect against brute force attacks.
  * Customizable [domain](https://workos.com/docs/custom-domains/authkit) and [branding](https://workos.com/docs/authkit/branding).

![AuthKit sign-in UI](https://images.workoscdn.com/images/4d736ca3-eec8-4a90-bd14-2530c4210415.png?auto=format&fit=clip&q=80)
## Authentication flow
[](https://workos.com/docs/authkit/hosted-ui#authentication-flow)
AuthKit is conceptually similar to a [Social Login (OAuth)](https://workos.com/docs/authkit/social-login) experience, but with the added benefit of being able to authenticate users with any identity provider.
AuthKit sits outside of your application code. When a user initiates a sign-in request, your application redirects them to the AuthKit URL. The user then completes the authentication process with WorkOS before being returned to the application.
Your application will exchange the resulting authorization code to retrieve an authenticated [User object](https://workos.com/docs/reference/authkit/user) and handle the session.
![AuthKit authentication flow diagram](https://images.workoscdn.com/images/0b3265fa-a209-4ca7-beaf-7d2514a3e00a.png?auto=format&fit=clip&q=80)
The AuthKit flow abstracts away many of the UX and WorkOS API calling concerns automatically, for more guidance on integrating with AuthKit, see the [Quick Start](https://workos.com/docs/authkit) guide.
AuthKit also provides a signup flow for creating users. Available options are determined by the configured [authentication methods](https://workos.com/docs/authkit/hosted-ui/authentication-methods). If a user’s email address is associated with an SSO connection, they will automatically be redirected to sign up via their IdP.
## Authentication methods
[](https://workos.com/docs/authkit/hosted-ui#authentication-methods)
AuthKit’s hosted UI supports all of the authentication methods available and will automatically adjust the available options depending on the configured methods in the _Authentication_ section of the [WorkOS Dashboard](https://dashboard.workos.com).
![Dashboard displaying available authentication methods](https://images.workoscdn.com/images/ea3b2c3b-723e-462c-aa10-6b1cec1b635f.png?auto=format&fit=clip&q=80)
Email + Password authentication is enabled by default, though set up may be required to enable additional methods. See the relevant feature section for more information:
  * [Single Sign-On](https://workos.com/docs/authkit/sso)
  * [Email + Password](https://workos.com/docs/authkit/email-password)
  * [Social Login](https://workos.com/docs/authkit/social-login)
  * [Multi-Factor Auth](https://workos.com/docs/authkit/mfa)
  * [Magic Auth](https://workos.com/docs/authkit/magic-auth)

## Localization
[](https://workos.com/docs/authkit/hosted-ui#localization)
By default, AuthKit’s hosted UI is automatically localized into many global languages. Your users will be served in the locale that closest matches their device’s OS preference. All user-facing text, including error messages and transactional emails, are translated into the user’s native tongue.
### Supported locales
Locale code | Language | Autonym  
---|---|---  
`af` | Afrikaans | Afrikaans  
`am` | Amharic | አማርኛ  
`ar` | Arabic | العربية  
`bg` | Bulgarian | Български  
`bn` | Bengali (Bangla) | বাংলা  
`bs` | Bosnian | Bosanski  
`ca` | Catalan | Català  
`cs` | Czech | Čeština  
`da` | Danish | Dansk  
`de` | German | Deutsch  
`de-DE` | German (Germany) | Deutsch (Deutschland)  
`el` | Greek | Ελληνικά  
`en` | English | English  
`en-AU` | English (Australia) | English (Australia)  
`en-CA` | English (Canada) | English (Canada)  
`en-GB` | English (UK) | English (UK)  
`en-US` | English (US) | English (US)  
`es` | Spanish | Español  
`es-419` | Spanish (Latin America) | Español (Latinoamérica)  
`es-ES` | Spanish (Spain) | Español (España)  
`es-US` | Spanish (US) | Español (EE.UU.)  
`et` | Estonian | Eesti  
`fa` | Farsi (Persian) | فارسی  
`fi` | Finnish | Suomi  
`fil` | Filipino (Tagalog) | Filipino  
`fr` | French | Français  
`fr-BE` | French (Belgium) | Français (Belgique)  
`fr-CA` | French (Canada) | Français (Canada)  
`fr-FR` | French (France) | Français (France)  
`fy` | Frisian | Frysk  
`gl` | Galician | Galego  
`gu` | Gujarati | ગુજરાતી  
`ha` | Hausa | هَرْشٜن هَوْس  
`he` | Hebrew | עברית  
`hi` | Hindi | हिन्दी  
`hr` | Croatian | Hrvatski  
`hu` | Hungarian | Magyar  
`hy` | Armenian | Հայերեն  
`id` | Indonesian | Bahasa Indonesia  
`is` | Icelandic | Íslenska  
`it` | Italian | Italiano  
`it-IT` | Italian (Italy) | Italiano (Italia)  
`ja` | Japanese | 日本語  
`jv` | Javanese | ꦧꦱꦗꦮ  
`ka` | Georgian | ქართული  
`kk` | Kazakh | Қазақ тілі  
`km` | Khmer | ខេមរភាសា  
`kn` | Kannada | ಕನ್ನಡ  
`ko` | Korean | 한국어  
`lt` | Lithuanian | Lietuvių  
`lv` | Latvian | Latviešu  
`mk` | Macedonian | Македонски  
`ml` | Malayalam | മലയാളം  
`mn` | Mongolian | Монгол  
`mr` | Marathi | मराठी  
`ms` | Malay | Bahasa Melayu  
`my` | Burmese | မြန်မာ  
`nb` | Norwegian Bokmål | Norsk Bokmål  
`ne` | Nepali | नेपाली भाषा  
`nl` | Dutch | Nederlands  
`nl-BE` | Flemish | Vlaams  
`nl-NL` | Dutch (Netherlands) | Nederlands (Nederland)  
`nn` | Norwegian Nynorsk | Norsk Nynorsk  
`no` | Norwegian | Norsk  
`pa` | Punjabi | ਪੰਜਾਬੀ  
`pl` | Polish | Polski  
`pt` | Portuguese | Português  
`pt-BR` | Portuguese (Brazil) | Português (Brasil)  
`pt-PT` | Portuguese (Portugal) | Português (Portugal)  
`ro` | Romanian | Română  
`ru` | Russian | Русский  
`sk` | Slovak | Slovenčina  
`sl` | Slovenian | Slovenščina  
`sq` | Albanian | Shqip  
`sr` | Serbian | Српски  
`sv` | Swedish | Svenska  
`sw` | Swahili | Kiswahili  
`ta` | Tamil | தமிழ்  
`te` | Telugu | తెలుగు  
`th` | Thai | ไทย  
`tr` | Turkish | Türkçe  
`uk` | Ukrainian | Українська  
`ur` | Urdu | اُردُو  
`uz` | Uzbek | Ózbekça  
`vi` | Vietnamese | Tiếng Việt  
`zh` | Chinese | 中文  
`zh-CN` | Chinese (Simplified) | 中文 (中国)  
`zh-HK` | Chinese (Hong Kong) | 中文（香港）  
`zh-TW` | Chinese (Taiwan) | 中文（台灣）  
`zu` | Zulu | isiZulu  
In cases where a user’s browser does not send their preferred locale, or when AuthKit cannot identify a match, the user is served in the environment’s **fallback language**. The fallback language can be configured [in the dashboard](https://dashboard.workos.com/environment/authentication/features) in the _Authentication > Features > Localization_ section.
![With localization, you can change the environment's fallback language](https://images.workoscdn.com/images/bb8c017b-f9cd-4882-baa2-b38e01a51875.png?auto=format&fit=clip&q=50)
## Integrating
[](https://workos.com/docs/authkit/hosted-ui#integrating)
Integration into your app is quick and easy, though the route you choose varies depending on your specific requirements:
###  A. Integrate with AuthKit’s Hosted UI
[](https://workos.com/docs/authkit/hosted-ui#a-integrate-with-authkits-hosted-ui)
In just a few lines of code, you can add AuthKit to your app and start authenticating users. See the [quick start](https://workos.com/docs/authkit) guide for more information.
###  B. Build your own authentication flows
[](https://workos.com/docs/authkit/hosted-ui#b-build-your-own-authentication-flows)
While the hosted solution is the fastest way to get started, if you’d prefer to build and manage your own authentication UI, you can do so via the [AuthKit API](https://workos.com/docs/reference/authkit).
Examples of building custom UI are [available on GitHub](https://github.com/workos/authkit).
[ SessionsLearn more about integrating sessions Up next ](https://workos.com/docs/authkit/sessions)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
