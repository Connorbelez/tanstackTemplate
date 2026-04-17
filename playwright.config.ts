import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, ".env.local") });

const e2ePort = Number(process.env.E2E_PORT ?? 3100);
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
		command: `vite dev --host 127.0.0.1 --port ${e2ePort}`,
		env: {
			WORKOS_REDIRECT_URI: `http://127.0.0.1:${e2ePort}/callback`,
			VITE_E2E: "true",
		},
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
			testIgnore: [
				"amps/**",
				"auth/**",
				"rbac/**",
				"deal-closing/**",
				"document-engine/**",
				"origination/**",
				"auth.setup.ts",
				"simulation.spec.ts",
			],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "document-engine",
			testDir: "./e2e/document-engine",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/admin.json",
			},
		},
		{
			name: "simulation",
			testDir: "./e2e",
			testMatch: "simulation.spec.ts",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/admin.json",
			},
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
		{
			name: "origination",
			testDir: "./e2e/origination",
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/admin.json",
			},
		},
		{
			name: "amps-demo",
			testDir: "./e2e/amps",
			testIgnore: ["auth.setup.ts"],
			dependencies: ["amps-setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/amps-admin.json",
			},
		},
		{
			name: "amps-setup",
			testDir: "./e2e/amps",
			testMatch: "auth.setup.ts",
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],
});
