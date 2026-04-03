"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";

export interface SidebarRecordRef {
	readonly entityType?: string;
	readonly objectDefId?: string;
	readonly recordId: string;
	readonly recordKind?: "record" | "native";
}

interface RecordSidebarState {
	readonly isOpen: boolean;
	readonly stack: readonly SidebarRecordRef[];
}

export interface RecordSidebarContextValue {
	back: () => void;
	readonly canGoBack: boolean;
	close: () => void;
	readonly current: SidebarRecordRef | undefined;
	readonly isOpen: boolean;
	open: (record: SidebarRecordRef) => void;
	push: (record: SidebarRecordRef) => void;
	replace: (record: SidebarRecordRef) => void;
	readonly stack: readonly SidebarRecordRef[];
}

const RecordSidebarContext = createContext<
	RecordSidebarContextValue | undefined
>(undefined);

const EMPTY_STATE: RecordSidebarState = {
	isOpen: false,
	stack: [],
};

export function RecordSidebarProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [state, setState] = useState<RecordSidebarState>(EMPTY_STATE);

	const open = useCallback((record: SidebarRecordRef) => {
		setState({
			isOpen: true,
			stack: [record],
		});
	}, []);

	const push = useCallback((record: SidebarRecordRef) => {
		setState((current) => ({
			isOpen: true,
			stack: [...current.stack, record],
		}));
	}, []);

	const replace = useCallback((record: SidebarRecordRef) => {
		setState((current) => {
			if (current.stack.length === 0) {
				return {
					isOpen: true,
					stack: [record],
				};
			}

			return {
				isOpen: true,
				stack: [...current.stack.slice(0, -1), record],
			};
		});
	}, []);

	const close = useCallback(() => {
		setState(EMPTY_STATE);
	}, []);

	const back = useCallback(() => {
		setState((current) => {
			if (current.stack.length <= 1) {
				return EMPTY_STATE;
			}

			return {
				isOpen: true,
				stack: current.stack.slice(0, -1),
			};
		});
	}, []);

	const value = useMemo<RecordSidebarContextValue>(
		() => ({
			open,
			push,
			replace,
			close,
			back,
			isOpen: state.isOpen,
			stack: state.stack,
			current: state.stack.at(-1),
			canGoBack: state.stack.length > 1,
		}),
		[back, close, open, push, replace, state]
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
