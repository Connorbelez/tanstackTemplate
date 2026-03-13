---
source_url: "https://workos.com/docs/events"
title: "Events"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Events
Events
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fevents)
[Event typesEvent types](https://workos.com/docs/events)Data syncing[OverviewOverview](https://workos.com/docs/events/data-syncing)[Syncing with events APISyncing with events API](https://workos.com/docs/events/data-syncing/events-api)[Syncing with webhooksSyncing with webhooks](https://workos.com/docs/events/data-syncing/webhooks)[Data reconciliationData reconciliation](https://workos.com/docs/events/data-syncing/data-reconciliation)Observability[Streaming to DatadogStreaming to Datadog](https://workos.com/docs/events/observability/datadog)
[](https://workos.com/docs/reference)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
# Events
Respond to activity that occurs within WorkOS and third-party providers.
## On this page
  * [API key events ](https://workos.com/docs/events#api-key)
  * [Authentication events ](https://workos.com/docs/events#authentication)
  * [Connection events ](https://workos.com/docs/events#connection)
  * [Directory Sync events ](https://workos.com/docs/events#directory-sync)
  * [Email verification events ](https://workos.com/docs/events#email-verification)
  * [Feature flag events ](https://workos.com/docs/events#feature-flags)
  * [Invitation events ](https://workos.com/docs/events#invitation)
  * [Magic Auth events ](https://workos.com/docs/events#magic-auth)
  * [Organization events ](https://workos.com/docs/events#organization)
  * [Organization domain events ](https://workos.com/docs/events#organization-domain)
  * [Organization membership events ](https://workos.com/docs/events#organization-membership)
  * [Organization role events ](https://workos.com/docs/events#organization-role)
  * [Password reset events ](https://workos.com/docs/events#password-reset)
  * [Permission events ](https://workos.com/docs/events#permission)
  * [Role events ](https://workos.com/docs/events#role)
  * [Session events ](https://workos.com/docs/events#session)
  * [User events ](https://workos.com/docs/events#user)
  * [Vault events ](https://workos.com/docs/events#vault)

Events represent activity that has occurred within WorkOS or within third-party identity and directory providers. Your app can [sync the data](https://workos.com/docs/events/data-syncing) via either the events API or webhooks.
#### Event object
All event objects share a similar structure.
Attribute | Description  
---|---  
`event` | A string that distinguishes the event type.  
`id` | Unique identifier for the event.  
`data` | Event payload. Payloads match the corresponding [API objects](https://workos.com/docs/reference).  
`created_at` | Timestamp of when the event occurred.  
`context` | An optional object of extra information relevant to the event.  
## API key events 
[](https://workos.com/docs/events#api-key)
Events emitted when [API keys](https://workos.com/docs/authkit/api-keys) are created or revoked.
#### 
api_key.created
API key created event
JSON
```

| 
{

---|---  

|   "object": "event",

|   "id": "event_01KD8Z96BMTAXC8Z9VAQJEYJPW",

|   "event": "api_key.created",

|   "data": {

|     "object": "api_key",

|     "id": "api_key_01KD8Z96B7CEWS9F792MVPFZ5X",

|     "name": "testing key",

|     "owner": {

|       "id": "org_01KC5960YS14A61DAEZ30DJ0EG",

|       "type": "organization"

|     },

|     "obfuscated_value": "sk_…kZL1",

|     "permissions": ["posts:read"],

|     "last_used_at": null,

|     "created_at": "2025-12-24T20:02:23.200Z",

|     "updated_at": "2025-12-24T20:02:23.200Z"

|   },

|   "created_at": "2025-12-24T20:02:23.220Z",

|   "context": {}

| 
}

```

Triggered when an API key is created.
#### 
api_key.revoked
API key revoked event
JSON
```

| 
{

---|---  

|   "object": "event",

|   "id": "event_01KD8ZGJK4YWC2WHWHQA71DERV",

|   "event": "api_key.revoked",

|   "data": {

|     "object": "api_key",

|     "id": "api_key_01KD8Z96B7CEWS9F792MVPFZ5X",

|     "name": "testing key",

|     "owner": {

|       "id": "org_01KC5960YS14A61DAEZ30DJ0EG",

|       "type": "organization"

|     },

|     "obfuscated_value": "sk_…kZL1",

|     "permissions": ["posts:read"],

|     "last_used_at": null,

|     "created_at": "2025-12-24T20:02:23.200Z",

|     "updated_at": "2025-12-24T20:02:23.200Z"

|   },

|   "created_at": "2025-12-24T20:02:23.220Z",

|   "context": {}

| 
}

```

Triggered when an API key is revoked.
## Authentication events 
[](https://workos.com/docs/events#authentication)
Each step in the [authentication](https://workos.com/docs/reference/authkit/authentication) flow emits an authentication event. Authentication success events are emitted even when additional steps, such as MFA, are required to complete the process.
#### 
authentication.email_verification_failedComing soon
Email verification failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.email_verification_failed",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "email_verification",

|     "status": "failed",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "error": {

|       "code": "invalid_one_time_code",

|       "message": "Invalid one-time code"

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to verify their email.
#### 
authentication.email_verification_succeeded
Email verification succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.email_verification_succeeded",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "email_verification",

|     "status": "succeeded",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully verifies their email.
#### 
authentication.magic_auth_failed
Magic Auth failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.magic_auth_failed",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "magic_auth",

|     "status": "failed",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "error": {

|       "code": "authentication_method_not_allowed",

|       "message": "Google OAuth is disabled."

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to authenticate via Magic Auth.
#### 
authentication.magic_auth_succeeded
Magic Auth succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.magic_auth_succeeded",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "magic_auth",

|     "status": "succeeded",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully authenticates via Magic Auth.
#### 
authentication.mfa_failedComing soon
MFA failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.mfa_failed",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "mfa",

|     "status": "failed",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "error": {

|       "code": "invalid_one_time_code",

|       "message": "Invalid one-time code."

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to authenticate with a multi-factor authentication code.
#### 
authentication.mfa_succeeded
MFA succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.mfa_succeeded",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "mfa",

|     "status": "succeeded",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully authenticates with a multi-factor authentication code.
#### 
authentication.oauth_failed
OAuth failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.oauth_failed",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "oauth",

|     "status": "failed",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "error": {

|       "code": "invalid_credentials",

|       "message": "Invalid credentials."

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to authenticate via OAuth.
#### 
authentication.oauth_succeeded
OAuth succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.oauth_succeeded",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "oauth",

|     "status": "succeeded",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully authenticates via OAuth.
#### 
authentication.password_failed
Password authentication failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.password_failed",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "password",

|     "status": "failed",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "error": {

|       "code": "invalid_credentials",

|       "message": "Invalid credentials."

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to authenticate with password credentials.
#### 
authentication.password_succeeded
Password authentication succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.password_succeeded",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "password",

|     "status": "succeeded",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully authenticates with password credentials.
#### 
authentication.passkey_failed
Passkey authentication failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.passkey_failed",

|   "id": "event_01HS2EAGQA9EZW6D0MFCV5S38D",

|   "data": {

|     "type": "passkey",

|     "status": "failed",

|     "email": "todd@example.com",

|     "user_id": "user_01EHWNC0FCBHZ3BJ7EGKYXK0E6",

|     "error": {

|       "code": "invalid_credentials",

|       "message": "Invalid credentials."

|     },

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "ip_address": "0.0.0.0"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to authenticate with a passkey.
#### 
authentication.passkey_succeeded
Passkey authentication succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.passkey_succeeded",

|   "id": "event_01HS2EAGQA9EZW6D0MFCV5S38D",

|   "data": {

|     "type": "passkey",

|     "status": "succeeded",

|     "email": "todd@example.com",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "ip_address": "0.0.0.0",

|     "user_id": "user_01EHWNC0FCBHZ3BJ7EGKYXK0E6"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully authenticates with a passkey.
#### 
authentication.sso_failed
SSO failed event
JSON
```

| 
{

---|---  

|   "event": "authentication.sso_failed",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "sso",

|     "status": "failed",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "error": {

|       "code": "authentication_method_not_allowed",

|       "message": "SSO is disabled for this environment."

|     },

|     "sso": {

|       "connection_id": "conn_01FKJ843CVE8F7BXQSPFH0M53V",

|       "organization_id": "org_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E"

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user fails to authenticate with Single Sign-On.
#### 
authentication.sso_succeeded
SSO succeeded event
JSON
```

| 
{

---|---  

|   "event": "authentication.sso_succeeded",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "type": "sso",

|     "status": "succeeded",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "sso": {

|       "connection_id": "conn_01FKJ843CVE8F7BXQSPFH0M53V",

|       "organization_id": "org_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|       "session_id": "saml_session_01FKJ843CVE8F7BXQSPFH0M53V"

|     }

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a user successfully authenticates with Single Sign-On.
#### 
authentication.radar_risk_detected
Radar risk detected event
JSON
```

| 
{

---|---  

|   "event": "authentication.radar_risk_detected",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "auth_method": "magic_auth",

|     "action": "signup",

|     "control": "restriction",

|     "blocklist_type": "ip_address",

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when an authentication succeeds but is flagged by Radar. For example, the authentication may have succeeded at passing a Radar challenge.
## Connection events 
[](https://workos.com/docs/events#connection)
Events emitted when Single Sign-On connections are activated, deactivated, or deleted. Also emitted when a SAML certificate is renewed for the connection.
#### 
connection.activated
Connection activated event
JSON
```

| 
{

---|---  

|   "event": "connection.activated",

|   "id": "event_10FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "object": "connection",

|     "id": "conn_01EHWNC0FCBHZ3BJ7EGKYXK0E6",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "state": "active",

|     "connection_type": "OktaSAML",

|     "name": "Foo Corp's Connection",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "domains": [

|       {

|         "id": "org_domain_01EHWNFTAFCF3CQAE5A9Q0P1YB",

|         "object": "connection_domain",

|         "domain": "foo-corp.com"

|       }

|     ]

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Connection](https://workos.com/docs/reference/sso/connection) object.
Triggered when a connection is activated.
#### 
connection.deactivated
Connection deactivated event
JSON
```

| 
{

---|---  

|   "event": "connection.deactivated",

|   "id": "event_11FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "object": "connection",

|     "id": "conn_01EHWNC0FCBHZ3BJ7EGKYXK0E6",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "state": "inactive",

|     "connection_type": "OktaSAML",

|     "name": "Foo Corp's Connection",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "domains": [

|       {

|         "id": "org_domain_01EHWNFTAFCF3CQAE5A9Q0P1YB",

|         "object": "connection_domain",

|         "domain": "foo-corp.com"

|       }

|     ]

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Connection](https://workos.com/docs/reference/sso/connection) object.
Triggered when a connection is deactivated.
#### 
connection.deleted
Connection deleted event
JSON
```

| 
{

---|---  

|   "event": "connection.deleted",

|   "id": "event_12FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "object": "connection",

|     "id": "conn_01EHWNC0FCBHZ3BJ7EGKYXK0E6",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "state": "inactive",

|     "connection_type": "OktaSAML",

|     "name": "Foo Corp's Connection",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "domains": [

|       {

|         "id": "org_domain_01EHWNFTAFCF3CQAE5A9Q0P1YB",

|         "object": "connection_domain",

|         "domain": "foo-corp.com"

|       }

|     ]

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Connection](https://workos.com/docs/reference/sso/connection) object.
Triggered when a connection is deleted. The `state` attribute indicates connection state before deletion.
#### 
connection.saml_certificate_renewed
Connection certificate renewed event
JSON
```

| 
{

---|---  

|   "event": "connection.saml_certificate_renewed",

|   "id": "event_12FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "connection": {

|       "id": "conn_12FKJ843CVE8F7BXQSPFH0M53V",

|       "organization_id": "org_12FKJ843CVE8F7BXQSPFH0M53V"

|     },

|     "certificate": {

|       "certificate_type": "ResponseSigning",

|       "expiry_date": "2025-06-28T19:07:33.155Z"

|     },

|     "renewed_at": "2021-06-25T19:07:33.155Z"

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

The `certificate_type` can be one of `ResponseSigning`, `RequestSigning`, or `ResponseEncryption`.
Triggered when a SAML certificate is renewed either in the Dashboard or Admin Portal.
#### 
connection.saml_certificate_renewal_required
Connection certificate renewal required event
JSON
```

| 
{

---|---  

|   "event": "connection.saml_certificate_renewal_required",

|   "id": "event_12FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "connection": {

|       "id": "conn_12FKJ843CVE8F7BXQSPFH0M53V",

|       "organization_id": "org_12FKJ843CVE8F7BXQSPFH0M53V"

|     },

|     "certificate": {

|       "certificate_type": "ResponseSigning",

|       "expiry_date": "2021-06-28T19:07:33.155Z",

|       "is_expired": false

|     },

|     "days_until_expiry": 3

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

The `certificate_type` can be one of `ResponseSigning`, `RequestSigning`, or `ResponseEncryption`.
Triggered when a SAML certificate is expiring (multiple events are sent out as it approaches expiry), or expired (once every 7 days after expiry).
## Directory Sync events 
[](https://workos.com/docs/events#directory-sync)
Events emitted when directory-related resources are changed. To learn what exactly each of these events represents, see the [in-depth Directory Sync events guide](https://workos.com/docs/directory-sync/understanding-events).
#### 
dsync.activated
Directory activated event
JSON
```

| 
{

---|---  

|   "event": "dsync.activated",

|   "id": "event_01FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "object": "directory",

|     "external_key": "UWuccu6o1E0GqkYs",

|     "name": "Foo Corp's Directory",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "id": "directory_01EHWNC0FCBHZ3BJ7EGKYXK0E6",

|     "state": "active",

|     "type": "generic scim v2.0",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "domains": [

|       {

|         "object": "organization_domain",

|         "id": "org_domain_01EZTR5N6Y9RQKHK2E9F31KZX6",

|         "domain": "foo-corp.com"

|       }

|     ]

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` is based on the [Directory](https://workos.com/docs/reference/directory-sync/directory) object, but the `domain` property is replaced with a `domains` array of [Organization Domain](https://workos.com/docs/reference/organization-domain).
Triggered when a [directory is activated](https://workos.com/docs/directory-sync/understanding-events/directory-events/dsync-activated).
#### 
dsync.deleted
Directory deleted event
JSON
```

| 
{

---|---  

|   "event": "dsync.deleted",

|   "id": "event_03FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "object": "directory",

|     "id": "directory_01EHWNC0FCBHZ3BJ7EGKYXK0E6",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "type": "generic scim v2.0",

|     "state": "deleting",

|     "name": "Foo Corp's Directory",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z"

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` is based on the [Directory](https://workos.com/docs/reference/directory-sync/directory) object, except the `domain` property is omitted.
Triggered when a [directory is deleted](https://workos.com/docs/directory-sync/understanding-events/directory-events/dsync-deleted). The `state` attribute indicates directory state before deletion.
#### 
dsync.group.created
Directory group created event
JSON
```

| 
{

---|---  

|   "event": "dsync.group.created",

|   "id": "event_44FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "directory_group_01E1X5GPMMXF4T1DCERMVEEPVW",

|     "idp_id": "02grqrue4294w24",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "name": "Developers",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z"

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Directory Group](https://workos.com/docs/reference/directory-sync/directory-group) object.
Triggered when a [directory group is created](https://workos.com/docs/directory-sync/understanding-events/directory-group-events/dsync-group-created).
#### 
dsync.group.deleted
Directory group deleted event
JSON
```

| 
{

---|---  

|   "event": "dsync.group.deleted",

|   "id": "event_06FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "directory_group_01E1X5GPMMXF4T1DCERMVEEPVW",

|     "idp_id": "02grqrue4294w24",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "name": "Developers",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z"

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Directory Group](https://workos.com/docs/reference/directory-sync/directory-group) object.
Triggered when a [directory group is deleted](https://workos.com/docs/directory-sync/understanding-events/directory-group-events/dsync-group-deleted).
#### 
dsync.group.updated
Directory group updated event
JSON
```

| 
{

---|---  

|   "event": "dsync.group.updated",

|   "id": "event_54FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "directory_group_01E1X5GPMMXF4T1DCERMVEEPVW",

|     "idp_id": "02grqrue4294w24",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "name": "Developers",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "previous_attributes": {}

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Directory Group](https://workos.com/docs/reference/directory-sync/directory-group) object.
Triggered when a [directory group is updated](https://workos.com/docs/directory-sync/understanding-events/directory-group-events/dsync-group-updated).
#### 
dsync.group.user_added
Directory group user added event
JSON
```

| 
{

---|---  

|   "event": "dsync.group.user_added",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "user": {

|       "id": "directory_user_01E1X56GH84T3FB41SD6PZGDBX",

|       "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|       "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|       "idp_id": "2936",

|       "email": "eric@example.com",

|       "first_name": "Eric",

|       "last_name": "Schneider",

|       "state": "active",

|       "created_at": "2021-06-25T19:07:33.155Z",

|       "updated_at": "2021-06-25T19:07:33.155Z",

|       "custom_attributes": {

|         "emails": [

|           {

|             "primary": true,

|             "type": "work",

|             "value": "eric@example.com"

|           }

|         ],

|         "department": "Engineering",

|         "job_title": "Software Engineer",

|         "username": "eric@example.com"

|       },

|       "role": { "slug": "member" },

|       "roles": [{ "slug": "member" }]

|     },

|     "group": {

|       "id": "directory_group_01E1X5GPMMXF4T1DCERMVEEPVW",

|       "idp_id": "02grqrue4294w24",

|       "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|       "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|       "name": "Developers",

|       "created_at": "2021-06-25T19:07:33.155Z",

|       "updated_at": "2021-06-25T19:07:33.155Z"

|     }

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` contains a `user` which corresponds to the [Directory User](https://workos.com/docs/reference/directory-sync/directory-user) object and a `group` which corresponds to the [Directory Group](https://workos.com/docs/reference/directory-sync/directory-group) object. The `groups` field is omitted from the `user` object to avoid performance issues in large directories.
Triggered when a [directory group user is added](https://workos.com/docs/directory-sync/understanding-events/directory-group-events/dsync-group-user-added).
#### 
dsync.group.user_removed
Directory group user removed event
JSON
```

| 
{

---|---  

|   "event": "dsync.group.user_removed",

|   "id": "event_05FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "user": {

|       "id": "directory_user_01E1X56GH84T3FB41SD6PZGDBX",

|       "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|       "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|       "idp_id": "2936",

|       "email": "eric@example.com",

|       "first_name": "Eric",

|       "last_name": "Schneider",

|       "state": "active",

|       "created_at": "2021-06-25T19:07:33.155Z",

|       "updated_at": "2021-06-25T19:07:33.155Z",

|       "custom_attributes": {

|         "emails": [

|           {

|             "primary": true,

|             "type": "work",

|             "value": "eric@example.com"

|           }

|         ],

|         "department": "Engineering",

|         "job_title": "Software Engineer",

|         "username": "eric@example.com"

|       },

|       "role": { "slug": "member" },

|       "roles": [{ "slug": "member" }]

|     },

|     "group": {

|       "id": "directory_group_01E1X5GPMMXF4T1DCERMVEEPVW",

|       "idp_id": "02grqrue4294w24",

|       "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|       "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|       "name": "Developers",

|       "created_at": "2021-06-25T19:07:33.155Z",

|       "updated_at": "2021-06-25T19:07:33.155Z"

|     }

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` contains a `user` which corresponds to the [Directory User](https://workos.com/docs/reference/directory-sync/directory-user) object and a `group` which corresponds to the [Directory Group](https://workos.com/docs/reference/directory-sync/directory-group) object. The `groups` field is omitted from the `user` object to avoid performance issues in large directories.
Triggered when a [directory group user is removed](https://workos.com/docs/directory-sync/understanding-events/directory-group-events/dsync-group-user-removed).
#### 
dsync.user.created
Directory user created event
JSON
```

| 
{

---|---  

|   "event": "dsync.user.created",

|   "id": "event_07FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "directory_user_01E1X1B89NH8Z3SDFJR4H7RGX7",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "idp_id": "8931",

|     "email": "lela.block@example.com",

|     "first_name": "Lela",

|     "last_name": "Block",

|     "state": "active",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "custom_attributes": {

|       "emails": [

|         {

|           "primary": true,

|           "type": "work",

|           "value": "lela.block@example.com"

|         }

|       ],

|       "department": "Engineering",

|       "job_title": "Software Engineer",

|       "username": "lela.block@example.com"

|     },

|     "role": { "slug": "member" },

|     "roles": [{ "slug": "member" }]

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Directory User](https://workos.com/docs/reference/directory-sync/directory-user) object. The `groups` field is omitted to avoid performance issues in large directories.
Triggered when a [directory user is created](https://workos.com/docs/directory-sync/understanding-events/directory-user-events/dsync-user-created).
#### 
dsync.user.deleted
Directory user deleted event
JSON
```

| 
{

---|---  

|   "event": "dsync.user.deleted",

|   "id": "event_09FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "directory_user_01E1X1B89NH8Z3SDFJR4H7RGX7",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "idp_id": "8931",

|     "email": "lela.block@example.com",

|     "first_name": "Lela",

|     "last_name": "Block",

|     "state": "inactive",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "custom_attributes": {

|       "emails": [

|         {

|           "primary": true,

|           "type": "work",

|           "value": "lela.block@example.com"

|         }

|       ],

|       "department": "Engineering",

|       "job_title": "Software Engineer",

|       "username": "lela.block@example.com"

|     },

|     "role": { "slug": "member" },

|     "roles": [{ "slug": "member" }]

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Directory User](https://workos.com/docs/reference/directory-sync/directory-user) object. The `groups` field is omitted to avoid performance issues in large directories.
Triggered when a [directory user is deleted](https://workos.com/docs/directory-sync/understanding-events/directory-user-events/dsync-user-deleted). The `state` attribute indicates directory user state at time of deletion.
#### 
dsync.user.updated
Directory user updated event
JSON
```

| 
{

---|---  

|   "event": "dsync.user.updated",

|   "id": "event_08FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "directory_user_01E1X1B89NH8Z3SDFJR4H7RGX7",

|     "directory_id": "directory_01ECAZ4NV9QMV47GW873HDCX74",

|     "organization_id": "org_01EZTR6WYX1A0DSE2CYMGXQ24Y",

|     "idp_id": "8931",

|     "email": "lela.block@example.com",

|     "first_name": "Lela",

|     "last_name": "Block",

|     "state": "active",

|     "created_at": "2021-06-25T19:07:33.155Z",

|     "updated_at": "2021-06-25T19:07:33.155Z",

|     "custom_attributes": {

|       "emails": [

|         {

|           "primary": true,

|           "type": "work",

|           "value": "lela.block@example.com"

|         }

|       ],

|       "department": "Engineering",

|       "job_title": "Software Engineer",

|       "username": "lela.block@example.com"

|     },

|     "role": { "slug": "member" },

|     "roles": [{ "slug": "member" }],

|     "previous_attributes": {}

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Directory User](https://workos.com/docs/reference/directory-sync/directory-user) object. The `groups` field is omitted to avoid performance issues in large directories.
Triggered when a [directory user is updated](https://workos.com/docs/directory-sync/understanding-events/directory-user-events/dsync-user-updated).
## Email verification events 
[](https://workos.com/docs/events#email-verification)
Events emitted when a user is required to verify their email.
#### 
email_verification.created
Email verification created event
JSON
```

| 
{

---|---  

|   "event": "email_verification.created",

|   "id": "event_01HYGAQ6DVKP4TKDF8P8AHFP47",

|   "data": {

|     "object": "email_verification",

|     "id": "email_verification_01HYGAQN7DTHPWDDMMTW6GRN4Z",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "expires_at": "2023-11-16T21:32:25.235Z",

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Email verification](https://workos.com/docs/authkit/email-verification) object with the `code` omitted.
Triggered when a user is required to verify their email and a code is created.
## Feature flag events 
[](https://workos.com/docs/events#feature-flags)
Events emitted when WorkOS feature flags are created, updated, deleted, or their rules are updated.
#### 
flag.created
Feature flag created event
JSON
```

| 
{

---|---  

|   "event": "flag.created",

|   "id": "event_01K43DMGDK941Z4YPH6XGHTY3S",

|   "data": {

|     "id": "flag_01K43DMGCCK0STXE0EJT2AHQN0",

|     "name": "Advanced Audit Logging",

|     "slug": "advanced-audit-logging",

|     "object": "flag",

|     "created_at": "2025-08-28T17:56:30.985Z",

|     "updated_at": "2025-08-28T17:56:30.985Z",

|     "description": ""

|   },

|   "context": {

|     "client_id": "client_07FA3DZGSL941Z4YPH6XGHTY3S",

|     "actor": {

|       "id": "user_01K9ZXY7Q2W8V5LJ3T4B8N6M5",

|       "name": "Colin Morikawa",

|       "source": "dashboard"

|     }

|   },

|   "created_at": "2025-08-28T17:56:31.027Z"

| 
}

```

Payload `data` corresponds to the [Feature Flag](https://workos.com/docs/reference/feature-flags) object.
Triggered when a feature flag is created.
#### 
flag.updated
Feature flag updated event
JSON
```

| 
{

---|---  

|   "event": "flag.updated",

|   "id": "event_01K43DS82YTHC4BN2J0F6QNVW1",

|   "data": {

|     "id": "flag_01K43DMGCCK0STXE0EJT2AHQN0",

|     "name": "Advanced Audit Logging",

|     "slug": "advanced-audit-logging",

|     "object": "flag",

|     "created_at": "2025-08-28T17:56:30.985Z",

|     "updated_at": "2025-09-01T15:49:06.300Z",

|     "description": "Enable advanced audit logging for users",

|     "tags": ["audit", "logging", "beta"]

|   },

|   "context": {

|     "client_id": "client_07FA3DZGSL941Z4YPH6XGHTY3S",

|     "actor": {

|       "id": "user_01K9ZXY7Q2W8V5LJ3T4B8N6M5",

|       "name": "Colin Morikawa",

|       "source": "dashboard"

|     },

|     "previous_attributes": {

|       "description": "",

|       "tags": ["audit", "logging"]

|     }

|   },

|   "created_at": "2025-09-01T15:49:06.334Z"

| 
}

```

Payload `data` corresponds to the [Feature Flag](https://workos.com/docs/reference/feature-flags) object.
Triggered when a feature flag is updated.
#### 
flag.deleted
Feature flag deleted event
JSON
```

| 
{

---|---  

|   "event": "flag.deleted",

|   "id": "event_01K43DMGDK941Z4YPH6XGHTY3S",

|   "data": {

|     "id": "flag_01K43DMGCCK0STXE0EJT2AHQN0",

|     "name": "Advanced Audit Logging",

|     "slug": "advanced-audit-logging",

|     "object": "flag",

|     "created_at": "2025-08-28T17:56:30.985Z",

|     "updated_at": "2025-08-28T17:56:30.985Z",

|     "description": "Improved logging for audit trail"

|   },

|   "context": {

|     "client_id": "client_07FA3DZGSL941Z4YPH6XGHTY3S",

|     "actor": {

|       "id": "user_01K9ZXY7Q2W8V5LJ3T4B8N6M5",

|       "name": "Colin Morikawa",

|       "source": "dashboard"

|     }

|   },

|   "created_at": "2025-08-28T17:56:31.027Z"

| 
}

```

Payload `data` corresponds to the [Feature Flag](https://workos.com/docs/reference/feature-flags) object.
Triggered when a feature flag is deleted.
#### 
flag.rule_updated
Feature flag rule updated event
JSON
```

| 
{

---|---  

|   "event": "flag.rule_updated",

|   "id": "event_01K43DV45EXDX2M6M903MHYHP3",

|   "data": {

|     "id": "flag_01K43DMGCCK0STXE0EJT2AHQN0",

|     "name": "Advanced Audit Logging",

|     "slug": "advanced-audit-logging",

|     "object": "feature_flag",

|     "created_at": "2025-08-28T17:56:30.985Z",

|     "updated_at": "2025-08-28T17:56:30.985Z",

|     "description": ""

|   },

|   "context": {

|     "client_id": "client_07FA3DZGSL941Z4YPH6XGHTY3S",

|     "actor": {

|       "id": "user_01K1C557F5P0P36MJ1HE3GRXBN",

|       "name": "Tom Kim",

|       "source": "dashboard"

|     },

|     "access_type": "some",

|     "configured_targets": {

|       "organizations": [

|         { "id": "org_01K1C52WNZ2CR3A9QYHHVWXYZ1", "name": "Acme Corp" },

|         { "id": "org_01K1C52WNZ2CR3A9QYHHVWXYZ2", "name": "Globex Inc" }

|       ],

|       "users": []

|     },

|     "previous_attributes": {

|       "context": {

|         "access_type": "none",

|         "configured_targets": {

|           "organizations": [],

|           "users": []

|         }

|       }

|     }

|   },

|   "created_at": "2025-09-01T20:00:07.854Z"

| 
}

```

Payload `data` corresponds to the [Feature Flag](https://workos.com/docs/reference/feature-flags) object.
Triggered when a feature flag’s rules are modified.
## Invitation events 
[](https://workos.com/docs/events#invitation)
Events emitted when an [AuthKit user](https://workos.com/docs/reference/authkit/user) is invited to join an organization.
#### 
invitation.accepted
Invitation accepted event
JSON
```

| 
{

---|---  

|   "event": "invitation.accepted",

|   "id": "event_01HWWSM92W0M1GE0DV8BZS00E5",

|   "data": {

|     "object": "invitation",

|     "id": "invitation_01HWWSMMQSP0FAN9PF071E77W9",

|     "email": "todd@example.com",

|     "state": "accepted",

|     "accepted_at": "2023-11-16T21:32:25.235Z",

|     "revoked_at": null,

|     "expires_at": "2023-11-23T21:32:25.235Z",

|     "organization_id": "org_01HWWSSTF0QKDCXMZC911T8BTG",

|     "inviter_user_id": "user_01HYGAVW79Z32XVDXZJV0WM6Y9",

|     "accepted_user_id": "user_01HYGAVW79Z32XVDXZJV0WM6Y9",

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T22:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Invitation](https://workos.com/docs/reference/authkit/invitation) object with the `token` and `accept_invitation_url` omitted.
Triggered when a user accepts an invitation.
#### 
invitation.created
Invitation created event
JSON
```

| 
{

---|---  

|   "event": "invitation.created",

|   "id": "event_01HWWSM92W0M1GE0DV8BZS00E5",

|   "data": {

|     "object": "invitation",

|     "id": "invitation_01HWWSMMQSP0FAN9PF071E77W9",

|     "email": "todd@example.com",

|     "state": "pending",

|     "accepted_at": null,

|     "revoked_at": null,

|     "expires_at": "2023-11-23T21:32:25.235Z",

|     "organization_id": "org_01HWWSSTF0QKDCXMZC911T8BTG",

|     "inviter_user_id": "user_01HYGAVW79Z32XVDXZJV0WM6Y9",

|     "accepted_user_id": null,

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T21:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Invitation](https://workos.com/docs/reference/authkit/invitation) object with the `token` and `accept_invitation_url` omitted.
Triggered when a user is invited to sign up or to join an organization.
#### 
invitation.resent
Invitation resent event
JSON
```

| 
{

---|---  

|   "event": "invitation.resent",

|   "id": "event_01HWWSM92W0M1GE0DV8BZS00E5",

|   "data": {

|     "object": "invitation",

|     "id": "invitation_01HWWSMMQSP0FAN9PF071E77W9",

|     "email": "todd@example.com",

|     "state": "pending",

|     "accepted_at": null,

|     "revoked_at": null,

|     "expires_at": "2023-11-23T21:32:25.235Z",

|     "organization_id": "org_01HWWSSTF0QKDCXMZC911T8BTG",

|     "inviter_user_id": "user_01HYGAVW79Z32XVDXZJV0WM6Y9",

|     "accepted_user_id": null,

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T22:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Invitation](https://workos.com/docs/reference/authkit/invitation) object with the `token` and `accept_invitation_url` omitted.
Triggered when an invitation is resent.
#### 
invitation.revoked
Invitation revoked event
JSON
```

| 
{

---|---  

|   "event": "invitation.revoked",

|   "id": "event_01HWWSM92W0M1GE0DV8BZS00E5",

|   "data": {

|     "object": "invitation",

|     "id": "invitation_01HWWSMMQSP0FAN9PF071E77W9",

|     "email": "todd@example.com",

|     "state": "revoked",

|     "accepted_at": null,

|     "revoked_at": "2023-11-16T21:32:25.235Z",

|     "expires_at": "2023-11-23T21:32:25.235Z",

|     "organization_id": "org_01HWWSSTF0QKDCXMZC911T8BTG",

|     "inviter_user_id": "user_01HYGAVW79Z32XVDXZJV0WM6Y9",

|     "accepted_user_id": null,

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T22:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Invitation](https://workos.com/docs/reference/authkit/invitation) object with the `token` and `accept_invitation_url` omitted.
Triggered when an invitation is revoked.
## Magic Auth events 
[](https://workos.com/docs/events#magic-auth)
Events emitted when a user requests a Magic Auth code.
#### 
magic_auth.created
Magic Auth created event
JSON
```

| 
{

---|---  

|   "event": "magic_auth.created",

|   "id": "event_01HWWSTZVFADJG9M9EJMKXB043",

|   "data": {

|     "object": "magic_auth",

|     "id": "magic_auth_01HWWSVXCRMA5481VK9601SKQX",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "expires_at": "2023-11-16T21:32:25.235Z",

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Magic Auth](https://workos.com/docs/reference/authkit/magic-auth) object with the `code` omitted.
Triggered when a user initiates Magic Auth and an authentication code is created.
## Organization events 
[](https://workos.com/docs/events#organization)
Events emitted when WorkOS organizations are created, updated, or deleted.
#### 
organization.created
Organization created
JSON
```

| 
{

---|---  

|   "event": "organization.created",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M30K",

|   "data": {

|     "id": "org_01HV1VNQBQ24JVREYB94RFCNDC",

|     "name": "Foo Corp",

|     "object": "organization",

|     "external_id": null,

|     "domains": [

|       {

|         "id": "org_domain_01HV1VX5N18E48ETTHNNK54R6S",

|         "state": "verified",

|         "domain": "foo-corp.com",

|         "object": "organization_domain",

|         "organization_id": "org_01HV1VNQBQ24JVREYB94RFCNDC",

|         "verification_strategy": "manual",

|         "verification_prefix": "superapp-domain-verification-z3kjny",

|         "verification_token": "gBIJgYXZLjW8uHHpz614dkgqm",

|         "created_at": "2023-11-27T19:07:33.155Z",

|         "updated_at": "2023-11-27T19:07:33.155Z"

|       }

|     ],

|     "created_at": "2023-11-16T16:32:25.239Z",

|     "updated_at": "2023-11-16T16:32:25.239Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization](https://workos.com/docs/reference/organization) object.
Triggered when an organization is created.
#### 
organization.updated
Organization updated
JSON
```

| 
{

---|---  

|   "event": "organization.updated",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M30K",

|   "data": {

|     "id": "org_01HV1VNQBQ24JVREYB94RFCNDC",

|     "name": "Foo Corp",

|     "object": "organization",

|     "external_id": null,

|     "domains": [

|       {

|         "id": "org_domain_01HV1VX5N18E48ETTHNNK54R6S",

|         "state": "verified",

|         "domain": "foo-corp.com",

|         "object": "organization_domain",

|         "organization_id": "org_01HV1VNQBQ24JVREYB94RFCNDC",

|         "verification_strategy": "manual",

|         "verification_prefix": null,

|         "verification_token": null,

|         "created_at": "2023-11-27T19:07:33.155Z",

|         "updated_at": "2023-11-27T19:07:33.155Z"

|       }

|     ],

|     "created_at": "2023-11-16T16:32:25.239Z",

|     "updated_at": "2023-11-16T17:32:25.239Z"

|   },

|   "created_at": "2023-11-16T17:32:25.239Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization](https://workos.com/docs/reference/organization) object.
Triggered when an organization is updated.
#### 
organization.deleted
Organization deleted
JSON
```

| 
{

---|---  

|   "event": "organization.deleted",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M30K",

|   "data": {

|     "id": "org_01HV1VNQBQ24JVREYB94RFCNDC",

|     "name": "Foo Corp",

|     "object": "organization",

|     "external_id": null,

|     "domains": [

|       {

|         "id": "org_domain_01HV1VX5N18E48ETTHNNK54R6S",

|         "state": "verified",

|         "domain": "foo-corp.com",

|         "object": "organization_domain",

|         "organization_id": "org_01HV1VNQBQ24JVREYB94RFCNDC",

|         "verification_strategy": "manual"

|       }

|     ],

|     "created_at": "2023-11-16T16:32:25.239Z",

|     "updated_at": "2023-11-16T17:32:25.239Z"

|   },

|   "created_at": "2023-11-16T17:32:25.239Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization](https://workos.com/docs/reference/organization) object.
Triggered when an organization is deleted
## Organization domain events 
[](https://workos.com/docs/events#organization-domain)
Events emitted when organization domains are created, updated, deleted, or their verification status changes.
#### 
organization_domain.created
Organization domain created event
JSON
```

| 
{

---|---  

|   "event": "organization_domain.created",

|   "id": "event_01G69A9MDSW8MM1XW5S0EHA0NA",

|   "data": {

|     "object": "organization_domain",

|     "id": "org_domain_01EZTR5N6Y9RQKHK2E9F31KZX6",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "domain": "foo-corp.com",

|     "state": "pending",

|     "verification_token": "gBIJgYXZLjW8uHHpz614dkgqm",

|     "verification_strategy": "dns",

|     "verification_prefix": "superapp-domain-verification-z3kjny",

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Domain](https://workos.com/docs/reference/domain-verification) object.
Triggered when an organization domain is created.
#### 
organization_domain.updated
Organization domain updated event
JSON
```

| 
{

---|---  

|   "event": "organization_domain.updated",

|   "id": "event_01G69A9MDSW8MM1XW5S0EHA0NA",

|   "data": {

|     "object": "organization_domain",

|     "id": "org_domain_01EZTR5N6Y9RQKHK2E9F31KZX6",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "domain": "foo-corp.com",

|     "state": "verified",

|     "verification_prefix": "superapp-domain-verification-z3kjny",

|     "verification_token": "gBIJgYXZLjW8uHHpz614dkgqm",

|     "verification_strategy": "dns",

|     "created_at": "2022-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Domain](https://workos.com/docs/reference/domain-verification) object.
Triggered when an organization domain is updated.
#### 
organization_domain.deleted
Organization domain deleted event
JSON
```

| 
{

---|---  

|   "event": "organization_domain.deleted",

|   "id": "event_01G69A9MDSW8MM1XW5S0EHA0NA",

|   "data": {

|     "object": "organization_domain",

|     "id": "org_domain_01EZTR5N6Y9RQKHK2E9F31KZX6",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "domain": "foo-corp.com",

|     "state": "verified",

|     "verification_prefix": "superapp-domain-verification-z3kjny",

|     "verification_token": "gBIJgYXZLjW8uHHpz614dkgqm",

|     "verification_strategy": "dns",

|     "created_at": "2022-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Domain](https://workos.com/docs/reference/domain-verification) object.
Triggered when an organization domain is deleted.
#### 
organization_domain.verified
Organization domain verified event
JSON
```

| 
{

---|---  

|   "event": "organization_domain.verified",

|   "id": "event_07FKJ843CVE8F7BXQSPFH0M53A",

|   "data": {

|     "object": "organization_domain",

|     "id": "org_domain_01HACSKJ57W8M2Q0N2X759C5HS",

|     "organization_id": "org_01EHT88Z8J8795GZNQ4ZP1J81T",

|     "domain": "foo-corp.com",

|     "state": "verified",

|     "verification_prefix": "superapp-domain-verification-z3kjny",

|     "verification_token": "gBIJgYXZLjW8uHHpz614dkgqm",

|     "verification_strategy": "dns",

|     "created_at": "2022-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Domain](https://workos.com/docs/reference/domain-verification) object.
Triggered when an organization domain is verified.
#### 
organization_domain.verification_failed
Organization domain verification failed event
JSON
```

| 
{

---|---  

|   "event": "organization_domain.verification_failed",

|   "id": "event_07FKJ843CVE8F7BXQSPFH0M53A",

|   "data": {

|     "reason": "domain_verification_period_expired",

|     "organization_domain": {

|       "object": "organization_domain",

|       "id": "org_domain_01HACSKJ57W8M2Q0N2X759C5HS",

|       "organization_id": "org_01EHT88Z8J8795GZNQ4ZP1J81T",

|       "domain": "foo-corp.com",

|       "state": "failed",

|       "verification_token": "gBIJgYXZLjW8uHHpz614dkgqm",

|       "verification_strategy": "dns"

|     }

|   },

|   "created_at": "2021-06-25T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` contains a `reason` and an `organization_domain` which corresponds to the [Organization Domain](https://workos.com/docs/reference/domain-verification) object.
Triggered when an organization domain verification fails.
## Organization membership events 
[](https://workos.com/docs/events#organization-membership)
Events emitted when an [AuthKit user](https://workos.com/docs/reference/authkit/user) joins or leaves an organization.
#### 
organization_membership.created
Organization membership created event
JSON
```

| 
{

---|---  

|   "event": "organization_membership.created",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "id": "om_01E4ZCR3C56J083X43JQXF3JK5",

|     "object": "organization_membership",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "organization_id": "org_01E4ZCR3C56J083X43JQXF3JK5",

|     "status": "pending",

|     "role": {

|       "slug": "member"

|     },

|     "roles": [

|       {

|         "slug": "member"

|       }

|     ],

|     "custom_attributes": {

|       "department": "Engineering",

|       "job_title": "Software Engineer"

|     },

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Membership](https://workos.com/docs/reference/authkit/organization-membership) object.
Triggered when an organization membership is created.
#### 
organization_membership.deleted
Organization membership deleted event
JSON
```

| 
{

---|---  

|   "event": "organization_membership.deleted",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M97T",

|   "data": {

|     "id": "om_01E4ZCR3C56J083X43JQXF3JK5",

|     "object": "organization_membership",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "organization_id": "org_01E4ZCR3C56J083X43JQXF3JK5",

|     "status": "active",

|     "role": {

|       "slug": "member"

|     },

|     "roles": [

|       {

|         "slug": "member"

|       }

|     ],

|     "custom_attributes": {

|       "department": "Engineering",

|       "job_title": "Software Engineer"

|     },

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-27T03:14:45.864Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Membership](https://workos.com/docs/reference/authkit/organization-membership) object.
Triggered when an organization membership is deleted.
#### 
organization_membership.updated
Organization membership updated event
JSON
```

| 
{

---|---  

|   "event": "organization_membership.updated",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M30K",

|   "data": {

|     "id": "om_01E4ZCR3C56J083X43JQXF3JK5",

|     "object": "organization_membership",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "organization_id": "org_01E4ZCR3C56J083X43JQXF3JK5",

|     "status": "active",

|     "role": {

|       "slug": "member"

|     },

|     "roles": [

|       {

|         "slug": "member"

|       }

|     ],

|     "custom_attributes": {

|       "department": "Engineering",

|       "job_title": "Software Engineer"

|     },

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-18T17:10:15.121Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [Organization Membership](https://workos.com/docs/reference/authkit/organization-membership) object.
Triggered when an organization membership is updated.
## Organization role events 
[](https://workos.com/docs/events#organization-role)
Events emitted when [organization roles](https://workos.com/docs/reference/roles/organization-role) are created, updated, or deleted.
#### 
organization_role.created
Organization role created event
JSON
```

| 
{

---|---  

|   "event": "organization_role.created",

|   "id": "event_01HWDP814K1EN7VS6K3BD49GWD",

|   "data": {

|     "object": "organization_role",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "slug": "admin",

|     "name": "Admin",

|     "description": "Administrator role with full access",

|     "resource_type_slug": "organization",

|     "permissions": ["users:read", "users:write", "settings:manage"],

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the organization role object.
Triggered when an organization role is created.
#### 
organization_role.deleted
Organization role deleted event
JSON
```

| 
{

---|---  

|   "event": "organization_role.deleted",

|   "id": "event_01HWDP814K1EN7VS6K3BD49GWE",

|   "data": {

|     "object": "organization_role",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "slug": "admin",

|     "name": "Admin",

|     "description": "Administrator role with full access",

|     "resource_type_slug": "organization",

|     "permissions": ["users:read", "users:write", "settings:manage"],

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the organization role object.
Triggered when an organization role is deleted.
#### 
organization_role.updated
Organization role updated event
JSON
```

| 
{

---|---  

|   "event": "organization_role.updated",

|   "id": "event_01HWDP814K1EN7VS6K3BD49GWF",

|   "data": {

|     "object": "organization_role",

|     "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",

|     "slug": "admin",

|     "name": "Admin",

|     "description": "Administrator role with full access",

|     "resource_type_slug": "organization",

|     "permissions": ["users:read", "users:write", "settings:manage"],

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the organization role object.
Triggered when an organization role is updated.
## Password reset events 
[](https://workos.com/docs/events#password-reset)
Events emitted when a user requests to reset their password.
#### 
password_reset.created
Password reset created event
JSON
```

| 
{

---|---  

|   "event": "password_reset.created",

|   "id": "event_01HYGAT2P3A8XJ4E5AR88J02ZV",

|   "data": {

|     "object": "password_reset",

|     "id": "password_reset_01HYGATMCSBX77HQHP29XT5WV6",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "expires_at": "2023-11-16T21:32:25.235Z",

|     "created_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Organization Membership](https://workos.com/docs/reference/authkit/password-reset) object with the `token` omitted.
Triggered when a user requests to reset their password.
#### 
password_reset.succeeded
Password reset succeeded event
JSON
```

| 
{

---|---  

|   "event": "password_reset.succeeded",

|   "id": "event_01HYGAT2P3A8XJ4E5AR88J02ZV",

|   "data": {

|     "object": "password_reset",

|     "id": "password_reset_01HYGATMCSBX77HQHP29XT5WV6",

|     "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "expires_at": "2023-11-16T21:32:25.235Z",

|     "created_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T16:32:25.239Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [Password Reset](https://workos.com/docs/reference/authkit/password-reset) object with the `token` omitted.
Triggered when a user successfully resets their password.
## Permission events 
[](https://workos.com/docs/events#permission)
Events emitted when [permissions](https://workos.com/docs/reference/roles/permission) are created, updated, or deleted.
#### 
permission.created
Permission created event
JSON
```

| 
{

---|---  

|   "event": "permission.created",

|   "id": "event_01HWDP814K1EN7VS6K3BD49GWG",

|   "data": {

|     "object": "permission",

|     "id": "01HWDP91J37GZW2FT9GCEX8YWV",

|     "slug": "users:read",

|     "name": "Read Users",

|     "description": "Allows reading user data",

|     "system": false,

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the permission object.
Triggered when a permission is created.
#### 
permission.deleted
Permission deleted event
JSON
```

| 
{

---|---  

|   "event": "permission.deleted",

|   "id": "event_01HWDP814K1EN7VS6K3BD49GWH",

|   "data": {

|     "object": "permission",

|     "id": "01HWDP91J37GZW2FT9GCEX8YWV",

|     "slug": "users:read",

|     "name": "Read Users",

|     "description": "Allows reading user data",

|     "system": false,

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the permission object.
Triggered when a permission is deleted.
#### 
permission.updated
Permission updated event
JSON
```

| 
{

---|---  

|   "event": "permission.updated",

|   "id": "event_01HWDP814K1EN7VS6K3BD49GWI",

|   "data": {

|     "object": "permission",

|     "id": "01HWDP91J37GZW2FT9GCEX8YWV",

|     "slug": "users:read",

|     "name": "Read Users",

|     "description": "Allows reading user data",

|     "system": false,

|     "created_at": "2023-11-27T19:07:33.155Z",

|     "updated_at": "2023-11-27T19:07:33.155Z"

|   },

|   "created_at": "2023-11-27T19:07:33.155Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the permission object.
Triggered when a permission is updated.
## Role events 
[](https://workos.com/docs/events#role)
Events emitted when [environment roles](https://workos.com/docs/reference/roles/role) are created, updated, or deleted.
#### 
role.created
Role created event
JSON
```

| 
{

---|---  

|   "event": "role.created",

|   "id": "event_02F4KLW3C56P083X43JQXF4FO9",

|   "data": {

|     "object": "role",

|     "slug": "admin",

|     "permissions": ["posts:view"],

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T21:32:25.245Z",

|   "context": {}

| 
}

```

Triggered when a role is created.
#### 
role.deleted
Role deleted event
JSON
```

| 
{

---|---  

|   "event": "role.deleted",

|   "id": "event_01E4YCD3C56P083X43JQXF4JK5",

|   "data": {

|     "object": "role",

|     "slug": "developer",

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-18T10:12:18.121Z"

|   },

|   "created_at": "2023-11-21T18:14:01.399Z",

|   "context": {}

| 
}

```

Triggered when a role is deleted.
#### 
role.updated
Role updated event
JSON
```

| 
{

---|---  

|   "event": "role.updated",

|   "id": "event_01J21G0ED0N5Q5KZT9Z127Q2MZ",

|   "data": {

|     "object": "role",

|     "slug": "admin",

|     "permissions": ["posts:create", "posts:delete"],

|     "created_at": "2023-11-16T21:32:25.235Z",

|     "updated_at": "2023-11-16T21:32:25.235Z"

|   },

|   "created_at": "2023-11-16T21:32:25.245Z",

|   "context": {}

| 
}

```

Triggered when a role’s permissions are updated.
## Session events 
[](https://workos.com/docs/events#session)
Events emitted when AuthKit sessions are created.
#### 
session.created
Session created event
JSON
```

| 
{

---|---  

|   "event": "session.created",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53V",

|   "data": {

|     "object": "session",

|     "id": "session_01HSCBECW0D7AY8CA45AYKA64G",

|     "user_id": "user_01HQGXWZW8BSHRG3HVK2QF7XBX",

|     "organization_id": "org_01HQHCBRRAVQ7N3PX81VKAYXSX",

|     "impersonator": {

|       "email": "admin@example.com",

|       "reason": "Helping a customer fix an issue with their account."

|     },

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "created_at": "2024-03-19T21:56:25.080Z",

|     "updated_at": "2024-03-19T21:56:25.080Z"

|   },

|   "created_at": "2024-03-19T21:56:25.080Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when a session is created. Sessions started using [impersonation](https://workos.com/docs/authkit/impersonation) will include an additional `impersonator` field with data about the impersonator.
#### 
session.revoked
Session revoked event
JSON
```

| 
{

---|---  

|   "event": "session.revoked",

|   "id": "event_04FKJ843CVE8F7BXQSPFH0M53B",

|   "data": {

|     "object": "session",

|     "id": "session_01HSCBECW0D7AY8CA45AYKA64G",

|     "user_id": "user_01HQGXWZW8BSHRG3HVK2QF7XBX",

|     "organization_id": "org_01HQHCBRRAVQ7N3PX81VKAYXSX",

|     "impersonator": {

|       "email": "admin@example.com",

|       "reason": "Helping a customer fix an issue with their account."

|     },

|     "ip_address": "192.0.2.1",

|     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",

|     "created_at": "2024-03-19T21:56:25.080Z",

|     "updated_at": "2024-03-19T21:56:25.080Z"

|   },

|   "created_at": "2024-03-19T21:56:25.080Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Triggered when an issued session is revoked for a user.
## User events 
[](https://workos.com/docs/events#user)
Events emitted when [AuthKit users](https://workos.com/docs/reference/authkit/user) are created, updated, or deleted.
#### 
user.created
User created event
JSON
```

| 
{

---|---  

|   "event": "user.created",

|   "id": "event_02F4KLW3C56P083X43JQXF4FO9",

|   "data": {

|     "object": "user",

|     "id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "first_name": "Todd",

|     "last_name": "Rundgren",

|     "email_verified": false,

|     "profile_picture_url": "https://workoscdn.com/images/v1/123abc",

|     "created_at": "2023-11-18T09:18:13.120Z",

|     "updated_at": "2023-11-18T09:18:13.120Z"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {

|     "client_id": "client_123456789[](https://dashboard.workos.com/api-keys)"

|   }

| 
}

```

Payload `data` corresponds to the [User](https://workos.com/docs/reference/authkit/user) object.
Triggered when a user is created.
#### 
user.deleted
User deleted event
JSON
```

| 
{

---|---  

|   "event": "user.deleted",

|   "id": "event_123456abcd",

|   "data": {

|     "object": "user",

|     "id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "first_name": "Todd",

|     "last_name": "Rundgren",

|     "email_verified": true,

|     "profile_picture_url": "https://workoscdn.com/images/v1/123abc",

|     "created_at": "2023-11-16T21:26:25.427Z",

|     "updated_at": "2023-11-17T04:00:03.937Z"

|   },

|   "created_at": "2023-11-18T04:18:13.126Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [User](https://workos.com/docs/reference/authkit/user) object.
Triggered when a user is deleted.
#### 
user.updated
User updated event
JSON
```

| 
{

---|---  

|   "event": "user.updated",

|   "id": "event_02F4KLW3C56P083X43JQXF4FO9",

|   "data": {

|     "object": "user",

|     "id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",

|     "email": "todd@example.com",

|     "first_name": "Todd",

|     "last_name": "Rundgren",

|     "email_verified": true,

|     "profile_picture_url": "https://workoscdn.com/images/v1/123abc",

|     "created_at": "2023-11-18T09:18:13.120Z",

|     "updated_at": "2023-11-19T11:05:10.539Z"

|   },

|   "created_at": "2023-11-19T11:05:10.550Z",

|   "context": {}

| 
}

```

Payload `data` corresponds to the [User](https://workos.com/docs/reference/authkit/user) object.
Triggered when a user is updated.
## Vault events 
[](https://workos.com/docs/events#vault)
Events emitted when [Vault](https://workos.com/docs/vault) data, keys, or metadata are accessed or modified. Each event payload includes an `actor_id`, `actor_source`, and `actor_name` identifying who performed the action.
#### 
vault.data.created
Vault data created event
JSON
```

| 
{

---|---  

|   "event": "vault.data.created",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "kv_name": "user-ssn",

|     "key_id": "vault_key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "key_context": {

|       "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E"

|     }

|   },

|   "created_at": "2024-07-15T10:30:00.000Z",

|   "context": {}

| 
}

```

Triggered when a new encrypted object is stored in Vault.
#### 
vault.data.deleted
Vault data deleted event
JSON
```

| 
{

---|---  

|   "event": "vault.data.deleted",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9A",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "kv_name": "user-ssn"

|   },

|   "created_at": "2024-07-15T10:35:00.000Z",

|   "context": {}

| 
}

```

Triggered when an encrypted object is deleted from Vault.
#### 
vault.data.read
Vault data read event
JSON
```

| 
{

---|---  

|   "event": "vault.data.read",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9B",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "kv_name": "user-ssn",

|     "key_id": "vault_key_01JMD5H7X3KQXR9VBN2GW4FT8Y"

|   },

|   "created_at": "2024-07-15T10:32:00.000Z",

|   "context": {}

| 
}

```

Triggered when an encrypted object is read from Vault.
#### 
vault.data.updated
Vault data updated event
JSON
```

| 
{

---|---  

|   "event": "vault.data.updated",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9C",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "kv_name": "user-ssn",

|     "key_id": "vault_key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "key_context": {

|       "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E"

|     }

|   },

|   "created_at": "2024-07-15T10:31:00.000Z",

|   "context": {}

| 
}

```

Triggered when an existing encrypted object is updated in Vault.
#### 
vault.dek.decrypted
Vault DEK decrypted event
JSON
```

| 
{

---|---  

|   "event": "vault.dek.decrypted",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9D",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "key_id": "vault_key_01JMD5H7X3KQXR9VBN2GW4FT8Y"

|   },

|   "created_at": "2024-07-15T10:40:00.000Z",

|   "context": {}

| 
}

```

Triggered when a data encryption key (DEK) is decrypted.
#### 
vault.dek.read
Vault DEK read event
JSON
```

| 
{

---|---  

|   "event": "vault.dek.read",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9E",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "key_ids": [

|       "vault_key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|       "vault_key_01JMD5H7X3KQXR9VBN2GW4FT9F"

|     ],

|     "key_context": {

|       "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E"

|     }

|   },

|   "created_at": "2024-07-15T10:38:00.000Z",

|   "context": {}

| 
}

```

Triggered when one or more data encryption keys (DEKs) are read.
#### 
vault.kek.created
Vault KEK created event
JSON
```

| 
{

---|---  

|   "event": "vault.kek.created",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9G",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "key_name": "production-kek",

|     "key_id": "vault_key_01JMD5H7X3KQXR9VBN2GW4FT8Y"

|   },

|   "created_at": "2024-07-15T10:36:00.000Z",

|   "context": {}

| 
}

```

Triggered when a new key encryption key (KEK) is created.
#### 
vault.metadata.read
Vault metadata read event
JSON
```

| 
{

---|---  

|   "event": "vault.metadata.read",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9H",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key",

|     "kv_name": "user-ssn"

|   },

|   "created_at": "2024-07-15T10:34:00.000Z",

|   "context": {}

| 
}

```

Triggered when metadata for a Vault store is read.
#### 
vault.names.listed
Vault names listed event
JSON
```

| 
{

---|---  

|   "event": "vault.names.listed",

|   "id": "event_01JMD5H7X3KQXR9VBN2GW4FT9J",

|   "data": {

|     "actor_id": "key_01JMD5H7X3KQXR9VBN2GW4FT8Y",

|     "actor_source": "api",

|     "actor_name": "My API Key"

|   },

|   "created_at": "2024-07-15T10:33:00.000Z",

|   "context": {}

| 
}

```

Triggered when the list of Vault store names is retrieved.
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
