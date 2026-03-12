import type { Plugins } from "@pdfme/common";
import { interpolableFieldPlugin } from "./interpolable-field";
import { signableFieldPlugin } from "./signable-field";

export type { InterpolableSchema } from "./interpolable-field";
export type { SignableSchema } from "./signable-field";

/**
 * Plugins for the pdfme Designer (includes pdf + ui + propPanel).
 * Used in the browser-side template designer.
 */
export function getDesignerPlugins(): Plugins {
	return {
		interpolableField: interpolableFieldPlugin,
		signableField: signableFieldPlugin,
	};
}

/**
 * Plugins for pdfme generate() (only needs pdf renderer).
 * Used server-side in Convex actions for PDF generation.
 */
export function getGeneratorPlugins(): Plugins {
	return {
		interpolableField: interpolableFieldPlugin,
		signableField: signableFieldPlugin,
	};
}
