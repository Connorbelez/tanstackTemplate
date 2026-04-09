import { test as setup } from "@playwright/test";
import {
	createAuthStorageState,
	TEST_ADMIN_ORG_ID,
} from "../helpers/auth-storage";

setup("authenticate as amps admin", async ({ page }) => {
	await createAuthStorageState({
		orgId: TEST_ADMIN_ORG_ID,
		page,
		path: ".auth/amps-admin.json",
	});
});
