import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults } from "vitest/config";

const require = createRequire(import.meta.url);

/**
 * Prevent TanStack Start's server-fn Babel transform from parsing @pdfme/ui.
 *
 * Problem: pdfme bundles fontkit which has a `return` outside of function —
 * valid JS that esbuild handles fine, but Babel's strict parser rejects.
 * TanStack Start's server-fn plugin matches any `.js` file containing
 * `.handler(` and tries to Babel-parse it, which crashes on pdfme.
 *
 * Fix: resolve `@pdfme/ui` to a virtual module ID (with \0 prefix, no .js
 * extension) that doesn't match TanStack Start's TRANSFORM_ID_REGEX filter
 * (/\.[cm]?[tj]sx?($|\?)/). The module content is served unchanged via the
 * load hook — it just bypasses the Babel transform entirely.
 */
function skipPdfmeBabelTransform(): Plugin {
	// Vite uses the "module" field (ESM), not "main" (UMD)
	const esmPath = require
		.resolve("@pdfme/ui")
		.replace("index.umd.js", "index.es.js");
	return {
		name: "skip-pdfme-babel-transform",
		enforce: "pre",
		resolveId(source) {
			if (source === "@pdfme/ui") {
				return "\0pdfme-ui-bypass";
			}
		},
		load(id) {
			if (id === "\0pdfme-ui-bypass") {
				return readFileSync(esmPath, "utf-8");
			}
		},
	};
}

const config = defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "e2e/**"],
	},
	plugins: [
		skipPdfmeBabelTransform(),
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart(),
		viteReact({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
	],
});

export default config;
