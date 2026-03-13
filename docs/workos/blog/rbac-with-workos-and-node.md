---
source_url: "https://workos.com/blog/rbac-with-workos-and-node"
title: "How to build RBAC with WorkOS and Node"
crawl_depth: 2
---

[](https://workos.com/)
Products
[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/656545520bd5f04e20a3a6a7_um.png) User Management Complete auth & user management platform ](https://workos.com/user-management)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/63e1062ae62bc2260203e96f_icon-sso.png) Enterprise SSO Unified SSO integration for any identity provider ](https://workos.com/single-sign-on)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/673b4ed27842047837086d7a_icon-radar-nav.png) Radar Real-time protection against bots, fraud, and abuse  
](https://workos.com/radar)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/65654341bfdb733f6715f944_authkit.png) AuthKit Customizable UI for all authentication types ](https://authkit.com/?__hstc=26380002.305250fa29063ebaf80dc5715e4f787a.1773262425128.1773262425128.1773262425134.2&__hssc=26380002.39.1773262425134&__hsfp=7b352b7b5abd10220a336b7ddd180c88)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/63e10629cdacaa53e05c2a95_icon-directory-sync.png) Directory Sync User lifecycle management from corporate directories ](https://workos.com/directory-sync)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/68752d3fceb13184116f219f_icon-rbac.png) Role-Based Access Control Powerful and flexible permissions for your users ](https://workos.com/rbac)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/68c8802359b1c7df06378d44_icon-mcp-auth.png) MCP Auth Secure auth for MCP servers ](https://workos.com/mcp)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/63e1062a21fa47cd37a717f5_icon-admin-portal.png) Admin Portal Self-serve onboarding for corporate IT admins ](https://workos.com/admin-portal)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/67daf11719d8c412f176a3d4_icon-vault.png) Vault EKM for encrypting and optionally storing objects ](https://workos.com/vault)
Developers
[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com)
Resources
[Blog](https://workos.com/blog)[Guides](https://workos.com/guides)[Podcast](https://workos.com/podcast)[Customers](https://workos.com/customers)[Company](https://workos.com/about)[Careers](https://workos.com/careers)[Security](https://workos.com/security)[Support Plans](https://workos.com/support-plans)[Pricing](https://workos.com/pricing)
[Pricing](https://workos.com/pricing)
[Sign in](https://workos.com/signin)[Dashboard](https://dashboard.workos.com)
Copy logo as SVG
Copy brandmark as SVG
[Download brand kit](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/6908e076c85d9ad71e6c6b6b_WorkOS%20Logos.zip)
Products
[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/656545520bd5f04e20a3a6a7_um.png) User Management Complete auth & user management platform ](https://workos.com/user-management)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/63e1062ae62bc2260203e96f_icon-sso.png) Enterprise SSO Unified SSO integration for any identity provider ](https://workos.com/single-sign-on)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/673b4ed27842047837086d7a_icon-radar-nav.png) Radar Real-time protection against bots, fraud, and abuse  
](https://workos.com/radar)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/65654341bfdb733f6715f944_authkit.png) AuthKit Customizable UI for all authentication types ](https://authkit.com/?__hstc=26380002.305250fa29063ebaf80dc5715e4f787a.1773262425128.1773262425128.1773262425134.2&__hssc=26380002.39.1773262425134&__hsfp=7b352b7b5abd10220a336b7ddd180c88)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/63e10629cdacaa53e05c2a95_icon-directory-sync.png) Directory Sync User lifecycle management from corporate directories ](https://workos.com/directory-sync)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/68752d3fceb13184116f219f_icon-rbac.png) Role-Based Access Control Powerful and flexible permissions for your users ](https://workos.com/rbac)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/68c8802359b1c7df06378d44_icon-mcp-auth.png) MCP Auth Secure auth for MCP servers ](https://workos.com/mcp)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/63e1062a21fa47cd37a717f5_icon-admin-portal.png) Admin Portal Self-serve onboarding for corporate IT admins ](https://workos.com/admin-portal)[![](https://cdn.prod.website-files.com/621f54116cab10f6e9215d8b/67daf11719d8c412f176a3d4_icon-vault.png) Vault EKM for encrypting and optionally storing objects ](https://workos.com/vault)
Developers
[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com)
Resources
[Blog](https://workos.com/blog)[Guides](https://workos.com/guides)[Podcast](https://workos.com/podcast)[Customers](https://workos.com/customers)[Company](https://workos.com/about)[Careers](https://workos.com/careers)[Security](https://workos.com/security)[Support Plans](https://workos.com/support-plans)[Pricing](https://workos.com/pricing)
[Sign in](https://workos.com/signin)[Sign up](https://workos.com/signup)
In this article
February 12, 2025
February 12, 2025
# How to build RBAC with WorkOS and Node
Step-by-step tutorial that walks you through the necessary steps to add role-based access control (RBAC) to your app using WorkOS and Node.
![](https://cdn.prod.website-files.com/621f84dc15b5ed16dc85a18a/671f94f562311089fcaad4fb_66e854bdb169b1ca742715c4_Maria.webp)
Maria Paktiti
![](https://cdn.prod.website-files.com/621f84dc15b5ed16dc85a18a/671f94f562311089fcaad4fb_66e854bdb169b1ca742715c4_Maria.webp)
![](https://workos.com/blog/rbac-with-workos-and-node)
![](https://workos.com/blog/rbac-with-workos-and-node)
![](https://workos.com/blog/rbac-with-workos-and-node)
![](https://workos.com/blog/rbac-with-workos-and-node)
February 12, 2025
[Role-based access control (RBAC)](https://workos.com/blog/what-is-rbac-how-it-works-and-when-to-use-it) ensures that users only have access to the resources they need to perform their job functions. This improves security, reduces the risk of unauthorized access, and helps organizations adhere to compliance standards.
In this article, we will explore how to implement RBAC with WorkOS and integrate it into your Node.js application. You can still follow along if you use a different technology; we have included links to the [API](https://workos.com/docs/reference/user-management/organization-membership), which has code samples for other languages.
If you are more of a visual learner, you can follow this video for RBAC with [AuthKit](https://www.authkit.com/?__hstc=26380002.305250fa29063ebaf80dc5715e4f787a.1773262425128.1773262425128.1773262425134.2&__hssc=26380002.39.1773262425134&__hsfp=7b352b7b5abd10220a336b7ddd180c88)—a fully customizable login box powered by Radix— and Next.js.
## Prerequisites
To follow this tutorial, you will need the following:
  * A [WorkOS](https://workos.com/signup) account.
  * A [Node.js](https://nodejs.org/) app (Node 16 or higher).

The tutorial assumes that you have logged in users, so if you haven’t implemented user authentication yet, do that first. You can use one of these guides to get started:
  * [SAML SSO with WorkOS, Okta, and Node](https://workos.com/blog/saml-sso-with-workos-okta-and-node)[‍](https://workos.com/blog/saml-sso-with-workos-entra-id-and-node)
  * [SAML SSO with WorkOS, Entra ID, and Node](https://workos.com/blog/saml-sso-with-workos-entra-id-and-node)[‍](https://workos.com/docs/user-management/vanilla/nodejs)
  * [Login with AuthKit](https://workos.com/docs/user-management/vanilla/nodejs)[‍](https://workos.com/docs/user-management/sso)
  * [Login without AuthKit](https://workos.com/docs/user-management/sso)[‍](https://workos.com/docs/user-management/social-login)
  * [Social login](https://workos.com/docs/user-management/social-login)

## Step 1: Install the SDK
Install the [WorkOS Node SDK](https://workos.com/docs/sdks/node) to your app.
Via npm:
```
npm install @workos-inc/node
```

Via yarn:
```
yarn add @workos-inc/node
```

Via pnpm:
```
pnpm add @workos-inc/node
```

## Step 2: Set secrets
To make calls to WorkOS, you must authenticate using the WorkOS API key and client ID. Copy these values from the [WorkOS dashboard](https://dashboard.workos.com/).
![](https://cdn.prod.website-files.com/621f84dc15b5ed16dc85a18a/67ac8191a5d7892ac1743dfb_rbac.webp)
Store the values as managed secrets and pass them to the SDK either as environment variables or directly in your app’s configuration.
Environment variables example:
```
WORKOS_API_KEY='sk_example_123456789'
WORKOS_CLIENT_ID='client_123456789'
```

For more info on how to handle secrets safely see [Best practices for secrets management](https://workos.com/blog/best-practices-for-secrets-management).
## Step 3: Configure the roles
Configuring RBAC has three steps:
  1. **Define the roles** : Each role represents a job function or level of authority within the organization. For example, you might have roles like "Admin," "Manager," "Employee," or "Guest."
  2. **Assign permissions** : Permissions are specific actions that a user can perform on a system, such as "read," "write," or "delete.” Each role is assigned a set of permissions.
  3. **Assign roles to users** : Roles are assigned to users based on their job responsibilities and security requirements.

We will do this configuration using the [WorkOS dashboard](https://dashboard.workos.com/).
We will use a simple example of three roles and three permissions:
  * Admin can view, write, and delete reports.
  * Manager can view and write reports.
  * Member can view reports.

### Create the permissions
To create both roles and permissions, go to [WorkOS dashboard](https://dashboard.workos.com/)> Roles & Permissions. 
Click “Create Permission” and add all the permissions you need. To follow along the example of this tutorial, add three permissions: `reports:read`, `reports:write`, `reports:delete`.
![](https://cdn.prod.website-files.com/621f84dc15b5ed16dc85a18a/67ac81a94d14316ef69930c9_rbac%20\(1\).webp)
Note that any roles and permissions created here will apply environment-wide, to all [organizations](https://workos.com/blog/model-your-b2b-saas-with-organizations#what-is-an-organization) you have. If you want to create roles and permissions specific to an organization, see [Organization Roles](https://workos.com/docs/user-management/roles-and-permissions/organization-roles).
### Create the roles
In the same page, click “Create Role” and add the roles you need. For each role you add, select the permissions that you want to assign.
![](https://cdn.prod.website-files.com/621f84dc15b5ed16dc85a18a/67ac81bc42123267ba1516fd_rbac%20\(2\).webp)
Each environment is seeded with a default `member` role, which is automatically assigned to every newly added user. This default role cannot be deleted, but any role can be set as the default. Go ahead and change that now if you wish by clicking the ellipsis and then “Set as default”.
### Assign roles to users
For the purpose of this tutorial, we will manually add some users and assign them these roles. First we have to create the users, then add them to an organization, and finally assign roles to them:
  1. Go to [WorkOS dashboard](https://dashboard.workos.com/) > Users and create at least one new user.
  2. Go to [WorkOS dashboard](https://dashboard.workos.com/) > Organizations, select or create an org, go to the Users tab, and add the users you created.
  3. You will see that all users are assigned the default role. For the users that you want to change that, click on the ellipsis button, select “Edit role”, and select the right role for them.

![](https://cdn.prod.website-files.com/621f84dc15b5ed16dc85a18a/67ac81d6af3230c7b3fe7061_rbac%20\(3\).webp)
In a real world scenario you wouldn’t manually create users but most probably be syncing them into your app using SSO or SCIM. If that’s the case, you can map the roles that each identity provider sends to roles in your app so it’s done automatically for you. For more on this see, [How to map role data from identity providers to roles in your app](https://workos.com/blog/group-to-role-mapping).
## Step 4: Add the code
We are ready to start adding code. We will implement the following functionality:
  * Get a user’s roles.
  * Update a user’s roles.

### Get a user’s roles
When a user signs into your app, a user session is initiated. The authentication response includes the access token, a [JSON Web Token (JWT)](https://workos.com/blog/json-web-tokens), with the `role` claim indicating the organization membership’s role for that session.
‍[Validate and decode the JWT](https://workos.com/blog/jwt-validation) to retrieve the user’s roles and permissions:
```
{
  "iss": "https://api.workos.com",
  "sub": "user_01HBEQKA6K4QJAS93VPE39W1JT",
  "act": {
    "sub": "admin@foocorp.com"
  },
  "org_id": "org_01HRDMC6CM357W30QMHMQ96Q0S",
  "role": "manager",
  "permissions": ["reports:read", "reports:write"],
  "sid": "session_01HQSXZGF8FHF7A9ZZFCW4387R",
  "jti": "01HQSXZXPPFPKMDD32RKTFY6PV",
  "exp": 1709193857,
  "iat": 1709193557
}
```

From this JWT we can see that the user with ID `user_01HBEQKA6K4QJAS93VPE39W1JT`, member of the org with ID `org_01HRDMC6CM357W30QMHMQ96Q0S`, has the role of `manager`, with the assigned permissions `reports:read` and `reports:write`. You can use this information to configure the actions that this user can take in your app. For example, your app’s routes might look like this:
```
app.get("/report/:id", hasPermission("reports:read"), (req, res) => {
  res.send("Got Permission");
});

app.put("/report/:id", hasPermission("reports:write"), (req, res) => {
  res.send("Got Permission");
});

app.delete("/report/:id", hasPermission("reports:delete"), (req, res) => {
  res.send("Got Permission");
});
```

The `hasPermission` is a middleware responsible for checking if a user has the input permission.
Note that in RBAC the best practice is to run your authorization checks against permissions, not roles. For example, if you want to decide whether a user should be able to view a report you should check if they have the permission `reports:read` (a permission that might be available to users with the roles of `member`, `manager`, or `admin`).
If you don’t have a JWT, and you want to get a user’s roles you need the user’s organization membership ID. When a user is added to the org an org membership is created. Each membership has a unique ID and you need to know it in order to get a user’s roles for this org:
```
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS('sk_example_123456789');

const organizationMembership =
  await workos.userManagement.getOrganizationMembership(
    'om_01E4ZCR3C56J083X43JQXF3JK5',
  );
```

The results looks like this:
```
{
  "object": "organization_membership",
  "id": "om_01E4ZCR3C56J083X43JQXF3JK5",
  "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",
  "organization_id": "org_01E4ZCR3C56J083X43JQXF3JK5",
  "role": {
    "slug": "member"
  },
  "status": "active",
  "created_at": "2021-06-25T19:07:33.155Z",
  "updated_at": "2021-06-25T19:07:33.155Z"
}
```

You can see that this user, under this org, has the role `member`.
If you don’t have the organization membership ID, you can use the [listOrganizationMemberships()](https://workos.com/docs/reference/user-management/organization-membership/list) and provide as input the user ID and (optionally) the organization ID:
```
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS('WORKOS_API_KEY');

const organizationMemberships =
  await workos.userManagement.listOrganizationMemberships({
    userId: 'user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E',
    organizationId: 'org_01E4ZCR3C56J083X43JQXF3JK5',
  });
```

The results will include the organization membership ID (`id`):
```
{
  "data": [
    {
      "object": "organization_membership",
      "id": "om_01E4ZCR3C56J083X43JQXF3JK5",
      "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",
      "organization_id": "org_01E4ZCR3C56J083X43JQXF3JK5",
      "role": {
        "slug": "member"
      },
      "status": "active",
      "created_at": "2021-06-25T19:07:33.155Z",
      "updated_at": "2021-06-25T19:07:33.155Z"
    }
  ],
  "list_metadata": {
    "before": "om_01E4ZCR3C56J083X43JQXF3JK5",
    "after": "om_01EJBGJT2PC6638TN5Y380M40Z"
  }
}
```

### Update a user’s roles
To update a user’s roles you need again the user’s organization membership ID.
Let’s say that we want to change the role of the user we retrieved earlier, from `manager` to `admin`:
```
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS('sk_example_123456789');

const organizationMembership =
  await workos.userManagement.updateOrganizationMembership(
    'om_01E4ZCR3C56J083X43JQXF3JK5',
    {
      roleSlug: 'admin',
    },
  );
```

The response contains the updated roles:
```
{
  "object": "organization_membership",
  "id": "om_01E4ZCR3C56J083X43JQXF3JK5",
  "user_id": "user_01E4ZCR3C5A4QZ2Z2JQXGKZJ9E",
  "organization_id": "org_01E4ZCR3C56J083X43JQXF3JK5",
  "role": {
    "slug": "admin"
  },
  "status": "active",
  "created_at": "2021-06-25T19:07:33.155Z",
  "updated_at": "2021-06-27T19:07:33.278Z"
}
```

## Next steps
You have now added RBAC in your app. By defining clear roles, assigning users to those roles, and integrating RBAC logic into your application, you can ensure that only authorized users have access to sensitive data and actions.
What makes WorkOS RBAC special is that it can be used with [SCIM](https://workos.com/blog/the-developers-guide-to-directory-sync-scim) to support an identity provider-based authorization system. Most authorization providers require your customer’s admin to generate the data source for roles, resources, and permissions inside your app. With IdP-based authorization systems, the admin can use roles, resources, and permissions data that already exist in their IdP. This is critical for enterprises that want to manage their users’ roles and permissions from a single source of truth instead of managing hundreds of different SaaS tools and their unique permissions schemes.
Using SCIM to automatically sync user roles in your app generally offers a more streamlined, secure, and scalable solution compared to manual role management. WorkOS ensures end-to-end data integrity from the moment users are first provisioned, to role assignment, and all the way to access checks that occur in your application.
Here are some resources you might find useful:
  * [Directory Sync for automatic user and group provisioning via SCIM](https://workos.com/docs/directory-sync)
  * [How to map role data from identity providers to roles in your app](https://workos.com/blog/group-to-role-mapping)
  * [Roles and permissions with WorkOS](https://workos.com/docs/user-management/roles-and-permissions)

[ We’re hiring Our global team is growing and we’re hiring all types of roles. View open roles ](https://workos.com/careers)[ About us WorkOS builds developer tools for quickly adding enterprise features to applications. Learn more ](https://workos.com/about)
[](https://workos.com/blog/rbac-with-workos-and-node)
Products
[User Management](https://workos.com/user-management)[Enterprise SSO](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Audit Logs](https://workos.com/audit-logs)[AuthKit](https://authkit.com/?__hstc=26380002.305250fa29063ebaf80dc5715e4f787a.1773262425128.1773262425128.1773262425134.2&__hssc=26380002.39.1773262425134&__hsfp=7b352b7b5abd10220a336b7ddd180c88)[Multi-Factor Authentication](https://workos.com/multi-factor-authentication)[Role-Based Access Control](https://workos.com/rbac)[Radar](https://workos.com/radar)[Vault](https://workos.com/vault)
Developers
[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources
[Blog](https://workos.com/blog)[Guides](https://workos.com/guides)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Startups](https://workos.com/startups)[Support Plans](https://workos.com/support-plans)[Enterprise SLA](https://workos.com/legal/sla)
Company
[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Security](https://workos.com/security)[Legal](https://workos.com/legal/policies)[Trust Center](https://trust.workos.com/)[Contact](https://workos.com/contact)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)[](https://www.youtube.com/@WorkOS/videos)
This site uses cookies to improve your experience. Please accept the use of cookies on this site. You can review our cookie policy [here](https://workos.com/cookies) and our privacy policy [here](https://workos.com/privacy). If you choose to refuse, functionality of this site will be limited. 
Accept  Opt-out
