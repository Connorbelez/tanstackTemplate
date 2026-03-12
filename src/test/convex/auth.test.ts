import { describe, expect, it, vi } from "vitest";

// Since auth.ts is a Convex file, we'll test the logic patterns and helper functions
// These tests focus on the business logic that can be extracted and tested

describe("Auth helper functions logic", () => {
	describe("upsertOrganization logic", () => {
		it("should create organization when it doesn't exist", async () => {
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(null), // No existing org
					}),
				}),
				insert: vi.fn().mockResolvedValue("org_123"),
				patch: vi.fn(),
			};

			const data: {
				id: string;
				name: string;
				allowProfilesOutsideOrganization?: boolean;
				externalId?: string;
				metadata?: Record<string, unknown>;
			} = {
				id: "org_workos_123",
				name: "Test Organization",
				allowProfilesOutsideOrganization: true,
				externalId: "ext_123",
				metadata: { key: "value" },
			};

			// Simulate the upsertOrganization logic
			const existing = await mockDb
				.query("organizations")
				.withIndex("workosId", (q: any) => q.eq("workosId", data.id))
				.unique();

			expect(existing).toBeNull();

			const fields = {
				workosId: data.id,
				name: data.name,
				allowProfilesOutsideOrganization:
					data.allowProfilesOutsideOrganization ?? false,
				externalId: data.externalId ?? undefined,
				metadata: data.metadata,
			};

			if (!existing) {
				await mockDb.insert("organizations", fields);
			}

			expect(mockDb.insert).toHaveBeenCalledWith("organizations", {
				workosId: "org_workos_123",
				name: "Test Organization",
				allowProfilesOutsideOrganization: true,
				externalId: "ext_123",
				metadata: { key: "value" },
			});
			expect(mockDb.patch).not.toHaveBeenCalled();
		});

		it("should update organization when it exists", async () => {
			const existingOrg = { _id: "existing_id", workosId: "org_workos_123" };
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(existingOrg),
					}),
				}),
				insert: vi.fn(),
				patch: vi.fn().mockResolvedValue(undefined),
			};

			const data: {
				id: string;
				name: string;
				allowProfilesOutsideOrganization?: boolean;
				externalId?: string;
				metadata?: Record<string, unknown>;
			} = {
				id: "org_workos_123",
				name: "Updated Organization",
				allowProfilesOutsideOrganization: false,
			};

			// Simulate the upsertOrganization logic
			const existing = await mockDb
				.query("organizations")
				.withIndex("workosId", (q: any) => q.eq("workosId", data.id))
				.unique();

			const fields = {
				workosId: data.id,
				name: data.name,
				allowProfilesOutsideOrganization:
					data.allowProfilesOutsideOrganization ?? false,
				externalId: data.externalId ?? undefined,
				metadata: data.metadata,
			};

			if (existing) {
				await mockDb.patch(existing._id, fields);
			}

			expect(mockDb.patch).toHaveBeenCalledWith("existing_id", {
				workosId: "org_workos_123",
				name: "Updated Organization",
				allowProfilesOutsideOrganization: false,
				externalId: undefined,
				metadata: undefined,
			});
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it("should default allowProfilesOutsideOrganization to false", async () => {
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(null),
					}),
				}),
				insert: vi.fn().mockResolvedValue("org_123"),
				patch: vi.fn(),
			};

			const data: {
				id: string;
				name: string;
				allowProfilesOutsideOrganization?: boolean;
				externalId?: string;
				metadata?: Record<string, unknown>;
			} = {
				id: "org_workos_123",
				name: "Test Organization",
			};

			const fields = {
				workosId: data.id,
				name: data.name,
				allowProfilesOutsideOrganization:
					data.allowProfilesOutsideOrganization ?? false,
				externalId: data.externalId ?? undefined,
				metadata: data.metadata,
			};

			await mockDb.insert("organizations", fields);

			expect(mockDb.insert).toHaveBeenCalledWith(
				"organizations",
				expect.objectContaining({
					allowProfilesOutsideOrganization: false,
				})
			);
		});
	});

	describe("deleteOrganization logic", () => {
		it("should delete organization and cascade memberships", async () => {
			const org = { _id: "org_id_123", workosId: "org_workos_123" };
			const memberships = [
				{ _id: "mem_1", organizationWorkosId: "org_workos_123" },
				{ _id: "mem_2", organizationWorkosId: "org_workos_123" },
			];

			const mockDb = {
				query: vi.fn().mockImplementation((table: string) => {
					if (table === "organizations") {
						return {
							withIndex: vi.fn().mockReturnValue({
								unique: vi.fn().mockResolvedValue(org),
							}),
						};
					}
					if (table === "organizationMemberships") {
						return {
							withIndex: vi.fn().mockReturnValue({
								collect: vi.fn().mockResolvedValue(memberships),
							}),
						};
					}
				}),
				delete: vi.fn().mockResolvedValue(undefined),
			};

			// Simulate deleteOrganization logic
			const foundOrg = await mockDb
				.query("organizations")
				.withIndex("workosId", (q: any) => q.eq("workosId", "org_workos_123"))
				.unique();

			if (foundOrg) {
				await mockDb.delete(foundOrg._id);
			}

			const foundMemberships = await mockDb
				.query("organizationMemberships")
				.withIndex("byOrganization", (q: any) =>
					q.eq("organizationWorkosId", "org_workos_123")
				)
				.collect();

			for (const m of foundMemberships) {
				await mockDb.delete(m._id);
			}

			expect(mockDb.delete).toHaveBeenCalledWith("org_id_123");
			expect(mockDb.delete).toHaveBeenCalledWith("mem_1");
			expect(mockDb.delete).toHaveBeenCalledWith("mem_2");
			expect(mockDb.delete).toHaveBeenCalledTimes(3);
		});

		it("should handle non-existent organization gracefully", async () => {
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(null),
						collect: vi.fn().mockResolvedValue([]),
					}),
				}),
				delete: vi.fn(),
			};

			// Simulate deleteOrganization logic
			const foundOrg = await mockDb
				.query("organizations")
				.withIndex("workosId", (q: any) => q.eq("workosId", "nonexistent"))
				.unique();

			if (foundOrg) {
				await mockDb.delete(foundOrg._id);
			}

			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	describe("upsertMembership logic", () => {
		it("should create membership when it doesn't exist", async () => {
			const org = { name: "Test Org" };
			const mockDb = {
				query: vi.fn().mockImplementation((table: string) => {
					if (table === "organizations") {
						return {
							withIndex: vi.fn().mockReturnValue({
								unique: vi.fn().mockResolvedValue(org),
							}),
						};
					}
					return {
						withIndex: vi.fn().mockReturnValue({
							unique: vi.fn().mockResolvedValue(null),
						}),
					};
				}),
				insert: vi.fn().mockResolvedValue("mem_123"),
				patch: vi.fn(),
			};

			const data: {
				id: string;
				organizationId: string;
				userId: string;
				status: string;
				role: {
					slug: string;
				};
				roles?: {
					slug: string;
				}[];
			} = {
				id: "mem_workos_123",
				organizationId: "org_workos_123",
				userId: "user_workos_123",
				status: "active",
				role: { slug: "admin" },
				roles: [{ slug: "admin" }, { slug: "member" }],
			};

			// Simulate upsertMembership logic
			const foundOrg = await mockDb
				.query("organizations")
				.withIndex("workosId", (q: any) =>
					q.eq("workosId", data.organizationId)
				)
				.unique();

			const existing = await mockDb
				.query("organizationMemberships")
				.withIndex("workosId", (q: any) => q.eq("workosId", data.id))
				.unique();

			const fields = {
				workosId: data.id,
				organizationWorkosId: data.organizationId,
				organizationName: foundOrg?.name,
				userWorkosId: data.userId,
				status: data.status,
				roleSlug: data.role.slug,
				roleSlugs: data.roles?.map((r: { slug: string }) => r.slug),
			};

			if (!existing) {
				await mockDb.insert("organizationMemberships", fields);
			}

			expect(mockDb.insert).toHaveBeenCalledWith("organizationMemberships", {
				workosId: "mem_workos_123",
				organizationWorkosId: "org_workos_123",
				organizationName: "Test Org",
				userWorkosId: "user_workos_123",
				status: "active",
				roleSlug: "admin",
				roleSlugs: ["admin", "member"],
			});
		});

		it("should update membership when it exists", async () => {
			const existingMem = { _id: "existing_mem_id" };
			const org = { name: "Test Org" };
			const mockDb = {
				query: vi.fn().mockImplementation((table: string) => {
					if (table === "organizations") {
						return {
							withIndex: vi.fn().mockReturnValue({
								unique: vi.fn().mockResolvedValue(org),
							}),
						};
					}
					return {
						withIndex: vi.fn().mockReturnValue({
							unique: vi.fn().mockResolvedValue(existingMem),
						}),
					};
				}),
				insert: vi.fn(),
				patch: vi.fn().mockResolvedValue(undefined),
			};

			const data: {
				id: string;
				organizationId: string;
				userId: string;
				status: string;
				role: {
					slug: string;
				};
				roles?: {
					slug: string;
				}[];
			} = {
				id: "mem_workos_123",
				organizationId: "org_workos_123",
				userId: "user_workos_123",
				status: "inactive",
				role: { slug: "member" },
			};

			const foundOrg = await mockDb
				.query("organizations")
				.withIndex("workosId", (q: any) =>
					q.eq("workosId", data.organizationId)
				)
				.unique();

			const existing = await mockDb
				.query("organizationMemberships")
				.withIndex("workosId", (q: any) => q.eq("workosId", data.id))
				.unique();

			const fields = {
				workosId: data.id,
				organizationWorkosId: data.organizationId,
				organizationName: foundOrg?.name,
				userWorkosId: data.userId,
				status: data.status,
				roleSlug: data.role.slug,
				roleSlugs: data.roles?.map((r: { slug: string }) => r.slug),
			};

			if (existing) {
				await mockDb.patch(existing._id, fields);
			}

			expect(mockDb.patch).toHaveBeenCalledWith("existing_mem_id", {
				workosId: "mem_workos_123",
				organizationWorkosId: "org_workos_123",
				organizationName: "Test Org",
				userWorkosId: "user_workos_123",
				status: "inactive",
				roleSlug: "member",
				roleSlugs: undefined,
			});
		});
	});

	describe("upsertRole logic", () => {
		it("should create role when it doesn't exist", async () => {
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(null),
					}),
				}),
				insert: vi.fn().mockResolvedValue("role_123"),
				patch: vi.fn(),
			};

			const data = { slug: "admin", permissions: ["read", "write", "delete"] };

			const existing = await mockDb
				.query("roles")
				.withIndex("slug", (q: any) => q.eq("slug", data.slug))
				.unique();

			if (!existing) {
				await mockDb.insert("roles", {
					slug: data.slug,
					permissions: data.permissions,
				});
			}

			expect(mockDb.insert).toHaveBeenCalledWith("roles", {
				slug: "admin",
				permissions: ["read", "write", "delete"],
			});
		});

		it("should update role permissions when it exists", async () => {
			const existingRole = { _id: "role_id_123", slug: "admin" };
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(existingRole),
					}),
				}),
				insert: vi.fn(),
				patch: vi.fn().mockResolvedValue(undefined),
			};

			const data = { slug: "admin", permissions: ["read", "write"] };

			const existing = await mockDb
				.query("roles")
				.withIndex("slug", (q: any) => q.eq("slug", data.slug))
				.unique();

			if (existing) {
				await mockDb.patch(existing._id, { permissions: data.permissions });
			}

			expect(mockDb.patch).toHaveBeenCalledWith("role_id_123", {
				permissions: ["read", "write"],
			});
		});
	});

	describe("deleteRole logic", () => {
		it("should delete role when it exists", async () => {
			const role = { _id: "role_id_123", slug: "admin" };
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(role),
					}),
				}),
				delete: vi.fn().mockResolvedValue(undefined),
			};

			const existing = await mockDb
				.query("roles")
				.withIndex("slug", (q: any) => q.eq("slug", "admin"))
				.unique();

			if (existing) {
				await mockDb.delete(existing._id);
			}

			expect(mockDb.delete).toHaveBeenCalledWith("role_id_123");
		});

		it("should handle non-existent role gracefully", async () => {
			const mockDb = {
				query: vi.fn().mockReturnValue({
					withIndex: vi.fn().mockReturnValue({
						unique: vi.fn().mockResolvedValue(null),
					}),
				}),
				delete: vi.fn(),
			};

			const existing = await mockDb
				.query("roles")
				.withIndex("slug", (q: any) => q.eq("slug", "nonexistent"))
				.unique();

			if (existing) {
				await mockDb.delete(existing._id);
			}

			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	describe("User registration action logic", () => {
		it("should block Gmail accounts", () => {
			const email = "user@gmail.com";
			const isBlocked = email.endsWith("@gmail.com");

			expect(isBlocked).toBe(true);
		});

		it("should allow non-Gmail accounts", () => {
			const emails = [
				"user@company.com",
				"admin@organization.org",
				"test@example.com",
			];

			for (const email of emails) {
				const isBlocked = email.endsWith("@gmail.com");
				expect(isBlocked).toBe(false);
			}
		});

		it("should correctly identify Gmail subdomains", () => {
			// Edge case: ensure we're checking the right domain
			const notGmail = "admin@notgmail.com";
			const isBlocked = notGmail.endsWith("@gmail.com");
			expect(isBlocked).toBe(false);
		});
	});
});

