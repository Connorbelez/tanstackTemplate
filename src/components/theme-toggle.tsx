import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";

type ThemeMode = "light" | "dark" | "auto";

function resolveThemeMode(mode: ThemeMode, prefersDark: boolean) {
	if (mode !== "auto") {
		return mode;
	}

	return prefersDark ? "dark" : "light";
}

function getNextThemeMode(mode: ThemeMode): ThemeMode {
	if (mode === "light") {
		return "dark";
	}

	if (mode === "dark") {
		return "auto";
	}

	return "light";
}

function getThemeLabel(mode: ThemeMode) {
	if (mode === "auto") {
		return "Auto";
	}

	if (mode === "dark") {
		return "Dark";
	}

	return "Light";
}

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "auto";
	}

	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto") {
		return stored;
	}

	return "auto";
}

function applyThemeMode(mode: ThemeMode) {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = resolveThemeMode(mode, prefersDark);

	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(resolved);

	if (mode === "auto") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}

	document.documentElement.style.colorScheme = resolved;
}

export default function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>("auto");

	useEffect(() => {
		const initialMode = getInitialMode();
		setMode(initialMode);
		applyThemeMode(initialMode);
	}, []);

	useEffect(() => {
		if (mode !== "auto") {
			return;
		}

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeMode("auto");

		media.addEventListener("change", onChange);
		return () => {
			media.removeEventListener("change", onChange);
		};
	}, [mode]);

	function toggleMode() {
		const nextMode = getNextThemeMode(mode);
		setMode(nextMode);
		applyThemeMode(nextMode);
		window.localStorage.setItem("theme", nextMode);
	}

	const label =
		mode === "auto"
			? "Theme mode: auto (system). Click to switch to light mode."
			: `Theme mode: ${mode}. Click to switch mode.`;

	return (
		<Button
			aria-label={label}
			className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 font-semibold text-[var(--sea-ink)] text-sm shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5"
			onClick={toggleMode}
			title={label}
		>
			{getThemeLabel(mode)}
		</Button>
	);
}
