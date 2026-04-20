"use client";

import { PortalDealDetailPage } from "#/components/portal/deals/PortalDealDetailPage";

interface BrokerDealDetailPageProps {
	dealId: string;
}

export function BrokerDealDetailPage({ dealId }: BrokerDealDetailPageProps) {
	return <PortalDealDetailPage audience="broker" dealId={dealId} />;
}
