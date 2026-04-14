/**
 * Permission metadata / role-permission sync test.
 *
 * Guards against ROLE_PERMISSIONS and PERMISSION_DISPLAY_METADATA drifting
 * apart. Every permission referenced by any role must have display metadata,
 * and orphaned metadata entries (not assigned to any role) are flagged as
 * warnings so they can be intentionally kept or removed.
 */

import { describe, expect, it } from "vitest";
import { PERMISSION_DISPLAY_METADATA } from "#/lib/rbac-display-metadata";
import { ROLE_PERMISSIONS } from "../permissions";

/** Collect every unique permission key referenced by at least one role. */
function collectRolePermissionKeys(): Set<string> {
	const keys = new Set<string>();
	for (const perms of Object.values(ROLE_PERMISSIONS)) {
		for (const p of perms) {
			keys.add(p);
		}
	}
	return keys;
}

describe("ROLE_PERMISSIONS <-> PERMISSION_DISPLAY_METADATA sync", () => {
	const rolePermissionKeys = collectRolePermissionKeys();
	const metadataKeys = new Set(Object.keys(PERMISSION_DISPLAY_METADATA));

	it("every permission used by a role has display metadata", () => {
		const missing: string[] = [];
		for (const key of rolePermissionKeys) {
			if (!metadataKeys.has(key)) {
				missing.push(key);
			}
		}

		expect(
			missing,
			`Permissions used in ROLE_PERMISSIONS but missing from PERMISSION_DISPLAY_METADATA:\n  ${missing.join("\n  ")}`
		).toEqual([]);
	});

	const KNOWN_ORPHANS: Record<string, string> = {};

	it("every metadata entry is assigned to at least one role or is a known orphan", () => {
		const unexpectedOrphans: string[] = [];
		for (const key of metadataKeys) {
			if (!(rolePermissionKeys.has(key) || KNOWN_ORPHANS[key])) {
				unexpectedOrphans.push(key);
			}
		}

		expect(
			unexpectedOrphans,
			`Permissions in PERMISSION_DISPLAY_METADATA but not assigned to any role and not listed in KNOWN_ORPHANS:\n  ${unexpectedOrphans.join("\n  ")}`
		).toEqual([]);
	});

	it("known orphans are still present in metadata (not stale)", () => {
		const stale: string[] = [];
		for (const key of Object.keys(KNOWN_ORPHANS)) {
			if (!metadataKeys.has(key)) {
				stale.push(key);
			}
		}

		expect(
			stale,
			`KNOWN_ORPHANS lists permissions that no longer exist in PERMISSION_DISPLAY_METADATA — remove them:\n  ${stale.join("\n  ")}`
		).toEqual([]);
	});

	it("known orphans are not secretly assigned to a role (promote or remove)", () => {
		const promoted: string[] = [];
		for (const key of Object.keys(KNOWN_ORPHANS)) {
			if (rolePermissionKeys.has(key)) {
				promoted.push(key);
			}
		}

		expect(
			promoted,
			`KNOWN_ORPHANS lists permissions now assigned to a role — remove them from KNOWN_ORPHANS:\n  ${promoted.join("\n  ")}`
		).toEqual([]);
	});

	it("every metadata entry has required fields populated", () => {
		for (const [key, meta] of Object.entries(PERMISSION_DISPLAY_METADATA)) {
			expect(meta.name, `${key} is missing "name"`).toBeTruthy();
			expect(meta.description, `${key} is missing "description"`).toBeTruthy();
			expect(meta.domain, `${key} is missing "domain"`).toBeTruthy();
		}
	});
});
