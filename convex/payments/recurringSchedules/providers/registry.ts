import type { ProviderCode } from "../../transfers/types";
import type { RecurringCollectionScheduleProvider } from "../types";
import { RotessaRecurringScheduleProvider } from "./rotessaRecurring";

export type SupportedRecurringCollectionScheduleProvider = Extract<
	ProviderCode,
	"pad_rotessa"
>;

export function getRecurringCollectionScheduleProvider(
	providerCode: SupportedRecurringCollectionScheduleProvider
): RecurringCollectionScheduleProvider {
	switch (providerCode) {
		case "pad_rotessa":
			return new RotessaRecurringScheduleProvider();
		default:
			throw new Error(
				`Recurring collection schedule provider "${providerCode}" is not implemented.`
			);
	}
}
