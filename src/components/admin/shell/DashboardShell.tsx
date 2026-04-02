import type { ReactNode } from "react";
import { AdminLayout } from "./AdminLayout";

export default function DashboardShell({ children }: { children: ReactNode }) {
	return <AdminLayout>{children}</AdminLayout>;
}
