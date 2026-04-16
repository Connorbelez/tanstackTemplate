const WORKOS_TEST_ENV = {
	WORKOS_API_KEY: "test_workos_api_key",
	WORKOS_CLIENT_ID: "client_test_workos",
	WORKOS_WEBHOOK_SECRET: "whsec_test_workos",
} as const;

for (const [key, value] of Object.entries(WORKOS_TEST_ENV)) {
	process.env[key] ??= value;
}
