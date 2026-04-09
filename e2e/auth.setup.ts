import { test as setup } from "@playwright/test";
import {
	createAuthStorageState,
	TEST_ADMIN_ORG_ID,
	TEST_MEMBER_ORG_ID,
} from "./helpers/auth-storage";

setup("authenticate as user", async ({ page }) => {
	await createAuthStorageState({
		page,
		path: ".auth/user.json",
	});
});

setup("authenticate as admin", async ({ page }) => {
	await createAuthStorageState({
		orgId: TEST_ADMIN_ORG_ID,
		page,
		path: ".auth/admin.json",
	});
});

setup("authenticate as member", async ({ page }) => {
	await createAuthStorageState({
		orgId: TEST_MEMBER_ORG_ID,
		page,
		path: ".auth/member.json",
	});
});
