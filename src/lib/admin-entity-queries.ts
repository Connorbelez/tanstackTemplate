import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";

type LegacyAdminEntityType = "deals" | "listings" | "mortgages" | "properties";

export function adminEntityRowsQueryOptions(entityType: LegacyAdminEntityType) {
	return convexQuery(api.admin.queries.listEntityRows, { entityType });
}