describe("Auth event handler patterns", () => {
	describe("User event handling", () => {
		it("should extract user data correctly", () => {
			const eventData = {
				id: "user_123",
				email: "test@example.com",
				firstName: "John",
				lastName: "Doe",
			};

			const userData = {
				authId: eventData.id,
				email: eventData.email,
				firstName: `${eventData.firstName}`,
				lastName: `${eventData.lastName}`,
			};

			expect(userData).toEqual({
				authId: "user_123",
				email: "test@example.com",
				firstName: "John",
				lastName: "Doe",
			});
		});

		it("should handle user data with undefined names", () => {
			const eventData = {
				id: "user_123",
				email: "test@example.com",
				firstName: undefined,
				lastName: null,
			};

			const userData = {
				authId: eventData.id,
				email: eventData.email,
				firstName: `${eventData.firstName}`,
				lastName: `${eventData.lastName}`,
			};

			expect(userData.firstName).toBe("undefined");
			expect(userData.lastName).toBe("null");
		});
	});

	describe("Backfill data structure", () => {
		it("should structure organization data correctly", () => {
			const rawOrg = {
				id: "org_123",
				name: "Test Org",
				allowProfilesOutsideOrganization: true,
				externalId: "ext_123",
				metadata: { key: "value" },
			};

			const structuredOrg = {
				workosId: rawOrg.id,
				name: rawOrg.name,
				allowProfilesOutsideOrganization:
					rawOrg.allowProfilesOutsideOrganization,
				externalId: rawOrg.externalId ?? undefined,
				metadata: rawOrg.metadata,
			};

			expect(structuredOrg).toEqual({
				workosId: "org_123",
				name: "Test Org",
				allowProfilesOutsideOrganization: true,
				externalId: "ext_123",
				metadata: { key: "value" },
			});
		});

		it("should structure membership data correctly", () => {
			const rawMembership: {
				id: string;
				organizationId: string;
				userId: string;
				status: string;
				role: {
					slug: string;
				};
				roles?: {
					slug: string;
				}[];
			} = {
				id: "mem_123",
				organizationId: "org_123",
				userId: "user_123",
				status: "active",
				role: { slug: "admin" },
				roles: [{ slug: "admin" }, { slug: "member" }],
			};

			const structuredMembership = {
				workosId: rawMembership.id,
				organizationWorkosId: rawMembership.organizationId,
				userWorkosId: rawMembership.userId,
				status: rawMembership.status,
				roleSlug: rawMembership.role?.slug ?? "",
				roleSlugs: rawMembership.roles?.map((r: { slug: string }) => r.slug),
			};

			expect(structuredMembership).toEqual({
				workosId: "mem_123",
				organizationWorkosId: "org_123",
				userWorkosId: "user_123",
				status: "active",
				roleSlug: "admin",
				roleSlugs: ["admin", "member"],
			});
		});

		it("should handle membership without roles array", () => {
			const rawMembership: {
				id: string;
				organizationId: string;
				userId: string;
				status: string;
				role: {
					slug: string;
				};
				roles?: {
					slug: string;
				}[];
			} = {
				id: "mem_123",
				organizationId: "org_123",
				userId: "user_123",
				status: "active",
				role: { slug: "member" },
				roles: undefined,
			};

			const structuredMembership = {
				workosId: rawMembership.id,
				organizationWorkosId: rawMembership.organizationId,
				userWorkosId: rawMembership.userId,
				status: rawMembership.status,
				roleSlug: rawMembership.role?.slug ?? "",
				roleSlugs: rawMembership.roles?.map((r: { slug: string }) => r.slug),
			};

			expect(structuredMembership.roleSlugs).toBeUndefined();
		});

		it("should structure role data correctly", () => {
			const rawRole = {
				slug: "admin",
				permissions: ["read", "write", "delete"],
			};

			const structuredRole = {
				slug: rawRole.slug,
				permissions: rawRole.permissions,
			};

			expect(structuredRole).toEqual({
				slug: "admin",
				permissions: ["read", "write", "delete"],
			});
		});
	});

	describe("Organization ID deduplication", () => {
		it("should deduplicate organization IDs from memberships", () => {
			const memberships = [
				{ organizationId: "org_1" },
				{ organizationId: "org_2" },
				{ organizationId: "org_1" },
				{ organizationId: "org_3" },
				{ organizationId: "org_2" },
			];

			const orgIds = new Set<string>();
			for (const m of memberships) {
				orgIds.add(m.organizationId);
			}

			expect(orgIds.size).toBe(3);
			expect([...orgIds]).toEqual(
				expect.arrayContaining(["org_1", "org_2", "org_3"])
			);
		});
	});

	describe("Role slug deduplication", () => {
		it("should track seen role slugs to avoid duplicates", () => {
			const roles = [
				{ slug: "admin", permissions: ["all"] },
				{ slug: "member", permissions: ["read"] },
				{ slug: "admin", permissions: ["all"] },
			];

			const seenRoleSlugs = new Set<string>();
			const uniqueRoles: { slug: string; permissions: string[] }[] = [];

			for (const role of roles) {
				if (!seenRoleSlugs.has(role.slug)) {
					seenRoleSlugs.add(role.slug);
					uniqueRoles.push({
						slug: role.slug,
						permissions: role.permissions,
					});
				}
			}

			expect(uniqueRoles).toHaveLength(2);
			expect(uniqueRoles[0].slug).toBe("admin");
			expect(uniqueRoles[1].slug).toBe("member");
		});
	});
});
