"use client";

import { PortalDealDetailPage } from "#/components/portal/deals/PortalDealDetailPage";

interface LenderDealDetailPageProps {
	dealId: string;
}

export function LenderDealDetailPage({ dealId }: LenderDealDetailPageProps) {
	return <PortalDealDetailPage audience="lender" dealId={dealId} />;
}
