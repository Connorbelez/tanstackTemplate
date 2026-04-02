import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import type { AdminEntityType } from "./admin-entities";

export function adminEntityRowsQueryOptions(entityType: AdminEntityType) {
	return convexQuery(api.admin.queries.listEntityRows, { entityType });
}
