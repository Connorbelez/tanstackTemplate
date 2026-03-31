import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { CrmDemoRecordReference } from "./types";

interface RecordSidebarContextValue {
	close: () => void;
	currentRecord: CrmDemoRecordReference | null;
	drillIntoRecord: (record: CrmDemoRecordReference) => void;
	goBack: () => void;
	isOpen: boolean;
	navigationStack: CrmDemoRecordReference[];
	openRecord: (record: CrmDemoRecordReference) => void;
}

const RecordSidebarContext = createContext<RecordSidebarContextValue | null>(
	null
);

export function RecordSidebarProvider({ children }: PropsWithChildren) {
	const [navigationStack, setNavigationStack] = useState<
		CrmDemoRecordReference[]
	>([]);

	const openRecord = useCallback((record: CrmDemoRecordReference) => {
		setNavigationStack([record]);
	}, []);

	const drillIntoRecord = useCallback((record: CrmDemoRecordReference) => {
		setNavigationStack((current) => [...current, record]);
	}, []);

	const goBack = useCallback(() => {
		setNavigationStack((current) =>
			current.length > 1 ? current.slice(0, -1) : current
		);
	}, []);

	const close = useCallback(() => {
		setNavigationStack([]);
	}, []);

	const value = useMemo<RecordSidebarContextValue>(
		() => ({
			close,
			currentRecord: navigationStack.at(-1) ?? null,
			drillIntoRecord,
			goBack,
			isOpen: navigationStack.length > 0,
			navigationStack,
			openRecord,
		}),
		[close, drillIntoRecord, goBack, navigationStack, openRecord]
	);

	return (
		<RecordSidebarContext.Provider value={value}>
			{children}
		</RecordSidebarContext.Provider>
	);
}

export function useRecordSidebar() {
	const context = useContext(RecordSidebarContext);
	if (!context) {
		throw new Error(
			"useRecordSidebar must be used within a RecordSidebarProvider"
		);
	}

	return context;
}
