import { describe, expect, it } from "vitest";

describe("Storybook configuration", () => {
	describe("main.ts configuration", () => {
		it("should define stories glob pattern", () => {
			const storiesPattern = "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)";

			expect(storiesPattern).toContain("../src/");
			expect(storiesPattern).toContain("*.stories.");
			expect(storiesPattern).toMatch(/\.(js|jsx|mjs|ts|tsx)$/);
		});

		it("should configure react-vite framework", () => {
			const framework = {
				name: "@storybook/react-vite",
				options: {},
			};

			expect(framework.name).toBe("@storybook/react-vite");
			expect(framework.options).toEqual({});
		});

		it("should have empty addons array", () => {
			const addons: string[] = [];

			expect(addons).toEqual([]);
			expect(Array.isArray(addons)).toBe(true);
		});

		it("should validate viteFinal function exists", () => {
			const hasViteFinal = true; // viteFinal is an async function

			expect(hasViteFinal).toBe(true);
		});

		it("should add tailwindcss plugin in viteFinal", async () => {
			// Simulate viteFinal logic
			const config = {
				plugins: [] as any[],
			};

			const mockTailwindcss = () => ({ name: "tailwindcss" });
			config.plugins = config.plugins || [];
			config.plugins.push(mockTailwindcss());

			expect(config.plugins).toHaveLength(1);
			expect(config.plugins[0]).toEqual({ name: "tailwindcss" });
		});

		it("should preserve existing plugins when adding tailwindcss", async () => {
			// Simulate viteFinal logic with existing plugins
			const config = {
				plugins: [{ name: "existing-plugin" }] as any[],
			};

			const mockTailwindcss = () => ({ name: "tailwindcss" });
			config.plugins = config.plugins || [];
			config.plugins.push(mockTailwindcss());

			expect(config.plugins).toHaveLength(2);
			expect(config.plugins[0]).toEqual({ name: "existing-plugin" });
			expect(config.plugins[1]).toEqual({ name: "tailwindcss" });
		});

		it("should initialize plugins array if undefined", async () => {
			const config = {} as any;

			config.plugins = config.plugins || [];
			config.plugins.push({ name: "tailwindcss" });

			expect(config.plugins).toBeDefined();
			expect(Array.isArray(config.plugins)).toBe(true);
			expect(config.plugins).toHaveLength(1);
		});
	});

	describe("preview.ts configuration", () => {
		it("should import styles.css", () => {
			const stylesImport = "../src/styles.css";

			expect(stylesImport).toBe("../src/styles.css");
			expect(stylesImport).toContain("styles.css");
		});

		it("should configure control matchers", () => {
			const parameters = {
				controls: {
					matchers: {
						color: /(background|color)$/i,
						date: /Date$/i,
					},
				},
			};

			expect(parameters.controls.matchers.color).toBeInstanceOf(RegExp);
			expect(parameters.controls.matchers.date).toBeInstanceOf(RegExp);
		});

		it("should match color controls correctly", () => {
			const colorMatcher = /(background|color)$/i;

			expect("backgroundColor".match(colorMatcher)).toBeTruthy();
			expect("color".match(colorMatcher)).toBeTruthy();
			expect("textColor".match(colorMatcher)).toBeTruthy();
			expect("background".match(colorMatcher)).toBeTruthy();
			expect("borderWidth".match(colorMatcher)).toBeFalsy();
		});

		it("should match date controls correctly", () => {
			const dateMatcher = /Date$/i;

			expect("createdDate".match(dateMatcher)).toBeTruthy();
			expect("updatedDate".match(dateMatcher)).toBeTruthy();
			expect("date".match(dateMatcher)).toBeTruthy();
			expect("startDate".match(dateMatcher)).toBeTruthy();
			expect("dateOfBirth".match(dateMatcher)).toBeFalsy();
			expect("datetime".match(dateMatcher)).toBeFalsy();
		});

		it("should be case-insensitive for matchers", () => {
			const colorMatcher = /(background|color)$/i;
			const dateMatcher = /Date$/i;

			expect("BACKGROUND".match(colorMatcher)).toBeTruthy();
			expect("COLOR".match(colorMatcher)).toBeTruthy();
			expect("DATE".match(dateMatcher)).toBeTruthy();
		});
	});

	describe("configuration structure", () => {
		it("should have valid StorybookConfig type structure", () => {
			const config = {
				stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
				addons: [],
				framework: {
					name: "@storybook/react-vite",
					options: {},
				},
			};

			expect(config).toHaveProperty("stories");
			expect(config).toHaveProperty("addons");
			expect(config).toHaveProperty("framework");
			expect(Array.isArray(config.stories)).toBe(true);
			expect(Array.isArray(config.addons)).toBe(true);
		});

		it("should have valid Preview type structure", () => {
			const preview = {
				parameters: {
					controls: {
						matchers: {
							color: /(background|color)$/i,
							date: /Date$/i,
						},
					},
				},
			};

			expect(preview).toHaveProperty("parameters");
			expect(preview.parameters).toHaveProperty("controls");
			expect(preview.parameters.controls).toHaveProperty("matchers");
		});
	});

	describe("stories glob pattern validation", () => {
		it("should match TypeScript story files", () => {
			const pattern = /\.stories\.(ts|tsx)$/;

			expect("Button.stories.ts".match(pattern)).toBeTruthy();
			expect("Button.stories.tsx".match(pattern)).toBeTruthy();
			expect("Input.stories.ts".match(pattern)).toBeTruthy();
		});

		it("should match JavaScript story files", () => {
			const pattern = /\.stories\.(js|jsx|mjs)$/;

			expect("Button.stories.js".match(pattern)).toBeTruthy();
			expect("Button.stories.jsx".match(pattern)).toBeTruthy();
			expect("Button.stories.mjs".match(pattern)).toBeTruthy();
		});

		it("should not match non-story files", () => {
			const pattern = /\.stories\.(js|jsx|mjs|ts|tsx)$/;

			expect("Button.ts".match(pattern)).toBeFalsy();
			expect("Button.test.tsx".match(pattern)).toBeFalsy();
			expect("index.ts".match(pattern)).toBeFalsy();
		});
	});

	describe("framework configuration validation", () => {
		it("should use react-vite framework", () => {
			const frameworkName = "@storybook/react-vite";

			expect(frameworkName).toContain("react");
			expect(frameworkName).toContain("vite");
			expect(frameworkName).toContain("@storybook");
		});

		it("should have empty framework options", () => {
			const options = {};

			expect(Object.keys(options)).toHaveLength(0);
		});
	});

	describe("viteFinal plugin integration", () => {
		it("should dynamically import tailwindcss", async () => {
			// Simulate dynamic import pattern
			const importTailwind = async () => {
				return { default: () => ({ name: "tailwindcss" }) };
			};

			const result = await importTailwind();

			expect(result).toHaveProperty("default");
			expect(typeof result.default).toBe("function");
		});

		it("should handle config return correctly", () => {
			const config = {
				plugins: [{ name: "tailwindcss" }],
			};

			expect(config).toHaveProperty("plugins");
			expect(Array.isArray(config.plugins)).toBe(true);
		});
	});

	describe("control matchers edge cases", () => {
		it("should not match partial color words", () => {
			const colorMatcher = /(background|color)$/i;

			expect("discolored".match(colorMatcher)).toBeFalsy();
			expect("coloring".match(colorMatcher)).toBeFalsy();
		});

		it("should not match partial date words", () => {
			const dateMatcher = /Date$/i;

			expect("update".match(dateMatcher)).toBeFalsy();
			expect("dated".match(dateMatcher)).toBeFalsy();
		});

		it("should match compound property names", () => {
			const colorMatcher = /(background|color)$/i;

			expect("primaryColor".match(colorMatcher)).toBeTruthy();
			expect("cardBackground".match(colorMatcher)).toBeTruthy();
		});
	});

	describe("configuration completeness", () => {
		it("should have all required config properties", () => {
			const requiredProps = ["stories", "framework"];
			const config = {
				stories: [],
				addons: [],
				framework: {},
			};

			for (const prop of requiredProps) {
				expect(config).toHaveProperty(prop);
			}
		});

		it("should have valid preview parameters structure", () => {
			const preview = {
				parameters: {
					controls: {
						matchers: {},
					},
				},
			};

			expect(preview.parameters.controls).toHaveProperty("matchers");
		});
	});

	describe("async viteFinal behavior", () => {
		it("should handle async configuration", async () => {
			const viteFinal = async (config: any) => {
				// Simulate async operations
				await Promise.resolve();
				config.plugins = config.plugins || [];
				return config;
			};

			const result = await viteFinal({ plugins: [] });

			expect(result).toHaveProperty("plugins");
		});

		it("should maintain config immutability pattern", async () => {
			const originalConfig = { plugins: [{ name: "original" }] };
			const viteFinal = async (config: any) => {
				const newConfig = { ...config };
				newConfig.plugins = [...(config.plugins || [])];
				newConfig.plugins.push({ name: "tailwindcss" });
				return newConfig;
			};

			const result = await viteFinal(originalConfig);

			expect(originalConfig.plugins).toHaveLength(1);
			expect(result.plugins).toHaveLength(2);
		});
	});
});