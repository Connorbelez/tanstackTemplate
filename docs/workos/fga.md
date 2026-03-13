---
source_url: "https://workos.com/docs/fga"
title: "Fine-Grained Authorization (FGA)"
crawl_depth: 1
---

[WorkOS Docs Homepage](https://workos.com/docs)
FGA
FGA
Press ⌘K to search.
⌘K
[](https://workos.com/docs/reference)[](https://dashboard.workos.com)[Sign In](https://dashboard.workos.com/signin?redirect=https%3A%2F%2Fworkos.com%2Fdocs%2Ffga)
[OverviewOverview](https://workos.com/docs/fga)[Quick StartQuick Start](https://workos.com/docs/fga/quick-start)Core Concepts[Resource TypesResource Types](https://workos.com/docs/fga/resource-types)[ResourcesResources](https://workos.com/docs/fga/resources)[Roles and PermissionsRoles and Permissions](https://workos.com/docs/fga/roles-and-permissions)[AssignmentsAssignments](https://workos.com/docs/fga/assignments)[High-Cardinality EntitiesHigh-Cardinality Entities](https://workos.com/docs/fga/high-cardinality-entities)Access Control[Access ChecksAccess Checks](https://workos.com/docs/fga/access-checks)[Resource DiscoveryResource Discovery](https://workos.com/docs/fga/resource-discovery)Integrations[AuthKit IntegrationAuthKit Integration](https://workos.com/docs/fga/authkit-integration)[Standalone IntegrationStandalone Integration](https://workos.com/docs/fga/standalone-integration)[IdP Role AssignmentIdP Role Assignment](https://workos.com/docs/fga/idp-role-assignment)Migration Guides[Migrate from OpenFGAMigrate from OpenFGA](https://workos.com/docs/fga/migration-openfga)[Migrate from SpiceDBMigrate from SpiceDB](https://workos.com/docs/fga/migration-spicedb)[Migrate from Oso CloudMigrate from Oso Cloud](https://workos.com/docs/fga/migration-oso)
[](https://workos.com/docs/reference/fga)[](https://workos.com/docs/events)[](https://workos.com/docs/integrations)[](https://workos.com/docs/migrate)[](https://workos.com/docs/sdks)
![](https://images.workoscdn.com/images/b2dfe55a-71c0-4cde-822b-008661184d83.png)
# Fine-Grained Authorization (FGA)
Scalable fine-grained authorization built for B2B SaaS.
## On this page
  * [Introduction](https://workos.com/docs/fga#introduction)
  * [Core concepts](https://workos.com/docs/fga#core-concepts)
  * [Building blocks](https://workos.com/docs/fga#building-blocks)
    * [Resource types](https://workos.com/docs/fga#resource-types)
    * [Resources](https://workos.com/docs/fga#resources)
    * [Roles and permissions](https://workos.com/docs/fga#roles-and-permissions)
    * [Assignments](https://workos.com/docs/fga#assignments)
    * [Access checks](https://workos.com/docs/fga#access-checks)
  * [Hierarchical permission inheritance](https://workos.com/docs/fga#hierarchical-permission-inheritance)
  * [Adoption path](https://workos.com/docs/fga#adoption-path)
  * [AuthKit integration](https://workos.com/docs/fga#authkit-integration)
  * [Enterprise identity mapping](https://workos.com/docs/fga#enterprise-identity-mapping)
  * [Performance and scalability](https://workos.com/docs/fga#performance-and-scalability)
  * [Coming soon](https://workos.com/docs/fga#coming-soon)

## Introduction
[](https://workos.com/docs/fga#introduction)
Fine-Grained Authorization (FGA) extends the existing WorkOS RBAC system to handle the complex, fast-changing authorization needs of modern B2B SaaS products.
Most products start with simple, tenant-wide roles like Admin and Member. As adoption grows, the authorization model must account for new and changing app resources and requirements, like workspaces, projects, apps, pipelines, nested tenants, custom roles, group-based collaboration, and enterprise exceptions. What used to evolve over a decade can now change in 12 – 18 months. Teams patch RBAC with special cases, multiply role variants, and eventually face full rewrites.
FGA is designed as the next step in that evolution. It keeps the mental model of RBAC – roles, permissions, assignments – while adding hierarchical, resource-scoped access control. It integrates natively with WorkOS products you’re already using: RBAC, SSO, Directory Sync, AuthKit, and IdP role assignment. It can be adopted incrementally, with no data migration or confusing schema DSL.
The goal is a single authorization foundation that adapts as your product and customer requirements change, without forcing conceptual rewrites.
## Core concepts
[](https://workos.com/docs/fga#core-concepts)
FGA formalizes three building blocks:
**Subjects** are the users, groups, devices, or agents that can be granted access. Today that’s primarily organization memberships (users), with support for other subject types coming soon.
**Resources** are the business entities in your product – organizations, workspaces, projects, apps – arranged in a hierarchy. Permissions flow down this hierarchy automatically.
**Privileges** are the roles and permissions that define what subjects can do. Roles are scoped to resource types and can include permissions for child resource types, enabling powerful inheritance.
The key shift from traditional tenant-wide RBAC is that resources and their hierarchy are first-class. Roles and permissions are scoped to specific resource types and can be assigned at any level of that hierarchy.
## Building blocks
[](https://workos.com/docs/fga#building-blocks)
### Resource types
[](https://workos.com/docs/fga#resource-types)
[Resource types](https://workos.com/docs/fga/resource-types) define the schema of your authorization model. They describe what kinds of entities exist – workspaces, projects, apps – and how they relate to one another. You configure resource types in the WorkOS Dashboard, creating the blueprint for your application’s entity hierarchy.
### Resources
[](https://workos.com/docs/fga#resources)
[Resources](https://workos.com/docs/fga/resources) are instances of resource types created at runtime. When a user creates a workspace or project in your application, you register a corresponding resource in WorkOS with a type, an ID, and a parent.
### Roles and permissions
[](https://workos.com/docs/fga#roles-and-permissions)
[Roles and permissions](https://workos.com/docs/fga/roles-and-permissions) are scoped to specific resource types. A role describes what someone can do within the scope of a particular resource. Permissions can apply to the same resource type or inherit up to parent resource types.
### Assignments
[](https://workos.com/docs/fga#assignments)
[Assignments](https://workos.com/docs/fga/assignments) bind an organization membership to a role on a specific resource. Support for other subject types like profiles, directory users, agents, and services is coming soon. When a role includes child-type permissions, those permissions propagate down the hierarchy automatically.
### Access checks
[](https://workos.com/docs/fga#access-checks)
[Access checks](https://workos.com/docs/fga/access-checks) answer the question: “Can this user perform this action on this resource?” You can also ask “Which resources can this user access?” or “Who has access to this resource?” FGA considers all the ways a user might have access – roles assigned directly, roles inherited from parent resources, and organization-level roles.
## Hierarchical permission inheritance
[](https://workos.com/docs/fga#hierarchical-permission-inheritance)
The defining feature of FGA is that permissions flow down the resource hierarchy automatically. A workspace admin can access all projects and apps within that workspace without needing separate assignments at each level.
![Example resource hierarchy with roles](https://images.workoscdn.com/images/74c1fad7-abe9-4c21-a244-8c2563f1313c.png?auto=format&fit=clip&q=50)
In this example, users have roles at different levels of the hierarchy. An organization member can view everything beneath the organization. A project editor can edit a specific project and its apps. An app editor has access only to a single app. The hierarchy does the work of propagating permissions – you assign a role once, and access flows down to all children.
This model reduces the number of role assignments you need to manage while giving you precise control when you need it. For a detailed walkthrough of how this works, see [Roles and Permissions](https://workos.com/docs/fga/roles-and-permissions).
## Adoption path
[](https://workos.com/docs/fga#adoption-path)
FGA works alongside the existing RBAC product. No migrations are required – existing roles and organization memberships continue working, and you can adopt FGA incrementally.
A typical rollout looks like:
  1. Keep using current RBAC for organization-level access
  2. Define resource types in the Dashboard to mirror your product structure
  3. Begin registering resource instances as entities are created
  4. Introduce resource-scoped roles like `workspace-admin` or `project-editor`
  5. Add Authorization API checks where you need resource-level control
  6. Assign resource roles via API (IdP group mapping for resources coming soon)

You don’t need to convert everything at once. Start with one feature, prove the model works, then expand.
## AuthKit integration
[](https://workos.com/docs/fga#authkit-integration)
FGA integrates with [AuthKit](https://workos.com/docs/fga/authkit-integration) to provide role-aware sessions. Organization-level roles and their permissions are embedded directly in access tokens, enabling instant checks for org-wide features without API calls. For resource-scoped permissions, the Authorization API evaluates against the full hierarchy.
This two-layer approach – JWT for org-wide, API for resources – gives you fast checks where possible and precise control where needed.
## Enterprise identity mapping
[](https://workos.com/docs/fga#enterprise-identity-mapping)
For enterprise customers, [IdP role assignment](https://workos.com/docs/fga/idp-role-assignment) allows organizations to map identity provider groups to organization-level roles. When someone joins the “Engineering” group in Okta or Azure AD, they automatically get the corresponding role.
Resource-scoped role assignments remain managed via API, giving you a clean separation: IT admins control baseline organization access through their identity provider, while your application manages who has access to which specific resources.
## Performance and scalability
[](https://workos.com/docs/fga#performance-and-scalability)
FGA is designed for real-time authorization:
  * **Sub-50ms p95** access checks
  * **Strong consistency** – role changes take effect immediately
  * **High availability** for production workloads
  * **Warmed caches** to minimize cold starts
  * **Edge caches** for low-latency global access (coming soon)

## Coming soon
[](https://workos.com/docs/fga#coming-soon)
We’re continuing to expand FGA with new capabilities:
**User groups and teams** – Assign a group of users to a resource or group of resources. Instead of individual assignments, grant access to an entire team at once.
**IdP role assignment for sub-resources** – Map identity provider groups directly to resource-scoped roles, not just organization-level roles. Your customers’ IT admins will be able to control workspace and project access through their IdP.
**Permission assignment** – Assign or exclude specific permissions for a user, enabling patterns like “grant access to all resources except this one” without creating custom roles.
**Further performance enhancements** – Continued optimization of access check endpoints for even lower latency at scale.
[ Quick StartBuild a complete authorization model from resource types to access checks in minutes Up next ](https://workos.com/docs/fga/quick-start)
[](https://workos.com)
© WorkOS, Inc.
Features[AuthKit](https://workos.com/user-management)[Single Sign-On](https://workos.com/single-sign-on)[Directory Sync](https://workos.com/directory-sync)[Admin Portal](https://workos.com/admin-portal)[Fine-Grained Authorization](https://workos.com/fine-grained-authorization)
Developers[Documentation](https://workos.com/docs)[Changelog](https://workos.com/changelog)[API Status](https://status.workos.com/)
Resources[Blog](https://workos.com/blog)[Podcast](https://workos.com/podcast)[Pricing](https://workos.com/pricing)[Security](https://workos.com/security)Support
Company[About](https://workos.com/about)[Customers](https://workos.com/customers)[Careers](https://workos.com/careers)[Legal](https://workos.com/legal/policies)[Privacy](https://workos.com/legal/privacy)
© WorkOS, Inc.
[](https://github.com/workos)[](https://twitter.com/workos)[](https://www.linkedin.com/company/workos-inc)
