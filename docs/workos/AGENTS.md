# Workos Documentation

> Auto-generated agent-friendly documentation crawled from [https://workos.com/docs/](https://workos.com/docs/)

## Stats

- **Pages crawled**: 187
- **Source**: https://workos.com/docs/
- **llms.txt**: Found and merged

## File Tree

```
├── app
│   └── settings.md
├── authkit
│   ├── connect.md
│   ├── hosted-ui.md
│   ├── metadata.md
│   ├── radar.md
│   ├── roles-and-permissions.md
│   └── sso.md
├── blog
│   ├── a-developers-guide-to-startup-security-part-2.md
│   ├── add-sign-in-with-apple-nextjs-workos.md
│   ├── agents-need-authorization-not-just-authentication.md
│   ├── api-security-best-practices-for-ai-agents.md
│   ├── can-an-ai-agent-set-up-your-product.md
│   ├── claude-cowork-workshop-anthropic.md
│   ├── create-salesforce-leads-from-your-app-without-building-oauth.md
│   ├── developers-guide-jwks.md
│   ├── developers-guide-strong-passwords.md
│   ├── how-to-add-auth-to-your-lovable-app.md
│   ├── how-to-add-auth-to-your-replit-app.md
│   ├── rails-authentication-guide-2026.md
│   ├── rbac-with-workos-and-node.md
│   ├── role-based-access-control-example.md
│   ├── send-slack-notifications-without-oauth-workos-pipes.md
│   ├── series-c.md
│   ├── the-developers-guide-to-directory-sync-scim.md
│   ├── the-developers-guide-to-sso.md
│   ├── top-authentication-solutions-java-2026.md
│   ├── top-better-auth-alternatives-secure-authentication-2026.md
│   ├── workos-pipes-third-party-integrations.md
│   └── writing-my-first-evals.md
├── changelog
│   ├── accept-invitation-api.md
│   ├── ai-branding-assistance.md
│   ├── api-keys.md
│   ├── api-support-for-roles-and-permissions.md
│   ├── app-logos-in-the-admin-portal.md
│   ├── authkit-add-ons.md
│   ├── authkit-as-the-default-auth-in-convex.md
│   ├── authkit-custom-fonts.md
│   ├── authkit-for-platforms.md
│   ├── authkit-is-now-localized-in-90-languages.md
│   ├── authkit-login-integrations.md
│   ├── authkit-nextjs-v1-0-0.md
│   ├── authkit-role-assignment-via-sso.md
│   ├── authkit-sdk-for-tanstack-start.md
│   ├── authkit-starter-kit-for-laravel-cloud.md
│   ├── branding-email-previews.md
│   ├── cert-renewal-notification-webhooks.md
│   ├── clever-sso-support.md
│   ├── cli-auth.md
│   ├── client-id-metadata-support-for-mcp-auth.md
│   ├── convex-now-supports-workos-authkit.md
│   ├── copy-docs-as-markdown-for-use-with-llms.md
│   ├── country-blocks-with-radar.md
│   ├── custom-attributes-in-authkit.md
│   ├── custom-css-for-authkit.md
│   ├── custom-email-providers.md
│   ├── custom-logout-uris.md
│   ├── custom-metadata-external-id-and-jwt-templates.md
│   ├── custom-oauth-scopes-dashboard.md
│   ├── custom-oauth-scopes.md
│   ├── dashboard-search.md
│   ├── domain-verification-improvements.md
│   ├── domain-verification-widget.md
│   ├── feature-flag-management-api.md
│   ├── feature-flag-notifications-in-slack.md
│   ├── feature-flags-api.md
│   ├── feature-flags.md
│   ├── fga-development-image.md
│   ├── fga-playground.md
│   ├── fga-policy-helpers.md
│   ├── fga-test-command-in-the-workos-cli.md
│   ├── fine-grained-authorization.md
│   ├── impersonation-support-for-frontend-sessions.md
│   ├── jwt-claims-in-fga-policies.md
│   ├── jwt-templates-in-connect-for-mcp-and-oauth-apps.md
│   ├── last-used-login-method-in-authkit.md
│   ├── mailgun-support-for-custom-email-providers.md
│   ├── management-api-for-api-keys.md
│   ├── mcp-authorization-with-authkit.md
│   ├── mcp-documentation-server.md
│   ├── microsoft-sentinel-log-streaming-in-audit-logs.md
│   ├── multiple-roles-for-authkit.md
│   ├── multiple-roles-for-sso-and-dsync.md
│   ├── new-invitation-events.md
│   ├── new-oidc-sso-providers.md
│   ├── nextjs-b2b-starter-kit.md
│   ├── nine-new-providers-in-workos-pipes.md
│   ├── node-sdk-v8-pkce-support-and-improved-runtime-compatibility.md
│   ├── oauth-tokens-available-in-standalone-sso-api.md
│   ├── oidc-attributes.md
│   ├── organization-authorization-with-workos-connect.md
│   ├── organization-roles.md
│   ├── password-history.md
│   ├── pci-dss-certification.md
│   ├── pipes.md
│   ├── python-authkit-example-app.md
│   ├── radar-disposable-email-blocking.md
│   ├── saml-custom-attributes.md
│   ├── schema-based-policies-in-fga.md
│   ├── session-inactivity-timeouts.md
│   ├── sessions-api.md
│   ├── sign-in-with-intuit.md
│   ├── sign-in-with-vercel.md
│   ├── simplified-login-initiation.md
│   ├── sms-challenges-with-radar.md
│   ├── social-provider-initiated-email-changes.md
│   ├── sso-connection-issue-notifications-to-it-admins.md
│   ├── sso-role-assignment.md
│   ├── sso-sessions-lifecycle-improvements.md
│   ├── sso-sign-in-consent-screen.md
│   ├── sso-status-widget.md
│   ├── standalone-oauth-for-mcp.md
│   ├── stripe-billing-seat-sync.md
│   ├── supabase-integration-with-authkit.md
│   ├── support-for-changing-email-addresses.md
│   ├── token-refresh-remembers-most-recent-organization.md
│   ├── trust-center.md
│   ├── use-workos-to-secure-remote-mcp-servers-deployed-to-cloudflare.md
│   ├── user-level-feature-flags.md
│   ├── using-workos-with-on-prem-customers.md
│   ├── vault-bring-your-own-key-aws-kms.md
│   ├── vault.md
│   ├── vercel-marketplace-integration-support.md
│   ├── widgets-user-profile-and-organization-switcher.md
│   ├── wildcards-in-redirect-uris-for-production-environments.md
│   ├── workos-cli.md
│   ├── workos-connect.md
│   ├── workos-dashboard-notifications.md
│   ├── workos-guides.md
│   └── workos-vault-azure-support-byok.md
├── customers
│   ├── ai21-labs.md
│   ├── cerkl.md
│   ├── chromatic.md
│   ├── copy-ai.md
│   ├── cursor.md
│   ├── drata.md
│   ├── enjoyhq.md
│   ├── hopin.md
│   ├── indeed.md
│   └── magical.md
├── environment
│   ├── authentication
│   │   └── features.md
│   ├── authorization.md
│   ├── events.md
│   └── users.md
├── events
│   ├── observability
│   │   └── datadog.md
│   └── data-syncing.md
├── legal
│   ├── policies.md
│   └── privacy.md
├── about.md
├── admin-portal.md
├── api-keys.md
├── audit-logs.md
├── authkit.md
├── blog.md
├── careers.md
├── changelog.md
├── contact.md
├── cookies.md
├── custom-domains.md
├── customers.md
├── directory-sync.md
├── domain-verification.md
├── email.md
├── events.md
├── feature-flags.md
├── fga.md
├── fine-grained-authorization.md
├── glossary.md
├── history.md
├── index.md
├── integrations.md
├── llms-txt-source.md
├── migrate.md
├── organizations.md
├── pipes.md
├── podcast.md
├── pricing.md
├── rbac.md
├── redirects.md
├── reference.md
├── sdks.md
├── security.md
├── signup.md
├── single-sign-on.md
├── sso.md
├── uptime.md
├── user-management.md
├── vault.md
└── widgets.md
```

## Table of Contents

- [llms.txt Source](./llms-txt-source.md) — Original llms.txt from the site

- [Build for enterprise on day one](./about.md) — https://workos.com/about
- [Admin Portal](./admin-portal.md) — https://workos.com/admin-portal
- [Sign in to WorkOS](./api-keys.md) — https://dashboard.workos.com/api-keys
- [Audit Logs](./audit-logs.md) — https://workos.com/docs/audit-logs
- [Get started with AuthKit](./authkit.md) — https://workos.com/docs/authkit
- [Blog](./blog.md) — https://workos.com/blog
- [Careers at WorkOS](./careers.md) — https://workos.com/careers
- [The Changelog](./changelog.md) — https://workos.com/changelog
- [Contact us](./contact.md) — https://workos.com/contact
- [WorkOS Cookie Policy](./cookies.md) — https://workos.com/cookies
- [Custom Domains](./custom-domains.md) — https://workos.com/docs/custom-domains
- [Customers](./customers.md) — https://workos.com/customers
- [Directory Sync](./directory-sync.md) — https://workos.com/docs/directory-sync
- [Domain Verification](./domain-verification.md) — https://workos.com/docs/domain-verification
- [Email delivery](./email.md) — https://workos.com/docs/email
- [Events](./events.md) — https://workos.com/docs/events
- [Feature Flags](./feature-flags.md) — https://workos.com/docs/feature-flags
- [Fine-Grained Authorization (FGA)](./fga.md) — https://workos.com/docs/fga
- [Role-Based Access Control](./fine-grained-authorization.md) — https://workos.com/fine-grained-authorization
- [Glossary](./glossary.md) — https://workos.com/docs/glossary
- [WorkOS Status - Incident History](./history.md) — https://status.workos.com/history
- [AuthKit](./index.md) — https://workos.com/docs/
- [Integrations](./integrations.md) — https://workos.com/docs/integrations
- [Migrate to WorkOS](./migrate.md) — https://workos.com/docs/migrate
- [Sign in to WorkOS](./organizations.md) — https://dashboard.workos.com/organizations
- [Pipes](./pipes.md) — https://workos.com/docs/pipes
- [Crossing the](./podcast.md) — https://workos.com/podcast
- [Transparent pricing](./pricing.md) — https://workos.com/pricing
- [Role-Based Access Control (RBAC)](./rbac.md) — https://workos.com/docs/rbac
- [Sign in to WorkOS](./redirects.md) — https://dashboard.workos.com/redirects
- [Getting started](./reference.md) — https://workos.com/docs/reference
- [SDKs](./sdks.md) — https://workos.com/docs/sdks
- [Secure, out of the box](./security.md) — https://workos.com/security
- [Create your WorkOS account](./signup.md) — https://dashboard.workos.com/signup
- [Enterprise Single Sign-On](./single-sign-on.md) — https://workos.com/single-sign-on
- [Single Sign-On](./sso.md) — https://workos.com/docs/sso
- [WorkOS Status - Uptime History](./uptime.md) — https://status.workos.com/uptime
- [User Management](./user-management.md) — https://workos.com/user-management
- [Vault](./vault.md) — https://workos.com/docs/vault
- [WorkOS Widgets](./widgets.md) — https://workos.com/docs/widgets

### app/

- [Single Sign-On](./app/settings.md) — https://explore.workos.com/app/settings

### authkit/

- [Connect](./authkit/connect.md) — https://workos.com/docs/authkit/connect
- [Hosted UI](./authkit/hosted-ui.md) — https://workos.com/docs/authkit/hosted-ui
- [Metadata and External IDs](./authkit/metadata.md) — https://workos.com/docs/authkit/metadata
- [Radar](./authkit/radar.md) — https://workos.com/docs/authkit/radar
- [Roles and Permissions](./authkit/roles-and-permissions.md) — https://workos.com/docs/authkit/roles-and-permissions
- [Single Sign-On](./authkit/sso.md) — https://workos.com/docs/authkit/sso

### blog/

- [A Developer’s Guide to Startup Security: 15 Ways to Secure Your Startup (Part 2)](./blog/a-developers-guide-to-startup-security-part-2.md) — https://workos.com/blog/a-developers-guide-to-startup-security-part-2
- [How to add Sign in with Apple to your app using WorkOS](./blog/add-sign-in-with-apple-nextjs-workos.md) — https://workos.com/blog/add-sign-in-with-apple-nextjs-workos
- [WorkOS FGA: The authorization layer for AI agents](./blog/agents-need-authorization-not-just-authentication.md) — https://workos.com/blog/agents-need-authorization-not-just-authentication
- [API security best practices for the age of AI agents](./blog/api-security-best-practices-for-ai-agents.md) — https://workos.com/blog/api-security-best-practices-for-ai-agents
- [Can an AI agent set up your product?](./blog/can-an-ai-agent-set-up-your-product.md) — https://workos.com/blog/can-an-ai-agent-set-up-your-product
- [Claude Cowork workshop with Anthropic: Building a complete GTM pipeline in one session](./blog/claude-cowork-workshop-anthropic.md) — https://workos.com/blog/claude-cowork-workshop-anthropic
- [Create Salesforce leads from your app without building OAuth](./blog/create-salesforce-leads-from-your-app-without-building-oauth.md) — https://workos.com/blog/create-salesforce-leads-from-your-app-without-building-oauth
- [The developer’s guide to JWKS](./blog/developers-guide-jwks.md) — https://workos.com/blog/developers-guide-jwks
- [The developer's guide to strong passwords](./blog/developers-guide-strong-passwords.md) — https://workos.com/blog/developers-guide-strong-passwords
- [How to add auth to your Lovable app](./blog/how-to-add-auth-to-your-lovable-app.md) — https://workos.com/blog/how-to-add-auth-to-your-lovable-app
- [How to add auth to your Replit app with WorkOS](./blog/how-to-add-auth-to-your-replit-app.md) — https://workos.com/blog/how-to-add-auth-to-your-replit-app
- [Building authentication in Rails web applications: The complete guide for 2026](./blog/rails-authentication-guide-2026.md) — https://workos.com/blog/rails-authentication-guide-2026
- [How to build RBAC with WorkOS and Node](./blog/rbac-with-workos-and-node.md) — https://workos.com/blog/rbac-with-workos-and-node
- [8 Role-Based Access Control (RBAC) examples in action](./blog/role-based-access-control-example.md) — https://workos.com/blog/role-based-access-control-example
- [Send Slack notifications from your app without building OAuth](./blog/send-slack-notifications-without-oauth-workos-pipes.md) — https://workos.com/blog/send-slack-notifications-without-oauth-workos-pipes
- [WorkOS raises $100M Series C, hits $2B valuation](./blog/series-c.md) — https://workos.com/blog/series-c
- [The developer’s guide to Directory Sync and SCIM](./blog/the-developers-guide-to-directory-sync-scim.md) — https://workos.com/blog/the-developers-guide-to-directory-sync-scim
- [The developer’s guide to SSO](./blog/the-developers-guide-to-sso.md) — https://workos.com/blog/the-developers-guide-to-sso
- [Top 5 authentication solutions for secure Java apps in 2026](./blog/top-authentication-solutions-java-2026.md) — https://workos.com/blog/top-authentication-solutions-java-2026
- [Top 5 Better Auth alternatives for secure authentication in 2026](./blog/top-better-auth-alternatives-secure-authentication-2026.md) — https://workos.com/blog/top-better-auth-alternatives-secure-authentication-2026
- [WorkOS Pipes: Third-party integrations without the headache](./blog/workos-pipes-third-party-integrations.md) — https://workos.com/blog/workos-pipes-third-party-integrations
- [Writing my first evals](./blog/writing-my-first-evals.md) — https://workos.com/blog/writing-my-first-evals

### changelog/

- [Accept invitation API](./changelog/accept-invitation-api.md) — https://workos.com/changelog/accept-invitation-api
- [AI Branding Assistant](./changelog/ai-branding-assistance.md) — https://workos.com/changelog/ai-branding-assistance
- [API Keys](./changelog/api-keys.md) — https://workos.com/changelog/api-keys
- [API support for Roles and Permissions](./changelog/api-support-for-roles-and-permissions.md) — https://workos.com/changelog/api-support-for-roles-and-permissions
- [App logos in the Admin Portal](./changelog/app-logos-in-the-admin-portal.md) — https://workos.com/changelog/app-logos-in-the-admin-portal
- [AuthKit Add-ons](./changelog/authkit-add-ons.md) — https://workos.com/changelog/authkit-add-ons
- [AuthKit is the default auth in Convex](./changelog/authkit-as-the-default-auth-in-convex.md) — https://workos.com/changelog/authkit-as-the-default-auth-in-convex
- [AuthKit Custom Fonts](./changelog/authkit-custom-fonts.md) — https://workos.com/changelog/authkit-custom-fonts
- [AuthKit for Platforms](./changelog/authkit-for-platforms.md) — https://workos.com/changelog/authkit-for-platforms
- [AuthKit is now localized in 90 languages](./changelog/authkit-is-now-localized-in-90-languages.md) — https://workos.com/changelog/authkit-is-now-localized-in-90-languages
- [New enterprise login integrations in AuthKit](./changelog/authkit-login-integrations.md) — https://workos.com/changelog/authkit-login-integrations
- [authkit-nextjs v1.0.0](./changelog/authkit-nextjs-v1-0-0.md) — https://workos.com/changelog/authkit-nextjs-v1-0-0
- [AuthKit role assignment via SSO](./changelog/authkit-role-assignment-via-sso.md) — https://workos.com/changelog/authkit-role-assignment-via-sso
- [AuthKit SDK for TanStack Start](./changelog/authkit-sdk-for-tanstack-start.md) — https://workos.com/changelog/authkit-sdk-for-tanstack-start
- [AuthKit Starter Kit for Laravel Cloud](./changelog/authkit-starter-kit-for-laravel-cloud.md) — https://workos.com/changelog/authkit-starter-kit-for-laravel-cloud
- [Branding email previews](./changelog/branding-email-previews.md) — https://workos.com/changelog/branding-email-previews
- [Cert Renewal Notification Webhooks](./changelog/cert-renewal-notification-webhooks.md) — https://workos.com/changelog/cert-renewal-notification-webhooks
- [Clever SSO Support](./changelog/clever-sso-support.md) — https://workos.com/changelog/clever-sso-support
- [CLI Auth](./changelog/cli-auth.md) — https://workos.com/changelog/cli-auth
- [Client ID Metadata Support for MCP Auth](./changelog/client-id-metadata-support-for-mcp-auth.md) — https://workos.com/changelog/client-id-metadata-support-for-mcp-auth
- [Convex now supports WorkOS AuthKit](./changelog/convex-now-supports-workos-authkit.md) — https://workos.com/changelog/convex-now-supports-workos-authkit
- [Copy docs as Markdown for use with LLMs](./changelog/copy-docs-as-markdown-for-use-with-llms.md) — https://workos.com/changelog/copy-docs-as-markdown-for-use-with-llms
- [Country blocks with Radar](./changelog/country-blocks-with-radar.md) — https://workos.com/changelog/country-blocks-with-radar
- [Custom Attributes in AuthKit](./changelog/custom-attributes-in-authkit.md) — https://workos.com/changelog/custom-attributes-in-authkit
- [Custom CSS for AuthKit](./changelog/custom-css-for-authkit.md) — https://workos.com/changelog/custom-css-for-authkit
- [Custom email providers](./changelog/custom-email-providers.md) — https://workos.com/changelog/custom-email-providers
- [Custom Logout URIs](./changelog/custom-logout-uris.md) — https://workos.com/changelog/custom-logout-uris
- [Custom Metadata, External ID, and JWT Templates](./changelog/custom-metadata-external-id-and-jwt-templates.md) — https://workos.com/changelog/custom-metadata-external-id-and-jwt-templates
- [Custom OAuth scopes in the dashboard](./changelog/custom-oauth-scopes-dashboard.md) — https://workos.com/changelog/custom-oauth-scopes-dashboard
- [Custom OAuth scopes](./changelog/custom-oauth-scopes.md) — https://workos.com/changelog/custom-oauth-scopes
- [Dashboard Search](./changelog/dashboard-search.md) — https://workos.com/changelog/dashboard-search
- [Domain Verification Improvements](./changelog/domain-verification-improvements.md) — https://workos.com/changelog/domain-verification-improvements
- [Domain Verification Widget](./changelog/domain-verification-widget.md) — https://workos.com/changelog/domain-verification-widget
- [Feature Flag Management API](./changelog/feature-flag-management-api.md) — https://workos.com/changelog/feature-flag-management-api
- [Feature flag notifications in Slack](./changelog/feature-flag-notifications-in-slack.md) — https://workos.com/changelog/feature-flag-notifications-in-slack
- [Feature Flags API](./changelog/feature-flags-api.md) — https://workos.com/changelog/feature-flags-api
- [Feature Flags](./changelog/feature-flags.md) — https://workos.com/changelog/feature-flags
- [FGA Development Image](./changelog/fga-development-image.md) — https://workos.com/changelog/fga-development-image
- [FGA Playground](./changelog/fga-playground.md) — https://workos.com/changelog/fga-playground
- [FGA Policy Helpers](./changelog/fga-policy-helpers.md) — https://workos.com/changelog/fga-policy-helpers
- [FGA Test Command in the WorkOS CLI](./changelog/fga-test-command-in-the-workos-cli.md) — https://workos.com/changelog/fga-test-command-in-the-workos-cli
- [Fine-Grained Authorization](./changelog/fine-grained-authorization.md) — https://workos.com/changelog/fine-grained-authorization
- [Impersonation Support for Frontend Sessions](./changelog/impersonation-support-for-frontend-sessions.md) — https://workos.com/changelog/impersonation-support-for-frontend-sessions
- [Use JWT Claims in FGA Policies](./changelog/jwt-claims-in-fga-policies.md) — https://workos.com/changelog/jwt-claims-in-fga-policies
- [JWT Templates in Connect for MCP and OAuth Apps](./changelog/jwt-templates-in-connect-for-mcp-and-oauth-apps.md) — https://workos.com/changelog/jwt-templates-in-connect-for-mcp-and-oauth-apps
- [Last-used login method in AuthKit](./changelog/last-used-login-method-in-authkit.md) — https://workos.com/changelog/last-used-login-method-in-authkit
- [Mailgun support for custom email providers](./changelog/mailgun-support-for-custom-email-providers.md) — https://workos.com/changelog/mailgun-support-for-custom-email-providers
- [Management API for API Keys](./changelog/management-api-for-api-keys.md) — https://workos.com/changelog/management-api-for-api-keys
- [MCP Authorization with AuthKit](./changelog/mcp-authorization-with-authkit.md) — https://workos.com/changelog/mcp-authorization-with-authkit
- [MCP documentation server](./changelog/mcp-documentation-server.md) — https://workos.com/changelog/mcp-documentation-server
- [Microsoft Sentinel log streaming in Audit Logs](./changelog/microsoft-sentinel-log-streaming-in-audit-logs.md) — https://workos.com/changelog/microsoft-sentinel-log-streaming-in-audit-logs
- [Multiple Roles for AuthKit](./changelog/multiple-roles-for-authkit.md) — https://workos.com/changelog/multiple-roles-for-authkit
- [Multiple Roles for SSO and DSync](./changelog/multiple-roles-for-sso-and-dsync.md) — https://workos.com/changelog/multiple-roles-for-sso-and-dsync
- [New Invitation Events](./changelog/new-invitation-events.md) — https://workos.com/changelog/new-invitation-events
- [Expanded Support for OIDC SSO Providers](./changelog/new-oidc-sso-providers.md) — https://workos.com/changelog/new-oidc-sso-providers
- [Next.js B2B Starter Kit](./changelog/nextjs-b2b-starter-kit.md) — https://workos.com/changelog/nextjs-b2b-starter-kit
- [Nine new providers in WorkOS Pipes](./changelog/nine-new-providers-in-workos-pipes.md) — https://workos.com/changelog/nine-new-providers-in-workos-pipes
- [Node SDK v8: PKCE Support and Improved Runtime Compatibility](./changelog/node-sdk-v8-pkce-support-and-improved-runtime-compatibility.md) — https://workos.com/changelog/node-sdk-v8-pkce-support-and-improved-runtime-compatibility
- [OAuth tokens available in Standalone SSO API](./changelog/oauth-tokens-available-in-standalone-sso-api.md) — https://workos.com/changelog/oauth-tokens-available-in-standalone-sso-api
- [OIDC Attributes](./changelog/oidc-attributes.md) — https://workos.com/changelog/oidc-attributes
- [Organization Authorization with WorkOS Connect](./changelog/organization-authorization-with-workos-connect.md) — https://workos.com/changelog/organization-authorization-with-workos-connect
- [Organization roles](./changelog/organization-roles.md) — https://workos.com/changelog/organization-roles
- [Password History](./changelog/password-history.md) — https://workos.com/changelog/password-history
- [PCI DSS Certification](./changelog/pci-dss-certification.md) — https://workos.com/changelog/pci-dss-certification
- [Pipes](./changelog/pipes.md) — https://workos.com/changelog/pipes
- [Python AuthKit example app](./changelog/python-authkit-example-app.md) — https://workos.com/changelog/python-authkit-example-app
- [Radar disposable email blocking](./changelog/radar-disposable-email-blocking.md) — https://workos.com/changelog/radar-disposable-email-blocking
- [SAML Custom Attributes](./changelog/saml-custom-attributes.md) — https://workos.com/changelog/saml-custom-attributes
- [Schema-Based Policies in FGA](./changelog/schema-based-policies-in-fga.md) — https://workos.com/changelog/schema-based-policies-in-fga
- [Session inactivity timeouts](./changelog/session-inactivity-timeouts.md) — https://workos.com/changelog/session-inactivity-timeouts
- [Sessions API](./changelog/sessions-api.md) — https://workos.com/changelog/sessions-api
- [Sign in with Intuit](./changelog/sign-in-with-intuit.md) — https://workos.com/changelog/sign-in-with-intuit
- [Sign in with Vercel](./changelog/sign-in-with-vercel.md) — https://workos.com/changelog/sign-in-with-vercel
- [Simplified Login Initiation](./changelog/simplified-login-initiation.md) — https://workos.com/changelog/simplified-login-initiation
- [SMS Challenges with Radar](./changelog/sms-challenges-with-radar.md) — https://workos.com/changelog/sms-challenges-with-radar
- [Social Provider Initiated Email Changes](./changelog/social-provider-initiated-email-changes.md) — https://workos.com/changelog/social-provider-initiated-email-changes
- [SSO Connection Issue Notifications to IT Admins](./changelog/sso-connection-issue-notifications-to-it-admins.md) — https://workos.com/changelog/sso-connection-issue-notifications-to-it-admins
- [SSO Role Assignment in Admin Portal](./changelog/sso-role-assignment.md) — https://workos.com/changelog/sso-role-assignment
- [SSO Sessions Lifecycle Improvements](./changelog/sso-sessions-lifecycle-improvements.md) — https://workos.com/changelog/sso-sessions-lifecycle-improvements
- [SSO Sign-in Consent Screen](./changelog/sso-sign-in-consent-screen.md) — https://workos.com/changelog/sso-sign-in-consent-screen
- [SSO Status Widget](./changelog/sso-status-widget.md) — https://workos.com/changelog/sso-status-widget
- [Standalone OAuth for MCP](./changelog/standalone-oauth-for-mcp.md) — https://workos.com/changelog/standalone-oauth-for-mcp
- [Stripe Billing Seat Sync](./changelog/stripe-billing-seat-sync.md) — https://workos.com/changelog/stripe-billing-seat-sync
- [Supabase Integration with AuthKit](./changelog/supabase-integration-with-authkit.md) — https://workos.com/changelog/supabase-integration-with-authkit
- [Support for changing email addresses](./changelog/support-for-changing-email-addresses.md) — https://workos.com/changelog/support-for-changing-email-addresses
- [Token refresh remembers most recent organization](./changelog/token-refresh-remembers-most-recent-organization.md) — https://workos.com/changelog/token-refresh-remembers-most-recent-organization
- [Trust Center](./changelog/trust-center.md) — https://workos.com/changelog/trust-center
- [Use WorkOS to secure remote MCP Servers deployed to Cloudflare](./changelog/use-workos-to-secure-remote-mcp-servers-deployed-to-cloudflare.md) — https://workos.com/changelog/use-workos-to-secure-remote-mcp-servers-deployed-to-cloudflare
- [User Level Feature Flags](./changelog/user-level-feature-flags.md) — https://workos.com/changelog/user-level-feature-flags
- [Using WorkOS with on-prem customers](./changelog/using-workos-with-on-prem-customers.md) — https://workos.com/changelog/using-workos-with-on-prem-customers
- [Enterprises can bring their own key to WorkOS Vault](./changelog/vault-bring-your-own-key-aws-kms.md) — https://workos.com/changelog/vault-bring-your-own-key-aws-kms
- [WorkOS Vault](./changelog/vault.md) — https://workos.com/changelog/vault
- [Vercel Marketplace Integration Support](./changelog/vercel-marketplace-integration-support.md) — https://workos.com/changelog/vercel-marketplace-integration-support
- [Widgets - User Profile and Organization Switcher](./changelog/widgets-user-profile-and-organization-switcher.md) — https://workos.com/changelog/widgets-user-profile-and-organization-switcher
- [Use wildcards in Redirect URIs for production environments](./changelog/wildcards-in-redirect-uris-for-production-environments.md) — https://workos.com/changelog/wildcards-in-redirect-uris-for-production-environments
- [WorkOS CLI](./changelog/workos-cli.md) — https://workos.com/changelog/workos-cli
- [WorkOS Connect](./changelog/workos-connect.md) — https://workos.com/changelog/workos-connect
- [WorkOS Dashboard Notifications](./changelog/workos-dashboard-notifications.md) — https://workos.com/changelog/workos-dashboard-notifications
- [WorkOS Guides](./changelog/workos-guides.md) — https://workos.com/changelog/workos-guides
- [WorkOS Vault adds Azure support for Bring Your Own Key](./changelog/workos-vault-azure-support-byok.md) — https://workos.com/changelog/workos-vault-azure-support-byok

### customers/

- [How AI21 implemented SSO in days with WorkOS](./customers/ai21-labs.md) — https://workos.com/customers/ai21-labs
- [How Cerkl unblocked enterprise deals by integrating WorkOS SSO in two days](./customers/cerkl.md) — https://workos.com/customers/cerkl
- [How Chromatic successfully migrated from Passport.js](./customers/chromatic.md) — https://workos.com/customers/chromatic
- [Copy.ai picks WorkOS as the sole auth provider for SSO, SCIM, and User Management](./customers/copy-ai.md) — https://workos.com/customers/copy-ai
- [What’s your enterprise story?](./customers/cursor.md) — https://workos.com/customers/cursor
- [What’s your enterprise story?](./customers/drata.md) — https://workos.com/customers/drata
- [How EnjoyHQ implemented enterprise-level SSO in less than 4 hours](./customers/enjoyhq.md) — https://workos.com/customers/enjoyhq
- [How Hopin Saved Two Months of Engineering Time with WorkOS](./customers/hopin.md) — https://workos.com/customers/hopin
- [Indeed chooses WorkOS over Auth0 to strengthen their identity infrastructure](./customers/indeed.md) — https://workos.com/customers/indeed
- [How Magical won enterprise deals with WorkOS SSO](./customers/magical.md) — https://workos.com/customers/magical

### environment/

- [Sign in to WorkOS](./environment/authorization.md) — https://dashboard.workos.com/environment/authorization
- [Sign in to WorkOS](./environment/events.md) — https://dashboard.workos.com/environment/events
- [Sign in to WorkOS](./environment/users.md) — https://dashboard.workos.com/environment/users

### environment/authentication/

- [Sign in to WorkOS](./environment/authentication/features.md) — https://dashboard.workos.com/environment/authentication/features

### events/

- [Data syncing](./events/data-syncing.md) — https://workos.com/docs/events/data-syncing

### events/observability/

- [Stream events to Datadog](./events/observability/datadog.md) — https://workos.com/docs/events/observability/datadog

### legal/

- [WorkOS Legal Policies](./legal/policies.md) — https://workos.com/legal/policies
- [WorkOS Privacy Policy](./legal/privacy.md) — https://workos.com/legal/privacy
