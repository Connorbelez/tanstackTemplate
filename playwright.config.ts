import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, ".env.local") });

const e2ePort = 3100;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: e2eBaseUrl,
		trace: "on-first-retry",
	},
	webServer: {
		command: "bun run dev:e2e",
		url: `${e2eBaseUrl}/about`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [
		{
			name: "setup",
			testMatch: "auth.setup.ts",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "chromium",
			testDir: "./e2e",
			testIgnore: ["auth/**", "rbac/**", "deal-closing/**", "auth.setup.ts"],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "authenticated",
			testDir: "./e2e/auth",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/user.json",
			},
		},
		{
			name: "admin",
			testDir: "./e2e/rbac",
			testMatch: "admin.spec.ts",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/admin.json",
			},
		},
		{
			name: "member",
			testDir: "./e2e/rbac",
			testMatch: "member.spec.ts",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/member.json",
			},
		},
		{
			name: "deal-closing",
			testDir: "./e2e/deal-closing",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/admin.json",
			},
		},
	],
});
