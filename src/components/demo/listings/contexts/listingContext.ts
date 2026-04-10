import { create } from "zustand";
import type { FilterableItem } from "../ListingGridShell";
import type { FilterState } from "../types/listing-filters";
import { DEFAULT_FILTERS } from "../types/listing-filters";

interface State {
	filters: FilterState;
	items: readonly FilterableItem[];
}

interface Actions {
	setFilters: (filters: FilterState) => void;
	setItems: (items: readonly FilterableItem[]) => void;
}

export const useFiltersStore = create<State & Actions>((set) => ({
	filters: DEFAULT_FILTERS,
	items: [] as readonly FilterableItem[],
	setFilters: (filters: FilterState) => set({ filters }),
	setItems: (items: readonly FilterableItem[]) => set({ items }),
}));
