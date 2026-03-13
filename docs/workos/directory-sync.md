---
source_url: "https://workos.com/docs/directory-sync"
title: "Directory Sync"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
Directory Sync
Directory Sync
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Fdirectory-sync)
Getting Started[FundamentalsFundamentals](https://workos.com/docs/directory-sync)[Quick StartQuick Start](https://workos.com/docs/directory-sync/quick-start)[Example AppsExample Apps](https://workos.com/docs/directory-sync/example-apps)Going Live[Handle Inactive UsersHandle Inactive Users](https://workos.com/docs/directory-sync/handle-inactive-users)[Understanding EventsUnderstanding Events](https://workos.com/docs/directory-sync/understanding-events)[User AttributesUser Attributes](https://workos.com/docs/directory-sync/attributes)[On-prem DeploymentOn-prem Deployment](https://workos.com/docs/on-prem-deployment)Mapping Roles[IdP Role AssignmentIdP Role Assignment](https://workos.com/docs/directory-sync/identity-provider-role-assignment)
[](https://workos.com/docs/reference/directory-sync)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
![](https://images.workoscdn.com/docs/icons/directory-sync-20220915.png)
# Directory Sync
Build frictionless onboarding for organizations with real‑time user provisioning and deprovisioning.
## On this page
  * [Introduction](https://workos.com/docs/directory-sync#introduction)
  * [Definitions](https://workos.com/docs/directory-sync#definitions)
  * [What is Directory Sync?](https://workos.com/docs/directory-sync#what-is-directory-sync)
  * [Why use Directory Sync?](https://workos.com/docs/directory-sync#why-use-directory-sync)
  * [What your customer experiences](https://workos.com/docs/directory-sync#what-your-customer-experiences)
    * [](https://workos.com/docs/directory-sync#n-your-app-does-not-use-directory-sync)
    * [](https://workos.com/docs/directory-sync#y-your-app-uses-directory-sync)
  * [API overview](https://workos.com/docs/directory-sync#api-overview)
    * [Directory](https://workos.com/docs/directory-sync#directory)
    * [Directory group](https://workos.com/docs/directory-sync#directory-group)
    * [Directory user](https://workos.com/docs/directory-sync#directory-user)

## Introduction
[](https://workos.com/docs/directory-sync#introduction)
Organizations use company directories and HRIS systems to manage users and enforce their access to organization resources. Directories enable IT admins to activate and deactivate accounts, create groups that inform access rules, accelerate adoption of new tools, and more.
## Definitions
[](https://workos.com/docs/directory-sync#definitions) **ULM**
    User Lifecycle Management (or ULM) is the process of managing a user’s access to an app. This occurs from app onboarding until they are removed from an app. ULM is also commonly referred to as identity provisioning. **SCIM**
    System for Cross-domain Identity Management (or SCIM) is an open standard for managing automated user and group provisioning. It’s a standard that many directory providers interface with. **HRIS**
    A Human Resources Information System (or HRIS) is software designed to maintain, manage, and process detailed employee information and human resources-related policies. Examples include: Workday, HiBob, BambooHR, etc. **User Provisioning**
    Provisioning is the process of creating a user and setting attributes for them – inside of an app. **User Deprovisioning**
    Deprovisioning is the process of removing a user from an app.
## What is Directory Sync?
[](https://workos.com/docs/directory-sync#what-is-directory-sync)
Directory Sync is a set of developer-friendly APIs and IT admin tools that allows you to implement enterprise-grade User Lifecycle Management (ULM) into your existing app.
ULM allows IT admins to centrally provision and deprovision users from their directory provider. A directory provider is the source of truth for your enterprise customer’s user and group lists. Directory Sync sends automatic updates to your app for changes to directories, groups, users, or access rules.
Common directory providers include: [Microsoft Active Directory](https://workos.com/docs/integrations/microsoft-ad-fs-saml), [Okta](https://workos.com/docs/integrations/okta-scim), [Workday](https://workos.com/docs/integrations/workday), and [Google Workspace](https://workos.com/docs/integrations/google-directory-sync). See the full list of supported directory providers on the [integrations](https://workos.com/docs/integrations) page.
## Why use Directory Sync?
[](https://workos.com/docs/directory-sync#why-use-directory-sync)
ULM increases the security of your app and makes it easier for your customers to use your app. ULM is most often implemented using [SCIM](https://workos.com/docs/glossary/scim). SCIM requests are sent between directory providers and your app to inform you of changes to a user’s identity. Changes can include:
  * Provisioning an identity for a user (account creation)
  * When a user’s attribute has changed (account update)
  * Deprovisioning a user from your app (account deletion)

Each directory provider implements SCIM differently. Implementing SCIM is often a challenging process and can introduce security vulnerabilities into your app. Directory Sync hides this complexity, so you can focus on building core product features in your app.
## What your customer experiences
[](https://workos.com/docs/directory-sync#what-your-customer-experiences)
Let’s take a look at two different user provisioning scenarios.
[](https://workos.com/docs/directory-sync#n-your-app-does-not-use-directory-sync)
Without ULM, your customers have to manually add, update, and remove users from your app.
Imagine a scenario where your customer has purchased your software and onboards a new employee to your app. Your customer would have to do the following:
  1. The IT admin provisions the employee in their directory provider (_if they use one_) and manually in your app.
  2. All employee information has to be set manually in both the directory provider and your app.
  3. The IT admin has to manually provision a login method for the employee; through either SSO (_if they use an identity provider_) or a self-registration page.
  4. The IT admin sends the invite link to their employee. Often initiating a back and forth via either email, messaging app, or IT helpdesk ticket.
  5. The employee has to proceed with the registration method and can then use your app.

All future changes to this employee’s data and access are manually entered by the IT admin. This is error prone and can lead to security vulnerabilities where users get unauthorized access to resources.
As your customers adopt more cloud software, these manual processes do not scale well. Manual input error can lead to the source of truth (directory) drifting from your app’s state. As a result, ULM has become a table stakes product requirement for enterprises.
[](https://workos.com/docs/directory-sync#y-your-app-uses-directory-sync)
If your app supports ULM via Directory Sync, the IT admin can provision this employee from one place:
  1. Add the employee to their directory provider.
  2. Assign the employee to your app with the appropriate role once; via the directory provider admin page.
  3. **Optional.** Have the employee go through a password setup if they are not using an identity provider (SSO).

Directory Sync makes this integration easy by providing APIs your app interfaces with. All updates for this directory will automatically be sent to your app from WorkOS.
## API overview
[](https://workos.com/docs/directory-sync#api-overview)
[Directory](https://workos.com/docs/reference/directory-sync/directory), [directory group](https://workos.com/docs/reference/directory-sync/directory-group), and [directory user](https://workos.com/docs/reference/directory-sync/directory-user) are the main components your app interfaces with.
### Directory
[](https://workos.com/docs/directory-sync#directory)
Directory providers
_Provides the directory data_
WorkOS directory
interface Directory {
object: "directory";
id:string;
domain:string;
external_key:string;
name:string;
organization_id?:string;
state:string;
type:string;
created_at:string;
updated_at:string;
}
_Normalizes directory data_
Your app
_Interfaces with WorkOS_
A diagram showing that directory providers relay the directory data to WorkOS, then WorkOS normalizes the data, and then your app interfaces with WorkOS, receiving and pushing updates
A directory is the source of truth for your customer’s user and group lists.
WorkOS supports dozens of integrations including SCIM. Directory updates can be delivered to you via webhooks or retrieved using the [Events API](https://workos.com/docs/reference/events). Your app stores a mapping between your customer and their directory. This allows you to maintain your app in sync with the directory provider used by your customer.
You can enable self-service Directory Sync setup for your customers using the [Admin Portal](https://workos.com/docs/admin-portal).
### Directory group
[](https://workos.com/docs/directory-sync#directory-group)
Directory provider groups
Accounting
Sales
Engineering
_Provides the user group data_
WorkOS directory group
interface Group {
id:string;
idp_id:string;
directory_id:string;
organization_id?:string;
name:string;
created_at:string;
updated_at:string;
}
_Normalizes user group data_
Your app
_Interfaces with WorkOS_
A diagram showing that directory provider groups relay the directory group data to WorkOS, then WorkOS normalizes the data, and then your app interfaces with WorkOS, receiving and pushing updates
A directory group is a collection of users within an organization who have been provisioned with access to your app.
Directory groups are mapped from directory provider groups. Directory groups are most often used to categorize a collection of users based on shared traits. i.e. Grouping software developers at a company under an “Engineering” group.
### Directory user
[](https://workos.com/docs/directory-sync#directory-user)
Directory provider users
_Provides the user data_
WorkOS directory user
interface User {
id:string;
idp_id:string;
directory_id:string;
first_name:string;
last_name:string;
email:string;
groups:Group[];
state:string;
}
_Normalizes user data_
Your app
_Interfaces with WorkOS_
A diagram showing that directory provider users relay the user data to WorkOS, then WorkOS normalizes the data, and then your app interfaces with WorkOS, receiving and pushing updates
A directory user is a person or entity within an organization who has been provisioned with access to your app.
Users can belong to multiple directory groups. Users have [attributes](https://workos.com/docs/directory-sync/attributes) associated with them. These attributes can be configured for your app’s needs.
[ Quick StartSet up a directory, install the SDK, and integrate Directory Sync Up next ](https://workos.com/docs/directory-sync/quick-start)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
