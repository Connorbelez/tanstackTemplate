---
source_url: "https://workos.com/docs/glossary"
title: "Glossary"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Docs
Docs
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fglossary)
[](https://workos.com/docs)
# Glossary
Terminology and concepts used in the WorkOS documentation.
## On this page
  * [Access Token](https://workos.com/docs/glossary#access-token)
  * [ACS URL](https://workos.com/docs/glossary#acs-url)
  * [API Key](https://workos.com/docs/glossary#api-key)
  * [Attribute Mapping](https://workos.com/docs/glossary#attribute-mapping)
  * [Authorization Code](https://workos.com/docs/glossary#authorization-code)
  * [Authentication Challenge](https://workos.com/docs/glossary#authentication-challenge)
  * [Authentication Factor](https://workos.com/docs/glossary#authentication-factor)
  * [Authorization URL](https://workos.com/docs/glossary#authorization-url)
  * [Bearer Token](https://workos.com/docs/glossary#bearer-token)
  * [CIMD](https://workos.com/docs/glossary#cimd)
  * [Client ID](https://workos.com/docs/glossary#client-id)
  * [Client Secret](https://workos.com/docs/glossary#client-secret)
  * [Connection](https://workos.com/docs/glossary#connection)
  * [Discovery Endpoint](https://workos.com/docs/glossary#discovery-endpoint)
  * [Directory Group](https://workos.com/docs/glossary#directory-group)
  * [Directory Provider](https://workos.com/docs/glossary#directory-provider)
  * [Directory User](https://workos.com/docs/glossary#directory-user)
  * [Endpoint](https://workos.com/docs/glossary#endpoint)
  * [HRIS](https://workos.com/docs/glossary#hris)
  * [IdP](https://workos.com/docs/glossary#idp)
  * [IdP URI (Entity ID)](https://workos.com/docs/glossary#idp-uri-entity-id)
  * [IdP SSO URL](https://workos.com/docs/glossary#idp-sso-url)
  * [IdP Metadata](https://workos.com/docs/glossary#idp-metadata)
  * [JIT User Provisioning](https://workos.com/docs/glossary#jit-user-provisioning)
  * [JWT](https://workos.com/docs/glossary#jwt)
  * [Sign-out redirect](https://workos.com/docs/glossary#sign-out-redirect)
  * [OAuth 2.0](https://workos.com/docs/glossary#oauth-2-0)
  * [OIDC](https://workos.com/docs/glossary#oidc)
  * [Redirect URI](https://workos.com/docs/glossary#redirect-uri)
  * [SAML](https://workos.com/docs/glossary#saml)
  * [SCIM](https://workos.com/docs/glossary#scim)
  * [SP](https://workos.com/docs/glossary#sp)
  * [SP Entity ID](https://workos.com/docs/glossary#sp-entity-id)
  * [SP Metadata](https://workos.com/docs/glossary#sp-metadata)
  * [TOTP](https://workos.com/docs/glossary#totp)
  * [X.509 Certificate](https://workos.com/docs/glossary#x-509-certificate)

A. 
## Access Token
[](https://workos.com/docs/glossary#access-token)
An access token represents the successful authorization of your application to access a user’s profile. During the Single Sign-On authorization flow, you’ll receive an access token and profile in exchange for your authorization code.
## ACS URL
[](https://workos.com/docs/glossary#acs-url)
An Assertion Consumer Service URL (ACS URL) is an endpoint where an identity provider posts SAML responses.
## API Key
[](https://workos.com/docs/glossary#api-key)
A unique identifier used to authenticate your API requests.
## Attribute Mapping
[](https://workos.com/docs/glossary#attribute-mapping)
Attribute mapping allows IT administrators to customize the user claims that are sent to your application. WorkOS normalizes these claims, so you can depend on a reliable, expected set of user profile information.
## Authorization Code
[](https://workos.com/docs/glossary#authorization-code)
An authorization code is a temporary code that you will exchange for an access token. During the Single Sign-On authorization flow, you’ll exchange your authorization Code for an access token and profile.
## Authentication Challenge
[](https://workos.com/docs/glossary#authentication-challenge)
An authentication challenge, also known as challenge-response authentication, is a set of protocols that helps validate actions and protect resources from unauthorized access.
## Authentication Factor
[](https://workos.com/docs/glossary#authentication-factor)
An authentication factor is a category of credential that is intended to verify, sometimes in combination with other factors, that an entity requesting access to some system is who, or what, they are declared to be.
## Authorization URL
[](https://workos.com/docs/glossary#authorization-url)
An authorization URL is the location your user will be directed to for authentication.
B. 
## Bearer Token
[](https://workos.com/docs/glossary#bearer-token)
A Bearer Token is an HTTP authentication scheme that uses a single security token to act as the authentication of an API request. The client must send this token in the Authorization header when making requests to protected resources.
In the context of a Directory Sync integration, a Bearer Token is generated by WorkOS for SCIM providers such as Okta to authenticate endpoint requests.
C. 
## CIMD
[](https://workos.com/docs/glossary#cimd)
Client ID Metadata Document (CIMD) is the mechanism through which an MCP client identifies itself to an authorization server. You can use WorkOS and AuthKit to implement authentication for an MCP server you develop. As part of that, you’ll enable CIMD in the WorkOS Dashboard under _Connect_ → _Configuration_.
## Client ID
[](https://workos.com/docs/glossary#client-id)
The client ID is a public identifier for your application that maps to a specific WorkOS environment.
## Client Secret
[](https://workos.com/docs/glossary#client-secret)
The client secret is a value only known to your application and an OAuth identity provider. Currently, client secrets are used in OpenID Connect and Google/Microsoft/GitHub OAuth connections.
## Connection
[](https://workos.com/docs/glossary#connection)
A connection is a way for a group of users (typically in a single organization) to sign in to your application.
A directory connection is a way to retrieve a complete list of users and groups from an organization.
D. 
## Discovery Endpoint
[](https://workos.com/docs/glossary#discovery-endpoint)
An OIDC discovery endpoint is a URL that provides metadata about an OIDC provider, including the issuer URL, supported authentication and token endpoints, supported scopes, public keys for signature verification, and other configuration information.
The discovery endpoint path is `/.well-known/openid-configuration` on a URL.
Clients can use this endpoint to dynamically discover and interact with an OIDC provider without requiring manual configuration.
## Directory Group
[](https://workos.com/docs/glossary#directory-group)
A directory group is a collection of users within an organization who have been provisioned with access to your application.
## Directory Provider
[](https://workos.com/docs/glossary#directory-provider)
A directory provider is the source of truth for your enterprise client’s user and group lists.
## Directory User
[](https://workos.com/docs/glossary#directory-user)
A directory user is a person or entity within an organization who has been provisioned access to your application.
E. 
## Endpoint
[](https://workos.com/docs/glossary#endpoint)
An endpoint is a location where an API receives requests about a specific resource.
In the context of a Directory Sync integration, an endpoint is the standardized SCIM definition of two things: a `/Users` endpoint and a `/Groups` endpoint.
H. 
## HRIS
[](https://workos.com/docs/glossary#hris)
A Human Resources Information System (HRIS) is software designed to maintain, manage, and process detailed employee information and human resources-related policies.
I. 
## IdP
[](https://workos.com/docs/glossary#idp)
An Identity Provider (IdP) is the source of truth for your enterprise client’s user database and authentication. Sometimes referred when describing the IdP-initiated flow, which is an authentication flow that starts from an identity provider like Okta instead of your application.
## IdP URI (Entity ID)
[](https://workos.com/docs/glossary#idp-uri-entity-id)
An Identity Provider URI (Entity ID) is a globally unique name for an identity provider that performs SAML authentication assertions. Sometimes referred to as Identity Provider Issuer (Okta, Entra ID).
## IdP SSO URL
[](https://workos.com/docs/glossary#idp-sso-url)
An Identity Provider SSO URL (IdP SSO) is the URL your application’s users will be redirected to for authentication with an identity provider. Sometimes referred to as Identity Provider SAML 2.0 Endpoint (OneLogin).
## IdP Metadata
[](https://workos.com/docs/glossary#idp-metadata)
An Identity Provider Metadata (IdP Metadata) is the URL or XML file containing all of the metadata relevant to a specific identity provider. It includes attributes used by a service provider to route SAML messages, which minimizes the possibility of a rogue identity provider orchestrating a man-in-the-middle attack.
J. 
## JIT User Provisioning
[](https://workos.com/docs/glossary#jit-user-provisioning)
Just-in-time (JIT) user provisioning creates a user in an app when the user attempts to sign in for the first time. The account and respective role doesn’t exist until the user creates it – just-in-time.
## JWT
[](https://workos.com/docs/glossary#jwt)
JSON Web Tokens are an open, industry standard method for representing claims securely between two parties.
O. 
## Sign-out redirect
[](https://workos.com/docs/glossary#sign-out-redirect)
An allowlisted location a user is redirected to after they sign out via the Logout API.
## OAuth 2.0
[](https://workos.com/docs/glossary#oauth-2-0)
OAuth 2.0 is an open standard for authorization. WorkOS supports OAuth 2.0, and our Single Sign-On API is modeled after concepts found in OAuth.
## OIDC
[](https://workos.com/docs/glossary#oidc)
OpenID Connect (OIDC) is an open standard and identity layer built on top of the OAuth 2.0 framework.
R. 
## Redirect URI
[](https://workos.com/docs/glossary#redirect-uri)
A redirect URI is a required, allowlisted callback URL. The redirect URI indicates the location to return an authorized user to after an authorization code is granted, and the authentication process is complete.
S. 
## SAML
[](https://workos.com/docs/glossary#saml)
Security Assertion Markup Language (SAML) is an open standard for authentication. Most of your enterprise clients will require SAML 2.0 authentication for their Single Sign-On.
## SCIM
[](https://workos.com/docs/glossary#scim)
System for Cross-domain Identity Management (SCIM) is an open standard for managing automated user and group provisioning. It’s a standard that many directory providers interface with.
## SP
[](https://workos.com/docs/glossary#sp)
Service Provider (SP) is SAML parlance for “your application”. Sometimes referred when describing the SP-initiated flow, which is an authentication flow that starts from your application instead of an identity provider like Okta.
## SP Entity ID
[](https://workos.com/docs/glossary#sp-entity-id)
A Service Provider (SP) Entity ID is a globally unique name for a service provider that performs SAML authentication requests, and is the intended audience for SAML responses. It is sometimes referred to as the Audience value.
## SP Metadata
[](https://workos.com/docs/glossary#sp-metadata)
Service Provider Metadata (SP Metadata) is an XML file containing all of the metadata relevant to a specific service provider. Identity providers will use SP metadata files to make onboarding your application easier.
T. 
## TOTP
[](https://workos.com/docs/glossary#totp)
Time-based One-time Password (TOTP) is a temporary code, generated by an algorithm that uses the current time as a source of uniqueness.
X. 
## X.509 Certificate
[](https://workos.com/docs/glossary#x-509-certificate)
An X.509 Certificate is a public key certificate used to authenticate SAML assertions. Sometimes referred to as Token Signature (AD FS).
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
