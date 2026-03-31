import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { CrmDemoMetricSource, CrmDemoMetricsState } from "./types";

const initialMetricsState: CrmDemoMetricsState = {
	activeSource: null,
	eavReadCount: null,
	lastUpdatedAt: null,
	nativeReadCount: null,
	notes: null,
	renderTimeMs: null,
	unifiedShapeMatch: null,
};

interface MetricsContextValue extends CrmDemoMetricsState {
	resetMetrics: () => void;
	setActiveSource: (source: CrmDemoMetricSource | null) => void;
	setMetricNotes: (notes: string | null) => void;
	setReadCount: (source: CrmDemoMetricSource, count: number | null) => void;
	setRenderTime: (milliseconds: number | null) => void;
	setUnifiedShapeMatch: (match: boolean | null) => void;
}

const MetricsContext = createContext<MetricsContextValue | null>(null);

export function MetricsProvider({ children }: PropsWithChildren) {
	const [metrics, setMetrics] =
		useState<CrmDemoMetricsState>(initialMetricsState);

	const updateMetrics = useCallback((patch: Partial<CrmDemoMetricsState>) => {
		setMetrics((current) => ({
			...current,
			...patch,
			lastUpdatedAt:
				patch.lastUpdatedAt === undefined ? Date.now() : patch.lastUpdatedAt,
		}));
	}, []);

	const setReadCount = useCallback(
		(source: CrmDemoMetricSource, count: number | null) => {
			updateMetrics(
				source === "eav"
					? { activeSource: source, eavReadCount: count }
					: { activeSource: source, nativeReadCount: count }
			);
		},
		[updateMetrics]
	);

	const resetMetrics = useCallback(() => {
		setMetrics(initialMetricsState);
	}, []);

	const setActiveSource = useCallback(
		(source: CrmDemoMetricSource | null) => {
			updateMetrics({ activeSource: source });
		},
		[updateMetrics]
	);

	const setMetricNotes = useCallback(
		(notes: string | null) => {
			updateMetrics({ notes });
		},
		[updateMetrics]
	);

	const setRenderTime = useCallback(
		(renderTimeMs: number | null) => {
			updateMetrics({ renderTimeMs });
		},
		[updateMetrics]
	);

	const setUnifiedShapeMatch = useCallback(
		(unifiedShapeMatch: boolean | null) => {
			updateMetrics({ unifiedShapeMatch });
		},
		[updateMetrics]
	);

	const value = useMemo<MetricsContextValue>(
		() => ({
			...metrics,
			resetMetrics,
			setActiveSource,
			setMetricNotes,
			setReadCount,
			setRenderTime,
			setUnifiedShapeMatch,
		}),
		[
			metrics,
			resetMetrics,
			setActiveSource,
			setMetricNotes,
			setReadCount,
			setRenderTime,
			setUnifiedShapeMatch,
		]
	);

	return (
		<MetricsContext.Provider value={value}>{children}</MetricsContext.Provider>
	);
}

export function useCrmDemoMetrics() {
	const context = useContext(MetricsContext);

	if (!context) {
		throw new Error("useCrmDemoMetrics must be used within MetricsProvider");
	}

	return context;
}
