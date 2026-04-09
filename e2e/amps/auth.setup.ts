import { test as setup } from "@playwright/test";
import { createAuthStorageState } from "../helpers/auth-storage";

setup("authenticate as amps admin", async ({ page }) => {
	await createAuthStorageState({
		page,
		path: ".auth/amps-admin.json",
	});
});
